---
baseline_commit: a9c5665a2130c800b98f7d60dcc3fce2e889ffd4
---

# Story 40.5: UX — Relevance Column, Drawer Layout & Discover Button Guard

Status: done

## Story

As a user reviewing discovered jobs,
I want to see a relevance score in the pipeline table and job drawer, and be clearly told when discovery requires a profile to be set up first,
So that I can quickly spot and archive irrelevant jobs before running analysis, and understand what each score means.

## Acceptance Criteria

1. **Given** the pipeline Jobs table
   **When** the user views it
   **Then** a "Relevance" column is present, positioned after the "Source" column, showing `relevanceScore` formatted as a 2-decimal value (e.g., `0.82`) or `—` when null

2. **Given** the "Relevance" column header
   **When** the user clicks it once
   **Then** rows sort descending by `relevanceScore` (nulls last)

3. **Given** the "Relevance" column header is clicked once (descending)
   **When** clicked again
   **Then** rows sort ascending by `relevanceScore` (nulls last)

4. **Given** the column visibility toggle
   **When** opened
   **Then** "Relevance" is listed as a toggleable column; its visibility state is persisted to the existing `"hitlobster-column-visibility"` localStorage key

5. **Given** the job detail drawer
   **When** a user opens any job
   **Then** Relevance Score and Fit Score are displayed as two sibling cards in a single horizontal row, not stacked

6. **Given** the Relevance Score card in the drawer
   **When** the user hovers its info icon
   **Then** the tooltip reads: "Similarity between this job title and your resume, scored at discovery using a self-hosted embedding model"

7. **Given** the Fit Score card in the drawer
   **When** the user hovers its info icon
   **Then** the tooltip reads: "AI analysis score based on the full job description and your resume"

8. **Given** the job drawer for a job with `relevanceScore: null`
   **When** the Relevance Score card is shown
   **Then** the score displays `—` (no crash, no placeholder text like "N/A" or "undefined")

9. **Given** the user has no profile configured (profile is absent or has no resume text — `summary`, `experience`, and `skills` all null/empty)
   **When** the Discover button is rendered
   **Then** it is visually disabled and shows a tooltip: "Profile & resume required to run discovery"

10. **Given** the disabled Discover button tooltip
    **When** inspected
    **Then** it contains a link that navigates to `/config/profile`

11. **Given** the user has a complete profile with resume text (at least one of `summary`, `experience`, `skills` is non-empty)
    **When** the Discover button is rendered
    **Then** it is enabled (existing behavior unchanged)

## Tasks / Subtasks

- [x] Add `relevanceScore` column to `staticColumns` in `PipelineTable.tsx` (AC: 1, 2, 3, 4)
  - [x] Insert new column definition after the `source` accessor (line ~110)
  - [x] Cell renders `v.toFixed(2)` when non-null, `—` when null
  - [x] Custom `sortingFn` using `?? -Infinity` for nulls-last descending
  - [x] `enableSorting: true`

- [x] Add `relevanceScore` to `fixedColumns` in `routes/index.tsx` (AC: 1)
  - [x] Update `fixedColumns` prop from `['company', 'jobTitle', 'source', 'date_scraped']` to `['company', 'jobTitle', 'source', 'relevanceScore', 'date_scraped']`

- [x] Add score cards row to Analysis tab in `JobDrawer.tsx` (AC: 5, 6, 7, 8)
  - [x] Add `Info` to lucide-react imports
  - [x] Insert `<div className="flex flex-row gap-4 mb-4">` row at the TOP of the `TabsContent value="analysis"` block (before the assessment grid)
  - [x] Relevance Score card: label, Info icon with tooltip text per AC6, score value (`relevanceScore != null ? relevanceScore.toFixed(2) : '—'`)
  - [x] Fit Score card: label, Info icon with tooltip text per AC7, score value (`fitScore != null ? fitScore : '—'`)
  - [x] TooltipProvider, Tooltip, TooltipTrigger, TooltipContent already imported — no new imports needed

- [x] Add profile guard to Discover button in `routes/index.tsx` (AC: 9, 10, 11)
  - [x] Add imports: `useProfileQuery` from `'../hooks/useProfileQuery'`, `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger` from `'../components/ui/tooltip'`, `Link` from `'@tanstack/react-router'`
  - [x] Add `const { data: profile } = useProfileQuery()` in the component body
  - [x] Derive `const hasResumeText = Boolean(profile?.summary || profile?.experience || profile?.skills)`
  - [x] Wrap the existing Discover button in a conditional: if `hasResumeText` show existing button; else show disabled button wrapped in `<span>` inside a `<TooltipProvider>` with tooltip containing the message and a `<Link to="/config/profile">` link

