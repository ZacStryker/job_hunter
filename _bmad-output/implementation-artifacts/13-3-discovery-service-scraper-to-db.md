# Story 13.3: Discovery Service — Scraper to DB

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-3-discovery-service-scraper-to-db  
**Status:** done  
**Depends on:** 13-2  
**Date:** 2026-04-14

---

## User Story

As a job seeker, I want the Discovery button to find new job listings and save them directly to the local database, so that I don't need n8n or Google Sheets to populate my pipeline.

---

## Acceptance Criteria

### AC1 — discovery-service.ts created
- New `src/server/services/discovery-service.ts` implements a `runDiscovery()` function
- Fires 6 parallel `POST /scrape/search` requests to `SCRAPER_URL` with `Authorization: Bearer <SCRAPER_TOKEN>` header:
  - LinkedIn: query `"genai ml"`, location `"The Randstad, Netherlands"`
  - Indeed: query `"genai ml python"`, location `"remote"`
  - Indeed NL: query `"genai ml python"`, location `"Randstad"`
  - LinkedIn: query `"Full stack developer"`, location `"Remote"`
  - Indeed: query `"full stack developer"`, location `"remote"`
  - Indeed NL: query `"full stack developer"`, location `"Randstad"`
- Collects `results[]` from each response (shape: `{ id, title, company, location, url }`)

### AC2 — Deduplication against DB
- Before inserting, queries existing `externalJobId` values from the DB
- Deduplicates within the current batch and against existing rows by `externalJobId`
- Only new jobs (not already in DB) are inserted

### AC3 — New jobs written to DB
- Each new job inserted with: `company`, `jobTitle`, `location`, `sourceUrl` (url), `source`, `externalJobId` (id), `dateScraped` (today ISO datetime), `analysisStatus = 'pending'`
- Insert uses a transaction for the batch

### AC4 — api-webhooks.ts updated
- `POST /api/webhooks/discovery` handler calls `runDiscovery()` instead of forwarding to `DISCOVERY_WEBHOOK_URL`
- Returns `{ ok: true }` with count on success; `{ error: string }` + 502 on failure
- `recordRun` call updated with actual item count
- `DISCOVERY_WEBHOOK_URL` env var is removed from `.env.example`

### AC5 — New env vars documented
- `SCRAPER_URL` and `SCRAPER_TOKEN` added to `.env.example` with comments
- Both are optional at startup (Discovery is gracefully disabled if absent, returning 503)

### AC6 — Tests
- `discovery-service.test.ts` unit tests with mocked `fetch`: happy path inserts correct rows; deduplication skips existing externalJobIds; scraper error results in thrown error
- `api-webhooks.test.ts` updated: discovery route tests rewritten to mock `discovery-service` module; analysis route tests unchanged
- All tests pass

---

## Technical Requirements

### Files to create/modify

| File | Change |
|------|--------|
| `src/server/services/discovery-service.ts` | **NEW** — discovery service |
| `src/server/services/discovery-service.test.ts` | **NEW** — unit tests |
| `src/server/routes/api-webhooks.ts` | Update discovery route only |
| `src/server/routes/api-webhooks.test.ts` | Rewrite discovery tests; keep analysis tests |
| `.env.example` | Add `SCRAPER_URL`, `SCRAPER_TOKEN`; remove `DISCOVERY_WEBHOOK_URL` |

No schema changes. No migration needed. No new routes. No UI changes.

---

## Implementation Notes

### 1. discovery-service.ts — full structure

