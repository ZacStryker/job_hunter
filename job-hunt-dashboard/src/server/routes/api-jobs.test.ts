process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'

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
    user_id INTEGER NOT NULL DEFAULT 1,
    UNIQUE(company, job_title, user_id)
  )
`

const CREATE_STATUS_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
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
    job_title TEXT,
    user_id INTEGER NOT NULL DEFAULT 1
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_STATUS_EVENTS_TABLE)
  prodSqlite.run(CREATE_MESSAGES_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM status_events')
  prodSqlite.run('DELETE FROM messages')
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

  test('PATCH { archived: true } returns 200 with job.archived === true', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Arch', 'Dev', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Arch') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.archived).toBe(true)
  })

  test('PATCH { archived: false } returns 200 with job.archived === false', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, archived) VALUES ('Arch2', 'Dev', 0, 1)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Arch2') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.archived).toBe(false)
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

  test('returns message-based events for matching company+jobTitle', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Engineer', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title)
       VALUES ('uid1', '2026-04-08T10:00:00.000Z', 'hr@acme.com', 'Your application', 'Rejected', 'Acme', 'Engineer')`
    )

    const res = await jobsApp.request(`/${row.id}/events`, { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { events: { status: string; source: string; timestamp: string }[] }
    expect(data.events).toHaveLength(1)
    expect(data.events[0].status).toBe('Rejected')
    expect(data.events[0].source).toBe('email')
    expect(data.events[0].timestamp).toBe('2026-04-08T10:00:00.000Z')
  })

  test('does not return messages with null type', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Engineer', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title)
       VALUES ('uid1', '2026-04-08T10:00:00.000Z', 'hr@acme.com', 'Your application', NULL, 'Acme', 'Engineer')`
    )

    const res = await jobsApp.request(`/${row.id}/events`, { method: 'GET' })
    const data = await res.json() as { events: unknown[] }
    expect(data.events).toHaveLength(0)
  })

  test('does not return messages for different company or jobTitle', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Engineer', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title)
       VALUES ('uid1', '2026-04-08T10:00:00.000Z', 'hr@other.com', 'Re: application', 'Interview', 'OtherCo', 'Engineer')`
    )

    const res = await jobsApp.request(`/${row.id}/events`, { method: 'GET' })
    const data = await res.json() as { events: unknown[] }
    expect(data.events).toHaveLength(0)
  })

  test('merges manual events and message events sorted by timestamp desc', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Engineer', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }
    prodSqlite.run(
      `INSERT INTO status_events (job_id, status, timestamp, source) VALUES (?, 'phone_screen', '2026-04-07T09:00:00.000Z', 'manual')`,
      [row.id]
    )
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title)
       VALUES ('uid1', '2026-04-09T10:00:00.000Z', 'hr@acme.com', 'Interview invite', 'Interview', 'Acme', 'Engineer')`
    )

    const res = await jobsApp.request(`/${row.id}/events`, { method: 'GET' })
    const data = await res.json() as { events: { status: string; source: string }[] }
    expect(data.events).toHaveLength(2)
    expect(data.events[0].status).toBe('Interview')
    expect(data.events[0].source).toBe('email')
    expect(data.events[1].status).toBe('phone_screen')
    expect(data.events[1].source).toBe('manual')
  })
})

describe('GET /api/jobs/:id', () => {
  test('returns 200 with company, jobTitle, location, and jobDescription', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, location, job_description, applied) VALUES ('Acme', 'Engineer', 'Remote', 'Build things', 0)`
    )
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Acme') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data).toHaveProperty('job')
    expect(data.job.company).toBe('Acme')
    expect(data.job.jobTitle).toBe('Engineer')
    expect(data.job.location).toBe('Remote')
    expect(data.job.jobDescription).toBe('Build things')
    expect(Object.keys(data.job)).toHaveLength(4)
  })

  test('returns null for missing optional fields', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Beta', 'Dev', 0)`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Beta') as { id: number }
    const res = await jobsApp.request(`/${row.id}`, { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.location).toBeNull()
    expect(data.job.jobDescription).toBeNull()
  })

  test('returns 404 with error key for non-existent job', async () => {
    const res = await jobsApp.request('/99999', { method: 'GET' })
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 400 with error key for non-numeric id', async () => {
    const res = await jobsApp.request('/abc', { method: 'GET' })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
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
    expect(job.latestStatus).toBeNull()
  })

  test('latestStatus is null when job has no messages', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Eng', 0)`)
    const res = await jobsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: Record<string, unknown>[] }
    expect(data.jobs[0].latestStatus).toBeNull()
  })

  test('latestStatus reflects the most recent message type', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Eng', 0)`)
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title)
       VALUES ('uid1', '2026-04-06T10:00:00.000Z', 'hr@acme.com', 'App received', 'Submitted', 'Acme', 'Eng')`
    )
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title)
       VALUES ('uid2', '2026-04-07T10:00:00.000Z', 'hr@acme.com', 'Next steps', 'Screening', 'Acme', 'Eng')`
    )
    const res = await jobsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: Record<string, unknown>[] }
    expect(data.jobs[0].latestStatus).toBe('Screening')
  })

  test('relevanceScore is null (not undefined) when job has no score set', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('ScoreTest', 'Dev', 0)`)
    const res = await jobsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { jobs: Record<string, unknown>[] }
    expect(data.jobs).toHaveLength(1)
    const job = data.jobs[0]
    expect(Object.prototype.hasOwnProperty.call(job, 'relevanceScore')).toBe(true)
    expect(job.relevanceScore).toBeNull()
  })

  test('latestStatus is null when all matching messages have null type', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Eng', 0)`)
    prodSqlite.run(
      `INSERT INTO messages (uid, received_at, from_address, subject, type, company, job_title)
       VALUES ('uid1', '2026-04-06T10:00:00.000Z', 'hr@acme.com', 'FYI', NULL, 'Acme', 'Eng')`
    )
    const res = await jobsApp.request('/', { method: 'GET' })
    const data = await res.json() as { jobs: Record<string, unknown>[] }
    expect(data.jobs[0].latestStatus).toBeNull()
  })
})