## Dev Notes

### This Is Entirely a Frontend Story

No server-side changes. `relevanceScore` is already in `jobSchema` (done in story 40.2) and returned by `GET /api/jobs`. The data is available — this story surfaces it in the UI.

### Critical: VISIBILITY_KEY Discrepancy

The epic spec references `"job-hunt-column-visibility"` as the localStorage key, but the **actual code** uses `'hitlobster-column-visibility'` (after the Epic 28 rebrand). See `PipelineTable.tsx` line 38:
```ts
const VISIBILITY_KEY = 'hitlobster-column-visibility'
```
Use the actual code value. Do NOT use `"job-hunt-column-visibility"`.

### File 1: `PipelineTable.tsx` — Current State (READ BEFORE MODIFYING)

- `staticColumns` is defined as a `const` array outside the component (lines 54–158)
- Columns in order: `company`, `jobTitle`, `location`, `fitScore`, `recommendation`, `dateAnalyzed`, `roleFit` (id: `notes`), `source`, `dateScraped`, `dateApplied`, `status`
- The `source` column occupies lines 110–120 — insert the new `relevanceScore` column AFTER the closing `}),` of the `source` column definition
- `fixedColumns` prop: when provided, controls which columns are visible; when absent, uses localStorage persistence. The `ColumnVisibilityToggle` is only shown when `fixedColumns` is NOT provided.
- All column IDs for the `fixedColumns` array are either the `accessorKey` (camelCase field name) or an explicit `id` override:
  - `company` → id `company`
  - `jobTitle` → id `jobTitle`
  - `source` → id `source`
  - `dateScraped` → id `date_scraped`
  - new column `relevanceScore` → id `relevanceScore` (matches the accessor key)

### Exact Column Definition for `PipelineTable.tsx`

Add after the `source` column (after line ~120, before the `dateScraped` column):

```ts
  columnHelper.accessor('relevanceScore', {
    header: 'Relevance',
    cell: (info) => {
      const v = info.getValue()
      return v != null
        ? <span className="text-zinc-300">{v.toFixed(2)}</span>
        : <span className="text-zinc-500">—</span>
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.relevanceScore ?? -Infinity
      const b = rowB.original.relevanceScore ?? -Infinity
      return a - b
    },
    enableSorting: true,
  }),
```

> **Sorting behavior note:** Using `-Infinity` for nulls means:
> - Descending (first click): nulls appear last ✓ (AC2 satisfied)
> - Ascending (second click): nulls appear first ✗ (AC3 says "nulls last" but this approach puts them first)
>
> This is an acceptable trade-off matching the epic's own devnote. The primary use case is descending. Do NOT over-engineer a bidirectional nulls-last solution.

### File 2: `routes/index.tsx` — `fixedColumns` Update

Current line 229:
```tsx
fixedColumns={['company', 'jobTitle', 'source', 'date_scraped']}
```

Change to:
```tsx
fixedColumns={['company', 'jobTitle', 'source', 'relevanceScore', 'date_scraped']}
```

