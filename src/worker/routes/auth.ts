// Public + session endpoints: sign-up, sign-in, sign-out, password recovery,
// session listing and revocation.
import { Hono, type Context } from 'hono'

import { ROLE_PERMISSIONS } from '../../shared/permissions'
import type { Role } from '../../shared/types'
import { validateEmail, validateSignUp } from '../../shared/validation'
import {
  clientIp,
  createSession,
  logAudit,
  logSecurity,
  loginAttempts,
  recordAttempt,
  requireAuth,
  sessionCookie,
  SESSION_COOKIE,
  parseCookies,
  sessionHours,
  setting,
  userAgent,
} from '../auth'
import { hashPassword, randomId, randomToken, sha256, verifyPassword } from '../crypto'
import { all, first, run } from '../db'
import type { AppEnv } from '../env'
import type { UserRow } from '../auth'

export const authRoutes = new Hono<AppEnv>()

const publicUser = (row: Pick<UserRow, 'id' | 'email' | 'name' | 'role' | 'status' | 'created_at' | 'last_login_at'>) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at,
})

async function issueSession(c: Context<AppEnv>, userId: string, hours: number) {
  const { token } = await createSession(c.env.DB, userId, hours, { ip: clientIp(c), userAgent: userAgent(c) })
  const secure = new URL(c.req.url).protocol === 'https:'
  c.header('Set-Cookie', sessionCookie(token, hours * 3600, secure))
}

authRoutes.post('/signup', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const { errors, value } = validateSignUp(body)
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)

  const existing = await first<{ id: string }>(c.env.DB, `SELECT id FROM users WHERE email = ?`, [value.email])
  if (existing) return c.json({ error: 'An account with this email already exists.' }, 409)

  const id = randomId('us_')
  const now = new Date().toISOString()
  await run(c.env.DB, `INSERT INTO users (id, email, name, role, status, password_hash, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`, [
    id,
    value.email,
    value.name,
    value.role,
    await hashPassword(value.password),
    now,
  ])
  await logAudit(c.env.DB, { id, name: value.name }, 'user.signup', 'user', id, `${value.name} created an account`, { role: value.role })
  await logSecurity(c.env.DB, { userId: id, email: value.email, type: 'account.created', severity: 'info', message: 'Account created', ip: clientIp(c) })
  await issueSession(c, id, await sessionHours(c.env.DB))

  return c.json({ user: { id, email: value.email, name: value.name, role: value.role, status: 'active', createdAt: now, lastLoginAt: now } }, 201)
})

authRoutes.post('/signin', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!email || !password) return c.json({ error: 'Enter your email and password.' }, 422)

  const ip = clientIp(c)
  const limit = Number(await setting(c.env.DB, 'loginRateLimit', '8'))
  const attempts = await loginAttempts(c.env.DB, email, ip)
  if (attempts >= (Number.isFinite(limit) ? limit : 8)) {
    await logSecurity(c.env.DB, { email, type: 'login.rate_limited', severity: 'warning', message: 'Sign-in blocked by rate limit', ip })
    return c.json({ error: 'Too many failed attempts. Try again in 15 minutes.' }, 429)
  }

  const user = await first<UserRow>(c.env.DB, `SELECT * FROM users WHERE email = ?`, [email])
  const valid = user ? await verifyPassword(password, user.password_hash) : false
  if (!user || !valid) {
    await recordAttempt(c.env.DB, email, ip, 'failed')
    await logSecurity(c.env.DB, { userId: user?.id ?? null, email, type: 'login.failed', severity: 'warning', message: 'Invalid credentials', ip })
    return c.json({ error: 'Email or password is incorrect.' }, 401)
  }
  if (user.status !== 'active') {
    await logSecurity(c.env.DB, { userId: user.id, email, type: 'login.suspended', severity: 'critical', message: 'Suspended account sign-in attempt', ip })
    return c.json({ error: 'This account is suspended. Contact an administrator.' }, 403)
  }

  await recordAttempt(c.env.DB, email, ip, 'success')
  await run(c.env.DB, `UPDATE users SET last_login_at = ? WHERE id = ?`, [new Date().toISOString(), user.id])
  await issueSession(c, user.id, await sessionHours(c.env.DB))
  await logSecurity(c.env.DB, { userId: user.id, email, type: 'login.success', severity: 'info', message: 'Signed in', ip })
  await logAudit(c.env.DB, { id: user.id, name: user.name }, 'auth.signin', 'user', user.id, `${user.name} signed in`)

  return c.json({ user: publicUser({ ...user, last_login_at: new Date().toISOString() }) })
})

authRoutes.post('/signout', async (c) => {
  const token = parseCookies(c.req.header('cookie'))[SESSION_COOKIE]
  if (token) {
    const hash = await sha256(token)
    await run(c.env.DB, `UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`, [new Date().toISOString(), hash])
  }
  c.header('Set-Cookie', sessionCookie('', 0, new URL(c.req.url).protocol === 'https:'))
  return c.json({ ok: true })
})

authRoutes.get('/session', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ user: null, permissions: [], timezone: 'UTC' })
  const timezone = await setting(c.env.DB, 'operationalTimezone', 'UTC')
  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status },
    permissions: ROLE_PERMISSIONS[user.role] ?? [],
    timezone,
    demoData: (await setting(c.env.DB, 'demoData', 'true')) === 'true',
  })
})

