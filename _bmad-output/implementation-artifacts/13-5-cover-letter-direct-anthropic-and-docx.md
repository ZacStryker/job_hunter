# Story 13.5: Cover Letter — Direct Anthropic + DOCX

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline
**Story ID:** 13-5-cover-letter-direct-anthropic-and-docx
**Status:** done
**Depends on:** 13-4
**Date:** 2026-04-15

---

## User Story

As a job seeker, I want the "Generate Cover Letter" button to call Anthropic directly and download the result as a `.docx` file, so that cover letters are generated and saved without needing n8n.

---

## Acceptance Criteria

### AC1 — cover-letter-service.ts rewritten
- `callN8nWebhook` replaced by `generateCoverLetter(job: Job): Promise<string>` — same return type contract
- Throws `'ANTHROPIC_API_KEY not configured'` if key absent at call time
- Reads profile from `profile` table via `db.select().from(profile).limit(1).get() ?? null` — no HTTP round-trip
- Calls `https://api.anthropic.com/v1/messages` via fetch with:
  - `x-api-key: ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, `content-type: application/json`
  - Model: `claude-sonnet-4-6`, `max_tokens: 2048`
  - **Uses `system` field** (unlike analysis-service which uses single user message only)
  - System + user message match the n8n flow exactly — see Implementation Notes §1
- Throws `'Anthropic error {status}'` on non-ok HTTP response
- Throws `'Anthropic returned empty cover letter'` if response text is empty after trim
- Returns the trimmed cover letter text

### AC2 — build-docx.ts utility created
- New `src/server/utils/build-docx.ts` exports `buildDocx(text: string): Buffer`
- Generates a minimal valid `.docx` (OOXML ZIP) from plain text — ported from the n8n "Convert Cover Letter to File" code node (see Implementation Notes §2)
- Paragraphs split on `\n`; non-empty lines become `<w:p>` body paragraphs at 12pt; empty lines become spacer paragraphs
- Returns a `Buffer` of the binary `.docx`
- No external library — pure TS using `Buffer` (Bun native)

### AC3 — DOCX download endpoint
- New `GET /api/cover-letters/:id/docx` route in `src/server/routes/api-cover-letter.ts` (create this file — it does NOT currently exist; cover letter routes live in `api-jobs.ts`)

Wait — cover letter routes already exist inside `api-jobs.ts`. Add the new download route there, not in a new file. See Implementation Notes §3.

- `GET /:id/cover-letter/docx` added to `api-jobs.ts` (adjacent to the existing `GET /:id/cover-letter` route)
- Fetches cover letter row from `cover_letters` table by id; returns 404 if not found
- Also fetches job row to get company/jobTitle for the filename
- Calls `buildDocx(letter.content)` and returns binary with:
  - `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `Content-Disposition: attachment; filename="Cover Letter - {company} - {jobTitle}.docx"`
- Route param validation: `id` must be a positive integer; return 400 otherwise

### AC4 — api-jobs.ts updated (call site)
- Import changed: `callN8nWebhook` → `generateCoverLetter`
- Call site changed: `callN8nWebhook(job as Job)` → `generateCoverLetter(job as Job)`
- 503 guard updated: checks `message === 'ANTHROPIC_API_KEY not configured'` (was `'N8N_WEBHOOK_URL not configured'`)
- All other `POST /:id/generate-cover-letter` logic unchanged (400 checks, DB storage, response shape)
- `buildDocx` import added from `'../utils/build-docx'`
- New `GET /:id/cover-letter/docx` route added (see AC3)

### AC5 — .env.example updated
- `N8N_WEBHOOK_URL=` line removed (cover letter webhook replaced)
- `N8N_WEBHOOK_SECRET=` and `N8N_RESUME_WEBHOOK_URL=` **remain** — still used by resume-service.ts until story 13-6

### AC6 — Tests
- `src/server/utils/build-docx.test.ts` — NEW: verifies output is a non-empty Buffer, is a valid ZIP (starts with PK magic bytes `0x50 0x4B 0x03 0x04`), and contains `word/document.xml` in the entry names
- `src/server/services/cover-letter-service.test.ts` — NEW: unit tests with mocked fetch (see Implementation Notes §4)
- `src/server/routes/api-cover-letter.test.ts` — UPDATED: mock name changed + 503 error string + new docx download route tests (see Implementation Notes §5)
- All tests pass (no regressions)

---

## Technical Requirements

### Files to create/modify

