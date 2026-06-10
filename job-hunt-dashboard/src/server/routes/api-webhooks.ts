import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { userSecrets } from '../../db/schema'
import { recordRun } from './api-webhook-runs'
import { runDiscovery } from '../services/discovery-service'
import { runAnalysis } from '../services/analysis-service'
import type { AppEnv } from '../types'

// USD per token (per-million prices / 1_000_000)
const OPUS_4_7_INPUT = 15 / 1_000_000
const OPUS_4_7_OUTPUT = 75 / 1_000_000

const app = new Hono<AppEnv>()

app.post('/discovery', (c) => {
  if (!process.env.SCRAPER_URL) return c.json({ error: 'SCRAPER_URL not configured' }, 503)
  const userId = c.get('userId')
  return stream(c, async (s) => {
    const write = (ev: object) => s.writeln(JSON.stringify(ev))
    const startMs = Date.now()
    try {
      const { inserted, bySource, errors } = await runDiscovery(
        (msg) => write({ status: msg }),
        userId,
        (count, source) => write({ jobsReady: true, count, source }),
      )
      const success = !(inserted === 0 && errors.length > 0)
      const errorMessage = success ? null : (errors[0]?.error ?? null)
      recordRun({ userId, name: 'Discovery', success, itemCount: inserted, errorMessage, durationMs: Date.now() - startMs, sourceBreakdown: Object.keys(bySource).length > 0 ? bySource : null })
      write({ done: true, inserted })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[discovery] run failed:', message)
      recordRun({ userId, name: 'Discovery', success: false, itemCount: null, errorMessage: message, durationMs: Date.now() - startMs })
      write({ error: message })
    }
  })
})

app.post('/analysis', async (c) => {
  const userId = c.get('userId')
  if (!process.env.ANTHROPIC_API_KEY) {
    const row = db.select({ keyName: userSecrets.keyName })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'anthropic_api_key')))
      .get()
    if (!row) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)
  }
  return stream(c, async (s) => {
    const write = (ev: object) => s.writeln(JSON.stringify(ev))
    const startMs = Date.now()
    try {
      const { processed, failed, matched, archived, inputTokens, outputTokens } = await runAnalysis((msg) => write({ status: msg }), userId)
      const costUsd = inputTokens * OPUS_4_7_INPUT + outputTokens * OPUS_4_7_OUTPUT
      recordRun({ userId, name: 'Analysis', success: true, itemCount: processed, errorMessage: null,
        durationMs: Date.now() - startMs, inputTokens, outputTokens, costUsd, matchedCount: matched, archivedCount: archived })
      write({ done: true, processed, failed, matched, archived })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[analysis] run failed:', message)
      recordRun({ userId, name: 'Analysis', success: false, itemCount: null, errorMessage: message,
        durationMs: Date.now() - startMs, inputTokens: 0, outputTokens: 0, costUsd: 0 })
      write({ error: message })
    }
  })
})

export default app
