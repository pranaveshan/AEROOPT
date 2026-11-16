// Constraint evaluation, scheduling and optimization.
//
// Everything here is pure: it takes the operational data set, evaluates
// feasibility and returns a plan. The Worker persists the result; the tests
// exercise it directly. All times are UTC epoch milliseconds internally and
// ISO-8601 UTC strings at the boundary.
import type {
  Aircraft,
  CrewMember,
  EngineInput,
  MaintenanceRecord,
  OperationalTask,
  Ordering,
  PlanOptions,
  PlanResult,
  ProposedAssignment,
  UnassignedTask,
} from './types'

export const MINUTE = 60_000
export const DEFAULT_CONFIG = { turnaroundMinutes: 30, crewGapMinutes: 20, slotStepMinutes: 30 }

const ms = (iso: string) => Date.parse(iso)
const iso = (value: number) => new Date(value).toISOString()
const dayKey = (value: number) => new Date(value).toISOString().slice(0, 10)

const PRIORITY_WEIGHT: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 }

/** Qualification/certification names are case-insensitive in comparison. */
const hasAll = (have: string[], need: string[]) => {
  if (!need.length) return true
  const set = new Set(have.map((v) => v.toLowerCase()))
  return need.every((v) => set.has(v.toLowerCase()))
}

export interface Violation {
  code: string
  message: string
}

function blockedByMaintenance(aircraft: Aircraft, maintenance: MaintenanceRecord[], start: number, end: number): MaintenanceRecord | null {
  return (
    maintenance.find(
      (m) =>
        m.aircraftId === aircraft.id &&
        m.status !== 'cancelled' &&
        m.status !== 'completed' &&
        ms(m.windowStart) < end &&
        ms(m.windowEnd) > start,
    ) ?? null
  )
}

function aircraftConflicts(
  aircraft: Aircraft,
  candidate: { start: number; end: number },
  others: { aircraftId: string; start: string; end: string }[],
  turnaround: number,
): string | null {
  for (const other of others) {
    if (other.aircraftId !== aircraft.id) continue
    const s = ms(other.start)
    const e = ms(other.end)
    if (candidate.start < e + turnaround * MINUTE && candidate.end + turnaround * MINUTE > s) {
      return 'aircraft busy'
    }
  }
  return null
}

function crewConflicts(
  crew: CrewMember,
  candidate: { start: number; end: number },
  others: { crewId: string | null; start: string; end: string }[],
  gap: number,
): string | null {
  for (const other of others) {
    if (other.crewId !== crew.id) continue
    const s = ms(other.start)
    const e = ms(other.end)
    if (candidate.start < e + gap * MINUTE && candidate.end + gap * MINUTE > s) return 'crew busy'
  }
  return null
}

function dutyExceeded(
  crew: CrewMember,
  candidate: { start: number; end: number },
  others: { crewId: string | null; start: string; end: string }[],
): boolean {
  const day = dayKey(candidate.start)
  const minutes = others
    .filter((o) => o.crewId === crew.id && dayKey(ms(o.start)) === day)
    .reduce((sum, o) => sum + (ms(o.end) - ms(o.start)) / MINUTE, 0)
  return minutes + (candidate.end - candidate.start) / MINUTE > crew.dutyLimitMinutes
}

export interface PlacementContext {
  aircraft: Aircraft[]
  crew: CrewMember[]
  maintenance: MaintenanceRecord[]
  tasks: Map<string, OperationalTask>
  /** Assignments already fixed (committed schedule or earlier picks in a plan). */
  fixed: ProposedAssignment[]
  config: { turnaroundMinutes: number; crewGapMinutes: number }
  /** Task ids assigned inside the plan under construction, for dependency checks. */
  planEnds: Map<string, number>
  now: number
}

