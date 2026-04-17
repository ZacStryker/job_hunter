# Story 13.4: Analysis Service — DB + Scraper + Anthropic to DB

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline
**Story ID:** 13-4-analysis-service-db-scraper-anthropic
**Status:** done
**Depends on:** 13-3
**Date:** 2026-04-14

---

## User Story

As a job seeker, I want the Analysis button to score unanalyzed jobs using AI and write results directly to the database, so that fit scores and recommendations appear in my pipeline without needing n8n or Google Sheets.

---

## Acceptance Criteria

### AC1 — analysis-service.ts created
- New `src/server/services/analysis-service.ts` implements a `runAnalysis()` function
- Queries DB for jobs where `analysisStatus = 'pending'`, limited to 10 per run
- Returns `{ processed: number, failed: number }`

### AC2 — Description fetching via scraper
- For each pending job, calls `POST /scrape/listing` at `SCRAPER_URL` with `Authorization: Bearer <SCRAPER_TOKEN>`, body `{ source, url }` (uses `job.sourceUrl`)
- Sets `analysisStatus = 'analyzing'` on the job row before the scraper call
- On scraper failure, logs the error and continues to Anthropic with empty description — scraper failure does NOT mark the job as failed
- If `SCRAPER_URL` is not set, or `job.sourceUrl` is null, proceeds with empty description

### AC3 — Profile fetched from DB
- Reads the profile row from the `profile` table (not via HTTP) using `db.select().from(profile).limit(1).get()`
- Profile is fetched once before the job loop, not per-job
- If no profile exists, analysis proceeds with empty profile fields (no hard failure)

### AC4 — Anthropic call per job
- Calls `https://api.anthropic.com/v1/messages` via fetch (not the SDK) with headers:
  - `x-api-key: ANTHROPIC_API_KEY`
  - `anthropic-version: 2023-06-01`
  - `content-type: application/json`
- Model: `claude-opus-4-6`, `max_tokens: 1024`
- **Single user message only — no `system` field** — the entire prompt is one string in `messages[0].content`
- Prompt structure (matching the n8n flow exactly):
  ```
  You are evaluating a job opportunity for <profile.name or "a candidate">.

  CANDIDATE BACKGROUND:
  {"Name":...,"Email":...,"Phone":...,"Location":...,"Summary":...,"Experience":...,"Skills":...,"Education":...}

  JOB PREFERENCES: full-time, English-speaking environment

  JOB LISTING:
  {"Company":...,"Title":...,"Location":...,"Description":...}

  Analyze this job for <profile.name or "the candidate">. Respond with ONLY valid JSON — no markdown, no code blocks, no explanation:
  { "score": ..., "role_fit": ..., ... }
  ```
- Expected JSON keys: `score`, `role_fit`, `red_flags`, `requirements_met`, `requirements_missed`, `salary`, `benefits`, `contact_name`, `contact_email`, `contact_phone`, `recommended_action`
- Response text may be wrapped in a markdown code block — extract JSON with `/\{[\s\S]*\}/` regex as fallback

### AC5 — Results written to DB
- On success, updates job row with:
  - `fitScore ← score`
  - `recommendation ← recommended_action`
  - `roleFit ← role_fit`
  - `requirementsMet ← requirements_met`
  - `requirementsMissed ← requirements_missed`
  - `redFlags ← red_flags`
  - `jobDescription ← description` (from scraper response)
  - `salary`, `benefits`, `contactName ← contact_name`, `contactEmail ← contact_email`, `contactPhone ← contact_phone`
- Sets `analysisStatus = 'done'`
- On Anthropic error, JSON parse failure, or any exception after `'analyzing'` set: sets `analysisStatus = 'failed'`; does not overwrite any previously set user-owned fields

### AC6 — api-webhooks.ts updated
- `POST /api/webhooks/analysis` handler calls `runAnalysis()` instead of forwarding to `ANALYSIS_WEBHOOK_URL`
- Returns `{ ok: true, processed, failed }` on success
- Returns 503 if `ANTHROPIC_API_KEY` is absent at request time
- `recordRun` call uses `itemCount: processed`
- `ANALYSIS_WEBHOOK_URL` env var removed from `.env.example`

