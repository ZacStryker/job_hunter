process.env.ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

const originalFetch = globalThis.fetch

const { runDiscovery } = await import('./discovery-service')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const { encrypt } = await import('../lib/crypto')
const VALID_LINKEDIN_CIPHERTEXT = encrypt('{"cookies":[],"origins":[]}')
const VALID_INDEED_CIPHERTEXT = encrypt('{"cookies":[],"origins":[]}')

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
    relevance_score REAL,
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
    date_analyzed TEXT,
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

const CREATE_USER_SECRETS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name)
  )
`

const CREATE_SOURCE_SETTINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS source_settings (
    source TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_SEARCH_CONFIGS_TABLE)
  prodSqlite.run(CREATE_USER_SECRETS_TABLE)
  prodSqlite.run(CREATE_SOURCE_SETTINGS_TABLE)
  prodSqlite.run(`INSERT OR IGNORE INTO source_settings (source, enabled) VALUES ('linkedin',1),('indeed',1),('indeed_nl',1),('arc',1)`)
  prodSqlite.run(`INSERT INTO search_configs (source, query, enabled) VALUES ('linkedin', 'genai python', 1)`)
  process.env.SCRAPER_URL = 'http://test-scraper.invalid'
  process.env.SCRAPER_TOKEN = 'test-token'
})

afterAll(() => {
  prodSqlite.run('DELETE FROM search_configs')
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM jobs')
  prodSqlite.run('DELETE FROM user_secrets')
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('runDiscovery()', () => {
  test('happy path: inserts new jobs from all 6 searches', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
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
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
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
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
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
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
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
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
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

  test('LinkedIn searches skipped when no linkedin_storage_state, other sources complete', async () => {
    prodSqlite.run(`INSERT INTO search_configs (source, query, enabled, user_id) VALUES ('arc', 'backend dev', 1, 1)`)

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'job-arc', title: 'Dev', company: 'Co', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )

    try {
      const { inserted, errors } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1)
      expect(errors).toHaveLength(1)
      expect(errors[0].source).toBe('linkedin')
      expect(errors[0].error).toBe('LinkedIn not connected — add your session in Config > Connections')
    } finally {
      prodSqlite.run(`DELETE FROM search_configs WHERE source = 'arc'`)
    }
  })

  test('Indeed searches skipped when no indeed_storage_state', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(`INSERT INTO search_configs (source, query, enabled, user_id) VALUES ('indeed', 'backend dev', 1, 1)`)

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    )

    try {
      const { inserted, errors } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(0)
      expect(errors).toHaveLength(1)
      expect(errors[0].source).toBe('indeed')
      expect(errors[0].error).toBe('Indeed not connected — add your session in Config > Connections')
    } finally {
      prodSqlite.run(`DELETE FROM search_configs WHERE source = 'indeed'`)
    }
  })

  test('indeed_nl searches also skipped when no indeed_storage_state', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(`INSERT INTO search_configs (source, query, enabled, user_id) VALUES ('indeed_nl', 'dev', 1, 1)`)

    const capturedSources: string[] = []
    globalThis.fetch = mock((_url: unknown, options: unknown) => {
      const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>
      capturedSources.push(body.source as string)
      return Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    })

    try {
      const { errors } = await runDiscovery(undefined, 1)
      expect(errors.some((e) => e.source === 'indeed')).toBe(true)
      expect(capturedSources).not.toContain('indeed_nl')
    } finally {
      prodSqlite.run(`DELETE FROM search_configs WHERE source = 'indeed_nl'`)
    }
  })

  test('Indeed proceeds when indeed_storage_state exists', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'indeed_storage_state', '${VALID_INDEED_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(`INSERT INTO search_configs (source, query, enabled, user_id) VALUES ('indeed', 'backend dev', 1, 1)`)

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'job-ind', title: 'Dev', company: 'Co', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )

    try {
      const { errors } = await runDiscovery(undefined, 1)
      expect(errors.filter((e) => e.source === 'indeed')).toHaveLength(0)
    } finally {
      prodSqlite.run(`DELETE FROM search_configs WHERE source = 'indeed'`)
    }
  })

  test('Indeed passes storageStateContent in request body', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'indeed_storage_state', '${VALID_INDEED_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(`INSERT INTO search_configs (source, query, enabled, user_id) VALUES ('indeed', 'backend dev', 1, 1)`)

    let capturedContent: string | undefined
    globalThis.fetch = mock((_url: unknown, options: unknown) => {
      const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>
      if (body.source === 'indeed') capturedContent = body.storageStateContent as string
      return Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    })

    try {
      await runDiscovery(undefined, 1)
      expect(capturedContent).toBeDefined()
    } finally {
      prodSqlite.run(`DELETE FROM search_configs WHERE source = 'indeed'`)
    }
  })

  test('Indeed updatedStorageStateContent written back to user_secrets', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'indeed_storage_state', '${VALID_INDEED_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(`INSERT INTO search_configs (source, query, enabled, user_id) VALUES ('indeed', 'backend dev', 1, 1)`)

    const updatedContent = '{"cookies":[{"name":"updated"}],"origins":[]}'
    globalThis.fetch = mock((_url: unknown, options: unknown) => {
      const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>
      if (body.source === 'indeed') {
        return Promise.resolve(new Response(
          JSON.stringify({ results: [], updatedStorageStateContent: updatedContent }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      }
      return Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    })

    try {
      await runDiscovery(undefined, 1)
      const row = prodSqlite.prepare(
        `SELECT ciphertext FROM user_secrets WHERE user_id = 1 AND key_name = 'indeed_storage_state'`
      ).get() as { ciphertext: string }
      expect(row).toBeDefined()
      const { decrypt } = await import('../lib/crypto')
      expect(decrypt(row.ciphertext)).toBe(updatedContent)
    } finally {
      prodSqlite.run(`DELETE FROM search_configs WHERE source = 'indeed'`)
    }
  })

  test('LinkedIn skipped emits onProgress message', async () => {
    const messages: string[] = []
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    )
    await runDiscovery((msg) => messages.push(msg), 1)
    expect(messages.some((m) => m.toLowerCase().includes('linkedin'))).toBe(true)
  })

  test('LinkedIn proceeds when linkedin_storage_state exists', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'job-li', title: 'PM', company: 'Corp', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )
    const { errors } = await runDiscovery(undefined, 1)
    expect(errors).toHaveLength(0)
  })

  test('LinkedIn with valid auth passes storageStatePath in request body', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )

    let capturedStorageStatePath: string | undefined
    globalThis.fetch = mock((url: unknown, options: unknown) => {
      const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>
      if (body.source === 'linkedin') capturedStorageStatePath = body.storageStatePath as string
      return Promise.resolve(new Response(
        JSON.stringify({ results: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    })

    await runDiscovery(undefined, 1)
    expect(capturedStorageStatePath).toBeDefined()
    expect(capturedStorageStatePath).toMatch(/linkedin-1-\d+\.json$/)
  })

  test('temp file is deleted after scrape (finally block)', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )

    let capturedPath: string | undefined
    globalThis.fetch = mock((_url: unknown, options: unknown) => {
      const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>
      if (body.storageStatePath) capturedPath = body.storageStatePath as string
      return Promise.resolve(new Response(
        JSON.stringify({ results: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    })

    await runDiscovery(undefined, 1)
    expect(capturedPath).toBeDefined()
    if (capturedPath) {
      const { existsSync } = await import('node:fs')
      expect(existsSync(capturedPath)).toBe(false)
    }
  })

  test('invalid ciphertext: decrypt error caught, LinkedIn skipped, no throw', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', 'fake', '2026-01-01T00:00:00.000Z')`
    )
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    )

    const { inserted, errors } = await runDiscovery(undefined, 1)
    expect(errors).toHaveLength(1)
    expect(errors[0].source).toBe('linkedin')
    expect(errors[0].error).toBe('Failed to read LinkedIn session — re-upload in Config > Connections')
    expect(inserted).toBe(0)
  })
})
