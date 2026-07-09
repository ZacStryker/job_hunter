process.env.ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { Database } from 'bun:sqlite'

// ---- MOCK SETUP: must precede any dynamic import that depends on these modules ----

const mockEmbed = mock(async (_text: string): Promise<number[]> => new Array(384).fill(0.1))
const mockGetOrComputeResumeEmbedding = mock(
  async (_userId: number, _resumeText: string, _profileHash: string): Promise<number[]> =>
    new Array(384).fill(0.1)
)

mock.module('./embedding-service', () => ({
  embed: mockEmbed,
  cosineSimilarity: (a: number[], b: number[]) => {
    let dot = 0, magA = 0, magB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB))
  },
}))

mock.module('./resume-embedding-cache', () => ({
  getOrComputeResumeEmbedding: mockGetOrComputeResumeEmbedding,
}))

// ---- END MOCK SETUP ----

const originalFetch = globalThis.fetch

const { runDiscovery } = await import('./discovery-service')
const { setupHealth } = await import('./setup-health')
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
    job_reqs_met TEXT,
    candidate_reqs_met TEXT,
    candidate_reqs_missed TEXT,
    job_reqs_missed TEXT,
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
    applied_at TEXT,
    date_archived TEXT,
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

const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    profile_data TEXT,
    UNIQUE(user_id)
  )
`

const CREATE_USER_EMBEDDINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_embeddings (
    user_id INTEGER PRIMARY KEY NOT NULL,
    embedding TEXT NOT NULL,
    profile_hash TEXT NOT NULL
  )
`

