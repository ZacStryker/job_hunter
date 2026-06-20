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

type StatsResponse = {
  heroSentence: string
  nextAction: { applyMatchesWaiting: number; staleApplications: number }
  funnel: { scraped: number; matched: number; applied: number; response: number; interview: number; offer: number; hasStatusData: boolean }
  value: { timeSavedHours: number; totalCostUsd: number; costPerApplication: number }
  fitVsOutcome: { hasData: boolean; buckets: { fitRange: string; applied: number; responded: number }[] }
  statCards: { daysSinceLastApplication: number | null; matchQualityRate: number }
  sparklines: { matchQuality: { date: string; rate: number }[]; costPerApp: { date: string; costPerApp: number }[] }
  detail: {
    applyResponseRate: { hasData: boolean; applied: number; responded: number }
    sourceEffectiveness: { source: string; scraped: number; applied: number; responded: number }[]
    stageAging: { stage: string; medianDays: number }[]
    activityHeatmap: { date: string; count: number }[]
    cumulativeTimeSaved: { date: string; totalHours: number }[]
    timeSavedByWorkflow: { workflow: string; hours: number }[]
  }
  automation: { totalRuns: number; totalTokens: number; perDay: unknown[]; costByWorkflow: { workflow: string; cost: number }[] }
}

async function getStats(query = ''): Promise<StatsResponse> {
  const res = await statsApp.request(`/${query}`, { method: 'GET' })
  expect(res.status).toBe(200)
  return await res.json() as StatsResponse
}

describe('GET /api/stats - response shape', () => {
  test('returns all top-level keys, none of the old ones', async () => {
    const data = await getStats() as unknown as Record<string, unknown>
    for (const key of ['heroSentence', 'nextAction', 'funnel', 'value', 'fitVsOutcome', 'statCards', 'sparklines', 'detail', 'automation']) {
      expect(data).toHaveProperty(key)
    }
    expect(data).not.toHaveProperty('jobs')
    expect(data).not.toHaveProperty('matches')
    expect(data).not.toHaveProperty('applications')
    expect(data).not.toHaveProperty('pipeline')
    expect(data).not.toHaveProperty('error')
  })

  test('empty DB yields zeroed funnel and empty arrays', async () => {
    const data = await getStats()
    expect(data.funnel.scraped).toBe(0)
    expect(data.funnel.applied).toBe(0)
    expect(data.funnel.hasStatusData).toBe(false)
    expect(data.statCards.daysSinceLastApplication).toBeNull()
    expect(data.detail.stageAging).toEqual([])
    expect(data.detail.activityHeatmap).toEqual([])
    expect(data.heroSentence).toContain('Search paused')
  })
})

