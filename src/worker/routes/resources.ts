// Resource modules: aircraft, crew and maintenance records.
import { Hono } from 'hono'

import { validateAircraft, validateCrew, validateMaintenance } from '../../shared/validation'
import { clientIp, logAudit, requirePermission } from '../auth'
import { all, first, run } from '../db'
import type { AppEnv } from '../env'
import { aircraftFromRow, assignmentFromRow, crewFromRow, maintenanceFromRow, taskFromRow } from '../serialize'

export const resourceRoutes = new Hono<AppEnv>()

const SORTS: Record<string, string> = {
  registration: 'registration',
  type: 'type',
  status: 'status',
  base: 'base',
  capacity: 'capacity_kg',
  hours: 'flight_hours',
  updated: 'updated_at',
  name: 'name',
  code: 'code',
  duty: 'duty_limit_minutes',
}

const order = (sort: string | undefined, fallback: string, allowed: string[]): string => {
  const raw = (sort ?? fallback).split(':')
  const column = SORTS[raw[0]] ?? SORTS[fallback.split(':')[0]]
  return `${allowed.includes(column) ? column : SORTS[fallback.split(':')[0]]} ${raw[1] === 'asc' ? 'ASC' : 'DESC'}`
}

const paging = (url: URL) => {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get('pageSize') ?? 25)))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/* ------------------------------------------------------------------ aircraft */

resourceRoutes.get('/aircraft', async (c) => {
  const url = new URL(c.req.url)
  const { page, pageSize, offset } = paging(url)
  const search = (url.searchParams.get('search') ?? '').trim()
  const status = url.searchParams.get('status') ?? ''
  const where: string[] = []
  const params: unknown[] = []
  if (search) {
    where.push(`(registration LIKE ? OR type LIKE ? OR base LIKE ? OR capabilities LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = await first<{ count: number }>(c.env.DB, `SELECT COUNT(*) AS count FROM aircraft ${clause}`, params)
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT * FROM aircraft ${clause} ORDER BY ${order(url.searchParams.get('sort') ?? undefined, 'registration:asc', [
      'registration',
      'type',
      'status',
      'base',
      'capacity_kg',
      'flight_hours',
      'updated_at',
    ])} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  return c.json({ items: rows.map(aircraftFromRow), total: total?.count ?? 0, page, pageSize })
})

resourceRoutes.get('/aircraft/:id', async (c) => {
  const id = c.req.param('id')
  const row = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM aircraft WHERE id = ?`, [id])
  if (!row) return c.json({ error: 'Aircraft not found.' }, 404)
  const maintenance = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM maintenance WHERE aircraft_id = ? ORDER BY window_start DESC`, [id])
  const assignments = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT a.* FROM assignments a JOIN schedules s ON s.id = a.schedule_id
     WHERE a.aircraft_id = ? AND s.status = 'committed' ORDER BY a.start DESC LIMIT 20`,
    [id],
  )
  const taskRows = await all<Record<string, unknown>>(c.env.DB, `SELECT id, code, title FROM tasks`)
  const titles = new Map(taskRows.map((t) => [String(t.id), `${t.code} · ${t.title}`]))
  return c.json({
    aircraft: aircraftFromRow(row),
    maintenance: maintenance.map(maintenanceFromRow),
    assignments: assignments.map(assignmentFromRow).map((a) => ({ ...a, taskLabel: titles.get(a.taskId) ?? a.taskId })),
    restrictions: maintenance
      .map(maintenanceFromRow)
      .filter((m) => m.status !== 'completed' && m.status !== 'cancelled')
      .map((m) => ({ id: m.id, windowStart: m.windowStart, windowEnd: m.windowEnd, restriction: m.restriction || 'Aircraft unavailable for tasking' })),
  })
})

