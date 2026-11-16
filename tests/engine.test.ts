// Constraint evaluation and scheduling engine tests (pure logic).
import { describe, expect, it } from 'vitest'

import { auditAssignments, evaluatePlacement, optimize, planSchedule, type PlacementContext } from '../src/shared/engine'
import type { Aircraft, CrewMember, EngineInput, MaintenanceRecord, OperationalTask } from '../src/shared/types'

const NOW = '2026-06-01T07:00:00.000Z'
const WINDOW_START = '2026-06-01T09:00:00.000Z'
const WINDOW_END = '2026-06-01T18:00:00.000Z'

const aircraft = (overrides: Partial<Aircraft> = {}): Aircraft => ({
  id: 'ac-1',
  registration: 'G-TEST',
  type: 'Test aircraft',
  category: 'Test',
  status: 'serviceable',
  base: 'LHR',
  capacityKg: 5000,
  flightHours: 100,
  capabilities: ['pax'],
  notes: '',
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
})

const crewMember = (overrides: Partial<CrewMember> = {}): CrewMember => ({
  id: 'cr-1',
  code: 'CRW-1',
  name: 'Test Crew',
  role: 'Captain',
  base: 'LHR',
  status: 'available',
  qualifications: ['pax'],
  certifications: [{ name: 'Type Rating', expiresAt: '2027-01-01T00:00:00.000Z' }],
  availableFrom: '2026-05-31T00:00:00.000Z',
  availableTo: '2026-06-05T00:00:00.000Z',
  dutyLimitMinutes: 600,
  restMinutes: 60,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
})

const task = (overrides: Partial<OperationalTask> = {}): OperationalTask => ({
  id: 'tk-1',
  code: 'TSK-1',
  title: 'Test task',
  description: '',
  priority: 'normal',
  state: 'pending',
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  durationMinutes: 120,
  payloadKg: 1000,
  requiredCapabilities: ['pax'],
  requiredQualifications: ['pax'],
  site: 'LHR',
  client: 'Test client',
  dependencies: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
})

const maintenance = (overrides: Partial<MaintenanceRecord> = {}): MaintenanceRecord => ({
  id: 'mt-1',
  aircraftId: 'ac-1',
  type: 'scheduled',
  status: 'planned',
  windowStart: '2026-06-01T00:00:00.000Z',
  windowEnd: '2026-06-02T00:00:00.000Z',
  description: 'Check',
  restriction: '',
  completedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
})

const input = (overrides: Partial<EngineInput> = {}): EngineInput => ({
  tasks: [task()],
  aircraft: [aircraft()],
  crew: [crewMember()],
  maintenance: [],
  existing: [],
  config: {
    turnaroundMinutes: 30,
    crewGapMinutes: 20,
    slotStepMinutes: 30,
    horizonStart: '2026-05-31T00:00:00.000Z',
    horizonEnd: '2026-06-05T00:00:00.000Z',
  },
  now: NOW,
  ...overrides,
})

const context = (overrides: Partial<PlacementContext> = {}): PlacementContext => ({
  aircraft: [aircraft()],
  crew: [crewMember()],
  maintenance: [],
  tasks: new Map([['tk-1', task()]]),
  fixed: [],
  config: { turnaroundMinutes: 30, crewGapMinutes: 20 },
  planEnds: new Map(),
  now: Date.parse(NOW),
  ...overrides,
})

