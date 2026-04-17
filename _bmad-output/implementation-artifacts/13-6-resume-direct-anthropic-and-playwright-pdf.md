# Story 13.6: Resume — Direct Anthropic + Playwright PDF

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline
**Story ID:** 13-6-resume-direct-anthropic-and-playwright-pdf
**Status:** done
**Depends on:** 13-4 (for ANTHROPIC_API_KEY pattern), 13-5 (for Anthropic call + profile read pattern)
**Date:** 2026-04-15

---

## User Story

As a job seeker, I want tailored resumes generated in-app and returned as a downloadable PDF, so that I don't need n8n or a PDFBolt account to generate resumes.

---

## Acceptance Criteria

### AC1 — resume-service.ts rewritten
- `callResumeWebhook` replaced with `generateResume(job: Job): Promise<Buffer>` returning a PDF binary
- Throws `'ANTHROPIC_API_KEY not configured'` if key absent at call time
- Reads profile from DB: `db.select().from(profile).limit(1).get() ?? null` — no HTTP round-trip
- Calls `https://api.anthropic.com/v1/messages` with `ANTHROPIC_API_KEY`
- Model: `claude-sonnet-4-6`, `max_tokens: 4096`
- **Uses `system` field** (same as cover-letter-service; unlike analysis-service which uses single user message only)
- System prompt: expert resume writer role + inline HTML resume template (Google Fonts replaced with `system-ui, sans-serif`) + candidate profile fields
- User prompt: requests tailored functional HTML resume for the given role; may reorder/reword skills and bullets for relevance; no emdashes; descending chronological order
- Strips markdown code fences from Claude's response (e.g. ` ```html ` ... ` ``` `) before passing to PDF generation
- Throws `'Anthropic error {status}'` on non-ok HTTP response
- Throws `'Anthropic returned empty resume'` if response is empty after trim + fence strip
- Passes cleaned HTML to `generatePdf(html)` and returns the resulting Buffer

### AC2 — generate-pdf.ts service created
- New `src/server/services/generate-pdf.ts` exports `generatePdf(html: string): Promise<Buffer>`
- Launches Playwright Chromium headless browser
- Calls `page.setContent(html, { waitUntil: 'networkidle' })`
- Calls `page.pdf({ format: 'A4' })` and returns result as a `Buffer`
- Closes browser after each call

### AC3 — Playwright moved to production dependency
- `playwright` moved from `devDependencies` to `dependencies` in `package.json`
- `@playwright/test` stays in `devDependencies` (test-only runner)
- `.env.example` includes a comment: `# One-time setup: bunx playwright install chromium`

### AC4 — Resume endpoint returns PDF
- Existing `POST /:id/generate-resume` route in `api-jobs.ts` updated to return PDF binary:
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="{candidateName} - Resume - {company} - {jobTitle}.pdf"` where `candidateName` comes from `profile.name` (fallback: `'Resume'`)
- Job id still comes from route param `:id`; job fetched from DB by id
- Returns `503` if `ANTHROPIC_API_KEY` is not set (error string check: `'ANTHROPIC_API_KEY not configured'`)
- Returns `404` if job not found
- Returns `400` if job has no job description
- `N8N_RESUME_WEBHOOK_URL` removed from `.env.example`; `N8N_WEBHOOK_SECRET` also removed (no longer needed after this story)

### AC5 — UI updated for PDF download
- `useGenerateResume.ts` hook updated: on success, reads the response as a blob, extracts filename from `Content-Disposition` header, and triggers a browser download (no more fire-and-forget `{ ok: true }` response)
- Button in `JobDrawer` shows loading state (`isPending`) during generation — no change needed to `JobDrawer.tsx` (the mutation return type stays `void`)
- Replaces the current fire-and-forget toast-only behavior

### AC6 — Tests
- `src/server/services/resume-service.test.ts` (NEW): unit tests with mocked fetch + mocked `generatePdf`:
  - Fence stripping: `\`\`\`html\n...\n\`\`\`` stripped to clean HTML before `generatePdf` call
  - Fence stripping: `\`\`\`\n...\n\`\`\`` (no language tag) stripped correctly
  - No-fence: HTML passed unchanged
  - Missing `ANTHROPIC_API_KEY` throws
  - Anthropic HTTP error throws with status
  - Empty Anthropic response throws
