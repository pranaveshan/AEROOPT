// Task register: CRUD, dependency management, state transitions and history.
import { Hono } from 'hono'

import type { TaskState } from '../../shared/types'
import { validateTask } from '../../shared/validation'
import { logAudit, requirePermission } from '../auth'
import { all, first, run } from '../db'
import type { AppEnv } from '../env'
import { auditFromRow, taskFromRow } from '../serialize'

export const taskRoutes = new Hono<AppEnv>()

const TRANSITIONS: Record<TaskState, TaskState[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['scheduled', 'blocked', 'cancelled', 'draft'],
  scheduled: ['in_progress', 'pending', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  blocked: ['pending', 'cancelled'],
}

async function loadDeps(db: AppEnv['Bindings']['DB'], taskId: string): Promise<string[]> {
  const rows = await all<{ depends_on_id: string }>(db, `SELECT depends_on_id FROM task_dependencies WHERE task_id = ?`, [taskId])
  return rows.map((r) => r.depends_on_id)
}

async function dependenciesForMany(db: AppEnv['Bindings']['DB'], ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (!ids.length) return map
  const placeholders = ids.map(() => '?').join(',')
  const rows = await all<{ task_id: string; depends_on_id: string }>(
    db,
    `SELECT task_id, depends_on_id FROM task_dependencies WHERE task_id IN (${placeholders})`,
    ids,
  )
  for (const row of rows) {
    map.set(row.task_id, [...(map.get(row.task_id) ?? []), row.depends_on_id])
  }
  return map
}

taskRoutes.get('/', async (c) => {
  const url = new URL(c.req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get('pageSize') ?? 50)))
  const search = (url.searchParams.get('search') ?? '').trim()
  const state = url.searchParams.get('state') ?? ''
  const priority = url.searchParams.get('priority') ?? ''
  const sort = url.searchParams.get('sort') ?? 'window:asc'

  const where: string[] = []
  const params: unknown[] = []
  if (search) {
    where.push(`(title LIKE ? OR code LIKE ? OR client LIKE ? OR site LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (state) {
    where.push('state = ?')
    params.push(state)
  }
  if (priority) {
    where.push('priority = ?')
    params.push(priority)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const sortColumns: Record<string, string> = {
    window: 'window_start',
    code: 'code',
    title: 'title',
    priority: "CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END",
    state: 'state',
    duration: 'duration_minutes',
  }
  const [field, direction] = sort.split(':')
  const sortSql = `${sortColumns[field] ?? 'window_start'} ${direction === 'desc' ? 'DESC' : 'ASC'}`

  const total = await first<{ count: number }>(c.env.DB, `SELECT COUNT(*) AS count FROM tasks ${clause}`, params)
  const rows = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM tasks ${clause} ORDER BY ${sortSql} LIMIT ? OFFSET ?`, [
    ...params,
    pageSize,
    (page - 1) * pageSize,
  ])
  const ids = rows.map((r) => String(r.id))
  const deps = await dependenciesForMany(c.env.DB, ids)
  const committed = await first<{ id: string }>(c.env.DB, `SELECT id FROM schedules WHERE status = 'committed' ORDER BY version DESC LIMIT 1`)
  const assigned = committed
    ? await all<Record<string, unknown>>(
        c.env.DB,
        `SELECT a.task_id, a.aircraft_id, a.crew_id, a.start, a.end, ac.registration, c.name AS crew_name
         FROM assignments a
         JOIN aircraft ac ON ac.id = a.aircraft_id
         LEFT JOIN crew c ON c.id = a.crew_id
         WHERE a.schedule_id = ?`,
        [committed.id],
      )
    : []
  const assignmentByTask = new Map(assigned.map((a) => [String(a.task_id), a]))

  return c.json({
    items: rows.map((row) => {
      const task = taskFromRow(row, deps.get(String(row.id)) ?? [])
      const assignment = assignmentByTask.get(task.id)
      return {
        ...task,
        assignment: assignment
          ? {
              aircraftId: String(assignment.aircraft_id),
              aircraft: String(assignment.registration),
              crewId: assignment.crew_id ? String(assignment.crew_id) : null,
              crew: assignment.crew_name ? String(assignment.crew_name) : null,
              start: String(assignment.start),
              end: String(assignment.end),
            }
          : null,
      }
    }),
    total: total?.count ?? 0,
    page,
    pageSize,
  })
})

taskRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const row = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM tasks WHERE id = ?`, [id])
  if (!row) return c.json({ error: 'Task not found.' }, 404)
  const depIds = await loadDeps(c.env.DB, id)
  const depRows = depIds.length
    ? await all<Record<string, unknown>>(c.env.DB, `SELECT id, code, title, state, window_end FROM tasks WHERE id IN (${depIds.map(() => '?').join(',')})`, depIds)
    : []
  const dependents = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT t.id, t.code, t.title, t.state FROM tasks t JOIN task_dependencies d ON d.task_id = t.id WHERE d.depends_on_id = ?`,
    [id],
  )
  const committed = await first<{ id: string }>(c.env.DB, `SELECT id FROM schedules WHERE status = 'committed' ORDER BY version DESC LIMIT 1`)
  const assignment = committed
    ? await first<Record<string, unknown>>(
        c.env.DB,
        `SELECT a.*, ac.registration, ac.type, c.name AS crew_name, c.code AS crew_code
         FROM assignments a JOIN aircraft ac ON ac.id = a.aircraft_id LEFT JOIN crew c ON c.id = a.crew_id
         WHERE a.schedule_id = ? AND a.task_id = ?`,
        [committed.id, id],
      )
    : null
  const history = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT * FROM audit_events WHERE entity_type = 'task' AND entity_id = ? ORDER BY created_at DESC LIMIT 30`,
    [id],
  )
  return c.json({
    task: taskFromRow(row, depIds),
    dependencies: depRows.map((d) => ({ id: String(d.id), code: String(d.code), title: String(d.title), state: String(d.state), windowEnd: String(d.window_end) })),
    dependents: dependents.map((d) => ({ id: String(d.id), code: String(d.code), title: String(d.title), state: String(d.state) })),
    assignment: assignment
      ? {
          id: String(assignment.id),
          aircraft: String(assignment.registration),
          aircraftType: String(assignment.type),
          crew: assignment.crew_name ? `${String(assignment.crew_code)} · ${String(assignment.crew_name)}` : null,
          start: String(assignment.start),
          end: String(assignment.end),
        }
      : null,
    history: history.map(auditFromRow),
    allowedTransitions: TRANSITIONS[taskFromRow(row).state] ?? [],
  })
})

async function writeDependencies(db: AppEnv['Bindings']['DB'], taskId: string, dependencies: string[]) {
  await run(db, `DELETE FROM task_dependencies WHERE task_id = ?`, [taskId])
  const clean = [...new Set(dependencies.filter((d) => d && d !== taskId))]
  for (const dep of clean) {
    await run(db, `INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)`, [taskId, dep])
  }
}

async function validateDependencies(db: AppEnv['Bindings']['DB'], taskId: string | null, deps: string[]): Promise<string | null> {
  if (!deps.length) return null
  if (deps.includes(taskId ?? '')) return 'A task cannot depend on itself.'
  const placeholders = deps.map(() => '?').join(',')
  const rows = await all<{ id: string }>(db, `SELECT id FROM tasks WHERE id IN (${placeholders})`, deps)
  if (rows.length !== deps.length) return 'One or more dependencies do not exist.'
  // Reject direct cycles.
  if (taskId) {
    const upstream = await all<{ depends_on_id: string }>(
      db,
      `SELECT depends_on_id FROM task_dependencies WHERE task_id IN (${placeholders})`,
      deps,
    )
    if (upstream.some((row) => row.depends_on_id === taskId)) return 'That dependency would create a cycle.'
  }
  return null
}

async function nextCode(db: AppEnv['Bindings']['DB']): Promise<string> {
  const row = await first<{ max: number }>(db, `SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) AS max FROM tasks WHERE code LIKE 'TSK-%'`)
  return `TSK-${(row?.max ?? 1000) + 1}`
}

taskRoutes.post('/', requirePermission('tasks:write'), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const { errors, value } = validateTask(body)
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)
  const depProblem = await validateDependencies(c.env.DB, null, value.dependencies)
  if (depProblem) return c.json({ error: depProblem, fieldErrors: { dependencies: depProblem } }, 422)

  const id = `tk-${crypto.randomUUID().slice(0, 8)}`
  const code = await nextCode(c.env.DB)
  const now = new Date().toISOString()
  await run(
    c.env.DB,
    `INSERT INTO tasks (id, code, title, description, priority, state, window_start, window_end, duration_minutes, payload_kg, required_capabilities, required_qualifications, site, client, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, code, value.title, value.description, value.priority, value.state, value.windowStart, value.windowEnd, value.durationMinutes, value.payloadKg, JSON.stringify(value.requiredCapabilities), JSON.stringify(value.requiredQualifications), value.site, value.client, now, now],
  )
  await writeDependencies(c.env.DB, id, value.dependencies)
  await logAudit(c.env.DB, c.get('user'), 'task.create', 'task', id, `Created ${code} · ${value.title}`, { priority: value.priority, windowStart: value.windowStart })
  return c.json({ id, code }, 201)
})

