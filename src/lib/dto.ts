// Response shapes for console endpoints.
import type {
  Aircraft,
  Approval,
  Assignment,
  AuditEvent,
  CrewMember,
  MaintenanceRecord,
  OperationalTask,
  OptimizationRun,
  Schedule,
  SecurityEvent,
} from '../shared/types'

export interface ListResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface TaskAssignment {
  aircraftId: string
  aircraft: string
  crewId: string | null
  crew: string | null
  start: string
  end: string
}

export interface TaskRow extends OperationalTask {
  assignment: TaskAssignment | null
}

export interface TaskDetailResponse {
  task: OperationalTask
  dependencies: { id: string; code: string; title: string; state: string; windowEnd: string }[]
  dependents: { id: string; code: string; title: string; state: string }[]
  assignment: { id: string; aircraft: string; aircraftType: string; crew: string | null; start: string; end: string } | null
  history: AuditEvent[]
  allowedTransitions: string[]
}

export interface AttentionItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  action?: { label: string; to: string }
}

export interface TimelineBar {
  id: string
  label: string
  start: string
  end: string
  state?: string
}

export interface TimelineRow {
  id: string
  label: string
  status: string
  bars: TimelineBar[]
}

export interface OverviewResponse {
  demoData: boolean
  generatedAt: string
  metrics: {
    serviceableAircraft: number
    restrictedAircraft: number
    totalAircraft: number
    availableCrew: number
    totalCrew: number
    activeTasks: number
    unassignedTasks: number
    maintenanceRestrictions: number
    scheduleStatus: string
    scheduleVersion: number | null
    pendingApprovals: number
    latestOptimization: { id: string; algorithm: string; createdAt: string; feasibility: string; assignedCount: number; unassignedCount: number } | null
  }
  readiness: {
    aircraft: { ready: number; restricted: number; unavailable: number }
    crew: { available: number; onDuty: number; unavailable: number }
    maintenance: number
  }
  attention: AttentionItem[]
  timeline: {
    from: string
    to: string
    aircraft: { id: string; registration: string; type: string; status: string; assignments: TimelineBar[] }[]
    unassigned: { id: string; code: string; title: string; windowStart: string; windowEnd: string; priority: string }[]
  }
}

export interface ScheduleAssignment extends Assignment {
  taskCode: string
  taskTitle: string
  aircraft: string
  crew: string | null
}

export interface ScheduleConflict {
  assignmentId: string
  taskId: string
  taskCode: string
  message: string
}

export interface ScheduleResponse {
  schedule: Schedule | null
  assignments: ScheduleAssignment[]
  unassigned: {
    id: string
    code: string
    title: string
    state: string
    priority: string
    windowStart: string
    windowEnd: string
    reason?: string
  }[]
  conflicts: ScheduleConflict[]
  resources?: {
    aircraft: { id: string; label: string; status: string }[]
    crew: { id: string; label: string; status: string; qualifications: string[] }[]
  }
  tasks?: { id: string; code: string; title: string; state: string; priority: string; windowStart: string; windowEnd: string; durationMinutes: number; dependencies: string[] }[]
}

export interface VersionRow extends Schedule {
  assignmentCount: number
}

export interface AircraftDetailResponse {
  aircraft: Aircraft
  maintenance: MaintenanceRecord[]
  assignments: (Assignment & { taskLabel: string })[]
  restrictions: { id: string; windowStart: string; windowEnd: string; restriction: string }[]
}

export interface CrewDetailResponse {
  crew: CrewMember
  assignments: (Assignment & { taskLabel: string })[]
  duty: { date: string; minutes: number; limit: number }[]
}

export interface MaintenanceResponse {
  items: (MaintenanceRecord & { aircraftLabel: string })[]
  aircraft: { id: string; label: string }[]
}

export interface ProposalAssignment {
  taskId: string
  code: string
  title: string
  aircraft: string
  crew: string
  start: string
  end: string
  explanation: string
}

export interface OptimizationProposal {
  algorithm: string
  ordering: string
  score: number
  objective: { assigned: number; preserve: number; utilization: number; conflicts: number }
  scoreFormula: string
  feasibility: string
  changedFromCurrent: number
  assigned: ProposalAssignment[]
  unassigned: { taskId: string; code: string; title: string; reason: string; detail: string }[]
  consideredCandidates: number
  utilization: number
  feasibilityNote: string
}

export interface RunSummary extends OptimizationRun {
  approval?: Approval | null
}

export interface ApprovalRow extends Approval {
  scheduleVersion: number | null
  scheduleStatus: string | null
  scheduleSource: string | null
}

export interface AnalyticsResponse {
  range: { from: string; to: string; days: number }
  definitions: Record<string, string>
  tasks: {
    total: number
    open: number
    assigned: number
    unassigned: number
    completed: number
    cancelled: number
    completionRate: number
    assignmentRate: number
    unassignedMinutes: number
  }
  utilization: { aircraft: number; crew: number; assignedMinutes: number; aircraftCount: number; crewCount: number }
  conflicts: { count: number; items: { assignmentId: string; taskId: string; message: string }[] }
  maintenance: { records: number; aircraftMinutes: number }
  byState: { state: string; count: number }[]
  byPriority: { priority: string; total: number; assigned: number }[]
  optimization: {
    runs: { id: string; algorithm: string; createdAt: string; assigned: number; unassigned: number; feasibility: string; durationMs: number }[]
    averageAssigned: number
    averageDurationMs: number
  }
  versions: { id: string; version: number; status: string; source: string; createdAt: string }[]
}

export interface SecurityResponse {
  stats: {
    failedLogins24h: number
    rateLimited24h: number
    activeSessions: number
    suspendedAccounts: number
    auditEvents: number
  }
  events: SecurityEvent[]
  alerts: SecurityEvent[]
  sessions: {
    id: string
    userId: string
    name: string
    email: string
    role: string
    createdAt: string
    expiresAt: string
    lastSeenAt: string
    ip: string
    userAgent: string
    revoked: boolean
    current: boolean
  }[]
  suspended: { id: string; name: string; email: string; suspendedAt: string }[]
  roles: { role: string; count: number }[]
  controls: { control: string; status: string; detail: string }[]
}

export interface UserRow {
  id: string
  email: string
  name: string
  role: string
  status: string
  createdAt: string
  lastLoginAt: string | null
  suspendedAt: string | null
  activeSessions: number
}

export interface AuditResponse {
  items: AuditEvent[]
  entityTypes: string[]
}

export interface SettingsResponse {
  settings: Record<string, string>
  demoData: boolean
  seededAt: string | null
  environment: string
}

export interface MetaResponse {
  aircraftCapabilities: string[]
  crewQualifications: string[]
  roles: { value: string; label: string }[]
  priorities: string[]
  taskStates: string[]
  aircraftStatuses: string[]
  crewStatuses: string[]
}

export interface SessionListResponse {
  items: {
    id: string
    createdAt: string
    expiresAt: string
    lastSeenAt: string
    ip: string
    userAgent: string
    revoked: boolean
    current: boolean
  }[]
}