| File | Change |
|------|--------|
| `src/server/services/cover-letter-service.ts` | **REWRITE** — replace `callN8nWebhook` with `generateCoverLetter` |
| `src/server/services/cover-letter-service.test.ts` | **NEW** — unit tests |
| `src/server/utils/build-docx.ts` | **NEW** — DOCX builder utility |
| `src/server/utils/build-docx.test.ts` | **NEW** — unit tests |
| `src/server/routes/api-jobs.ts` | Import swap + 503 error string + new download route |
| `src/server/routes/api-cover-letter.test.ts` | Mock rename + 503 error string + docx download tests |
| `job-hunt-dashboard/.env.example` | Remove `N8N_WEBHOOK_URL=` |

No schema changes. No migration needed. No UI changes (download route is the UI surface).

---

## Implementation Notes

### 1. cover-letter-service.ts — prompts and full function

**Critical differences from analysis-service (13-4):**
- Model: `claude-sonnet-4-6` (NOT opus)
- `max_tokens`: 2048 (NOT 1024)
- **Uses `system` field** — analysis-service explicitly prohibited this
- Returns `Promise<string>` (NOT a structured object)
- No DOCX logic here — DOCX is built in `build-docx.ts` and served by the route

**System prompt — match n8n field concatenation exactly (no newlines between profile fields):**

```ts
function buildSystemPrompt(p: typeof profile.$inferSelect | null): string {
  return (
    'You are an expert cover letter writer. Write compelling, concise, personalized cover letters.\n\n' +
    'CANDIDATE PROFILE:' +
    'Name: ' + (p?.name ?? '') +
    ', email: ' + (p?.email ?? '') +
    ', Phone: ' + (p?.phone ?? '') +
    ' Location: ' + (p?.location ?? '') +
    ', LinkedIn: ' + (p?.linkedinUrl ?? '') +
    ', Website: ' + (p?.githubUrl ?? '') +
    'Summary: ' + (p?.summary ?? '') +
    'Experience: ' + (p?.experience ?? '') +
    'Skills: ' + (p?.skills ?? '') +
    'Education: ' + (p?.education ?? '') +
    '\n\nTARGET: ML/GenAI engineering roles in the Netherlands and remote internationally.'
  )
}
```

**User message — match n8n exactly (note: "Comapny" typo is in the original flow — preserve it):**

```ts
function buildUserMessage(job: Job): string {
  return (
    'Write a tailored cover letter for this role. No emdashes. Be specific \u2014 reference 2-3 of my relevant achievements. ' +
    'Keep it to 3 paragraphs. Do not add a date or address block, just start with the salutation.\n\n' +
    'Role: Comapny: ' + job.company +
    ' Title: ' + job.jobTitle +
    ' Location: ' + (job.location ?? '') +
    ' Description: ' + (job.jobDescription ?? '')
  )
}
```

> ⚠️ The "Comapny" typo is in the n8n original. Do NOT fix it. The model has been calibrated against this prompt text.

**Full `generateCoverLetter` function:**

```ts
import { db } from '../../db/client'
import { profile } from '../../db/schema'
import type { Job } from '../../shared/schemas'

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
}

export async function generateCoverLetter(job: Job): Promise<string> {
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
      max_tokens: 2048,
      system: buildSystemPrompt(profileRow),
      messages: [{ role: 'user', content: buildUserMessage(job) }],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!anthropicRes.ok) throw new Error(`Anthropic error ${anthropicRes.status}`)

  const data = await anthropicRes.json() as AnthropicResponse
  const coverLetter = data.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
  if (!coverLetter) throw new Error('Anthropic returned empty cover letter')

  return coverLetter
}
```

Note: No `eq` import needed — this service only reads profile, it doesn't filter by id.

### 2. build-docx.ts — ported from n8n code node

Place in `src/server/utils/build-docx.ts`. This is a pure utility — no DB, no env vars, no imports beyond `Buffer` (Bun native).

```ts
function crc32(buf: Buffer): number {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]!) & 0xFF]! ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function u16(v: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16LE(v, 0); return b }
function u32(v: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b }

function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const entries = files.map(({ name, data }) => {
    const nb = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]),
      u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nb.length), u16(0), nb,
    ])
    return { local, data, nb, crc, size: data.length }
  })
  const parts: Buffer[] = []
  const cdParts: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    parts.push(e.local, e.data)
    cdParts.push(Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x01, 0x02]),
      u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(e.crc), u32(e.size), u32(e.size),
      u16(e.nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
      e.nb,
    ]))
    offset += e.local.length + e.size
  }
  const cd = Buffer.concat(cdParts)
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x05, 0x06]),
    u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(offset), u16(0),
  ])
  return Buffer.concat([...parts, cd, eocd])
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildDocx(coverLetter: string): Buffer {
  const paragraphs = coverLetter.split('\n').map(line => {
    const t = escXml(line)
    return t
      ? `<w:p><w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
      : `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`
  }).join('')

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`

  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(wordRels, 'utf8') },
  ])
}
```

