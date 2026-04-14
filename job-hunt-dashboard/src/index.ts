import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { join } from 'node:path'
import { runMigrations } from './db/migrate'
import ingestRoute from './server/routes/api-ingest'
import syncRoute from './server/routes/api-sync'
import jobsRoute from './server/routes/api-jobs'
import messagesRoute from './server/routes/api-messages'
import webhookRunsRoute from './server/routes/api-webhook-runs'
import webhooksRoute from './server/routes/api-webhooks'
import statsRoute from './server/routes/api-stats'
import profileRoute from './server/routes/api-profile'
import { errorHandler } from './server/middleware/error-handler'

const app = new Hono()

runMigrations()
const REQUIRED_ENV_VARS = [
  'PORT',
  'DB_PATH',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GOOGLE_SPREADSHEET_ID',
] as const

const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key])
if (missingVars.length > 0) {
  console.error(
    `[env] Missing required environment variables:\n${missingVars.map((k) => `  - ${k}`).join('\n')}`
  )
  process.exit(1)
}

app.route('/api/ingest', ingestRoute)
app.route('/api/sync', syncRoute)
app.route('/api/jobs', jobsRoute)
app.route('/api/messages', messagesRoute)
app.route('/api/webhook-runs', webhookRunsRoute)
app.route('/api/webhooks', webhooksRoute)
app.route('/api/stats', statsRoute)
app.route('/api/profile', profileRoute)
app.onError(errorHandler)

// Resolve dist/ relative to this file, not CWD — safe for any working directory
const distDir = join(import.meta.dir, '..', 'dist')

// Serve SPA bundle in production
app.use('/*', serveStatic({ root: distDir }))
app.get('/*', serveStatic({ path: join(distDir, 'index.html') }))

const port = parseInt(process.env.PORT ?? '3000', 10)
if (isNaN(port)) throw new Error(`Invalid PORT env var: "${process.env.PORT}"`)

export default {
  port,
  hostname: '127.0.0.1',
  fetch: app.fetch,
  idleTimeout: 120,
}
