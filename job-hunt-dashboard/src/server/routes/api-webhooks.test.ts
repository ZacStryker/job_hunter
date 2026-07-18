process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { Database } from 'bun:sqlite'
import { Hono } from 'hono'
import { activityRegistry } from '../services/activity-registry'
import type { AppEnv } from '../types'

// Mock both services BEFORE dynamic import — bun:test hoisting requirement
let mockRunDiscovery: (onProgress?: (msg: string) => void, onJobsInserted?: (count: number, source: string) => void) => Promise<{ inserted: number; bySource: Record<string, number>; errors?: Array<{ source: string; error: string }> }> =
  async () => ({ inserted: 0, bySource: {}, errors: [] })
mock.module('../services/discovery-service', () => ({
  runDiscovery: (onProgress?: (msg: string) => void, _userId?: number, onJobsInserted?: (count: number, source: string) => void) => mockRunDiscovery(onProgress, onJobsInserted),
}))

let mockRunAnalysis: (onProgress?: (msg: string) => void, opts?: { jobIds?: number[] }) => Promise<{ processed: number; failed: number; matched: number; archived: number; inputTokens: number; outputTokens: number }> =
  async () => ({ processed: 0, failed: 0, matched: 0, archived: 0, inputTokens: 0, outputTokens: 0 })
