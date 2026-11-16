// Schedule register, manual assignment, optimization proposals, approvals and analytics.
import { Hono } from 'hono'

import { auditAssignments, evaluatePlacement, optimize, type PlacementContext } from '../../shared/engine'
import { clientIp, logAudit, requirePermission } from '../auth'
import { all, first, run } from '../db'
import { loadEngineInput } from '../engine-data'
import type { AppEnv } from '../env'
import { assignmentFromRow, approvalFromRow, runFromRow, scheduleFromRow, taskFromRow } from '../serialize'

export const scheduleRoutes = new Hono<AppEnv>()

async function taskMap(db: AppEnv['Bindings']['DB']) {
  const rows = await all<Record<string, unknown>>(db, `SELECT * FROM tasks`)
  const depRows = await all<{ task_id: string; depends_on_id: string }>(db, `SELECT task_id, depends_on_id FROM task_dependencies`)
  const deps = new Map<string, string[]>()
  for (const row of depRows) deps.set(row.task_id, [...(deps.get(row.task_id) ?? []), row.depends_on_id])
  return new Map(rows.map((row) => [String(row.id), taskFromRow(row, deps.get(String(row.id)) ?? [])]))
}

async function detail(db: AppEnv['Bindings']['DB'], scheduleRow: Record<string, unknown>) {
  const assignments = await all<Record<string, unknown>>(db, `SELECT * FROM assignments WHERE schedule_id = ? ORDER BY start ASC`, [scheduleRow.id])
  const tasks = await taskMap(db)
  const aircraft = await all<Record<string, unknown>>(db, `SELECT id, registration, type, status FROM aircraft`)
  const crew = await all<Record<string, unknown>>(db, `SELECT id, code, name FROM crew`)
  const aircraftLabel = new Map(aircraft.map((a) => [String(a.id), `${a.registration} · ${a.type}`]))
  const crewLabel = new Map(crew.map((c) => [String(c.id), `${c.code} · ${c.name}`]))
  return {
    schedule: scheduleFromRow(scheduleRow),
    assignments: assignments.map(assignmentFromRow).map((a) => ({
      ...a,
      taskCode: tasks.get(a.taskId)?.code ?? a.taskId,
      taskTitle: tasks.get(a.taskId)?.title ?? 'Unknown task',
      aircraft: aircraftLabel.get(a.aircraftId) ?? a.aircraftId,
      crew: a.crewId ? crewLabel.get(a.crewId) ?? a.crewId : null,
    })),
  }
}

scheduleRoutes.get('/', async (c) => {
  const row = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM schedules WHERE status = 'committed' ORDER BY version DESC LIMIT 1`)
  const input = await loadEngineInput(c.env.DB)
  const tasks = new Map(input.tasks.map((t) => [t.id, t]))
  const aircraft = new Map(input.aircraft.map((a) => [a.id, a]))
  const crew = new Map(input.crew.map((m) => [m.id, m]))

  if (!row) {
    return c.json({
      schedule: null,
      assignments: [],
      unassigned: input.tasks.filter((t) => t.state !== 'cancelled' && t.state !== 'completed').map((t) => ({ id: t.id, code: t.code, title: t.title, state: t.state, priority: t.priority, windowStart: t.windowStart, windowEnd: t.windowEnd, reason: 'No committed schedule' })),
      conflicts: [],
    })
  }

  const data = await detail(c.env.DB, row)
  const assignedTaskIds = new Set(data.assignments.map((a) => a.taskId))
  const conflicts = auditAssignments(input).map((issue) => ({
    ...issue,
    taskCode: data.assignments.find((a) => a.id === issue.assignmentId)?.taskCode ?? '',
  }))
  return c.json({
    ...data,
    conflicts,
    unassigned: input.tasks
      .filter((t) => t.state !== 'cancelled' && t.state !== 'completed' && t.state !== 'draft' && !assignedTaskIds.has(t.id))
      .map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        state: t.state,
        priority: t.priority,
        windowStart: t.windowStart,
        windowEnd: t.windowEnd,
        reason: !t.dependencies.every((d) => input.tasks.find((x) => x.id === d)?.state !== 'cancelled') ? 'Dependency cancelled' : 'No valid aircraft/crew pairing',
      })),
    resources: {
      aircraft: [...aircraft.values()].map((a) => ({ id: a.id, label: `${a.registration} · ${a.type}`, status: a.status })),
      crew: [...crew.values()].map((m) => ({ id: m.id, label: `${m.code} · ${m.name}`, status: m.status, qualifications: m.qualifications })),
    },
    tasks: [...tasks.values()].map((t) => ({ id: t.id, code: t.code, title: t.title, state: t.state, priority: t.priority, windowStart: t.windowStart, windowEnd: t.windowEnd, durationMinutes: t.durationMinutes, dependencies: t.dependencies })),
  })
})

scheduleRoutes.get('/versions', async (c) => {
  const rows = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM schedules ORDER BY version DESC, created_at DESC LIMIT 25`)
  const counts = await all<{ schedule_id: string; count: number }>(c.env.DB, `SELECT schedule_id, COUNT(*) AS count FROM assignments GROUP BY schedule_id`)
  const countMap = new Map(counts.map((r) => [r.schedule_id, r.count]))
  return c.json({
    items: rows.map((row) => ({ ...scheduleFromRow(row), assignmentCount: countMap.get(String(row.id)) ?? 0 })),
  })
})