/** Every constraint that decides whether one aircraft/crew pair can fly a task at a time. */
export function evaluatePlacement(
  ctx: PlacementContext,
  task: OperationalTask,
  aircraft: Aircraft,
  crew: CrewMember,
  start: number,
  end: number,
): Violation[] {
  const out: Violation[] = []
  const windowStart = ms(task.windowStart)
  const windowEnd = ms(task.windowEnd)

  if (start < windowStart || end > windowEnd) out.push({ code: 'window', message: 'outside the task window' })
  if (end <= start) out.push({ code: 'duration', message: 'invalid duration' })

  if (aircraft.status !== 'serviceable' && aircraft.status !== 'restricted') {
    out.push({ code: 'aircraft-status', message: `${aircraft.registration} is ${aircraft.status}` })
  }
  const maintenance = blockedByMaintenance(aircraft, ctx.maintenance, start, end)
  if (maintenance) out.push({ code: 'maintenance', message: `${aircraft.registration} in maintenance window` })

  if (!hasAll(aircraft.capabilities, task.requiredCapabilities)) {
    out.push({ code: 'capability', message: `${aircraft.registration} lacks required capability` })
  }
  if (aircraft.capacityKg < task.payloadKg) {
    out.push({ code: 'capacity', message: `${aircraft.registration} below ${task.payloadKg} kg payload` })
  }

  if (crew.status !== 'available' && crew.status !== 'on_duty') {
    out.push({ code: 'crew-status', message: `${crew.name} is ${crew.status}` })
  }
  if (start < ms(crew.availableFrom) || end > ms(crew.availableTo)) {
    out.push({ code: 'crew-availability', message: `${crew.name} outside availability` })
  }
  if (!hasAll(crew.qualifications, task.requiredQualifications)) {
    out.push({ code: 'qualification', message: `${crew.name} missing qualification` })
  }
  for (const cert of crew.certifications) {
    if (ms(cert.expiresAt) < start) out.push({ code: 'certification', message: `${cert.name} expires before departure` })
  }

  const fixed = ctx.fixed
  const aircraftBusy = aircraftConflicts(aircraft, { start, end }, fixed, ctx.config.turnaroundMinutes)
  if (aircraftBusy) out.push({ code: 'aircraft-conflict', message: `${aircraft.registration} already assigned` })

  const crewBusy = crewConflicts(crew, { start, end }, fixed, ctx.config.crewGapMinutes)
  if (crewBusy) out.push({ code: 'crew-conflict', message: `${crew.name} already assigned` })

  if (dutyExceeded(crew, { start, end }, fixed)) {
    out.push({ code: 'duty-limit', message: `${crew.name} exceeds ${Math.round(crew.dutyLimitMinutes / 60)} h duty limit` })
  }

  for (const depId of task.dependencies) {
    const dep = ctx.tasks.get(depId)
    if (!dep) {
      out.push({ code: 'dependency', message: 'dependency missing from the register' })
      continue
    }
    if (dep.state === 'cancelled') out.push({ code: 'dependency', message: `${dep.code} was cancelled` })
    const plannedEnd = ctx.planEnds.get(depId)
    const fixedDep = fixed.find((a) => a.taskId === depId)
    const depEnd = plannedEnd ?? (fixedDep ? ms(fixedDep.end) : undefined)
    if (dep.state === 'completed') continue
    if (depEnd === undefined) out.push({ code: 'dependency', message: `${dep.code} not scheduled` })
    else if (depEnd > start) out.push({ code: 'dependency', message: `${dep.code} finishes after departure` })
  }

  return out
}

function candidateCrews(task: OperationalTask, crew: CrewMember[]): CrewMember[] {
  return crew.filter(
    (c) =>
      (c.status === 'available' || c.status === 'on_duty') &&
      hasAll(c.qualifications, task.requiredQualifications) &&
      task.requiredQualifications.length <= c.qualifications.length,
  )
}

function candidateAircraft(task: OperationalTask, aircraft: Aircraft[]): Aircraft[] {
  return aircraft.filter(
    (a) =>
      (a.status === 'serviceable' || a.status === 'restricted') &&
      a.capacityKg >= task.payloadKg &&
      hasAll(a.capabilities, task.requiredCapabilities),
  )
}

