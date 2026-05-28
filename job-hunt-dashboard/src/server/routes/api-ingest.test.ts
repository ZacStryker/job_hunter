// Set DB_PATH before any production modules are dynamically loaded.
// Static imports below do not load db/client.ts, so this takes effect
// when api-ingest.ts is loaded via the dynamic import further down.
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../db/schema'
import { jobs } from '../../db/schema'
import type { JobInput } from '../../shared/schemas'
import { sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Two in-memory databases:
//   testDb  — used by runIngest() for business-logic tests
//   prodDb  — used by the real ingestApp (loaded dynamically below)
// ---------------------------------------------------------------------------

const sqlite = new Database(':memory:')
const testDb = drizzle(sqlite, { schema })

// Load the real production handler AFTER setting DB_PATH so db/client.ts
// gets an in-memory database instead of the real file.
const { default: ingestRoute } = await import('../../server/routes/api-ingest')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const ingestApp = (() => {
  const w = new Hono()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', ingestRoute)
  return w
})()

// ---------------------------------------------------------------------------
// Schema DDL (mirrors src/db/schema.ts and the real migration)
// ---------------------------------------------------------------------------

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

beforeAll(() => {
  sqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_JOBS_TABLE)
})

beforeEach(() => {
  sqlite.run('DELETE FROM jobs')
  prodSqlite.run('DELETE FROM jobs')
})

// ---------------------------------------------------------------------------
// Business-logic helper — mirrors the production upsert for direct testing.
// Uses \x00 separator to avoid false collisions on company/jobTitle with '::'.
// ---------------------------------------------------------------------------

type DbType = ReturnType<typeof drizzle<typeof schema>>

