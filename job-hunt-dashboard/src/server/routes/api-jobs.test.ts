process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

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

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM jobs')
})

describe('GET /api/jobs', () => {
  test('returns 200 with empty jobs array when DB is empty', async () => {
    const res = await jobsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { jobs: unknown[] }
    expect(data).toHaveProperty('jobs')
    expect(data.jobs).toEqual([])
  })

  test('returns 200 with all jobs in camelCase', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, fit_score, applied) VALUES ('Acme', 'Engineer', 85, 0)`
    )
    const res = await jobsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { jobs: Record<string, unknown>[] }
    expect(data.jobs).toHaveLength(1)
    const job = data.jobs[0]
    expect(job).toHaveProperty('id')
    expect(job).toHaveProperty('jobTitle')       // camelCase — NOT job_title
    expect(job).toHaveProperty('fitScore')       // camelCase — NOT fit_score
    expect(job).toHaveProperty('applied')
    expect(job.company).toBe('Acme')
    expect(job.jobTitle).toBe('Engineer')
    expect(job.fitScore).toBe(85)
    expect(job.applied).toBe(false)              // boolean, not 0
    // AC1: missing optional fields must be explicit null, not undefined
    expect(job.recommendation).toBeNull()
    expect(job.sourceUrl).toBeNull()
    expect(job.roleFit).toBeNull()
    expect(job.dateScraped).toBeNull()
  })
})
