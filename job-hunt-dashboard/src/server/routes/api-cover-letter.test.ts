process.env.DB_PATH = ':memory:'

import { describe, test, expect, mock, spyOn, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { Database } from 'bun:sqlite'

// --- Mock cover-letter-service BEFORE dynamic import ---
let mockGenerateCoverLetter: () => Promise<{ content: string; pdf: Buffer; inputTokens: number; outputTokens: number }> =
  async () => ({ content: 'Mock cover letter text', pdf: Buffer.from('%PDF-mock'), inputTokens: 100, outputTokens: 200 })

// renderCoverLetterPdf is the no-Anthropic render path that edit and restore take. It is mocked for
// the same reason generateCoverLetter is: unmocked it reaches Playwright, and a Playwright test in
// this suite hangs rather than fails.
let mockRenderCoverLetterPdf: (content: string, userId: number) => Promise<Buffer> =
  async () => Buffer.from('%PDF-mock')

mock.module('../services/cover-letter-service', () => ({
  generateCoverLetter: () => mockGenerateCoverLetter(),
  renderCoverLetterPdf: (content: string, userId: number) => mockRenderCoverLetterPdf(content, userId),
}))

// Prevent real Playwright PDF launch from cover-letter-service
mock.module('../services/generate-pdf', () => ({
  generatePdf: async () => Buffer.from('%PDF-mock'),
}))

// Prevent real file system writes from route handler
mock.module('node:fs', () => ({
  mkdirSync: () => {},
  renameSync: () => {},
}))

spyOn(Bun, 'write').mockResolvedValue(0)

// --- Import AFTER mock ---
const { default: jobsRoute } = await import('./api-jobs')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const jobsApp = (() => {
  const w = new Hono<AppEnv>()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', jobsRoute)
  return w
})()

const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    job_title TEXT NOT NULL,
    fit_score INTEGER,
    recommendation TEXT,
    job_reqs_met TEXT,
    candidate_reqs_met TEXT,
    candidate_reqs_missed TEXT,
    job_reqs_missed TEXT,
    job_description TEXT,
    source_url TEXT,
    date_scraped TEXT,
    source TEXT,
    location TEXT,
    external_job_id TEXT,
    relevance_score REAL,
    analysis_status TEXT,
    salary TEXT,
    benefits TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    applied INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    status_override TEXT,
    cover_letter_sent_at TEXT,
    generation_context TEXT,
    date_applied TEXT,
    applied_at TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    resume_generated_at TEXT,
    user_id INTEGER NOT NULL DEFAULT 1,
    UNIQUE(company, job_title, user_id)
  )
`
// Identical, column for column, to `coverLetters` in schema.ts and to the DDL in every other test
// file. One bun test process shares one in-memory DB, so the first CREATE TABLE IF NOT EXISTS to run
// defines this table for the WHOLE suite — a divergent copy breaks other files, and only in the full
// run. These five copies previously disagreed four ways (a DEFAULT here, no user_id at all there),
// which is what made `returns 200 with most recent cover letter` red on a clean checkout.
const CREATE_COVER_LETTERS_TABLE = `
  CREATE TABLE IF NOT EXISTS cover_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'generated'
  )
`
const CREATE_WEBHOOK_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhook_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, run_at TEXT NOT NULL,
    success INTEGER NOT NULL, item_count INTEGER, error_message TEXT,
    duration_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL,
    matched_count INTEGER, archived_count INTEGER, source_breakdown TEXT
  )
`
const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    profile_data TEXT,
    UNIQUE(user_id)
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_COVER_LETTERS_TABLE)
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
  prodSqlite.run(CREATE_PROFILE_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM cover_letters')
  prodSqlite.run('DELETE FROM jobs')
  mockGenerateCoverLetter = async () => ({ content: 'Mock cover letter text', pdf: Buffer.from('%PDF-mock'), inputTokens: 100, outputTokens: 200 })
  mockRenderCoverLetterPdf = async () => Buffer.from('%PDF-mock')
})