- `src/server/routes/api-resume.test.ts` (NEW): contract tests with mocked `resume-service`:
  - 200 with `application/pdf` content-type + `Content-Disposition` containing `.pdf`
  - 503 when service throws `'ANTHROPIC_API_KEY not configured'`
  - 404 for unknown job id
  - 400 for non-numeric id
  - 400 when job has no job description
- Playwright `generatePdf` is mocked in all tests — no real browser launched
- All tests pass (no regressions)

---

## Technical Requirements

### Files to create/modify

| File | Change |
|------|--------|
| `src/server/services/resume-service.ts` | **REWRITE** — `callResumeWebhook` → `generateResume(job): Promise<Buffer>` |
| `src/server/services/resume-service.test.ts` | **NEW** — unit tests with mocked fetch + mocked generatePdf |
| `src/server/services/generate-pdf.ts` | **NEW** — Playwright PDF generator |
| `src/server/routes/api-jobs.ts` | Import swap + 503 error string + response changed to PDF binary + profile import |
| `src/server/routes/api-resume.test.ts` | **NEW** — contract tests for generate-resume route |
| `src/client/hooks/useGenerateResume.ts` | Update: handle blob response + trigger browser download |
| `job-hunt-dashboard/package.json` | Move `playwright` from devDependencies to dependencies |
| `job-hunt-dashboard/.env.example` | Remove `N8N_RESUME_WEBHOOK_URL=` and `N8N_WEBHOOK_SECRET=`; add Playwright install comment |

No schema changes. No migration needed.

---

## Implementation Notes

### 1. generate-pdf.ts

```ts
import { chromium } from 'playwright'

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  const pdf = await page.pdf({ format: 'A4' })
  await browser.close()
  return Buffer.from(pdf)
}
```

> Playwright + Claude may take 10–20 seconds per request — this is expected. `AbortSignal.timeout(120_000)` on the Anthropic fetch handles the worst case.

### 2. resume-service.ts — full implementation

**Critical differences vs cover-letter-service (13-5):**
- Returns `Promise<Buffer>` (PDF bytes), not `Promise<string>` (text)
- `max_tokens: 4096` (not 2048)
- User prompt asks for HTML (not plain text cover letter)
- Response must have markdown fences stripped before PDF generation
- Calls `generatePdf` — cover-letter-service does NOT call any PDF generator

**Fence stripping function:**
```ts
function stripCodeFences(text: string): string {
  let html = text.trim()
  if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '')
  }
  return html.trim()
}
```

**HTML Resume Template — inline into system prompt:**

