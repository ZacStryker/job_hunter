# Story 8.1: Pipeline Table — Date Scraped & Status Columns

Status: done

## Story

As a user,
I want to see the date a job was scraped and its current status directly in the pipeline table,
So that I can assess job recency and application state without opening the drawer.

## Acceptance Criteria

1. **Given** the Pipeline table renders
   **When** the user opens the Columns dropdown
   **Then** "Date Scraped" and "Status" entries are present and toggleable

2. **Given** a job has a non-null `dateScraped` value
   **When** its row renders
   **Then** the date is displayed in the Date Scraped cell; null values show an em-dash (—)

3. **Given** a job has a non-null `status` value
   **When** its row renders
   **Then** the status string is displayed in the Status cell; null values show an em-dash (—)

4. **Given** the user hides the Date Scraped or Status column via the Columns toggle
   **When** they reload the page
   **Then** the hidden state persists via localStorage

## Tasks / Subtasks

- [x] Task 1: Add `dateScraped` and `status` columns to `PipelineTable.tsx` (AC: 1, 2, 3)
  - [x] Add two column definitions to the `columns` array after the `roleFit` (Notes) entry:
    ```ts
    columnHelper.accessor('dateScraped', {
      id: 'date_scraped',
      header: 'Date Scraped',
      cell: (info) => {
        const v = info.getValue()
        return v ? (
          <span className="text-zinc-300">{v.slice(0, 10)}</span>
        ) : (
          <span className="text-zinc-500">—</span>
        )
      },
    }),
    columnHelper.accessor('status', {
      id: 'status',
      header: 'Status',
      cell: (info) => {
        const v = info.getValue()
        return v ? (
          <span className="text-zinc-300">{v}</span>
        ) : (
          <span className="text-zinc-500">—</span>
        )
      },
    }),
    ```
  - [x] No new imports needed — `dateScraped` and `status` are already on the `Job` type from `@shared/schemas`

- [x] Task 2: Register columns in `ColumnVisibilityToggle.tsx` (AC: 1, 4)
  - [x] Append two entries to `OPTIONAL_COLUMNS` after the `cover_letter` entry:
    ```ts
    { id: 'date_scraped', label: 'Date Scraped' },
    { id: 'status', label: 'Status' },
    ```

- [x] Task 3: Verify (AC: all)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests pass (no regressions)

## Dev Notes

### What Already Exists — Do NOT Re-Implement

- **`dateScraped` on `Job` type** — already in `shared/schemas.ts` as `z.string().nullable()` — no schema changes needed
- **`status` on `Job` type** — already in `shared/schemas.ts` as `z.string().nullable()` — no schema changes needed
- **localStorage persistence** — already handled by `handleVisibilityChange` in `PipelineTable.tsx`; no new code needed for persistence
- **Column visibility mechanism** — the existing `loadVisibility`/`VISIBILITY_KEY` system already handles new columns transparently

### File Locations

```
src/client/components/pipeline/
  PipelineTable.tsx          ← MODIFIED (add 2 column definitions)
  ColumnVisibilityToggle.tsx ← MODIFIED (add 2 entries to OPTIONAL_COLUMNS)
```

No new files. No server changes. No schema changes.

### Column ID Convention

Existing optional column IDs use `snake_case`: `reqs_met`, `reqs_missed`, `notes`, `cover_letter`.

- `dateScraped` accessor → id: `date_scraped` — stored in localStorage as part of `VisibilityState`
- `status` accessor → id: `status` — TanStack Table uses accessor name by default, but explicit `id: 'status'` makes it unambiguous

Do NOT use camelCase IDs (`dateScraped`, `coverLetter`) — would break localStorage consistency with established pattern.

### Column Placement

Append both after `roleFit` (Notes) in `columns` array. Current order:

```
company → jobTitle → fitScore → recommendation → cover_letter → reqs_met → reqs_missed → roleFit (notes) → [NEW: date_scraped] → [NEW: status]
```

And in `OPTIONAL_COLUMNS`:

```
reqs_met → reqs_missed → notes → cover_letter → [NEW: date_scraped] → [NEW: status]
```

### Date Display

`dateScraped` is an ISO 8601 string (e.g., `"2026-03-15T10:30:00Z"`). Display only the date portion using `v.slice(0, 10)` — produces `"2026-03-15"`. Do NOT use `new Date()` or `toLocaleDateString()` — avoids timezone-dependent rendering and is consistent with the project's ISO 8601 string convention.

### No Tests Required

