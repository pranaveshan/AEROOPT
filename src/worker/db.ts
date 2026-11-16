// D1 access layer: schema, idempotent bootstrap and the demonstration data set.
import { planSchedule } from '../shared/engine'
import type { Aircraft, CrewMember, MaintenanceRecord, OperationalTask } from '../shared/types'
import { DEFAULT_CONFIG } from '../shared/engine'
import { hashPassword, randomId } from './crypto'

export interface D1Result<T = unknown> {
  results?: T[]
  success: boolean
  meta?: { changes?: number; last_row_id?: number }
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run<T = unknown>(): Promise<D1Result<T>>
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
}

export const all = async <T>(db: D1DatabaseLike, sql: string, params: unknown[] = []): Promise<T[]> => {
  const res = await db.prepare(sql).bind(...params).all<T>()
  return res.results ?? []
}

export const first = async <T>(db: D1DatabaseLike, sql: string, params: unknown[] = []): Promise<T | null> =>
  db.prepare(sql).bind(...params).first<T>()

export const run = async (db: D1DatabaseLike, sql: string, params: unknown[] = []): Promise<void> => {
  await db.prepare(sql).bind(...params).run()
}

export const SCHEMA_VERSION = 1

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', password_hash TEXT NOT NULL, created_at TEXT NOT NULL,
    last_login_at TEXT, mfa_secret TEXT, mfa_enabled INTEGER NOT NULL DEFAULT 0, suspended_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
    ip TEXT NOT NULL, user_agent TEXT NOT NULL, revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
    used_at TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, ip TEXT NOT NULL, created_at TEXT NOT NULL, outcome TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS aircraft (
    id TEXT PRIMARY KEY, registration TEXT NOT NULL UNIQUE, type TEXT NOT NULL, category TEXT NOT NULL,
    status TEXT NOT NULL, base TEXT NOT NULL, capacity_kg INTEGER NOT NULL, flight_hours REAL NOT NULL,
    capabilities TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS crew (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, base TEXT NOT NULL,
    status TEXT NOT NULL, qualifications TEXT NOT NULL, certifications TEXT NOT NULL, available_from TEXT NOT NULL,
    available_to TEXT NOT NULL, duty_limit_minutes INTEGER NOT NULL, rest_minutes INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS maintenance (
    id TEXT PRIMARY KEY, aircraft_id TEXT NOT NULL REFERENCES aircraft(id), type TEXT NOT NULL, status TEXT NOT NULL,
    window_start TEXT NOT NULL, window_end TEXT NOT NULL, description TEXT NOT NULL, restriction TEXT NOT NULL,
    completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL,
    priority TEXT NOT NULL, state TEXT NOT NULL, window_start TEXT NOT NULL, window_end TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL, payload_kg INTEGER NOT NULL, required_capabilities TEXT NOT NULL,
    required_qualifications TEXT NOT NULL, site TEXT NOT NULL, client TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_id)
  )`,
  `CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '', optimization_run_id TEXT, created_by TEXT, created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT, decided_by_name TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id), aircraft_id TEXT NOT NULL REFERENCES aircraft(id),
    crew_id TEXT REFERENCES crew(id), start TEXT NOT NULL, end TEXT NOT NULL, conflict TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS optimization_runs (
    id TEXT PRIMARY KEY, algorithm TEXT NOT NULL, schedule_id TEXT, status TEXT NOT NULL, feasibility TEXT NOT NULL,
    objective TEXT NOT NULL, assigned_count INTEGER NOT NULL, unassigned_count INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL, proposal TEXT NOT NULL, created_by TEXT, created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, status TEXT NOT NULL, requested_by TEXT,
    requested_by_name TEXT NOT NULL, decided_by TEXT, decided_by_name TEXT, decided_at TEXT, reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL,
    entity_id TEXT, summary TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY, user_id TEXT, email TEXT NOT NULL, type TEXT NOT NULL, severity TEXT NOT NULL,
    message TEXT NOT NULL, ip TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_schedule ON assignments(schedule_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_start ON assignments(start)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_security_created ON security_events(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
]

export const DEMO_PASSWORD = 'AeroOpt#2026'
export const DEMO_ACCOUNTS = [
  { email: 'admin@aeroopt.io', name: 'Mara Lindqvist', role: 'admin' },
  { email: 'ops@aeroopt.io', name: 'Tomas Reiner', role: 'ops_manager' },
  { email: 'dispatch@aeroopt.io', name: 'Ada Ferrand', role: 'dispatcher' },
  { email: 'maintenance@aeroopt.io', name: 'Ilya Barton', role: 'maintenance_officer' },
  { email: 'crew@aeroopt.io', name: 'Sofia Amaral', role: 'crew_coordinator' },
  { email: 'viewer@aeroopt.io', name: 'Noah Kestrel', role: 'viewer' },
] as const

export const DEFAULT_SETTINGS: Record<string, string> = {
  operationalTimezone: 'UTC',
  turnaroundMinutes: '30',
  crewGapMinutes: '20',
  slotStepMinutes: '30',
  defaultDutyLimitMinutes: '600',
  defaultRestMinutes: '600',
  sessionHours: '12',
  loginRateLimit: '8',
  demoData: 'true',
}

const iso = (value: number) => new Date(value).toISOString()

function seedAircraft(now: number): Aircraft[] {
  const stamp = iso(now)
  const rows: [string, string, string, string, Aircraft['status'], number, number, string[], string][] = [
    ['G-OPSA', 'Airbus A320-200', 'Narrowbody · passenger', 'LHR', 'serviceable', 18_000, 21_400, ['pax', 'ifr', 'night-ops', 'deicing'], 'Line aircraft, doubles as standby.'],
    ['G-OPSB', 'Airbus A320-200', 'Narrowbody · passenger', 'LHR', 'serviceable', 18_000, 19_880, ['pax', 'ifr', 'night-ops'], ''],
    ['G-OFRA', 'Boeing 737-800F', 'Narrowbody · freighter', 'STN', 'serviceable', 21_000, 12_310, ['cargo', 'ifr', 'night-ops', 'deicing'], 'Main cargo airframe.'],
    ['G-OFRB', 'Boeing 737-800F', 'Narrowbody · freighter', 'STN', 'restricted', 21_000, 15_760, ['cargo', 'ifr'], 'Restricted to day operations pending avionics check.'],
    ['G-HELA', 'Leonardo AW139', 'Rotary · offshore', 'ABZ', 'serviceable', 2_600, 6_140, ['rotary', 'offshore', 'night-ops', 'medevac'], 'Offshore transfer and medevac.'],
    ['G-HELB', 'Leonardo AW139', 'Rotary · offshore', 'ABZ', 'maintenance', 2_600, 5_220, ['rotary', 'offshore'], 'In scheduled maintenance.'],
    ['G-ATLA', 'ATR 72-600', 'Regional · passenger', 'MAN', 'serviceable', 7_500, 9_470, ['pax', 'ifr', 'regional'], ''],
    ['G-ATLB', 'ATR 72-600', 'Regional · passenger', 'MAN', 'unserviceable', 7_500, 11_020, ['pax', 'regional'], 'Awaiting replacement propeller.'],
  ]
  return rows.map(([reg, type, category, base, status, capacity, hours, capabilities, notes], index) => ({
    id: `ac-${index + 1}`,
    registration: reg,
    type,
    category,
    status,
    base,
    capacityKg: capacity,
    flightHours: hours,
    capabilities,
    notes,
    createdAt: stamp,
    updatedAt: stamp,
  }))
}

function seedCrew(now: number): CrewMember[] {
  const stamp = iso(now)
  const from = iso(now - 6 * 3600_000)
  const to = iso(now + 5 * 86_400_000)
  const rows: [string, string, string, string, CrewMember['status'], string[], string[]][] = [
    ['CRW-101', 'Elena Vasquez', 'Captain', 'LHR', 'available', ['pax', 'ifr', 'a320', 'night-ops', 'instruction'], ['A320 Type Rating', 'Class 1 Medical']],
    ['CRW-102', 'Jonas Berg', 'First Officer', 'LHR', 'available', ['pax', 'ifr', 'a320'], ['A320 Type Rating', 'Class 1 Medical']],
    ['CRW-103', 'Priya Raman', 'Captain', 'STN', 'available', ['cargo', 'ifr', 'b737', 'night-ops'], ['B737 Type Rating', 'Class 1 Medical']],
    ['CRW-104', 'Marek Dvorak', 'First Officer', 'STN', 'on_duty', ['cargo', 'ifr', 'b737'], ['B737 Type Rating', 'Class 1 Medical']],
    ['CRW-105', 'Aisha Nour', 'Captain', 'ABZ', 'available', ['rotary', 'offshore', 'night-ops', 'medevac'], ['AW139 Type Rating', 'Offshore Survival']],
    ['CRW-106', 'Ben Okoro', 'First Officer', 'ABZ', 'available', ['rotary', 'offshore', 'medevac'], ['AW139 Type Rating', 'Offshore Survival']],
    ['CRW-107', 'Clara Mendes', 'Captain', 'MAN', 'available', ['pax', 'ifr', 'regional', 'atr'], ['ATR72 Type Rating', 'Class 1 Medical']],
    ['CRW-108', 'Ravi Chandra', 'First Officer', 'MAN', 'rest', ['pax', 'regional', 'atr'], ['ATR72 Type Rating', 'Class 1 Medical']],
    ['CRW-109', 'Hanna Weiss', 'Loadmaster', 'STN', 'available', ['cargo', 'loadmaster', 'dangerous-goods'], ['DG Acceptance', 'Load Control']],
    ['CRW-110', 'Tariq Aziz', 'Engineer', 'LHR', 'available', ['maintenance-release', 'a320', 'b737'], ['Part 66 B1.1']],
  ]
  return rows.map(([code, name, role, base, status, qualifications, certs], index) => ({
    id: `cr-${index + 1}`,
    code,
    name,
    role,
    base,
    status,
    qualifications,
    certifications: certs.map((cert) => ({ name: cert, expiresAt: iso(now + 180 * 86_400_000) })),
    availableFrom: from,
    availableTo: to,
    dutyLimitMinutes: role === 'Loadmaster' ? 720 : 600,
    restMinutes: 600,
    createdAt: stamp,
    updatedAt: stamp,
  }))
}

function seedMaintenance(now: number, aircraft: Aircraft[]): MaintenanceRecord[] {
  const stamp = iso(now)
  const find = (reg: string) => aircraft.find((a) => a.registration === reg)!.id
  const rows: [string, MaintenanceRecord['type'], MaintenanceRecord['status'], number, number, string, string][] = [
    ['G-HELB', 'scheduled', 'in_progress', -3 * 3600_000, 5 * 3600_000, '400 h inspection and rotor track balance.', 'Aircraft released to maintenance only.'],
    ['G-OFRB', 'inspection', 'planned', 20 * 3600_000, 30 * 3600_000, 'Avionics AD compliance check.', 'Day operations only until closed.'],
    ['G-ATLB', 'unscheduled', 'in_progress', -26 * 3600_000, 40 * 3600_000, 'Propeller replacement awaiting part.', 'Aircraft unserviceable.'],
    ['G-OPSA', 'scheduled', 'planned', 50 * 3600_000, 58 * 3600_000, 'A-check package 3.', ''],
  ]
  return rows.map(([reg, type, status, from, to, description, restriction], index) => ({
    id: `mt-${index + 1}`,
    aircraftId: find(reg),
    type,
    status,
    windowStart: iso(now + from),
    windowEnd: iso(now + to),
    description,
    restriction,
    completedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  }))
}

function seedTasks(now: number): OperationalTask[] {
  const stamp = iso(now)
  const day = 86_400_000
  const rows: [string, string, string, OperationalTask['priority'], OperationalTask['state'], number, number, number, number, string[], string[], string, string, number[]][] = [
    ['TSK-1041', 'LHR–FRA passenger rotation', 'Scheduled rotation, 142 passengers and 3 cabin crew.', 'critical', 'scheduled', 3, 9, 150, 12_400, ['pax', 'ifr'], ['pax', 'a320'], 'LHR', 'Meridian Air', []],
    ['TSK-1042', 'STN–DUB cargo uplift', 'Express freight, 16.2 t mixed pallet load.', 'high', 'scheduled', 4, 8, 165, 16_200, ['cargo', 'ifr'], ['cargo', 'b737', 'loadmaster'], 'STN', 'Northline Cargo', []],
    ['TSK-1043', 'ABZ offshore crew transfer', 'Six passengers to Brent platform, weather window limited.', 'critical', 'scheduled', 5, 8, 120, 900, ['rotary', 'offshore'], ['rotary', 'offshore'], 'ABZ', 'North Sea Energy', []],
    ['TSK-1044', 'MAN–EDI regional rotation', 'Two-sector regional service.', 'normal', 'scheduled', 6, 12, 180, 6_100, ['pax', 'regional', 'ifr'], ['regional', 'atr'], 'MAN', 'Caledonia Connect', []],
    ['TSK-1045', 'Medical evacuation standby cover', 'Duty cover for offshore medevac, 2 h response.', 'high', 'pending', 7, 13, 210, 700, ['rotary', 'medevac', 'night-ops'], ['rotary', 'medevac'], 'ABZ', 'Coastguard Authority', []],
    ['TSK-1046', 'STN–CDG freight shuttle', 'Night freight shuttle, 11 t.', 'normal', 'pending', 10, 16, 150, 11_000, ['cargo', 'night-ops'], ['cargo', 'b737'], 'STN', 'Continental Freight', []],
    ['TSK-1047', 'LHR–MAD passenger rotation', 'Scheduled rotation, 168 passengers.', 'high', 'pending', 11, 17, 165, 14_900, ['pax', 'ifr'], ['pax', 'a320'], 'LHR', 'Meridian Air', [1]],
    ['TSK-1048', 'A320 A-check positioning flight', 'Position G-OPSA to MAN for A-check package 3.', 'low', 'pending', 14, 15, 90, 2_400, ['pax', 'ifr'], ['pax', 'a320'], 'LHR', 'AeroOpt Maintenance', []],
    ['TSK-1049', 'ABZ–Sumburgh medical transfer', 'Single patient transfer, stretcher configured.', 'critical', 'pending', 20, 26, 105, 650, ['rotary', 'medevac'], ['rotary', 'medevac'], 'ABZ', 'NHS Grampian', []],
    ['TSK-1050', 'MAN–BRS regional rotation', 'Regional rotation with 64 passengers.', 'normal', 'pending', 26, 32, 160, 5_200, ['pax', 'regional'], ['regional', 'atr'], 'MAN', 'Caledonia Connect', []],
    ['TSK-1051', 'LHR–JFK long-haul preparation', 'Crew briefing and aircraft prep for long-haul sector.', 'normal', 'draft', 30, 36, 120, 1_200, ['pax'], ['pax', 'a320'], 'LHR', 'Meridian Air', []],
    ['TSK-1052', 'STN cargo hangar load control audit', 'Load control audit with DG documentation check.', 'low', 'draft', 34, 40, 120, 0, ['cargo'], ['loadmaster', 'dangerous-goods'], 'STN', 'Compliance Office', []],
    ['TSK-1053', 'De-icing fluid resupply run', 'Resupply de-icing fluid to LHR stand 12.', 'low', 'pending', 36, 46, 140, 4_800, ['cargo'], ['cargo'], 'LHR', 'Ground Services', []],
    ['TSK-1054', 'Regional fleet night survey', 'Night survey sortie over the western corridor.', 'normal', 'pending', 44, 50, 180, 1_100, ['rotary', 'night-ops'], ['rotary'], 'ABZ', 'CAA Survey', []],
    ['TSK-1055', 'Cancelled charter recovery', 'Withdrawn charter, retained for reference.', 'low', 'cancelled', -20, 18, 120, 3_000, ['pax'], ['pax'], 'LHR', 'Meridian Air', []],
  ]
  return rows.map(([code, title, description, priority, state, startH, endH, duration, payload, caps, quals, site, client, deps], index) => ({
    id: `tk-${index + 1}`,
    code,
    title,
    description,
    priority,
    state,
    windowStart: iso(now + startH * 3600_000 + day),
    windowEnd: iso(now + endH * 3600_000 + day),
    durationMinutes: duration,
    payloadKg: payload,
    requiredCapabilities: caps,
    requiredQualifications: quals,
    site,
    client,
    dependencies: deps.map((n) => `tk-${n}`),
    createdAt: stamp,
    updatedAt: stamp,
  }))
}

let bootstrapPromise: Promise<void> | null = null

/** Creates the schema once, seeds demonstration data once, and is safe to call per request. */
export async function ensureDatabase(db: D1DatabaseLike): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap(db).catch((error) => {
      bootstrapPromise = null
      throw error
    })
  }
  return bootstrapPromise
}

