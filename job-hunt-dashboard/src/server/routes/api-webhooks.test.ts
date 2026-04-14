process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

const { default: webhooksApp } = await import('./api-webhooks')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_WEBHOOK_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhook_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    run_at TEXT NOT NULL,
    success INTEGER NOT NULL,
    item_count INTEGER,
    error_message TEXT
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM webhook_runs')
})

describe('POST /api/webhooks/discovery', () => {
  test('returns 503 when DISCOVERY_WEBHOOK_URL is not set', async () => {
    delete process.env.DISCOVERY_WEBHOOK_URL
    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 502 and records failed run when webhook returns non-ok status', async () => {
    process.env.DISCOVERY_WEBHOOK_URL = 'http://test-webhook.invalid/discovery'
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 500 }))
    )

    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(502)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as {
      success: number; item_count: number | null
    }
    expect(row).toBeDefined()
    expect(row.success).toBe(0)
    expect(row.item_count).toBeNull()

    delete process.env.DISCOVERY_WEBHOOK_URL
  })

  test('returns 200 and records successful run when webhook succeeds', async () => {
    process.env.DISCOVERY_WEBHOOK_URL = 'http://test-webhook.invalid/discovery'
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ count: 7 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    )

    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as {
      success: number; item_count: number | null
    }
    expect(row).toBeDefined()
    expect(row.success).toBe(1)
    expect(row.item_count).toBe(7)

    delete process.env.DISCOVERY_WEBHOOK_URL
  })
})

describe('POST /api/webhooks/analysis', () => {
  test('returns 503 when ANALYSIS_WEBHOOK_URL is not set', async () => {
    delete process.env.ANALYSIS_WEBHOOK_URL
    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 200 and records successful run with null itemCount when no count in response', async () => {
    process.env.ANALYSIS_WEBHOOK_URL = 'http://test-webhook.invalid/analysis'
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('ok', { status: 200 }))
    )

    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Analysis') as {
      success: number; item_count: number | null
    }
    expect(row).toBeDefined()
    expect(row.success).toBe(1)
    expect(row.item_count).toBeNull()

    delete process.env.ANALYSIS_WEBHOOK_URL
  })
})