### AC7 — New env var documented
- `ANTHROPIC_API_KEY` added to `.env.example` with comment
- App does not exit at startup if absent — the webhook handler checks at request time

### AC8 — Tests
- `analysis-service.test.ts` unit tests with mocked fetch: happy path writes correct fields; scraper failure continues with empty description (job still processed); Anthropic error marks job failed; JSON parse failure marks job failed; missing profile does not throw; missing ANTHROPIC_API_KEY throws
- `api-webhooks.test.ts` updated: analysis route calls service (mock-module pattern), returns processed/failed counts, 503 when key absent
- All tests pass

---

## Technical Requirements

### Files to create/modify

| File | Change |
|------|--------|
| `src/server/services/analysis-service.ts` | **NEW** — analysis service |
| `src/server/services/analysis-service.test.ts` | **NEW** — unit tests |
| `src/server/routes/api-webhooks.ts` | Replace analysis route only; keep discovery route unchanged |
| `src/server/routes/api-webhooks.test.ts` | Replace analysis tests with mock-module pattern; keep discovery tests |
| `.env.example` | Add `ANTHROPIC_API_KEY`; remove `ANALYSIS_WEBHOOK_URL` |

No schema changes. No migration needed. No new routes. No UI changes.

---

## Implementation Notes

### 1. analysis-service.ts — full structure

```ts
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { jobs, profile } from '../../db/schema'

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>
}

interface AnalysisResult {
  score: number
  role_fit: string
  red_flags: string
  requirements_met: string
  requirements_missed: string
  salary: string
  benefits: string
  contact_name: string
  contact_email: string
  contact_phone: string
  recommended_action: string
}

function buildPrompt(
  job: typeof jobs.$inferSelect,
  description: string,
  profileRow: typeof profile.$inferSelect | null
): string {
  const candidateName = profileRow?.name ?? 'a candidate'
  const resume = JSON.stringify({
    Name: profileRow?.name ?? null,
    Email: profileRow?.email ?? null,
    Phone: profileRow?.phone ?? null,
    Location: profileRow?.location ?? null,
    Summary: profileRow?.summary ?? null,
    Experience: profileRow?.experience ?? null,
    Skills: profileRow?.skills ?? null,
    Education: profileRow?.education ?? null,
  })
  const jobJson = JSON.stringify({
    Company: job.company,
    Title: job.jobTitle,
    Location: job.location ?? null,
    Description: description || null,
  })
  return `You are evaluating a job opportunity for ${candidateName}.

CANDIDATE BACKGROUND:
${resume}

JOB PREFERENCES: full-time, English-speaking environment

JOB LISTING:
${jobJson}

