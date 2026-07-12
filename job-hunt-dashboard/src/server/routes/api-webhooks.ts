import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { userSecrets } from '../../db/schema'
import { recordRun } from './api-webhook-runs'
import { activityRegistry } from '../services/activity-registry'
import { runDiscovery } from '../services/discovery-service'
import { runAnalysis } from '../services/analysis-service'
import { analysisRequestSchema, ANALYSIS_RETRY_MAX } from '../../shared/schemas'
import type { AppEnv } from '../types'

// USD per token for claude-sonnet-4-6 (the model runAnalysis calls): $3 input / $15 output per 1M.
// Prompt-cached input is discounted: cache writes bill at 1.25x, cache reads at 0.1x, uncached at 1x.
const SONNET_INPUT = 3 / 1_000_000
const SONNET_OUTPUT = 15 / 1_000_000
const CACHE_WRITE_MULT = 1.25
const CACHE_READ_MULT = 0.1

const app = new Hono<AppEnv>()

app.post('/discovery', (c) => {
  if (!process.env.SCRAPER_URL) return c.json({ error: 'SCRAPER_URL not configured' }, 503)
  const userId = c.get('userId')
  if (activityRegistry.hasRunning(userId, 'discovery')) {
    return c.json({ error: 'A discovery run is already in progress' }, 409)
  }
  return stream(c, async (s) => {
    const write = (ev: object) => s.writeln(JSON.stringify(ev))
    const startMs = Date.now()
    const runId = activityRegistry.register({ userId, type: 'discovery', progress: { count: 0, total: null } })
    try {
      let discovered = 0
      const { inserted, bySource, errors } = await runDiscovery(
        (msg) => write({ status: msg }),
        userId,
        (count, source) => {
          discovered += count
          write({ jobsReady: true, count, source })
          activityRegistry.progress(runId, { count: discovered, total: null })
        },
      )
      const success = !(inserted === 0 && errors.length > 0)
      const errorMessage = success ? null : (errors[0]?.error ?? null)
      recordRun({ userId, name: 'Discovery', success, itemCount: inserted, errorMessage, durationMs: Date.now() - startMs, sourceBreakdown: Object.keys(bySource).length > 0 ? bySource : null })
      activityRegistry.finalize(runId, success ? 'done' : 'failed')
      write({ done: true, inserted })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[discovery] run failed:', message)
      recordRun({ userId, name: 'Discovery', success: false, itemCount: null, errorMessage: message, durationMs: Date.now() - startMs })
      activityRegistry.finalize(runId, 'failed')
      write({ error: message })
    }
  })
})

app.post('/analysis', async (c) => {
  const userId = c.get('userId')

  // The body is optional: a bodiless POST is a normal batch run (unchanged behavior). A body with
  // jobIds targets those jobs, which is the only way a 'failed' job gets re-analyzed.
  //
  // "No body" and "a body that failed to parse" must not collapse into the same branch: swallowing a
  // truncated payload as {} would silently turn an intended one-job retry into a billed 10-job batch
  // run. Only a request that never claimed to carry JSON is treated as bodiless.
  let rawBody: unknown = {}
  if (c.req.header('content-type')?.includes('application/json')) {
    try {
      rawBody = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
  }
  const parsed = analysisRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return c.json({ error: `Invalid analysis request — jobIds must be 1 to ${ANALYSIS_RETRY_MAX} positive integers` }, 400)
  }
  const { jobIds } = parsed.data

  if (!process.env.ANTHROPIC_API_KEY) {
    const row = db.select({ keyName: userSecrets.keyName })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'anthropic_api_key')))
      .get()
    if (!row) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)
  }
  if (activityRegistry.hasRunning(userId, 'analysis')) {
    return c.json({ error: 'An analysis run is already in progress' }, 409)
  }
  return stream(c, async (s) => {
    const write = (ev: object) => s.writeln(JSON.stringify(ev))
    const startMs = Date.now()
    const runId = activityRegistry.register({ userId, type: 'analysis', progress: { count: 0, total: null } })
    const ANALYZING_RE = /^Analyzing (\d+) \/ (\d+):/
    try {
      const result = await runAnalysis((msg) => {
        write({ status: msg })
        const m = ANALYZING_RE.exec(msg)
        if (m) activityRegistry.progress(runId, { count: Number(m[1]), total: Number(m[2]) })
      }, userId, { jobIds })
      const { processed, failed, matched, archived, inputTokens, outputTokens } = result
      // inputTokens is the folded total (uncached + cache writes + cache reads). Bill each tier at its
      // real rate so prompt-cache savings (reads at 0.1x) actually show up in the recorded cost.
      const cacheWrite = result.cacheCreationTokens ?? 0
      const cacheRead = result.cacheReadTokens ?? 0
      const uncachedInput = Math.max(0, inputTokens - cacheWrite - cacheRead)
      const costUsd =
        (uncachedInput + cacheWrite * CACHE_WRITE_MULT + cacheRead * CACHE_READ_MULT) * SONNET_INPUT +
        outputTokens * SONNET_OUTPUT
      recordRun({ userId, name: 'Analysis', success: true, itemCount: processed, errorMessage: null,
        durationMs: Date.now() - startMs, inputTokens, outputTokens, costUsd, matchedCount: matched, archivedCount: archived })
      activityRegistry.finalize(runId, 'done')
      write({ done: true, processed, failed, matched, archived })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[analysis] run failed:', message)
      recordRun({ userId, name: 'Analysis', success: false, itemCount: null, errorMessage: message,
        durationMs: Date.now() - startMs, inputTokens: 0, outputTokens: 0, costUsd: 0 })
      activityRegistry.finalize(runId, 'failed')
      write({ error: message })
    }
  })
})

export default app