```ts
import { isNotNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs } from '../../db/schema'

interface ScraperResult {
  id: string
  title: string
  company: string
  location: string | null
  url: string | null
}

const SEARCHES = [
  { source: 'linkedin', query: 'genai ml',              location: 'The Randstad, Netherlands' },
  { source: 'indeed',   query: 'genai ml python',       location: 'remote' },
  { source: 'indeed',   query: 'genai ml python',       location: 'Randstad' },
  { source: 'linkedin', query: 'Full stack developer',  location: 'Remote' },
  { source: 'indeed',   query: 'full stack developer',  location: 'remote' },
  { source: 'indeed',   query: 'full stack developer',  location: 'Randstad' },
]

export async function runDiscovery(): Promise<{ inserted: number }> {
  const scraperUrl = process.env.SCRAPER_URL
  const scraperToken = process.env.SCRAPER_TOKEN
  if (!scraperUrl) throw new Error('SCRAPER_URL not configured')

  // Fire all 6 searches in parallel
  const responses = await Promise.all(
    SEARCHES.map((s) =>
      fetch(`${scraperUrl}/scrape/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scraperToken ? { Authorization: `Bearer ${scraperToken}` } : {}),
        },
        body: JSON.stringify({ query: s.query, location: s.location }),
        signal: AbortSignal.timeout(60_000),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`Scraper error ${res.status} for "${s.query}"`)
        const data = await res.json() as { results?: ScraperResult[] }
        return { source: s.source, results: data.results ?? [] }
      })
    )
  )

  // Flatten all results, tagging each with its source
  const allResults = responses.flatMap((r) =>
    r.results.map((job) => ({ ...job, source: r.source }))
  )

  // Query existing externalJobIds (non-null only)
  const existing = db
    .select({ externalJobId: jobs.externalJobId })
    .from(jobs)
    .where(isNotNull(jobs.externalJobId))
    .all()
  const existingIds = new Set(existing.map((r) => r.externalJobId!))

  // Deduplicate within batch and against DB
  const seen = new Set<string>()
  const newJobs = allResults.filter((r) => {
    if (!r.id || existingIds.has(r.id) || seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })

  if (newJobs.length === 0) return { inserted: 0 }

  const dateScraped = new Date().toISOString()

  db.transaction((tx) => {
    for (const job of newJobs) {
      tx
        .insert(jobs)
        .values({
          company: job.company,
          jobTitle: job.title,
          location: job.location ?? null,
          sourceUrl: job.url ?? null,
          source: job.source,
          externalJobId: job.id,
          dateScraped,
          analysisStatus: 'pending',
        })
        .onConflictDoNothing()   // safety net: (company, jobTitle) unique index
        .run()
    }
  })

  return { inserted: newJobs.length }
}
```

**Key design notes:**
- `SCRAPER_TOKEN` is optional — omit `Authorization` header if unset; don't throw if missing
- `SCRAPER_URL` is required — throw if unset (caller catches and returns 503)
- `AbortSignal.timeout(60_000)` — 60s per-request timeout
- `onConflictDoNothing()` — defensive safety net in case (company, jobTitle) collides on dedup-missed edge cases; does NOT affect the dedup-by-externalJobId logic above it
- `analysisStatus: 'pending'` — marks newly discovered jobs for the Analysis service
- `dateScraped` — full ISO 8601 datetime (`new Date().toISOString()`), not date-only

**Scraper request body** — confirm with scraper API. The example above sends `{ query, location }`. If the scraper also needs a `source` field (to choose linkedin/indeed endpoint), add it: `{ query, location, source }`. Do NOT guess and send undefined fields.

### 2. api-webhooks.ts — discovery route replacement

Replace only the `/discovery` route. Keep `fireWebhook()` and `/analysis` unchanged:

```ts
import { runDiscovery } from '../services/discovery-service'

