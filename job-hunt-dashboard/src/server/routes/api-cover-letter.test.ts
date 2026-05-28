process.env.DB_PATH = ':memory:'

import { describe, test, expect, mock, spyOn, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'

// --- Mock cover-letter-service BEFORE dynamic import ---
let mockGenerateCoverLetter: () => Promise<{ content: string; pdf: Buffer; inputTokens: number; outputTokens: number }> =
  async () => ({ content: 'Mock cover letter text', pdf: Buffer.from('%PDF-mock'), inputTokens: 100, outputTokens: 200 })

mock.module('../services/cover-letter-service', () => ({
  generateCoverLetter: () => mockGenerateCoverLetter(),
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
  const w = new Hono()
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
    role_fit TEXT,
    requirements_met TEXT,
    requirements_missed TEXT,
    red_flags TEXT,
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
    date_applied TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    resume_generated_at TEXT,
    user_id INTEGER NOT NULL DEFAULT 1,
    UNIQUE(company, job_title, user_id)
  )
`
const CREATE_COVER_LETTERS_TABLE = `
  CREATE TABLE IF NOT EXISTS cover_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    user_id INTEGER NOT NULL DEFAULT 1
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
    name TEXT, email TEXT, phone TEXT, location TEXT,
    linkedin_url TEXT, github_url TEXT, summary TEXT,
    experience TEXT, skills TEXT, education TEXT,
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
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    prodSqlite.run(
      `INSERT INTO cover_letters (job_id, content, created_at) VALUES (?, ?, ?)`,
      [row.id, 'First letter', '2026-04-01T10:00:00.000Z']
    )
    prodSqlite.run(
      `INSERT INTO cover_letters (job_id, content, created_at) VALUES (?, ?, ?)`,
      [row.id, 'Second letter', '2026-04-02T10:00:00.000Z']
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
