// AeroOpt Worker: API routes first, static assets behind them.
import { Hono } from 'hono'

import { attachUser, isSameOrigin } from './auth'
import { ensureDatabase } from './db'
import type { AppEnv } from './env'
import { authRoutes } from './routes/auth'
import { overviewRoutes, resourceRoutes } from './routes/resources'
import { analyticsRoutes, approvalRoutes, optimizationRoutes, scheduleRoutes } from './routes/scheduling'
import { systemRoutes } from './routes/system'
import { taskRoutes } from './routes/tasks'

const app = new Hono<AppEnv>()

app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'same-origin')
  c.header('X-Frame-Options', 'DENY')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (c.env.ENVIRONMENT === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
})

app.use('/api/*', async (c, next) => {
  if (!isSameOrigin(c)) return c.json({ error: 'Cross-site request rejected.' }, 403)
  c.header('Cache-Control', 'no-store')
  try {
    await ensureDatabase(c.env.DB)
  } catch (error) {
    console.error('bootstrap.failed', error instanceof Error ? error.message : error)
    return c.json({ error: 'The database is not available yet.' }, 503)
  }
  await next()
})

app.use('/api/*', attachUser)

// Every API route except the public authentication entry points requires a session.
const PUBLIC_ROUTES = new Set([
  '/api/health',
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/session',
  '/api/auth/signout',
  '/api/auth/password/forgot',
  '/api/auth/password/reset',
])
app.use('/api/*', async (c, next) => {
  if (PUBLIC_ROUTES.has(c.req.path)) return next()
  if (!c.get('user')) return c.json({ error: 'Authentication required.' }, 401)
  await next()
})

app.get('/api/health', (c) => c.json({ ok: true, service: 'aeroopt', time: new Date().toISOString() }))


app.route('/api/auth', authRoutes)
app.route('/api/overview', overviewRoutes)
app.route('/api/tasks', taskRoutes)
app.route('/api', resourceRoutes)
app.route('/api/schedule', scheduleRoutes)
app.route('/api/optimize', optimizationRoutes)
app.route('/api/approvals', approvalRoutes)
app.route('/api/analytics', analyticsRoutes)
app.route('/api', systemRoutes)

app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404))

app.onError((error, c) => {
  console.error('request.failed', c.req.method, c.req.path, error instanceof Error ? error.message : error)
  return c.json({ error: 'The operation could not be completed.' }, 500)
})

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