scheduleRoutes.get('/:id', async (c) => {
  const row = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM schedules WHERE id = ?`, [c.req.param('id')])
  if (!row) return c.json({ error: 'Schedule not found.' }, 404)
  return c.json(await detail(c.env.DB, row))
})

/** Copies the committed schedule into a new editable draft version. */
async function createDraft(db: AppEnv['Bindings']['DB'], user: { id: string; name: string } | null, notes: string) {
  const max = await first<{ version: number }>(db, `SELECT MAX(version) AS version FROM schedules`)
  const id = `sch-${crypto.randomUUID().slice(0, 8)}`
  const version = (max?.version ?? 0) + 1
  const now = new Date().toISOString()
  await run(
    db,
    `INSERT INTO schedules (id, version, status, source, notes, optimization_run_id, created_by, created_by_name, created_at, decided_at, decided_by, decided_by_name)
     VALUES (?, ?, 'draft', 'manual', ?, NULL, ?, ?, ?, NULL, NULL, NULL)`,
    [id, version, notes, user?.id ?? null, user?.name ?? 'System', now],
  )
  const current = await first<{ id: string }>(db, `SELECT id FROM schedules WHERE status = 'committed' ORDER BY version DESC LIMIT 1`)
  if (current) {
    const copies = await all<Record<string, unknown>>(db, `SELECT * FROM assignments WHERE schedule_id = ?`, [current.id])
    for (const copy of copies.map(assignmentFromRow)) {
      await run(
        db,
        `INSERT INTO assignments (id, schedule_id, task_id, aircraft_id, crew_id, start, end, conflict, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [`as-${crypto.randomUUID().slice(0, 8)}`, id, copy.taskId, copy.aircraftId, copy.crewId, copy.start, copy.end, now],
      )
    }
  }
  return { id, version }
}

scheduleRoutes.post('/draft', requirePermission('schedule:write'), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const draft = await createDraft(c.env.DB, c.get('user'), String(body?.notes ?? 'Manual schedule draft'))
  await logAudit(c.env.DB, c.get('user'), 'schedule.draft', 'schedule', draft.id, `Created draft schedule v${draft.version}`)
  return c.json(draft, 201)
})

