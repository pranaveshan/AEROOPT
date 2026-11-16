// System module: user administration, audit trail, security centre, settings.
import { Hono, type Context } from 'hono'

import { ROLES, ROLE_LABEL } from '../../shared/permissions'
import type { Role } from '../../shared/types'
import { validateEmail, validateSignUp } from '../../shared/validation'
import { logAudit, logSecurity, requirePermission, clientIp } from '../auth'
import { hashPassword, randomId } from '../crypto'
import { all, first, run } from '../db'
import type { AppEnv } from '../env'
import { auditFromRow, securityFromRow } from '../serialize'

export const systemRoutes = new Hono<AppEnv>()

const PUBLIC_COLUMNS = `id, email, name, role, status, created_at, last_login_at, suspended_at`

/* ----------------------------------------------------------------------- meta */

systemRoutes.get('/meta', async (c) => {
  const capabilities = await all<{ value: string }>(c.env.DB, `SELECT DISTINCT capabilities AS value FROM aircraft`)
  const qualifications = await all<{ value: string }>(c.env.DB, `SELECT DISTINCT qualifications AS value FROM crew`)
  const parse = (rows: { value: string }[]) => {
    const set = new Set<string>()
    for (const row of rows) {
      try {
        for (const item of JSON.parse(row.value) as string[]) set.add(item)
      } catch {
        /* ignore malformed rows */
      }
    }
    return [...set].sort()
  }
  return c.json({
    aircraftCapabilities: parse(capabilities),
    crewQualifications: parse(qualifications),
    roles: ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] })),
    priorities: ['critical', 'high', 'normal', 'low'],
    taskStates: ['draft', 'pending', 'scheduled', 'in_progress', 'completed', 'cancelled', 'blocked'],
    aircraftStatuses: ['serviceable', 'restricted', 'maintenance', 'unserviceable'],
    crewStatuses: ['available', 'on_duty', 'rest', 'leave', 'unavailable'],
  })
})

/* ---------------------------------------------------------------------- users */

systemRoutes.get('/users', requirePermission('users:manage'), async (c) => {
  const rows = await all<Record<string, unknown>>(c.env.DB, `SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY name ASC`)
  const sessionCounts = await all<{ user_id: string; count: number }>(
    c.env.DB,
    `SELECT user_id, COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL AND expires_at > ? GROUP BY user_id`,
    [new Date().toISOString()],
  )
  const counts = new Map(sessionCounts.map((r) => [r.user_id, r.count]))
  return c.json({
    items: rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      role: String(row.role),
      status: String(row.status),
      createdAt: String(row.created_at),
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      suspendedAt: row.suspended_at ? String(row.suspended_at) : null,
      activeSessions: counts.get(String(row.id)) ?? 0,
    })),
  })
})

systemRoutes.post('/users', requirePermission('users:manage'), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const { errors, value } = validateSignUp(body)
  const role = String(body.role ?? 'viewer') as Role
  if (!ROLES.includes(role)) errors.role = 'Choose a valid role.'
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)
  const existing = await first<{ id: string }>(c.env.DB, `SELECT id FROM users WHERE email = ?`, [value.email])
  if (existing) return c.json({ error: 'An account with this email already exists.', fieldErrors: { email: 'Already registered.' } }, 409)

  const id = randomId('us_')
  await run(c.env.DB, `INSERT INTO users (id, email, name, role, status, password_hash, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`, [
    id,
    value.email,
    value.name,
    role,
    await hashPassword(value.password),
    new Date().toISOString(),
  ])
  await logAudit(c.env.DB, c.get('user'), 'user.create', 'user', id, `Created account for ${value.email}`, { role })
  return c.json({ id }, 201)
})

systemRoutes.patch('/users/:id/role', requirePermission('users:manage'), async (c) => {
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const role = String(body?.role ?? '') as Role
  if (!ROLES.includes(role)) return c.json({ error: 'Unknown role.' }, 422)
  const target = await first<{ id: string; role: string; name: string; email: string }>(c.env.DB, `SELECT id, role, name, email FROM users WHERE id = ?`, [id])
  if (!target) return c.json({ error: 'User not found.' }, 404)
  if (target.id === c.get('user')!.id && role !== 'admin') {
    return c.json({ error: 'You cannot remove your own administrator role.' }, 422)
  }
  if (target.role === 'admin' && role !== 'admin') {
    const admins = await first<{ count: number }>(c.env.DB, `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'`)
    if ((admins?.count ?? 0) <= 1) return c.json({ error: 'The last active administrator cannot be demoted.' }, 422)
  }
  await run(c.env.DB, `UPDATE users SET role = ? WHERE id = ?`, [role, id])
  await logAudit(c.env.DB, c.get('user'), 'permission.change', 'user', id, `Changed ${target.name}'s role ${target.role} → ${role}`, { from: target.role, to: role })
  await logSecurity(c.env.DB, { userId: id, email: target.email, type: 'permission.change', severity: 'warning', message: `Role changed to ${role}`, ip: clientIp(c) })
  return c.json({ ok: true })
})

