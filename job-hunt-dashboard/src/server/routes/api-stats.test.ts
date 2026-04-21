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
    red_flags TEXT,
    job_description TEXT,
    source_url TEXT,
    date_scraped TEXT,
    source TEXT,
    location TEXT,
    external_job_id TEXT,
    analysis_status TEXT,
    date_analyzed TEXT,
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

const CREATE_WEBHOOK_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhook_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    run_at TEXT NOT NULL,
    success INTEGER NOT NULL,
    item_count INTEGER,
    error_message TEXT,
    duration_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd REAL
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

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
  prodSqlite.run(CREATE_MESSAGES_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM webhook_runs')
  prodSqlite.run('DELETE FROM jobs')
  prodSqlite.run('DELETE FROM messages')
})

describe('GET /api/stats - response shape', () => {
  test('returns correct top-level keys when no data', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('jobs')
    expect(data).toHaveProperty('matches')
    expect(data).toHaveProperty('applications')
    expect(data).toHaveProperty('automation')
    expect(data).not.toHaveProperty('pipeline')
    expect(data).not.toHaveProperty('scraped')
    expect(data).not.toHaveProperty('archived')
    expect(data).not.toHaveProperty('emails')
    expect(data).not.toHaveProperty('error')
    expect(data).not.toHaveProperty('data')
  })

  test('returns empty perDay arrays and zero counts when no data', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as {
      jobs: { total: number; companies: number; sources: number; perDay: unknown[]; bySource: unknown[] }
      matches: { total: number; perDay: unknown[]; byRecommendation: unknown[] }
      applications: { total: number; perDay: unknown[]; byStatus: unknown[] }
      automation: { totalRuns: number; totalTokens: number; totalCost: number; perDay: unknown[]; costByWorkflow: unknown[] }
    }
    expect(data.jobs.total).toBe(0)
    expect(data.jobs.companies).toBe(0)
    expect(data.jobs.sources).toBe(0)
    expect(Array.isArray(data.jobs.perDay)).toBe(true)
    expect(data.jobs.perDay.length).toBe(0)
    expect(Array.isArray(data.jobs.bySource)).toBe(true)
    expect(data.matches.total).toBe(0)
    expect(Array.isArray(data.matches.perDay)).toBe(true)
    expect(Array.isArray(data.applications.byStatus)).toBe(true)
    expect(data.automation.totalRuns).toBe(0)
    expect(data.automation.totalTokens).toBe(0)
    expect(data.automation.totalCost).toBe(0)
    expect(Array.isArray(data.automation.perDay)).toBe(true)
    expect(Array.isArray(data.automation.costByWorkflow)).toBe(true)
  })
})

describe('GET /api/stats - jobs section', () => {
  test('jobs.total counts all jobs matching archivedFilter', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('A', 'Dev', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('B', 'Dev', 1)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: { total: number } }
    expect(data.jobs.total).toBe(1)
  })

  test('jobs.companies counts distinct companies', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('Acme', 'Dev', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('Acme', 'Manager', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('Beta', 'Dev', 0)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: { companies: number } }
    expect(data.jobs.companies).toBe(2)
  })

  test('jobs.sources counts distinct non-null sources', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source) VALUES ('A', 'Dev', 0, 'linkedin')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source) VALUES ('B', 'Dev', 0, 'linkedin')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source) VALUES ('C', 'Dev', 0, 'indeed')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source) VALUES ('D', 'Dev', 0, NULL)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: { sources: number } }
    expect(data.jobs.sources).toBe(2)
  })

  test('jobs.perDay groups by source key', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source, date_scraped) VALUES ('A', 'Dev', 0, 'linkedin', '2026-04-01')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source, date_scraped) VALUES ('B', 'Dev', 0, 'indeed', '2026-04-01')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source, date_scraped) VALUES ('C', 'Dev', 0, 'linkedin', '2026-04-02')`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: { perDay: { date: string; linkedin: number; indeed: number; indeed_nl: number; arc: number; manual: number }[] } }
    expect(data.jobs.perDay.length).toBe(2)
    const day1 = data.jobs.perDay.find(d => d.date === '2026-04-01')
    expect(day1?.linkedin).toBe(1)
    expect(day1?.indeed).toBe(1)
    expect(day1?.indeed_nl).toBe(0)
    expect(day1?.arc).toBe(0)
    expect(day1?.manual).toBe(0)
    const day2 = data.jobs.perDay.find(d => d.date === '2026-04-02')
    expect(day2?.linkedin).toBe(1)
  })

  test('jobs.perDay counts manual source (case-insensitive)', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source, date_scraped) VALUES ('A', 'Dev', 0, 'manual', '2026-04-01')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source, date_scraped) VALUES ('B', 'Dev', 0, 'Manual', '2026-04-01')`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: { perDay: { date: string; manual: number }[] } }
    const day1 = data.jobs.perDay.find(d => d.date === '2026-04-01')
    expect(day1?.manual).toBe(2)
  })

  test('jobs.bySource totals per known source key', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source) VALUES ('A', 'Dev', 0, 'arc')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source) VALUES ('B', 'Dev', 0, 'arc')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source) VALUES ('C', 'Dev', 0, 'indeed')`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: { bySource: { name: string; value: number }[] } }
    const arc = data.jobs.bySource.find(s => s.name === 'arc')
    const indeed = data.jobs.bySource.find(s => s.name === 'indeed')
    const linkedin = data.jobs.bySource.find(s => s.name === 'linkedin')
    const manual = data.jobs.bySource.find(s => s.name === 'manual')
    expect(arc?.value).toBe(2)
    expect(indeed?.value).toBe(1)
    expect(linkedin?.value).toBe(0)
    expect(manual?.value).toBe(0)
  })

  test('jobs.bySource counts manual source (case-insensitive)', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source) VALUES ('A', 'Dev', 0, 'manual')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, source) VALUES ('B', 'Dev', 0, 'Manual')`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: { bySource: { name: string; value: number }[] } }
    const manual = data.jobs.bySource.find(s => s.name === 'manual')
    expect(manual?.value).toBe(2)
  })
})

