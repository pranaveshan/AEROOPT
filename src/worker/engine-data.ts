// Assembles the pure engine input from persisted operational data.
import type { EngineConfig, EngineInput } from '../shared/types'
import { settingsMap } from './auth'
import { all, type D1DatabaseLike } from './db'
import { aircraftFromRow, assignmentFromRow, crewFromRow, maintenanceFromRow, taskFromRow } from './serialize'

export async function loadEngineInput(db: D1DatabaseLike, scheduleId?: string): Promise<EngineInput> {
  const settings = await settingsMap(db)
  const aircraftRows = await all<Record<string, unknown>>(db, `SELECT * FROM aircraft`)
  const crewRows = await all<Record<string, unknown>>(db, `SELECT * FROM crew`)
  const maintenanceRows = await all<Record<string, unknown>>(db, `SELECT * FROM maintenance`)
  const taskRows = await all<Record<string, unknown>>(db, `SELECT * FROM tasks`)
  const depRows = await all<{ task_id: string; depends_on_id: string }>(db, `SELECT task_id, depends_on_id FROM task_dependencies`)

  let committedId = scheduleId
  if (!committedId) {
    const row = await all<{ id: string }>(db, `SELECT id FROM schedules WHERE status = 'committed' ORDER BY version DESC LIMIT 1`)
    committedId = row[0]?.id
  }
  const assignmentRows = committedId
    ? await all<Record<string, unknown>>(db, `SELECT * FROM assignments WHERE schedule_id = ?`, [committedId])
    : []

  const depsByTask = new Map<string, string[]>()
  for (const row of depRows) depsByTask.set(row.task_id, [...(depsByTask.get(row.task_id) ?? []), row.depends_on_id])

  const now = Date.now()
  const config: EngineConfig = {
    turnaroundMinutes: Number(settings.turnaroundMinutes ?? 30),
    crewGapMinutes: Number(settings.crewGapMinutes ?? 20),
    slotStepMinutes: Number(settings.slotStepMinutes ?? 30),
    horizonStart: new Date(now - 12 * 3600_000).toISOString(),
    horizonEnd: new Date(now + 72 * 3600_000).toISOString(),
  }

  return {
    tasks: taskRows.map((row) => taskFromRow(row, depsByTask.get(String(row.id)) ?? [])),
    aircraft: aircraftRows.map(aircraftFromRow),
    crew: crewRows.map(crewFromRow),
    maintenance: maintenanceRows.map(maintenanceFromRow),
    existing: assignmentRows.map(assignmentFromRow),
    config,
    now: new Date(now).toISOString(),
  }
}
