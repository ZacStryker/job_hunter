# Story 7.2: Cover Letter Retrieval & Drawer Display

Status: done

## Story

As a user,
I want to read my generated cover letter directly in the job drawer,
So that I can review and copy it without leaving the dashboard.

## Context: Story 7.2 Re-Scoping

**The original async-callback concept is obsolete.** Story 7.1 confirmed that the n8n webhook is synchronous — it processes the pipeline and returns the cover letter in the same HTTP response. As a result, story 7.1 already completed everything from the original 7.2 scope:
- ✅ `cover_letters` table created with migration
- ✅ `N8N_WEBHOOK_SECRET` validation on outbound webhook
- ✅ Cover letter text stored in `cover_letters` table on generation
- ✅ Job's `coverLetterSentAt` updated atomically

**Story 7.2 is therefore re-scoped** to: fetch and display stored cover letter content in the drawer (the placeholder left by 7.1), plus wire the invalidation so the displayed content refreshes after regeneration.

Story 7.3 (unchanged) handles the pipeline table chip indicator.

## Acceptance Criteria

1. **Given** a job has a generated cover letter in `cover_letters`
   **When** the drawer is opened
   **Then** the cover letter content is fetched and displayed in the Cover Letter section where the placeholder comment currently sits (below the Generate/Regenerate button)

2. **Given** the cover letter content is displayed
   **When** the user reads it
   **Then** it renders as scrollable preformatted text with a "Copy" button that copies the content to the clipboard

3. **Given** the user clicks "Regenerate Cover Letter"
   **When** generation succeeds
   **Then** the displayed cover letter content updates automatically (new content replaces old without a manual refresh)

4. **Given** a job has no cover letter (`coverLetterSentAt` is null)
   **When** the drawer is opened
   **Then** no cover letter content area is shown (just the Generate button as implemented in 7.1) — no fetch is attempted

5. **Given** `GET /api/jobs/:id/cover-letter` is called with a valid job ID that has no cover letter
   **When** the response is received
   **Then** HTTP 404 is returned with `{ error: "No cover letter found" }`

6. **Given** `GET /api/jobs/:id/cover-letter` is called with an invalid (non-numeric or ≤0) ID
   **When** the response is received
   **Then** HTTP 400 is returned with `{ error: "Invalid job id" }`

## Tasks / Subtasks

- [x] Task 1: Add `GET /api/jobs/:id/cover-letter` endpoint to `src/server/routes/api-jobs.ts` (AC: 1, 4, 5, 6)
  - [x] Add handler after `POST /:id/generate-cover-letter`:
    ```ts
    app.get('/:id/cover-letter', async (c) => {
      const idParam = c.req.param('id')
      if (!/^\d+$/.test(idParam)) {
        return c.json({ error: 'Invalid job id' }, 400)
      }
      const rawId = Number(idParam)
      if (rawId <= 0) {
        return c.json({ error: 'Invalid job id' }, 400)
      }

      const letter = db.select().from(coverLetters)
        .where(eq(coverLetters.jobId, rawId))
        .orderBy(desc(coverLetters.createdAt))
        .get()

      if (!letter) {
        return c.json({ error: 'No cover letter found' }, 404)
      }

      return c.json({ coverLetter: letter })
    })
    ```
  - [x] No new imports needed — `coverLetters`, `desc`, `eq` are already imported in `api-jobs.ts`
  - [x] Verify `and` import is present (used in `generate-cover-letter` handler); add only if missing

