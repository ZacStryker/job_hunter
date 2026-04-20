import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { recordRun } from './api-webhook-runs'
import { runDiscovery } from '../services/discovery-service'
import { runAnalysis } from '../services/analysis-service'

// USD per token (per-million prices / 1_000_000)
const OPUS_4_7_INPUT = 15 / 1_000_000
const OPUS_4_7_OUTPUT = 75 / 1_000_000

const app = new Hono()

app.post('/discovery', (c) => {
  if (!process.env.SCRAPER_URL) return c.json({ error: 'SCRAPER_URL not configured' }, 503)
  return stream(c, async (s) => {
    const write = (ev: object) => s.writeln(JSON.stringify(ev))
    const startMs = Date.now()
    try {
      const { inserted } = await runDiscovery((msg) => write({ status: msg }))
      recordRun({ name: 'Discovery', success: true, itemCount: inserted, errorMessage: null, durationMs: Date.now() - startMs })
      write({ done: true, inserted })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[discovery] run failed:', message)
      recordRun({ name: 'Discovery', success: false, itemCount: null, errorMessage: message, durationMs: Date.now() - startMs })
      write({ error: message })
    }
  })
})

app.post('/analysis', (c) => {
  if (!process.env.ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)
  return stream(c, async (s) => {
    const write = (ev: object) => s.writeln(JSON.stringify(ev))
    const startMs = Date.now()
    try {
      const { processed, failed, inputTokens, outputTokens } = await runAnalysis((msg) => write({ status: msg }))
      const costUsd = inputTokens * OPUS_4_7_INPUT + outputTokens * OPUS_4_7_OUTPUT
      recordRun({ name: 'Analysis', success: true, itemCount: processed, errorMessage: null,
        durationMs: Date.now() - startMs, inputTokens, outputTokens, costUsd })
      write({ done: true, processed, failed })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[analysis] run failed:', message)
      recordRun({ name: 'Analysis', success: false, itemCount: null, errorMessage: message,
        durationMs: Date.now() - startMs, inputTokens: 0, outputTokens: 0, costUsd: 0 })
      write({ error: message })
    }
  })
})

export default app