async function setStatus(c: Context<AppEnv>, id: string, status: 'active' | 'suspended') {
  const target = await first<{ id: string; name: string; email: string }>(c.env.DB, `SELECT id, name, email FROM users WHERE id = ?`, [id])
  if (!target) return { ok: false as const, status: 404, error: 'User not found.' }
  if (target.id === c.get('user')!.id) return { ok: false as const, status: 422, error: 'You cannot change your own account status.' }
  const now = new Date().toISOString()
  await run(c.env.DB, `UPDATE users SET status = ?, suspended_at = ? WHERE id = ?`, [status, status === 'suspended' ? now : null, id])
  if (status === 'suspended') {
    await run(c.env.DB, `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [now, id])
  }
  await logAudit(c.env.DB, c.get('user'), `user.${status}`, 'user', id, `${status === 'suspended' ? 'Suspended' : 'Reactivated'} ${target.name}`, {})
  await logSecurity(c.env.DB, { userId: id, email: target.email, type: `account.${status}`, severity: status === 'suspended' ? 'critical' : 'info', message: `Account ${status}`, ip: clientIp(c) })
  return { ok: true as const }
}

systemRoutes.post('/users/:id/suspend', requirePermission('users:manage'), async (c) => {
  const result = await setStatus(c, c.req.param('id'), 'suspended')
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 422)
  return c.json({ ok: true })
})

systemRoutes.post('/users/:id/activate', requirePermission('users:manage'), async (c) => {
  const result = await setStatus(c, c.req.param('id'), 'active')
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 422)
  return c.json({ ok: true })
})

/* ---------------------------------------------------------------------- audit */

systemRoutes.get('/audit', requirePermission('audit:read'), async (c) => {
  const url = new URL(c.req.url)
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get('limit') ?? 80)))
  const entityType = url.searchParams.get('entityType') ?? ''
  const search = (url.searchParams.get('search') ?? '').trim()
  const where: string[] = []
  const params: unknown[] = []
  if (entityType) {
    where.push('entity_type = ?')
    params.push(entityType)
  }
  if (search) {
    where.push('(summary LIKE ? OR actor_name LIKE ? OR action LIKE ?)')
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM audit_events ${clause} ORDER BY created_at DESC LIMIT ?`, [...params, limit])
  const entityTypes = await all<{ entity_type: string }>(c.env.DB, `SELECT DISTINCT entity_type FROM audit_events ORDER BY entity_type`)
  return c.json({ items: rows.map(auditFromRow), entityTypes: entityTypes.map((r) => r.entity_type) })
})

/* ------------------------------------------------------------------- security */

