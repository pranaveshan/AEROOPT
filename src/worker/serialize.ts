// Row → domain object mapping. Column names are snake_case; API payloads are camelCase.
import type {
  Aircraft,
  Approval,
  Assignment,
  AuditEvent,
  Certification,
  CrewMember,
  MaintenanceRecord,
  OperationalTask,
  OptimizationRun,
  Schedule,
  SecurityEvent,
} from '../shared/types'

const json = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

type Row = Record<string, unknown>
const s = (row: Row, key: string) => String(row[key] ?? '')
const n = (row: Row, key: string) => Number(row[key] ?? 0)
const sn = (row: Row, key: string) => (row[key] == null ? null : String(row[key]))

export const aircraftFromRow = (row: Row): Aircraft => ({
  id: s(row, 'id'),
  registration: s(row, 'registration'),
  type: s(row, 'type'),
  category: s(row, 'category'),
  status: s(row, 'status') as Aircraft['status'],
  base: s(row, 'base'),
  capacityKg: n(row, 'capacity_kg'),
  flightHours: n(row, 'flight_hours'),
  capabilities: json<string[]>(row.capabilities as string, []),
  notes: s(row, 'notes'),
  createdAt: s(row, 'created_at'),
  updatedAt: s(row, 'updated_at'),
})

export const crewFromRow = (row: Row): CrewMember => ({
  id: s(row, 'id'),
  code: s(row, 'code'),
  name: s(row, 'name'),
  role: s(row, 'role'),
  base: s(row, 'base'),
  status: s(row, 'status') as CrewMember['status'],
  qualifications: json<string[]>(row.qualifications as string, []),
  certifications: json<Certification[]>(row.certifications as string, []),
  availableFrom: s(row, 'available_from'),
  availableTo: s(row, 'available_to'),
  dutyLimitMinutes: n(row, 'duty_limit_minutes'),
  restMinutes: n(row, 'rest_minutes'),
  createdAt: s(row, 'created_at'),
  updatedAt: s(row, 'updated_at'),
})

export const maintenanceFromRow = (row: Row): MaintenanceRecord => ({
  id: s(row, 'id'),
  aircraftId: s(row, 'aircraft_id'),
  type: s(row, 'type') as MaintenanceRecord['type'],
  status: s(row, 'status') as MaintenanceRecord['status'],
  windowStart: s(row, 'window_start'),
  windowEnd: s(row, 'window_end'),
  description: s(row, 'description'),
  restriction: s(row, 'restriction'),
  completedAt: sn(row, 'completed_at'),
  createdAt: s(row, 'created_at'),
  updatedAt: s(row, 'updated_at'),
})

export const taskFromRow = (row: Row, dependencies: string[] = []): OperationalTask => ({
  id: s(row, 'id'),
  code: s(row, 'code'),
  title: s(row, 'title'),
  description: s(row, 'description'),
  priority: s(row, 'priority') as OperationalTask['priority'],
  state: s(row, 'state') as OperationalTask['state'],
  windowStart: s(row, 'window_start'),
  windowEnd: s(row, 'window_end'),
  durationMinutes: n(row, 'duration_minutes'),
  payloadKg: n(row, 'payload_kg'),
  requiredCapabilities: json<string[]>(row.required_capabilities as string, []),
  requiredQualifications: json<string[]>(row.required_qualifications as string, []),
  site: s(row, 'site'),
  client: s(row, 'client'),
  dependencies,
  createdAt: s(row, 'created_at'),
  updatedAt: s(row, 'updated_at'),
})

export const assignmentFromRow = (row: Row): Assignment => ({
  id: s(row, 'id'),
  scheduleId: s(row, 'schedule_id'),
  taskId: s(row, 'task_id'),
  aircraftId: s(row, 'aircraft_id'),
  crewId: sn(row, 'crew_id'),
  start: s(row, 'start'),
  end: s(row, 'end'),
  conflict: sn(row, 'conflict'),
  createdAt: s(row, 'created_at'),
})

export const scheduleFromRow = (row: Row): Schedule => ({
  id: s(row, 'id'),
  version: n(row, 'version'),
  status: s(row, 'status') as Schedule['status'],
  source: s(row, 'source') as Schedule['source'],
  notes: s(row, 'notes'),
  optimizationRunId: sn(row, 'optimization_run_id'),
  createdBy: sn(row, 'created_by'),
  createdByName: s(row, 'created_by_name'),
  createdAt: s(row, 'created_at'),
  decidedAt: sn(row, 'decided_at'),
  decidedByName: s(row, 'decided_by_name'),
})

export const runFromRow = (row: Row): OptimizationRun => ({
  id: s(row, 'id'),
  algorithm: s(row, 'algorithm'),
  scheduleId: sn(row, 'schedule_id'),
  status: s(row, 'status') as OptimizationRun['status'],
  feasibility: s(row, 'feasibility') as OptimizationRun['feasibility'],
  objective: json(row.objective as string, { assigned: 0, preserve: 0, utilization: 0, conflicts: 0 }),
  assignedCount: n(row, 'assigned_count'),
  unassignedCount: n(row, 'unassigned_count'),
  durationMs: n(row, 'duration_ms'),
  proposal: s(row, 'proposal'),
  createdBy: sn(row, 'created_by'),
  createdByName: s(row, 'created_by_name'),
  createdAt: s(row, 'created_at'),
})

export const approvalFromRow = (row: Row): Approval => ({
  id: s(row, 'id'),
  scheduleId: s(row, 'schedule_id'),
  status: s(row, 'status') as Approval['status'],
  requestedByName: s(row, 'requested_by_name'),
  decidedByName: sn(row, 'decided_by_name'),
  decidedAt: sn(row, 'decided_at'),
  reason: s(row, 'reason'),
  createdAt: s(row, 'created_at'),
})

export const auditFromRow = (row: Row): AuditEvent => ({
  id: s(row, 'id'),
  actorId: sn(row, 'actor_id'),
  actorName: s(row, 'actor_name'),
  action: s(row, 'action'),
  entityType: s(row, 'entity_type'),
  entityId: sn(row, 'entity_id'),
  summary: s(row, 'summary'),
  details: s(row, 'details'),
  createdAt: s(row, 'created_at'),
})

export const securityFromRow = (row: Row): SecurityEvent => ({
  id: s(row, 'id'),
  userId: sn(row, 'user_id'),
  email: s(row, 'email'),
  type: s(row, 'type'),
  severity: s(row, 'severity') as SecurityEvent['severity'],
  message: s(row, 'message'),
  ip: s(row, 'ip'),
  createdAt: s(row, 'created_at'),
})
