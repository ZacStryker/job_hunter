import { Hono } from 'hono'
import { desc } from 'drizzle-orm'
import { db } from '../../db/client'
import { webhookRuns } from '../../db/schema'

const app = new Hono()

export function recordRun(params: {
  name: string
  success: boolean
  itemCount?: number | null
  errorMessage?: string | null
}) {
  try {
    db.insert(webhookRuns).values({
      name: params.name,
      runAt: new Date().toISOString(),
      success: params.success,
      itemCount: params.itemCount ?? null,
      errorMessage: params.errorMessage ?? null,
    }).run()
  } catch (err) {
    console.error('[webhook-runs] Failed to record run:', err)
  }
}

app.get('/', (c) => {
  const runs = db.select().from(webhookRuns).orderBy(desc(webhookRuns.runAt)).all()
  return c.json({ runs })
})

export default app
