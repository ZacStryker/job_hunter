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

const CREATE_STATUS_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_STATUS_EVENTS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM status_events')
  prodSqlite.run('DELETE FROM jobs')
})

describe('PATCH /api/jobs/:id', () => {
  test('returns 200 with updated job when applied is set to true', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Engineer', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied: true }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data).toHaveProperty('job')
    expect(data.job.applied).toBe(true)
    expect(typeof data.job.dateApplied).toBe('string')
    expect(data.job.company).toBe('Acme')  // Sheets-owned field unchanged
  })

  test('clears dateApplied when applied is set to false', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Beta', 'Dev', 1, '2026-04-01')`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Beta') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied: false }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.applied).toBe(false)
    expect(data.job.dateApplied).toBeNull()
  })

  test('returns 200 with updated statusOverride', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Corp', 'PM', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Corp') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusOverride: 'rejected' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.statusOverride).toBe('rejected')
  })

  test('clears statusOverride when set to null', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, status_override) VALUES ('Dex', 'QA', 0, 'interview')`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Dex') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusOverride: null }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.statusOverride).toBeNull()
  })

  test('returns 400 with error key when body is empty', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Empty', 'Dev', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Empty') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 404 with error key when job not found', async () => {
    const res = await jobsApp.request('/99999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied: true }),
    })
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })

  test('returns 400 with error key for invalid id', async () => {
    const res = await jobsApp.request('/abc', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied: true }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })

  test('does not overwrite Sheets-owned fields on PATCH', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, fit_score, applied) VALUES ('Sheets', 'Analyst', 90, 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Sheets') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied: true }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.company).toBe('Sheets')
    expect(data.job.fitScore).toBe(90)
  })
})

describe('GET /api/jobs/:id/events', () => {
  test('returns 200 with empty events array for job with no events', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Eng', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }
    const res = await jobsApp.request(`/${row.id}/events`, { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { events: unknown[] }
    expect(data).toHaveProperty('events')
    expect(data.events).toEqual([])
  })

  test('returns 404 with error key for non-existent job', async () => {
    const res = await jobsApp.request('/99999/events', { method: 'GET' })
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('PATCH with statusOverride writes a status_events row', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Eng', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }

    await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusOverride: 'rejected' }),
    })

    const event = prodSqlite
      .query('SELECT * FROM status_events WHERE job_id = ?')
      .get(row.id) as { status: string; timestamp: string } | null

    expect(event).not.toBeNull()
    expect(event!.status).toBe('rejected')
    expect(event!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('PATCH with statusOverride null does not write a status_events row', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, status_override) VALUES ('Beta', 'Dev', 0, 'interview')`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Beta') as { id: number }

    await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusOverride: null }),
    })

    const count = prodSqlite
      .query('SELECT COUNT(*) as n FROM status_events WHERE job_id = ?')
      .get(row.id) as { n: number }

    expect(count.n).toBe(0)
  })

  test('PATCH with applied only (no statusOverride) does not write a status_events row', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Corp', 'PM', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Corp') as { id: number }

    await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied: true }),
    })

    const count = prodSqlite
      .query('SELECT COUNT(*) as n FROM status_events WHERE job_id = ?')
      .get(row.id) as { n: number }

    expect(count.n).toBe(0)
  })

  test('PATCH statusOverride twice returns 2 events in reverse-chronological order', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Dex', 'QA', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Dex') as { id: number }

    await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusOverride: 'phone_screen' }),
    })

    // Small delay to ensure distinct timestamps
    await new Promise((resolve) => setTimeout(resolve, 5))

    await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusOverride: 'interview' }),
    })

    const res = await jobsApp.request(`/${row.id}/events`, { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { events: { status: string; timestamp: string }[] }
    expect(data.events).toHaveLength(2)
    expect(data.events[0].status).toBe('interview')
    expect(data.events[1].status).toBe('phone_screen')
    expect(data.events[0].timestamp >= data.events[1].timestamp).toBe(true)
  })

  test('PATCH same statusOverride value twice writes only one event row', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Eko', 'Dev', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Eko') as { id: number }

    await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusOverride: 'rejected' }),
    })

    await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusOverride: 'rejected' }),
    })

    const count = prodSqlite
      .query('SELECT COUNT(*) as n FROM status_events WHERE job_id = ?')
      .get(row.id) as { n: number }

    expect(count.n).toBe(1)
  })
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