scheduleRoutes.post('/:id/assign', requirePermission('schedule:write'), async (c) => {
  const scheduleId = c.req.param('id')
  const scheduleRow = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM schedules WHERE id = ?`, [scheduleId])
  if (!scheduleRow) return c.json({ error: 'Schedule not found.' }, 404)
  if (scheduleRow.status !== 'draft') return c.json({ error: 'Only draft schedules can be edited.' }, 409)

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const taskId = String(body.taskId ?? '')
  const aircraftId = String(body.aircraftId ?? '')
  const crewId = String(body.crewId ?? '')
  const startIso = String(body.start ?? '')
  if (!taskId || !aircraftId || !crewId || !startIso) return c.json({ error: 'Task, aircraft, crew and start are required.' }, 422)
  const start = Date.parse(startIso)
  if (Number.isNaN(start)) return c.json({ error: 'Invalid start time.' }, 422)

  const input = await loadEngineInput(c.env.DB)
  const task = input.tasks.find((t) => t.id === taskId)
  const aircraft = input.aircraft.find((a) => a.id === aircraftId)
  const crew = input.crew.find((m) => m.id === crewId)
  if (!task || !aircraft || !crew) return c.json({ error: 'Task, aircraft or crew record not found.' }, 404)

  const end = start + task.durationMinutes * 60_000
  const others = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM assignments WHERE schedule_id = ? AND task_id <> ?`, [scheduleId, taskId])
  const fixed = others.map(assignmentFromRow).map((assignment) => ({
    taskId: assignment.taskId,
    aircraftId: assignment.aircraftId,
    crewId: assignment.crewId ?? '',
    start: assignment.start,
    end: assignment.end,
  }))
  const ctx: PlacementContext = {
    aircraft: input.aircraft,
    crew: input.crew,
    maintenance: input.maintenance,
    tasks: new Map(input.tasks.map((t) => [t.id, t])),
    fixed,
    config: { turnaroundMinutes: input.config.turnaroundMinutes, crewGapMinutes: input.config.crewGapMinutes },
    planEnds: new Map(),
    now: Date.now(),
  }
  const violations = evaluatePlacement(ctx, task, aircraft, crew, start, end)
  if (violations.length) {
    return c.json({ error: 'Assignment violates operational constraints.', violations }, 422)
  }

  await run(c.env.DB, `DELETE FROM assignments WHERE schedule_id = ? AND task_id = ?`, [scheduleId, taskId])
  const id = `as-${crypto.randomUUID().slice(0, 8)}`
  await run(
    c.env.DB,
    `INSERT INTO assignments (id, schedule_id, task_id, aircraft_id, crew_id, start, end, conflict, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [id, scheduleId, taskId, aircraftId, crewId, new Date(start).toISOString(), new Date(end).toISOString(), new Date().toISOString()],
  )
  await logAudit(c.env.DB, c.get('user'), 'assignment.create', 'schedule', scheduleId, `Assigned ${task.code} to ${aircraft.registration} / ${crew.name}`, { taskId, aircraftId, crewId, start: new Date(start).toISOString() })
  return c.json({ id, start: new Date(start).toISOString(), end: new Date(end).toISOString() }, 201)
})

scheduleRoutes.delete('/:id/assignments/:assignmentId', requirePermission('schedule:write'), async (c) => {
  const scheduleId = c.req.param('id')
  const scheduleRow = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM schedules WHERE id = ?`, [scheduleId])
  if (!scheduleRow) return c.json({ error: 'Schedule not found.' }, 404)
  if (scheduleRow.status !== 'draft') return c.json({ error: 'Only draft schedules can be edited.' }, 409)
  const assignment = await first<{ id: string; task_id: string }>(c.env.DB, `SELECT id, task_id FROM assignments WHERE id = ? AND schedule_id = ?`, [c.req.param('assignmentId'), scheduleId])
  if (!assignment) return c.json({ error: 'Assignment not found.' }, 404)
  await run(c.env.DB, `DELETE FROM assignments WHERE id = ?`, [assignment.id])
  await logAudit(c.env.DB, c.get('user'), 'assignment.remove', 'schedule', scheduleId, 'Removed an assignment from the draft schedule', { taskId: assignment.task_id })
  return c.json({ ok: true })
})

