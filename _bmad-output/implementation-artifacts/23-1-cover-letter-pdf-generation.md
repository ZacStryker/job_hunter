# Story 23.1: Cover Letter PDF Generation

**Epic:** 23 — Cover Letter PDF Output
**Story ID:** 23-1-cover-letter-pdf-generation
**Status:** done
**Depends on:** 13.5 (cover letter service), 13.6 (Playwright PDF generation), 13.7 (resume PDF persistence pattern)
**Date:** 2026-04-21

---

## User Story

As a job seeker, I want the Generate Cover Letter workflow to produce a downloadable PDF with a clean cover letter layout and show it inline in the drawer — instead of showing raw text — so that the output is ready to attach to job applications without additional formatting.

---

## Acceptance Criteria

### AC1 — `cover-letter-service.ts` updated to return PDF buffer

- Return type changes from `{ content: string; inputTokens: number; outputTokens: number }` to `{ content: string; pdf: Buffer; inputTokens: number; outputTokens: number }` — the key `pdf` matches the `resume-service` convention
- New module-internal function `buildCoverLetterHtml(content: string, p: ProfileRow | null): string` added (unexported)
- HTML template: candidate name + contact line (email · phone · location) + `<hr>` divider + date + letter body (see Implementation Notes §1 for exact template and `escHtml` helper)
- HTML uses `system-ui, sans-serif` — **no Google Fonts** (Playwright headless has no network access)
- The plain text `content` is XML-escaped before embedding in the HTML body via `escHtml`
- After getting `content` from Anthropic, `generateCoverLetter` calls `generatePdf(buildCoverLetterHtml(content, profileRow))` and includes the resulting `Buffer` as `pdf` in the return value
- Add import: `import { generatePdf } from './generate-pdf'`

### AC2 — PDF saved to disk on generation

- `POST /:id/generate-cover-letter` saves PDF to `data/cover-letters/{jobId}.pdf` atomically (write to `.tmp` then `renameSync`) — same pattern as `POST /:id/generate-resume`
- `mkdirSync(join(process.cwd(), 'data', 'cover-letters'), { recursive: true })` called before write
- Failure to write is **non-fatal**: `console.error` the error; route still returns `c.json({ coverLetter: inserted })`
- `coverLetterSentAt` timestamp set in DB — unchanged; existing transaction already sets it; **no new DB column or migration needed**
- Response shape unchanged: `c.json({ coverLetter: inserted })`

### AC3 — New `GET /:id/cover-letter/pdf` endpoint

- Route `app.get('/:id/cover-letter/pdf', ...)` added to `api-jobs.ts`
- `:id` is the **job id** (consistent with all other routes in this file — note the old DOCX route was also by job id after its review fix)
- Same id validation pattern as all other routes (regex `^\d+$` + positive integer check)
- Reads `data/cover-letters/{rawId}.pdf` using `await Bun.file(path).arrayBuffer()` wrapped in try/catch — same pattern as `GET /:id/resume`
- Returns 404 `{ error: 'Cover letter PDF not found' }` if file read fails (catch block)
- Returns 404 `{ error: 'Job not found' }` if job does not exist in DB
- Returns PDF with:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="{candidateName} - Cover Letter - {company} - {jobTitle}.pdf"` where `candidateName` comes from `profile.name` (fallback: `'Cover Letter'`)
  - Filename sanitization: `.replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'")` — same as resume route

### AC4 — DOCX route and `build-docx` utility removed

- `GET /:id/cover-letter/docx` route deleted from `api-jobs.ts`
- `import { buildDocx } from '../utils/build-docx'` removed from `api-jobs.ts`
- `src/server/utils/build-docx.ts` **deleted**
- `src/server/utils/build-docx.test.ts` **deleted**

### AC5 — `JobDrawer` shows PDF preview when cover letter exists

- When `job.coverLetterSentAt` is set (non-null), render the cover letter section as:
  ```tsx
  <Separator />
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Cover Letter</p>
      <div className="flex items-center gap-2">
        <p className="text-xs text-zinc-600">{new Date(job.coverLetterSentAt).toLocaleDateString()}</p>
        <a
          href={`/api/jobs/${job.id}/cover-letter/pdf`}
          download
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <Download size={11} /> Download
        </a>
      </div>
    </div>
    <iframe
      src={`/api/jobs/${job.id}/cover-letter/pdf`}
      className="w-full h-96 border border-zinc-800 rounded"
      title="Cover letter preview"
    />
  </div>
  ```
