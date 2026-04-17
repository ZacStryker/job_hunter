process.env.DB_PATH = ':memory:'

import { describe, test, expect, mock, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

// --- Mock cover-letter-service BEFORE dynamic import ---
let mockGenerateCoverLetter: () => Promise<string> = async () => 'Mock cover letter text'

mock.module('../services/cover-letter-service', () => ({
  generateCoverLetter: () => mockGenerateCoverLetter(),
}))

// --- Import AFTER mock ---
const { default: jobsApp } = await import('./api-jobs')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

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
    UNIQUE(company, job_title)
  )
`
const CREATE_COVER_LETTERS_TABLE = `
  CREATE TABLE IF NOT EXISTS cover_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_COVER_LETTERS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM cover_letters')
  prodSqlite.run('DELETE FROM jobs')
  mockGenerateCoverLetter = async () => 'Mock cover letter text'
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

describe('GET /:id/cover-letter/docx', () => {
  test('returns 200 with docx content-type for existing cover letter', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('Acme', 'Engineer')`)
    const jobRow = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    prodSqlite.run(
      `INSERT INTO cover_letters (job_id, content, created_at) VALUES (?, ?, ?)`,
      [jobRow.id, 'Dear Hiring Manager,\n\nGreat role.', '2026-04-15T10:00:00.000Z']
    )
    const res = await jobsApp.request(`/${jobRow.id}/cover-letter/docx`, { method: 'GET' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="Cover Letter - Acme - Engineer.docx"')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.length).toBeGreaterThan(0)
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4B)
  })

  test('returns 404 for non-existent cover letter id', async () => {
    const res = await jobsApp.request('/999/cover-letter/docx', { method: 'GET' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 400 for non-numeric id', async () => {
    const res = await jobsApp.request('/abc/cover-letter/docx', { method: 'GET' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })
})