authRoutes.post('/password/forgot', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const { errors, email } = validateEmail(body ?? {})
  if (Object.keys(errors).length) return c.json({ error: 'Enter a valid email address.', fieldErrors: errors }, 422)

  const user = await first<UserRow>(c.env.DB, `SELECT * FROM users WHERE email = ?`, [email])
  const response: Record<string, unknown> = { ok: true, message: 'If the account exists, a reset link has been issued.' }
  if (user) {
    const token = randomToken()
    await run(c.env.DB, `INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)`, [
      randomId('pr_'),
      user.id,
      await sha256(token),
      new Date(Date.now() + 30 * 60_000).toISOString(),
      new Date().toISOString(),
    ])
    await logSecurity(c.env.DB, { userId: user.id, email, type: 'password.reset_requested', severity: 'info', message: 'Password reset requested', ip: clientIp(c) })
    // No mail provider is configured: in demonstration mode the token is
    // returned so recovery is usable locally. It is never returned otherwise.
    if ((await setting(c.env.DB, 'demoData', 'true')) === 'true') {
      response.resetToken = token
      response.delivery = 'demonstration'
    }
  }
  return c.json(response)
})

authRoutes.post('/password/reset', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'Send a JSON object.' }, 400)
  const token = String(body.token ?? '')
  const password = String(body.password ?? '')
  const errors: Record<string, string> = {}
  if (!token) errors.token = 'Reset token is required.'
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) errors.password = 'Use 10+ characters with a letter and a number.'
  if (Object.keys(errors).length) return c.json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 422)

  const hash = await sha256(token)
  const reset = await first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    c.env.DB,
    `SELECT * FROM password_resets WHERE token_hash = ?`,
    [hash],
  )
  if (!reset || reset.used_at || Date.parse(reset.expires_at) < Date.now()) {
    return c.json({ error: 'This reset link is invalid or has expired.' }, 400)
  }
  const user = await first<UserRow>(c.env.DB, `SELECT * FROM users WHERE id = ?`, [reset.user_id])
  if (!user) return c.json({ error: 'This reset link is invalid or has expired.' }, 400)

  await run(c.env.DB, `UPDATE users SET password_hash = ? WHERE id = ?`, [await hashPassword(password), user.id])
  await run(c.env.DB, `UPDATE password_resets SET used_at = ? WHERE id = ?`, [new Date().toISOString(), reset.id])
  await run(c.env.DB, `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [new Date().toISOString(), user.id])
  await logSecurity(c.env.DB, { userId: user.id, email: user.email, type: 'password.reset', severity: 'warning', message: 'Password changed and sessions revoked', ip: clientIp(c) })
  await logAudit(c.env.DB, { id: user.id, name: user.name }, 'user.password_reset', 'user', user.id, `${user.name} reset their password`)
  c.header('Set-Cookie', sessionCookie('', 0, new URL(c.req.url).protocol === 'https:'))
  return c.json({ ok: true })
})

authRoutes.get('/sessions', requireAuth, async (c) => {
  const user = c.get('user')!
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, created_at, expires_at, last_seen_at, ip, user_agent, revoked_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 25`,
    [user.id],
  )
  return c.json({
    items: rows.map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      lastSeenAt: String(row.last_seen_at),
      ip: String(row.ip),
      userAgent: String(row.user_agent),
      revoked: Boolean(row.revoked_at),
      current: String(row.id) === user.sessionId,
    })),
  })
})

authRoutes.post('/sessions/:id/revoke', requireAuth, async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const row = await first<{ id: string; user_id: string }>(c.env.DB, `SELECT id, user_id FROM sessions WHERE id = ?`, [id])
  if (!row) return c.json({ error: 'Session not found.' }, 404)
  const isAdmin = user.role === 'admin'
  if (row.user_id !== user.id && !isAdmin) return c.json({ error: 'Not permitted.' }, 403)
  await run(c.env.DB, `UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`, [new Date().toISOString(), id])
  await logSecurity(c.env.DB, { userId: row.user_id, email: user.email, type: 'session.revoked', severity: 'warning', message: `Session ${id} revoked`, ip: clientIp(c) })
  await logAudit(c.env.DB, { id: user.id, name: user.name }, 'session.revoke', 'session', id, `${user.name} revoked a session`)
  return c.json({ ok: true })
})

authRoutes.post('/reauthenticate', requireAuth, async (c) => {
  const user = c.get('user')!
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const password = String(body?.password ?? '')
  const row = await first<UserRow>(c.env.DB, `SELECT * FROM users WHERE id = ?`, [user.id])
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    await logSecurity(c.env.DB, { userId: user.id, email: user.email, type: 'reauth.failed', severity: 'warning', message: 'Re-authentication failed', ip: clientIp(c) })
    return c.json({ error: 'Password is incorrect.' }, 401)
  }
  return c.json({ ok: true })
})

export const roleOptions: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'ops_manager', label: 'Operations Manager' },
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'maintenance_officer', label: 'Maintenance Officer' },
  { value: 'crew_coordinator', label: 'Crew Coordinator' },
  { value: 'viewer', label: 'Viewer' },
]
