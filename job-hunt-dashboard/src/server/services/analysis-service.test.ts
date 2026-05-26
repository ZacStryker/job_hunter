process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

const { runAnalysis } = await import('../services/analysis-service')
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
    date_analyzed TEXT,
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

const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    summary TEXT,
    experience TEXT,
    skills TEXT,
    education TEXT,
    UNIQUE(user_id)
  )
`

const CREATE_PROMPTS_TABLE = `
  CREATE TABLE IF NOT EXISTS prompts (
    flow TEXT PRIMARY KEY NOT NULL,
    system_prompt TEXT,
    user_message TEXT NOT NULL,
    updated_at TEXT NOT NULL
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

const VALID_ANALYSIS_RESPONSE = {
  score: 85,
  role_fit: 'Strong match for senior dev role',
  red_flags: 'None',
  requirements_met: 'TypeScript, React, Node.js',
  requirements_missed: 'Kubernetes',
  salary: '$120k-$150k',
  benefits: 'Remote, health insurance',
  contact_name: 'Jane Smith',
  contact_email: 'jane@acme.com',
  contact_phone: null,
  recommended_action: 'apply',
}

let originalFetch: typeof globalThis.fetch

beforeAll(() => {
  originalFetch = globalThis.fetch
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_PROFILE_TABLE)
  prodSqlite.run(CREATE_PROMPTS_TABLE)
  prodSqlite.run(CREATE_USER_SECRETS_TABLE)
  process.env.SCRAPER_URL = 'http://test-scraper.invalid'
  process.env.SCRAPER_TOKEN = 'test-token'
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM jobs')
  prodSqlite.run('DELETE FROM profile')
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function insertPendingJob(overrides: Partial<Record<string, unknown>> = {}) {
  prodSqlite.run(
    `INSERT INTO jobs (company, job_title, source, source_url, external_job_id, analysis_status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [
      overrides.company ?? 'Acme Corp',
      overrides.job_title ?? 'Senior Engineer',
      overrides.source ?? 'linkedin',
      overrides.source_url ?? 'https://linkedin.com/jobs/view/123',
      overrides.external_job_id ?? 'ext-job-1',
    ]
  )
  return prodSqlite.prepare('SELECT id FROM jobs ORDER BY id DESC LIMIT 1').get() as { id: number }
}

function mockFetchSuccess(scraperDescription = 'We are building AI products.', usage = { input_tokens: 50, output_tokens: 30 }): void {
  globalThis.fetch = mock((url: string) => {
    if (String(url).includes('scrape/listing')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ description: scraperDescription }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }
    // Anthropic call
    return Promise.resolve(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify(VALID_ANALYSIS_RESPONSE) }],
          usage,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  }) as typeof globalThis.fetch
}

describe('runAnalysis()', () => {
  test('happy path: writes all fields to DB and returns processed=1, failed=0', async () => {
    const { id } = insertPendingJob()
    mockFetchSuccess('Job description text.')

    const result = await runAnalysis(undefined, 1)

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)

    const row = prodSqlite
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(id) as Record<string, unknown>

    expect(row.analysis_status).toBe('done')
    expect(row.date_analyzed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(row.fit_score).toBe(85)
    expect(row.recommendation).toBe('apply')
    expect(row.role_fit).toBe('Strong match for senior dev role')
    expect(row.requirements_met).toBe('TypeScript, React, Node.js')
    expect(row.requirements_missed).toBe('Kubernetes')
    expect(row.red_flags).toBe('None')
    expect(row.job_description).toBe('Job description text.')
    expect(row.salary).toBe('$120k-$150k')
    expect(row.benefits).toBe('Remote, health insurance')
    expect(row.contact_name).toBe('Jane Smith')
    expect(row.contact_email).toBe('jane@acme.com')
    expect(row.contact_phone).toBeNull()
  })

  test('scraper failure: continues to Anthropic with empty description — job is NOT marked failed', async () => {
    const { id } = insertPendingJob()

    globalThis.fetch = mock((url: string) => {
      if (String(url).includes('scrape/listing')) {
        // Scraper returns an error
        return Promise.resolve(new Response(null, { status: 500 }))
      }
      // Anthropic still called with empty description
      return Promise.resolve(
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(VALID_ANALYSIS_RESPONSE) }], usage: { input_tokens: 50, output_tokens: 30 } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }) as typeof globalThis.fetch

    const result = await runAnalysis(undefined, 1)

    // Job should still be processed successfully — scraper failure is non-fatal
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)

    const row = prodSqlite.prepare('SELECT analysis_status, job_description FROM jobs WHERE id = ?').get(id) as {
      analysis_status: string; job_description: string | null
    }
    expect(row.analysis_status).toBe('done')
    expect(row.job_description).toBeNull()  // no description since scraper failed
  })

  test('Anthropic error: marks job as failed', async () => {
    const { id } = insertPendingJob()
    globalThis.fetch = mock((url: string) => {
      if (String(url).includes('scrape/listing')) {
        return Promise.resolve(
          new Response(JSON.stringify({ description: 'desc' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      }
      return Promise.resolve(new Response(null, { status: 500 }))
    }) as typeof globalThis.fetch

    const result = await runAnalysis(undefined, 1)

    expect(result.failed).toBe(1)
    expect(result.processed).toBe(0)

    const row = prodSqlite.prepare('SELECT analysis_status FROM jobs WHERE id = ?').get(id) as { analysis_status: string }
    expect(row.analysis_status).toBe('failed')
  })

  test('JSON parse failure: marks job as failed', async () => {
    const { id } = insertPendingJob()
    globalThis.fetch = mock((url: string) => {
      if (String(url).includes('scrape/listing')) {
        return Promise.resolve(
          new Response(JSON.stringify({ description: 'desc' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      }
      // Anthropic returns non-JSON text
      return Promise.resolve(
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: 'I cannot analyze this job.' }], usage: { input_tokens: 10, output_tokens: 5 } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }) as typeof globalThis.fetch

    const result = await runAnalysis(undefined, 1)

    expect(result.failed).toBe(1)
    const row = prodSqlite.prepare('SELECT analysis_status FROM jobs WHERE id = ?').get(id) as { analysis_status: string }
    expect(row.analysis_status).toBe('failed')
  })

  test('missing profile: does not throw, proceeds with default system prompt', async () => {
    insertPendingJob()
    mockFetchSuccess()
    // No profile row inserted

    const result = await runAnalysis(undefined, 1)
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)
  })

  test('missing ANTHROPIC_API_KEY: throws before any DB changes', async () => {
    const original = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    insertPendingJob()

    await expect(runAnalysis(undefined, 1)).rejects.toThrow('ANTHROPIC_API_KEY not configured')

    process.env.ANTHROPIC_API_KEY = original

    // Job should NOT be marked analyzing — the throw happened before any DB write
    const row = prodSqlite.prepare('SELECT analysis_status FROM jobs').get() as { analysis_status: string }
    expect(row.analysis_status).toBe('pending')
  })

  test('skip recommendation: sets archived=1 in DB', async () => {
    const { id } = insertPendingJob()

    globalThis.fetch = mock((url: string) => {
      if (String(url).includes('scrape/listing')) {
        return Promise.resolve(
          new Response(JSON.stringify({ description: 'desc' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify({ ...VALID_ANALYSIS_RESPONSE, recommended_action: 'skip' }) }],
            usage: { input_tokens: 50, output_tokens: 30 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }) as typeof globalThis.fetch

    const result = await runAnalysis(undefined, 1)

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)

    const row = prodSqlite
      .prepare('SELECT analysis_status, recommendation, archived FROM jobs WHERE id = ?')
      .get(id) as { analysis_status: string; recommendation: string; archived: number }

    expect(row.analysis_status).toBe('done')
    expect(row.recommendation).toBe('skip')
    expect(row.archived).toBe(1)
  })

  test('apply recommendation: does NOT set archived', async () => {
    const { id } = insertPendingJob()
    mockFetchSuccess()

    await runAnalysis(undefined, 1)

    const row = prodSqlite
      .prepare('SELECT archived FROM jobs WHERE id = ?')
      .get(id) as { archived: number }

    expect(row.archived).toBe(0)
  })

  test('onProgress: emits found message and per-job messages', async () => {
    insertPendingJob({ company: 'Acme Corp', job_title: 'Senior Engineer', external_job_id: 'ext-prog-1' })
    insertPendingJob({ company: 'Beta Inc', job_title: 'Dev Lead', external_job_id: 'ext-prog-2' })
    mockFetchSuccess()

    const messages: string[] = []
    await runAnalysis((msg) => messages.push(msg), 1)

    expect(messages[0]).toBe('Found 2 jobs to analyze')
    expect(messages[1]).toMatch(/^Analyzing 1 \/ 2: /)
    expect(messages[2]).toMatch(/^Analyzing 2 \/ 2: /)
  })

  test('returns inputTokens and outputTokens from Anthropic response', async () => {
    insertPendingJob()
    mockFetchSuccess('desc', { input_tokens: 150, output_tokens: 75 })

    const result = await runAnalysis(undefined, 1)

    expect(result.inputTokens).toBe(150)
    expect(result.outputTokens).toBe(75)
  })

  test('accumulates tokens across multiple jobs in batch', async () => {
    insertPendingJob({ company: 'Company A', job_title: 'Job A', external_job_id: 'ext-a' })
    insertPendingJob({ company: 'Company B', job_title: 'Job B', external_job_id: 'ext-b' })
    mockFetchSuccess('desc', { input_tokens: 100, output_tokens: 50 })

    const result = await runAnalysis(undefined, 1)

    expect(result.processed).toBe(2)
    expect(result.inputTokens).toBe(200)
    expect(result.outputTokens).toBe(100)
  })

  test('failed jobs contribute 0 tokens', async () => {
    insertPendingJob({ company: 'Good Co', job_title: 'Good Job', external_job_id: 'ext-good' })
    insertPendingJob({ company: 'Bad Co', job_title: 'Bad Job', external_job_id: 'ext-bad' })

    let callCount = 0
    globalThis.fetch = mock((url: string) => {
      if (String(url).includes('scrape/listing')) {
        return Promise.resolve(new Response(JSON.stringify({ description: 'desc' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      callCount++
      if (callCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify(VALID_ANALYSIS_RESPONSE) }],
          usage: { input_tokens: 80, output_tokens: 40 },
        }), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      // Second job Anthropic call fails
      return Promise.resolve(new Response(null, { status: 500 }))
    }) as typeof globalThis.fetch

    const result = await runAnalysis(undefined, 1)

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.inputTokens).toBe(80)
    expect(result.outputTokens).toBe(40)
  })

  test('pre-stored jobDescription: skips scraper, passes description to Anthropic, retains in DB', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, source, source_url, external_job_id, analysis_status, job_description)
       VALUES ('PreDesc Co', 'Staff Engineer', 'manual', 'https://example.com/jobs/123', 'ext-pre-1', 'pending', 'We build developer tools for AI teams.')`,
    )
    const { id } = prodSqlite.prepare('SELECT id FROM jobs ORDER BY id DESC LIMIT 1').get() as { id: number }

    let scraperCalled = false
    let anthropicBody: Record<string, unknown> | null = null

    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      if (String(url).includes('scrape/listing')) {
        scraperCalled = true
        return Promise.resolve(new Response(null, { status: 500 }))
      }
      anthropicBody = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify(VALID_ANALYSIS_RESPONSE) }],
            usage: { input_tokens: 40, output_tokens: 20 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }) as typeof globalThis.fetch

    const result = await runAnalysis(undefined, 1)

    expect(scraperCalled).toBe(false)
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)

    const messages = (anthropicBody?.messages as Array<{ content: string }> | undefined) ?? []
    expect(messages[0]?.content).toContain('We build developer tools for AI teams.')

    const row = prodSqlite.prepare('SELECT job_description, analysis_status FROM jobs WHERE id = ?').get(id) as {
      job_description: string | null; analysis_status: string
    }
    expect(row.job_description).toBe('We build developer tools for AI teams.')
    expect(row.analysis_status).toBe('done')
  })

  test('processes only up to 10 pending jobs per run', async () => {
    for (let i = 1; i <= 12; i++) {
      prodSqlite.run(
        `INSERT INTO jobs (company, job_title, source, external_job_id, analysis_status)
         VALUES (?, ?, 'linkedin', ?, 'pending')`,
        [`Company${i}`, `Job${i}`, `ext-${i}`]
      )
    }
    mockFetchSuccess()

    const result = await runAnalysis(undefined, 1)

    expect(result.processed + result.failed).toBe(10)
    const doneCount = (prodSqlite.prepare("SELECT COUNT(*) as c FROM jobs WHERE analysis_status = 'done'").get() as { c: number }).c
    expect(doneCount).toBe(10)
    const pendingCount = (prodSqlite.prepare("SELECT COUNT(*) as c FROM jobs WHERE analysis_status = 'pending'").get() as { c: number }).c
    expect(pendingCount).toBe(2)
  })
})
