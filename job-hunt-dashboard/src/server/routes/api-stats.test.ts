process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'

const { default: statsRoute } = await import('./api-stats')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const statsApp = (() => {
  const w = new Hono()
  w.use('*', (c, next) => { c.set('userId', 1); return next() })
  w.route('/', statsRoute)
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
    applied_at TEXT,
    date_archived TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    resume_generated_at TEXT,
    user_id INTEGER NOT NULL DEFAULT 1,
    UNIQUE(company, job_title, user_id)
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
    cost_usd REAL,
    matched_count INTEGER,
    archived_count INTEGER,
    source_breakdown TEXT,
    user_id INTEGER NOT NULL DEFAULT 1
  )
`

const CREATE_COVER_LETTERS_TABLE = `
  CREATE TABLE IF NOT EXISTS cover_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
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

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
  prodSqlite.run(CREATE_COVER_LETTERS_TABLE)
  prodSqlite.run(CREATE_STATUS_EVENTS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM webhook_runs')
  prodSqlite.run('DELETE FROM jobs')
  prodSqlite.run('DELETE FROM cover_letters')
  prodSqlite.run('DELETE FROM status_events')
})

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}
function daysAgoDate(days: number): string {
  return daysAgoIso(days).slice(0, 10)
}

type ActivityEvent = { type: string; timestamp: string; jobTitle: string; company: string; status: string | null }

type StatsResponse = {
  totalJobs: number
  recentActivity: ActivityEvent[]
  jobsByFitScore: { fitRange: string; count: number }[]
  timeSavedByWorkflow: { workflow: string; hours: number }[]
  activityHeatmap: { date: string; count: number }[]
}

async function getStats(query = ''): Promise<StatsResponse> {
  const res = await statsApp.request(`/${query}`, { method: 'GET' })
  expect(res.status).toBe(200)
  return await res.json() as StatsResponse
}

describe('GET /api/stats - response shape', () => {
  test('returns exactly the new top-level keys, none of the old ones', async () => {
    const data = await getStats() as unknown as Record<string, unknown>
    for (const key of ['totalJobs', 'recentActivity', 'jobsByFitScore', 'timeSavedByWorkflow', 'activityHeatmap']) {
      expect(data).toHaveProperty(key)
    }
    for (const old of ['heroSentence', 'nextAction', 'funnel', 'value', 'fitVsOutcome', 'statCards', 'sparklines', 'detail', 'automation', 'error']) {
      expect(data).not.toHaveProperty(old)
    }
  })

  test('empty DB yields zeros and empty arrays', async () => {
    const data = await getStats()
    expect(data.totalJobs).toBe(0)
    expect(data.recentActivity).toEqual([])
    expect(data.activityHeatmap).toEqual([])
    expect(data.jobsByFitScore.map(b => b.count)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(data.timeSavedByWorkflow.every(w => w.hours === 0)).toBe(true)
  })
})

describe('GET /api/stats - jobsByFitScore', () => {
  test('buckets jobs into 10 ranges, clamps 100, excludes null', async () => {
    for (const [co, score] of [['A', 0], ['B', 19], ['C', 20], ['D', 80], ['E', 100]] as [string, number][]) {
      prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, fit_score, recommendation) VALUES ('${co}', 'Dev', '2026-06-01', ${score}, 'apply')`)
    }
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, fit_score) VALUES ('F', 'Dev', '2026-06-01', NULL)`)
    const data = await getStats()
    const byRange = Object.fromEntries(data.jobsByFitScore.map(b => [b.fitRange, b.count]))
    expect(data.jobsByFitScore.map(b => b.fitRange)).toEqual(['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'])
    expect(byRange['0-10']).toBe(1)   // 0
    expect(byRange['10-20']).toBe(1)  // 19
    expect(byRange['20-30']).toBe(1)  // 20
    expect(byRange['40-50']).toBe(0)
    expect(byRange['80-90']).toBe(1)  // 80
    expect(byRange['90-100']).toBe(1) // 100 (clamped)
  })

  test('honors period and archived filters', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, fit_score, archived, recommendation) VALUES ('Old', 'Dev', '${daysAgoDate(60)}', 90, 0, 'apply')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, fit_score, archived, recommendation) VALUES ('New', 'Dev', '${daysAgoDate(1)}', 90, 0, 'apply')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, fit_score, archived, recommendation) VALUES ('Arch', 'Dev', '${daysAgoDate(1)}', 90, 1, 'apply')`)
    const day = await getStats('?period=24h')
    expect(day.jobsByFitScore.find(b => b.fitRange === '90-100')?.count).toBe(1) // only New (active, recent)
    const all = await getStats('?period=all&archivedFilter=all')
    expect(all.jobsByFitScore.find(b => b.fitRange === '90-100')?.count).toBe(3)
  })

  test('active filter excludes jobs not in Matches or Applications', async () => {
    // In Matches: recommendation apply/investigate, not applied
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, fit_score, recommendation, applied) VALUES ('Match', 'Dev', '2026-06-01', 80, 'apply', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, fit_score, recommendation, applied) VALUES ('Inv', 'Dev', '2026-06-01', 70, 'investigate', 0)`)
    // In Applications: applied = true
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, fit_score, applied) VALUES ('Applied', 'Dev', '2026-06-01', 60, 1)`)
    // Not in Matches or Applications: no recommendation, not applied
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, fit_score) VALUES ('Pending', 'Dev', '2026-06-01', 10)`)
    const active = await getStats()
    const total = active.jobsByFitScore.reduce((s, b) => s + b.count, 0)
    expect(total).toBe(3) // Match + Inv + Applied only
    expect(active.jobsByFitScore.find(b => b.fitRange === '0-10')?.count).toBe(0) // Pending excluded
    const all = await getStats('?archivedFilter=all')
    expect(all.jobsByFitScore.reduce((s, b) => s + b.count, 0)).toBe(4) // all filter shows all
  })
})