function runIngest(db: DbType, rows: JobInput[]): { added: number; updated: number } {
  const existing = db
    .select({ company: jobs.company, jobTitle: jobs.jobTitle })
    .from(jobs)
    .all()
  const existingKeys = new Set(existing.map((r) => `${r.company}\x00${r.jobTitle}`))

  let added = 0
  let updated = 0

  db.transaction((tx) => {
    for (const row of rows) {
      tx
        .insert(jobs)
        .values({ ...row, userId: 1 })
        .onConflictDoUpdate({
          target: [jobs.company, jobs.jobTitle, jobs.userId],
          set: {
            sourceUrl: sql`excluded.source_url`,
            dateScraped: sql`excluded.date_scraped`,
            source: sql`excluded.source`,
            location: sql`excluded.location`,
          },
        })
        .run()

      if (existingKeys.has(`${row.company}\x00${row.jobTitle}`)) {
        updated++
      } else {
        added++
      }
    }
  })

  return { added, updated }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const baseJob: JobInput = {
  company: 'Acme Corp',
  jobTitle: 'Senior Engineer',
  fitScore: 80,
  recommendation: 'apply',
  roleFit: 'Strong match for backend systems',
  requirementsMet: 'TypeScript, Node.js, REST APIs',
  requirementsMissed: 'Kubernetes experience',
  redFlags: null,
  jobDescription: 'Build and maintain scalable services',
  sourceUrl: 'https://example.com/job/1',
  dateScraped: '2026-03-29T00:00:00.000Z',
  source: null,
  location: null,
  salary: null,
  benefits: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  analysisStatus: null,
  externalJobId: null,
}

// ---------------------------------------------------------------------------
// Business-logic tests (via testDb + runIngest)
// ---------------------------------------------------------------------------

describe('upsert business logic', () => {
  test('inserts new records and returns correct added count', () => {
    const result = runIngest(testDb, [baseJob])

    expect(result).toEqual({ added: 1, updated: 0 })

    const stored = testDb.select().from(jobs).all()
    expect(stored).toHaveLength(1)
    expect(stored[0].company).toBe('Acme Corp')
    expect(stored[0].fitScore).toBe(80)
  })

  test('idempotent — same payload twice returns updated count on second call', () => {
    runIngest(testDb, [baseJob])
    const result = runIngest(testDb, [baseJob])

    expect(result).toEqual({ added: 0, updated: 1 })
    expect(testDb.select().from(jobs).all()).toHaveLength(1)
  })

  test('user-owned fields are NOT overwritten on re-ingest', () => {
    runIngest(testDb, [baseJob])

    testDb
      .update(jobs)
      .set({ applied: true, dateApplied: '2026-03-29T10:00:00.000Z', status: 'interviewing' })
      .where(sql`company = 'Acme Corp' AND job_title = 'Senior Engineer'`)
      .run()

    runIngest(testDb, [{ ...baseJob, fitScore: 90 }])

    const stored = testDb.select().from(jobs).all()
    expect(stored[0].fitScore).toBe(80)            // Analysis-owned: preserved
    expect(stored[0].applied).toBe(true)           // user-owned: preserved
    expect(stored[0].status).toBe('interviewing')  // user-owned: preserved
    expect(stored[0].dateApplied).toBe('2026-03-29T10:00:00.000Z') // user-owned: preserved
  })

  test('multiple rows — correct mixed add/update counts', () => {
    const job2: JobInput = {
      company: 'Beta Inc',
      jobTitle: 'Staff Engineer',
      fitScore: 65,
      recommendation: 'investigate',
      roleFit: null,
      requirementsMet: null,
      requirementsMissed: null,
      redFlags: 'Early stage startup',
      jobDescription: null,
      sourceUrl: null,
      dateScraped: null,
      source: null,
      location: null,
      salary: null,
      benefits: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      analysisStatus: null,
      externalJobId: null,
    }

    expect(runIngest(testDb, [baseJob, job2])).toEqual({ added: 2, updated: 0 })
    expect(runIngest(testDb, [baseJob, job2])).toEqual({ added: 0, updated: 2 })

    const job3: JobInput = { ...baseJob, company: 'Gamma LLC', jobTitle: 'Backend Dev' }
    expect(runIngest(testDb, [baseJob, job3])).toEqual({ added: 1, updated: 1 })
  })

  test('empty payload returns { added: 0, updated: 0 }', () => {
    expect(runIngest(testDb, [])).toEqual({ added: 0, updated: 0 })
  })

  test('analysisStatus is NOT overwritten on re-ingest conflict', () => {
    runIngest(testDb, [baseJob])

    testDb
      .update(jobs)
      .set({ analysisStatus: 'done' })
      .where(sql`company = 'Acme Corp' AND job_title = 'Senior Engineer'`)
      .run()

    runIngest(testDb, [{ ...baseJob, analysisStatus: 'pending' }])

    const stored = testDb.select().from(jobs).all()
    expect(stored[0].analysisStatus).toBe('done') // preserved — not clobbered by re-ingest
  })

  test('externalJobId is NOT overwritten on re-ingest conflict', () => {
    runIngest(testDb, [{ ...baseJob, externalJobId: 'scraper-job-42' }])
    runIngest(testDb, [{ ...baseJob, externalJobId: 'scraper-job-99' }])

    const stored = testDb.select().from(jobs).all()
    expect(stored[0].externalJobId).toBe('scraper-job-42') // first value preserved
  })

  test('key separator: company with "::" does not collide with adjacent jobTitle split', () => {
    const jobA: JobInput = { ...baseJob, company: 'Acme::Corp', jobTitle: 'Dev' }
    const jobB: JobInput = { ...baseJob, company: 'Acme', jobTitle: 'Corp::Dev' }

    const result = runIngest(testDb, [jobA, jobB])
    expect(result).toEqual({ added: 2, updated: 0 })

    const second = runIngest(testDb, [jobA, jobB])
    expect(second).toEqual({ added: 0, updated: 2 })
  })
})

// ---------------------------------------------------------------------------
// HTTP contract tests — use the REAL production ingestApp
// ---------------------------------------------------------------------------

describe('POST /api/ingest HTTP contract (production handler)', () => {
  test('returns 200 with { added, updated } for valid payload', async () => {
    const res = await ingestApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([baseJob]),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as { added: number; updated: number }
    expect(data.added).toBe(1)
    expect(data.updated).toBe(0)
  })

  test('idempotent — second call returns updated count', async () => {
    const post = () =>
      ingestApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([baseJob]),
      })

    await post()
    const res = await post()
    const data = await res.json() as { added: number; updated: number }
    expect(data).toEqual({ added: 0, updated: 1 })
  })

  test('returns 400 with { error } for missing required field (jobTitle)', async () => {
    const res = await ingestApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ company: 'Acme' }]),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(typeof data.error).toBe('string')
  })

  test('returns 400 for wrong fitScore type', async () => {
    const res = await ingestApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ ...baseJob, fitScore: 'high' }]),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })

  test('returns 400 for invalid recommendation enum value', async () => {
    const res = await ingestApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ ...baseJob, recommendation: 'maybe' }]),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })

  test('returns 400 for non-array body', async () => {
    const res = await ingestApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Acme', jobTitle: 'Dev' }),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
  })

  test('error response uses "error" key, not "message"', async () => {
    const res = await ingestApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ company: 'X' }]),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
  })

  test('no DB writes occur on invalid payload', async () => {
    const before = prodSqlite.prepare('SELECT COUNT(*) as n FROM jobs').get() as { n: number }

    await ingestApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ company: 'X' }]),
    })

    const after = prodSqlite.prepare('SELECT COUNT(*) as n FROM jobs').get() as { n: number }
    expect(after.n).toBe(before.n)
  })

  test('ingest does not overwrite archived field on upsert conflict', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, applied, archived) VALUES ('Acme', 'Engineer', 0, 1)`
    )
    const payload: JobInput[] = [{ company: 'Acme', jobTitle: 'Engineer', fitScore: 80, recommendation: 'apply', roleFit: null, requirementsMet: null, requirementsMissed: null, redFlags: null, jobDescription: null, sourceUrl: null, dateScraped: null, source: null, location: null, salary: null, benefits: null, contactName: null, contactEmail: null, contactPhone: null, analysisStatus: null, externalJobId: null }]
    const res = await ingestApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    const row = prodSqlite.query('SELECT archived FROM jobs WHERE company = ?').get('Acme') as { archived: number }
    expect(row.archived).toBe(1)
  })
})