No server-side changes; no new hooks; no query/mutation logic. Frontend-only column additions. TypeScript strict-mode check + regression test run is the full verification gate.

### Architecture Compliance

- No new components (column cells are inline render functions) ✓
- No direct `fetch` in components ✓
- `dateScraped` and `status` accessors — field names from `Job` type in `shared/schemas.ts` ✓
- No new query keys or mutations ✓
- No changes to server code ✓
- Column IDs in snake_case per established pattern ✓

### Previous Story Learnings (from 7.3)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **TypeScript strict mode** — `noUnusedLocals` is active; any imported symbol that isn't used is a compile error
- **`OPTIONAL_COLUMNS` in `ColumnVisibilityToggle.tsx` duplicates column IDs from `PipelineTable.tsx`** — this is known tech debt; maintain both manually (no abstraction to "fix" this)
- **Test count baseline:** 83 passing tests after story 7.3; expect same count after this story (no new tests added)

### References

- Epic 8: `_bmad-output/planning-artifacts/epics/epic-8-field-visibility-and-archive.md`
- Story 7.3 (pattern to follow): `_bmad-output/implementation-artifacts/7-3-cover-letter-display-and-table-row-indicator.md`
- Files to modify: `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx`, `job-hunt-dashboard/src/client/components/pipeline/ColumnVisibilityToggle.tsx`
- Architecture: `_bmad-output/planning-artifacts/architecture-distillate.md`

## Dev Agent Record

### Implementation Plan

Added two TanStack Table column definitions to `PipelineTable.tsx` (`date_scraped` via `dateScraped` accessor, `status` via `status` accessor) and registered both in `OPTIONAL_COLUMNS` in `ColumnVisibilityToggle.tsx`. Both fields are already on the `Job` type — no schema, server, or import changes needed. Null values render an em-dash; dates display only the YYYY-MM-DD portion via `v.slice(0, 10)`.

### Completion Notes

- Added `date_scraped` and `status` columns to `PipelineTable.tsx` after `notes` (roleFit) column
- Added `{ id: 'date_scraped', label: 'Date Scraped' }` and `{ id: 'status', label: 'Status' }` to `OPTIONAL_COLUMNS` in `ColumnVisibilityToggle.tsx`
- TypeScript strict-mode check: 0 errors
- Test suite: 83 pass, 0 fail (no regressions, no new tests required per story spec)

### File List

- `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx`
- `job-hunt-dashboard/src/client/components/pipeline/ColumnVisibilityToggle.tsx`

### Review Findings

- [ ] [Review][Decision] Story 7-3 uncommitted changes bundled into this diff — `CoverLetterChip.tsx` (untracked), the `cover_letter` column definition in `PipelineTable.tsx`, and the `cover_letter` entry in `ColumnVisibilityToggle.tsx` appear to be story 7-3 work that was never committed. Sprint-status marks 7-3 as `done`. Story 8-1 spec assumes `cover_letter` already exists and states "No new files". Clarify: should these be committed separately as story 7-3, or are they intentionally bundled with 8-1?
- [ ] [Review][Patch] CoverLetterChip returns null instead of em-dash for null sentAt — inconsistent with date_scraped and status columns which both render `<span className="text-zinc-500">—</span>` for null [CoverLetterChip.tsx:6]
- [x] [Review][Defer] dateScraped slice without format validation — `v.slice(0, 10)` on a `z.string().nullable()` field with no ISO 8601 enforcement; malformed strings silently display garbage. Spec-mandated approach; pre-existing schema looseness [PipelineTable.tsx:94] — deferred, pre-existing
- [x] [Review][Defer] New columns hidden by default on existing localStorage — users upgrading won't have `cover_letter`/`date_scraped`/`status` keys in their stored VisibilityState; consistent pre-existing behavior for all prior column additions [PipelineTable.tsx, ColumnVisibilityToggle.tsx] — deferred, pre-existing
- [x] [Review][Defer] status column renders raw DB strings without display-name mapping — values like `phone_screen` rendered verbatim; pre-existing concern (logged from Story 5.1 review) [PipelineTable.tsx:109] — deferred, pre-existing
- [x] [Review][Defer] Whitespace-only sentAt passes truthy check and renders "CL Sent" badge — very unlikely given data source; pre-existing pattern across codebase [CoverLetterChip.tsx:6] — deferred, pre-existing

### Change Log

- 2026-04-07: Story created by SM agent
- 2026-04-07: Implemented by dev agent — added date_scraped and status columns
- 2026-04-07: Code review — 1 decision needed, 1 patch, 4 deferred, 2 dismissed