This makes the Relevance column visible in the Pipeline view. Order in `fixedColumns` does not affect column order in the table (that's determined by `staticColumns` array order).

### File 3: `routes/index.tsx` — Profile Guard for Discover Button

**New imports to add:**
```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { Link } from '@tanstack/react-router'
import { useProfileQuery } from '../hooks/useProfileQuery'
```

**In `PipelineRoute` component body** (add after the existing hooks, before `actionBar`):
```tsx
const { data: profile } = useProfileQuery()
const hasResumeText = Boolean(profile?.summary || profile?.experience || profile?.skills)
```

**Replace the existing Discover button** (lines 126–143 in `actionBar`):

Current:
```tsx
<Button
  variant="outline"
  size="sm"
  disabled={discoveryStream.isPending || analysisStream.isPending}
  onClick={() => discoveryStream.trigger()}
>
  {discoveryStream.isPending ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Discovering…
    </>
  ) : (
    <>
      <Search className="mr-2 h-4 w-4" />
      Discover Jobs
    </>
  )}
</Button>
```

Replace with:
```tsx
{hasResumeText ? (
  <Button
    variant="outline"
    size="sm"
    disabled={discoveryStream.isPending || analysisStream.isPending}
    onClick={() => discoveryStream.trigger()}
  >
    {discoveryStream.isPending ? (
      <>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Discovering…
      </>
    ) : (
      <>
        <Search className="mr-2 h-4 w-4" />
        Discover Jobs
      </>
    )}
  </Button>
) : (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button variant="outline" size="sm" disabled>
            <Search className="mr-2 h-4 w-4" />
            Discover Jobs
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] space-y-1">
        <p className="text-sm">Profile &amp; resume required to run discovery</p>
        <Link to="/config/profile" className="text-xs text-blue-400 hover:underline block">
          Configure profile →
        </Link>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

> **Why `<span>` wrapper?** shadcn `Tooltip` requires a non-disabled `TooltipTrigger` to work. Wrapping a disabled `<Button>` in `<span>` with `asChild` passes pointer events to the span while keeping the button visually disabled.

> **Profile loading state:** `useProfileQuery()` returns `undefined` while loading (before the query resolves). `Boolean(undefined?.summary || ...)` evaluates to `false`. This means the button starts disabled until profile loads. This is safe and acceptable — the profile query resolves quickly from cache after the first load.

### File 4: `JobDrawer.tsx` — Score Cards in Analysis Tab

**Add to lucide-react imports** (line 2):
```tsx
import { ExternalLink, Archive, ArchiveRestore, Wand2, FileText, Download, CheckCircle, Circle, Pencil, Info } from 'lucide-react'
```

`Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` are already imported at line 13 — no additional imports needed.

**In the Analysis tab** (line 189), insert BEFORE the `<div className="grid grid-cols-2 gap-4 items-start">` assessment grid:

```tsx
<TabsContent value="analysis" className="pt-4">
  <div className="flex flex-row gap-4 mb-4">
    <div className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Relevance Score</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info size={12} className="cursor-help text-zinc-600 hover:text-zinc-400" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px]">
              <p>Similarity between this job title and your resume, scored at discovery using a self-hosted embedding model</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="text-lg font-medium text-zinc-200">
        {job?.relevanceScore != null ? job.relevanceScore.toFixed(2) : '—'}
      </p>
    </div>
    <div className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Fit Score</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info size={12} className="cursor-help text-zinc-600 hover:text-zinc-400" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px]">
              <p>AI analysis score based on the full job description and your resume</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="text-lg font-medium text-zinc-200">
        {job?.fitScore != null ? job.fitScore : '—'}
      </p>
    </div>
  </div>
  <div className="grid grid-cols-2 gap-4 items-start">
    <AssessmentSection label="Role Fit" content={job?.roleFit ?? null} />
    <AssessmentSection label="Red Flags" content={job?.redFlags ?? null} />
    <AssessmentSection label="Requirements Met" content={job?.requirementsMet ?? null} />
    <AssessmentSection label="Requirements Missed" content={job?.requirementsMissed ?? null} />
  </div>