/** Committing makes the schedule operational; this is the human approval gate. */
async function commitSchedule(db: AppEnv['Bindings']['DB'], scheduleId: string, user: { id: string; name: string }, reason: string) {
  const schedule = await first<Record<string, unknown>>(db, `SELECT * FROM schedules WHERE id = ?`, [scheduleId])
  if (!schedule) return { ok: false as const, status: 404, error: 'Schedule not found.' }
  if (schedule.status === 'committed') return { ok: false as const, status: 409, error: 'Schedule is already committed.' }
  if (schedule.status === 'superseded' || schedule.status === 'rejected') return { ok: false as const, status: 409, error: 'This schedule can no longer be committed.' }

  const now = new Date().toISOString()
  await run(db, `UPDATE schedules SET status = 'superseded', decided_at = ? WHERE status = 'committed' AND id <> ?`, [now, scheduleId])
  await run(db, `UPDATE schedules SET status = 'committed', decided_at = ?, decided_by = ?, decided_by_name = ? WHERE id = ?`, [now, user.id, user.name, scheduleId])
  await run(db, `UPDATE approvals SET status = 'approved', decided_by = ?, decided_by_name = ?, decided_at = ?, reason = ? WHERE schedule_id = ? AND status = 'pending'`, [user.id, user.name, now, reason || 'Approved', scheduleId])
  const assignments = await all<{ task_id: string }>(db, `SELECT task_id FROM assignments WHERE schedule_id = ?`, [scheduleId])
  for (const assignment of assignments) {
    await run(db, `UPDATE tasks SET state = 'scheduled', updated_at = ? WHERE id = ? AND state IN ('pending','blocked','draft')`, [now, assignment.task_id])
  }
  await logAudit(db, user, 'schedule.commit', 'schedule', scheduleId, `Committed schedule v${String(schedule.version)}`, { reason })
  return { ok: true as const }
}

scheduleRoutes.post('/:id/commit', requirePermission('schedule:approve'), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const result = await commitSchedule(c.env.DB, c.req.param('id'), c.get('user')!, String(body?.reason ?? ''))
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 409)
  return c.json({ ok: true })
})