mock.module('../services/analysis-service', () => ({
  runAnalysis: (onProgress?: (msg: string) => void, _userId?: number, opts?: { jobIds?: number[] }) => mockRunAnalysis(onProgress, opts),
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
    source_breakdown TEXT,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id)
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

// Auth middleware always sets a real userId in production. Inject one here so the
// activity registry can own/finalize runs by user (the registry treats an undefined
// owner as "unknown id" and skips finalize/progress, which would leak running runs).
function asUser(userId: number) {
  const wrap = new Hono<AppEnv>()
  wrap.use('*', async (c, next) => { c.set('userId', userId); await next() })
  wrap.route('/', webhooksApp)
  return wrap
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
  mockRunDiscovery = async () => ({ inserted: 0, bySource: {}, errors: [] })
  mockRunAnalysis = async () => ({ processed: 0, failed: 0, matched: 0, archived: 0, inputTokens: 0, outputTokens: 0 })
  mock.restore()
})

describe('POST /api/webhooks/discovery', () => {
  test('returns 503 when neither SCRAPER_URL nor JSEARCH_API_KEY is set', async () => {
    const origKey = process.env.JSEARCH_API_KEY
    delete process.env.SCRAPER_URL
    delete process.env.JSEARCH_API_KEY
    try {
      const res = await asUser(1).request('/discovery', { method: 'POST' })
      expect(res.status).toBe(503)
      const body = await res.json() as { error: string }
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('message')
    } finally {
      if (origKey === undefined) delete process.env.JSEARCH_API_KEY
      else process.env.JSEARCH_API_KEY = origKey
    }
  })

  test('proceeds (no 503) with JSEARCH_API_KEY set even when SCRAPER_URL is absent', async () => {
    const origKey = process.env.JSEARCH_API_KEY
    delete process.env.SCRAPER_URL
    process.env.JSEARCH_API_KEY = 'test-key'
    mockRunDiscovery = async () => ({ inserted: 1, bySource: { jsearch: 1 }, errors: [] })
    try {
      const res = await asUser(1).request('/discovery', { method: 'POST' })
      expect(res.status).toBe(200)
    } finally {
      if (origKey === undefined) delete process.env.JSEARCH_API_KEY
      else process.env.JSEARCH_API_KEY = origKey
    }
  })

  test('streams done event with inserted count on success', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => ({ inserted: 5, bySource: {} })

    const res = await asUser(1).request('/discovery', { method: 'POST' })
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

    const res = await asUser(1).request('/discovery', { method: 'POST' })
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

    const res = await asUser(1).request('/discovery', { method: 'POST' })
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
    const res = await asUser(1).request('/analysis', { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('streams done event with processed/failed counts and records run on success', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => ({ processed: 7, failed: 1, matched: 7, archived: 0, inputTokens: 0, outputTokens: 0 })

    const res = await asUser(1).request('/analysis', { method: 'POST' })
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

    const res = await asUser(1).request('/analysis', { method: 'POST' })
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

    const res = await asUser(1).request('/analysis', { method: 'POST' })
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

    const res = await asUser(1).request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)

    const events = await parseNdjson(res)
    const statusEvents = events.filter((e) => 'status' in e)
    expect(statusEvents).toHaveLength(2)
    expect(statusEvents[0].status).toBe('Found 3 jobs to analyze')
    expect(statusEvents[1].status).toBe('Analyzing 1 / 3: Acme Corp — Senior Engineer')

    delete process.env.ANTHROPIC_API_KEY
  })
})

describe('activity registry wiring — discovery', () => {
  test('registers a discovery run and finalizes done on success (AC1, AC4)', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => ({ inserted: 5, bySource: { linkedin: 5 }, errors: [] })
    const registerSpy = spyOn(activityRegistry, 'register')
    const finalizeSpy = spyOn(activityRegistry, 'finalize')

    const res = await asUser(1).request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)
    const events = await parseNdjson(res)

    expect(registerSpy).toHaveBeenCalledTimes(1)
    expect(registerSpy.mock.calls[0][0]).toMatchObject({ type: 'discovery', progress: { count: 0, total: null } })
    const runId = registerSpy.mock.results[0].value as string
    expect(finalizeSpy).toHaveBeenCalledTimes(1)
    expect(finalizeSpy).toHaveBeenCalledWith(runId, 'done')

    // AC1 regression: existing NDJSON contract still produced
    const doneEvent = events.find((e) => 'done' in e)
    expect(doneEvent?.done).toBe(true)
    expect(doneEvent?.inserted).toBe(5)

    delete process.env.SCRAPER_URL
  })

  test('advances progress as the running total across sources (AC2)', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async (_onProgress, onJobsInserted) => {
      onJobsInserted?.(3, 'linkedin')
      onJobsInserted?.(2, 'indeed')
      return { inserted: 5, bySource: { linkedin: 3, indeed: 2 }, errors: [] }
    }
    const registerSpy = spyOn(activityRegistry, 'register')
    const progressSpy = spyOn(activityRegistry, 'progress')

    const res = await asUser(1).request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)
    const events = await parseNdjson(res)

    const runId = registerSpy.mock.results[0].value as string
    expect(progressSpy).toHaveBeenCalledTimes(2)
    expect(progressSpy.mock.calls[0]).toEqual([runId, { count: 3, total: null }])
    expect(progressSpy.mock.calls[1]).toEqual([runId, { count: 5, total: null }])

    // AC2 regression: jobsReady events still carry the per-source count
    const jobsReady = events.filter((e) => 'jobsReady' in e)
    expect(jobsReady.map((e) => e.count)).toEqual([3, 2])

    delete process.env.SCRAPER_URL
  })

  test('finalizes failed when all sources error and nothing is inserted (AC4 mirror)', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => ({ inserted: 0, bySource: {}, errors: [{ source: 'linkedin', error: 'x' }] })
    const registerSpy = spyOn(activityRegistry, 'register')
    const finalizeSpy = spyOn(activityRegistry, 'finalize')

    const res = await asUser(1).request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)
    await parseNdjson(res)

    const runId = registerSpy.mock.results[0].value as string
    expect(finalizeSpy).toHaveBeenCalledTimes(1)
    expect(finalizeSpy).toHaveBeenCalledWith(runId, 'failed')

    // regression: the soft-failure is still recorded as success = 0
    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as { success: number }
    expect(row.success).toBe(0)

    delete process.env.SCRAPER_URL
  })

  test('finalizes failed when runDiscovery throws (AC5)', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => { throw new Error('Scraper timeout') }
    const registerSpy = spyOn(activityRegistry, 'register')
    const finalizeSpy = spyOn(activityRegistry, 'finalize')

    const res = await asUser(1).request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)
    const events = await parseNdjson(res)

    const runId = registerSpy.mock.results[0].value as string
    expect(finalizeSpy).toHaveBeenCalledTimes(1)
    expect(finalizeSpy).toHaveBeenCalledWith(runId, 'failed')

    // regression: existing error event + failed row preserved
    const errorEvent = events.find((e) => 'error' in e)
    expect(errorEvent?.error).toBe('Scraper timeout')
    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as { success: number }
    expect(row.success).toBe(0)

    delete process.env.SCRAPER_URL
  })
})