The system prompt must include an HTML template so Claude has a structure to follow. Use `system-ui, sans-serif` (not Google Fonts — Playwright headless has no network access to fonts):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; font-size: 11pt; color: #1a1a1a; padding: 32px 40px; line-height: 1.4; }
  h1 { font-size: 22pt; font-weight: 700; }
  .contact { font-size: 9.5pt; color: #555; margin-top: 4px; }
  .section { margin-top: 18px; }
  .section-title { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1.5px solid #1a1a1a; padding-bottom: 2px; margin-bottom: 8px; }
  .entry { margin-bottom: 10px; }
  .entry-header { display: flex; justify-content: space-between; }
  .entry-title { font-weight: 600; }
  .entry-meta { font-size: 9.5pt; color: #555; }
  ul { padding-left: 16px; margin-top: 4px; }
  li { font-size: 10.5pt; margin-bottom: 2px; }
  .skills { font-size: 10.5pt; }
</style>
</head>
<body>
  <h1>CANDIDATE_NAME</h1>
  <div class="contact">EMAIL · PHONE · LOCATION · LINKEDIN · WEBSITE</div>
  <div class="section"><div class="section-title">Summary</div><p>SUMMARY</p></div>
  <div class="section"><div class="section-title">Experience</div>EXPERIENCE_ENTRIES</div>
  <div class="section"><div class="section-title">Skills</div><p class="skills">SKILLS</p></div>
  <div class="section"><div class="section-title">Education</div>EDUCATION_ENTRIES</div>
</body>
</html>
```

**System prompt builder:**
```ts
function buildSystemPrompt(p: typeof profile.$inferSelect | null): string {
  const template = `...` // inline template above
  return (
    'You are an expert resume writer. Return ONLY valid HTML — no markdown, no code fences, no explanatory text.\n\n' +
    'CANDIDATE PROFILE:\n' +
    'Name: ' + (p?.name ?? '') + '\n' +
    'Email: ' + (p?.email ?? '') + '\n' +
    'Phone: ' + (p?.phone ?? '') + '\n' +
    'Location: ' + (p?.location ?? '') + '\n' +
    'LinkedIn: ' + (p?.linkedinUrl ?? '') + '\n' +
    'Website: ' + (p?.githubUrl ?? '') + '\n' +
    'Summary: ' + (p?.summary ?? '') + '\n' +
    'Experience: ' + (p?.experience ?? '') + '\n' +
    'Skills: ' + (p?.skills ?? '') + '\n' +
    'Education: ' + (p?.education ?? '') + '\n\n' +
    'HTML TEMPLATE (use this structure):\n' + template
  )
}
```

**User message:**
```ts
function buildUserMessage(job: Job): string {
  return (
    'Generate a tailored functional HTML resume for this role. ' +
    'Reorder and reword skills and bullets for maximum relevance. ' +
    'No emdashes. Descending chronological order for experience.\n\n' +
    'Target Role: ' + job.company + ' — ' + job.jobTitle + '\n' +
    'Location: ' + (job.location ?? '') + '\n' +
    'Description: ' + (job.jobDescription ?? '')
  )
}
```

**Full `generateResume` function:**
```ts
import { db } from '../../db/client'
import { profile } from '../../db/schema'
import { generatePdf } from './generate-pdf'
import type { Job } from '../../shared/schemas'

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
}

export async function generateResume(job: Job): Promise<Buffer> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const profileRow = db.select().from(profile).limit(1).get() ?? null

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: buildSystemPrompt(profileRow),
      messages: [{ role: 'user', content: buildUserMessage(job) }],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!anthropicRes.ok) throw new Error(`Anthropic error ${anthropicRes.status}`)

  const data = await anthropicRes.json() as AnthropicResponse
  const rawText = data.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
  if (!rawText) throw new Error('Anthropic returned empty resume')

  const html = stripCodeFences(rawText)
  return generatePdf(html)
}
```

### 3. api-jobs.ts — changes needed

**Import line 5 — add `profile`:**
```ts
import { jobs, statusEvents, coverLetters, messages, profile } from '../../db/schema'
```

**Import line 8 — swap resume service:**
```ts
// Remove:
import { callResumeWebhook } from '../services/resume-service'
// Add:
import { generateResume } from '../services/resume-service'
```

**Route `POST /:id/generate-resume` (lines 266–297) — full replacement:**
```ts
app.post('/:id/generate-resume', async (c) => {
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid job id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid job id' }, 400)
  }

  const job = db.select().from(jobs).where(eq(jobs.id, rawId)).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }
  if (!job.jobDescription) {
    return c.json({ error: 'Job has no job description' }, 400)
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await generateResume(job as Job)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'ANTHROPIC_API_KEY not configured') {
      return c.json({ error: 'Resume generation is not configured' }, 503)
    }
    recordRun({ name: `Resume - ${job.company} - ${job.jobTitle}`, success: false, itemCount: 0, errorMessage: message })
    return c.json({ error: 'Resume generation failed' }, 502)
  }

  const profileRow = db.select().from(profile).limit(1).get()
  const candidateName = profileRow?.name ?? 'Resume'
  const fileName = `${candidateName} - Resume - ${job.company} - ${job.jobTitle}.pdf`

  recordRun({ name: `Resume - ${job.company} - ${job.jobTitle}`, success: true, itemCount: 1 })
  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
})
```

### 4. useGenerateResume.ts — full replacement

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useGenerateResume(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<void, Error>({
    mutationFn: async () => {
      if (!jobId) throw new Error('No job selected')
      const res = await fetch(`/api/jobs/${jobId}/generate-resume`, { method: 'POST' })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error: string }
          if (body.error) message = body.error
        } catch {
          // non-JSON body
        }
        throw new Error(message)
      }
      const blob = await res.blob()
      const contentDisposition = res.headers.get('content-disposition') ?? ''
      const match = contentDisposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? 'resume.pdf'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
    },
  })
}
```

