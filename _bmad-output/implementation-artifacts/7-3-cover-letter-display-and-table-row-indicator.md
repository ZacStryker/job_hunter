# Story 7.3: Cover Letter Table Row Indicator

Status: done

## Story

As a user,
I want to see a cover letter status indicator on pipeline table rows,
So that I can track which applications have cover letters without opening each drawer.

## Context: Story 7.3 Re-Scoping

**The drawer display is already complete.** Story 7.2 implemented the cover letter fetch and display inside `JobDrawer.tsx` (`useCoverLetterQuery`, scrollable `<pre>`, Copy button). The epic's AC 1 ("render cover letter in drawer below status timeline") is done — do NOT re-implement it.

**Story 7.3 is therefore scoped to the pipeline table chip only:**
- Add a "CL Sent" column to `PipelineTable.tsx` — visible when `coverLetterSentAt` is non-null
- New `CoverLetterChip` component in `components/pipeline/`
- Register column in `ColumnVisibilityToggle.tsx` as optional

## Acceptance Criteria

1. **Given** a job with `coverLetterSentAt` set (non-null)
   **When** its row renders in the Pipeline table
   **Then** a "CL Sent" chip is visible in the row in a muted style

2. **Given** a job with no cover letter (`coverLetterSentAt` is null)
   **When** its row renders
   **Then** no chip is shown — no "No CL" label, just empty

3. **Given** the Pipeline table renders
   **When** the user opens the Columns toggle
   **Then** a "CL" entry appears in the dropdown, allowing the column to be hidden

## Tasks / Subtasks

- [x] Task 1: Create `src/client/components/pipeline/CoverLetterChip.tsx` (AC: 1, 2)
  - [x] New component — same pattern as `ActionChip.tsx`:
    ```tsx
    interface CoverLetterChipProps {
      sentAt: string | null
    }

    export function CoverLetterChip({ sentAt }: CoverLetterChipProps) {
      if (!sentAt) return null
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-800 text-zinc-400">
          CL Sent
        </span>
      )
    }
    ```
  - [x] No import from `@shared/schemas` needed — accepts `string | null` directly

- [x] Task 2: Add `coverLetterSentAt` column to `src/client/components/pipeline/PipelineTable.tsx` (AC: 1, 2)
  - [x] Import `CoverLetterChip` at top of file
  - [x] Add column definition to the `columns` array (after the `recommendation`/Action column, before `requirementsMet`):
    ```ts
    columnHelper.accessor('coverLetterSentAt', {
      id: 'cover_letter',
      header: 'CL',
      cell: (info) => <CoverLetterChip sentAt={info.getValue()} />,
    }),
    ```
  - [x] Column is visible by default (no changes to `loadVisibility` or initial state needed)

- [x] Task 3: Register column in `src/client/components/pipeline/ColumnVisibilityToggle.tsx` (AC: 3)
  - [x] Add entry to `OPTIONAL_COLUMNS` array:
    ```ts
    { id: 'cover_letter', label: 'CL' },
    ```
  - [x] Append after the `notes` entry (preserve existing order)

- [x] Task 4: Verify (AC: all)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests pass (no regressions)

## Dev Notes

### What Already Exists — Do NOT Re-Implement

- **Drawer display** — `JobDrawer.tsx` already imports `useCoverLetterQuery` and renders the cover letter below the Generate button. Touch nothing in `JobDrawer.tsx`.
- **`useCoverLetterQuery` hook** — already exists at `src/client/hooks/useCoverLetterQuery.ts`; not used by this story
- **`GET /api/jobs/:id/cover-letter` endpoint** — already in `api-jobs.ts`; not used by this story
- **`coverLetterSentAt` on `Job` type** — already in `shared/schemas.ts`; no schema changes needed

### File Locations

```
src/client/components/pipeline/
  ActionChip.tsx           ← pattern to follow for CoverLetterChip
  CoverLetterChip.tsx      ← NEW
  ColumnVisibilityToggle.tsx ← MODIFIED (add 'cover_letter' to OPTIONAL_COLUMNS)
  PipelineTable.tsx        ← MODIFIED (add column, import CoverLetterChip)
```

