// Session handling, request authentication, RBAC and security/audit logging.
import type { Context, MiddlewareHandler } from 'hono'

import { can, type Permission } from '../shared/permissions'
import type { Role } from '../shared/types'
import { randomId, randomToken, sha256 } from './crypto'
import { all, first, run, type D1DatabaseLike } from './db'
import type { AppEnv, AuthUser } from './env'

export const SESSION_COOKIE = 'aeroopt_session'

export interface UserRow {
  id: string
  email: string
  name: string
  role: Role
  status: 'active' | 'suspended'
  password_hash: string
  created_at: string
  last_login_at: string | null
  mfa_secret: string | null
  mfa_enabled: number
  suspended_at: string | null
}

export interface SessionRow {
  id: string
  user_id: string
  token_hash: string
  created_at: string
  expires_at: string
  last_seen_at: string
  ip: string
  user_agent: string
  revoked_at: string | null
}

export const tokenHash = (token: string) => sha256(token)

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export async function createSession(
  db: D1DatabaseLike,
  userId: string,
  hours: number,
  meta: { ip: string; userAgent: string },
): Promise<{ token: string; sessionId: string; expiresAt: string }> {
  const token = randomToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + hours * 3600_000).toISOString()
  const sessionId = randomId('se_')
  await run(
    db,
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip, user_agent, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [sessionId, userId, await tokenHash(token), now.toISOString(), expiresAt, now.toISOString(), meta.ip, meta.userAgent.slice(0, 300)],
  )
  return { token, sessionId, expiresAt }
}

export async function loadSessionUser(db: D1DatabaseLike, token: string): Promise<AuthUser | null> {
  const hash = await tokenHash(token)
  const row = await first<UserRow & { session_id: string; revoked_at: string | null; expires_at: string }>(
    db,
    `SELECT u.*, s.id AS session_id, s.revoked_at, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    [hash],
  )
  if (!row) return null
  if (row.revoked_at) return null
  if (Date.parse(row.expires_at) < Date.now()) return null
  if (row.status !== 'active') return null
  await run(db, `UPDATE sessions SET last_seen_at = ? WHERE id = ?`, [new Date().toISOString(), row.session_id])
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    sessionId: row.session_id,
  }
}

export const sessionHours = async (db: D1DatabaseLike): Promise<number> => {
  const row = await first<{ value: string }>(db, `SELECT value FROM settings WHERE key = 'sessionHours'`)
  const hours = Number(row?.value ?? 12)
  return Number.isFinite(hours) && hours > 0 ? hours : 12
}

export function hasPermission(user: AuthUser | null, permission: Permission): boolean {
  return can(user?.role, permission)
}

/** Attaches the current user (or null) to every request. */
export const attachUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = parseCookies(c.req.header('cookie'))[SESSION_COOKIE]
  c.set('user', token ? await loadSessionUser(c.env.DB, token) : null)
  await next()
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Authentication required.' }, 401)
  await next()
}

export const requirePermission = (permission: Permission): MiddlewareHandler<AppEnv> => async (c, next) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Authentication required.' }, 401)
  if (!hasPermission(user, permission)) return c.json({ error: 'Your role does not permit this action.' }, 403)
  await next()
}

/**
 * Same-origin enforcement for state-changing requests. Cookies are SameSite=Lax;
 * this blocks cross-site form posts as well.
 */
export function isSameOrigin(c: Context): boolean {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return true
  const site = c.req.header('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = c.req.header('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(c.req.url).host
  } catch {
    return false
  }
}

export const clientIp = (c: Context): string =>
  c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'

export const userAgent = (c: Context): string => c.req.header('user-agent') ?? 'unknown'

export async function logAudit(
  db: D1DatabaseLike,
  actor: { id: string | null; name: string } | null,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await run(
    db,
    `INSERT INTO audit_events (id, actor_id, actor_name, action, entity_type, entity_id, summary, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomId('au_'), actor?.id ?? null, actor?.name ?? 'System', action, entityType, entityId, summary, JSON.stringify(details), new Date().toISOString()],
  )
}

export async function logSecurity(
  db: D1DatabaseLike,
  event: { userId?: string | null; email: string; type: string; severity: 'info' | 'warning' | 'critical'; message: string; ip: string },
): Promise<void> {
  await run(
    db,
    `INSERT INTO security_events (id, user_id, email, type, severity, message, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomId('sc_'), event.userId ?? null, event.email, event.type, event.severity, event.message, event.ip, new Date().toISOString()],
  )
}

export async function loginAttempts(db: D1DatabaseLike, email: string, ip: string, windowMinutes = 15): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  const row = await first<{ count: number }>(
    db,
    `SELECT COUNT(*) AS count FROM login_attempts WHERE outcome = 'failed' AND created_at > ? AND (email = ? OR ip = ?)`,
    [since, email, ip],
  )
  return row?.count ?? 0
}

export async function recordAttempt(db: D1DatabaseLike, email: string, ip: string, outcome: 'success' | 'failed'): Promise<void> {
  await run(db, `INSERT INTO login_attempts (id, email, ip, created_at, outcome) VALUES (?, ?, ?, ?, ?)`, [
    randomId('la_'),
    email,
    ip,
    new Date().toISOString(),
    outcome,
  ])
}

export async function setting(db: D1DatabaseLike, key: string, fallback: string): Promise<string> {
  const row = await first<{ value: string }>(db, `SELECT value FROM settings WHERE key = ?`, [key])
  return row?.value ?? fallback
}

export async function settingsMap(db: D1DatabaseLike): Promise<Record<string, string>> {
  const rows = await all<{ key: string; value: string }>(db, `SELECT key, value FROM settings`)
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
