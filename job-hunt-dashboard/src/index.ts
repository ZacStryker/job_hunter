import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { join } from 'node:path'

const app = new Hono()

// TODO Story 1.2: boot migrations here
// TODO Story 1.3: env validation here
// TODO Epic 2+: mount API routes here

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
}
