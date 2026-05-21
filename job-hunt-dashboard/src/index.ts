import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { join } from 'node:path'
import argon2 from 'argon2'
import type { Server, ServerWebSocket } from 'bun'
import { and, eq, gte } from 'drizzle-orm'
import { runMigrations } from './db/migrate'
import { db } from './db/client'
import { users, sessions } from './db/schema'
import { startScraperProcess, stopScraperProcess } from './server/services/scraper-process'
import ingestRoute from './server/routes/api-ingest'
import jobsRoute from './server/routes/api-jobs'
import messagesRoute from './server/routes/api-messages'
import webhookRunsRoute from './server/routes/api-webhook-runs'
import webhooksRoute from './server/routes/api-webhooks'
import statsRoute from './server/routes/api-stats'
import profileRoute from './server/routes/api-profile'
import promptsRoute from './server/routes/api-prompts'
import searchConfigsRoute from './server/routes/api-search-configs'
import sourceSettingsRoute from './server/routes/api-source-settings'
import { errorHandler } from './server/middleware/error-handler'
import { authMiddleware } from './server/middleware/auth-middleware'
import { adminMiddleware } from './server/middleware/admin-middleware'
import authRoute from './server/routes/api-auth'
import linkedInBrowserRoute from './server/routes/api-linkedin-browser'
import * as linkedInBrowserService from './server/services/linkedin-browser-service'
import indeedBrowserRoute from './server/routes/api-indeed-browser'
import * as indeedBrowserService from './server/services/indeed-browser-service'
import onboardingRoute from './server/routes/api-onboarding'
import inboxMappingsRoute from './server/routes/api-config-inbox-mappings'
import adminRoute from './server/routes/api-admin'
import type { AppEnv } from './server/types'

interface WsData {
  userId: number
  sessionId: string
  service: 'linkedin' | 'indeed'
}

async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  // ADMIN_EMAIL and ADMIN_PASSWORD are optional — first-deploy-only
  if (!email || !password) return

  const existing = db.select({ id: users.id }).from(users).get()
  if (existing) return

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })

  db.insert(users).values({
    email: email.toLowerCase().trim(),
    passwordHash,
    role: 'admin',
    isActive: true,
    createdAt: new Date().toISOString(),
  }).run()

  console.log('[boot] Seed admin created:', email)
}

const app = new Hono<AppEnv>()

runMigrations()
await seedAdmin()

const REQUIRED_ENV_VARS = [
  'PORT',
  'DB_PATH',
  'ENCRYPTION_KEY',
  'APP_URL',
] as const

const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key])
if (missingVars.length > 0) {
  console.error(
    `[env] Missing required environment variables:\n${missingVars.map((k) => `  - ${k}`).join('\n')}`
  )
  process.exit(1)
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY!)) {
  console.error('[env] ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32')
  process.exit(1)
}

app.use('/api/*', authMiddleware)
app.use('/api/admin/*', adminMiddleware)

app.route('/api/ingest', ingestRoute)
app.route('/api/jobs', jobsRoute)
app.route('/api/messages', messagesRoute)
app.route('/api/webhook-runs', webhookRunsRoute)
app.route('/api/webhooks', webhooksRoute)
app.route('/api/stats', statsRoute)
app.route('/api/profile', profileRoute)
app.route('/api/prompts', promptsRoute)
app.route('/api/search-configs', searchConfigsRoute)
app.route('/api/source-settings', sourceSettingsRoute)
app.route('/api/onboarding/linkedin/browser', linkedInBrowserRoute)
app.route('/api/onboarding/indeed/browser', indeedBrowserRoute)
app.route('/api/onboarding', onboardingRoute)
app.route('/api/config/inbox-mappings', inboxMappingsRoute)
app.route('/api/admin', adminRoute)
app.route('/auth', authRoute)
app.onError(errorHandler)

