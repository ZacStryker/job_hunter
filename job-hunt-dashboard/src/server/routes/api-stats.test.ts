process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

const { default: statsApp } = await import('./api-stats')
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
    requirements_missed_text TEXT,
    red_flags TEXT,
    job_description TEXT,
    source_url TEXT,
    date_scraped TEXT,
    source TEXT,
    location TEXT,
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
    UNIQUE(company, job_title)
  )
`

const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL UNIQUE,
    message_id TEXT UNIQUE,
    received_at TEXT NOT NULL,
    from_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    type TEXT,
    company TEXT,
    job_title TEXT
  )
`

const CREATE_WEBHOOK_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhook_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    run_at TEXT NOT NULL,
    success INTEGER NOT NULL,
    item_count INTEGER,
    error_message TEXT
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
  prodSqlite.run(CREATE_MESSAGES_TABLE)
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
  prodSqlite.run(CREATE_COVER_LETTERS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM cover_letters')
  prodSqlite.run('DELETE FROM webhook_runs')
  prodSqlite.run('DELETE FROM messages')
  prodSqlite.run('DELETE FROM jobs')
})

describe('GET /api/stats business logic', () => {
  test('returns all-time stats with correct shape when no data', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('pipeline')
    expect(data).toHaveProperty('applications')
    expect(data).toHaveProperty('emails')
    expect(data).toHaveProperty('automation')
    expect(data).not.toHaveProperty('error')
    expect(data).not.toHaveProperty('data')
  })

  test('pipeline.total counts non-archived jobs only', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('A', 'Dev', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('B', 'Dev', 1)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { pipeline: { total: number } }
    expect(data.pipeline.total).toBe(1)
  })

  test('byRecommendation groups correctly including null→None', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, recommendation, archived) VALUES ('A', 'Dev', 'apply', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, recommendation, archived) VALUES ('B', 'Dev', NULL, 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, recommendation, archived) VALUES ('C', 'Dev', 'apply', 0)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { pipeline: { byRecommendation: { name: string; value: number }[] } }
    const recs = data.pipeline.byRecommendation
    const apply = recs.find((r) => r.name === 'apply')
    const none = recs.find((r) => r.name === 'None')
    expect(apply?.value).toBe(2)
    expect(none?.value).toBe(1)
  })

  test('byFitScore buckets correctly', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, fit_score, archived) VALUES ('A', 'Dev', 50, 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, fit_score, archived) VALUES ('B', 'Dev', 70, 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, fit_score, archived) VALUES ('C', 'Dev', 90, 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, fit_score, archived) VALUES ('D', 'Dev', NULL, 0)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { pipeline: { byFitScore: { bucket: string; count: number }[] } }
    const buckets = data.pipeline.byFitScore
    expect(buckets.find((b) => b.bucket === '50-59')?.count).toBe(1)
    expect(buckets.find((b) => b.bucket === '70-79')?.count).toBe(1)
    expect(buckets.find((b) => b.bucket === '90+')?.count).toBe(1)
  })

  test('responseRate is null when no applied jobs', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { applications: { responseRate: null } }
    expect(data.applications.responseRate).toBeNull()
  })

  test('responseRate calculated correctly', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, status_override) VALUES ('A', 'Dev', 1, 'rejected')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, status_override) VALUES ('B', 'Dev', 1, NULL)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { applications: { responseRate: number } }
    expect(data.applications.responseRate).toBe(0.5)
  })

  test('successRate is null when no webhook runs', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { automation: { successRate: null } }
    expect(data.automation.successRate).toBeNull()
  })

  test('empty arrays returned when no data (not nulls)', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as {
      pipeline: { byRecommendation: unknown[]; byFitScore: unknown[] }
      applications: { byStatus: unknown[] }
      emails: { byType: unknown[] }
      automation: { byWorkflow: unknown[] }
    }
    expect(Array.isArray(data.pipeline.byRecommendation)).toBe(true)
    expect(Array.isArray(data.pipeline.byFitScore)).toBe(true)
    expect(Array.isArray(data.applications.byStatus)).toBe(true)
    expect(Array.isArray(data.emails.byType)).toBe(true)
    expect(Array.isArray(data.automation.byWorkflow)).toBe(true)
  })

  test('period=7d filters job scraped 8 days ago and includes job scraped 6 days ago', async () => {
    const now = Date.now()
    const sixDaysAgo = new Date(now - 6 * 86_400_000).toISOString().slice(0, 10)
    const eightDaysAgo = new Date(now - 8 * 86_400_000).toISOString().slice(0, 10)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, archived) VALUES ('Recent', 'Dev', '${sixDaysAgo}', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, archived) VALUES ('Old', 'Dev', '${eightDaysAgo}', 0)`)
    const res = await statsApp.request('/?period=7d', { method: 'GET' })
    const data = await res.json() as { pipeline: { total: number } }
    expect(data.pipeline.total).toBe(1)
  })

  test('period=all returns same as no period param', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('A', 'Dev', 0)`)
    const [res1, res2] = await Promise.all([
      statsApp.request('/', { method: 'GET' }),
      statsApp.request('/?period=all', { method: 'GET' }),
    ])
    const data1 = await res1.json() as { pipeline: { total: number } }
    const data2 = await res2.json() as { pipeline: { total: number } }
    expect(data1.pipeline.total).toBe(data2.pipeline.total)
  })

  test('coverLettersGenerated filtered by datetimeCutoff', async () => {
    const now = Date.now()
    const recentIso = new Date(now - 2 * 86_400_000).toISOString()
    const oldIso = new Date(now - 8 * 86_400_000).toISOString()
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('A', 'Dev', 0)`)
    const jobId = (prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('A') as { id: number }).id
    prodSqlite.run(`INSERT INTO cover_letters (job_id, content, created_at) VALUES (${jobId}, 'text', '${recentIso}')`)
    prodSqlite.run(`INSERT INTO cover_letters (job_id, content, created_at) VALUES (${jobId}, 'text', '${oldIso}')`)
    const res = await statsApp.request('/?period=7d', { method: 'GET' })
    const data = await res.json() as { automation: { coverLettersGenerated: number } }
    expect(data.automation.coverLettersGenerated).toBe(1)
  })

  test('byWorkflow uses parseName logic', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Cover Letter - Acme Dev', '2026-04-01T10:00:00.000Z', 1)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Discovery', '2026-04-01T11:00:00.000Z', 0)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { automation: { byWorkflow: { workflow: string; success: number; failed: number }[] } }
    const coverLetter = data.automation.byWorkflow.find((w) => w.workflow === 'Cover Letter')
    const discovery = data.automation.byWorkflow.find((w) => w.workflow === 'Discovery')
    expect(coverLetter?.success).toBe(1)
    expect(coverLetter?.failed).toBe(0)
    expect(discovery?.failed).toBe(1)
  })
})

describe('GET /api/stats contract tests', () => {
  test('returns 200 with valid JSON', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  test('invalid period param treated as all (no reject)', async () => {
    const res = await statsApp.request('/?period=invalid', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('pipeline')
  })

  test('response does not have error key on success', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as Record<string, unknown>
    expect(data).not.toHaveProperty('error')
  })

  test('response does not use data envelope', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as Record<string, unknown>
    expect(data).not.toHaveProperty('data')
    expect(data).not.toHaveProperty('success')
  })
})