resourceRoutes.post('/aircraft', requirePermission('aircraft:write'), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const { errors, value } = validateAircraft(body)
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)
  const duplicate = await first<{ id: string }>(c.env.DB, `SELECT id FROM aircraft WHERE registration = ?`, [value.registration])
  if (duplicate) return c.json({ error: 'That registration already exists.', fieldErrors: { registration: 'Already registered.' } }, 409)

  const id = `ac-${crypto.randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  await run(
    c.env.DB,
    `INSERT INTO aircraft (id, registration, type, category, status, base, capacity_kg, flight_hours, capabilities, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, value.registration, value.type, value.category, value.status, value.base, value.capacityKg, value.flightHours, JSON.stringify(value.capabilities), value.notes, now, now],
  )
  await logAudit(c.env.DB, c.get('user'), 'aircraft.create', 'aircraft', id, `Added aircraft ${value.registration}`, { ...value, ip: clientIp(c) })
  return c.json({ id }, 201)
})

resourceRoutes.patch('/aircraft/:id', requirePermission('aircraft:write'), async (c) => {
  const id = c.req.param('id')
  const existing = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM aircraft WHERE id = ?`, [id])
  if (!existing) return c.json({ error: 'Aircraft not found.' }, 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const merged = {
    registration: existing.registration,
    type: existing.type,
    category: existing.category,
    status: existing.status,
    base: existing.base,
    capacityKg: existing.capacity_kg,
    flightHours: existing.flight_hours,
    capabilities: JSON.parse(String(existing.capabilities ?? '[]')),
    notes: existing.notes,
    ...body,
  }
  const { errors, value } = validateAircraft(merged as Record<string, unknown>)
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)
  const duplicate = await first<{ id: string }>(c.env.DB, `SELECT id FROM aircraft WHERE registration = ? AND id <> ?`, [value.registration, id])
  if (duplicate) return c.json({ error: 'That registration already exists.', fieldErrors: { registration: 'Already registered.' } }, 409)

  await run(
    c.env.DB,
    `UPDATE aircraft SET registration = ?, type = ?, category = ?, status = ?, base = ?, capacity_kg = ?, flight_hours = ?, capabilities = ?, notes = ?, updated_at = ? WHERE id = ?`,
    [value.registration, value.type, value.category, value.status, value.base, value.capacityKg, value.flightHours, JSON.stringify(value.capabilities), value.notes, new Date().toISOString(), id],
  )
  await logAudit(c.env.DB, c.get('user'), 'aircraft.update', 'aircraft', id, `Updated aircraft ${value.registration}`, { status: value.status })
  return c.json({ ok: true })
})

/* ---------------------------------------------------------------------- crew */

resourceRoutes.get('/crew', async (c) => {
  const url = new URL(c.req.url)
  const { page, pageSize, offset } = paging(url)
  const search = (url.searchParams.get('search') ?? '').trim()
  const status = url.searchParams.get('status') ?? ''
  const qualification = url.searchParams.get('qualification') ?? ''
  const where: string[] = []
  const params: unknown[] = []
  if (search) {
    where.push(`(name LIKE ? OR code LIKE ? OR role LIKE ? OR base LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (qualification) {
    where.push('qualifications LIKE ?')
    params.push(`%"${qualification}"%`)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = await first<{ count: number }>(c.env.DB, `SELECT COUNT(*) AS count FROM crew ${clause}`, params)
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT * FROM crew ${clause} ORDER BY ${order(url.searchParams.get('sort') ?? undefined, 'name:asc', ['name', 'code', 'status', 'base', 'duty_limit_minutes'])} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  return c.json({ items: rows.map(crewFromRow), total: total?.count ?? 0, page, pageSize })
})

resourceRoutes.get('/crew/:id', async (c) => {
  const id = c.req.param('id')
  const row = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM crew WHERE id = ?`, [id])
  if (!row) return c.json({ error: 'Crew member not found.' }, 404)
  const assignments = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT a.* FROM assignments a JOIN schedules s ON s.id = a.schedule_id
     WHERE a.crew_id = ? AND s.status = 'committed' ORDER BY a.start DESC LIMIT 20`,
    [id],
  )
  const taskRows = await all<Record<string, unknown>>(c.env.DB, `SELECT id, code, title, duration_minutes FROM tasks`)
  const meta = new Map(taskRows.map((t) => [String(t.id), t]))
  const crew = crewFromRow(row)
  const dutyByDay = new Map<string, number>()
  for (const a of assignments.map(assignmentFromRow)) {
    const day = a.start.slice(0, 10)
    dutyByDay.set(day, (dutyByDay.get(day) ?? 0) + (Date.parse(a.end) - Date.parse(a.start)) / 60_000)
  }
  return c.json({
    crew,
    assignments: assignments.map(assignmentFromRow).map((a) => ({
      ...a,
      taskLabel: meta.has(a.taskId) ? `${meta.get(a.taskId)!.code} · ${meta.get(a.taskId)!.title}` : a.taskId,
    })),
    duty: [...dutyByDay.entries()].sort().map(([date, minutes]) => ({ date, minutes, limit: crew.dutyLimitMinutes })),
  })
})

resourceRoutes.post('/crew', requirePermission('crew:write'), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const { errors, value } = validateCrew(body)
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)
  const duplicate = await first<{ id: string }>(c.env.DB, `SELECT id FROM crew WHERE code = ?`, [value.code])
  if (duplicate) return c.json({ error: 'That crew code already exists.', fieldErrors: { code: 'Already used.' } }, 409)
  const id = `cr-${crypto.randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  await run(
    c.env.DB,
    `INSERT INTO crew (id, code, name, role, base, status, qualifications, certifications, available_from, available_to, duty_limit_minutes, rest_minutes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, value.code, value.name, value.role, value.base, value.status, JSON.stringify(value.qualifications), JSON.stringify(value.certifications), value.availableFrom, value.availableTo, value.dutyLimitMinutes, value.restMinutes, now, now],
  )
  await logAudit(c.env.DB, c.get('user'), 'crew.create', 'crew', id, `Added crew member ${value.code} · ${value.name}`, { role: value.role })
  return c.json({ id }, 201)
})