describe('GET /api/stats - funnel', () => {
  test('scraped, matched, applied counts', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, recommendation) VALUES ('A', 'Dev', '2026-06-01', 'apply')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, recommendation) VALUES ('B', 'Dev', '2026-06-01', 'investigate')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, recommendation) VALUES ('C', 'Dev', '2026-06-01', 'skip')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, recommendation, applied, date_applied) VALUES ('D', 'Dev', '2026-06-01', 'apply', 1, '2026-06-02')`)
    const data = await getStats()
    expect(data.funnel.scraped).toBe(4)
    expect(data.funnel.matched).toBe(3) // apply + investigate + apply
    expect(data.funnel.applied).toBe(1)
  })

  test('hasStatusData false when no statusOverride set', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('A', 'Dev', 1, '2026-06-01')`)
    const data = await getStats()
    expect(data.funnel.hasStatusData).toBe(false)
    expect(data.funnel.response).toBe(0)
    expect(data.funnel.interview).toBe(0)
    expect(data.funnel.offer).toBe(0)
  })

  test('late funnel stages reflect statusOverride when present', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied, status_override) VALUES ('A', 'Dev', 1, '2026-06-01', 'Submitted')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied, status_override) VALUES ('B', 'Dev', 1, '2026-06-01', 'Interview')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied, status_override) VALUES ('C', 'Dev', 1, '2026-06-01', 'Offer')`)
    const data = await getStats()
    expect(data.funnel.hasStatusData).toBe(true)
    expect(data.funnel.response).toBe(3)   // Submitted + Interview + Offer all count as response
    expect(data.funnel.interview).toBe(2)  // Interview + Offer
    expect(data.funnel.offer).toBe(1)
  })
})

describe('GET /api/stats - value / time-saved', () => {
  test('time-saved formula across all task types', async () => {
    // 2 scraped jobs (both count toward source), 1 analyzed, 1 with resume
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, date_analyzed) VALUES ('A', 'Dev', '2026-06-01', '2026-06-02')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, resume_generated_at) VALUES ('B', 'Dev', '2026-06-01', '2026-06-03')`)
    prodSqlite.run(`INSERT INTO cover_letters (job_id, user_id, content, created_at) VALUES (1, 1, 'x', '2026-06-02')`)
    const data = await getStats()
    // 2*3 (source) + 1*4 (analyze) + 1*4.75 (cover) + 1*14.25 (resume) = 6 + 4 + 4.75 + 14.25 = 29 min
    expect(data.value.timeSavedHours).toBeCloseTo(29 / 60, 5)
  })

  test('time-saved is all-time, not affected by period filter', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped) VALUES ('Old', 'Dev', '${daysAgoDate(60)}')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped) VALUES ('New', 'Dev', '${daysAgoDate(1)}')`)
    const all = await getStats('?period=all')
    const day = await getStats('?period=24h')
    expect(day.funnel.scraped).toBe(1)       // period filter scopes the funnel
    expect(all.funnel.scraped).toBe(2)
    expect(day.value.timeSavedHours).toBeCloseTo(all.value.timeSavedHours, 5) // but not time-saved
    expect(day.value.timeSavedHours).toBeCloseTo(2 * 3 / 60, 5)
  })

  test('totalCostUsd sums webhook costs; costPerApplication divides by applied', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('A', 'Dev', 1, '2026-06-01')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('B', 'Dev', 1, '2026-06-01')`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, cost_usd) VALUES ('Discovery', '2026-06-01T00:00:00Z', 1, 0.50)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, cost_usd) VALUES ('Analysis', '2026-06-01T00:00:00Z', 1, 0.30)`)
    const data = await getStats()
    expect(data.value.totalCostUsd).toBeCloseTo(0.80, 5)
    expect(data.value.costPerApplication).toBeCloseTo(0.40, 5)
  })
})

describe('GET /api/stats - stat cards', () => {
  test('daysSinceLastApplication null when never applied', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped) VALUES ('A', 'Dev', '2026-06-01')`)
    const data = await getStats()
    expect(data.statCards.daysSinceLastApplication).toBeNull()
  })

  test('daysSinceLastApplication uses latest dateApplied', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('A', 'Dev', 1, '${daysAgoDate(10)}')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('B', 'Dev', 1, '${daysAgoDate(3)}')`)
    const data = await getStats()
    expect(data.statCards.daysSinceLastApplication).toBe(3)
  })

  test('matchQualityRate is percent of scraped that are apply-grade', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, recommendation) VALUES ('A', 'Dev', '2026-06-01', 'apply')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, recommendation) VALUES ('B', 'Dev', '2026-06-01', 'skip')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, recommendation) VALUES ('C', 'Dev', '2026-06-01', 'skip')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, recommendation) VALUES ('D', 'Dev', '2026-06-01', 'skip')`)
    const data = await getStats()
    expect(data.statCards.matchQualityRate).toBeCloseTo(25, 5)
  })
})