describe('GET /api/stats - matches section', () => {
  test('matches.total counts only apply + investigate (skip excluded)', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation) VALUES ('A', 'Dev', 0, 'apply')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation) VALUES ('B', 'Dev', 0, 'investigate')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation) VALUES ('C', 'Dev', 0, 'skip')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation) VALUES ('D', 'Dev', 0, NULL)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { matches: { total: number; apply: number; investigate: number } }
    expect(data.matches.total).toBe(2)
    expect(data.matches.apply).toBe(1)
    expect(data.matches.investigate).toBe(1)
  })

  test('matches.perDay groups by recommendation using dateScraped', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation, date_scraped) VALUES ('A', 'Dev', 0, 'apply', '2026-04-01')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation, date_scraped) VALUES ('B', 'Dev', 0, 'investigate', '2026-04-01')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation, date_scraped) VALUES ('C', 'Dev', 0, 'skip', '2026-04-01')`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { matches: { perDay: { date: string; apply: number; investigate: number }[] } }
    expect(data.matches.perDay.length).toBe(1)
    expect(data.matches.perDay[0].apply).toBe(1)
    expect(data.matches.perDay[0].investigate).toBe(1)
  })

  test('matches.byRecommendation has Apply and Investigate with capitalized names', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation) VALUES ('A', 'Dev', 0, 'apply')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation) VALUES ('B', 'Dev', 0, 'apply')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, recommendation) VALUES ('C', 'Dev', 0, 'investigate')`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { matches: { byRecommendation: { name: string; value: number }[] } }
    const apply = data.matches.byRecommendation.find(r => r.name === 'Apply')
    const investigate = data.matches.byRecommendation.find(r => r.name === 'Investigate')
    expect(apply?.value).toBe(2)
    expect(investigate?.value).toBe(1)
  })
})