const ORDERINGS: Record<Ordering, (a: OperationalTask, b: OperationalTask) => number> = {
  priority: (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || ms(a.windowStart) - ms(b.windowStart),
  window: (a, b) => ms(a.windowStart) - ms(b.windowStart),
  duration: (a, b) => b.durationMinutes - a.durationMinutes,
  tightest: (a, b) =>
    ms(a.windowEnd) - ms(a.windowStart) - a.durationMinutes * MINUTE - (ms(b.windowEnd) - ms(b.windowStart) - b.durationMinutes * MINUTE),
}

/** Dependency-first topological order, priority as the tie-break. */
export function orderTasks(tasks: OperationalTask[], ordering: Ordering): OperationalTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const pending = new Set(tasks.map((t) => t.id))
  const done = new Set<string>()
  const out: OperationalTask[] = []
  const compare = ORDERINGS[ordering]

  while (pending.size) {
    const ready = [...pending]
      .map((id) => byId.get(id)!)
      .filter((t) => t.dependencies.filter((d) => byId.has(d)).every((d) => done.has(d)))
    // A dependency cycle leaves nothing ready; emit the rest in plain order.
    const pick = (ready.length ? ready : [...pending].map((id) => byId.get(id)!)).sort(compare)[0]
    out.push(pick)
    done.add(pick.id)
    pending.delete(pick.id)
  }
  return out
}

const schedulable = (t: OperationalTask) => t.state !== 'completed' && t.state !== 'cancelled'

