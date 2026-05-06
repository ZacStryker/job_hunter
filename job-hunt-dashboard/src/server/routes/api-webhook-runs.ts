import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { webhookRuns } from '../../db/schema'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

export function recordRun(params: {
  userId: number
  name: string
  success: boolean
  itemCount?: number | null
  errorMessage?: string | null
  durationMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  costUsd?: number | null
  matchedCount?: number | null
  archivedCount?: number | null
  sourceBreakdown?: Record<string, number> | null
}) {
  try {
    db.insert(webhookRuns).values({
      userId: params.userId,
      name: params.name,
      runAt: new Date().toISOString(),
      success: params.success,
      itemCount: params.itemCount ?? null,
      errorMessage: params.errorMessage ?? null,
      durationMs: params.durationMs ?? null,
      inputTokens: params.inputTokens ?? null,
      outputTokens: params.outputTokens ?? null,
      costUsd: params.costUsd ?? null,
      matchedCount: params.matchedCount ?? null,
      archivedCount: params.archivedCount ?? null,
      sourceBreakdown: params.sourceBreakdown ? JSON.stringify(params.sourceBreakdown) : null,
    }).run()
  } catch (err) {
    console.error('[webhook-runs] Failed to record run:', err)
  }
}

app.get('/', (c) => {
  const userId = c.get('userId')
  const rows = db.select().from(webhookRuns).where(eq(webhookRuns.userId, userId)).orderBy(desc(webhookRuns.runAt)).all()
  const runs = rows.map((r) => ({
    ...r,
    sourceBreakdown: r.sourceBreakdown ? (() => { try { return JSON.parse(r.sourceBreakdown!) as Record<string, number> } catch { return null } })() : null,
  }))
  return c.json({ runs })
})

export default app