- Date uses `new Date(job.coverLetterSentAt).toLocaleDateString()` (was `coverLetter.createdAt` — now just use the job field directly)
- Download button style matches the resume section download link exactly: `inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors`
- `Download` imported from `lucide-react` (already present in the file for the resume section)
- The existing `<pre>{coverLetter.content}</pre>` display and `Copy` button are **removed**
- The empty-state check changes from `!coverLetter && !job?.resumeGeneratedAt` to `!job?.coverLetterSentAt && !job?.resumeGeneratedAt`
- Cover letter section should sit **before** the resume section (same relative position as the old raw-text section)

### AC6 — `useCoverLetterQuery` hook removed

- `src/client/hooks/useCoverLetterQuery.ts` **deleted**
- In `JobDrawer.tsx`:
  - Remove `import { useCoverLetterQuery } from '../../hooks/useCoverLetterQuery'`
  - Remove `const { data: coverLetter } = useCoverLetterQuery(job?.id ?? 0, !!job?.coverLetterSentAt)`
- In `useGenerateCoverLetter.ts`:
  - Remove `queryClient.invalidateQueries({ queryKey: ['coverLetter', jobId] })` from `onSuccess`
  - The `['jobs']` invalidation in `onSuccess` remains — this is what makes `job.coverLetterSentAt` update after generation, which triggers the iframe to appear
- Any TypeScript `noUnusedLocals` error on the `Copy` import in `JobDrawer.tsx` must be resolved — remove the `Copy` import from `lucide-react` if it is no longer used elsewhere in the file

### AC7 — `GET /:id/cover-letter` JSON endpoint retained

- The existing `GET /:id/cover-letter` endpoint remains unchanged in `api-jobs.ts`
- It is a valid server API endpoint; do not remove it

### AC8 — Tests

**`src/server/utils/build-docx.test.ts`** — **DELETE** (removed with AC4)

**`src/server/services/cover-letter-service.test.ts`** — UPDATED:
- Add at top (before dynamic import): `mock.module('../services/generate-pdf', ...)` — prevents real Playwright launch; same pattern as `resume-service.test.ts`
- Add `capturedHtml` variable (set by mock) to verify HTML is passed to `generatePdf`
- Update mock return type: `mockGenerateCoverLetter` return type includes `pdf: Buffer`
- Update `beforeEach` mock reset to include `pdf: Buffer.from('%PDF-mock')`
- Add test: `generateCoverLetter` passes HTML string (containing the cover letter content) to `generatePdf`
- Add test: returned object has `pdf` field that is a `Buffer`
- Existing error tests (missing API key, Anthropic HTTP error, empty response) continue to pass unchanged

**`src/server/routes/api-cover-letter.test.ts`** — UPDATED:
- Add at top before dynamic import:
  - `mock.module('../services/generate-pdf', () => ({ generatePdf: async () => Buffer.from('%PDF-mock') }))`
  - `mock.module('node:fs', () => ({ mkdirSync: () => {}, renameSync: () => {} }))` — prevents real file system writes from route handler
  - `spyOn(Bun, 'write').mockResolvedValue(0)` — mocks Bun.write (same as `api-resume.test.ts`)
- Update `mockGenerateCoverLetter` type and reset value: `pdf: Buffer.from('%PDF-mock')` added
- **Delete** the `describe('GET /:id/cover-letter/docx', ...)` block entirely
- **Add** new `describe('GET /:id/cover-letter/pdf', ...)` block:
  - `returns 400 for non-numeric id`
  - `returns 404 when job does not exist`
  - `returns 404 when cover letter PDF file does not exist on disk` (job exists in DB; no file written)
  - `returns 200 with application/pdf and inline content-disposition when file exists` — uses `node:fs/promises` (`mkdir` + `writeFile`) to create a real file at `data/cover-letters/{id}.pdf`, runs the test, then `unlink` in finally block — exact same pattern as `api-resume.test.ts` `GET /:id/resume` 200 test
- All existing `POST /:id/generate-cover-letter` and `GET /:id/cover-letter` tests remain unchanged

---

## Technical Requirements

### Files to modify