describe('GET /api/stats - next action', () => {
  test('applyMatchesWaiting counts apply-grade unapplied unarchived', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, recommendation, applied, archived) VALUES ('A', 'Dev', 'apply', 0, 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, recommendation, applied, archived) VALUES ('B', 'Dev', 'apply', 1, 0)`) // already applied
    prodSqlite.run(`INSERT INTO jobs (company, job_title, recommendation, applied, archived) VALUES ('C', 'Dev', 'apply', 0, 1)`) // archived
    prodSqlite.run(`INSERT INTO jobs (company, job_title, recommendation, applied, archived) VALUES ('D', 'Dev', 'investigate', 0, 0)`) // not apply-grade
    const data = await getStats()
    expect(data.nextAction.applyMatchesWaiting).toBe(1)
  })

  test('staleApplications counts applied jobs with no recent status event', async () => {
    // Applied 20d ago, no status events → stale
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Stale', 'Dev', 1, '${daysAgoDate(20)}')`)
    // Applied 5d ago → not stale (recent)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Fresh', 'Dev', 1, '${daysAgoDate(5)}')`)
    // Applied 20d ago but has a recent status event → not stale
    const active = prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('Active', 'Dev', 1, '${daysAgoDate(20)}')`)
    prodSqlite.run(`INSERT INTO status_events (job_id, status, timestamp) VALUES (${Number(active.lastInsertRowid)}, 'Interview', '${daysAgoIso(2)}')`)
    const data = await getStats()
    expect(data.nextAction.staleApplications).toBe(1)
  })
})

describe('GET /api/stats - stage aging', () => {
  test('excludes stages with fewer than 3 data points', async () => {
    const ids: number[] = []
    for (const co of ['A', 'B', 'C']) {
      const r = prodSqlite.run(`INSERT INTO jobs (company, job_title, applied) VALUES ('${co}', 'Dev', 1)`)
      ids.push(Number(r.lastInsertRowid))
    }
    // Each job: Submitted -> Interview transition gives one "Submitted" duration. 3 jobs = 3 data points.
    for (const id of ids) {
      prodSqlite.run(`INSERT INTO status_events (job_id, status, timestamp) VALUES (${id}, 'Submitted', '2026-06-01T00:00:00Z')`)
      prodSqlite.run(`INSERT INTO status_events (job_id, status, timestamp) VALUES (${id}, 'Interview', '2026-06-04T00:00:00Z')`)
    }
    const data = await getStats()
    const submitted = data.detail.stageAging.find(s => s.stage === 'Submitted')
    expect(submitted).toBeDefined()
    expect(submitted?.medianDays).toBeCloseTo(3, 5)
    // Interview is the terminal event for each job (no transition out) → no data points → excluded
    expect(data.detail.stageAging.find(s => s.stage === 'Interview')).toBeUndefined()
  })
})

describe('GET /api/stats - detail sections', () => {
  test('applyResponseRate gated on hasStatusData', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('A', 'Dev', 1, '2026-06-01')`)
    const data = await getStats()
    expect(data.detail.applyResponseRate.hasData).toBe(false)
    expect(data.detail.applyResponseRate.applied).toBe(1)
  })

  test('sourceEffectiveness groups by source', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, source, applied) VALUES ('A', 'Dev', '2026-06-01', 'linkedin', 1)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, source, applied) VALUES ('B', 'Dev', '2026-06-01', 'linkedin', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, source, applied) VALUES ('C', 'Dev', '2026-06-01', 'indeed', 0)`)
    const data = await getStats()
    const linkedin = data.detail.sourceEffectiveness.find(s => s.source === 'linkedin')
    expect(linkedin?.scraped).toBe(2)
    expect(linkedin?.applied).toBe(1)
  })

  test('timeSavedByWorkflow has all four workflow rows', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped) VALUES ('A', 'Dev', '2026-06-01')`)
    const data = await getStats()
    const workflows = data.detail.timeSavedByWorkflow.map(w => w.workflow)
    expect(workflows).toEqual(['Discovery', 'Analysis', 'Cover Letter', 'Resume'])
  })
})

describe('GET /api/stats - automation & filters', () => {
  test('automation totals respect period filter on runAt', async () => {
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, input_tokens, output_tokens, cost_usd) VALUES ('Discovery', '${daysAgoIso(0.5)}', 1, 100, 50, 0.10)`)
    prodSqlite.run(`INSERT INTO webhook_runs (name, run_at, success, input_tokens, output_tokens, cost_usd) VALUES ('Analysis', '${daysAgoIso(60)}', 1, 200, 100, 0.20)`)
    const day = await getStats('?period=24h')
    expect(day.automation.totalRuns).toBe(1)
    expect(day.automation.totalTokens).toBe(150)
    const all = await getStats('?period=all')
    expect(all.automation.totalRuns).toBe(2)
  })

  test('archivedFilter scopes funnel', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, archived) VALUES ('Active', 'Dev', '2026-06-01', 0)`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, date_scraped, archived) VALUES ('Archived', 'Dev', '2026-06-01', 1)`)
    const active = await getStats()
    expect(active.funnel.scraped).toBe(1)
    const all = await getStats('?archivedFilter=all')
    expect(all.funnel.scraped).toBe(2)
  })
})

describe('GET /api/stats - hero sentence', () => {
  test('active search when 3+ recent applications', async () => {
    for (let i = 0; i < 3; i++) {
      prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied) VALUES ('C${i}', 'Dev', 1, '${daysAgoDate(2)}')`)
    }
    const data = await getStats()
    expect(data.heroSentence).toContain('Active search')
    expect(data.heroSentence).toContain('3 applications in the last 30 days')
  })

  test('includes conversion clause only when status data present', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, applied, date_applied, status_override) VALUES ('A', 'Dev', 1, '${daysAgoDate(2)}', 'Interview')`)
    const data = await getStats()
    expect(data.heroSentence).toContain('Pipeline converting at')
    expect(data.heroSentence).toContain('HITLobster saved you')
  })
})