scheduleRoutes.post('/:id/discard', requirePermission('schedule:write'), async (c) => {
  const id = c.req.param('id')
  const schedule = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM schedules WHERE id = ?`, [id])
  if (!schedule) return c.json({ error: 'Schedule not found.' }, 404)
  if (schedule.status === 'committed') return c.json({ error: 'The committed schedule cannot be discarded.' }, 409)
  await run(c.env.DB, `UPDATE schedules SET status = 'rejected', decided_at = ? WHERE id = ?`, [new Date().toISOString(), id])
  await run(c.env.DB, `UPDATE approvals SET status = 'rejected', decided_at = ? WHERE schedule_id = ? AND status = 'pending'`, [new Date().toISOString(), id])
  await logAudit(c.env.DB, c.get('user'), 'schedule.discard', 'schedule', id, `Discarded schedule v${String(schedule.version)}`)
  return c.json({ ok: true })
})

/* ---------------------------------------------------------- optimization runs */

export const optimizationRoutes = new Hono<AppEnv>()

const OBJECTIVE_KEYS = ['assigned', 'preserve', 'utilization', 'conflicts'] as const

const objectiveFrom = (raw: unknown) => {
  const input = (raw ?? {}) as Record<string, unknown>
  const weights = {
    assigned: Math.max(0, Math.min(100, Number(input.assigned ?? 60))),
    preserve: Math.max(0, Math.min(100, Number(input.preserve ?? 20))),
    utilization: Math.max(0, Math.min(100, Number(input.utilization ?? 15))),
    conflicts: Math.max(0, Math.min(100, Number(input.conflicts ?? 5))),
  }
  for (const key of OBJECTIVE_KEYS) if (!Number.isFinite(weights[key])) weights[key] = 0
  return weights
}

optimizationRoutes.post('/run', requirePermission('optimize:run'), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const weights = objectiveFrom(body?.objective)
  const started = Date.now()
  const input = await loadEngineInput(c.env.DB)
  const result = optimize(input, weights)
  const durationMs = Date.now() - started

  const max = await first<{ version: number }>(c.env.DB, `SELECT MAX(version) AS version FROM schedules`)
  const scheduleId = `sch-${crypto.randomUUID().slice(0, 8)}`
  const runId = `run-${crypto.randomUUID().slice(0, 8)}`
  const version = (max?.version ?? 0) + 1
  const now = new Date().toISOString()
  const taskById = new Map(input.tasks.map((t) => [t.id, t]))
  const aircraftById = new Map(input.aircraft.map((a) => [a.id, a]))
  const crewById = new Map(input.crew.map((m) => [m.id, m]))

  const proposal = {
    algorithm: result.algorithm,
    ordering: result.ordering,
    score: Number(result.score.toFixed(4)),
    objective: weights,
    scoreFormula: 'normalised(assignedShare · assigned + utilization · utilization + preservedShare · preserve − violationShare · conflicts)',
    feasibility: result.feasibility,
    changedFromCurrent: result.changedFromCurrent,
    assigned: result.plan.assignments.map((a) => ({
      taskId: a.taskId,
      code: taskById.get(a.taskId)?.code ?? a.taskId,
      title: taskById.get(a.taskId)?.title ?? '',
      aircraft: aircraftById.get(a.aircraftId)?.registration ?? a.aircraftId,
      crew: crewById.get(a.crewId)?.name ?? a.crewId,
      start: a.start,
      end: a.end,
      explanation: result.plan.explanation[a.taskId] ?? '',
    })),
    unassigned: result.plan.unassigned,
    consideredCandidates: result.plan.consideredCandidates,
    utilization: Number(result.plan.utilization.toFixed(4)),
    feasibilityNote: 'Feasibility reflects the configured rules only. It is not an airworthiness or regulatory clearance.',
  }

  await run(
    c.env.DB,
    `INSERT INTO schedules (id, version, status, source, notes, optimization_run_id, created_by, created_by_name, created_at, decided_at, decided_by, decided_by_name)
     VALUES (?, ?, 'proposed', 'optimization', ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
    [scheduleId, version, `Proposal from ${result.algorithm}`, runId, c.get('user')?.id ?? null, c.get('user')?.name ?? 'System', now],
  )
  for (const a of result.plan.assignments) {
    await run(
      c.env.DB,
      `INSERT INTO assignments (id, schedule_id, task_id, aircraft_id, crew_id, start, end, conflict, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [`as-${crypto.randomUUID().slice(0, 8)}`, scheduleId, a.taskId, a.aircraftId, a.crewId, a.start, a.end, now],
    )
  }
  await run(
    c.env.DB,
    `INSERT INTO optimization_runs (id, algorithm, schedule_id, status, feasibility, objective, assigned_count, unassigned_count, duration_ms, proposal, created_by, created_by_name, created_at)
     VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [runId, result.algorithm, scheduleId, result.feasibility, JSON.stringify(weights), result.plan.assignments.length, result.plan.unassigned.length, durationMs, JSON.stringify(proposal), c.get('user')?.id ?? null, c.get('user')?.name ?? 'System', now],
  )
  await run(
    c.env.DB,
    `INSERT INTO approvals (id, schedule_id, status, requested_by, requested_by_name, decided_by, decided_by_name, decided_at, reason, created_at)
     VALUES (?, ?, 'pending', ?, ?, NULL, NULL, NULL, '', ?)`,
    [`ap-${crypto.randomUUID().slice(0, 8)}`, scheduleId, c.get('user')?.id ?? null, c.get('user')?.name ?? 'System', now],
  )
  await logAudit(c.env.DB, c.get('user'), 'optimization.run', 'optimization_run', runId, `Optimization ${result.algorithm}: ${result.plan.assignments.length} assigned, ${result.plan.unassigned.length} unassigned`, {
    objective: weights,
    version,
    feasibility: result.feasibility,
    durationMs,
  })
  return c.json({ run: { id: runId, scheduleId, version, algorithm: result.algorithm, feasibility: result.feasibility, assignedCount: result.plan.assignments.length, unassignedCount: result.plan.unassigned.length, durationMs }, proposal }, 201)
})

optimizationRoutes.get('/runs', async (c) => {
  const rows = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM optimization_runs ORDER BY created_at DESC LIMIT 30`)
  return c.json({ items: rows.map(runFromRow) })
})

optimizationRoutes.get('/runs/:id', async (c) => {
  const row = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM optimization_runs WHERE id = ?`, [c.req.param('id')])
  if (!row) return c.json({ error: 'Optimization run not found.' }, 404)
  const schedule = row.schedule_id ? await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM schedules WHERE id = ?`, [row.schedule_id]) : null
  let proposal: unknown = null
  try {
    proposal = JSON.parse(String(row.proposal))
  } catch {
    proposal = null
  }
  return c.json({
    run: runFromRow(row),
    proposal,
    schedule: schedule ? scheduleFromRow(schedule) : null,
    approval: schedule
      ? await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM approvals WHERE schedule_id = ? ORDER BY created_at DESC LIMIT 1`, [schedule.id])
      : null,
  })
})