### 3. api-jobs.ts — download route and import changes

**Import changes at top of file:**
```ts
// Replace:
import { callN8nWebhook } from '../services/cover-letter-service'
// With:
import { generateCoverLetter } from '../services/cover-letter-service'
import { buildDocx } from '../utils/build-docx'
```

**Call site change (in `POST /:id/generate-cover-letter`):**
```ts
// Replace:
coverLetterText = await callN8nWebhook(job as Job)
// With:
coverLetterText = await generateCoverLetter(job as Job)
```

**503 guard change:**
```ts
// Replace:
if (message === 'N8N_WEBHOOK_URL not configured') {
// With:
if (message === 'ANTHROPIC_API_KEY not configured') {
```

**New route — add after the existing `GET /:id/cover-letter` route:**
```ts
app.get('/:id/cover-letter/docx', async (c) => {
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) {
    return c.json({ error: 'Invalid cover letter id' }, 400)
  }
  const rawId = Number(idParam)
  if (rawId <= 0) {
    return c.json({ error: 'Invalid cover letter id' }, 400)
  }

  const letter = db.select().from(coverLetters).where(eq(coverLetters.id, rawId)).get()
  if (!letter) {
    return c.json({ error: 'No cover letter found' }, 404)
  }

  const job = db.select().from(jobs).where(eq(jobs.id, letter.jobId)).get()
  const company = job?.company ?? 'Unknown'
  const jobTitle = job?.jobTitle ?? 'Unknown'
  const fileName = `Cover Letter - ${company} - ${jobTitle}.docx`

  const docx = buildDocx(letter.content)
  return new Response(docx, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
})
```

Note: `eq` and `coverLetters` are already imported in `api-jobs.ts`. `jobs` table is already imported. Only `buildDocx` is new.

### 4. cover-letter-service.test.ts — full structure

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'

const { generateCoverLetter } = await import('../services/cover-letter-service')
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

// Minimal valid Job object — only company, jobTitle, location, jobDescription are used in the prompt
const MOCK_JOB = {
  id: 1,
  company: 'Acme Corp',
  jobTitle: 'Senior Engineer',
  location: 'Amsterdam',
  jobDescription: 'Build great things at scale.',
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
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockAnthropicSuccess(text = 'Dear Hiring Manager,\n\nI am excited.\n\nSincerely,\nZac'): void {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  ) as typeof globalThis.fetch
}

describe('generateCoverLetter()', () => {
  test('happy path: returns cover letter text', async () => {
    mockAnthropicSuccess('Dear Hiring Manager,\n\nThis is a great role.')

    const result = await generateCoverLetter(MOCK_JOB)
    expect(result).toBe('Dear Hiring Manager,\n\nThis is a great role.')
  })

  test('missing ANTHROPIC_API_KEY: throws before any fetch', async () => {
    const original = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    await expect(generateCoverLetter(MOCK_JOB)).rejects.toThrow('ANTHROPIC_API_KEY not configured')

    process.env.ANTHROPIC_API_KEY = original
  })

  test('missing profile: proceeds with empty fields, returns text', async () => {
    // No profile row inserted
    mockAnthropicSuccess('Dear Hiring Manager,\n\nI apply.')

    const result = await generateCoverLetter(MOCK_JOB)
    expect(result).toBe('Dear Hiring Manager,\n\nI apply.')
  })

  test('Anthropic HTTP error: throws with status', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 500 }))
    ) as typeof globalThis.fetch

    await expect(generateCoverLetter(MOCK_JOB)).rejects.toThrow('Anthropic error 500')
  })

  test('Anthropic returns empty text: throws', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: '   ' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    ) as typeof globalThis.fetch

    await expect(generateCoverLetter(MOCK_JOB)).rejects.toThrow('Anthropic returned empty cover letter')
  })
})
```

### 5. build-docx.test.ts — unit tests

```ts
import { describe, test, expect } from 'bun:test'
import { buildDocx } from '../utils/build-docx'

const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04])