> `JobDrawer.tsx` needs NO changes — it uses `isPending`, `isResumeError`, `resumeError` from the mutation, all of which still work.

### 5. package.json — move playwright

Move `"playwright": "^1.59.1"` from `devDependencies` (line 47) to `dependencies` (line 13 area). `"@playwright/test": "^1.59.1"` stays in `devDependencies`.

### 6. .env.example — changes

```
# Remove these two lines entirely:
N8N_WEBHOOK_SECRET=   # optional — sent as Authorization: Bearer header if set
N8N_RESUME_WEBHOOK_URL=   # optional — server-side URL for resume generation webhook

# Update ANTHROPIC_API_KEY comment block to add Playwright note:
# One-time setup: bunx playwright install chromium
ANTHROPIC_API_KEY=    # required for Analysis, Cover Letter, and Resume; returns 503 if absent
```

### 7. resume-service.test.ts — full structure

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

// Mock generate-pdf BEFORE importing resume-service to prevent real Playwright launch
let capturedHtml = ''
mock.module('../services/generate-pdf', () => ({
  generatePdf: async (html: string) => {
    capturedHtml = html
    return Buffer.from('%PDF-mock')
  },
}))

const { generateResume } = await import('../services/resume-service')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, phone TEXT, location TEXT,
    linkedin_url TEXT, github_url TEXT, summary TEXT,
    experience TEXT, skills TEXT, education TEXT
  )