describe('GET /api/stats - recentActivity feed', () => {
  test('captures all four event types with correct status field', async () => {
    const r = prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, applied, date_applied, resume_generated_at) VALUES ('Acme', 'Engineer', '${daysAgoDate(3)}', 1, '${daysAgoDate(3)}', '${daysAgoIso(2)}')`)
    const jobId = Number(r.lastInsertRowid)
    prodSqlite.run(`INSERT INTO status_events (job_id, status, timestamp) VALUES (${jobId}, 'Interview', '${daysAgoIso(1)}')`)
    prodSqlite.run(`INSERT INTO cover_letters (job_id, user_id, content, created_at) VALUES (${jobId}, 1, 'x', '${daysAgoIso(2.5)}')`)
    const data = await getStats()
    const types = data.recentActivity.map(e => e.type)
    expect(types).toContain('applied')
    expect(types).toContain('resume')
    expect(types).toContain('status_change')
    expect(types).toContain('cover_letter')
    const statusEvent = data.recentActivity.find(e => e.type === 'status_change')
    expect(statusEvent?.status).toBe('Interview')
    expect(statusEvent?.company).toBe('Acme')
    expect(statusEvent?.jobTitle).toBe('Engineer')
    for (const e of data.recentActivity.filter(e => e.type !== 'status_change')) {
      expect(e.status).toBeNull()
    }
  })

  test('sorts newest first', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Old', 'Dev', 1, '${daysAgoDate(10)}')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('New', 'Dev', 1, '${daysAgoDate(1)}')`)
    const data = await getStats()
    expect(data.recentActivity[0].company).toBe('New')
    expect(data.recentActivity[1].company).toBe('Old')
  })

  test('applied event uses appliedAt time-of-day, sorting a same-day afternoon application after a morning status change', async () => {
    const day = daysAgoDate(1)
    const morning = `${day}T09:00:00.000Z`
    const afternoon = `${day}T15:00:00.000Z`
    // Job with a morning status change
    const sc = prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('MorningCo', 'Dev', 0)`)
    prodSqlite.run(`INSERT INTO status_events (job_id, status, timestamp) VALUES (${Number(sc.lastInsertRowid)}, 'Interview', '${morning}')`)
    // Job applied the same afternoon — appliedAt carries the real time-of-day
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied, applied_at) VALUES ('AfternoonCo', 'Dev', 1, '${day}', '${afternoon}')`)

    const data = await getStats()
    const applied = data.recentActivity.find(e => e.type === 'applied')
    const statusChange = data.recentActivity.find(e => e.type === 'status_change')
    expect(applied?.timestamp).toBe(afternoon)            // full time-of-day, not midnight
    expect(applied!.timestamp > statusChange!.timestamp).toBe(true)
    // Descending feed: the afternoon application sorts ahead of the morning status change
    expect(data.recentActivity[0].type).toBe('applied')
    expect(data.recentActivity[1].type).toBe('status_change')
  })

  test('applied event falls back to midnight date_applied when appliedAt is null (legacy rows)', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Legacy', 'Dev', 1, '2026-06-01')`)
    const data = await getStats()
    const applied = data.recentActivity.find(e => e.type === 'applied')
    expect(applied?.timestamp).toBe('2026-06-01T00:00:00Z')
  })

  test('normalizes bare YYYY-MM-DD timestamps to ISO', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('A', 'Dev', 1, '2026-06-01')`)
    const data = await getStats()
    const applied = data.recentActivity.find(e => e.type === 'applied')
    expect(applied?.timestamp).toBe('2026-06-01T00:00:00Z')
  })

  test('archived filter scopes by owning job', async () => {
    const active = prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied, archived) VALUES ('Active', 'Dev', 1, '${daysAgoDate(2)}', 0)`)
    const arch = prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied, archived) VALUES ('Arch', 'Dev', 1, '${daysAgoDate(2)}', 1)`)
    prodSqlite.run(`INSERT INTO status_events (job_id, status, timestamp) VALUES (${Number(active.lastInsertRowid)}, 'Interview', '${daysAgoIso(1)}')`)
    prodSqlite.run(`INSERT INTO status_events (job_id, status, timestamp) VALUES (${Number(arch.lastInsertRowid)}, 'Interview', '${daysAgoIso(1)}')`)

    const activeOnly = await getStats()
    expect(activeOnly.recentActivity.every(e => e.company === 'Active')).toBe(true)
    expect(activeOnly.recentActivity.some(e => e.type === 'status_change')).toBe(true)

    const all = await getStats('?archivedFilter=all')
    expect(all.recentActivity.some(e => e.company === 'Arch')).toBe(true)
  })

  test('period cutoff scopes by event timestamp, not job scrape date', async () => {
    // job scraped 60d ago but applied recently → appears in 7d feed
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, applied, date_applied) VALUES ('A', 'Dev', '${daysAgoDate(60)}', 1, '${daysAgoDate(2)}')`)
    // job applied 40d ago → excluded from 7d feed
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, applied, date_applied) VALUES ('B', 'Dev', '${daysAgoDate(60)}', 1, '${daysAgoDate(40)}')`)
    const week = await getStats('?period=7d')
    expect(week.recentActivity).toHaveLength(1)
    expect(week.recentActivity[0].company).toBe('A')
  })

  test('caps payload at 50 events', async () => {
    for (let i = 0; i < 60; i++) {
      prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Co${i}', 'Dev', 1, '${daysAgoDate(i % 5)}')`)
    }
    const data = await getStats()
    expect(data.recentActivity).toHaveLength(50)
  })

  test('excludes scrape and match events (only the four event types appear)', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, recommendation) VALUES ('A', 'Dev', '${daysAgoDate(1)}', 'apply')`)
    const data = await getStats()
    expect(data.recentActivity).toEqual([])
  })
})

describe('GET /api/stats - timeSavedByWorkflow', () => {
  test('formula and order unchanged across all task types', async () => {
    // 2 scraped jobs (source), 1 analyzed, 1 with resume, 1 cover letter
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, date_analyzed) VALUES ('A', 'Dev', '2026-06-01', '2026-06-02')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, resume_generated_at) VALUES ('B', 'Dev', '2026-06-01', '2026-06-03')`)
    prodSqlite.run(`INSERT INTO cover_letters (job_id, user_id, content, created_at) VALUES (1, 1, 'x', '2026-06-02')`)
    const data = await getStats()
    expect(data.timeSavedByWorkflow.map(w => w.workflow)).toEqual(['Discovery', 'Analysis', 'Cover Letter', 'Resume'])
    const byWf = Object.fromEntries(data.timeSavedByWorkflow.map(w => [w.workflow, w.hours]))
    expect(byWf['Discovery']).toBeCloseTo(2 * 3 / 60, 5)
    expect(byWf['Analysis']).toBeCloseTo(1 * 4 / 60, 5)
    expect(byWf['Cover Letter']).toBeCloseTo(1 * 4.75 / 60, 5)
    expect(byWf['Resume']).toBeCloseTo(1 * 14.25 / 60, 5)
  })

  test('is all-time, not affected by period filter', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped) VALUES ('Old', 'Dev', '${daysAgoDate(60)}')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped) VALUES ('New', 'Dev', '${daysAgoDate(1)}')`)
    const all = await getStats('?period=all')
    const day = await getStats('?period=24h')
    const allDiscovery = all.timeSavedByWorkflow.find(w => w.workflow === 'Discovery')?.hours
    const dayDiscovery = day.timeSavedByWorkflow.find(w => w.workflow === 'Discovery')?.hours
    expect(dayDiscovery).toBeCloseTo(allDiscovery as number, 5)
    expect(dayDiscovery).toBeCloseTo(2 * 3 / 60, 5)
  })
})

describe('GET /api/stats - totalJobs & heatmap', () => {
  test('totalJobs is unscoped (ignores period and archived filters)', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, archived) VALUES ('Active', 'Dev', '${daysAgoDate(60)}', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, archived) VALUES ('Archived', 'Dev', '${daysAgoDate(60)}', 1)`)
    const data = await getStats('?period=24h')
    expect(data.totalJobs).toBe(2)
  })

  test('activityHeatmap counts scrape and analysis within last 90 days', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, date_analyzed) VALUES ('A', 'Dev', '${daysAgoDate(1)}', '${daysAgoDate(1)}')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped) VALUES ('B', 'Dev', '${daysAgoDate(120)}')`)
    const data = await getStats()
    const today = data.activityHeatmap.find(d => d.date === daysAgoDate(1))
    expect(today?.count).toBe(2) // one scrape + one analysis on the same day
    expect(data.activityHeatmap.some(d => d.date === daysAgoDate(120))).toBe(false)
  })
})