| File | Change |
|------|--------|
| `src/server/services/cover-letter-service.ts` | Add `escHtml`, `buildCoverLetterHtml`; add `generatePdf` import; update return type and return statement |
| `src/server/services/cover-letter-service.test.ts` | Mock `generate-pdf`; update return type; add HTML + Buffer tests |
| `src/server/routes/api-jobs.ts` | Update type annotation + destructuring for `coverLetterResult`; add PDF persistence block; replace DOCX route with PDF route; remove `buildDocx` import |
| `src/server/routes/api-cover-letter.test.ts` | Mock `generate-pdf`, `node:fs`, `Bun.write`; update mock type; delete DOCX tests; add PDF route tests |
| `src/client/components/detail/JobDrawer.tsx` | Replace raw-text/Copy section with iframe/Download section; remove `useCoverLetterQuery` import + usage; fix `Copy` import if unused |
| `src/client/hooks/useGenerateCoverLetter.ts` | Remove `['coverLetter', jobId]` invalidation from `onSuccess` |

### Files to delete

| File | Reason |
|------|--------|
| `src/server/utils/build-docx.ts` | DOCX output removed |
| `src/server/utils/build-docx.test.ts` | DOCX output removed |
| `src/client/hooks/useCoverLetterQuery.ts` | UI no longer fetches cover letter JSON; uses `job.coverLetterSentAt` + PDF endpoint directly |

No schema changes. No new migration needed.

---

## Implementation Notes

### 1. `buildCoverLetterHtml` — exact template

```ts
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildCoverLetterHtml(content: string, p: typeof profile.$inferSelect | null): string {
  const name = p?.name ?? ''
  const contacts = [p?.email, p?.phone, p?.location].filter(Boolean).join(' · ')
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; font-size: 11pt; color: #1a1a1a; padding: 48px 56px; line-height: 1.6; max-width: 760px; }
  .name { font-size: 15pt; font-weight: 700; letter-spacing: 0.3px; }
  .contact { font-size: 9.5pt; color: #555; margin-top: 3px; }
  hr { border: none; border-top: 1.5px solid #1a1a1a; margin: 14px 0 20px; }
  .date { font-size: 10pt; color: #444; margin-bottom: 24px; }
  .body { font-size: 11pt; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="name">${escHtml(name)}</div>
  <div class="contact">${escHtml(contacts)}</div>
  <hr />
  <div class="date">${date}</div>
  <div class="body">${escHtml(content)}</div>
</body>
</html>`
}
```

### 2. `cover-letter-service.ts` — minimal diff

**Add import** (after existing `profile` import):
```ts
import { generatePdf } from './generate-pdf'
```

**Update function signature** (line 11):
```ts
export async function generateCoverLetter(job: Job): Promise<{ content: string; pdf: Buffer; inputTokens: number; outputTokens: number }>
```

**Replace the final return statement**:
```ts
// Before:
return { content: coverLetter, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 }

// After:
const pdf = await generatePdf(buildCoverLetterHtml(coverLetter, profileRow))
return { content: coverLetter, pdf, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 }
```

### 3. `api-jobs.ts` — four surgical changes

**Change 1** — Remove `buildDocx` import (line 9):
```ts
// Delete this line:
import { buildDocx } from '../utils/build-docx'
```

**Change 2** — Update type annotation (line 318):
```ts
let coverLetterResult: { content: string; pdf: Buffer; inputTokens: number; outputTokens: number }
```

**Change 3** — Update destructuring (line 330):
```ts
const { content: coverLetterText, pdf: coverLetterPdf, inputTokens: clInputTokens, outputTokens: clOutputTokens } = coverLetterResult
```

**Change 4** — Add PDF persistence block after the existing `catch` block (after line 344, before the `db.select` that fetches `inserted`):
```ts
// Persist cover letter PDF (atomic: write to temp then rename)
try {
  const clDir = join(process.cwd(), 'data', 'cover-letters')
  mkdirSync(clDir, { recursive: true })
  const finalPath = join(clDir, `${rawId}.pdf`)
  const tmpPath = join(clDir, `${rawId}.pdf.tmp`)
  await Bun.write(tmpPath, coverLetterPdf)
  renameSync(tmpPath, finalPath)
} catch (err) {
  console.error('Failed to persist cover letter PDF:', err)
}
```

**Change 5** — Replace `GET /:id/cover-letter/docx` route (lines 476–507) with:
```ts
app.get('/:id/cover-letter/pdf', async (c) => {
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

  const pdfPath = join(process.cwd(), 'data', 'cover-letters', `${rawId}.pdf`)
  let pdfBuffer: ArrayBuffer
  try {
    pdfBuffer = await Bun.file(pdfPath).arrayBuffer()
  } catch {
    return c.json({ error: 'Cover letter PDF not found' }, 404)
  }

  const profileRow = db.select().from(profile).limit(1).get()
  const candidateName = profileRow?.name ?? 'Cover Letter'
  const fileName = `${candidateName} - Cover Letter - ${job.company} - ${job.jobTitle}.pdf`
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'")

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  })
})
```

### 4. `api-cover-letter.test.ts` — mock setup at top

Add these three mock calls **before** `await import('./api-jobs')`:

```ts
import { describe, test, expect, mock, spyOn, beforeAll, beforeEach } from 'bun:test'
// ...