describe('activity registry wiring — analysis', () => {
  test('registers an analysis run and derives count/total from Analyzing messages (AC3)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async (onProgress) => {
      onProgress?.('Found 3 jobs to analyze')
      onProgress?.('Analyzing 1 / 3: Acme — Eng')
      onProgress?.('Analyzing 2 / 3: Beta — Eng')
      return { processed: 3, failed: 0, matched: 3, archived: 0, inputTokens: 0, outputTokens: 0 }
    }
    const registerSpy = spyOn(activityRegistry, 'register')
    const progressSpy = spyOn(activityRegistry, 'progress')

    const res = await asUser(1).request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)
    const events = await parseNdjson(res)

    expect(registerSpy).toHaveBeenCalledTimes(1)
    expect(registerSpy.mock.calls[0][0]).toMatchObject({ type: 'analysis', progress: { count: 0, total: null } })
    const runId = registerSpy.mock.results[0].value as string
    expect(progressSpy).toHaveBeenCalledTimes(2)
    expect(progressSpy.mock.calls[0]).toEqual([runId, { count: 1, total: 3 }])
    expect(progressSpy.mock.calls[1]).toEqual([runId, { count: 2, total: 3 }])

    // AC3 regression: every status message still streams (including the ignored "Found …" line)
    const statusEvents = events.filter((e) => 'status' in e)
    expect(statusEvents).toHaveLength(3)

    delete process.env.ANTHROPIC_API_KEY
  })

  test('finalizes done on success (AC4)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => ({ processed: 2, failed: 0, matched: 2, archived: 0, inputTokens: 0, outputTokens: 0 })
    const registerSpy = spyOn(activityRegistry, 'register')
    const finalizeSpy = spyOn(activityRegistry, 'finalize')

    const res = await asUser(1).request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)
    const events = await parseNdjson(res)

    const runId = registerSpy.mock.results[0].value as string
    expect(finalizeSpy).toHaveBeenCalledTimes(1)
    expect(finalizeSpy).toHaveBeenCalledWith(runId, 'done')
    expect(events.find((e) => 'done' in e)?.done).toBe(true)

    delete process.env.ANTHROPIC_API_KEY
  })

  test('finalizes failed when runAnalysis throws (AC5)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => { throw new Error('Anthropic timeout') }
    const registerSpy = spyOn(activityRegistry, 'register')
    const finalizeSpy = spyOn(activityRegistry, 'finalize')

    const res = await asUser(1).request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)
    const events = await parseNdjson(res)

    const runId = registerSpy.mock.results[0].value as string
    expect(finalizeSpy).toHaveBeenCalledTimes(1)
    expect(finalizeSpy).toHaveBeenCalledWith(runId, 'failed')
    expect(events.find((e) => 'error' in e)?.error).toBe('Anthropic timeout')

    delete process.env.ANTHROPIC_API_KEY
  })
})

describe('concurrency guard — one click, one run (1:1:1)', () => {
  test('discovery: a second request while one is running returns 409, no extra register or log row', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    const USER = 4242
    const seededId = activityRegistry.register({ userId: USER, type: 'discovery', progress: { count: 0, total: null } })
    const registerSpy = spyOn(activityRegistry, 'register')

    const res = await asUser(USER).request('/discovery', { method: 'POST' })

    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
    expect(registerSpy).not.toHaveBeenCalled()
    const count = prodSqlite.query('SELECT COUNT(*) AS n FROM webhook_runs').get() as { n: number }
    expect(count.n).toBe(0)

    activityRegistry.finalize(seededId, 'done', 0)
    delete process.env.SCRAPER_URL
  })

  test('analysis: a second request while one is running returns 409, no extra register or log row', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const USER = 4243
    const seededId = activityRegistry.register({ userId: USER, type: 'analysis', progress: { count: 0, total: null } })
    const registerSpy = spyOn(activityRegistry, 'register')

    const res = await asUser(USER).request('/analysis', { method: 'POST' })

    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
    expect(registerSpy).not.toHaveBeenCalled()
    const count = prodSqlite.query('SELECT COUNT(*) AS n FROM webhook_runs').get() as { n: number }
    expect(count.n).toBe(0)

    activityRegistry.finalize(seededId, 'done', 0)
    delete process.env.ANTHROPIC_API_KEY
  })

  test('a single discovery request still produces exactly one register + one log row', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => ({ inserted: 3, bySource: { linkedin: 3 }, errors: [] })
    const registerSpy = spyOn(activityRegistry, 'register')

    const res = await asUser(7).request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)
    await parseNdjson(res)

    expect(registerSpy).toHaveBeenCalledTimes(1)
    const count = prodSqlite.query('SELECT COUNT(*) AS n FROM webhook_runs WHERE name = ?').get('Discovery') as { n: number }
    expect(count.n).toBe(1)

    delete process.env.SCRAPER_URL
  })

  test('a running analysis does not block a discovery run for the same user (type-scoped guard)', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => ({ inserted: 1, bySource: { linkedin: 1 }, errors: [] })
    const USER = 4244
    const seededId = activityRegistry.register({ userId: USER, type: 'analysis', progress: { count: 0, total: null } })

    const res = await asUser(USER).request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)
    const events = await parseNdjson(res)
    expect(events.find((e) => 'done' in e)?.done).toBe(true)

    activityRegistry.finalize(seededId, 'done', 0)
    delete process.env.SCRAPER_URL
  })
})

