process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

// Mock both services BEFORE dynamic import — bun:test hoisting requirement
let mockRunDiscovery: () => Promise<{ inserted: number }> = async () => ({ inserted: 0 })
mock.module('../services/discovery-service', () => ({
  runDiscovery: () => mockRunDiscovery(),
}))

let mockRunAnalysis: () => Promise<{ processed: number; failed: number }> = async () => ({ processed: 0, failed: 0 })
mock.module('../services/analysis-service', () => ({
  runAnalysis: () => mockRunAnalysis(),
}))

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

afterEach(() => {
  mockRunDiscovery = async () => ({ inserted: 0 })
  mockRunAnalysis = async () => ({ processed: 0, failed: 0 })
})

describe('POST /api/webhooks/discovery', () => {
  test('returns 503 when SCRAPER_URL is not set', async () => {
    delete process.env.SCRAPER_URL
    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 200 and records run with inserted count on success', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => ({ inserted: 5 })

    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; inserted: number }
    expect(body.ok).toBe(true)
    expect(body.inserted).toBe(5)

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(1)
    expect(row.item_count).toBe(5)

    delete process.env.SCRAPER_URL
  })

  test('returns 502 and records failed run when runDiscovery throws', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => { throw new Error('Scraper timeout') }

    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(502)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(0)
    expect(row.item_count).toBeNull()

    delete process.env.SCRAPER_URL
  })
})

describe('POST /api/webhooks/analysis', () => {
  test('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 200 with processed/failed counts and records run on success', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => ({ processed: 7, failed: 1 })

    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; processed: number; failed: number }
    expect(body.ok).toBe(true)
    expect(body.processed).toBe(7)
    expect(body.failed).toBe(1)

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Analysis') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(1)
    expect(row.item_count).toBe(7)  // processed count, not total

    delete process.env.ANTHROPIC_API_KEY
  })

  test('returns 502 and records failed run when runAnalysis throws', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => { throw new Error('Anthropic timeout') }

    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(502)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Analysis') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(0)
    expect(row.item_count).toBeNull()

    delete process.env.ANTHROPIC_API_KEY
  })
})
