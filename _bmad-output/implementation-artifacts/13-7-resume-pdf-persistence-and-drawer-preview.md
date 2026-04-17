# Story 13.7: Resume PDF Persistence and Drawer Preview

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline
**Story ID:** 13-7-resume-pdf-persistence-and-drawer-preview
**Status:** done
**Depends on:** 13-6 (resume generation via Playwright + Anthropic — already done)
**Date:** 2026-04-15

---

## User Story

As a job seeker, I want generated resume PDFs saved on disk and viewable in the job drawer, so I can review and re-download a resume without triggering a slow re-generation.

---

## Acceptance Criteria

### AC1 — `resumeGeneratedAt` column added to jobs
- `src/db/schema.ts`: add `resumeGeneratedAt: text('resume_generated_at')` to `jobs` table (nullable, no default)
- New migration `src/db/migrations/0012_resume_generated_at.sql`:
  ```sql
  ALTER TABLE `jobs` ADD `resume_generated_at` text;
  ```
- `src/db/migrations/meta/_journal.json`: new entry added (idx: 12, tag: `0012_resume_generated_at`)
- `src/shared/schemas.ts`: `jobSchema` extended with `resumeGeneratedAt: z.string().nullable()`

### AC2 — PDF saved to disk on generation
- `POST /:id/generate-resume` (in `api-jobs.ts`): after successful `generateResume()` call, write `pdfBuffer` to `data/resumes/{jobId}.pdf`
- Directory `data/resumes/` created with `fs.mkdirSync(..., { recursive: true })` before write — no assumption it exists
- Use `Bun.write(path, pdfBuffer)` to write the file (project uses Bun runtime)
- After writing file, execute: `db.update(jobs).set({ resumeGeneratedAt: new Date().toISOString() }).where(eq(jobs.id, rawId)).run()`
- Response still returns the PDF binary immediately (same as before — keeps the immediate download working)
- On failure to write file: log with `console.error` but do NOT fail the request — user still gets their download

### AC3 — `GET /:id/resume` endpoint serves stored PDF inline
- New route `app.get('/:id/resume', ...)` in `api-jobs.ts` (same id validation pattern as other routes)
- Reads file at `data/resumes/{jobId}.pdf`
- Returns `404 { error: 'Resume not found' }` if file does not exist
- Returns PDF with:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="{candidateName} - Resume - {company} - {jobTitle}.pdf"` (note: `inline` not `attachment` — Firefox renders it in-page, not downloads)
  - Same filename sanitization as `POST` route (replace em/en dashes with `-`, strip non-ASCII, replace `"` with `'`)
- Fetches `profileRow` from DB for `candidateName` (same as POST route; fallback `'Resume'`)
- Fetches `job` from DB for company/jobTitle

### AC4 — `useGenerateResume` hook invalidates jobs cache
- After successful mutation, add `queryClient.invalidateQueries({ queryKey: ['jobs'] })` to `onSettled` (alongside the existing webhook-runs invalidation)
- This ensures `job.resumeGeneratedAt` is populated in the cached job after generation, triggering the preview section to appear

### AC5 — `JobDrawer` shows PDF preview when resume exists
- When `job.resumeGeneratedAt` is set (non-null), render a new section below the cover letter section (or after job description if no cover letter):
  ```
  <Separator />
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Resume</p>
      <div className="flex items-center gap-2">
        <p className="text-xs text-zinc-600">{formatted date}</p>
        <a href={`/api/jobs/${job.id}/resume`} download className="...">
          <Download size={11} /> Download
        </a>
      </div>
    </div>
    <iframe
      src={`/api/jobs/${job.id}/resume`}
      className="w-full h-96 border border-zinc-800 rounded"
      title="Resume preview"
    />
  </div>
  ```
- Date formatted with `new Date(job.resumeGeneratedAt).toLocaleDateString()`
- Download button style: match the copy button in the cover letter section — `inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors`
- Import `Download` from `lucide-react`
- The `<a download>` tag triggers a file download when clicked; the `<iframe>` renders the PDF inline using Firefox's built-in PDF viewer
- No loading state needed for the iframe (it loads asynchronously in the background)

### AC6 — Resume button label updates after generation
- In `JobDrawer`, when `job.resumeGeneratedAt` is set, change the "Resume" button label to "Regenerate" (mirroring the cover letter button pattern)
- Button still calls `generateResume()` — on success, `['jobs']` invalidation refreshes `resumeGeneratedAt` and the iframe reloads