- [x] Task 2: Add GET endpoint tests to `src/server/routes/api-cover-letter.test.ts` (AC: 1, 5, 6)
  - [ ] Append to existing test file (do NOT create a new file — the setup is already there):
    ```ts
    describe('GET /:id/cover-letter', () => {
      test('returns 200 with most recent cover letter', async () => {
        prodSqlite.run(
          `INSERT INTO jobs (company, job_title, job_description) VALUES ('Acme', 'Engineer', 'Build stuff')`
        )
        const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
        prodSqlite.run(
          `INSERT INTO cover_letters (job_id, content, created_at) VALUES (?, ?, ?)`,
          [row.id, 'First letter', '2026-04-01T10:00:00.000Z']
        )
        prodSqlite.run(
          `INSERT INTO cover_letters (job_id, content, created_at) VALUES (?, ?, ?)`,
          [row.id, 'Second letter', '2026-04-02T10:00:00.000Z']
        )
        const res = await jobsApp.request(`/${row.id}/cover-letter`, { method: 'GET' })
        expect(res.status).toBe(200)
        const data = await res.json() as { coverLetter: { content: string } }
        expect(data.coverLetter.content).toBe('Second letter')
      })

      test('returns 404 when no cover letter exists', async () => {
        prodSqlite.run(
          `INSERT INTO jobs (company, job_title) VALUES ('Acme', 'Engineer')`
        )
        const row = prodSqlite.query('SELECT id FROM jobs LIMIT 1').get() as { id: number }
        const res = await jobsApp.request(`/${row.id}/cover-letter`, { method: 'GET' })
        expect(res.status).toBe(404)
        const data = await res.json() as Record<string, unknown>
        expect(data).toHaveProperty('error')
        expect(data).not.toHaveProperty('message')
      })

      test('returns 400 for non-numeric id', async () => {
        const res = await jobsApp.request('/abc/cover-letter', { method: 'GET' })
        expect(res.status).toBe(400)
        const data = await res.json() as Record<string, unknown>
        expect(data).toHaveProperty('error')
        expect(data).not.toHaveProperty('message')
      })
    })
    ```

- [x] Task 3: Create `src/client/hooks/useCoverLetterQuery.ts` (AC: 1, 3, 4)
  - [ ] New query key shape `['coverLetter', id]` — this is a deliberate extension beyond the `['jobs']`/`['jobs', id]` shapes defined in architecture; cover letters are a distinct entity. Document in a comment.
  - [ ] Implementation:
    ```ts
    import { useQuery } from '@tanstack/react-query'
    import type { CoverLetter } from '@shared/schemas'

    // ['coverLetter', id] is the approved query key shape for this entity
    export function useCoverLetterQuery(jobId: number, enabled: boolean) {
      return useQuery<CoverLetter | null>({
        queryKey: ['coverLetter', jobId],
        queryFn: async () => {
          const res = await fetch(`/api/jobs/${jobId}/cover-letter`)
          if (res.status === 404) return null
          if (!res.ok) throw new Error(`Failed to fetch cover letter: ${res.status}`)
          const data = await res.json() as { coverLetter: CoverLetter }
          return data.coverLetter
        },
        enabled,
        staleTime: Infinity, // only invalidated explicitly after generation
      })
    }
    ```

- [x] Task 4: Update `src/client/hooks/useGenerateCoverLetter.ts` to invalidate cover letter cache (AC: 3)
  - [ ] In `onSuccess`, add invalidation of `['coverLetter', jobId]` alongside existing `['jobs']` invalidation:
    ```ts
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['coverLetter', jobId] })
    },
    ```
  - [ ] `jobId` is already in scope from the function parameter — no other changes needed

- [x] Task 5: Replace placeholder in `src/client/components/detail/JobDrawer.tsx` (AC: 1, 2, 3, 4)
  - [x] Import `useCoverLetterQuery` from `../../hooks/useCoverLetterQuery`
  - [x] Call the hook inside the component:
    ```ts
    const { data: coverLetter } = useCoverLetterQuery(
      job?.id ?? 0,
      !!job?.coverLetterSentAt
    )
    ```
  - [x] Replace `{/* Story 7.2: cover letter content display goes here */}` with:
    ```tsx
    {coverLetter && (
      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-600">Generated {new Date(coverLetter.createdAt).toLocaleDateString()}</p>
          <button
            onClick={() => navigator.clipboard.writeText(coverLetter.content)}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Copy
          </button>
        </div>
        <pre className="text-xs text-zinc-300 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans leading-relaxed">
          {coverLetter.content}
        </pre>
      </div>
    )}
    ```
  - [x] The `enabled: !!job?.coverLetterSentAt` guard ensures no fetch fires when there is no cover letter — no additional conditional rendering needed beyond the `coverLetter &&` check