export function planSchedule(input: EngineInput, options: PlanOptions): PlanResult {
  const config = {
    turnaroundMinutes: input.config.turnaroundMinutes,
    crewGapMinutes: input.config.crewGapMinutes,
  }
  const step = Math.max(5, input.config.slotStepMinutes) * MINUTE
  const horizonStart = ms(input.config.horizonStart)
  const horizonEnd = ms(input.config.horizonEnd)
  const tasks = input.tasks.filter(schedulable)
  const byId = new Map(tasks.map((t) => [t.id, t]))

  const fixed: ProposedAssignment[] = options.preserveExisting
    ? input.existing.map((a) => ({ taskId: a.taskId, aircraftId: a.aircraftId, crewId: a.crewId ?? '', start: a.start, end: a.end }))
    : []

  const ctx: PlacementContext = {
    aircraft: input.aircraft,
    crew: input.crew,
    maintenance: input.maintenance,
    tasks: byId,
    fixed,
    config,
    planEnds: new Map(),
    now: ms(input.now),
  }

  // Time already committed for preserved assignments still counts.
  const usedCrew = new Map<string, number>()
  for (const f of fixed) usedCrew.set(f.crewId, (usedCrew.get(f.crewId) ?? 0) + (ms(f.end) - ms(f.start)) / MINUTE)

  const assignments: ProposedAssignment[] = []
  const unassigned: UnassignedTask[] = []
  const explanation: Record<string, string> = {}
  let considered = 0
  let assignedMinutes = 0

  for (const task of orderTasks(tasks, options.ordering)) {
    // Preserving an existing assignment means keeping its aircraft, crew and
    // start time, but only when it still satisfies every constraint.
    if (options.preserveExisting) {
      const kept = fixed.find((f) => f.taskId === task.id)
      const keptAircraft = kept ? input.aircraft.find((a) => a.id === kept.aircraftId) : undefined
      const keptCrew = kept ? input.crew.find((c) => c.id === kept.crewId) : undefined
      if (kept && keptAircraft && keptCrew) {
        const others = fixed.filter((candidate) => candidate !== kept)
        const violations = evaluatePlacement(
          { ...ctx, fixed: others },
          task,
          keptAircraft,
          keptCrew,
          ms(kept.start),
          ms(kept.end),
        )
        if (!violations.length) {
          assignments.push(kept)
          ctx.fixed.push(kept)
          ctx.planEnds.set(task.id, ms(kept.end))
          usedCrew.set(kept.crewId, (usedCrew.get(kept.crewId) ?? 0) + task.durationMinutes)
          assignedMinutes += task.durationMinutes
          explanation[task.id] = 'Kept the existing assignment'
          continue
        }
      }
    }
    const duration = task.durationMinutes * MINUTE
    const from = Math.max(ms(task.windowStart), horizonStart, ms(input.now))
    const to = Math.min(ms(task.windowEnd), horizonEnd) - duration

    const aircraftPool = candidateAircraft(task, input.aircraft)
    const crewPool = candidateCrews(task, input.crew).sort(
      (a, b) => (usedCrew.get(a.id) ?? 0) - (usedCrew.get(b.id) ?? 0) || a.name.localeCompare(b.name),
    )

    let placed: ProposedAssignment | null = null
    let firstFailure = ''
    const tried = new Map<string, number>()

    if (from <= to && aircraftPool.length && crewPool.length) {
      outer: for (let start = from; start <= to; start += step) {
        const end = start + duration
        for (const aircraft of aircraftPool) {
          for (const crew of crewPool) {
            considered += 1
            const violations = evaluatePlacement(ctx, task, aircraft, crew, start, end)
            if (!violations.length) {
              placed = { taskId: task.id, aircraftId: aircraft.id, crewId: crew.id, start: iso(start), end: iso(end) }
              break outer
            }
            for (const v of violations) tried.set(v.message, (tried.get(v.message) ?? 0) + 1)
            if (!firstFailure) firstFailure = violations[0].message
          }
        }
      }
    }

    if (placed) {
      assignments.push(placed)
      ctx.fixed.push(placed)
      ctx.planEnds.set(task.id, ms(placed.end))
      usedCrew.set(placed.crewId, (usedCrew.get(placed.crewId) ?? 0) + task.durationMinutes)
      assignedMinutes += task.durationMinutes
      if (!explanation[task.id]) explanation[task.id] = 'Earliest feasible slot for its window'
    } else {
      const ranked = [...tried.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m)
      const reason =
        !aircraftPool.length
          ? 'No aircraft satisfies the capability and payload requirements'
          : !crewPool.length
            ? 'No available crew holds the required qualifications'
            : from > to
              ? 'Window is too short for the task duration'
              : 'Every feasible slot conflicts with a constraint'
      unassigned.push({
        taskId: task.id,
        code: task.code,
        title: task.title,
        reason,
        detail: ranked.length ? `Blocked by: ${ranked.join('; ')}` : firstFailure || 'No candidate slot in horizon',
      })
      explanation[task.id] = reason
    }
  }

  const horizonMinutes = Math.max(1, (horizonEnd - horizonStart) / MINUTE)
  const utilization = input.aircraft.length ? assignedMinutes / (horizonMinutes * input.aircraft.length) : 0

  return { assignments, unassigned, utilization, assignedMinutes, consideredCandidates: considered, explanation }
}

export interface OptimizationResult {
  plan: PlanResult
  ordering: Ordering
  algorithm: string
  score: number
  objective: { assigned: number; preserve: number; utilization: number; conflicts: number }
  feasibility: 'feasible' | 'partial' | 'infeasible'
  changedFromCurrent: number
}

/**
 * Weighted objective over the current data set.
 *
 * score = assigned·assignedShare + utilization·utilizationShare
 *       + preserve·preservedShare − conflicts·violationShare
 *
 * Weights are normalised shares (0–100) supplied by the operator.
 */