// Seeds a job owned by `userId` plus one 'generated' letter, and returns both ids.
function seedJobWithLetter(userId = 1, company = 'Acme'): { jobId: number; letterId: number } {
  prodSqlite.run(
    `INSERT INTO jobs (company, job_title, job_description, user_id) VALUES (?, 'Engineer', 'Build stuff', ?)`,
    [company, userId]
  )
  const jobId = (prodSqlite.query('SELECT last_insert_rowid() AS id').get() as { id: number }).id
  prodSqlite.run(
    `INSERT INTO cover_letters (job_id, user_id, content, created_at, source) VALUES (?, ?, ?, ?, 'generated')`,
    [jobId, userId, 'Original letter', '2026-04-01T10:00:00.000Z']
  )
  const letterId = (prodSqlite.query('SELECT last_insert_rowid() AS id').get() as { id: number }).id
  return { jobId, letterId }
}

const rowsFor = (jobId: number) =>
  prodSqlite.query('SELECT id, content, source, user_id FROM cover_letters WHERE job_id = ? ORDER BY id')
    .all(jobId) as Array<{ id: number; content: string; source: string; user_id: number }>

describe('PUT /:id/cover-letter', () => {
  test('inserts a NEW edited version and leaves the original intact', async () => {
    const { jobId, letterId } = seedJobWithLetter()

    const res = await jobsApp.request(`/${jobId}/cover-letter`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'My edited prose' }),
    })
    expect(res.status).toBe(200)

    // Append-only: the edit is an INSERT, not an UPDATE. The original must still be there — that is
    // what makes the edit reversible, and what lets G6 restore it.
    const rows = rowsFor(jobId)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: letterId, content: 'Original letter', source: 'generated' })
    expect(rows[1]).toMatchObject({ content: 'My edited prose', source: 'edited' })
  })

  test('bumps jobs.cover_letter_sent_at — the PDF cache-buster', async () => {
    const { jobId } = seedJobWithLetter()
    prodSqlite.run(`UPDATE jobs SET cover_letter_sent_at = '2026-04-01T10:00:00.000Z' WHERE id = ?`, [jobId])

    const res = await jobsApp.request(`/${jobId}/cover-letter`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Edited' }),
    })
    expect(res.status).toBe(200)

    // Both the preview iframe and the Download link cache-bust on this value. If it does not move,
    // the browser serves the previous PDF and the save looks lost.
    const job = prodSqlite.query('SELECT cover_letter_sent_at AS t FROM jobs WHERE id = ?')
      .get(jobId) as { t: string }
    expect(job.t).not.toBe('2026-04-01T10:00:00.000Z')
  })

  test('blank / whitespace-only content → 400, nothing written', async () => {
    const { jobId } = seedJobWithLetter()
    const res = await jobsApp.request(`/${jobId}/cover-letter`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '   ' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(rowsFor(jobId)).toHaveLength(1)
  })

  test('oversized content → 400', async () => {
    const { jobId } = seedJobWithLetter()
    const res = await jobsApp.request(`/${jobId}/cover-letter`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x'.repeat(20001) }),
    })
    expect(res.status).toBe(400)
    expect(rowsFor(jobId)).toHaveLength(1)
  })

  // Tenant isolation, proven not assumed: the app fixes userId=1, so seed as user 2 and act as user 1.
  test("on another user's job → 404, and their letter is untouched", async () => {
    const { jobId } = seedJobWithLetter(2, 'Tenant')

    const res = await jobsApp.request(`/${jobId}/cover-letter`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'I should not be able to write this' }),
    })
    expect(res.status).toBe(404)

    const rows = rowsFor(jobId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ content: 'Original letter', user_id: 2 })
  })
})