Analyze this job for ${candidateName}. Respond with ONLY valid JSON — no markdown, no code blocks, no explanation:
{ "score": <integer 1-99>, "role_fit": "<string>", "red_flags": "<string>", "requirements_met": "<string>", "requirements_missed": "<string>", "salary": "<string or null>", "benefits": "<string or null>", "contact_name": "<string or null>", "contact_email": "<string or null>", "contact_phone": "<string or null>", "recommended_action": "<apply|investigate|skip>" }`
}

export async function runAnalysis(): Promise<{ processed: number; failed: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const scraperUrl = process.env.SCRAPER_URL
  const scraperToken = process.env.SCRAPER_TOKEN

  // Fetch profile once before the loop
  const profileRow = db.select().from(profile).limit(1).get() ?? null

  // Query up to 10 pending jobs
  const pendingJobs = db
    .select()
    .from(jobs)
    .where(eq(jobs.analysisStatus, 'pending'))
    .limit(10)
    .all()

  let processed = 0
  let failed = 0

  for (const job of pendingJobs) {
    // Mark as analyzing before any external call
    db.update(jobs).set({ analysisStatus: 'analyzing' }).where(eq(jobs.id, job.id)).run()

    try {
      // Step 1: Fetch description from scraper — failure is non-fatal, continues with empty description
      let description = ''
      if (scraperUrl && job.sourceUrl) {
        try {
          const scraperRes = await fetch(`${scraperUrl}/scrape/listing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(scraperToken ? { Authorization: `Bearer ${scraperToken}` } : {}),
            },
            body: JSON.stringify({ source: job.source, url: job.sourceUrl }),
            signal: AbortSignal.timeout(60_000),
          })
          if (!scraperRes.ok) throw new Error(`Scraper HTTP ${scraperRes.status}`)
          const scraperData = await scraperRes.json() as { description?: string }
          description = scraperData.description?.replace(/[\r\n]+/g, ' ').trim() ?? ''
        } catch (scraperErr) {
          console.error(`[analysis] scraper failed for job ${job.id}:`, scraperErr instanceof Error ? scraperErr.message : String(scraperErr))
          // Continue to Anthropic with empty description — scraper failure is not job failure
        }
      }

      // Step 2: Call Anthropic (single user message — no system field)
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: buildPrompt(job, description, profileRow) }],
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!anthropicRes.ok) throw new Error(`Anthropic error ${anthropicRes.status}`)

      const anthropicData = await anthropicRes.json() as AnthropicMessage
      const text = anthropicData.content.find((b) => b.type === 'text')?.text ?? ''

      // Parse JSON — try direct parse first, fall back to regex extraction
      let result: AnalysisResult
      try {
        result = JSON.parse(text) as AnalysisResult
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON found in Anthropic response')
        result = JSON.parse(jsonMatch[0]) as AnalysisResult
      }

      // Step 3: Write results to DB
      db.update(jobs)
        .set({
          fitScore: typeof result.score === 'number' ? result.score : null,
          recommendation: result.recommended_action ?? null,
          roleFit: result.role_fit ?? null,
          requirementsMet: result.requirements_met ?? null,
          requirementsMissed: result.requirements_missed ?? null,
          redFlags: result.red_flags ?? null,
          jobDescription: description || null,
          salary: result.salary ?? null,
          benefits: result.benefits ?? null,
          contactName: result.contact_name ?? null,
          contactEmail: result.contact_email ?? null,
          contactPhone: result.contact_phone ?? null,
          analysisStatus: 'done',
        })
        .where(eq(jobs.id, job.id))
        .run()

      processed++
    } catch (err) {
      console.error(`[analysis] job ${job.id} failed:`, err instanceof Error ? err.message : String(err))
      db.update(jobs).set({ analysisStatus: 'failed' }).where(eq(jobs.id, job.id)).run()
      failed++
    }
  }

  return { processed, failed }
}
```

**Key design notes:**
- Scraper call is wrapped in its own inner `try/catch` — scraper failure logs an error and falls through to Anthropic with empty description; this matches the n8n `continueOnFail: true` behavior
- Scraper endpoint is `POST /scrape/listing` with `{ source, url }` — uses `job.sourceUrl`, not `externalJobId`
- Description newlines are stripped before sending to Claude (matching n8n "Strip Line Breaks" node)
- No `system` field in the Anthropic request — everything is a single user message
- JSON parsing: try direct `JSON.parse` first; fall back to regex extraction for markdown-wrapped responses
- `SCRAPER_URL` / `job.sourceUrl` absence silently skips scraper — only `ANTHROPIC_API_KEY` throws
- `ANTHROPIC_API_KEY` check is at top of function; webhook handler converts the thrown error to 503
- Profile is fetched once, not per-job
- `analysisStatus = 'analyzing'` is set before any async call — jobs don't get stuck as `'pending'` on process crash
- `AbortSignal.timeout(60_000)` for scraper, `120_000` for Anthropic
- Each job is independent — one failure does not stop the loop

### 2. api-webhooks.ts — analysis route replacement

Replace the `/analysis` route. Keep `fireWebhook()` and `/discovery` unchanged (though `fireWebhook` becomes unused dead code — leave it; it will be removed in a future cleanup pass if 13-5 or 13-6 don't need it).

Add import at top:
```ts
import { runAnalysis } from '../services/analysis-service'
```

Replace `/analysis` handler:
```ts
app.post('/analysis', async (c) => {
  if (!process.env.ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)

  try {
    const { processed, failed } = await runAnalysis()
    recordRun({ name: 'Analysis', success: true, itemCount: processed, errorMessage: null })
    return c.json({ ok: true, processed, failed })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analysis] run failed:', message)
    recordRun({ name: 'Analysis', success: false, itemCount: null, errorMessage: message })
    return c.json({ error: message }, 502)
  }
})
```

**Do NOT remove `fireWebhook()` from the file** — stories 13-5 and 13-6 may still use it; removing it now is premature.

### 3. .env.example — env var changes

Remove: `ANALYSIS_WEBHOOK_URL=`

Add `ANTHROPIC_API_KEY` in a new section (or after the Discovery section):
```
# Analysis Service (Epic 13)
ANTHROPIC_API_KEY=    # required for Analysis button; returns 503 if absent
```

### 4. analysis-service.test.ts — full test structure

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

const { runAnalysis } = await import('../services/analysis-service')
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

const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    summary TEXT,
    experience TEXT,
    skills TEXT,
    education TEXT
  )
`