- [x] Task 6: Verify (AC: all)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests pass + new GET tests pass

### Review Findings

- [x] [Review][Patch] Missing test for id=0 — AC 6 specifies "≤0" as invalid but only `/abc/cover-letter` (non-numeric) is tested; no test for `GET /0/cover-letter` which exercises the `rawId <= 0` branch [`api-cover-letter.test.ts`]
- [x] [Review][Patch] Tests don't assert exact error message strings — AC 5 requires `{ error: "No cover letter found" }` and AC 6 requires `{ error: "Invalid job id" }`; both error tests only assert `toHaveProperty('error')` without checking the string value [`api-cover-letter.test.ts`]
- [x] [Review][Defer] `createdAt` text column sort order fragile [`api-jobs.ts`] — deferred, pre-existing (TEXT schema from 7.1; ISO-UTC strings sort correctly but format inconsistency would silently return wrong letter)
- [x] [Review][Defer] `new Date(coverLetter.createdAt).toLocaleDateString()` renders "Invalid Date" for malformed timestamps [`JobDrawer.tsx`] — deferred, pre-existing (unvalidated text date field in schema; consistent with pattern across codebase)

## Dev Notes

### What Story 7.1 Already Did (Do Not Re-Implement)

- `cover_letters` table: `(id, job_id FK, content NOT NULL, created_at NOT NULL)` — migration `0003_premium_liz_osborn.sql` committed
- `coverLetterSchema` + `CoverLetter` type in `src/shared/schemas.ts` — use as-is
- `POST /:id/generate-cover-letter` in `api-jobs.ts` — already inserts into `cover_letters` + updates `coverLetterSentAt`
- Cover Letter section with Generate/Regenerate button in `JobDrawer.tsx` — extend, do not replace
- `useGenerateCoverLetter` hook — only add invalidation in `onSuccess`

### API Endpoint Pattern

`api-jobs.ts` already imports everything this story needs:
```ts
import { jobs, statusEvents, coverLetters } from '../../db/schema'
import { eq, desc, and } from 'drizzle-orm'
```
Do NOT add duplicate imports. Verify `and` is present (used by generate handler); add only if absent.

### Query Key Extension

The project-context.md rule "no other shapes permitted" was written before cover letter storage existed. `['coverLetter', id]` is the approved extension for this entity. Add a comment in `useCoverLetterQuery.ts` noting this.

**After generation, two caches must be invalidated:**
1. `['jobs']` — to update `coverLetterSentAt` on the job record (existing)
2. `['coverLetter', jobId]` — to refresh the displayed cover letter content (new)

### `useCoverLetterQuery` Design Decisions

- `enabled: boolean` parameter (not derived inside the hook) — the hook doesn't import or know about the `Job` type; the component passes `!!job?.coverLetterSentAt`
- `staleTime: Infinity` — cover letters don't change spontaneously; only explicit invalidation after generation should trigger a refetch
- Returns `CoverLetter | null` — `null` on 404 (no cover letter), never throws on 404

### Display Implementation Notes

- `<pre>` with `whitespace-pre-wrap font-sans` — preserves newlines (cover letters have `\n\n` paragraph breaks) while using the app's font
- `max-h-64 overflow-y-auto` — constrains height so long cover letters don't push other drawer content off screen
- Date formatting: `new Date(coverLetter.createdAt).toLocaleDateString()` — locale-aware, no library needed
- `navigator.clipboard.writeText` — works on localhost (secure context); no error handling needed for this tool

### Test File Pattern

Add to the **existing** `api-cover-letter.test.ts` — do not create a new test file. The `beforeEach` already clears `cover_letters` and `jobs`, so new tests start clean. Use `describe('GET /:id/cover-letter', () => { ... })` to group.

The existing `prodSqlite` handle exposes the in-memory DB — use it for direct inserts in test setup:
```ts
prodSqlite.run(`INSERT INTO cover_letters ...`)
```

### Architecture Compliance