describe('POST /api/jobs', () => {
  test('creates job with source=Manual, analysisStatus=pending → 201', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Acme', jobTitle: 'Engineer', sourceUrl: 'https://example.com/job/1' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data).toHaveProperty('job')
    expect(data.job.company).toBe('Acme')
    expect(data.job.jobTitle).toBe('Engineer')
    expect(data.job.source).toBe('Manual')
    expect(data.job.analysisStatus).toBe('pending')
    expect(data.job.archived).toBe(false)
    expect(data.job.fitScore).toBeNull()
  })

  test('returns 409 if same company+jobTitle already exists', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Dupe', 'Dev', 0)`)
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Dupe', jobTitle: 'Dev', sourceUrl: 'https://example.com/job/2' }),
    })
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('returns 400 for missing company', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobTitle: 'Dev', sourceUrl: 'https://example.com/job/3' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })

  test('returns 400 for missing jobTitle', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Acme', sourceUrl: 'https://example.com/job/4' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })

  test('returns 400 for non-URL sourceUrl', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Acme', jobTitle: 'Dev', sourceUrl: 'not-a-url' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })

  test('stores null location when location omitted', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'NullLoc', jobTitle: 'Dev', sourceUrl: 'https://example.com/job/5' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.location).toBeNull()
  })

  test('creates job with description only (no sourceUrl) → 201 with jobDescription set', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'DescOnly', jobTitle: 'Engineer', description: 'We are looking for…' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data).toHaveProperty('job')
    expect(data.job.jobDescription).toBe('We are looking for…')
    expect(data.job.sourceUrl).toBeNull()
    expect(data.job.analysisStatus).toBe('pending')
  })

  test('returns 400 when neither sourceUrl nor description provided', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Neither', jobTitle: 'Dev' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('creates job with both sourceUrl and description → 201 with both stored', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Both', jobTitle: 'Dev', sourceUrl: 'https://example.com/job/99', description: 'Role requires 5 years of experience.' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.sourceUrl).toBe('https://example.com/job/99')
    expect(data.job.jobDescription).toBe('Role requires 5 years of experience.')
  })

  test('accepts sourceUrl: null explicitly (real client payload for description-only submit) → 201', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'NullUrl', jobTitle: 'Dev', sourceUrl: null, description: 'We are hiring a developer.' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json() as { job: Record<string, unknown> }
    expect(data.job.sourceUrl).toBeNull()
    expect(data.job.jobDescription).toBe('We are hiring a developer.')
  })

  test('returns 400 when sourceUrl is null and description is blank whitespace', async () => {
    const res = await jobsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Blank', jobTitle: 'Dev', sourceUrl: null, description: '   ' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })
})