const VALID_ANALYSIS_RESPONSE = {
  score: 85,
  role_fit: 'Strong match for senior dev role',
  red_flags: 'None',
  requirements_met: 'TypeScript, React, Node.js',
  requirements_missed: 'Kubernetes',
  salary: '$120k-$150k',
  benefits: 'Remote, health insurance',
  contact_name: 'Jane Smith',
  contact_email: 'jane@acme.com',
  contact_phone: null,
  recommended_action: 'apply',
}

let originalFetch: typeof globalThis.fetch

beforeAll(() => {
  originalFetch = globalThis.fetch
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_PROFILE_TABLE)
  process.env.SCRAPER_URL = 'http://test-scraper.invalid'
  process.env.SCRAPER_TOKEN = 'test-token'
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM jobs')
  prodSqlite.run('DELETE FROM profile')
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function insertPendingJob(overrides: Partial<Record<string, unknown>> = {}) {
  prodSqlite.run(
    `INSERT INTO jobs (company, job_title, source, source_url, external_job_id, analysis_status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [
      overrides.company ?? 'Acme Corp',
      overrides.job_title ?? 'Senior Engineer',
      overrides.source ?? 'linkedin',
      overrides.source_url ?? 'https://linkedin.com/jobs/view/123',
      overrides.external_job_id ?? 'ext-job-1',
    ]
  )
  return prodSqlite.prepare('SELECT id FROM jobs ORDER BY id DESC LIMIT 1').get() as { id: number }
}

function mockFetchSuccess(scraperDescription = 'We are building AI products.'): void {
  globalThis.fetch = mock((url: string) => {
    if (String(url).includes('scrape/listing')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ description: scraperDescription }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }
    // Anthropic call
    return Promise.resolve(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify(VALID_ANALYSIS_RESPONSE) }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  }) as typeof globalThis.fetch
}

describe('runAnalysis()', () => {
  test('happy path: writes all fields to DB and returns processed=1, failed=0', async () => {
    const { id } = insertPendingJob()
    mockFetchSuccess('Job description text.')

    const result = await runAnalysis()

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)

    const row = prodSqlite
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(id) as Record<string, unknown>

    expect(row.analysis_status).toBe('done')
    expect(row.fit_score).toBe(85)
    expect(row.recommendation).toBe('apply')
    expect(row.role_fit).toBe('Strong match for senior dev role')
    expect(row.requirements_met).toBe('TypeScript, React, Node.js')
    expect(row.requirements_missed).toBe('Kubernetes')
    expect(row.red_flags).toBe('None')
    expect(row.job_description).toBe('Job description text.')
    expect(row.salary).toBe('$120k-$150k')
    expect(row.benefits).toBe('Remote, health insurance')
    expect(row.contact_name).toBe('Jane Smith')
    expect(row.contact_email).toBe('jane@acme.com')
    expect(row.contact_phone).toBeNull()
  })

  test('scraper failure: continues to Anthropic with empty description — job is NOT marked failed', async () => {
    const { id } = insertPendingJob()

    globalThis.fetch = mock((url: string) => {
      if (String(url).includes('scrape/listing')) {
        // Scraper returns an error
        return Promise.resolve(new Response(null, { status: 500 }))
      }
      // Anthropic still called with empty description
      return Promise.resolve(
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(VALID_ANALYSIS_RESPONSE) }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }) as typeof globalThis.fetch

    const result = await runAnalysis()

    // Job should still be processed successfully — scraper failure is non-fatal
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)

    const row = prodSqlite.prepare('SELECT analysis_status, job_description FROM jobs WHERE id = ?').get(id) as {
      analysis_status: string; job_description: string | null
    }
    expect(row.analysis_status).toBe('done')
    expect(row.job_description).toBeNull()  // no description since scraper failed
  })

  test('Anthropic error: marks job as failed', async () => {
    const { id } = insertPendingJob()
    globalThis.fetch = mock((url: string) => {
      if (String(url).includes('scrape/listing')) {
        return Promise.resolve(
          new Response(JSON.stringify({ description: 'desc' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      }
      return Promise.resolve(new Response(null, { status: 500 }))
    }) as typeof globalThis.fetch

    const result = await runAnalysis()

    expect(result.failed).toBe(1)
    expect(result.processed).toBe(0)

    const row = prodSqlite.prepare('SELECT analysis_status FROM jobs WHERE id = ?').get(id) as { analysis_status: string }
    expect(row.analysis_status).toBe('failed')
  })

  test('JSON parse failure: marks job as failed', async () => {
    const { id } = insertPendingJob()
    globalThis.fetch = mock((url: string) => {
      if (String(url).includes('scrape/listing')) {
        return Promise.resolve(
          new Response(JSON.stringify({ description: 'desc' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      }
      // Anthropic returns non-JSON text
      return Promise.resolve(
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: 'I cannot analyze this job.' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }) as typeof globalThis.fetch

    const result = await runAnalysis()

    expect(result.failed).toBe(1)
    const row = prodSqlite.prepare('SELECT analysis_status FROM jobs WHERE id = ?').get(id) as { analysis_status: string }
    expect(row.analysis_status).toBe('failed')
  })

  test('missing profile: does not throw, proceeds with default system prompt', async () => {
    insertPendingJob()
    mockFetchSuccess()
    // No profile row inserted

    const result = await runAnalysis()
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)
  })

  test('missing ANTHROPIC_API_KEY: throws before any DB changes', async () => {
    const original = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    insertPendingJob()

    await expect(runAnalysis()).rejects.toThrow('ANTHROPIC_API_KEY not configured')

    process.env.ANTHROPIC_API_KEY = original

    // Job should NOT be marked analyzing — the throw happened before any DB write
    const row = prodSqlite.prepare('SELECT analysis_status FROM jobs').get() as { analysis_status: string }
    expect(row.analysis_status).toBe('pending')
  })

  test('processes only up to 10 pending jobs per run', async () => {
    for (let i = 1; i <= 12; i++) {
      prodSqlite.run(
        `INSERT INTO jobs (company, job_title, source, external_job_id, analysis_status)
         VALUES (?, ?, 'linkedin', ?, 'pending')`,
        [`Company${i}`, `Job${i}`, `ext-${i}`]
      )
    }
    mockFetchSuccess()

    const result = await runAnalysis()

    expect(result.processed + result.failed).toBe(10)
    const doneCount = (prodSqlite.prepare("SELECT COUNT(*) as c FROM jobs WHERE analysis_status = 'done'").get() as { c: number }).c
    expect(doneCount).toBe(10)
    const pendingCount = (prodSqlite.prepare("SELECT COUNT(*) as c FROM jobs WHERE analysis_status = 'pending'").get() as { c: number }).c
    expect(pendingCount).toBe(2)
  })
})
```

### 5. api-webhooks.test.ts — analysis section replacement

The existing analysis tests use `fireWebhook()` and `ANALYSIS_WEBHOOK_URL`. Replace them entirely with mock-module pattern matching the discovery tests.

Add the module mock for `analysis-service` alongside the existing `discovery-service` mock, BEFORE the dynamic import:

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

// Mock both services BEFORE dynamic import — bun:test hoisting requirement
let mockRunDiscovery: () => Promise<{ inserted: number }> = async () => ({ inserted: 0 })
mock.module('../services/discovery-service', () => ({
  runDiscovery: () => mockRunDiscovery(),
}))

let mockRunAnalysis: () => Promise<{ processed: number; failed: number }> = async () => ({ processed: 0, failed: 0 })
mock.module('../services/analysis-service', () => ({
  runAnalysis: () => mockRunAnalysis(),
}))

const { default: webhooksApp } = await import('./api-webhooks')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client
```

Add `afterEach` reset for both mocks:
```ts
afterEach(() => {
  mockRunDiscovery = async () => ({ inserted: 0 })
  mockRunAnalysis = async () => ({ processed: 0, failed: 0 })
})
```

Replace the existing 2 analysis tests with:
```ts
describe('POST /api/webhooks/analysis', () => {
  test('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 200 with processed/failed counts and records run on success', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => ({ processed: 7, failed: 1 })

    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; processed: number; failed: number }
    expect(body.ok).toBe(true)
    expect(body.processed).toBe(7)
    expect(body.failed).toBe(1)

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Analysis') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(1)
    expect(row.item_count).toBe(7)  // processed count, not total

    delete process.env.ANTHROPIC_API_KEY
  })

  test('returns 502 and records failed run when runAnalysis throws', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockRunAnalysis = async () => { throw new Error('Anthropic timeout') }

    const res = await webhooksApp.request('/analysis', { method: 'POST' })
    expect(res.status).toBe(502)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')

    const row = prodSqlite.query('SELECT * FROM webhook_runs WHERE name = ?').get('Analysis') as {
      success: number; item_count: number | null
    }
    expect(row.success).toBe(0)
    expect(row.item_count).toBeNull()

    delete process.env.ANTHROPIC_API_KEY
  })
})
```

---

## Architecture Guardrails

### Data ownership
- `fitScore`, `recommendation`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription`, `salary`, `benefits`, `contactName`, `contactEmail`, `contactPhone` are all analysis-owned — this service owns writes to these fields
- User-owned fields (`applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`) must NEVER appear in any `.set()` call in this service
- `analysisStatus` transitions: `pending → analyzing → done|failed` — only this service makes these transitions

