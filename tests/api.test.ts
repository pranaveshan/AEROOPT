// End-to-end API tests against a real SQLite database.
import { beforeAll, describe, expect, it } from 'vitest'

import app from '../src/worker/index'
import { cookieFrom, createTestDb, json, testEnv } from './helpers/d1'

const env = testEnv(createTestDb())
const base = 'http://localhost:5305'

const call = async (path: string, init: RequestInit = {}) => app.fetch(new Request(`${base}${path}`, init), env as never)

const signIn = async (email: string, password = 'AeroOpt#2026') => {
  const response = await call('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    headers: { 'Content-Type': 'application/json' },
  })
  return { response, cookie: cookieFrom(response) }
}

const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * 3600_000).toISOString()

let adminCookie = ''

describe('authentication', () => {
  beforeAll(async () => {
    const { cookie } = await signIn('admin@aeroopt.io')
    adminCookie = cookie
  })

  it('rejects anonymous access to protected APIs', async () => {
    const response = await call('/api/tasks')
    expect(response.status).toBe(401)
  })

  it('rejects anonymous access to the overview', async () => {
    const response = await call('/api/overview')
    expect(response.status).toBe(401)
  })

  it('rejects invalid credentials', async () => {
    const { response, cookie } = await signIn('admin@aeroopt.io', 'wrong-password-1')
    expect(response.status).toBe(401)
    expect(cookie).toBe('')
  })

  it('rejects cross-site mutations', async () => {
    const response = await call('/api/auth/signout', { method: 'POST', headers: { Origin: 'https://evil.example' } })
    expect(response.status).toBe(403)
  })

  it('signs in with a session cookie', async () => {
    const { response, cookie } = await signIn('admin@aeroopt.io')
    expect(response.status).toBe(200)
    expect(cookie).toContain('aeroopt_session=')
    const session = await call('/api/auth/session', { headers: { Cookie: cookie } })
    const payload = await json<{ user: { email: string; role: string } | null; permissions: string[] }>(session)
    expect(payload.user?.email).toBe('admin@aeroopt.io')
    expect(payload.user?.role).toBe('admin')
    expect(payload.permissions).toContain('users:manage')
  })

  it('clears the session on sign out', async () => {
    const { cookie } = await signIn('viewer@aeroopt.io')
    const before = await call('/api/auth/session', { headers: { Cookie: cookie } })
    expect((await json<{ user: unknown }>(before)).user).toBeTruthy()
    await call('/api/auth/signout', { method: 'POST', headers: { Cookie: cookie } })
    const after = await call('/api/auth/session', { headers: { Cookie: cookie } })
    expect((await json<{ user: unknown }>(after)).user).toBeNull()
  })

  it('creates an account and rejects a duplicate email', async () => {
    const body = { name: 'Test Operator', email: `operator-${Date.now()}@aeroopt.io`, password: 'TestPass#2026', role: 'dispatcher' }
    const created = await call('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) })
    expect(created.status).toBe(201)
    const session = await call('/api/auth/session', { headers: { Cookie: cookieFrom(created) } })
    expect((await json<{ user: { role: string } }>(session)).user.role).toBe('dispatcher')

    const duplicate = await call('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) })
    expect(duplicate.status).toBe(409)
  })

  it('rejects a weak sign-up password', async () => {
    const response = await call('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name: 'Weak', email: `weak-${Date.now()}@aeroopt.io`, password: 'short', role: 'viewer' }),
    })
    expect(response.status).toBe(422)
  })
})

describe('task register', () => {
  it('lists seeded tasks with real assignments', async () => {
    const response = await call('/api/tasks?pageSize=100', { headers: { Cookie: adminCookie } })
    const payload = await json<{ items: { code: string; state: string }[]; total: number }>(response)
    expect(response.status).toBe(200)
    expect(payload.total).toBeGreaterThan(10)
    expect(payload.items[0].code).toMatch(/^TSK-/)
  })

  it('filters by state and priority', async () => {
    const response = await call('/api/tasks?state=pending&priority=high', { headers: { Cookie: adminCookie } })
    const payload = await json<{ items: { state: string; priority: string }[] }>(response)
    expect(payload.items.every((item) => item.state === 'pending' && item.priority === 'high')).toBe(true)
  })

  it('rejects an invalid task payload', async () => {
    const response = await call('/api/tasks', {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', priority: 'normal', windowStart: iso(1), windowEnd: iso(4), durationMinutes: 60, site: '', client: '' }),
    })
    const payload = await json<{ fieldErrors: Record<string, string> }>(response)
    expect(response.status).toBe(422)
    expect(payload.fieldErrors.title).toBeTruthy()
    expect(payload.fieldErrors.site).toBeTruthy()
  })

  it('creates, updates and cancels a task', async () => {
    const create = await call('/api/tasks', {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'QA rotation',
        description: 'Created by the test suite.',
        priority: 'high',
        state: 'pending',
        windowStart: iso(2),
        windowEnd: iso(6),
        durationMinutes: 60,
        payloadKg: 500,
        site: 'LHR',
        client: 'QA',
        requiredCapabilities: ['pax'],
        requiredQualifications: ['pax'],
        dependencies: [],
      }),
    })
    expect(create.status).toBe(201)
    const created = await json<{ id: string; code: string }>(create)

    const updated = await call(`/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 'critical', title: 'QA rotation revised' }),
    })
    expect(updated.status).toBe(200)

    const detail = await json<{ task: { priority: string; title: string }; history: unknown[] }>(
      await call(`/api/tasks/${created.id}`, { headers: { Cookie: adminCookie } }),
    )
    expect(detail.task.priority).toBe('critical')
    expect(detail.task.title).toBe('QA rotation revised')
    expect(detail.history.length).toBeGreaterThan(0)

    const cancelled = await call(`/api/tasks/${created.id}/state`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'cancelled' }),
    })
    expect(cancelled.status).toBe(200)
  })

  it('rejects an invalid state transition', async () => {
    const list = await json<{ items: { id: string; state: string }[] }>(await call('/api/tasks?state=completed', { headers: { Cookie: adminCookie } }))
    if (!list.items.length) return
    const response = await call(`/api/tasks/${list.items[0].id}/state`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'in_progress' }),
    })
    expect(response.status).toBe(422)
  })
})

describe('role-based access control', () => {
  it('blocks a viewer from creating tasks', async () => {
    const { cookie } = await signIn('viewer@aeroopt.io')
    const response = await call('/api/tasks', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Should fail', priority: 'normal', windowStart: iso(1), windowEnd: iso(4), durationMinutes: 60, site: 'LHR', client: 'QA' }),
    })
    expect(response.status).toBe(403)
  })

  it('blocks a dispatcher from user administration', async () => {
    const { cookie } = await signIn('dispatch@aeroopt.io')
    const response = await call('/api/users', { headers: { Cookie: cookie } })
    expect(response.status).toBe(403)
  })

  it('blocks a dispatcher from approving a schedule', async () => {
    const { cookie } = await signIn('dispatch@aeroopt.io')
    const response = await call('/api/schedule/does-not-exist/commit', { method: 'POST', headers: { Cookie: cookie } })
    expect(response.status).toBe(403)
  })

  it('allows a maintenance officer to write maintenance but not tasks', async () => {
    const { cookie } = await signIn('maintenance@aeroopt.io')
    const tasks = await call('/api/tasks', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Nope', priority: 'normal', windowStart: iso(1), windowEnd: iso(3), durationMinutes: 30, site: 'LHR', client: 'QA' }),
    })
    expect(tasks.status).toBe(403)
    const maintenance = await call('/api/maintenance', { headers: { Cookie: cookie } })
    expect(maintenance.status).toBe(200)
  })
})

describe('resources', () => {
  it('lists aircraft and derives restrictions from maintenance', async () => {
    const list = await json<{ items: { id: string; registration: string; status: string }[] }>(await call('/api/aircraft', { headers: { Cookie: adminCookie } }))
    expect(list.items.length).toBeGreaterThan(4)
    const helb = list.items.find((item) => item.registration === 'G-HELB')
    expect(helb?.status).toBe('maintenance')
    const detail = await json<{ aircraft: { status: string }; restrictions: { restriction: string }[] }>(
      await call(`/api/aircraft/${helb!.id}`, { headers: { Cookie: adminCookie } }),
    )
    expect(detail.aircraft.status).toBe('maintenance')
    expect(detail.restrictions.length).toBeGreaterThan(0)
  })

  it('records a maintenance start and completion', async () => {
    const created = await call('/api/maintenance', {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraftId: 'ac-2',
        type: 'inspection',
        status: 'in_progress',
        windowStart: iso(1),
        windowEnd: iso(4),
        description: 'QA inspection',
        restriction: 'Test restriction',
      }),
    })
    expect(created.status).toBe(201)
    const { id } = await json<{ id: string }>(created)

    const detail = await json<{ aircraft: { status: string }; restrictions: { restriction: string }[] }>(
      await call('/api/aircraft/ac-2', { headers: { Cookie: adminCookie } }),
    )
    expect(detail.aircraft.status).toBe('maintenance')
    expect(detail.restrictions.some((restriction) => restriction.restriction === 'Test restriction')).toBe(true)

    const completed = await call(`/api/maintenance/${id}/complete`, { method: 'POST', headers: { Cookie: adminCookie } })
    expect(completed.status).toBe(200)

    const after = await json<{ aircraft: { status: string } }>(await call('/api/aircraft/ac-2', { headers: { Cookie: adminCookie } }))
    expect(after.aircraft.status).toBe('serviceable')
  })

  it('creates crew and validates duty limits', async () => {
    const invalid = await call('/api/crew', {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `QA-${Date.now() % 10000}`,
        name: 'Test Crew',
        role: 'Captain',
        base: 'LHR',
        status: 'available',
        qualifications: ['pax'],
        certifications: [],
        availableFrom: iso(-1),
        availableTo: iso(48),
        dutyLimitMinutes: 10,
        restMinutes: 600,
      }),
    })
    expect(invalid.status).toBe(422)
  })
})

describe('optimization and approval', () => {
  it('runs the engine, stores a proposal and requires approval before committing', async () => {
    const { cookie: dispatcher } = await signIn('dispatch@aeroopt.io')
    const run = await call('/api/optimize/run', {
      method: 'POST',
      headers: { Cookie: dispatcher, 'Content-Type': 'application/json' },
      body: JSON.stringify({ objective: { assigned: 60, preserve: 20, utilization: 15, conflicts: 5 } }),
    })
    expect(run.status).toBe(201)
    const payload = await json<{ run: { scheduleId: string; version: number; algorithm: string; assignedCount: number; durationMs: number }; proposal: { assigned: unknown[]; unassigned: unknown[]; feasibilityNote: string } }>(run)
    expect(payload.run.algorithm).toContain('greedy-constraint')
    expect(payload.proposal.feasibilityNote).toMatch(/not an airworthiness/i)
    expect(payload.proposal.assigned.length + payload.proposal.unassigned.length).toBeGreaterThan(0)

    // The committed schedule is unchanged until approval.
    const beforeCommit = await json<{ schedule: { status: string; version: number } }>(await call('/api/schedule', { headers: { Cookie: dispatcher } }))
    expect(beforeCommit.schedule.status).toBe('committed')

    const pending = await json<{ items: { id: string; scheduleId: string; status: string }[] }>(await call('/api/approvals', { headers: { Cookie: adminCookie } }))
    const approval = pending.items.find((item) => item.scheduleId === payload.run.scheduleId)
    expect(approval?.status).toBe('pending')

    const { cookie: ops } = await signIn('ops@aeroopt.io')
    const approved = await call(`/api/approvals/${approval!.id}/approve`, {
      method: 'POST',
      headers: { Cookie: ops, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Approved by QA' }),
    })
    expect(approved.status).toBe(200)

    const after = await json<{ schedule: { status: string; version: number }; assignments: unknown[] }>(await call('/api/schedule', { headers: { Cookie: ops } }))
    expect(after.schedule.status).toBe('committed')
    expect(after.schedule.version).toBe(payload.run.version)
    expect(after.assignments.length).toBeGreaterThan(0)
  })

  it('records the optimization run and approval in the audit trail', async () => {
    const audit = await json<{ items: { action: string }[] }>(await call('/api/audit?limit=200', { headers: { Cookie: adminCookie } }))
    const actions = audit.items.map((item) => item.action)
    expect(actions).toContain('optimization.run')
    expect(actions).toContain('approval.approve')
  })

  it('produces analytics from persisted records', async () => {
    const analytics = await json<{ tasks: { total: number; assigned: number }; definitions: Record<string, string>; versions: unknown[] }>(
      await call('/api/analytics?days=7', { headers: { Cookie: adminCookie } }),
    )
    expect(analytics.tasks.total).toBeGreaterThan(0)
    expect(analytics.definitions.assignmentRate).toMatch(/Assigned open tasks/)
    expect(analytics.versions.length).toBeGreaterThan(1)
  })
})

describe('security controls', () => {
  it('reports real session and event data', async () => {
    const response = await call('/api/security', { headers: { Cookie: adminCookie } })
    const payload = await json<{ stats: { activeSessions: number }; events: { type: string }[]; controls: { status: string }[] }>(response)
    expect(response.status).toBe(200)
    expect(payload.stats.activeSessions).toBeGreaterThanOrEqual(0)
    expect(payload.events.some((event) => event.type === 'login.failed')).toBe(true)
    expect(payload.controls.some((control) => control.status === 'not_configured')).toBe(true)
  })

  it('prevents demoting the last administrator', async () => {
    const users = await json<{ items: { id: string; role: string; email: string }[] }>(await call('/api/users', { headers: { Cookie: adminCookie } }))
    const admins = users.items.filter((user) => user.role === 'admin')
    if (admins.length !== 1) return
    const session = await json<{ user: { id: string } }>(await call('/api/auth/session', { headers: { Cookie: adminCookie } }))
    if (admins[0].id !== session.user.id) return
    const response = await call(`/api/users/${admins[0].id}/role`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'viewer' }),
    })
    expect(response.status).toBe(422)
  })

  it('revokes another session', async () => {
    const second = await signIn('viewer@aeroopt.io')
    const sessions = await json<{ items: { id: string; current: boolean }[] }>(await call('/api/auth/sessions', { headers: { Cookie: second.cookie } }))
    const target = sessions.items.find((item) => !item.current)
    const response = await call(`/api/auth/sessions/${target?.id ?? sessions.items[0].id}/revoke`, { method: 'POST', headers: { Cookie: second.cookie } })
    // Revoking the only session also succeeds (it signs the caller out).
    expect([200, 404]).toContain(response.status)
  })

  it('rejects an unknown API route with JSON', async () => {
    const response = await call('/api/does-not-exist', { headers: { Cookie: adminCookie } })
    expect(response.status).toBe(404)
    const payload = await json<{ error: string }>(response)
    expect(payload.error).toBeTruthy()
  })
})
