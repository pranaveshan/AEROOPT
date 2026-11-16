// Domain types shared by the Worker, the console and the tests.

export type Role = 'admin' | 'ops_manager' | 'dispatcher' | 'maintenance_officer' | 'crew_coordinator' | 'viewer'

export type Priority = 'critical' | 'high' | 'normal' | 'low'

export type TaskState = 'draft' | 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'blocked'

export type AircraftStatus = 'serviceable' | 'restricted' | 'maintenance' | 'unserviceable'

export type CrewStatus = 'available' | 'on_duty' | 'rest' | 'leave' | 'unavailable'

export type MaintenanceStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

export type ScheduleStatus = 'draft' | 'proposed' | 'committed' | 'superseded' | 'rejected'

export type UserStatus = 'active' | 'suspended'

export interface Aircraft {
  id: string
  registration: string
  type: string
  category: string
  status: AircraftStatus
  base: string
  capacityKg: number
  flightHours: number
  capabilities: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Certification {
  name: string
  expiresAt: string
}

export interface CrewMember {
  id: string
  code: string
  name: string
  role: string
  base: string
  status: CrewStatus
  qualifications: string[]
  certifications: Certification[]
  availableFrom: string
  availableTo: string
  dutyLimitMinutes: number
  restMinutes: number
  createdAt: string
  updatedAt: string
}

export interface MaintenanceRecord {
  id: string
  aircraftId: string
  type: 'scheduled' | 'unscheduled' | 'inspection'
  status: MaintenanceStatus
  windowStart: string
  windowEnd: string
  description: string
  restriction: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OperationalTask {
  id: string
  code: string
  title: string
  description: string
  priority: Priority
  state: TaskState
  windowStart: string
  windowEnd: string
  durationMinutes: number
  payloadKg: number
  requiredCapabilities: string[]
  requiredQualifications: string[]
  site: string
  client: string
  dependencies: string[]
  createdAt: string
  updatedAt: string
}

export interface Assignment {
  id: string
  scheduleId: string
  taskId: string
  aircraftId: string
  crewId: string | null
  start: string
  end: string
  conflict: string | null
  createdAt: string
}

export interface Schedule {
  id: string
  version: number
  status: ScheduleStatus
  source: 'manual' | 'optimization'
  notes: string
  optimizationRunId: string | null
  createdBy: string | null
  createdByName: string
  createdAt: string
  decidedAt: string | null
  decidedByName: string
}

export interface OptimizationObjective {
  assigned: number
  preserve: number
  utilization: number
  conflicts: number
}

export interface OptimizationRun {
  id: string
  algorithm: string
  scheduleId: string | null
  status: 'completed' | 'failed'
  feasibility: 'feasible' | 'partial' | 'infeasible'
  objective: OptimizationObjective
  assignedCount: number
  unassignedCount: number
  durationMs: number
  proposal: string
  createdBy: string | null
  createdByName: string
  createdAt: string
}

export interface Approval {
  id: string
  scheduleId: string
  status: 'pending' | 'approved' | 'rejected'
  requestedByName: string
  decidedByName: string | null
  decidedAt: string | null
  reason: string
  createdAt: string
}

export interface AuditEvent {
  id: string
  actorId: string | null
  actorName: string
  action: string
  entityType: string
  entityId: string | null
  summary: string
  details: string
  createdAt: string
}

export interface SecurityEvent {
  id: string
  userId: string | null
  email: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  ip: string
  createdAt: string
}

export interface SessionInfo {
  id: string
  userId: string
  email: string
  name: string
  role: Role
  createdAt: string
  expiresAt: string
  lastSeenAt: string
  ip: string
  userAgent: string
  current: boolean
}

export interface PublicUser {
  id: string
  email: string
  name: string
  role: Role
  status: UserStatus
  createdAt: string
  lastLoginAt: string | null
}

export interface EngineConfig {
  turnaroundMinutes: number
  crewGapMinutes: number
  horizonStart: string
  horizonEnd: string
  slotStepMinutes: number
}

export interface EngineInput {
  tasks: OperationalTask[]
  aircraft: Aircraft[]
  crew: CrewMember[]
  maintenance: MaintenanceRecord[]
  existing: Assignment[]
  config: EngineConfig
  now: string
}

export interface ProposedAssignment {
  taskId: string
  aircraftId: string
  crewId: string
  start: string
  end: string
}

export interface UnassignedTask {
  taskId: string
  code: string
  title: string
  reason: string
  detail: string
}

export interface PlanResult {
  assignments: ProposedAssignment[]
  unassigned: UnassignedTask[]
  utilization: number
  assignedMinutes: number
  consideredCandidates: number
  explanation: Record<string, string>
}

export type Ordering = 'priority' | 'window' | 'duration' | 'tightest'

export interface PlanOptions {
  ordering: Ordering
  preserveExisting: boolean
}
