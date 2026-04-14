import { Hono } from 'hono'
import { recordRun } from './api-webhook-runs'

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
  const url = process.env.DISCOVERY_WEBHOOK_URL
  if (!url) return c.json({ error: 'DISCOVERY_WEBHOOK_URL not configured' }, 503)
  const result = await fireWebhook(url)
  recordRun({ name: 'Discovery', ...result })
  if (!result.success) return c.json({ error: result.errorMessage ?? 'Discovery webhook failed' }, 502)
  return c.json({ ok: true })
})

app.post('/analysis', async (c) => {
  const url = process.env.ANALYSIS_WEBHOOK_URL
  if (!url) return c.json({ error: 'ANALYSIS_WEBHOOK_URL not configured' }, 503)
  const result = await fireWebhook(url)
  recordRun({ name: 'Analysis', ...result })
  if (!result.success) return c.json({ error: result.errorMessage ?? 'Analysis webhook failed' }, 502)
  return c.json({ ok: true })
})

export default app
