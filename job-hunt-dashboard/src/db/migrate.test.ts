// Set DB_PATH before db/client.ts is dynamically loaded, so the reclaim runs against an
// in-memory database rather than the real jobs.db file.
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import type { Database } from 'bun:sqlite'

const { reclaimStrandedAnalyzing } = await import('./migrate')
const { db } = await import('./client')
const sqlite = (db as unknown as { $client: Database }).$client

// Mirrors src/db/schema.ts exactly. The whole `bun test` run shares this one in-memory database,
// so the first file to create the table defines it for every other file — any drift from
// schema.ts here breaks unrelated suites.
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

function seed(company: string, status: string | null): void {
  sqlite
    .prepare('INSERT INTO jobs (company, job_title, analysis_status, user_id) VALUES (?, ?, ?, 1)')
    .run(company, 'Engineer', status)
}

function statusOf(company: string): string | null {
  const row = sqlite
    .query('SELECT analysis_status FROM jobs WHERE company = ?')
    .get(company) as { analysis_status: string | null }
  return row.analysis_status
}

beforeAll(() => {
  sqlite.run(CREATE_JOBS_TABLE)
})

beforeEach(() => {
  sqlite.run('DELETE FROM jobs')
})

describe('reclaimStrandedAnalyzing', () => {
  // runAnalysis writes 'analyzing' before the Anthropic call, so a crash mid-run leaves a row in a
  // state no query ever selects again. No run can be in flight at boot, so every such row is stranded.
  test("resets rows stranded at 'analyzing' to 'pending'", () => {
    seed('Stranded Co', 'analyzing')

    reclaimStrandedAnalyzing()

    expect(statusOf('Stranded Co')).toBe('pending')
  })

  test('leaves every other status untouched', () => {
    seed('Done Co', 'done')
    seed('Failed Co', 'failed')
    seed('Pending Co', 'pending')
    seed('Null Co', null)

    reclaimStrandedAnalyzing()

    expect(statusOf('Done Co')).toBe('done')
    expect(statusOf('Failed Co')).toBe('failed')
    expect(statusOf('Pending Co')).toBe('pending')
    expect(statusOf('Null Co')).toBeNull()
  })

  test('is idempotent — a second run changes nothing', () => {
    seed('Stranded Co', 'analyzing')
    seed('Done Co', 'done')

    reclaimStrandedAnalyzing()
    reclaimStrandedAnalyzing()

    expect(statusOf('Stranded Co')).toBe('pending')
    expect(statusOf('Done Co')).toBe('done')
  })

  test('reclaims rows across every user, not just one', () => {
    sqlite
      .prepare("INSERT INTO jobs (company, job_title, analysis_status, user_id) VALUES ('Tenant B Co', 'Engineer', 'analyzing', 2)")
      .run()
    seed('Tenant A Co', 'analyzing')

    reclaimStrandedAnalyzing()

    expect(statusOf('Tenant A Co')).toBe('pending')
    expect(statusOf('Tenant B Co')).toBe('pending')
  })
})