`

const MOCK_JOB = {
  id: 1, company: 'Acme Corp', jobTitle: 'Senior Engineer',
  jobDescription: 'Build great things at scale.', location: 'Amsterdam',
  fitScore: null, recommendation: null, roleFit: null, requirementsMet: null,
  requirementsMissed: null, redFlags: null, sourceUrl: null, dateScraped: null,
  source: null, externalJobId: null, analysisStatus: null, salary: null,
  benefits: null, contactName: null, contactEmail: null, contactPhone: null,
  applied: false, status: null, statusOverride: null, coverLetterSentAt: null,
  dateApplied: null, archived: false,
} as import('../../shared/schemas').Job

let originalFetch: typeof globalThis.fetch

beforeAll(() => {
  originalFetch = globalThis.fetch
  prodSqlite.run(CREATE_PROFILE_TABLE)
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM profile')
  capturedHtml = ''
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockAnthropicSuccess(text: string): void {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(
      JSON.stringify({ content: [{ type: 'text', text }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  ) as typeof globalThis.fetch
}

describe('generateResume() — fence stripping', () => {
  test('strips ```html fence before passing to generatePdf', async () => {
    mockAnthropicSuccess('```html\n<html><body>Resume</body></html>\n```')
    await generateResume(MOCK_JOB)
    expect(capturedHtml).toBe('<html><body>Resume</body></html>')
  })

  test('strips ``` fence (no language tag) before passing to generatePdf', async () => {
    mockAnthropicSuccess('```\n<html><body>Resume</body></html>\n```')
    await generateResume(MOCK_JOB)
    expect(capturedHtml).toBe('<html><body>Resume</body></html>')
  })

  test('passes clean HTML unchanged when no fences present', async () => {
    mockAnthropicSuccess('<html><body>Resume</body></html>')
    await generateResume(MOCK_JOB)
    expect(capturedHtml).toBe('<html><body>Resume</body></html>')
  })

  test('returns Buffer from generatePdf', async () => {
    mockAnthropicSuccess('<html><body>Resume</body></html>')
    const result = await generateResume(MOCK_JOB)
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('generateResume() — error handling', () => {
  test('throws when ANTHROPIC_API_KEY is absent', async () => {
    const orig = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    await expect(generateResume(MOCK_JOB)).rejects.toThrow('ANTHROPIC_API_KEY not configured')
    process.env.ANTHROPIC_API_KEY = orig
  })

  test('throws when Anthropic returns HTTP error', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 }))) as typeof globalThis.fetch
    await expect(generateResume(MOCK_JOB)).rejects.toThrow('Anthropic error 500')
  })

  test('throws when Anthropic returns empty text', async () => {
    mockAnthropicSuccess('   ')
    await expect(generateResume(MOCK_JOB)).rejects.toThrow('Anthropic returned empty resume')
  })
})
```

### 8. api-resume.test.ts — full structure

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

// Mock resume-service before any imports — prevents real Anthropic + Playwright calls
let mockGenerateResume: () => Promise<Buffer> = async () => Buffer.from('%PDF-mock')
mock.module('../services/resume-service', () => ({
  generateResume: () => mockGenerateResume(),
}))

const { default: jobsApp } = await import('./api-jobs')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL, job_title TEXT NOT NULL,
    fit_score INTEGER, recommendation TEXT, role_fit TEXT,
    requirements_met TEXT, requirements_missed TEXT, red_flags TEXT,
    job_description TEXT, source_url TEXT, date_scraped TEXT, source TEXT,
    location TEXT, external_job_id TEXT, analysis_status TEXT, salary TEXT,
    benefits TEXT, contact_name TEXT, contact_email TEXT, contact_phone TEXT,
    applied INTEGER NOT NULL DEFAULT 0, status TEXT, status_override TEXT,
    cover_letter_sent_at TEXT, date_applied TEXT, archived INTEGER NOT NULL DEFAULT 0,
    UNIQUE(company, job_title)
  )
`
const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, phone TEXT, location TEXT,
    linkedin_url TEXT, github_url TEXT, summary TEXT,
    experience TEXT, skills TEXT, education TEXT
  )
`
const CREATE_STATUS_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL, status TEXT NOT NULL,
    timestamp TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual'
  )
`
const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL UNIQUE, message_id TEXT UNIQUE,
    received_at TEXT NOT NULL, from_address TEXT NOT NULL, subject TEXT NOT NULL,
    type TEXT, company TEXT, job_title TEXT
  )
`
const CREATE_COVER_LETTERS_TABLE = `
  CREATE TABLE IF NOT EXISTS cover_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
  )