export function optimize(input: EngineInput, weights: { assigned: number; preserve: number; utilization: number; conflicts: number }): OptimizationResult {
  const orderings: Ordering[] = ['priority', 'tightest', 'duration', 'window']
  const currentKeys = new Set(
    input.existing.map((a) => `${a.taskId}:${a.aircraftId}:${a.crewId ?? ''}:${new Date(ms(a.start)).toISOString().slice(0, 16)}`),
  )
  const totalWeight = Math.max(1, weights.assigned + weights.preserve + weights.utilization + weights.conflicts)
  const tasks = input.tasks.filter(schedulable)

  let best: OptimizationResult | null = null

  for (const ordering of orderings) {
    for (const preserveExisting of [false, true]) {
      const plan = planSchedule(input, { ordering, preserveExisting })
      const assignedShare = tasks.length ? plan.assignments.length / tasks.length : 0
      const preserved = plan.assignments.filter((a) =>
        currentKeys.has(`${a.taskId}:${a.aircraftId}:${a.crewId}:${new Date(ms(a.start)).toISOString().slice(0, 16)}`),
      ).length
      const preservedShare = input.existing.length ? preserved / input.existing.length : assignedShare
      const utilization = plan.utilization
      const violationShare = 0 // the planner never emits a conflicting assignment
      const score =
        (weights.assigned * assignedShare + weights.utilization * utilization + weights.preserve * preservedShare - weights.conflicts * violationShare) /
        totalWeight
      const changed = plan.assignments.filter(
        (a) => !currentKeys.has(`${a.taskId}:${a.aircraftId}:${a.crewId}:${new Date(ms(a.start)).toISOString().slice(0, 16)}`),
      ).length
      const candidate: OptimizationResult = {
        plan,
        ordering,
        algorithm: `greedy-constraint/${ordering}${preserveExisting ? '+preserve' : ''}`,
        score,
        objective: weights,
        feasibility: plan.unassigned.length === 0 ? 'feasible' : plan.assignments.length ? 'partial' : 'infeasible',
        changedFromCurrent: changed,
      }
      if (!best || candidate.score > best.score) best = candidate
    }
  }

  return best!
}

/** Human-readable conflicts for an existing assignment set (schedule integrity). */
export function auditAssignments(input: EngineInput): { assignmentId: string; taskId: string; message: string }[] {
  const issues: { assignmentId: string; taskId: string; message: string }[] = []
  const byTask = new Map(input.tasks.map((t) => [t.id, t]))
  const fixed: ProposedAssignment[] = []

  for (const a of input.existing) {
    const task = byTask.get(a.taskId)
    const aircraft = input.aircraft.find((x) => x.id === a.aircraftId)
    const crew = input.crew.find((x) => x.id === a.crewId)
    if (!task || !aircraft) {
      issues.push({ assignmentId: a.id, taskId: a.taskId, message: 'Referenced record was removed' })
      continue
    }
    const start = ms(a.start)
    const end = ms(a.end)
    const messages: string[] = []

    if (start < ms(task.windowStart) || end > ms(task.windowEnd)) messages.push('Outside the task window')
    const maintenance = blockedByMaintenance(aircraft, input.maintenance, start, end)
    if (maintenance) messages.push('Overlaps a maintenance window')
    if (!hasAll(aircraft.capabilities, task.requiredCapabilities)) messages.push('Aircraft lacks a required capability')
    if (aircraft.capacityKg < task.payloadKg) messages.push('Aircraft payload below task requirement')
    if (crew) {
      if (!hasAll(crew.qualifications, task.requiredQualifications)) messages.push('Crew missing a required qualification')
      if (start < ms(crew.availableFrom) || end > ms(crew.availableTo)) messages.push('Crew outside availability')
      if (crew.status !== 'available' && crew.status !== 'on_duty') messages.push(`Crew is ${crew.status}`)
    }
    const ctx: PlacementContext = {
      aircraft: input.aircraft,
      crew: input.crew,
      maintenance: input.maintenance,
      tasks: byTask,
      fixed,
      config: { turnaroundMinutes: input.config.turnaroundMinutes, crewGapMinutes: input.config.crewGapMinutes },
      planEnds: new Map(),
      now: ms(input.now),
    }
    if (crew) {
      for (const v of evaluatePlacement(ctx, task, aircraft, crew, start, end)) {
        if (v.code === 'aircraft-conflict' || v.code === 'crew-conflict' || v.code === 'duty-limit' || v.code === 'maintenance' || v.code === 'dependency') {
          messages.push(v.message)
        }
      }
    }
    for (const message of [...new Set(messages)]) issues.push({ assignmentId: a.id, taskId: a.taskId, message })
    fixed.push({ taskId: a.taskId, aircraftId: a.aircraftId, crewId: a.crewId ?? '', start: a.start, end: a.end })
  }
  return issues
}
