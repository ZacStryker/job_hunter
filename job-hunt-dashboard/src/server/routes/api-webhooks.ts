import { Hono } from 'hono'
import { recordRun } from './api-webhook-runs'
import { runDiscovery } from '../services/discovery-service'
import { runAnalysis } from '../services/analysis-service'

const app = new Hono()

async function fireWebhook(url: string): Promise<{
  success: boolean
  itemCount: number | null
  errorMessage: string | null
}> {
  try {
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(120_000) })
    if (!res.ok) {
      return { success: false, itemCount: null, errorMessage: `HTTP ${res.status}` }
    }
    let itemCount: number | null = null
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      const raw = await res.json().catch(() => null) as unknown
      const body = (Array.isArray(raw) ? raw[0] : raw) as { count?: number } | null
      if (typeof body?.count === 'number') itemCount = body.count
    }
    return { success: true, itemCount, errorMessage: null }
  } catch (err) {
    return { success: false, itemCount: null, errorMessage: err instanceof Error ? err.message : String(err) }
  }
}

app.post('/discovery', async (c) => {
  const scraperUrl = process.env.SCRAPER_URL
  if (!scraperUrl) return c.json({ error: 'SCRAPER_URL not configured' }, 503)

  try {
    const { inserted } = await runDiscovery()
    recordRun({ name: 'Discovery', success: true, itemCount: inserted, errorMessage: null })
    return c.json({ ok: true, inserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[discovery] run failed:', message)
    recordRun({ name: 'Discovery', success: false, itemCount: null, errorMessage: message })
    return c.json({ error: message }, 502)
  }
})

app.post('/analysis', async (c) => {
  if (!process.env.ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)

  try {
    const { processed, failed } = await runAnalysis()
    recordRun({ name: 'Analysis', success: true, itemCount: processed, errorMessage: null })
    return c.json({ ok: true, processed, failed })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analysis] run failed:', message)
    recordRun({ name: 'Analysis', success: false, itemCount: null, errorMessage: message })
    return c.json({ error: message }, 502)
  }
})

export default app