### Fetch patterns
- Up to two external fetch calls per job: scraper (`POST /scrape/listing`) then Anthropic (`/v1/messages`)
- Both use `AbortSignal.timeout()` — scraper 60s, Anthropic 120s
- Direct fetch to Anthropic API — no SDK, no extra dependency
- No `system` field in Anthropic request body — single user message only
- `SCRAPER_TOKEN` is optional — omit `Authorization` header if unset; don't throw if missing
- `SCRAPER_URL` / `job.sourceUrl` absence silently skips scraper — only `ANTHROPIC_API_KEY` throws

### Error handling
- **Two-level try/catch per job**: inner catch for scraper (non-fatal — logs and continues), outer catch for Anthropic/parse failures (fatal for that job — marks `failed`)
- `console.error` on all failures; `console.log` is forbidden for errors
- On outer catch: set `analysisStatus = 'failed'` and increment `failed` counter
- User-owned fields are never touched on failure paths

### DB patterns
- Import `db` from `../../db/client` — never instantiate a second Drizzle instance
- Import `jobs`, `profile` tables from `../../db/schema`
- Use `eq` from `drizzle-orm` for WHERE clauses
- Individual updates (not transactions) per job — each job update is independent; no multi-row transaction needed here
- Profile fetch: `.limit(1).get()` returns the first row or `undefined`; use `?? null` to normalize