taskRoutes.patch('/:id', requirePermission('tasks:write'), async (c) => {
  const id = c.req.param('id')
  const existing = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM tasks WHERE id = ?`, [id])
  if (!existing) return c.json({ error: 'Task not found.' }, 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const deps = await loadDeps(c.env.DB, id)
  const merged = {
    title: existing.title,
    description: existing.description,
    priority: existing.priority,
    state: existing.state,
    windowStart: existing.window_start,
    windowEnd: existing.window_end,
    durationMinutes: existing.duration_minutes,
    payloadKg: existing.payload_kg,
    requiredCapabilities: JSON.parse(String(existing.required_capabilities ?? '[]')),
    requiredQualifications: JSON.parse(String(existing.required_qualifications ?? '[]')),
    site: existing.site,
    client: existing.client,
    dependencies: deps,
    ...body,
  }
  const { errors, value } = validateTask(merged as Record<string, unknown>)
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)
  const depProblem = await validateDependencies(c.env.DB, id, value.dependencies)
  if (depProblem) return c.json({ error: depProblem, fieldErrors: { dependencies: depProblem } }, 422)
  if (existing.state !== value.state && !(TRANSITIONS[String(existing.state) as TaskState] ?? []).includes(value.state)) {
    return c.json({ error: `Cannot move a task from ${String(existing.state)} to ${value.state}.`, fieldErrors: { state: 'Invalid transition.' } }, 422)
  }

  await run(
    c.env.DB,
    `UPDATE tasks SET title = ?, description = ?, priority = ?, state = ?, window_start = ?, window_end = ?, duration_minutes = ?, payload_kg = ?, required_capabilities = ?, required_qualifications = ?, site = ?, client = ?, updated_at = ? WHERE id = ?`,
    [value.title, value.description, value.priority, value.state, value.windowStart, value.windowEnd, value.durationMinutes, value.payloadKg, JSON.stringify(value.requiredCapabilities), JSON.stringify(value.requiredQualifications), value.site, value.client, new Date().toISOString(), id],
  )
  await writeDependencies(c.env.DB, id, value.dependencies)
  await logAudit(c.env.DB, c.get('user'), 'task.update', 'task', id, `Updated ${String(existing.code)} · ${value.title}`, { state: value.state, priority: value.priority })
  return c.json({ ok: true })
})

taskRoutes.post('/:id/state', requirePermission('tasks:write'), async (c) => {
  const id = c.req.param('id')
  const existing = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM tasks WHERE id = ?`, [id])
  if (!existing) return c.json({ error: 'Task not found.' }, 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const next = String(body?.state ?? '') as TaskState
  const allowed = TRANSITIONS[String(existing.state) as TaskState] ?? []
  if (!allowed.includes(next)) return c.json({ error: `Cannot move ${String(existing.state)} → ${next}.` }, 422)

  await run(c.env.DB, `UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?`, [next, new Date().toISOString(), id])
  if (next === 'cancelled') {
    await run(
      c.env.DB,
      `DELETE FROM assignments WHERE task_id = ? AND schedule_id IN (SELECT id FROM schedules WHERE status IN ('draft','proposed'))`,
      [id],
    )
    const dependents = await all<{ id: string }>(c.env.DB, `SELECT task_id AS id FROM task_dependencies WHERE depends_on_id = ?`, [id])
    for (const dependent of dependents) {
      await run(c.env.DB, `UPDATE tasks SET state = 'blocked', updated_at = ? WHERE id = ? AND state IN ('pending','scheduled')`, [new Date().toISOString(), dependent.id])
    }
  }
  await logAudit(c.env.DB, c.get('user'), 'task.state', 'task', id, `${String(existing.code)} moved ${String(existing.state)} → ${next}`, { from: existing.state, to: next })
  return c.json({ ok: true, state: next })
})