app.post('/discovery', async (c) => {
  const scraperUrl = process.env.SCRAPER_URL
  if (!scraperUrl) return c.json({ error: 'SCRAPER_URL not configured' }, 503)

  try {
    const { inserted } = await runDiscovery()
    recordRun({ name: 'Discovery', success: true, itemCount: inserted })
    return c.json({ ok: true, inserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[discovery] run failed:', message)
    recordRun({ name: 'Discovery', success: false, itemCount: null, errorMessage: message })
    return c.json({ error: message }, 502)
  }
})
```

**Do NOT remove `fireWebhook()` or the `/analysis` route** — analysis still uses the webhook forwarding pattern.

### 3. .env.example — env var changes

Remove: `DISCOVERY_WEBHOOK_URL=`  
Add (in the n8n/automation section or a new Discovery section):

```
# Discovery Service (Epic 13)
SCRAPER_URL=       # base URL of the scraper service (e.g. http://localhost:4000)
SCRAPER_TOKEN=     # optional Bearer token for scraper auth
```

### 4. discovery-service.test.ts — test structure

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

const { runDiscovery } = await import('../services/discovery-service')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    job_title TEXT NOT NULL,
    source_url TEXT,
    date_scraped TEXT,
    source TEXT,
    location TEXT,
    external_job_id TEXT,
    analysis_status TEXT,
    fit_score INTEGER,
    recommendation TEXT,
    role_fit TEXT,
    requirements_met TEXT,
    requirements_missed TEXT,
    red_flags TEXT,
    job_description TEXT,
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

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  process.env.SCRAPER_URL = 'http://test-scraper.invalid'
  process.env.SCRAPER_TOKEN = 'test-token'
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM jobs')
})
```

**Test cases:**

```ts
test('happy path: inserts new jobs from all 6 searches', async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(
      JSON.stringify({ results: [{ id: 'job-1', title: 'SWE', company: 'Acme', location: 'NL', url: 'https://acme.com/1' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  )

  const { inserted } = await runDiscovery()
  // 6 searches × 1 result = 6 total, but job-1 is deduplicated within batch → 1 inserted
  expect(inserted).toBe(1)
  const rows = prodSqlite.prepare('SELECT * FROM jobs').all() as Array<Record<string, unknown>>
  expect(rows).toHaveLength(1)
  expect(rows[0].company).toBe('Acme')
  expect(rows[0].external_job_id).toBe('job-1')
  expect(rows[0].analysis_status).toBe('pending')
})

test('deduplication: skips jobs already in DB by externalJobId', async () => {
  prodSqlite.run(
    `INSERT INTO jobs (company, job_title, external_job_id, analysis_status) VALUES ('Acme', 'SWE', 'job-1', 'done')`
  )

  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(
      JSON.stringify({ results: [
        { id: 'job-1', title: 'SWE', company: 'Acme', location: null, url: null },      // exists
        { id: 'job-2', title: 'Dev', company: 'Beta', location: null, url: null },      // new
      ]}),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  )

  const { inserted } = await runDiscovery()
  expect(inserted).toBe(1) // only job-2
  const rows = prodSqlite.prepare('SELECT external_job_id FROM jobs ORDER BY id').all() as Array<{ external_job_id: string }>
  expect(rows.map(r => r.external_job_id)).toContain('job-1')
  expect(rows.map(r => r.external_job_id)).toContain('job-2')
})

test('scraper error: throws when any search returns non-ok status', async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(null, { status: 500 }))
  )

  await expect(runDiscovery()).rejects.toThrow()
})

test('missing SCRAPER_URL: throws', async () => {
  const original = process.env.SCRAPER_URL
  delete process.env.SCRAPER_URL
  await expect(runDiscovery()).rejects.toThrow('SCRAPER_URL not configured')
  process.env.SCRAPER_URL = original
})

test('sets analysisStatus to pending on insert', async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(
      JSON.stringify({ results: [{ id: 'job-99', title: 'Eng', company: 'Co', location: null, url: null }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  )
  await runDiscovery()
  const row = prodSqlite.prepare('SELECT analysis_status FROM jobs WHERE external_job_id = ?').get('job-99') as { analysis_status: string }
  expect(row.analysis_status).toBe('pending')
})
```

### 5. api-webhooks.test.ts — discovery section rewrite

The discovery tests must be completely replaced. The analysis tests are unchanged.

**Add `mock.module()` BEFORE the dynamic import** of `api-webhooks`:

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

// Mock discovery-service BEFORE dynamic import — bun:test hoisting requirement
let mockRunDiscovery: () => Promise<{ inserted: number }> = async () => ({ inserted: 0 })
mock.module('../services/discovery-service', () => ({
  runDiscovery: () => mockRunDiscovery(),
}))

const { default: webhooksApp } = await import('./api-webhooks')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client
```

**Replace the 3 existing discovery tests** with:

```ts
describe('POST /api/webhooks/discovery', () => {
  test('returns 503 when SCRAPER_URL is not set', async () => {
    delete process.env.SCRAPER_URL
    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 200 and records run with inserted count on success', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => ({ inserted: 5 })

    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; inserted: number }
    expect(body.ok).toBe(true)
    expect(body.inserted).toBe(5)

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(1)
    expect(row.item_count).toBe(5)

    delete process.env.SCRAPER_URL
  })

  test('returns 502 and records failed run when runDiscovery throws', async () => {
    process.env.SCRAPER_URL = 'http://test-scraper.invalid'
    mockRunDiscovery = async () => { throw new Error('Scraper timeout') }

    const res = await webhooksApp.request('/discovery', { method: 'POST' })
    expect(res.status).toBe(502)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Discovery') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(0)
    expect(row.item_count).toBeNull()

    delete process.env.SCRAPER_URL
  })
})
```

The `afterEach` in the updated test should reset `mockRunDiscovery` to prevent bleed between tests.

---

## Architecture Guardrails

### Data ownership — new column usage
- `externalJobId`: set on INSERT only; never updated by this service or any ingest path
- `analysisStatus`: always `'pending'` on insert by this service; Analysis service owns all future transitions
- `source`: `'linkedin'` or `'indeed'` — derived from search config, not from scraper response

### Error propagation
- `runDiscovery()` throws on any error — caller (`api-webhooks.ts`) is responsible for catching and returning 502
- `console.error` on server for all caught errors; never `console.log`
- Individual scraper result parse failures should NOT abort the whole run — use `.catch(() => [])` per search if you want partial resilience (the story AC does not require this — a single failing search throws the whole run)

### DB patterns
- Import `db` from `../../db/client` — never instantiate a second Drizzle instance
- Import `jobs` table from `../../db/schema`
- Use `isNotNull` from `drizzle-orm` for the existing-IDs query
- Transaction: `db.transaction((tx) => { ... tx.insert(...).run() })` — same pattern as `ingest-service.ts`
- `.onConflictDoNothing()` on insert — defensive only; dedup should prevent conflicts

### Test isolation
- `process.env.DB_PATH = ':memory:'` at the very top before any imports
- `CREATE_JOBS_TABLE` DDL: use the canonical column order from `schema.ts` (external_job_id after location, analysis_status after external_job_id)
- Clean `DELETE FROM jobs` in `beforeEach`
- Reset `mockRunDiscovery` in `afterEach` to prevent test bleed

### No new files beyond the list
- No changes to `src/index.ts` — `/api/webhooks` route is already mounted
- No UI changes — the Discovery button already calls `POST /api/webhooks/discovery`
- No schema changes — `externalJobId` and `analysisStatus` columns exist from Story 13-2

---

## Previous Story Context (13-2)

Story 13-2 added:
- `externalJobId: text('external_job_id')` — Scraper/pipeline insert-only column
- `analysisStatus: text('analysis_status')` — `z.enum(['pending', 'analyzing', 'done', 'failed']).nullable()`
- Simplified ON CONFLICT SET to 4 scraper-metadata fields only

Current state of `api-webhooks.ts` discovery route forwards to `DISCOVERY_WEBHOOK_URL` env var. This story replaces that with a direct service call. The existing `fireWebhook()` helper and `/analysis` route are untouched.

Review findings from 13-2 (all resolved, none deferred to this story).

---

## Dev Agent Record

### Implementation Plan
Implemented discovery-service.ts as a standalone module that fires 6 parallel POST requests to the scraper API, deduplicates results against existing `externalJobId` values in the DB, then inserts new jobs in a transaction. Replaced the `/discovery` webhook-forwarding route in `api-webhooks.ts` with a direct call to `runDiscovery()`. Used `mock.module()` in the webhooks test file (before dynamic imports) to isolate the discovery service from HTTP contract tests.

### Completion Notes
- ✅ AC1: `discovery-service.ts` created with `runDiscovery()` — fires 6 parallel scraper searches
- ✅ AC2: Deduplicates within batch and against existing `externalJobId` values in DB
- ✅ AC3: New jobs inserted in a transaction with `analysisStatus: 'pending'`
- ✅ AC4: `api-webhooks.ts` discovery route replaced — calls `runDiscovery()`, returns `{ ok, inserted }`, records actual item count
- ✅ AC5: `SCRAPER_URL` and `SCRAPER_TOKEN` added to `.env.example`; `DISCOVERY_WEBHOOK_URL` removed
- ✅ AC6: `discovery-service.test.ts` — 5 unit tests (happy path, dedup, scraper error, missing env var, analysisStatus); `api-webhooks.test.ts` — 3 discovery tests rewritten with module mock, 2 analysis tests unchanged; all 128 tests pass

---

## File Checklist

### Files to create:
- `job-hunt-dashboard/src/server/services/discovery-service.ts`
- `job-hunt-dashboard/src/server/services/discovery-service.test.ts`

### Files to modify:
- `job-hunt-dashboard/src/server/routes/api-webhooks.ts`
- `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts`
- `job-hunt-dashboard/.env.example`

### No changes needed:
- `src/index.ts` (route already mounted)
- `src/db/schema.ts` (columns already exist)
- `src/shared/schemas.ts` (no new types needed)
- Any UI component

---

## Review Findings

- [x] [Review][Patch] Null/missing company or title from scraper throws inside transaction, rolling back all inserts [`discovery-service.ts:57-61`] — fixed: added `!r.company || !r.title` guard in dedup filter
- [x] [Review][Patch] Missing `afterEach` to reset `globalThis.fetch` in `discovery-service.test.ts` — fixed: added `afterEach(() => { globalThis.fetch = originalFetch })` with captured original
- [x] [Review][Defer] `inserted` count reports `newJobs.length` not actual DB writes [`discovery-service.ts:86`] — deferred, pre-existing design; `onConflictDoNothing` is a safety net and dedup should prevent conflicts per spec
- [x] [Review][Defer] No test for network-level fetch error (TypeError vs non-ok Response) [`discovery-service.test.ts`] — deferred, pre-existing design; AC6 scraper-error test covers the observable behavior
- [x] [Review][Defer] `AbortSignal.timeout` per-request, no outer handler deadline [`api-webhooks.ts`] — deferred, no spec requirement for overall timeout; 60s per-request with parallel execution is acceptable

---

## Change Log

- Created story with epic planning context (Date: 2026-03-30)
- Enriched with full implementation context, code patterns, test structure (Date: 2026-04-14)
- Implemented story — discovery service, webhooks route update, env vars, tests (Date: 2026-04-14)
