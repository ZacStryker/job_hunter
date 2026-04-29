process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

const originalFetch = globalThis.fetch

const { runDiscovery } = await import('./discovery-service')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    job_title TEXT NOT NULL,
    source_url TEXT,
    date_scraped TEXT,
    source TEXT,
    location TEXT,
    external_job_id TEXT,
    analysis_status TEXT,
    fit_score INTEGER,
    recommendation TEXT,
    role_fit TEXT,
    requirements_met TEXT,
    requirements_missed TEXT,
    red_flags TEXT,
    job_description TEXT,
    salary TEXT,
    benefits TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    applied INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    status_override TEXT,
    cover_letter_sent_at TEXT,
    date_applied TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    resume_generated_at TEXT,
    user_id INTEGER NOT NULL DEFAULT 1,
    UNIQUE(company, job_title, user_id)
  )
`

const CREATE_SEARCH_CONFIGS_TABLE = `
  CREATE TABLE IF NOT EXISTS search_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    query TEXT NOT NULL,
    location TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NOT NULL DEFAULT 1
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_SEARCH_CONFIGS_TABLE)
  prodSqlite.run(`INSERT INTO search_configs (source, query, enabled) VALUES ('linkedin', 'genai python', 1)`)
  process.env.SCRAPER_URL = 'http://test-scraper.invalid'
  process.env.SCRAPER_TOKEN = 'test-token'
})

afterAll(() => {
  prodSqlite.run('DELETE FROM search_configs')
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM jobs')
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('runDiscovery()', () => {
  test('happy path: inserts new jobs from all 6 searches', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'job-1', title: 'SWE', company: 'Acme', location: 'NL', url: 'https://acme.com/1' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )

    const { inserted } = await runDiscovery(undefined, 1)
    // 6 searches × 1 result = 6 total, but job-1 is deduplicated within batch → 1 inserted
    expect(inserted).toBe(1)
    const rows = prodSqlite.prepare('SELECT * FROM jobs').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0].company).toBe('Acme')
    expect(rows[0].external_job_id).toBe('job-1')
    expect(rows[0].analysis_status).toBe('pending')
  })

  test('deduplication: skips jobs already in DB by externalJobId', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, external_job_id, analysis_status) VALUES ('Acme', 'SWE', 'job-1', 'done')`
    )

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [
          { id: 'job-1', title: 'SWE', company: 'Acme', location: null, url: null },
          { id: 'job-2', title: 'Dev', company: 'Beta', location: null, url: null },
        ]}),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )

    const { inserted } = await runDiscovery(undefined, 1)
    expect(inserted).toBe(1) // only job-2
    const rows = prodSqlite.prepare('SELECT external_job_id FROM jobs ORDER BY id').all() as Array<{ external_job_id: string }>
    expect(rows.map(r => r.external_job_id)).toContain('job-1')
    expect(rows.map(r => r.external_job_id)).toContain('job-2')
  })

  test('scraper error: throws when any search returns non-ok status', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 500 }))
    )

    await expect(runDiscovery(undefined, 1)).rejects.toThrow()
  })

  test('missing SCRAPER_URL: throws', async () => {
    const original = process.env.SCRAPER_URL
    delete process.env.SCRAPER_URL
    await expect(runDiscovery(undefined, 1)).rejects.toThrow('SCRAPER_URL not configured')
    process.env.SCRAPER_URL = original
  })

  test('onProgress: emits search messages before fetches and insert message before transaction', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'job-p1', title: 'Dev', company: 'ProgressCo', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )

    const messages: string[] = []
    await runDiscovery((msg) => messages.push(msg), 1)

    const searchMessages = messages.filter((m) => m.startsWith('Searching '))
    expect(searchMessages.length).toBeGreaterThan(0)
    const insertMessage = messages.find((m) => m.startsWith('Inserting '))
    expect(insertMessage).toBeDefined()
  })

  test('onProgress: no insert message when no new jobs found', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, external_job_id, analysis_status) VALUES ('Acme', 'SWE', 'job-existing', 'done')`
    )
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'job-existing', title: 'SWE', company: 'Acme', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )

    const messages: string[] = []
    await runDiscovery((msg) => messages.push(msg), 1)

    const insertMessage = messages.find((m) => m.startsWith('Inserting '))
    expect(insertMessage).toBeUndefined()
  })

  test('sets analysisStatus to pending on insert', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'job-99', title: 'Eng', company: 'Co', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )
    await runDiscovery(undefined, 1)
    const row = prodSqlite.prepare('SELECT analysis_status FROM jobs WHERE external_job_id = ?').get('job-99') as { analysis_status: string }
    expect(row.analysis_status).toBe('pending')
  })
})