mock.module('../services/cover-letter-service', () => ({
  generateCoverLetter: () => mockGenerateCoverLetter(),
}))

// Prevent real Playwright PDF launch from cover-letter-service
mock.module('../services/generate-pdf', () => ({
  generatePdf: async () => Buffer.from('%PDF-mock'),
}))

// Prevent real file system writes from route handler
mock.module('node:fs', () => ({
  mkdirSync: () => {},
  renameSync: () => {},
}))

spyOn(Bun, 'write').mockResolvedValue(0)
```

Note: `spyOn` must be imported from `bun:test`.

**Update mock type and reset value:**
```ts
let mockGenerateCoverLetter: () => Promise<{ content: string; pdf: Buffer; inputTokens: number; outputTokens: number }> =
  async () => ({ content: 'Mock cover letter text', pdf: Buffer.from('%PDF-mock'), inputTokens: 100, outputTokens: 200 })

// in beforeEach:
mockGenerateCoverLetter = async () => ({ content: 'Mock cover letter text', pdf: Buffer.from('%PDF-mock'), inputTokens: 100, outputTokens: 200 })
```

**New `GET /:id/cover-letter/pdf` describe block** — add after `GET /:id/cover-letter` block:

```ts
describe('GET /:id/cover-letter/pdf', () => {
  test('returns 400 for non-numeric id', async () => {
    const res = await jobsApp.request('/abc/cover-letter/pdf', { method: 'GET' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })

  test('returns 404 when job does not exist', async () => {
    const res = await jobsApp.request('/999/cover-letter/pdf', { method: 'GET' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 404 when cover letter PDF file does not exist on disk', async () => {
    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('FileMiss Co', 'Engineer')`)
    const row = prodSqlite.query("SELECT id FROM jobs WHERE company = 'FileMiss Co' LIMIT 1").get() as { id: number }
    const res = await jobsApp.request(`/${row.id}/cover-letter/pdf`, { method: 'GET' })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Cover letter PDF not found')
    expect(body).not.toHaveProperty('message')
  })

  test('returns 200 with application/pdf and inline content-disposition when file exists', async () => {
    // Use node:fs/promises — bypasses the mocked node:fs module (same pattern as api-resume.test.ts)
    const { join } = await import('node:path')
    const { mkdir, writeFile, unlink } = await import('node:fs/promises')
    const clDir = join(process.cwd(), 'data', 'cover-letters')
    await mkdir(clDir, { recursive: true })

    prodSqlite.run(`INSERT INTO jobs (company, job_title) VALUES ('Inline CL Co', 'Viewer')`)
    const row = prodSqlite.query("SELECT id FROM jobs WHERE company = 'Inline CL Co' LIMIT 1").get() as { id: number }
    const filePath = join(clDir, `${row.id}.pdf`)
    await writeFile(filePath, Buffer.from('%PDF-1.4 cover-letter-test'))

    try {
      const res = await jobsApp.request(`/${row.id}/cover-letter/pdf`, { method: 'GET' })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/pdf')
      const cd = res.headers.get('content-disposition') ?? ''
      expect(cd).toContain('inline')
      expect(cd).toContain('.pdf')
      expect(cd).toContain('Cover Letter')
    } finally {
      await unlink(filePath).catch(() => {})
    }
  })
})
```

### 5. `cover-letter-service.test.ts` — additions

Add at top (before dynamic import of `cover-letter-service`):
```ts
let capturedHtml = ''
mock.module('../services/generate-pdf', () => ({
  generatePdf: async (html: string) => {
    capturedHtml = html
    return Buffer.from('%PDF-mock')
  },
}))
```

Add in `beforeEach`:
```ts
capturedHtml = ''
```

Add new tests in `describe('generateCoverLetter()', ...)`:
```ts
test('passes HTML to generatePdf containing the cover letter content', async () => {
  mockAnthropicSuccess('Dear Hiring Manager,\n\nI am excited about this role.')
  await generateCoverLetter(MOCK_JOB)
  expect(capturedHtml).toContain('Dear Hiring Manager')
  expect(capturedHtml).toContain('<!DOCTYPE html')
})

test('returns pdf Buffer from generatePdf', async () => {
  mockAnthropicSuccess('Dear Hiring Manager,\n\nGreat role.')
  const result = await generateCoverLetter(MOCK_JOB)
  expect(result.pdf).toBeInstanceOf(Buffer)
  expect(result.pdf.length).toBeGreaterThan(0)
})
```

---

## Key Patterns from Previous Stories

- **Playwright PDF generation**: `generatePdf(html)` is in `src/server/services/generate-pdf.ts` — import from there; do not re-implement
- **Atomic file write**: write to `.tmp` then `renameSync` to final path — prevents partial reads (13.7 review fix)
- **Non-fatal file persistence**: wrap `Bun.write` + `renameSync` in try/catch; `console.error` on failure; response still returns to user
- **Bun.file for reads**: `await Bun.file(path).arrayBuffer()` in try/catch catches ENOENT — no `existsSync` needed (13.7 review fix)
- **`inline` vs `attachment` Content-Disposition**: `inline` allows Firefox's built-in PDF viewer to render in-page; `attachment` forces download — use `inline` for the serve endpoint (same as `GET /:id/resume`)
- **`<a download>` + `<iframe>` same URL**: both point to the same endpoint; the anchor's `download` attribute forces the file download despite the server sending `inline` — this is correct and intentional (same pattern as resume section in 13.7)
- **`system-ui, sans-serif` not Google Fonts**: Playwright headless cannot load external fonts; must use system fonts only
- **`data/cover-letters/` directory**: `data/` is already gitignored; `cover-letters/` subdirectory is created at runtime by `mkdirSync(..., { recursive: true })`
- **`coverLetterSentAt` reuse**: this field already tracks when a cover letter was generated; no new `coverLetterGeneratedAt` column needed
- **id validation pattern** (exact copy from any existing route):
  ```ts
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) return c.json({ error: 'Invalid job id' }, 400)
  const rawId = Number(idParam)
  if (rawId <= 0) return c.json({ error: 'Invalid job id' }, 400)
  ```
- **Error response shape**: `{ error: string }` + HTTP status only — never `{ message: string }`
- **ISO 8601 dates**: `new Date().toISOString()` with Z suffix — `coverLetterSentAt` already uses this

---

## Anti-Patterns to Avoid

- **Do NOT** use Google Fonts or any external font URL in the HTML template — Playwright headless has no network access to fonts
- **Do NOT** rename or use `coverLetterGeneratedAt` — reuse existing `coverLetterSentAt`
- **Do NOT** add a migration — no schema change is needed
- **Do NOT** remove `GET /:id/cover-letter` (the JSON endpoint) — keep it for API completeness
- **Do NOT** use `existsSync` + `readFileSync` for the PDF serve route — use `Bun.file(...).arrayBuffer()` in try/catch (avoids TOCTOU race; correct async pattern)
- **Do NOT** use `fs.writeFileSync` or `fs.writeFile` for persistence — use `Bun.write` (idiomatic Bun)
- **Do NOT** add a `coverLetterGeneratedAt` field to `jobSchema` or `ingestPayloadSchema` — `coverLetterSentAt` already exists and serves this purpose
- **Do NOT** add `coverLetterSentAt` to any `onConflictDoUpdate.set` block — it is user-owned
- **Do NOT** forget to mock `node:fs` AND `Bun.write` in `api-cover-letter.test.ts` — both are called by the route handler; missing either causes test-environment file writes

---

## Architecture Guardrails

### Service layer
- `generate-pdf.ts` is in `src/server/services/` — it is a service, not a utility; always import from there
- `cover-letter-service.ts` is the only place that calls `generatePdf` for cover letters — not the route

### API invariants
- Error shape: `{ error: string }` — never `{ message: string }`
- Success response for `POST /:id/generate-cover-letter`: JSON `{ coverLetter: ... }` — unchanged
- Success response for `GET /:id/cover-letter/pdf`: raw binary `new Response(pdfBuffer, { headers })` — not JSON

### Data ownership
- `coverLetterSentAt` is user-owned — already set in the existing transaction; never add to ingest upsert
- `cover_letters.content` is written by `POST /:id/generate-cover-letter` — unchanged

### Testing invariants (from project-context.md)
- `process.env.DB_PATH = ':memory:'` MUST be first line before any imports
- `mock.module()` MUST be called before dynamic `await import()`
- `spyOn` imported from `bun:test`
- Assert `error` key present AND `message` key absent on all error responses

---

## Dev Agent Record

### Completion Notes (2026-04-21)

Implemented all 8 ACs in a single session:

- **cover-letter-service.ts**: Added `escHtml` helper, `buildCoverLetterHtml` template function (system-ui fonts, candidate header + HR + date + body), `generatePdf` import; updated return type to include `pdf: Buffer`; calls `generatePdf(buildCoverLetterHtml(...))` before returning.
- **api-jobs.ts**: Removed `buildDocx` import; updated `coverLetterResult` type and destructuring to include `pdf`; added atomic PDF persistence block (`mkdirSync` + `Bun.write` to `.tmp` + `renameSync`) with non-fatal error handling; replaced `GET /:id/cover-letter/docx` with `GET /:id/cover-letter/pdf` (validates id, 404 on missing job, reads via `Bun.file().arrayBuffer()` in try/catch, returns `inline` content-disposition).
- **JobDrawer.tsx**: Removed `useCoverLetterQuery` import/usage, removed `Copy` import; replaced raw-text `<pre>` + Copy button with `<iframe>` + Download `<a>` both pointing to `/api/jobs/:id/cover-letter/pdf`; empty-state check now uses `!job?.coverLetterSentAt`.
- **useGenerateCoverLetter.ts**: Removed `['coverLetter', jobId]` query invalidation from `onSuccess`.
- **Deleted**: `build-docx.ts`, `build-docx.test.ts`, `useCoverLetterQuery.ts`.
- **Tests**: Added `generate-pdf` mock + `capturedHtml` capture to `cover-letter-service.test.ts`; added 2 new tests (HTML passed to generatePdf, pdf Buffer returned). Updated `api-cover-letter.test.ts` with 3 new mocks (generate-pdf, node:fs, Bun.write), updated mock type, replaced DOCX describe block with PDF describe block (4 tests: 400/404/404-no-file/200-inline).
- Added `profile` table to `beforeAll` in `api-cover-letter.test.ts` (required by new PDF route which queries profile for candidate name).

All 21 tests in affected files pass; 8 pre-existing failures in other files unchanged.

---

## File List (after implementation)

**Modified:**
- `job-hunt-dashboard/src/server/services/cover-letter-service.ts`
- `job-hunt-dashboard/src/server/services/cover-letter-service.test.ts`
- `job-hunt-dashboard/src/server/routes/api-jobs.ts`
- `job-hunt-dashboard/src/server/routes/api-cover-letter.test.ts`
- `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx`
- `job-hunt-dashboard/src/client/hooks/useGenerateCoverLetter.ts`

**Deleted:**
- `job-hunt-dashboard/src/server/utils/build-docx.ts`
- `job-hunt-dashboard/src/server/utils/build-docx.test.ts`
- `job-hunt-dashboard/src/client/hooks/useCoverLetterQuery.ts`

---

### Review Findings

- [x] [Review][Decision] PDF persistence non-fatal per spec but leaves broken iframe on failure — resolved: PDF temp-write moved before DB transaction; write failure now returns 502 without setting `coverLetterSentAt` [`api-jobs.ts`]
- [x] [Review][Patch] Iframe shows stale PDF after cover letter regeneration — fixed: `?t=${job.coverLetterSentAt}` cache-bust param added to iframe src and download href [`JobDrawer.tsx`]
- [x] [Review][Patch] Missing `<Separator />` before cover letter section — fixed: added `<Separator />` and wrapping `<>` fragment [`JobDrawer.tsx`]
- [x] [Review][Defer] Concurrent generation races on `${rawId}.pdf.tmp` fixed temp path — pre-existing pattern shared with resume; non-issue for single-user tool [`api-jobs.ts`] — deferred, pre-existing
- [x] [Review][Defer] `inserted` query matches by `createdAt` timestamp — concurrent generations within same millisecond could match wrong row; pre-existing pattern across all generation routes [`api-jobs.ts`] — deferred, pre-existing