`
const CREATE_WEBHOOK_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS webhook_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, run_at TEXT NOT NULL,
    success INTEGER NOT NULL, item_count INTEGER, error_message TEXT
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
  prodSqlite.run(CREATE_PROFILE_TABLE)
  prodSqlite.run(CREATE_STATUS_EVENTS_TABLE)
  prodSqlite.run(CREATE_MESSAGES_TABLE)
  prodSqlite.run(CREATE_COVER_LETTERS_TABLE)
  prodSqlite.run(CREATE_WEBHOOK_RUNS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM jobs')
  prodSqlite.run('DELETE FROM profile')
  prodSqlite.run('DELETE FROM webhook_runs')
  mockGenerateResume = async () => Buffer.from('%PDF-mock')
})

describe('POST /:id/generate-resume', () => {
  test('returns 200 with application/pdf when generation succeeds', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build things')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    const res = await jobsApp.request(`/${row.id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('.pdf')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.length).toBeGreaterThan(0)
  })

  test('filename includes candidate name when profile exists', async () => {
    prodSqlite.run(`INSERT INTO profile (name) VALUES ('Jane Doe')`)
    prodSqlite.run(`INSERT INTO jobs (company, job_title, job_description) VALUES ('Corp', 'PM', 'Lead product')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    const res = await jobsApp.request(`/${row.id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(200)
    const cd = res.headers.get('content-disposition') ?? ''
    expect(cd).toContain('Jane Doe')
    expect(cd).toContain('Corp')
    expect(cd).toContain('PM')
  })

  test('returns 503 when ANTHROPIC_API_KEY is not configured', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build things')`)
    const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    mockGenerateResume = async () => { throw new Error('ANTHROPIC_API_KEY not configured') }
    const res = await jobsApp.request(`/${row.id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 404 for unknown job id', async () => {
    const res = await jobsApp.request('/999/generate-resume', { method: 'POST' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 400 for non-numeric id', async () => {
    const res = await jobsApp.request('/abc/generate-resume', { method: 'POST' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })

  test('returns 400 when job has no job description', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('Nodesc', 'Engineer')`)
    const row = prodSqlite.query('SELECT id FROM jobs WHERE company = ?').get('Nodesc') as { id: number }
    const res = await jobsApp.request(`/${row.id}/generate-resume`, { method: 'POST' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })
})
```

---

## Architecture Guardrails

### Service layer
- `generate-pdf.ts` lives in `src/server/services/` — it is a service, not a utility
- `resume-service.ts` is the only file that calls `generatePdf` — don't call it directly from the route
- Anthropic call in resume-service uses `system` field — this is intentional; analysis-service explicitly prohibits it but resume/cover-letter services both use it
- `AbortSignal.timeout(120_000)` on Anthropic fetch — Playwright + Claude can take 10–20s

### API invariants
- Error shape: `{ error: string }` — never `{ message: string }` (enforced in all tests)
- Response for success: raw binary (`new Response(buffer, { headers: ... })`) — not JSON
- Route still uses `:id` for job id in path param — no change to URL structure
- `recordRun` silently catches its own errors — no need to wrap in try/catch

### Data ownership
- This story reads `profile` (no writes) and reads `jobs`
- No new DB tables; no schema changes

### Testing invariants (from project-context.md)
- `process.env.DB_PATH = ':memory:'` MUST be first line before any imports
- `mock.module()` MUST be called before dynamic `await import()`
- `beforeEach`: clear all rows; no shared state between tests
- Assert `error` key present AND `message` key absent on all error responses

### package.json
- Only `playwright` moves to dependencies — `@playwright/test` stays in devDependencies
- After moving, run `bun install` to update `bun.lockb`
- Note: `bunx playwright install chromium` must be run once on any new machine

---

## Previous Story Context (13-5)

**Patterns to reuse from 13-5:**
- Same Anthropic fetch pattern: `'Content-Type': 'application/json'`, `'x-api-key': apiKey`, `'anthropic-version': '2023-06-01'`, `signal: AbortSignal.timeout(120_000)`
- Same profile fetch: `db.select().from(profile).limit(1).get() ?? null`
- Same test isolation: `:memory:`, manual DDL, `beforeEach` clear
- Same `mock.module()` pattern for route contract tests

**Key differences from 13-5:**
- Returns `Buffer` (PDF), not `string` (cover letter text)
- Calls `generatePdf` after Claude — cover-letter-service does NOT call any PDF generator
- `max_tokens: 4096` (not 2048)
- Response requires fence stripping (Claude often wraps HTML in ` ```html ` fences)
- Route returns binary response, not JSON — different `new Response()` pattern
- Hook must handle blob download (not fire-and-forget)

**From 13-5 dev agent notes:**
- `N8N_WEBHOOK_SECRET=` and `N8N_RESUME_WEBHOOK_URL=` were retained in `.env.example` specifically for 13-6 — both must now be removed
- `Content-Disposition` filename must use double-quoted format: `filename="..."`

---

## Dev Agent Record

### Implementation Notes

- Followed `cover-letter-service.ts` patterns exactly for Anthropic call (same headers, timeout, system field usage)
- `generate-pdf.ts` is a thin Playwright wrapper — browser opens/closes per call as specified
- `stripCodeFences` handles both ` ```html ` and bare ` ``` ` fences with `startsWith('```')` guard
- `api-jobs.ts` route returns raw binary `new Response(pdfBuffer, { headers })` (not JSON), matching the docx pattern already in the same file
- `useGenerateResume.ts` now does blob download via `URL.createObjectURL` + synthetic anchor click
- `playwright` moved to `dependencies`; `@playwright/test` stays in `devDependencies`
- Both N8N vars removed from `.env.example`; Playwright install comment added