resourceRoutes.patch('/crew/:id', requirePermission('crew:write'), async (c) => {
  const id = c.req.param('id')
  const existing = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM crew WHERE id = ?`, [id])
  if (!existing) return c.json({ error: 'Crew member not found.' }, 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const merged = {
    code: existing.code,
    name: existing.name,
    role: existing.role,
    base: existing.base,
    status: existing.status,
    qualifications: JSON.parse(String(existing.qualifications ?? '[]')),
    certifications: JSON.parse(String(existing.certifications ?? '[]')),
    availableFrom: existing.available_from,
    availableTo: existing.available_to,
    dutyLimitMinutes: existing.duty_limit_minutes,
    restMinutes: existing.rest_minutes,
    ...body,
  }
  const { errors, value } = validateCrew(merged as Record<string, unknown>)
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)
  await run(
    c.env.DB,
    `UPDATE crew SET code = ?, name = ?, role = ?, base = ?, status = ?, qualifications = ?, certifications = ?, available_from = ?, available_to = ?, duty_limit_minutes = ?, rest_minutes = ?, updated_at = ? WHERE id = ?`,
    [value.code, value.name, value.role, value.base, value.status, JSON.stringify(value.qualifications), JSON.stringify(value.certifications), value.availableFrom, value.availableTo, value.dutyLimitMinutes, value.restMinutes, new Date().toISOString(), id],
  )
  await logAudit(c.env.DB, c.get('user'), 'crew.update', 'crew', id, `Updated crew member ${value.code}`, { status: value.status, dutyLimitMinutes: value.dutyLimitMinutes })
  return c.json({ ok: true })
})

/* --------------------------------------------------------------- maintenance */

resourceRoutes.get('/maintenance', async (c) => {
  const url = new URL(c.req.url)
  const status = url.searchParams.get('status') ?? ''
  const aircraftId = url.searchParams.get('aircraftId') ?? ''
  const where: string[] = []
  const params: unknown[] = []
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (aircraftId) {
    where.push('aircraft_id = ?')
    params.push(aircraftId)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM maintenance ${clause} ORDER BY window_start ASC`, params)
  const aircraft = await all<Record<string, unknown>>(c.env.DB, `SELECT id, registration, type FROM aircraft`)
  const labels = new Map(aircraft.map((a) => [String(a.id), `${a.registration} · ${a.type}`]))
  return c.json({
    items: rows
      .map(maintenanceFromRow)
      .map((m) => ({ ...m, aircraftLabel: labels.get(m.aircraftId) ?? m.aircraftId })),
    aircraft: aircraft.map((a) => ({ id: String(a.id), label: `${a.registration} · ${a.type}` })),
  })
})

