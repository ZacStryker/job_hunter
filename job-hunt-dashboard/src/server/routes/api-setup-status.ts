import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { setupDismissals } from '../../db/schema'
import { setupTaskIdSchema } from '../../shared/schemas'
import { computeSetupStatus, SETUP_TASK_TIER } from '../services/setup-status'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

const dismissBodySchema = setupTaskIdSchema

app.get('/', (c) => {
  return c.json(computeSetupStatus(c.get('userId')))
})

app.post('/dismiss', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = dismissBodySchema.safeParse((body as { taskId?: unknown })?.taskId)
  if (!parsed.success) return c.json({ error: 'Invalid taskId' }, 400)

  const taskId = parsed.data
  if (SETUP_TASK_TIER[taskId] === 'required') return c.json({ error: 'Task cannot be dismissed' }, 400)

  db.insert(setupDismissals)
    .values({ userId, taskId, dismissedAt: new Date().toISOString() })
    .onConflictDoNothing()
    .run()

  return c.json(computeSetupStatus(userId))
})

app.post('/undismiss', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = dismissBodySchema.safeParse((body as { taskId?: unknown })?.taskId)
  if (!parsed.success) return c.json({ error: 'Invalid taskId' }, 400)

  db.delete(setupDismissals)
    .where(and(eq(setupDismissals.userId, userId), eq(setupDismissals.taskId, parsed.data)))
    .run()

  return c.json(computeSetupStatus(userId))
})

export default app