/* ------------------------------------------------------------------- approvals */

export const approvalRoutes = new Hono<AppEnv>()

approvalRoutes.get('/', async (c) => {
  const rows = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM approvals ORDER BY created_at DESC LIMIT 40`)
  const schedules = await all<Record<string, unknown>>(c.env.DB, `SELECT id, version, status, source, created_at FROM schedules`)
  const scheduleMap = new Map(schedules.map((s) => [String(s.id), s]))
  return c.json({
    items: rows.map((row) => {
      const approval = approvalFromRow(row)
      const schedule = scheduleMap.get(approval.scheduleId)
      return {
        ...approval,
        scheduleVersion: schedule ? Number(schedule.version) : null,
        scheduleStatus: schedule ? String(schedule.status) : null,
        scheduleSource: schedule ? String(schedule.source) : null,
      }
    }),
  })
})

approvalRoutes.post('/:id/approve', requirePermission('schedule:approve'), async (c) => {
  const id = c.req.param('id')
  const approval = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM approvals WHERE id = ?`, [id])
  if (!approval) return c.json({ error: 'Approval not found.' }, 404)
  if (approval.status !== 'pending') return c.json({ error: 'This proposal has already been decided.' }, 409)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const result = await commitSchedule(c.env.DB, String(approval.schedule_id), c.get('user')!, String(body?.reason ?? 'Approved'))
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 409)
  await logAudit(c.env.DB, c.get('user'), 'approval.approve', 'approval', id, 'Approved a schedule proposal', { scheduleId: approval.schedule_id, ip: clientIp(c) })
  return c.json({ ok: true })
})