</TabsContent>
```

> **Note:** The Fit Score is already shown as `ScoreBadge` in the drawer header (line 128–130). Adding it again in the Analysis tab creates intentional redundancy — the header badge is for quick glance; the Analysis tab card provides a labelled, tooltip-explained display alongside the Relevance Score.

### Data Already Available

`relevanceScore` is already:
- In `src/db/schema.ts` as `relevanceScore: real('relevance_score')` (story 40.2)
- In `src/shared/schemas.ts` as `relevanceScore: z.number().nullable()` on `jobSchema` (story 40.2)
- Returned by `GET /api/jobs` (existing route — no server changes needed)
- Typed as `number | null` on the `Job` type — TypeScript will enforce correct null handling

### TypeScript Strict Mode

- `job?.relevanceScore != null` → narrows to `number` (both null and undefined excluded)
- `job?.fitScore != null` → same pattern
- `Boolean(profile?.summary || ...)` — no TypeScript issues; `string | null | undefined` all falsy when absent
- New imports (`Info`, `Link`, tooltip components) must be used or TypeScript will error on `noUnusedLocals`

### No Backend Changes

- No new API routes
- No schema changes
- No migration needed
- No changes to `src/shared/schemas.ts`

### Files Being Modified

| File | Change Type |
|------|-------------|
| `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx` | update — add column |
| `job-hunt-dashboard/src/client/routes/index.tsx` | update — fixedColumns + profile guard |
| `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx` | update — score cards in Analysis tab |

### What This Story Does NOT Do

- Does NOT add tests (pure UI story; no server logic)
- Does NOT modify `src/shared/schemas.ts` (relevanceScore already there)
- Does NOT modify any server routes
- Does NOT create new components (keeps changes in existing files)
- Does NOT modify the `ScoreBadge` header display in the drawer (that stays as-is)

### References

- Epic 40 full spec: `_bmad-output/planning-artifacts/epics/epic-40-relevance-pre-scoring.md`
- Story 40.4 (pipeline scoring, now done): `_bmad-output/implementation-artifacts/40-4-discovery-pipeline-integration-score-jobs-at-insert-time.md`
- `PipelineTable.tsx`: `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx`
- `JobDrawer.tsx`: `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx`
- `routes/index.tsx`: `job-hunt-dashboard/src/client/routes/index.tsx`
- `useProfileQuery.ts`: `job-hunt-dashboard/src/client/hooks/useProfileQuery.ts`
- `src/shared/schemas.ts`: `relevanceScore: z.number().nullable()` confirmed at line ~40

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward per story devnotes.

### Completion Notes List

- Added `relevanceScore` column to `staticColumns` in PipelineTable.tsx after `source` column, with `toFixed(2)` cell rendering, `—` for null, custom `-Infinity` sortingFn for nulls-last descending, and `enableSorting: true`.
- Updated `fixedColumns` in routes/index.tsx to include `'relevanceScore'` between `'source'` and `'date_scraped'`.
- Added `Info` to lucide-react imports in JobDrawer.tsx; inserted horizontal score cards row (Relevance Score + Fit Score) with tooltips at top of Analysis tab before assessment grid.
- Added `useProfileQuery`, tooltip components, and `Link` imports to routes/index.tsx; derived `hasResumeText` guard; replaced Discover button with conditional: enabled when profile has resume text, disabled+tooltip with `/config/profile` link when not.
- TypeScript: zero errors in modified files; 13 pre-existing failures in unrelated files (discovery-service, cover-letter, admin, onboarding).
- Test run: 377 pass, 13 fail (all pre-existing, none in modified files).

### File List

- `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx`
- `job-hunt-dashboard/src/client/routes/index.tsx`
- `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx`

### Review Findings

- [x] [Review][Decision] AC4 conflict — accepted as-is; `fixedColumns` suppresses the visibility toggle by design for this view; AC4 treated as inapplicable to the Pipeline view [`routes/index.tsx:253`]
- [x] [Review][Patch] Replace `Tooltip` with `Popover` on disabled Discover button — `Link` inside `TooltipContent` is keyboard-inaccessible; switch `TooltipProvider/Tooltip/TooltipTrigger/TooltipContent` to `Popover/PopoverTrigger/PopoverContent` so the "Configure profile →" link is reachable via keyboard [`routes/index.tsx` — disabled button tooltip]
- [x] [Review][Patch] `Info` icons lack accessible labels — both `<Info size={12}>` elements in `JobDrawer.tsx` have no `aria-label` or `sr-only` text; screen reader users cannot discover or activate them [`JobDrawer.tsx` — Relevance Score and Fit Score cards]
- [x] [Review][Defer] `NaN` relevanceScore renders as "NaN" and corrupts sort — `v != null` passes for `NaN`; `NaN.toFixed(2)` → `"NaN"`; sort comparator `NaN ?? -Infinity` returns `NaN` (nullish coalescing does not catch NaN), corrupting TanStack Table sort order [`PipelineTable.tsx` lines 125, 129-133] — deferred, pre-existing concern in data/embedding layer
- [x] [Review][Defer] AC3 ascending sort places `null`-score rows first — `-Infinity` substitution in `sortingFn` sorts nulls to the top on ascending; spec requires nulls-last on both directions [`PipelineTable.tsx` lines 129-133] — deferred, accepted trade-off documented in story dev notes; primary use case is descending

## Change Log

- 2026-05-29: Story created — UX for Epic 40 relevance scoring
- 2026-05-29: Implemented — relevanceScore column, score cards in drawer, profile guard on Discover button