### AC7 — Tests
- `src/server/routes/api-resume.test.ts` (EXISTING — add cases):
  - `GET /:id/resume` 200: returns `application/pdf`, `Content-Disposition` contains `inline`
  - `GET /:id/resume` 404: when `data/resumes/{id}.pdf` does not exist
  - `GET /:id/resume` 404: when job does not exist
  - `GET /:id/resume` 400: non-numeric id
- `POST /:id/generate-resume` test updates (EXISTING `api-resume.test.ts`):
  - Mock `Bun.write` (or confirm it is already mocked/skipped) — do NOT write real files in tests
  - Verify `resumeGeneratedAt` is set on the job record after successful generation
- All existing tests continue to pass (no regressions)

---

## Technical Requirements

### Files to create/modify

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `resumeGeneratedAt` text column to `jobs` table |
| `src/db/migrations/0012_resume_generated_at.sql` | **NEW** — `ALTER TABLE jobs ADD resume_generated_at text;` |
| `src/db/migrations/meta/_journal.json` | Add entry for migration 0012 |
| `src/shared/schemas.ts` | Add `resumeGeneratedAt: z.string().nullable()` to `jobSchema` |
| `src/server/routes/api-jobs.ts` | Persist PDF + update `resumeGeneratedAt` in POST; add GET /:id/resume |
| `src/server/routes/api-resume.test.ts` | Add GET /:id/resume tests; add persistence assertion |
| `src/client/hooks/useGenerateResume.ts` | Add `['jobs']` invalidation in `onSettled` |
| `src/client/components/detail/JobDrawer.tsx` | Resume preview section + "Regenerate" label update |

---

## Implementation Notes

### 1. File path resolution

The PDF path must be resolved relative to the project root, not the TypeScript source file:

```ts
import { join } from 'node:path'

const resumesDir = join(process.cwd(), 'data', 'resumes')
const resumePath = join(resumesDir, `${rawId}.pdf`)
```

`process.cwd()` is the project root (`job-hunt-dashboard/`) when running `bun start` or `bun run dev`.

### 2. Bun.write vs fs.writeFile

Use `Bun.write(path, buffer)` — this is idiomatic for the Bun runtime and is already used elsewhere in the project. Do NOT use `fs.writeFile` or `fs.writeFileSync` unless Bun.write fails.

```ts
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const resumesDir = join(process.cwd(), 'data', 'resumes')
mkdirSync(resumesDir, { recursive: true })
await Bun.write(join(resumesDir, `${rawId}.pdf`), pdfBuffer)
```

### 3. GET /:id/resume — serving the file

```ts
import { readFileSync, existsSync } from 'node:fs'

app.get('/:id/resume', async (c) => {
  // ... id validation (same pattern as other routes) ...

  const job = db.select().from(jobs).where(eq(jobs.id, rawId)).get()
  if (!job) return c.json({ error: 'Job not found' }, 404)

  const resumePath = join(process.cwd(), 'data', 'resumes', `${rawId}.pdf`)
  if (!existsSync(resumePath)) return c.json({ error: 'Resume not found' }, 404)

  const pdfBuffer = readFileSync(resumePath)
  const profileRow = db.select().from(profile).limit(1).get()
  const candidateName = profileRow?.name ?? 'Resume'
  const fileName = `${candidateName} - Resume - ${job.company} - ${job.jobTitle}.pdf`
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'")

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  })
})
```

### 4. POST route additions (minimal diff)

After the existing `recordRun` call and before the final `return new Response(...)`:

```ts
// Persist PDF
try {
  const resumesDir = join(process.cwd(), 'data', 'resumes')
  mkdirSync(resumesDir, { recursive: true })
  await Bun.write(join(resumesDir, `${rawId}.pdf`), pdfBuffer)
  db.update(jobs).set({ resumeGeneratedAt: new Date().toISOString() }).where(eq(jobs.id, rawId)).run()
} catch (err) {
  console.error('Failed to persist resume PDF:', err)
  // Non-fatal — user still gets their download
}
```

### 5. Migration journal entry

The `_journal.json` entry must follow the exact existing pattern:

```json
{
  "idx": 12,
  "version": "6",
  "when": 1744761600000,
  "tag": "0012_resume_generated_at",
  "breakpoints": true
}
```