async function bootstrap(db: D1DatabaseLike): Promise<void> {
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)))
  const version = await first<{ value: string }>(db, `SELECT value FROM meta WHERE key = 'schema_version'`)
  if (version?.value === String(SCHEMA_VERSION)) return

  const now = Date.now()
  const stamp = iso(now)
  const aircraft = seedAircraft(now)
  const crew = seedCrew(now)
  const maintenance = seedMaintenance(now, aircraft)
  const tasks = seedTasks(now)

  const statements: D1PreparedStatement[] = []

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    statements.push(db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).bind(key, value))
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD)
  for (const account of DEMO_ACCOUNTS) {
    statements.push(
      db
        .prepare(`INSERT OR IGNORE INTO users (id, email, name, role, status, password_hash, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`)
        .bind(randomId('us_'), account.email, account.name, account.role, passwordHash, stamp),
    )
  }

  for (const a of aircraft) {
    statements.push(
      db
        .prepare(
          `INSERT INTO aircraft (id, registration, type, category, status, base, capacity_kg, flight_hours, capabilities, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(a.id, a.registration, a.type, a.category, a.status, a.base, a.capacityKg, a.flightHours, JSON.stringify(a.capabilities), a.notes, a.createdAt, a.updatedAt),
    )
  }
  for (const c of crew) {
    statements.push(
      db
        .prepare(
          `INSERT INTO crew (id, code, name, role, base, status, qualifications, certifications, available_from, available_to, duty_limit_minutes, rest_minutes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(c.id, c.code, c.name, c.role, c.base, c.status, JSON.stringify(c.qualifications), JSON.stringify(c.certifications), c.availableFrom, c.availableTo, c.dutyLimitMinutes, c.restMinutes, c.createdAt, c.updatedAt),
    )
  }
  for (const m of maintenance) {
    statements.push(
      db
        .prepare(
          `INSERT INTO maintenance (id, aircraft_id, type, status, window_start, window_end, description, restriction, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .bind(m.id, m.aircraftId, m.type, m.status, m.windowStart, m.windowEnd, m.description, m.restriction, m.createdAt, m.updatedAt),
    )
  }
  for (const t of tasks) {
    statements.push(
      db
        .prepare(
          `INSERT INTO tasks (id, code, title, description, priority, state, window_start, window_end, duration_minutes, payload_kg, required_capabilities, required_qualifications, site, client, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(t.id, t.code, t.title, t.description, t.priority, t.state, t.windowStart, t.windowEnd, t.durationMinutes, t.payloadKg, JSON.stringify(t.requiredCapabilities), JSON.stringify(t.requiredQualifications), t.site, t.client, t.createdAt, t.updatedAt),
    )
    for (const dep of t.dependencies) {
      statements.push(db.prepare(`INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)`).bind(t.id, dep))
    }
  }

  // The initial committed schedule is generated by the real engine, so the
  // overview, timeline and evaluation start from consistent data.
  const horizonStart = iso(now - 12 * 3600_000)
  const horizonEnd = iso(now + 72 * 3600_000)
  const config = {
    turnaroundMinutes: Number(DEFAULT_SETTINGS.turnaroundMinutes),
    crewGapMinutes: Number(DEFAULT_SETTINGS.crewGapMinutes),
    slotStepMinutes: Number(DEFAULT_SETTINGS.slotStepMinutes),
    horizonStart,
    horizonEnd,
  }
  const plan = planSchedule(
    { tasks, aircraft, crew, maintenance, existing: [], config, now: iso(now) },
    { ordering: 'priority', preserveExisting: false },
  )

  const scheduleId = 'sch-seed-1'
  statements.push(
    db
      .prepare(
        `INSERT INTO schedules (id, version, status, source, notes, optimization_run_id, created_by, created_by_name, created_at, decided_at, decided_by, decided_by_name)
         VALUES (?, 1, 'committed', 'optimization', ?, NULL, NULL, ?, ?, ?, NULL, ?)`,
      )
      .bind(scheduleId, 'Initial operational schedule generated by the constraint planner.', 'System', stamp, stamp, 'System'),
  )
  for (const assignment of plan.assignments) {
    statements.push(
      db
        .prepare(
          `INSERT INTO assignments (id, schedule_id, task_id, aircraft_id, crew_id, start, end, conflict, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .bind(randomId('as_'), scheduleId, assignment.taskId, assignment.aircraftId, assignment.crewId, assignment.start, assignment.end, stamp),
    )
  }
  const assignedIds = new Set(plan.assignments.map((a) => a.taskId))
  for (const task of tasks) {
    const state = assignedIds.has(task.id)
      ? 'scheduled'
      : task.state === 'draft'
        ? 'draft'
        : task.state === 'cancelled' || task.state === 'completed'
          ? task.state
          : 'pending'
    statements.push(db.prepare(`UPDATE tasks SET state = ? WHERE id = ?`).bind(state, task.id))
  }

  statements.push(
    db
      .prepare(`INSERT INTO audit_events (id, actor_id, actor_name, action, entity_type, entity_id, summary, details, created_at) VALUES (?, NULL, 'System', 'seed', 'database', NULL, ?, ?, ?)`)
      .bind(randomId('au_'), `Demonstration dataset loaded: ${aircraft.length} aircraft, ${crew.length} crew, ${tasks.length} tasks.`, JSON.stringify({ demoData: true }), stamp),
  )
  statements.push(db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`).bind(String(SCHEMA_VERSION)))
  statements.push(db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_at', ?)`).bind(stamp))

  // D1 batches are capped; chunk to stay well inside the limit.
  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40))
  }
}

export { DEFAULT_CONFIG }