describe('GET /:id/cover-letter/versions', () => {
  test('returns versions newest first', async () => {
    const { jobId } = seedJobWithLetter()
    prodSqlite.run(
      `INSERT INTO cover_letters (job_id, user_id, content, created_at, source) VALUES (?, 1, 'Newer', '2026-04-02T10:00:00.000Z', 'edited')`,
      [jobId]
    )

    const res = await jobsApp.request(`/${jobId}/cover-letter/versions`, { method: 'GET' })
    expect(res.status).toBe(200)
    const { versions } = await res.json() as { versions: Array<{ source: string; createdAt: string }> }
    expect(versions).toHaveLength(2)
    expect(versions[0]).toMatchObject({ source: 'edited', createdAt: '2026-04-02T10:00:00.000Z' })
    expect(versions[1]).toMatchObject({ source: 'generated', createdAt: '2026-04-01T10:00:00.000Z' })
  })

  test('job with no letter yet → 200 with [], not 404', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, user_id) VALUES ('Empty', 'Engineer', 1)`)
    const jobId = (prodSqlite.query('SELECT last_insert_rowid() AS id').get() as { id: number }).id

    const res = await jobsApp.request(`/${jobId}/cover-letter/versions`, { method: 'GET' })
    expect(res.status).toBe(200)
    const { versions } = await res.json() as { versions: unknown[] }
    expect(versions).toEqual([])
  })

  test("on another user's job → 404", async () => {
    const { jobId } = seedJobWithLetter(2, 'Tenant')
    const res = await jobsApp.request(`/${jobId}/cover-letter/versions`, { method: 'GET' })
    expect(res.status).toBe(404)
  })
})

describe('POST /:id/cover-letter/versions/:versionId/restore', () => {
  test('copies the old version forward as a new row, destroying nothing', async () => {
    const { jobId, letterId } = seedJobWithLetter()
    prodSqlite.run(
      `INSERT INTO cover_letters (job_id, user_id, content, created_at, source) VALUES (?, 1, 'Edited prose', '2026-04-02T10:00:00.000Z', 'edited')`,
      [jobId]
    )

    const res = await jobsApp.request(`/${jobId}/cover-letter/versions/${letterId}/restore`, { method: 'POST' })
    expect(res.status).toBe(200)

    // Three rows now: original, edit, and the restored copy. Restore is never destructive — the edit
    // it superseded is still there and still restorable.
    const rows = rowsFor(jobId)
    expect(rows).toHaveLength(3)
    expect(rows[0].content).toBe('Original letter')
    expect(rows[1].content).toBe('Edited prose')
    expect(rows[2]).toMatchObject({ content: 'Original letter', source: 'generated' })
  })

  test("a versionId from a DIFFERENT job of the same user → 404", async () => {
    const { jobId } = seedJobWithLetter(1, 'Acme')
    const other = seedJobWithLetter(1, 'Globex')

    // Same owner, wrong job. Scoping on userId alone would let one job restore another's history.
    const res = await jobsApp.request(`/${jobId}/cover-letter/versions/${other.letterId}/restore`, { method: 'POST' })
    expect(res.status).toBe(404)
    expect(rowsFor(jobId)).toHaveLength(1)
  })

  test("on another user's job → 404, and their letter is untouched", async () => {
    const { jobId, letterId } = seedJobWithLetter(2, 'Tenant')

    const res = await jobsApp.request(`/${jobId}/cover-letter/versions/${letterId}/restore`, { method: 'POST' })
    expect(res.status).toBe(404)

    const rows = rowsFor(jobId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ content: 'Original letter', user_id: 2 })
  })
})

describe('POST /:id/generate-cover-letter', () => {
  test('returns 200 and stores cover letter', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build stuff')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }

    const res = await jobsApp.request(`/${row.id}/generate-cover-letter`, { method: 'POST' })
    expect(res.status).toBe(200)
    const data = await res.json() as { coverLetter: { content: string; jobId: number } }
    expect(data.coverLetter.content).toBe('Mock cover letter text')
    expect(data.coverLetter.jobId).toBe(row.id)

    const job = prodSqlite.query('SELECT cover_letter_sent_at FROM jobs WHERE id = ?').get(row.id) as { cover_letter_sent_at: string }
    expect(job.cover_letter_sent_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('returns 400 for non-numeric id', async () => {
    const res = await jobsApp.request('/abc/generate-cover-letter', { method: 'POST' })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 404 for non-existent job', async () => {
    const res = await jobsApp.request('/999/generate-cover-letter', { method: 'POST' })
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 400 when job has no job description', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('Acme', 'Engineer')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }

    const res = await jobsApp.request(`/${row.id}/generate-cover-letter`, { method: 'POST' })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data.error).toBe('Job has no job description')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 503 when ANTHROPIC_API_KEY is not configured', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build stuff')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    mockGenerateCoverLetter = async () => { throw new Error('ANTHROPIC_API_KEY not configured') }

    const res = await jobsApp.request(`/${row.id}/generate-cover-letter`, { method: 'POST' })
    expect(res.status).toBe(503)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 502 for other generation errors', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build stuff')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    mockGenerateCoverLetter = async () => { throw new Error('Anthropic error 500') }

    const res = await jobsApp.request(`/${row.id}/generate-cover-letter`, { method: 'POST' })
    expect(res.status).toBe(502)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })
})

describe('GET /:id/cover-letter', () => {
  test('returns 200 with most recent cover letter', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build stuff')`
    )
    // last_insert_rowid(), not `SELECT id FROM jobs LIMIT 1` — the shared in-memory DB means LIMIT 1
    // can return a job another file seeded first.
    const row = prodSqlite.query('SELECT last_insert_rowid() AS id').get() as { id: number }
    // user_id is explicit. It used to be omitted, relying on a `DEFAULT 1` that existed ONLY in this
    // file's copy of the cover_letters DDL — so in the full run, where another file's copy (no
    // default) won the CREATE TABLE IF NOT EXISTS race, these inserts died on a NOT NULL constraint.
    // That is why this test passed alone and failed together. The five DDLs are now identical.
    prodSqlite.run(
      `INSERT INTO cover_letters (job_id, user_id, content, created_at) VALUES (?, ?, ?, ?)`,
      [row.id, 1, 'First letter', '2026-04-01T10:00:00.000Z']
    )
    prodSqlite.run(
      `INSERT INTO cover_letters (job_id, user_id, content, created_at) VALUES (?, ?, ?, ?)`,
      [row.id, 1, 'Second letter', '2026-04-02T10:00:00.000Z']
    )
    const res = await jobsApp.request(`/${row.id}/cover-letter`, { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { coverLetter: { content: string } }
    expect(data.coverLetter.content).toBe('Second letter')
  })

  test('returns 404 when no cover letter exists', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title) VALUES ('Acme', 'Engineer')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    const res = await jobsApp.request(`/${row.id}/cover-letter`, { method: 'GET' })
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data.error).toBe('No cover letter found')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 400 for non-numeric id', async () => {
    const res = await jobsApp.request('/abc/cover-letter', { method: 'GET' })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data.error).toBe('Invalid job id')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 400 for id=0', async () => {
    const res = await jobsApp.request('/0/cover-letter', { method: 'GET' })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data.error).toBe('Invalid job id')
    expect(data).not.toHaveProperty('message')
  })
})