describe('POST /api/jobs/scrape-url', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('returns 400 for invalid (non-URL) input', async () => {
    const res = await jobsApp.request('/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })

  test('returns 503 when SCRAPER_URL env var is not set', async () => {
    const saved = process.env.SCRAPER_URL
    delete process.env.SCRAPER_URL
    const res = await jobsApp.request('/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.linkedin.com/jobs/view/123' }),
    })
    expect(res.status).toBe(503)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    process.env.SCRAPER_URL = saved
  })

  test('returns 422 for an unrecognized URL hostname', async () => {
    process.env.SCRAPER_URL = 'http://localhost:9999'
    const res = await jobsApp.request('/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://greenhouse.io/jobs/123' }),
    })
    expect(res.status).toBe(422)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    delete process.env.SCRAPER_URL
  })

  test('returns { company, jobTitle, location } on successful scraper response', async () => {
    process.env.SCRAPER_URL = 'http://localhost:9999'
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ company: 'Acme', jobTitle: 'Engineer', location: 'Remote' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as unknown as typeof fetch
    const res = await jobsApp.request('/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.linkedin.com/jobs/view/123' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.company).toBe('Acme')
    expect(data.jobTitle).toBe('Engineer')
    expect(data.location).toBe('Remote')
    delete process.env.SCRAPER_URL
  })

  test('returns 502 when the scraper endpoint returns non-2xx', async () => {
    process.env.SCRAPER_URL = 'http://localhost:9999'
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: 'Scrape error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )) as unknown as typeof fetch
    const res = await jobsApp.request('/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.linkedin.com/jobs/view/123' }),
    })
    expect(res.status).toBe(502)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    delete process.env.SCRAPER_URL
  })

  test('returns 422 when scraper returns null company or jobTitle', async () => {
    process.env.SCRAPER_URL = 'http://localhost:9999'
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ company: null, jobTitle: null, location: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as unknown as typeof fetch
    const res = await jobsApp.request('/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.linkedin.com/jobs/view/123' }),
    })
    expect(res.status).toBe(422)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    delete process.env.SCRAPER_URL
  })
})

describe('POST /api/jobs/bulk-archive', () => {
  test('archives multiple jobs and returns count', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Eng1', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('Acme', 'Eng2', 0)`)
    const rows = prodSqlite.query('SELECT id FROM jobs').all() as { id: number }[]
    const ids = rows.map((r) => r.id)
    const res = await jobsApp.request('/bulk-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { archived: number }
    expect(data.archived).toBe(2)
    const archived = prodSqlite.query('SELECT archived FROM jobs WHERE id = ?').get(ids[0]) as { archived: number }
    expect(archived.archived).toBe(1)
  })

  test('returns 400 for empty ids array', async () => {
    const res = await jobsApp.request('/bulk-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('returns archived: 0 for non-existent ids', async () => {
    const res = await jobsApp.request('/bulk-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [99999] }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { archived: number }
    expect(data.archived).toBe(0)
  })
})