approvalRoutes.post('/:id/reject', requirePermission('schedule:approve'), async (c) => {
  const id = c.req.param('id')
  const approval = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM approvals WHERE id = ?`, [id])
  if (!approval) return c.json({ error: 'Approval not found.' }, 404)
  if (approval.status !== 'pending') return c.json({ error: 'This proposal has already been decided.' }, 409)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const reason = String(body?.reason ?? '').trim()
  if (reason.length < 5) return c.json({ error: 'A rejection reason is required.', fieldErrors: { reason: 'Describe why the proposal is rejected.' } }, 422)
  const now = new Date().toISOString()
  await run(c.env.DB, `UPDATE approvals SET status = 'rejected', decided_by = ?, decided_by_name = ?, decided_at = ?, reason = ? WHERE id = ?`, [c.get('user')!.id, c.get('user')!.name, now, reason, id])
  await run(c.env.DB, `UPDATE schedules SET status = 'rejected', decided_at = ? WHERE id = ? AND status <> 'committed'`, [now, approval.schedule_id])
  await logAudit(c.env.DB, c.get('user'), 'approval.reject', 'approval', id, `Rejected a schedule proposal: ${reason}`, { scheduleId: approval.schedule_id })
  return c.json({ ok: true })
})

/* ------------------------------------------------------------------- analytics */

export const analyticsRoutes = new Hono<AppEnv>()

analyticsRoutes.get('/', async (c) => {
  const url = new URL(c.req.url)
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 7)))
  const from = new Date(Date.now() - days * 86_400_000).toISOString()

  const input = await loadEngineInput(c.env.DB)
  const tasks = input.tasks
  const openTasks = tasks.filter((t) => t.state !== 'cancelled')
  const completed = tasks.filter((t) => t.state === 'completed').length
  const cancelled = tasks.filter((t) => t.state === 'cancelled').length
  const assigned = input.existing.length
  const unassigned = openTasks.filter((t) => t.state !== 'draft' && !input.existing.some((a) => a.taskId === t.id))

  const conflicts = auditAssignments(input)
  const assignedMinutes = input.existing.reduce((sum, a) => sum + Math.max(0, (Date.parse(a.end) - Date.parse(a.start)) / 60_000), 0)
  const horizonMinutes = days * 24 * 60
  const aircraftUtilization = input.aircraft.length ? assignedMinutes / (horizonMinutes * input.aircraft.length) : 0
  const crewCount = input.crew.filter((m) => m.status === 'available' || m.status === 'on_duty').length
  const crewUtilization = crewCount ? assignedMinutes / (horizonMinutes * crewCount) : 0
  const maintenanceMinutes = input.maintenance
    .filter((m) => m.status !== 'cancelled')
    .reduce((sum, m) => sum + Math.max(0, (Date.parse(m.windowEnd) - Date.parse(m.windowStart)) / 60_000), 0)

  const runs = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM optimization_runs ORDER BY created_at DESC LIMIT 20`)
  const versions = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM schedules ORDER BY version ASC`)

  const byState = ['draft', 'pending', 'scheduled', 'in_progress', 'completed', 'cancelled', 'blocked'].map((state) => ({
    state,
    count: tasks.filter((t) => t.state === state).length,
  }))

  const byPriority = ['critical', 'high', 'normal', 'low'].map((priority) => ({
    priority,
    total: tasks.filter((t) => t.priority === priority && t.state !== 'cancelled').length,
    assigned: input.existing.filter((a) => tasks.find((t) => t.id === a.taskId)?.priority === priority).length,
  }))

  return c.json({
    range: { from, to: new Date().toISOString(), days },
    definitions: {
      assignmentRate: 'Assigned open tasks ÷ open tasks (excludes drafts and cancellations)',
      aircraftUtilization: 'Assigned airframe minutes ÷ (aircraft count × range minutes)',
      crewUtilization: 'Assigned minutes ÷ (available crew × range minutes)',
      completionRate: 'Completed tasks ÷ non-cancelled tasks',
    },
    tasks: {
      total: tasks.length,
      open: openTasks.length,
      assigned,
      unassigned: unassigned.length,
      completed,
      cancelled,
      completionRate: completed / Math.max(1, tasks.length - cancelled),
      assignmentRate: openTasks.filter((t) => t.state !== 'draft').length
        ? assigned / openTasks.filter((t) => t.state !== 'draft').length
        : 0,
      unassignedMinutes: unassigned.reduce((sum, t) => sum + t.durationMinutes, 0),
    },
    utilization: {
      aircraft: aircraftUtilization,
      crew: crewUtilization,
      assignedMinutes,
      aircraftCount: input.aircraft.length,
      crewCount,
    },
    conflicts: { count: conflicts.length, items: conflicts },
    maintenance: { records: input.maintenance.length, aircraftMinutes: maintenanceMinutes },
    byState,
    byPriority,
    optimization: {
      runs: runs.map((row) => ({
        id: String(row.id),
        algorithm: String(row.algorithm),
        createdAt: String(row.created_at),
        assigned: Number(row.assigned_count),
        unassigned: Number(row.unassigned_count),
        feasibility: String(row.feasibility),
        durationMs: Number(row.duration_ms),
      })),
      averageAssigned: runs.length ? runs.reduce((sum, r) => sum + Number(r.assigned_count), 0) / runs.length : 0,
      averageDurationMs: runs.length ? runs.reduce((sum, r) => sum + Number(r.duration_ms), 0) / runs.length : 0,
    },
    versions: versions.map((row) => ({
      id: String(row.id),
      version: Number(row.version),
      status: String(row.status),
      source: String(row.source),
      createdAt: String(row.created_at),
    })),
  })
})