### Completion Notes

- AC1: `resume-service.ts` fully rewritten — `generateResume(job): Promise<Buffer>`, Anthropic call with system field, fence stripping, profile read from DB, `generatePdf` call
- AC2: `generate-pdf.ts` created — Playwright Chromium headless, A4 PDF, buffer returned
- AC3: `playwright` moved to `dependencies` in `package.json`; `bun install` run to update lockfile
- AC4: `POST /:id/generate-resume` route updated — PDF binary response, `Content-Disposition` with candidate name, 503/404/400 error handling
- AC5: `useGenerateResume.ts` updated — blob download with filename from `Content-Disposition` header
- AC6: 7 unit tests in `resume-service.test.ts` + 6 contract tests in `api-resume.test.ts` — all pass; full suite 163/163

### Review Findings

- [x] [Review][Patch] Browser not closed on error — missing try/finally in generatePdf; any Playwright op that throws after launch leaks the browser process [`generate-pdf.ts`]
- [x] [Review][Patch] URL.revokeObjectURL race after a.click() — revocation is synchronous but browser download initiation is async; can produce empty file on some browsers [`useGenerateResume.ts`]
- [x] [Review][Patch] Typo "Comapny" in buildUserMessage — sent to Anthropic on every cover letter request [`cover-letter-service.ts`]
- [x] [Review][Patch] Missing newline separators in cover-letter buildSystemPrompt — profile fields concatenated without `\n`; all fields run on one line unlike resume-service [`cover-letter-service.ts`]
- [x] [Review][Patch] Empty-after-strip not checked — empty check on rawText before stripCodeFences; ```` ```\n\n``` ```` response passes but produces empty HTML sent to Playwright [`resume-service.ts`]
- [x] [Review][Patch] Unescaped filename in Content-Disposition — company/jobTitle/candidateName from DB injected into `filename="..."` without escaping; `"` in any field breaks the header [`api-jobs.ts`]
- [x] [Review][Defer] Profile fetched twice (route + service) [`api-jobs.ts`] — deferred, spec-intended design; SQLite local cost negligible
- [x] [Review][Defer] Prompt injection via job description / profile data — deferred, inherent to LLM architecture with external data; acceptable for personal single-user app
- [x] [Review][Defer] waitUntil: 'networkidle' hangable on slow external resources — deferred, spec-mandated; system-ui template has no external resources
- [x] [Review][Defer] DOCX XSS/XML injection in build-docx.ts — deferred, pre-existing from story 13-5
- [x] [Review][Defer] Anthropic error response body discarded (no logging) — deferred, error status captured in recordRun; nice-to-have for future hardening

---

## File List

- `job-hunt-dashboard/src/server/services/resume-service.ts` (rewritten)
- `job-hunt-dashboard/src/server/services/resume-service.test.ts` (new)
- `job-hunt-dashboard/src/server/services/generate-pdf.ts` (new)
- `job-hunt-dashboard/src/server/routes/api-jobs.ts` (import swap + route updated)
- `job-hunt-dashboard/src/server/routes/api-resume.test.ts` (new)
- `job-hunt-dashboard/src/client/hooks/useGenerateResume.ts` (updated)
- `job-hunt-dashboard/package.json` (playwright moved to dependencies)
- `job-hunt-dashboard/.env.example` (N8N vars removed, Playwright comment added)

---

## Change Log

- Planning stub created: initial scope (Date: unknown)
- Enriched with full implementation code, test structure, architecture context from 13-5 (Date: 2026-04-15)
- Implemented: resume-service rewrite, generate-pdf.ts, api-jobs route update, useGenerateResume blob download, package.json playwright move, .env.example cleanup, 13 new tests (Date: 2026-04-15)