resourceRoutes.post('/maintenance', requirePermission('maintenance:write'), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const { errors, value } = validateMaintenance(body)
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)
  const aircraft = await first<{ id: string }>(c.env.DB, `SELECT id FROM aircraft WHERE id = ?`, [value.aircraftId])
  if (!aircraft) return c.json({ error: 'Aircraft not found.', fieldErrors: { aircraftId: 'Unknown aircraft.' } }, 422)

  const id = `mt-${crypto.randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  await run(
    c.env.DB,
    `INSERT INTO maintenance (id, aircraft_id, type, status, window_start, window_end, description, restriction, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [id, value.aircraftId, value.type, value.status, value.windowStart, value.windowEnd, value.description, value.restriction, now, now],
  )
  if (value.status === 'in_progress') {
    await run(c.env.DB, `UPDATE aircraft SET status = 'maintenance', updated_at = ? WHERE id = ?`, [now, value.aircraftId])
  }
  await logAudit(c.env.DB, c.get('user'), 'maintenance.create', 'maintenance', id, `Raised ${value.type} maintenance: ${value.description}`, { aircraftId: value.aircraftId, status: value.status })
  return c.json({ id }, 201)
})

resourceRoutes.patch('/maintenance/:id', requirePermission('maintenance:write'), async (c) => {
  const id = c.req.param('id')
  const existing = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM maintenance WHERE id = ?`, [id])
  if (!existing) return c.json({ error: 'Maintenance record not found.' }, 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const merged = {
    aircraftId: existing.aircraft_id,
    type: existing.type,
    status: existing.status,
    windowStart: existing.window_start,
    windowEnd: existing.window_end,
    description: existing.description,
    restriction: existing.restriction,
    ...body,
  }
  const { errors, value } = validateMaintenance(merged as Record<string, unknown>)
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)
  const now = new Date().toISOString()
  await run(
    c.env.DB,
    `UPDATE maintenance SET aircraft_id = ?, type = ?, status = ?, window_start = ?, window_end = ?, description = ?, restriction = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    [
      value.aircraftId,
      value.type,
      value.status,
      value.windowStart,
      value.windowEnd,
      value.description,
      value.restriction,
      value.status === 'completed' ? now : null,
      now,
      id,
    ],
  )
  if (value.status === 'in_progress') {
    await run(c.env.DB, `UPDATE aircraft SET status = 'maintenance', updated_at = ? WHERE id = ?`, [now, value.aircraftId])
  }
  if (value.status === 'completed' || value.status === 'cancelled') {
    const open = await first<{ count: number }>(
      c.env.DB,
      `SELECT COUNT(*) AS count FROM maintenance WHERE aircraft_id = ? AND status IN ('planned','in_progress') AND id <> ?`,
      [value.aircraftId, id],
    )
    if (!open?.count) {
      await run(c.env.DB, `UPDATE aircraft SET status = 'serviceable', updated_at = ? WHERE id = ? AND status = 'maintenance'`, [now, value.aircraftId])
    }
  }
  await logAudit(c.env.DB, c.get('user'), 'maintenance.update', 'maintenance', id, `Maintenance ${value.status}: ${value.description}`, { aircraftId: value.aircraftId })
  return c.json({ ok: true })
})