describe('GET /api/stats - applications section', () => {
  test('applications.total counts applied=true jobs only', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied) VALUES ('A', 'Dev', 0, 1)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied) VALUES ('B', 'Dev', 0, 0)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { applications: { total: number } }
    expect(data.applications.total).toBe(1)
  })

  test('applications.companies counts distinct companies applied to', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied) VALUES ('Acme', 'Dev', 0, 1)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied) VALUES ('Acme', 'Manager', 0, 1)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied) VALUES ('Beta', 'Dev', 0, 1)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { applications: { companies: number } }
    expect(data.applications.companies).toBe(2)
  })

  test('applications.responses counts jobs with a matched message', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied) VALUES ('A', 'Dev', 0, 1)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied) VALUES ('B', 'Dev2', 0, 1)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied) VALUES ('C', 'Dev3', 0, 1)`)
    prodSqlite.run(`INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title) VALUES ('m1', '2026-04-01T10:00:00.000Z', 'hr@a.com', 'Re: A', 'Rejected', 'A', 'Dev')`)
    prodSqlite.run(`INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title) VALUES ('m2', '2026-04-01T11:00:00.000Z', 'hr@c.com', 'Re: C', 'Interview', 'C', 'Dev3')`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { applications: { responses: number } }
    expect(data.applications.responses).toBe(2)
  })

  test('applications.perDay groups by dateApplied and status from messages', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied, date_applied) VALUES ('A', 'Dev', 0, 1, '2026-04-01')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied, date_applied) VALUES ('B', 'Dev2', 0, 1, '2026-04-01')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied, date_applied) VALUES ('C', 'Dev3', 0, 1, '2026-04-02')`)
    prodSqlite.run(`INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title) VALUES ('m1', '2026-04-01T10:00:00.000Z', 'hr@a.com', 'Re: A', 'Rejected', 'A', 'Dev')`)
    prodSqlite.run(`INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title) VALUES ('m2', '2026-04-02T10:00:00.000Z', 'hr@c.com', 'Re: C', 'Interview', 'C', 'Dev3')`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { applications: { perDay: { date: string; 'No Response': number; Rejected: number; Interview: number }[] } }
    expect(data.applications.perDay.length).toBe(2)
    const day1 = data.applications.perDay.find(d => d.date === '2026-04-01')
    expect(day1?.Rejected).toBe(1)
    expect(day1?.['No Response']).toBe(1)
    const day2 = data.applications.perDay.find(d => d.date === '2026-04-02')
    expect(day2?.Interview).toBe(1)
  })

  test('applications.byStatus has all 7 STATUS_KEYS with zero-initialized counts', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { applications: { byStatus: { status: string; count: number }[] } }
    const keys = data.applications.byStatus.map(s => s.status)
    expect(keys).toContain('No Response')
    expect(keys).toContain('Submitted')
    expect(keys).toContain('Rejected')
    expect(keys).toContain('Screening')
    expect(keys).toContain('Interview')
    expect(keys).toContain('Offer')
    expect(keys).toContain('Other')
  })

  test('unknown message type bucketed as Other', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived, applied) VALUES ('A', 'Dev', 0, 1)`)
    prodSqlite.run(`INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title) VALUES ('m1', '2026-04-01T10:00:00.000Z', 'hr@a.com', 'Sub', 'SomeUnknown', 'A', 'Dev')`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { applications: { byStatus: { status: string; count: number }[] } }
    const other = data.applications.byStatus.find(s => s.status === 'Other')
    expect(other?.count).toBe(1)
  })
})

describe('GET /api/stats - automation section', () => {
  test('automation.totalRuns counts webhook runs', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Discovery', '2026-04-01T10:00:00.000Z', 1)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Analysis', '2026-04-01T11:00:00.000Z', 1)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { automation: { totalRuns: number } }
    expect(data.automation.totalRuns).toBe(2)
  })

  test('automation.totalTokens sums inputTokens + outputTokens (null treated as 0)', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, input_tokens, output_tokens) VALUES ('Discovery', '2026-04-01T10:00:00.000Z', 1, 100, 200)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, input_tokens, output_tokens) VALUES ('Analysis', '2026-04-01T11:00:00.000Z', 1, NULL, 50)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { automation: { totalTokens: number } }
    expect(data.automation.totalTokens).toBe(350)
  })

  test('automation.totalCost sums costUsd (null treated as 0)', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, cost_usd) VALUES ('Discovery', '2026-04-01T10:00:00.000Z', 1, 0.0100)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, cost_usd) VALUES ('Analysis', '2026-04-01T11:00:00.000Z', 1, NULL)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { automation: { totalCost: number } }
    expect(data.automation.totalCost).toBeCloseTo(0.01)
  })

  test('automation.perDay groups by workflow type using parseWorkflow', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Discovery', '2026-04-01T10:00:00.000Z', 1)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Cover Letter - Acme', '2026-04-01T11:00:00.000Z', 1)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Analysis', '2026-04-02T10:00:00.000Z', 1)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { automation: { perDay: { date: string; Discovery: number; Analysis: number; 'Cover Letter': number; Resume: number }[] } }
    expect(data.automation.perDay.length).toBe(2)
    const day1 = data.automation.perDay.find(d => d.date === '2026-04-01')
    expect(day1?.Discovery).toBe(1)
    expect(day1?.['Cover Letter']).toBe(1)
    expect(day1?.Analysis).toBe(0)
    const day2 = data.automation.perDay.find(d => d.date === '2026-04-02')
    expect(day2?.Analysis).toBe(1)
  })

  test('automation.costByWorkflow sums cost per workflow type (excludes Discovery)', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, cost_usd) VALUES ('Discovery', '2026-04-01T10:00:00.000Z', 1, 0.0050)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, cost_usd) VALUES ('Discovery', '2026-04-01T11:00:00.000Z', 1, 0.0030)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, cost_usd) VALUES ('Resume - Jane', '2026-04-01T12:00:00.000Z', 1, 0.0200)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { automation: { costByWorkflow: { workflow: string; cost: number }[] } }
    const discovery = data.automation.costByWorkflow.find(w => w.workflow === 'Discovery')
    const resume = data.automation.costByWorkflow.find(w => w.workflow === 'Resume')
    const analysis = data.automation.costByWorkflow.find(w => w.workflow === 'Analysis')
    expect(discovery).toBeUndefined()
    expect(resume?.cost).toBeCloseTo(0.02)
    expect(analysis?.cost).toBe(0)
  })
})

describe('GET /api/stats - archivedFilter', () => {
  test('archivedFilter=active (default) excludes archived jobs from jobs section', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('A', 'Dev', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('B', 'Dev', 1)`)
    const res = await statsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: { total: number } }
    expect(data.jobs.total).toBe(1)
  })

  test('archivedFilter=archived includes only archived jobs', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('A', 'Dev', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('B', 'Dev', 1)`)
    const res = await statsApp.request('/?archivedFilter=archived', { method: 'GET' })
    const data = await res.json() as { jobs: { total: number } }
    expect(data.jobs.total).toBe(1)
  })

  test('archivedFilter=all includes all jobs', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('A', 'Dev', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, archived) VALUES ('B', 'Dev', 1)`)
    const res = await statsApp.request('/?archivedFilter=all', { method: 'GET' })
    const data = await res.json() as { jobs: { total: number } }
    expect(data.jobs.total).toBe(2)
  })

  test('automation not affected by archivedFilter', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Discovery', '2026-04-01T10:00:00.000Z', 1)`)
    const [res1, res2] = await Promise.all([
      statsApp.request('/', { method: 'GET' }),
      statsApp.request('/?archivedFilter=archived', { method: 'GET' }),
    ])
    const [d1, d2] = await Promise.all([res1.json(), res2.json()]) as { automation: { totalRuns: number } }[]
    expect(d1.automation.totalRuns).toBe(1)
    expect(d2.automation.totalRuns).toBe(1)
  })
})

