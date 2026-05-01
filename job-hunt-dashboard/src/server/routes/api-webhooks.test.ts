process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

// Mock both services BEFORE dynamic import — bun:test hoisting requirement
let mockRunDiscovery: (onProgress?: (msg: string) => void) => Promise<{ inserted: number; bySource: Record<string, number> }> =
  async () => ({ inserted: 0, bySource: {} })
mock.module('../services/discovery-service', () => ({
  runDiscovery: (onProgress?: (msg: string) => void, _userId?: number) => mockRunDiscovery(onProgress),
}))

let mockRunAnalysis: (onProgress?: (msg: string) => void) => Promise<{ processed: number; failed: number; matched: number; archived: number; inputTokens: number; outputTokens: number }> =
  async () => ({ processed: 0, failed: 0, matched: 0, archived: 0, inputTokens: 0, outputTokens: 0 })
mock.module('../services/analysis-service', () => ({
  runAnalysis: (onProgress?: (msg: string) => void, _userId?: number) => mockRunAnalysis(onProgress),
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
    error_message TEXT,
    duration_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd REAL,
    matched_count INTEGER,
    archived_count INTEGER,
    source_breakdown TEXT
  )
`

const CREATE_USER_SECRETS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name)
  )
`

async function parseNdjson(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text()
  return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>)
}

beforeAll(() => {
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
  prodSqlite.run(CREATE_USER_SECRETS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM webhook_runs')
  prodSqlite.run('DELETE FROM user_secrets')
})

afterEach(() => {
  mockRunDiscovery = async () => ({ inserted: 0, bySource: {} })
  mockRunAnalysis = async () => ({ processed: 0, failed: 0, matched: 0, archived: 0, inputTokens: 0, outputTokens: 0 })
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

  test('streams done event with inserted count on success', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => ({ inserted: 5, bySource: {} })

    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)

    const events = await parseNdjson(res)
    const doneEvent = events.find((e) => 'done' in e)
    expect(doneEvent?.done).toBe(true)
    expect(doneEvent?.inserted).toBe(5)

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(1)
    expect(row.item_count).toBe(5)

    delete process.env.SCRAPER_URL
  })

  test('streams error event and records failed run when runDiscovery throws', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => { throw new Error('Scraper timeout') }

    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)

    const events = await parseNdjson(res)
    const errorEvent = events.find((e) => 'error' in e)
    expect(errorEvent?.error).toBe('Scraper timeout')

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(0)
    expect(row.item_count).toBeNull()

    delete process.env.SCRAPER_URL
  })

  test('streams status events emitted by onProgress', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async (onProgress) => {
      onProgress?.('Searching linkedin: genai python…')
      onProgress?.('Searching indeed: engineer…')
      return { inserted: 2, bySource: {} }
    }

    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)

    const events = await parseNdjson(res)
    const statusEvents = events.filter((e) => 'status' in e)
    expect(statusEvents).toHaveLength(2)
    expect(statusEvents[0].status).toBe('Searching linkedin: genai python…')
    expect(statusEvents[1].status).toBe('Searching indeed: engineer…')

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

  test('streams done event with processed/failed counts and records run on success', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => ({ processed: 7, failed: 1, matched: 7, archived: 0, inputTokens: 0, outputTokens: 0 })

    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)

    const events = await parseNdjson(res)
    const doneEvent = events.find((e) => 'done' in e)
    expect(doneEvent?.done).toBe(true)
    expect(doneEvent?.processed).toBe(7)
    expect(doneEvent?.failed).toBe(1)

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Analysis') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(1)
    expect(row.item_count).toBe(7)

    delete process.env.ANTHROPIC_API_KEY
  })

  test('records durationMs, inputTokens, outputTokens, costUsd for analysis run', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => ({ processed: 2, failed: 0, matched: 2, archived: 0, inputTokens: 1000, outputTokens: 500 })

    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)
    await parseNdjson(res)

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Analysis') as {
      duration_ms: number | null; input_tokens: number | null; output_tokens: number | null; cost_usd: number | null
    }
    expect(row.duration_ms).not.toBeNull()
    expect(row.duration_ms).toBeGreaterThanOrEqual(0)
    expect(row.input_tokens).toBe(1000)
    expect(row.output_tokens).toBe(500)
    expect(row.cost_usd).not.toBeNull()

    delete process.env.ANTHROPIC_API_KEY
  })

  test('streams error event and records failed run when runAnalysis throws', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => { throw new Error('Anthropic timeout') }

    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)

    const events = await parseNdjson(res)
    const errorEvent = events.find((e) => 'error' in e)
    expect(errorEvent?.error).toBe('Anthropic timeout')

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Analysis') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(0)
    expect(row.item_count).toBeNull()

    delete process.env.ANTHROPIC_API_KEY
  })

  test('streams status events emitted by onProgress', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async (onProgress) => {
      onProgress?.('Found 3 jobs to analyze')
      onProgress?.('Analyzing 1 / 3: Acme Corp — Senior Engineer')
      return { processed: 3, failed: 0, matched: 3, archived: 0, inputTokens: 0, outputTokens: 0 }
    }

    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)

    const events = await parseNdjson(res)
    const statusEvents = events.filter((e) => 'status' in e)
    expect(statusEvents).toHaveLength(2)
    expect(statusEvents[0].status).toBe('Found 3 jobs to analyze')
    expect(statusEvents[1].status).toBe('Analyzing 1 / 3: Acme Corp — Senior Engineer')

    delete process.env.ANTHROPIC_API_KEY
  })
})