### Test isolation
- `process.env.DB_PATH = ':memory:'` at the very top before any imports
- `CREATE_JOBS_TABLE` DDL: use the canonical column order from `schema.ts`
- `CREATE_PROFILE_TABLE` DDL: needed because `runAnalysis` queries the profile table
- `beforeEach`: clear both `jobs` and `profile` tables
- `afterEach`: restore `globalThis.fetch` to original
- For `api-webhooks.test.ts`: use `mock.module()` for BOTH services (discovery + analysis) before the dynamic import

### No new files beyond the list
- No changes to `src/index.ts`
- No UI changes — the Analysis button already calls `POST /api/webhooks/analysis`
- No schema changes — all target columns exist from Story 13-2

---

## Previous Story Context (13-3)

Story 13-3 created the discovery service pattern which this story mirrors:
- Same `db.select().from(jobs)` query pattern
- Same scraper fetch pattern (`SCRAPER_URL`, `SCRAPER_TOKEN`, `AbortSignal.timeout`)
- Same `mock.module()` test pattern in `api-webhooks.test.ts`
- Discovery tests use `afterEach` to reset `mockRunDiscovery` — this story adds the same for `mockRunAnalysis`

**Current state of `api-webhooks.ts` analysis route** (line 46-53): uses `fireWebhook()` with `ANALYSIS_WEBHOOK_URL`. This story replaces it entirely with a direct `runAnalysis()` call.