describe('GET /api/stats - period filter', () => {
  test('period=7d filters jobs by dateScraped cutoff', async () => {
    const now = Date.now()
    const sixDaysAgo = new Date(now - 6 * 86_400_000).toISOString().slice(0, 10)
    const eightDaysAgo = new Date(now - 8 * 86_400_000).toISOString().slice(0, 10)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, archived) VALUES ('Recent', 'Dev', '${sixDaysAgo}', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, archived) VALUES ('Old', 'Dev', '${eightDaysAgo}', 0)`)
    const res = await statsApp.request('/?period=7d', { method: 'GET' })
    const data = await res.json() as { jobs: { total: number } }
    expect(data.jobs.total).toBe(1)
  })

  test('period=all includes all jobs regardless of dateScraped', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, archived) VALUES ('A', 'Dev', '2020-01-01', 0)`)
    const [res1, res2] = await Promise.all([
      statsApp.request('/', { method: 'GET' }),
      statsApp.request('/?period=all', { method: 'GET' }),
    ])
    const [d1, d2] = await Promise.all([res1.json(), res2.json()]) as { jobs: { total: number } }[]
    expect(d1.jobs.total).toBe(1)
    expect(d2.jobs.total).toBe(1)
  })

  test('period filter applies to automation runAt', async () => {
    const now = Date.now()
    const recentIso = new Date(now - 2 * 86_400_000).toISOString()
    const oldIso = new Date(now - 8 * 86_400_000).toISOString()
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Discovery', '${recentIso}', 1)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success) VALUES ('Analysis', '${oldIso}', 1)`)
    const res = await statsApp.request('/?period=7d', { method: 'GET' })
    const data = await res.json() as { automation: { totalRuns: number } }
    expect(data.automation.totalRuns).toBe(1)
  })
})

describe('GET /api/stats - contract tests', () => {
  test('returns 200 with valid JSON', async () => {
    const res = await statsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  test('invalid period param treated as all (no reject)', async () => {
    const res = await statsApp.request('/?period=invalid', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('jobs')
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