- New hook file: `useCoverLetterQuery.ts` — `camelCase` prefixed `use` ✓
- No direct `fetch` in components — use hooks only ✓
- Query key `['coverLetter', id]` — documented extension ✓
- `GET /api/jobs/:id/cover-letter` — `:id` param (not `:jobId`) ✓
- Response shape: `{ coverLetter: CoverLetter }` — direct data, no envelope ✓
- Error shape: `{ error: string }` — never `{ message }` ✓
- `bun:test` only — never vitest/jest ✓

### File Structure After This Story

```
src/
  server/
    routes/
      api-jobs.ts                          ← MODIFIED (add GET /:id/cover-letter)
      api-cover-letter.test.ts             ← MODIFIED (add GET tests)
  client/
    hooks/
      useCoverLetterQuery.ts               ← NEW
      useGenerateCoverLetter.ts            ← MODIFIED (onSuccess: +invalidate ['coverLetter'])
    components/
      detail/
        JobDrawer.tsx                      ← MODIFIED (replace placeholder, add hook call)
```

### Previous Story Learnings (from 7.1)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **`desc` already imported in `api-jobs.ts`** — do not add duplicate import
- **`mock.module` before dynamic import** — already set up in test file; adding new `describe` blocks at the end of the file works without re-mocking
- **TypeScript strict mode** — every import must be used; unused imports are compile errors
- **Error response shape** — always `{ error: string }`; assert both `toHaveProperty('error')` AND `not.toHaveProperty('message')` in error tests
- **TypeScript cast `job as Job`** — Drizzle widens `recommendation` to `string | null`; similar casts may be needed when passing DB results to typed functions
- **`T00:00:00Z` for date-only strings** — cover letter `createdAt` is always a full ISO timestamp, so this isn't applicable here

### References

- Epic 7: `_bmad-output/planning-artifacts/epics/epic-7-post-mvp-cover-letter-generation-pipeline.md`
- Story 7.1: `_bmad-output/implementation-artifacts/7-1-cover-letter-generation-trigger.md`
- Architecture: `_bmad-output/planning-artifacts/architecture-distillate.md`
- Project rules: `_bmad-output/project-context.md`
- Route to extend: `job-hunt-dashboard/src/server/routes/api-jobs.ts`
- Test file to extend: `job-hunt-dashboard/src/server/routes/api-cover-letter.test.ts`
- Hook to update: `job-hunt-dashboard/src/client/hooks/useGenerateCoverLetter.ts`
- Component to update: `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx`
- Existing hook pattern: `job-hunt-dashboard/src/client/hooks/useJobEvents.ts`

## Dev Agent Record

### Implementation Notes

- Added `GET /:id/cover-letter` to `api-jobs.ts` after the generate handler; reuses existing imports (`coverLetters`, `eq`, `desc`, `and`)
- Added 3 GET tests to `api-cover-letter.test.ts`: 200 with most-recent-wins ordering, 404 no letter, 400 non-numeric id
- Created `useCoverLetterQuery.ts` with `enabled` param, `staleTime: Infinity`, returns `CoverLetter | null` (null on 404)
- Updated `useGenerateCoverLetter.ts` `onSuccess` to also invalidate `['coverLetter', jobId]`
- Replaced placeholder comment in `JobDrawer.tsx` with cover letter display: scrollable `<pre>`, Copy button, generated date; guarded by `coverLetter &&`

### Completion Notes

All 6 tasks complete. 82 tests pass (0 failures). Zero TypeScript errors. All 6 ACs satisfied.

## File List

- `job-hunt-dashboard/src/server/routes/api-jobs.ts` (modified — added GET /:id/cover-letter)
- `job-hunt-dashboard/src/server/routes/api-cover-letter.test.ts` (modified — added GET tests)
- `job-hunt-dashboard/src/client/hooks/useCoverLetterQuery.ts` (new)
- `job-hunt-dashboard/src/client/hooks/useGenerateCoverLetter.ts` (modified — invalidate ['coverLetter', jobId])
- `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx` (modified — cover letter display)

## Change Log

- 2026-04-06: Story created by SM agent — re-scoped from async callback (done in 7.1) to cover letter retrieval and drawer display
- 2026-04-06: Implementation complete by Dev agent — all tasks done, 82 tests pass