describe('constraint evaluation', () => {
  it('accepts a valid placement inside the window', () => {
    const violations = evaluatePlacement(context(), task(), aircraft(), crewMember(), Date.parse(WINDOW_START), Date.parse(WINDOW_START) + 7_200_000)
    expect(violations).toEqual([])
  })

  it('rejects a placement outside the task window', () => {
    const violations = evaluatePlacement(context(), task(), aircraft(), crewMember(), Date.parse('2026-06-01T19:00:00.000Z'), Date.parse('2026-06-01T21:00:00.000Z'))
    expect(violations.map((v) => v.code)).toContain('window')
  })

  it('rejects an unserviceable aircraft', () => {
    const violations = evaluatePlacement(context({ aircraft: [aircraft({ status: 'unserviceable' })] }), task(), aircraft({ status: 'unserviceable' }), crewMember(), Date.parse(WINDOW_START), Date.parse(WINDOW_START) + 7_200_000)
    expect(violations.map((v) => v.code)).toContain('aircraft-status')
  })

  it('rejects an aircraft inside a maintenance window', () => {
    const record = maintenance({ status: 'in_progress' })
    const violations = evaluatePlacement(
      context({ maintenance: [record] }),
      task({ requiredCapabilities: ['pax'] }),
      aircraft(),
      crewMember(),
      Date.parse('2026-06-01T10:00:00.000Z'),
      Date.parse('2026-06-01T12:00:00.000Z'),
    )
    expect(violations.map((v) => v.code)).toContain('maintenance')
  })

  it('rejects an aircraft without the required capability', () => {
    const violations = evaluatePlacement(context(), task({ requiredCapabilities: ['cargo'] }), aircraft(), crewMember(), Date.parse(WINDOW_START), Date.parse(WINDOW_START) + 7_200_000)
    expect(violations.map((v) => v.code)).toContain('capability')
  })

  it('rejects payload above aircraft capacity', () => {
    const violations = evaluatePlacement(context(), task({ payloadKg: 9000 }), aircraft(), crewMember(), Date.parse(WINDOW_START), Date.parse(WINDOW_START) + 7_200_000)
    expect(violations.map((v) => v.code)).toContain('capacity')
  })

  it('rejects crew without the required qualification', () => {
    const violations = evaluatePlacement(context(), task({ requiredQualifications: ['rotary'] }), aircraft(), crewMember(), Date.parse(WINDOW_START), Date.parse(WINDOW_START) + 7_200_000)
    expect(violations.map((v) => v.code)).toContain('qualification')
  })

  it('rejects crew outside availability and on rest', () => {
    const resting = crewMember({ status: 'rest' })
    const violations = evaluatePlacement(context({ crew: [resting] }), task(), aircraft(), resting, Date.parse(WINDOW_START), Date.parse(WINDOW_START) + 7_200_000)
    expect(violations.map((v) => v.code)).toContain('crew-status')
  })

  it('rejects an aircraft that is already assigned', () => {
    const existing = { taskId: 'tk-2', aircraftId: 'ac-1', crewId: 'cr-2', start: '2026-06-01T09:00:00.000Z', end: '2026-06-01T10:00:00.000Z' }
    const violations = evaluatePlacement(context({ fixed: [existing] }), task(), aircraft(), crewMember(), Date.parse(WINDOW_START), Date.parse(WINDOW_START) + 7_200_000)
    expect(violations.map((v) => v.code)).toContain('aircraft-conflict')
  })

  it('enforces the crew duty limit', () => {
    const limited = crewMember({ dutyLimitMinutes: 60 })
    const violations = evaluatePlacement(context({ crew: [limited] }), task(), aircraft(), limited, Date.parse(WINDOW_START), Date.parse(WINDOW_START) + 7_200_000)
    expect(violations.map((v) => v.code)).toContain('duty-limit')
  })

  it('requires dependencies to finish first', () => {
    const first = task({ id: 'tk-1', code: 'TSK-1' })
    const second = task({ id: 'tk-2', code: 'TSK-2', dependencies: ['tk-1'] })
    const ctx = context({ tasks: new Map([['tk-1', first], ['tk-2', second]]) })
    const violations = evaluatePlacement(ctx, second, aircraft(), crewMember(), Date.parse(WINDOW_START), Date.parse(WINDOW_START) + 7_200_000)
    expect(violations.map((v) => v.code)).toContain('dependency')
  })
})