// ---------------------------------------------------------------------------
// Optional request body — a bodiless POST is a batch run; { jobIds } targets specific jobs,
// which is the only way a 'failed' job gets re-analyzed (the batch path never selects failures).
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/analysis — request body', () => {
  test('a bodiless POST still runs a batch, passing no jobIds', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    let seenOpts: { jobIds?: number[] } | undefined = { jobIds: [999] } // poisoned, must be overwritten
    mockRunAnalysis = async (_onProgress, opts) => {
      seenOpts = opts
      return { processed: 0, failed: 0, matched: 0, archived: 0, inputTokens: 0, outputTokens: 0 }
    }

    const res = await asUser(5100).request('/analysis', { method: 'POST' })

    expect(res.status).toBe(200)
    expect(seenOpts?.jobIds).toBeUndefined()
    const events = await parseNdjson(res)
    expect(events.find((e) => 'done' in e)?.done).toBe(true)
    delete process.env.ANTHROPIC_API_KEY
  })

  test('jobIds in the body are passed through to runAnalysis', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    let seenOpts: { jobIds?: number[] } | undefined
    mockRunAnalysis = async (_onProgress, opts) => {
      seenOpts = opts
      return { processed: 2, failed: 0, matched: 2, archived: 0, inputTokens: 10, outputTokens: 5 }
    }

    const res = await asUser(5101).request('/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: [7, 9] }),
    })

    expect(res.status).toBe(200)
    expect(seenOpts?.jobIds).toEqual([7, 9])
    const events = await parseNdjson(res)
    expect(events.find((e) => 'done' in e)?.processed).toBe(2)
    delete process.env.ANTHROPIC_API_KEY
  })

  test('a targeted run still records cost and token accounting', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => ({ processed: 1, failed: 0, matched: 1, archived: 0, inputTokens: 100, outputTokens: 50 })

    const res = await asUser(5102).request('/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: [3] }),
    })
    expect(res.status).toBe(200)
    await parseNdjson(res)

    const row = prodSqlite.prepare('SELECT * FROM webhook_runs WHERE user_id = ?').get(5102) as Record<string, unknown>
    expect(row.name).toBe('Analysis')
    expect(row.input_tokens).toBe(100)
    expect(row.output_tokens).toBe(50)
    expect(row.cost_usd as number).toBeGreaterThan(0)
    delete process.env.ANTHROPIC_API_KEY
  })

  test.each([
    ['an empty jobIds array', { jobIds: [] }],
    ['a non-integer id', { jobIds: [1.5] }],
    ['a negative id', { jobIds: [-3] }],
    ['a non-numeric id', { jobIds: ['7'] }],
    ['more than 25 ids', { jobIds: Array.from({ length: 26 }, (_, i) => i + 1) }],
  ])('rejects %s with 400 and never starts a run', async (_label, body) => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    let called = false
    mockRunAnalysis = async () => {
      called = true
      return { processed: 0, failed: 0, matched: 0, archived: 0, inputTokens: 0, outputTokens: 0 }
    }

    const res = await asUser(5103).request('/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error')
    expect(called).toBe(false)
    const runs = prodSqlite.prepare('SELECT COUNT(*) as c FROM webhook_runs WHERE user_id = ?').get(5103) as { c: number }
    expect(runs.c).toBe(0)
    delete process.env.ANTHROPIC_API_KEY
  })

  // A truncated/corrupt body must not be swallowed as "no body". Doing so would silently convert an
  // intended one-job retry into a billed 10-job batch run.
  test('a malformed JSON body is a 400, not a silent fallback to a batch run', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    let called = false
    mockRunAnalysis = async () => {
      called = true
      return { processed: 0, failed: 0, matched: 0, archived: 0, inputTokens: 0, outputTokens: 0 }
    }

    const res = await asUser(5105).request('/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"jobIds":[1,2',   // truncated
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error')
    expect(called).toBe(false)
    delete process.env.ANTHROPIC_API_KEY
  })

  test('the 409 guard still fires for a targeted run', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const USER = 5104
    const seededId = activityRegistry.register({ userId: USER, type: 'analysis', progress: { count: 0, total: null } })

    const res = await asUser(USER).request('/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: [1] }),
    })

    expect(res.status).toBe(409)
    const runs = prodSqlite.prepare('SELECT COUNT(*) as c FROM webhook_runs WHERE user_id = ?').get(USER) as { c: number }
    expect(runs.c).toBe(0)

    activityRegistry.finalize(seededId, 'done', 0)
    delete process.env.ANTHROPIC_API_KEY
  })
})