describe('GET /:id/cover-letter/pdf', () => {
  test('returns 400 for non-numeric id', async () => {
    const res = await jobsApp.request('/abc/cover-letter/pdf', { method: 'GET' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })

  test('returns 404 when job does not exist', async () => {
    const res = await jobsApp.request('/999/cover-letter/pdf', { method: 'GET' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 404 when cover letter PDF file does not exist on disk', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('FileMiss Co', 'Engineer')`)
    const row = prodSqlite.query("SELECT id FROM jobs WHERE company = 'FileMiss Co' LIMIT 1").get() as { id: number }
    const res = await jobsApp.request(`/${row.id}/cover-letter/pdf`, { method: 'GET' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Cover letter PDF not found')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 200 with application/pdf and inline content-disposition when file exists', async () => {
    const { join } = await import('node:path')
    const { mkdir, writeFile, unlink } = await import('node:fs/promises')
    const clDir = join(process.cwd(), 'data', 'cover-letters')
    await mkdir(clDir, { recursive: true })

    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('Inline CL Co', 'Viewer')`)
    const row = prodSqlite.query("SELECT id FROM jobs WHERE company = 'Inline CL Co' LIMIT 1").get() as { id: number }
    const filePath = join(clDir, `${row.id}.pdf`)
    await writeFile(filePath, Buffer.from('%PDF-1.4 cover-letter-test'))

    try {
      const res = await jobsApp.request(`/${row.id}/cover-letter/pdf`, { method: 'GET' })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/pdf')
      const cd = res.headers.get('content-disposition') ?? ''
      expect(cd).toContain('inline')
      expect(cd).toContain('.pdf')
      expect(cd).toContain('Cover Letter')
    } finally {
      await unlink(filePath).catch(() => {})
    }
  })
})