### Column ID Convention

Existing optional column IDs use `snake_case`: `reqs_met`, `reqs_missed`, `notes`. Use `cover_letter` — this key is stored in `localStorage` as part of `VisibilityState`. Do NOT use `coverLetter` (camelCase) or `cl` — would differ from the established pattern and silently break if localStorage already holds a `cover_letter` key.

### Chip Styling

Match the muted style from `ActionChip`'s "skip" variant: `bg-zinc-800 text-zinc-400`. No border, no animation. The chip is informational only — not clickable.

### Column Placement

Insert the `cover_letter` column after `recommendation` (Action) and before `requirementsMet` (Reqs Met). This keeps the high-signal AI columns (Score, Action, CL) grouped together.

### No Tests Required

No server-side changes; no new hooks; no query/mutation logic. Frontend-only component addition. TypeScript strict-mode check + regression test run (all 82 existing tests) is the full verification gate.

### Architecture Compliance

- New component: `CoverLetterChip.tsx` — PascalCase ✓
- No direct `fetch` in components ✓
- `coverLetterSentAt` accessor — field name from `Job` type in `shared/schemas.ts` ✓
- No new query keys or mutations ✓
- No changes to server code ✓

### Previous Story Learnings (from 7.1 and 7.2)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **TypeScript strict mode** — every import must be used; unused imports are compile errors
- **`OPTIONAL_COLUMNS` in `ColumnVisibilityToggle.tsx` duplicates column IDs from `PipelineTable.tsx`** — this is known tech debt (logged in deferred-work.md); maintain both manually

### File Structure After This Story

```
src/client/components/pipeline/
  CoverLetterChip.tsx        ← NEW
  ActionChip.tsx             ← unchanged
  PipelineTable.tsx          ← MODIFIED (import + column definition)
  ColumnVisibilityToggle.tsx ← MODIFIED (OPTIONAL_COLUMNS entry)
  ScoreBadge.tsx             ← unchanged
```

### References

- Epic 7: `_bmad-output/planning-artifacts/epics/epic-7-post-mvp-cover-letter-generation-pipeline.md`
- Story 7.2: `_bmad-output/implementation-artifacts/7-2-n8n-webhook-callback-and-cover-letter-storage.md`
- Pattern to follow: `src/client/components/pipeline/ActionChip.tsx`
- Files to modify: `src/client/components/pipeline/PipelineTable.tsx`, `src/client/components/pipeline/ColumnVisibilityToggle.tsx`
- Architecture: `_bmad-output/planning-artifacts/architecture-distillate.md`

## Dev Agent Record

### Implementation Notes

Created `CoverLetterChip.tsx` following the `ActionChip` pattern — no `@shared/schemas` import, accepts `string | null`, returns `null` when no value. Added `cover_letter` column to `PipelineTable.tsx` inserted between `recommendation` and `requirementsMet` as specified. Registered `cover_letter` in `OPTIONAL_COLUMNS` after `notes`. TypeScript strict-mode check: 0 errors. Full test suite: 83/83 pass, 0 regressions.

### File List

- `job-hunt-dashboard/src/client/components/pipeline/CoverLetterChip.tsx` (new)
- `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx` (modified)
- `job-hunt-dashboard/src/client/components/pipeline/ColumnVisibilityToggle.tsx` (modified)

### Change Log

- 2026-04-06: Story created by SM agent — re-scoped from full drawer+chip (drawer done in 7.2) to pipeline table chip only
- 2026-04-06: Implemented by dev agent — CoverLetterChip component, coverLetterSentAt column in PipelineTable, cover_letter entry in ColumnVisibilityToggle
- 2026-04-07: Code reviewed — 0 patches, 1 new defer, 5 dismissed

### Review Findings

- [x] [Review][Defer] No `aria-label` or `title` on CoverLetterChip — "CL Sent" chip has no accessible label explaining the "CL" abbreviation; screen readers and unfamiliar users get no full-form disclosure [CoverLetterChip.tsx] — deferred, pre-existing pattern (consistent with ActionChip and existing a11y deferred items)