resourceRoutes.post('/maintenance/:id/complete', requirePermission('maintenance:write'), async (c) => {
  const id = c.req.param('id')
  const existing = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM maintenance WHERE id = ?`, [id])
  if (!existing) return c.json({ error: 'Maintenance record not found.' }, 404)
  const now = new Date().toISOString()
  await run(c.env.DB, `UPDATE maintenance SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`, [now, now, id])
  const aircraftId = String(existing.aircraft_id)
  const open = await first<{ count: number }>(
    c.env.DB,
    `SELECT COUNT(*) AS count FROM maintenance WHERE aircraft_id = ? AND status IN ('planned','in_progress')`,
    [aircraftId],
  )
  if (!open?.count) {
    await run(c.env.DB, `UPDATE aircraft SET status = 'serviceable', updated_at = ? WHERE id = ? AND status = 'maintenance'`, [now, aircraftId])
  }
  await logAudit(c.env.DB, c.get('user'), 'maintenance.complete', 'maintenance', id, `Completed maintenance ${String(existing.description)}`, { aircraftId })
  return c.json({ ok: true })
})

/* ------------------------------------------------------------------- overview */

export const overviewRoutes = new Hono<AppEnv>()

overviewRoutes.get('/', async (c) => {
  const nowIso = new Date().toISOString()
  const aircraft = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM aircraft ORDER BY registration ASC`)
  const crew = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM crew ORDER BY name ASC`)
  const tasks = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM tasks ORDER BY window_start ASC`)
  const maintenance = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM maintenance ORDER BY window_start ASC`)
  const schedule = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM schedules WHERE status = 'committed' ORDER BY version DESC LIMIT 1`)
  const assignments = schedule
    ? await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM assignments WHERE schedule_id = ? ORDER BY start ASC`, [schedule.id])
    : []
  const run = await first<Record<string, unknown>>(c.env.DB, `SELECT * FROM optimization_runs ORDER BY created_at DESC LIMIT 1`)
  const pending = await first<{ count: number }>(c.env.DB, `SELECT COUNT(*) AS count FROM approvals WHERE status = 'pending'`)

  const aircraftList = aircraft.map(aircraftFromRow)
  const crewList = crew.map(crewFromRow)
  const taskList = tasks.map((row) => taskFromRow(row))
  const maintenanceList = maintenance.map(maintenanceFromRow)
  const assignmentList = assignments.map(assignmentFromRow)

  const activeMaintenance = maintenanceList.filter((m) => m.status === 'planned' || m.status === 'in_progress')
  const assignedTaskIds = new Set(assignmentList.map((a) => a.taskId))
  const openTasks = taskList.filter((t) => t.state !== 'cancelled' && t.state !== 'completed')
  const unassigned = openTasks.filter((t) => !assignedTaskIds.has(t.id) && t.state !== 'draft')

  const serviceable = aircraftList.filter((a) => a.status === 'serviceable')
  const restricted = aircraftList.filter((a) => a.status === 'restricted')
  const availableCrew = crewList.filter((c) => c.status === 'available' || c.status === 'on_duty')

  const horizonEnd = Date.parse(nowIso) + 24 * 3600_000
  const next24 = assignmentList.filter((a) => Date.parse(a.end) > Date.now() && Date.parse(a.start) < horizonEnd)

  const attention: { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; action?: { label: string; to: string } }[] = []
  for (const a of aircraftList.filter((x) => x.status === 'unserviceable')) {
    attention.push({
      id: `ac-${a.id}`,
      severity: 'critical',
      title: `${a.registration} unserviceable`,
      detail: a.notes || 'No return-to-service date recorded.',
      action: { label: 'Open aircraft', to: `/console/aircraft/${a.id}` },
    })
  }
  for (const m of activeMaintenance) {
    const ac = aircraftList.find((a) => a.id === m.aircraftId)
    if (m.status === 'in_progress') {
      attention.push({
        id: `mt-${m.id}`,
        severity: 'warning',
        title: `${ac?.registration ?? 'Aircraft'} in maintenance`,
        detail: `${m.description} · until ${new Date(m.windowEnd).toISOString().slice(11, 16)} UTC`,
        action: { label: 'Open maintenance', to: '/console/maintenance' },
      })
    }
  }
  if (unassigned.length) {
    attention.push({
      id: 'unassigned',
      severity: 'warning',
      title: `${unassigned.length} task${unassigned.length === 1 ? '' : 's'} without an assignment`,
      detail: unassigned.slice(0, 3).map((t) => t.code).join(', ') + (unassigned.length > 3 ? ` +${unassigned.length - 3} more` : ''),
      action: { label: 'Review schedule', to: '/console/schedule' },
    })
  }
  if (pending?.count) {
    attention.push({
      id: 'approvals',
      severity: 'info',
      title: `${pending.count} schedule proposal${pending.count === 1 ? '' : 's'} awaiting approval`,
      detail: 'Optimization output is not operational until approved.',
      action: { label: 'Open evaluation', to: '/console/evaluation' },
    })
  }
  const expiring = crewList.flatMap((member) =>
    member.certifications
      .filter((cert) => Date.parse(cert.expiresAt) - Date.now() < 45 * 86_400_000)
      .map((cert) => ({ member, cert })),
  )
  for (const { member, cert } of expiring.slice(0, 3)) {
    attention.push({
      id: `cert-${member.id}-${cert.name}`,
      severity: 'warning',
      title: `${member.name}: ${cert.name} expires soon`,
      detail: `Expires ${new Date(cert.expiresAt).toISOString().slice(0, 10)}.`,
      action: { label: 'Open crew', to: `/console/crew/${member.id}` },
    })
  }

  return c.json({
    demoData: true,
    generatedAt: nowIso,
    metrics: {
      serviceableAircraft: serviceable.length,
      restrictedAircraft: restricted.length,
      totalAircraft: aircraftList.length,
      availableCrew: availableCrew.length,
      totalCrew: crewList.length,
      activeTasks: openTasks.length,
      unassignedTasks: unassigned.length,
      maintenanceRestrictions: activeMaintenance.length,
      scheduleStatus: schedule ? String(schedule.status) : 'none',
      scheduleVersion: schedule ? Number(schedule.version) : null,
      pendingApprovals: pending?.count ?? 0,
      latestOptimization: run
        ? {
            id: String(run.id),
            algorithm: String(run.algorithm),
            createdAt: String(run.created_at),
            feasibility: String(run.feasibility),
            assignedCount: Number(run.assigned_count),
            unassignedCount: Number(run.unassigned_count),
          }
        : null,
    },
    readiness: {
      aircraft: { ready: serviceable.length, restricted: restricted.length, unavailable: aircraftList.length - serviceable.length - restricted.length },
      crew: {
        available: crewList.filter((x) => x.status === 'available').length,
        onDuty: crewList.filter((x) => x.status === 'on_duty').length,
        unavailable: crewList.filter((x) => x.status !== 'available' && x.status !== 'on_duty').length,
      },
      maintenance: activeMaintenance.length,
    },
    attention,
    timeline: {
      from: nowIso,
      to: new Date(horizonEnd).toISOString(),
      aircraft: aircraftList.map((a) => ({
        id: a.id,
        registration: a.registration,
        type: a.type,
        status: a.status,
        assignments: next24
          .filter((x) => x.aircraftId === a.id)
          .map((x) => ({
            id: x.id,
            taskId: x.taskId,
            label: taskList.find((t) => t.id === x.taskId)?.code ?? x.taskId,
            start: x.start,
            end: x.end,
            state: taskList.find((t) => t.id === x.taskId)?.state ?? 'scheduled',
          })),
      })),
      unassigned: unassigned.slice(0, 12).map((t) => ({ id: t.id, code: t.code, title: t.title, windowStart: t.windowStart, windowEnd: t.windowEnd, priority: t.priority })),
    },
  })
})