// Resolve dist/ relative to this file, not CWD — safe for any working directory
const distDir = join(import.meta.dir, '..', 'dist')

// Serve SPA bundle in production
app.use('/*', serveStatic({ root: distDir }))
app.get('/*', serveStatic({ root: distDir, path: 'index.html' }))

await startScraperProcess().catch((err: Error) => {
  console.error('[scraper] startup failed:', err.message)
})

process.on('SIGTERM', () => {
  stopScraperProcess()
  Promise.all([
    linkedInBrowserService.closeAllSessions(),
    indeedBrowserService.closeAllSessions(),
  ]).finally(() => process.exit(0))
})
process.on('SIGINT', () => {
  stopScraperProcess()
  Promise.all([
    linkedInBrowserService.closeAllSessions(),
    indeedBrowserService.closeAllSessions(),
  ]).finally(() => process.exit(0))
})

const port = parseInt(process.env.PORT ?? '3000', 10)
if (isNaN(port)) throw new Error(`Invalid PORT env var: "${process.env.PORT}"`)

function getSessionUserId(req: Request): number | null {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/)
  if (!match) return null
  const sessionId = decodeURIComponent(match[1])
  const now = new Date().toISOString()
  const session = db.select().from(sessions)
    .where(and(eq(sessions.id, sessionId), gte(sessions.expiresAt, now)))
    .get()
  if (!session) return null
  if (session.data) {
    try {
      const data = JSON.parse(session.data) as { impersonating?: number }
      if (Number.isInteger(data.impersonating) && (data.impersonating as number) > 0) {
        return data.impersonating as number
      }
    } catch { }
  }
  return session.userId
}

export default {
  port,
  hostname: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
  fetch(req: Request, server: Server<WsData>) {
    const url = new URL(req.url)
    const linkedInWsMatch = url.pathname.match(/^\/api\/onboarding\/linkedin\/browser\/([^/]+)\/ws$/)
    if (linkedInWsMatch) {
      const sessionId = linkedInWsMatch[1]
      const userId = getSessionUserId(req)
      if (!userId) return new Response('Unauthorized', { status: 401 })
      const session = linkedInBrowserService.getSession(sessionId)
      if (!session || session.userId !== userId) {
        return new Response('Forbidden', { status: 403 })
      }
      const upgraded = server.upgrade(req, { data: { userId, sessionId, service: 'linkedin' as const } })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 500 })
    }
    const indeedWsMatch = url.pathname.match(/^\/api\/onboarding\/indeed\/browser\/([^/]+)\/ws$/)
    if (indeedWsMatch) {
      const sessionId = indeedWsMatch[1]
      const userId = getSessionUserId(req)
      if (!userId) return new Response('Unauthorized', { status: 401 })
      const session = indeedBrowserService.getSession(sessionId)
      if (!session || session.userId !== userId) {
        return new Response('Forbidden', { status: 403 })
      }
      const upgraded = server.upgrade(req, { data: { userId, sessionId, service: 'indeed' as const } })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 500 })
    }
    return app.fetch(req, server)
  },
  websocket: {
    open(ws: ServerWebSocket<WsData>) {
      if (ws.data.service === 'linkedin') {
        void linkedInBrowserService.attachWebSocket(ws)
      } else {
        void indeedBrowserService.attachWebSocket(ws)
      }
    },
    message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
      if (ws.data.service === 'linkedin') {
        void linkedInBrowserService.handleMessage(ws, message)
      } else {
        void indeedBrowserService.handleMessage(ws, message)
      }
    },
    close(ws: ServerWebSocket<WsData>) {
      if (ws.data.service === 'linkedin') {
        linkedInBrowserService.handleClose(ws)
      } else {
        indeedBrowserService.handleClose(ws)
      }
    },
    error(ws: ServerWebSocket<WsData>, error: Error) {
      console.error(`[browser] WS error (service=${ws.data.service}):`, error)
    },
  },
  idleTimeout: 120,
}