const CREATE_COMPANY_BLACKLIST_TABLE = `
  CREATE TABLE IF NOT EXISTS company_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    company_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_SEARCH_CONFIGS_TABLE)
  prodSqlite.run(CREATE_USER_SECRETS_TABLE)
  prodSqlite.run(CREATE_SOURCE_SETTINGS_TABLE)
  prodSqlite.run(CREATE_PROFILE_TABLE)
  prodSqlite.run(CREATE_USER_EMBEDDINGS_TABLE)
  prodSqlite.run(CREATE_COMPANY_BLACKLIST_TABLE)
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
  prodSqlite.run('DELETE FROM profile')
  prodSqlite.run('DELETE FROM user_embeddings')
  prodSqlite.run('DELETE FROM company_blacklist')
  mockEmbed.mockReset()
  mockEmbed.mockImplementation(async (_text: string) => new Array(384).fill(0.1))
  mockGetOrComputeResumeEmbedding.mockReset()
  mockGetOrComputeResumeEmbedding.mockImplementation(
    async (_userId: number, _resumeText: string, _profileHash: string) => new Array(384).fill(0.1)
  )
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
    ) as unknown as typeof fetch

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
    ) as unknown as typeof fetch

    const { inserted } = await runDiscovery(undefined, 1)
    expect(inserted).toBe(1) // only job-2
    const rows = prodSqlite.prepare('SELECT external_job_id FROM jobs ORDER BY id').all() as Array<{ external_job_id: string }>
    expect(rows.map(r => r.external_job_id)).toContain('job-1')
    expect(rows.map(r => r.external_job_id)).toContain('job-2')
  })

  test('scraper error: returns inserted=0 and non-empty errors when all searches fail', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 500 }))
    ) as unknown as typeof fetch

    const { inserted, errors } = await runDiscovery(undefined, 1)
    expect(inserted).toBe(0)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].error).toContain('500')
  })

  test('onJobsInserted: called once per source that inserts new jobs', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'job-cb1', title: 'Dev', company: 'CallbackCo', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    ) as unknown as typeof fetch

    const calls: Array<{ count: number; source: string }> = []
    await runDiscovery(undefined, 1, (count, source) => calls.push({ count, source }))

    expect(calls).toHaveLength(1)
    expect(calls[0].count).toBe(1)
    expect(calls[0].source).toBe('linkedin')
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
    ) as unknown as typeof fetch

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
    ) as unknown as typeof fetch

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
    ) as unknown as typeof fetch
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
    ) as unknown as typeof fetch

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
    ) as unknown as typeof fetch

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
    }) as unknown as typeof fetch

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
    ) as unknown as typeof fetch

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
    }) as unknown as typeof fetch

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
    }) as unknown as typeof fetch

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
    ) as unknown as typeof fetch
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
    ) as unknown as typeof fetch
    const { errors } = await runDiscovery(undefined, 1)
    expect(errors).toHaveLength(0)
  })

  test('LinkedIn with valid auth passes storageStateContent in request body', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )

    let capturedStorageStateContent: string | undefined
    globalThis.fetch = mock((_url: unknown, options: unknown) => {
      const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>
      if (body.source === 'linkedin') capturedStorageStateContent = body.storageStateContent as string
      return Promise.resolve(new Response(
        JSON.stringify({ results: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    }) as unknown as typeof fetch

    await runDiscovery(undefined, 1)
    expect(capturedStorageStateContent).toBe('{"cookies":[],"origins":[]}')
  })

  test('session is sent inline as content, never as a temp-file path', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )

    let sawStorageStatePath = false
    globalThis.fetch = mock((_url: unknown, options: unknown) => {
      const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>
      if ('storageStatePath' in body) sawStorageStatePath = true
      return Promise.resolve(new Response(
        JSON.stringify({ results: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    }) as unknown as typeof fetch

    await runDiscovery(undefined, 1)
    expect(sawStorageStatePath).toBe(false)
  })

  test('invalid ciphertext: decrypt error caught, LinkedIn skipped, no throw', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', 'fake', '2026-01-01T00:00:00.000Z')`
    )
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    ) as unknown as typeof fetch

    const { inserted, errors } = await runDiscovery(undefined, 1)
    expect(errors).toHaveLength(1)
    expect(errors[0].source).toBe('linkedin')
    expect(errors[0].error).toBe('Failed to read LinkedIn session — re-upload in Config > Connections')
    expect(inserted).toBe(0)
  })

  describe('blacklist filtering', () => {
    test('blacklisted company (title case) is not inserted — case-insensitive match', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      prodSqlite.run(`INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (1, 'acme corp', '2026-01-01T00:00:00.000Z')`)

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'bl-1', title: 'SWE', company: 'Acme Corp', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(0)
      const rows = prodSqlite.prepare('SELECT * FROM jobs WHERE external_job_id = ?').all('bl-1')
      expect(rows).toHaveLength(0)
    })

    test('blacklisted company (ALL CAPS) is not inserted — case-insensitive', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      prodSqlite.run(`INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (1, 'acme corp', '2026-01-01T00:00:00.000Z')`)

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'bl-2', title: 'SWE', company: 'ACME CORP', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(0)
    })

    test('partial name match is NOT blocked — exact normalized match required', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      prodSqlite.run(`INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (1, 'acme corp', '2026-01-01T00:00:00.000Z')`)

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'bl-3', title: 'SWE', company: 'Acme Corporation', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1)
      const rows = prodSqlite.prepare('SELECT * FROM jobs WHERE external_job_id = ?').all('bl-3')
      expect(rows).toHaveLength(1)
    })

    test('no userId — blacklist not applied even when entries exist for a user', async () => {
      prodSqlite.run(`INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (1, 'acme corp', '2026-01-01T00:00:00.000Z')`)

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'bl-4', title: 'SWE', company: 'Acme Corp', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted, bySource } = await runDiscovery(undefined, undefined)
      expect(inserted).toBe(0)
      expect(bySource['linkedin']).toBe(1)
    })

    test('empty blacklist — all deduped results are inserted normally', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'bl-5', title: 'SWE', company: 'Some Company', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1)
    })
  })

  describe('relevance scoring', () => {
    test('sets relevanceScore on new jobs when user has profile with resume text', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      prodSqlite.run(
        `INSERT INTO profile (user_id, profile_data) VALUES (1, '{"personal":{"fullName":"","email":"","phone":null,"location":null,"summary":"software engineer","websites":[]},"experience":{"jobs":[{"title":"Backend Developer","company":"Acme","startDate":"2020-01","endDate":null,"current":true,"bullets":["backend 5yrs","TypeScript"]}],"education":[],"projects":[],"certifications":[],"licences":[],"awards":[]}}')`
      )

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'job-r1', title: 'Backend Engineer', company: 'Acme', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1)
      const row = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-r1'`
      ).get() as { relevance_score: number | null }
      expect(row).not.toBeNull()
      expect(row.relevance_score).not.toBeNull()
      expect(typeof row.relevance_score).toBe('number')
      expect(row.relevance_score).toBeGreaterThanOrEqual(-1)
      expect(row.relevance_score).toBeLessThanOrEqual(1)
      expect(mockGetOrComputeResumeEmbedding).toHaveBeenCalledTimes(1)
      expect(mockEmbed).toHaveBeenCalledWith('Backend Engineer')
    })

    test('leaves relevanceScore null when user has no profile', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      // No profile row inserted

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'job-r2', title: 'Dev', company: 'Beta', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1)
      const row = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-r2'`
      ).get() as { relevance_score: number | null }
      expect(row.relevance_score).toBeNull()
      expect(mockEmbed).not.toHaveBeenCalled()
      expect(mockGetOrComputeResumeEmbedding).not.toHaveBeenCalled()
    })

    test('leaves relevanceScore null when profile has no resume text', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      // Profile exists but no resume text (only name/email)
      prodSqlite.run(`INSERT INTO profile (user_id, profile_data) VALUES (1, '{"personal":{"fullName":"Alice","email":"alice@example.com","phone":null,"location":null,"summary":null,"websites":[]},"experience":{"jobs":[],"education":[],"projects":[],"certifications":[],"licences":[],"awards":[]}}')`)

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({ results: [{ id: 'job-r3', title: 'Dev', company: 'Beta', location: null, url: null }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1)
      const row = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-r3'`
      ).get() as { relevance_score: number | null }
      expect(row.relevance_score).toBeNull()
      expect(mockEmbed).not.toHaveBeenCalled()
    })

    test('per-job embed error does not abort discovery run; other jobs scored normally', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      prodSqlite.run(
        `INSERT INTO profile (user_id, profile_data) VALUES (1, '{"personal":{"fullName":"","email":"","phone":null,"location":null,"summary":"software engineer","websites":[]},"experience":{"jobs":[{"title":"Engineer","company":"Acme","startDate":"2020-01","endDate":null,"current":true,"bullets":["backend engineer"]}],"education":[],"projects":[],"certifications":[],"licences":[],"awards":[]}}')`
      )

      let embedCallCount = 0
      mockEmbed.mockImplementation(async (text: string) => {
        embedCallCount++
        if (text === 'BadTitle') throw new Error('embed failed')
        return new Array(384).fill(0.1)
      })

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({
            results: [
              { id: 'job-good', title: 'Good Engineer', company: 'Acme', location: null, url: null },
              { id: 'job-bad', title: 'BadTitle', company: 'Fail Co', location: null, url: null },
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(2) // Both jobs inserted
      const goodRow = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-good'`
      ).get() as { relevance_score: number | null }
      const badRow = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'job-bad'`
      ).get() as { relevance_score: number | null }
      expect(goodRow.relevance_score).not.toBeNull()
      expect(badRow.relevance_score).toBeNull()
      expect(embedCallCount).toBe(2) // Both titles attempted
      expect(mockGetOrComputeResumeEmbedding).toHaveBeenCalledTimes(1) // Resume embed fetched once per run
    })

    test('profileHash is deterministic across runs — same profile produces same cache key (AC2)', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      prodSqlite.run(
        `INSERT INTO profile (user_id, profile_data) VALUES (1, '{"personal":{"fullName":"","email":"","phone":null,"location":null,"summary":"software engineer","websites":[]},"experience":{"jobs":[{"title":"Engineer","company":"Acme","startDate":"2020-01","endDate":null,"current":true,"bullets":["backend engineer"]}],"education":[],"projects":[],"certifications":[],"licences":[],"awards":[]}}')`
      )

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({
            results: [
              { id: 'job-ac2-a', title: 'Engineer A', company: 'Acme', location: null, url: null },
              { id: 'job-ac2-b', title: 'Engineer B', company: 'Beta', location: null, url: null },
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      // First run: 2 new jobs — getOrComputeResumeEmbedding called once (not per job)
      await runDiscovery(undefined, 1)
      expect(mockGetOrComputeResumeEmbedding).toHaveBeenCalledTimes(1)
      const firstHash = mockGetOrComputeResumeEmbedding.mock.calls[0][2]

      mockGetOrComputeResumeEmbedding.mockReset()
      mockGetOrComputeResumeEmbedding.mockImplementation(
        async (_userId: number, _resumeText: string, _profileHash: string) => new Array(384).fill(0.1)
      )
      mockEmbed.mockReset()
      mockEmbed.mockImplementation(async (_text: string) => new Array(384).fill(0.1))

      // Second run with new jobs — profile unchanged
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({
            results: [{ id: 'job-ac2-c', title: 'Engineer C', company: 'Gamma', location: null, url: null }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      await runDiscovery(undefined, 1)
      expect(mockGetOrComputeResumeEmbedding).toHaveBeenCalledTimes(1)
      const secondHash = mockGetOrComputeResumeEmbedding.mock.calls[0][2]

      // Unchanged profile → same hash → cache key is stable
      expect(secondHash).toBe(firstHash)
    })

    test('pre-existing jobs are not scored (AC5)', async () => {
      prodSqlite.run(
        `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
      )
      prodSqlite.run(
        `INSERT INTO profile (user_id, profile_data) VALUES (1, '{"personal":{"fullName":"","email":"","phone":null,"location":null,"summary":"software engineer","websites":[]},"experience":{"jobs":[{"title":"Engineer","company":"Acme","startDate":"2020-01","endDate":null,"current":true,"bullets":["backend engineer"]}],"education":[],"projects":[],"certifications":[],"licences":[],"awards":[]}}')`
      )
      // Pre-insert an existing job
      prodSqlite.run(
        `INSERT INTO jobs (company, job_title, external_job_id, source, user_id) VALUES ('OldCo', 'Old Job', 'existing-job-id', 'linkedin', 1)`
      )

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(
          JSON.stringify({
            results: [
              { id: 'existing-job-id', title: 'Old Job', company: 'OldCo', location: null, url: null },
              { id: 'new-job-id', title: 'New Engineer', company: 'NewCo', location: null, url: null },
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ))
      ) as unknown as typeof fetch

      const { inserted } = await runDiscovery(undefined, 1)
      expect(inserted).toBe(1) // Only the new job inserted

      const existingRow = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'existing-job-id'`
      ).get() as { relevance_score: number | null }
      const newRow = prodSqlite.prepare(
        `SELECT relevance_score FROM jobs WHERE external_job_id = 'new-job-id'`
      ).get() as { relevance_score: number | null }

      expect(existingRow.relevance_score).toBeNull() // Pre-existing job untouched
      expect(newRow.relevance_score).not.toBeNull()  // New job scored
    })
  })

  describe('passive LinkedIn health mapping (Story 48.2 AC7)', () => {
    const linkedinSecret = () => prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )

    test('sessionInvalid:true ⇒ markBroken(userId, linkedin)', async () => {
      linkedinSecret()
      const brokenSpy = spyOn(setupHealth, 'markBroken').mockImplementation(() => {})
      const healthySpy = spyOn(setupHealth, 'markHealthy').mockImplementation(() => {})
      try {
        globalThis.fetch = mock(() =>
          Promise.resolve(new Response(
            JSON.stringify({ results: [], sessionInvalid: true }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          ))
        ) as unknown as typeof fetch
        await runDiscovery(undefined, 1)
        expect(brokenSpy.mock.calls.some(([uid, task]) => uid === 1 && task === 'linkedin')).toBe(true)
        expect(healthySpy.mock.calls.some(([, task]) => task === 'linkedin')).toBe(false)
      } finally {
        brokenSpy.mockRestore()
        healthySpy.mockRestore()
      }
    })

    test('normal LinkedIn result ⇒ markHealthy(userId, linkedin)', async () => {
      linkedinSecret()
      const brokenSpy = spyOn(setupHealth, 'markBroken').mockImplementation(() => {})
      const healthySpy = spyOn(setupHealth, 'markHealthy').mockImplementation(() => {})
      try {
        globalThis.fetch = mock(() =>
          Promise.resolve(new Response(
            JSON.stringify({ results: [{ id: 'li-1', title: 'SWE', company: 'Acme', location: null, url: null }] }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          ))
        ) as unknown as typeof fetch
        await runDiscovery(undefined, 1)
        expect(healthySpy.mock.calls.some(([uid, task]) => uid === 1 && task === 'linkedin')).toBe(true)
        expect(brokenSpy.mock.calls.some(([, task]) => task === 'linkedin')).toBe(false)
      } finally {
        brokenSpy.mockRestore()
        healthySpy.mockRestore()
      }
    })

    test('a generic scraper error (HTTP 500) is inconclusive — neither broken nor healthy', async () => {
      linkedinSecret()
      const brokenSpy = spyOn(setupHealth, 'markBroken').mockImplementation(() => {})
      const healthySpy = spyOn(setupHealth, 'markHealthy').mockImplementation(() => {})
      try {
        globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 }))) as unknown as typeof fetch
        await runDiscovery(undefined, 1)
        expect(brokenSpy.mock.calls.some(([, task]) => task === 'linkedin')).toBe(false)
        expect(healthySpy.mock.calls.some(([, task]) => task === 'linkedin')).toBe(false)
      } finally {
        brokenSpy.mockRestore()
        healthySpy.mockRestore()
      }
    })
  })
})