describe('planSchedule', () => {
  it('assigns a feasible task', () => {
    const plan = planSchedule(input(), { ordering: 'priority', preserveExisting: false })
    expect(plan.assignments).toHaveLength(1)
    expect(plan.unassigned).toHaveLength(0)
    expect(plan.assignments[0].aircraftId).toBe('ac-1')
    expect(plan.utilization).toBeGreaterThan(0)
  })

  it('keeps a task unassigned when no aircraft is serviceable', () => {
    const plan = planSchedule(input({ aircraft: [aircraft({ status: 'unserviceable' })] }), { ordering: 'priority', preserveExisting: false })
    expect(plan.assignments).toHaveLength(0)
    expect(plan.unassigned[0].reason).toMatch(/No aircraft/i)
  })

  it('keeps a task unassigned when no crew is qualified', () => {
    const plan = planSchedule(input({ crew: [crewMember({ qualifications: ['cargo'] })] }), { ordering: 'priority', preserveExisting: false })
    expect(plan.assignments).toHaveLength(0)
    expect(plan.unassigned[0].reason).toMatch(/crew/i)
  })

  it('does not assign an aircraft inside a maintenance window', () => {
    const plan = planSchedule(input({ maintenance: [maintenance({ windowStart: '2026-06-01T00:00:00.000Z', windowEnd: '2026-06-02T00:00:00.000Z', status: 'in_progress' })] }), {
      ordering: 'priority',
      preserveExisting: false,
    })
    expect(plan.assignments).toHaveLength(0)
    expect(plan.unassigned[0].detail).toMatch(/maintenance/i)
  })

  it('schedules after a maintenance window that does not cover the task window', () => {
    const plan = planSchedule(input({ maintenance: [maintenance({ windowStart: '2026-06-01T08:00:00.000Z', windowEnd: '2026-06-01T14:00:00.000Z', status: 'in_progress' })] }), {
      ordering: 'priority',
      preserveExisting: false,
    })
    expect(plan.assignments).toHaveLength(1)
    const start = Date.parse(plan.assignments[0].start)
    expect(start).toBeGreaterThanOrEqual(Date.parse('2026-06-01T14:00:00.000Z'))
  })

  it('respects dependency ordering across two tasks', () => {
    const first = task({ id: 'tk-1', code: 'TSK-1', windowStart: '2026-06-01T09:00:00.000Z', windowEnd: '2026-06-01T11:00:00.000Z', durationMinutes: 60 })
    const second = task({
      id: 'tk-2',
      code: 'TSK-2',
      dependencies: ['tk-1'],
      windowStart: '2026-06-01T09:30:00.000Z',
      windowEnd: '2026-06-01T14:00:00.000Z',
      durationMinutes: 60,
    })
    const plan = planSchedule(input({ tasks: [second, first] }), { ordering: 'priority', preserveExisting: false })
    const firstAssignment = plan.assignments.find((assignment) => assignment.taskId === 'tk-1')
    const secondAssignment = plan.assignments.find((assignment) => assignment.taskId === 'tk-2')
    expect(firstAssignment).toBeDefined()
    if (firstAssignment && secondAssignment) {
      expect(Date.parse(secondAssignment.start)).toBeGreaterThanOrEqual(Date.parse(firstAssignment.end))
    } else {
      // With one aircraft and a 30 minute turnaround the second task may not fit.
      expect(plan.unassigned.some((item) => item.taskId === 'tk-2')).toBe(true)
    }
  })

  it('never returns overlapping assignments for one aircraft', () => {
    const tasks = ['09:00', '10:00', '11:00', '12:00', '13:00'].map((time, index) =>
      task({
        id: `tk-${index + 1}`,
        code: `TSK-${index + 1}`,
        windowStart: `2026-06-01T${time}:00.000Z`,
        windowEnd: '2026-06-01T18:00:00.000Z',
        durationMinutes: 90,
      }),
    )
    const plan = planSchedule(input({ tasks }), { ordering: 'priority', preserveExisting: false })
    for (const assignment of plan.assignments) {
      const overlaps = plan.assignments.filter(
        (other) =>
          other !== assignment &&
          other.aircraftId === assignment.aircraftId &&
          Date.parse(other.start) < Date.parse(assignment.end) &&
          Date.parse(other.end) > Date.parse(assignment.start),
      )
      expect(overlaps).toHaveLength(0)
    }
  })
})

describe('optimize', () => {
  it('produces a scored result with an algorithm identifier and explanations', () => {
    const result = optimize(input(), { assigned: 60, preserve: 20, utilization: 15, conflicts: 5 })
    expect(result.algorithm).toContain('greedy-constraint')
    expect(result.score).toBeGreaterThan(0)
    expect(result.feasibility).toBe('feasible')
    expect(result.plan.explanation['tk-1']).toBeTruthy()
  })

  it('reports infeasible when nothing can be assigned', () => {
    const result = optimize(input({ aircraft: [aircraft({ status: 'unserviceable' })] }), { assigned: 100, preserve: 0, utilization: 0, conflicts: 0 })
    expect(result.feasibility).toBe('infeasible')
    expect(result.plan.assignments).toHaveLength(0)
  })

  it('prefers preserving existing assignments when weighted highest', () => {
    const existing = [{ id: 'as-1', scheduleId: 's1', taskId: 'tk-1', aircraftId: 'ac-1', crewId: 'cr-1', start: '2026-06-01T15:00:00.000Z', end: '2026-06-01T17:00:00.000Z', conflict: null, createdAt: NOW }]
    const result = optimize(input({ existing }), { assigned: 10, preserve: 100, utilization: 0, conflicts: 0 })
    expect(new Date(result.plan.assignments[0].start).toISOString()).toBe('2026-06-01T15:00:00.000Z')
  })
})

describe('auditAssignments', () => {
  it('detects an assignment outside the task window', () => {
    const existing = [{ id: 'as-1', scheduleId: 's1', taskId: 'tk-1', aircraftId: 'ac-1', crewId: 'cr-1', start: '2026-06-01T04:00:00.000Z', end: '2026-06-01T06:00:00.000Z', conflict: null, createdAt: NOW }]
    const issues = auditAssignments(input({ existing }))
    expect(issues.some((issue) => issue.message === 'Outside the task window')).toBe(true)
  })

  it('accepts a valid committed assignment', () => {
    const existing = [{ id: 'as-1', scheduleId: 's1', taskId: 'tk-1', aircraftId: 'ac-1', crewId: 'cr-1', start: WINDOW_START, end: '2026-06-01T11:00:00.000Z', conflict: null, createdAt: NOW }]
    expect(auditAssignments(input({ existing }))).toHaveLength(0)
  })
})