Use timestamp `1744761600000` (2026-04-16T00:00:00Z).

### 6. Schema addition

In `src/db/schema.ts`, add to `jobs` table after `dateApplied`:

```ts
resumeGeneratedAt: text('resume_generated_at'),
```

No `.notNull()`, no `.default()` — nullable by default in Drizzle.

### 7. `jobSchema` addition in `shared/schemas.ts`

Add to the `.extend({...})` block in `jobSchema` (after `archived`):

```ts
resumeGeneratedAt: z.string().nullable(),
```

### 8. `useGenerateResume` hook

```ts
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
  queryClient.invalidateQueries({ queryKey: ['jobs'] })
},
```

### 9. `JobDrawer` resume preview section

Position: after the cover letter section block (after the `{coverLetter && (...)}` block).

The iframe uses Firefox's built-in PDF viewer — no external library needed. Target browser is Firefox latest only (project-wide constraint).

The "Regenerate" label update follows the existing cover letter pattern exactly:
```tsx
{isResumePending ? 'Generating…' : job.resumeGeneratedAt ? 'Regenerate' : 'Resume'}
```

### 10. `data/resumes/` directory

`data/` is already gitignored (contains `jobs.db`). No `.gitignore` changes needed. The `resumes/` subdirectory will be created at runtime by `mkdirSync(..., { recursive: true })`.

---

## Key Patterns from Previous Stories

- **id validation pattern** (copy from existing routes in `api-jobs.ts`):
  ```ts
  const idParam = c.req.param('id')
  if (!/^\d+$/.test(idParam)) return c.json({ error: 'Invalid job id' }, 400)
  const rawId = Number(idParam)
  if (rawId <= 0) return c.json({ error: 'Invalid job id' }, 400)
  ```
- **TanStack Query keys:** `['jobs']` for list invalidation — no other shapes permitted
- **Error response shape:** `{ error: string }` + HTTP status only — never `{ message: string }`
- **DB update:** `.run()` on all write statements (not `.get()` or `.all()`)
- **ISO 8601 dates:** `new Date().toISOString()` — always full datetime with Z suffix
- **Import from shared:** `Job` type from `@shared/schemas` — never redefine inline

---

## Anti-Patterns to Avoid

- **Do NOT** use `0.0.0.0` anywhere (Hono binds to `127.0.0.1`)
- **Do NOT** use `console.log` for errors — use `console.error`
- **Do NOT** add `resumeGeneratedAt` to any `onConflictDoUpdate.set` block in ingest — it is user-owned
- **Do NOT** use envelope response shape (`{ success: true, data: ... }`)
- **Do NOT** call `fetch('/api/...')` directly in components — the existing `useGenerateResume` hook handles this
- **Do NOT** use `fs.writeFileSync` — use `Bun.write` (async, idiomatic Bun)
- **Do NOT** launch a PDF.js library — Firefox's built-in viewer via `<iframe>` is sufficient (Firefox-only target)

---

## Dev Agent Record

### Completion Notes

- AC1: Added `resumeGeneratedAt: text('resume_generated_at')` to `jobs` table in schema.ts; created migration 0012_resume_generated_at.sql; updated _journal.json; added `resumeGeneratedAt: z.string().nullable()` to `jobSchema` in shared/schemas.ts.
- AC2: POST `/:id/generate-resume` now persists PDF to `data/resumes/{jobId}.pdf` using `Bun.write` after successful generation, updates `resumeGeneratedAt` on the job row. Failure is non-fatal — user still receives the download.
- AC3: Added `GET /:id/resume` endpoint that reads PDF from disk, returns 404 if job or file not found, and serves with `Content-Disposition: inline` for Firefox in-page rendering.
- AC4: `useGenerateResume` hook now invalidates `['jobs']` query on settled (alongside existing `['webhook-runs']` invalidation).
- AC5: `JobDrawer` renders resume preview section (iframe + download link) when `job.resumeGeneratedAt` is set.
- AC6: Resume button label changes to "Regenerate" when `job.resumeGeneratedAt` is set.
- AC7: Updated `api-resume.test.ts` with GET /:id/resume tests (200, 404 file missing, 404 job missing, 400 bad id) and persistence assertion for POST. Added `resume_generated_at TEXT` column to all 6 test file DDLs that create the jobs table in-memory. All 168 tests pass.

