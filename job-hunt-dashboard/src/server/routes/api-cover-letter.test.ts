process.env.DB_PATH = ':memory:'

import { describe, test, expect, mock, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

// --- Mock cover-letter-service BEFORE dynamic import ---
let mockCallN8nWebhook: () => Promise<string> = async () => 'Mock cover letter text'

mock.module('../services/cover-letter-service', () => ({
  callN8nWebhook: () => mockCallN8nWebhook(),
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
    applied INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    status_override TEXT,
    cover_letter_sent_at TEXT,
    date_applied TEXT,
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
  mockCallN8nWebhook = async () => 'Mock cover letter text'
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

  test('returns 503 when N8N_WEBHOOK_URL is not configured', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build stuff')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    mockCallN8nWebhook = async () => { throw new Error('N8N_WEBHOOK_URL not configured') }

    const res = await jobsApp.request(`/${row.id}/generate-cover-letter`, { method: 'POST' })
    expect(res.status).toBe(503)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 502 for other webhook errors', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build stuff')`
    )
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    mockCallN8nWebhook = async () => { throw new Error('n8n webhook returned 500') }

    const res = await jobsApp.request(`/${row.id}/generate-cover-letter`, { method: 'POST' })
    expect(res.status).toBe(502)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })
})