**Review findings from 13-3** (all resolved, none deferred to this story):
- `inserted` count vs actual DB writes — deferred by design (pre-existing)
- No test for network-level fetch error — deferred by design
- `AbortSignal.timeout` per-request, no outer handler deadline — deferred

---

## Dev Agent Record

### Implementation Notes

Implemented analysis-service.ts following the exact pattern from discovery-service (story 13-3). Key decisions:
- Two-level try/catch per job: inner for scraper (non-fatal), outer for Anthropic/parse (fatal per job)
- Profile fetched once before the job loop via `db.select().from(profile).limit(1).get() ?? null`
- Direct fetch to Anthropic API — no SDK; single user message, no system field
- JSON parse fallback via `/\{[\s\S]*\}/` regex for markdown-wrapped responses
- `analysisStatus = 'analyzing'` set before any async call to prevent stuck `pending` jobs on crash
- `fireWebhook()` retained in api-webhooks.ts per story instruction (may be needed for 13-5/13-6)

### Completion Notes

- All 7 analysis-service unit tests pass (happy path, scraper failure, Anthropic error, JSON parse failure, missing profile, missing API key, 10-job limit)
- All 6 api-webhooks tests pass (includes 3 new analysis tests with mock-module pattern)
- Full regression suite: 136 pass, 0 fail
- All ACs satisfied: service created, scraper integration, profile fetch, Anthropic call, DB writes, webhook handler updated, env vars documented

---

## File List

- `job-hunt-dashboard/src/server/services/analysis-service.ts` (created)
- `job-hunt-dashboard/src/server/services/analysis-service.test.ts` (created)
- `job-hunt-dashboard/src/server/routes/api-webhooks.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts` (modified)
- `job-hunt-dashboard/.env.example` (modified)

### No changes needed:
- `src/index.ts` (route already mounted)
- `src/db/schema.ts` (all columns exist from 13-2)
- `src/shared/schemas.ts` (no new shared types needed)
- Any UI component

---

## Senior Developer Review (AI)

**Date:** 2026-04-15
**Outcome:** Changes Requested
**Layers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor

### Action Items

- [x] [Review][Patch] Prompt closing line uses `"a candidate"` instead of spec's `"the candidate"` [`analysis-service.ts:buildPrompt`] — fixed
- [x] [Review][Defer] Jobs stuck in `analyzing` state if process crashes mid-loop — deferred, needs separate recovery mechanism
- [x] [Review][Defer] No overall deadline on `runAnalysis` loop (worst-case ~30 min) — deferred, per-request timeouts are spec-prescribed
- [x] [Review][Defer] `AnalysisResult` fields accepted without runtime validation (string score → null, invalid enum stored) — deferred, not spec-required
- [x] [Review][Defer] Error message forwarded verbatim in 502 body — deferred, pre-existing codebase pattern
- [x] [Review][Defer] `recordRun` is synchronous fire-and-forget — deferred, pre-existing codebase pattern
- [x] [Review][Defer] Test env var cleanup not guarded in `afterEach` — deferred, low real-world risk
- [x] [Review][Defer] `recommended_action` enum value not validated before DB write — deferred, not spec-required (see D3)

---

## Change Log

- Created story stub with epic planning context (Date: 2026-03-30)
- Enriched with full implementation context, code patterns, test structure (Date: 2026-04-14)
- Corrected against n8n Job Analysis flow: scraper endpoint → `/scrape/listing` with `{ source, url }`; prompt → single user message matching n8n format; scraper failure → non-fatal, continues to Anthropic with empty description (Date: 2026-04-14)
- Implemented: analysis-service.ts created, api-webhooks.ts analysis route replaced, api-webhooks.test.ts updated with mock-module pattern, .env.example updated; all 136 tests pass (Date: 2026-04-14)
- Code review: 1 patch, 7 deferred, 10 dismissed (Date: 2026-04-15)