---

## File List

- `job-hunt-dashboard/src/db/schema.ts`
- `job-hunt-dashboard/src/db/migrations/0012_resume_generated_at.sql` (new)
- `job-hunt-dashboard/src/db/migrations/meta/_journal.json`
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/server/routes/api-jobs.ts`
- `job-hunt-dashboard/src/server/routes/api-resume.test.ts`
- `job-hunt-dashboard/src/client/hooks/useGenerateResume.ts`
- `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx`
- `job-hunt-dashboard/src/server/routes/api-ingest.test.ts`
- `job-hunt-dashboard/src/server/routes/api-jobs.test.ts`
- `job-hunt-dashboard/src/server/routes/api-cover-letter.test.ts`
- `job-hunt-dashboard/src/server/routes/api-stats.test.ts`
- `job-hunt-dashboard/src/server/services/discovery-service.test.ts`
- `job-hunt-dashboard/src/server/services/analysis-service.test.ts`

---

## Change Log

- 2026-04-15: Implemented AC1–AC7 — resume PDF persistence, GET serve endpoint, drawer preview with iframe, "Regenerate" label, jobs cache invalidation. All 168 tests pass.

---

## Review Findings

### Patches

- [x] [Review][Patch] `recordRun` hardcoded `success: false` on the happy path [`api-jobs.ts` POST /:id/generate-resume] — was already `true`; false alarm
- [x] [Review][Patch] `existsSync` + `readFileSync` TOCTOU race and synchronous blocking in async handler [`api-jobs.ts` GET /:id/resume] — fixed: replaced with `Bun.file().arrayBuffer()` + try/catch on ENOENT
- [x] [Review][Patch] Concurrent `POST /generate-resume` writes same file path non-atomically [`api-jobs.ts` POST /:id/generate-resume] — fixed: write-to-temp-then-rename (atomic on POSIX)
- [x] [Review][Patch] `GET /:id/cover-letter/docx` queries by cover letter ID instead of job ID [`api-jobs.ts` GET /:id/cover-letter/docx] — fixed: query by `coverLetters.jobId`; test updated accordingly
- [x] [Review][Patch] Migration journal `0012` `when` timestamp is 2025-04-16 [`_journal.json`] — fixed: updated to `1776254400000` (2026-04-15)

### Deferred

- [x] [Review][Defer] `Content-Disposition` filename not RFC 6266 compliant (`;`, `0x7F` pass through) [`api-jobs.ts`] — deferred, pre-existing pattern throughout file
- [x] [Review][Defer] iframe renders blank if PDF absent after swallowed write error [`JobDrawer.tsx`] — deferred, deliberate design per spec (failure is non-fatal)
- [x] [Review][Defer] iframe + `<a download>` both fire `GET /:id/resume` on same render, doubling disk reads [`JobDrawer.tsx`] — deferred, low impact
- [x] [Review][Defer] No user feedback (toast/error) from mutation success/failure [`useGenerateResume.ts`] — deferred, pre-existing, out of story scope
- [x] [Review][Defer] Object URL 40 s timeout + nav-away leak [`useGenerateResume.ts`] — deferred, explicit design rationale in code comment
- [x] [Review][Defer] `process.cwd()` path resolution unreliable in non-standard deploy configs [`api-jobs.ts`] — deferred, intentional per spec implementation notes
- [x] [Review][Defer] Profile row re-queried on every `GET /:id/resume` for filename only [`api-jobs.ts`] — deferred, cosmetic perf concern
- [x] [Review][Defer] `resumeGeneratedAt` durability: no fsync — drawer shows stale state after crash [`api-jobs.ts`] — deferred, inherent OS page-cache limitation
- [x] [Review][Defer] Orphaned PDF on disk when job is deleted and re-ingested with new id [`api-jobs.ts`] — deferred, no delete feature exists yet
- [x] [Review][Defer] `analysisStatus` stored as raw TEXT with no SQLite CHECK constraint [`schema.ts`] — deferred, pre-existing from earlier story
- [x] [Review][Defer] `uniqueIndex` on `(company, job_title)` not updated to use `externalJobId` [`schema.ts`] — deferred, pre-existing; `externalJobId` is nullable
- [x] [Review][Defer] idx 11 journal entry added as part of this story (cross-story dependency) [`_journal.json`] — deferred, informational; correct behavior