systemRoutes.get('/security', requirePermission('security:read'), async (c) => {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const events = await all<Record<string, unknown>>(c.env.DB, `SELECT * FROM security_events ORDER BY created_at DESC LIMIT 60`)
  const failed = await first<{ count: number }>(c.env.DB, `SELECT COUNT(*) AS count FROM security_events WHERE type = 'login.failed' AND created_at > ?`, [since])
  const rateLimited = await first<{ count: number }>(c.env.DB, `SELECT COUNT(*) AS count FROM security_events WHERE type = 'login.rate_limited' AND created_at > ?`, [since])
  const activeSessions = await first<{ count: number }>(
    c.env.DB,
    `SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL AND expires_at > ?`,
    [new Date().toISOString()],
  )
  const sessions = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT s.id, s.user_id, s.created_at, s.expires_at, s.last_seen_at, s.ip, s.user_agent, s.revoked_at, u.name, u.email, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id ORDER BY s.last_seen_at DESC LIMIT 40`,
  )
  const suspended = await all<Record<string, unknown>>(c.env.DB, `SELECT id, name, email, suspended_at FROM users WHERE status = 'suspended'`)
  const roles = await all<{ role: string; count: number }>(c.env.DB, `SELECT role, COUNT(*) AS count FROM users GROUP BY role`)

  const alerts = events
    .filter((row) => String(row.severity) !== 'info')
    .slice(0, 8)
    .map(securityFromRow)

  return c.json({
    stats: {
      failedLogins24h: failed?.count ?? 0,
      rateLimited24h: rateLimited?.count ?? 0,
      activeSessions: activeSessions?.count ?? 0,
      suspendedAccounts: suspended.length,
      auditEvents: (await first<{ count: number }>(c.env.DB, `SELECT COUNT(*) AS count FROM audit_events`))?.count ?? 0,
    },
    events: events.map(securityFromRow),
    alerts,
    sessions: sessions.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      name: String(row.name),
      email: String(row.email),
      role: String(row.role),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      lastSeenAt: String(row.last_seen_at),
      ip: String(row.ip),
      userAgent: String(row.user_agent),
      revoked: Boolean(row.revoked_at),
      current: String(row.id) === c.get('user')!.sessionId,
    })),
    suspended: suspended.map((row) => ({ id: String(row.id), name: String(row.name), email: String(row.email), suspendedAt: String(row.suspended_at) })),
    roles: roles.map((row) => ({ role: row.role, count: row.count })),
    controls: [
      { control: 'Password hashing', status: 'enforced', detail: 'PBKDF2-SHA256, 150,000 iterations, per-user salt' },
      { control: 'Session cookies', status: 'enforced', detail: 'HttpOnly, SameSite=Lax, Secure on HTTPS, 12 h expiry' },
      { control: 'Role-based access control', status: 'enforced', detail: 'Server-side permission checks on every mutating route' },
      { control: 'Sign-in rate limiting', status: 'enforced', detail: 'Failed attempts per email/IP in a 15-minute window' },
      { control: 'Same-origin enforcement', status: 'enforced', detail: 'Cross-site state-changing requests rejected' },
      { control: 'Input validation', status: 'enforced', detail: 'Shared validators on the Worker for every write route' },
      { control: 'SQL injection protection', status: 'enforced', detail: 'Bound parameters; sort columns from a fixed allowlist' },
      { control: 'Dependency scanning', status: 'not_configured', detail: 'No scanner is wired into this deployment; run npm audit in CI' },
      { control: 'Backups', status: 'not_configured', detail: 'D1 backups are managed by the hosting provider; no schedule verified here' },
      { control: 'Email delivery', status: 'not_configured', detail: 'No mail provider configured; password reset uses a local token' },
    ],
  })
})

/* -------------------------------------------------------------------- settings */

const EDITABLE_SETTINGS = new Set([
  'operationalTimezone',
  'turnaroundMinutes',
  'crewGapMinutes',
  'slotStepMinutes',
  'defaultDutyLimitMinutes',
  'defaultRestMinutes',
  'sessionHours',
  'loginRateLimit',
])

systemRoutes.get('/settings', requirePermission('settings:manage'), async (c) => {
  const rows = await all<{ key: string; value: string }>(c.env.DB, `SELECT key, value FROM settings ORDER BY key`)
  const seededAt = await first<{ value: string }>(c.env.DB, `SELECT value FROM meta WHERE key = 'seeded_at'`)
  return c.json({
    settings: Object.fromEntries(rows.map((r) => [r.key, r.value])),
    demoData: rows.find((r) => r.key === 'demoData')?.value === 'true',
    seededAt: seededAt?.value ?? null,
    environment: 'local Worker with D1',
  })
})

systemRoutes.put('/settings', requirePermission('settings:manage'), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const updates: [string, string][] = []
  for (const [key, raw] of Object.entries(body)) {
    if (!EDITABLE_SETTINGS.has(key)) return c.json({ error: `Unknown setting: ${key}` }, 422)
    const value = String(raw ?? '')
    if (['turnaroundMinutes', 'crewGapMinutes', 'slotStepMinutes', 'defaultDutyLimitMinutes', 'defaultRestMinutes', 'sessionHours', 'loginRateLimit'].includes(key)) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1440) {
        return c.json({ error: `${key} must be a number between 0 and 1440.`, fieldErrors: { [key]: 'Out of range.' } }, 422)
      }
    }
    if (key === 'operationalTimezone' && !/^[A-Za-z]+\/[A-Za-z_]+$|^UTC$/.test(value)) {
      return c.json({ error: 'Use an IANA time zone such as UTC or Europe/London.', fieldErrors: { operationalTimezone: 'Invalid time zone.' } }, 422)
    }
    updates.push([key, value])
  }
  for (const [key, value] of updates) {
    await run(c.env.DB, `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value])
  }
  await logAudit(c.env.DB, c.get('user'), 'settings.update', 'settings', null, `Updated ${updates.length} operational setting(s)`, {
    keys: updates.map(([k]) => k),
  })
  return c.json({ ok: true })
})

/* -------------------------------------------------------------- password mail */

systemRoutes.post('/users/:id/reset', requirePermission('users:manage'), async (c) => {
  const target = await first<{ id: string; email: string; name: string }>(c.env.DB, `SELECT id, email, name FROM users WHERE id = ?`, [c.req.param('id')])
  if (!target) return c.json({ error: 'User not found.' }, 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const password = String(body?.password ?? '')
  const { errors } = validateEmail({ email: target.email })
  if (errors.email) return c.json({ error: 'Account email is invalid.' }, 422)
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return c.json({ error: 'Use 10+ characters with a letter and a number.', fieldErrors: { password: 'Password too weak.' } }, 422)
  }
  await run(c.env.DB, `UPDATE users SET password_hash = ? WHERE id = ?`, [await hashPassword(password), target.id])
  await run(c.env.DB, `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [new Date().toISOString(), target.id])
  await logAudit(c.env.DB, c.get('user'), 'user.password_reset_admin', 'user', target.id, `Reset the password for ${target.email}`, {})
  await logSecurity(c.env.DB, { userId: target.id, email: target.email, type: 'password.reset_admin', severity: 'warning', message: 'Password reset by an administrator', ip: clientIp(c) })
  return c.json({ ok: true })
})