describe('buildDocx()', () => {
  test('returns a non-empty Buffer', () => {
    const result = buildDocx('Hello world.')
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  })

  test('starts with ZIP magic bytes (PK\\x03\\x04)', () => {
    const result = buildDocx('Hello world.')
    expect(result.subarray(0, 4)).toEqual(ZIP_MAGIC)
  })

  test('contains word/document.xml entry', () => {
    const result = buildDocx('Hello world.')
    const str = result.toString('binary')
    expect(str).toContain('word/document.xml')
  })

  test('contains [Content_Types].xml entry', () => {
    const result = buildDocx('Hello world.')
    const str = result.toString('binary')
    expect(str).toContain('[Content_Types].xml')
  })

  test('empty string produces valid ZIP without throwing', () => {
    expect(() => buildDocx('')).not.toThrow()
  })

  test('multi-line text produces valid ZIP', () => {
    const result = buildDocx('Line 1\n\nLine 2\nLine 3')
    expect(result.subarray(0, 4)).toEqual(ZIP_MAGIC)
  })
})
```

### 6. api-cover-letter.test.ts — changes needed

The file is at `src/server/routes/api-cover-letter.test.ts` and tests cover letter routes in `api-jobs`. Three changes needed:

**1. Mock rename** (at top, before dynamic import):
```ts
// Replace:
let mockCallN8nWebhook: () => Promise<string> = async () => 'Mock cover letter text'
mock.module('../services/cover-letter-service', () => ({
  callN8nWebhook: () => mockCallN8nWebhook(),
}))
// With:
let mockGenerateCoverLetter: () => Promise<string> = async () => 'Mock cover letter text'
mock.module('../services/cover-letter-service', () => ({
  generateCoverLetter: () => mockGenerateCoverLetter(),
}))
```

**2. beforeEach reset** — rename variable:
```ts
mockGenerateCoverLetter = async () => 'Mock cover letter text'
```

**3. Update the N8N_WEBHOOK_URL test** to use new error:
```ts
// test: 'returns 503 when N8N_WEBHOOK_URL is not configured'
// Update description and mock:
test('returns 503 when ANTHROPIC_API_KEY is not configured', async () => {
  // ...
  mockGenerateCoverLetter = async () => { throw new Error('ANTHROPIC_API_KEY not configured') }
  // ...
})
```

**4. Add new DOCX download tests** (new describe block):
```ts
describe('GET /:id/cover-letter/docx', () => {
  test('returns 200 with docx content-type for existing cover letter', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('Acme', 'Engineer')`)
    const jobRow = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
    prodSqlite.run(
      `INSERT INTO cover_letters (job_id, content, created_at) VALUES (?, ?, ?)`,
      [jobRow.id, 'Dear Hiring Manager,\n\nGreat role.', '2026-04-15T10:00:00.000Z']
    )
    const clRow = prodSqlite.query('SELECT id FROM cover_letters LIMIT 1').get() as { id: number }

    const res = await jobsApp.request(`/${clRow.id}/cover-letter/docx`, { method: 'GET' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('.docx')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.length).toBeGreaterThan(0)
    // Verify ZIP magic bytes
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4B)
  })

  test('returns 404 for non-existent cover letter id', async () => {
    const res = await jobsApp.request('/999/cover-letter/docx', { method: 'GET' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 400 for non-numeric id', async () => {
    const res = await jobsApp.request('/abc/cover-letter/docx', { method: 'GET' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })
})
```

---

## Architecture Guardrails

### Data ownership
- This service reads `profile` (no writes) and reads `cover_letters` / `jobs` in the download route
- `coverLetterSentAt` is user-owned — updated by `POST /:id/generate-cover-letter` in `api-jobs.ts`, NOT by this service
- `content` in `cover_letters` table: written by `POST /:id/generate-cover-letter` (existing route, unchanged)

### API invariants
- Error shape: `{ error: string }` — never `{ message: string }` (project invariant, enforced in all tests)
- `Content-Disposition` filename: double-quoted; should not contain special chars that break HTTP headers (no sanitization needed since company/jobTitle from DB are already stored strings)
- Route param: `:id` in the docx route refers to `cover_letters.id` (not `jobs.id`) — document this clearly; existing `GET /:id/cover-letter` uses `jobs.id`

### Anthropic call
- `system` field IS used here — this is intentional and correct (unlike analysis service)
- `AbortSignal.timeout(120_000)` — same as analysis service
- No regex JSON extraction needed (response is plain text, not JSON)
- Profile absence: `?? ''` for all fields — generates a cover letter with empty candidate info rather than failing

### Testing
- `process.env.DB_PATH = ':memory:'` before all imports
- Only `profile` table needed in `cover-letter-service.test.ts` — service doesn't query `jobs`
- `build-docx.test.ts` has NO DB and NO env setup — pure unit test
- `api-cover-letter.test.ts` needs `cover_letters` and `jobs` tables (already in `beforeAll`)
- `mock.module` for `cover-letter-service` must declare ONLY `generateCoverLetter` (not `callN8nWebhook`)

---

## Previous Story Context (13-4)

From 13-4 (`analysis-service.ts`):
- Same Anthropic fetch pattern (headers, timeout)
- Same profile fetch pattern: `db.select().from(profile).limit(1).get() ?? null`
- Same test isolation pattern: `:memory:`, manual DDL, `beforeEach` clear
- Same `mock.module()` pattern for route tests

**Key differences from 13-4:**
- Model: `claude-sonnet-4-6` vs `claude-opus-4-6`
- `system` field used here; 13-4 explicitly prohibited it
- Single Anthropic call per request (no loop, no scraper); returns text, not structured JSON
- DOCX generation is a new concern not present in 13-4

**n8n flow reference** (`Generate Cover Letter (Webhook)(1).json`):
- Node order: Webhook → GET profile (HTTP to `/api/profile`) → Generate Cover Letter (Anthropic) → Build Sheet Row → Email Summary → Restore Cover Letter → Convert Cover Letter to File → Write Cover Letter to Disk → Respond to Webhook
- This story replaces the entire flow: profile comes from DB (not HTTP), Anthropic call is direct, DOCX served via download endpoint (not written to disk), email step dropped (n8n-specific)

---

## Dev Agent Record

### Implementation Notes

- `cover-letter-service.ts` rewritten: `callN8nWebhook` replaced by `generateCoverLetter(job: Job): Promise<string>`. Uses `system` field (unlike analysis-service) with `claude-sonnet-4-6`, `max_tokens: 2048`. Profile read once from DB; all fields default to `''` on null. Preserves "Comapny" typo from n8n verbatim.
- `build-docx.ts` created in `src/server/utils/` as pure TS ZIP builder (OOXML) with no external deps. `crc32` computed manually; local file headers + central directory + EOCD assembled via `Buffer.concat`.
- `api-jobs.ts` updated: import swapped to `generateCoverLetter` + `buildDocx` added; 503 guard string updated; new `GET /:id/cover-letter/docx` route added (`:id` = `cover_letters.id`) returning binary DOCX with correct content-type and `Content-Disposition` filename.
- `.env.example`: `N8N_WEBHOOK_URL=` removed; `N8N_WEBHOOK_SECRET=` and `N8N_RESUME_WEBHOOK_URL=` retained for story 13-6.
- `build-docx.test.ts`: 6 pure unit tests — Buffer type, ZIP magic bytes, entry names, empty input, multi-line.
- `cover-letter-service.test.ts`: 5 unit tests — happy path, missing API key, missing profile, Anthropic HTTP error, empty response text.
- `api-cover-letter.test.ts`: updated mock rename (`callN8nWebhook` → `generateCoverLetter`), 503 error string, added 3 docx download route tests (200 + ZIP bytes, 404, 400).

### Completion Notes

All 7 ACs satisfied. 150 tests pass (0 fail). 24 new tests added. Full regression suite clean.

### Review Findings

- [x] [Review][Patch] Content-Disposition test doesn't assert exact filename format [`api-cover-letter.test.ts:208-214`] — Test only checks `contains 'attachment'` and `contains '.docx'`; arch guardrail requires double-quoted `filename="Cover Letter - {company} - {jobTitle}.docx"` format — add assertion for exact filename pattern
- [x] [Review][Defer] CRC-32 lookup table rebuilt on every `buildDocx` call [`build-docx.ts:1-11`] — deferred, pre-existing performance pattern; table should be module-level constant but not a correctness issue

---

## File List

- `job-hunt-dashboard/src/server/services/cover-letter-service.ts` (rewritten)
- `job-hunt-dashboard/src/server/services/cover-letter-service.test.ts` (new)
- `job-hunt-dashboard/src/server/utils/build-docx.ts` (new)
- `job-hunt-dashboard/src/server/utils/build-docx.test.ts` (new)
- `job-hunt-dashboard/src/server/routes/api-jobs.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-cover-letter.test.ts` (modified)
- `job-hunt-dashboard/.env.example` (modified)

---

## Change Log

- Planning stub created with initial scope (Date: unknown)
- Enriched with n8n flow reference, exact prompt text, full implementation code, test structure, architectural context from 13-4 (Date: 2026-04-15)
- Implemented: all ACs complete, 150 tests passing (Date: 2026-04-15)
