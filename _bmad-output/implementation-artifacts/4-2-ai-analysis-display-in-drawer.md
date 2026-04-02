# Story 4.2: AI Analysis Display in Drawer

Status: done

## Story

As a user,
I want to read the AI's full assessment of a job — fit analysis, requirements, and red flags — plus the original job description and source link,
So that I have everything needed to make a triage decision without opening any other tool.

## Acceptance Criteria

1. **Given** the drawer is open for a job **When** the assessment section renders **Then** four `AssessmentSection` blocks appear in this order: `role_fit` → `requirements_met` → `requirements_missed` → `red_flags` **And** each block shows an uppercase label (`text-xs text-zinc-500 uppercase tracking-wide`) above a prose paragraph (`text-sm text-zinc-200 leading-relaxed`) **And** if a field is `null` or empty, that `AssessmentSection` renders nothing — no "N/A" placeholder

2. **Given** the job has a `job_description` **When** the description section renders **Then** only the first 300 characters are shown by default with a "Show more" toggle **And** clicking "Show more" expands to the full description; clicking "Show less" collapses it

3. **Given** the job has a `source_url` **When** the source link renders **Then** it displays as a clickable link with an external link icon that opens in a new tab

4. **Given** the full drawer content **When** viewed top to bottom **Then** the content order matches: sticky header (company/title/ScoreBadge/ActionChip) → AssessmentSection ×4 → Separator → job description (collapsible) → source URL → Separator → applied toggle → status override → status timeline **And** the drawer content scrolls independently; the header remains sticky within the drawer

## Tasks / Subtasks

- [x] Task 1: Install shadcn `separator` component (AC: 4)
  - [x] Verify `src/client/components/ui/separator.tsx` does NOT already exist (it doesn't as of this story)
  - [x] From `job-hunt-dashboard/`, run: `bunx shadcn@latest add separator`
  - [x] Verify `src/client/components/ui/separator.tsx` was generated — do NOT hand-edit it

- [x] Task 2: Create `AssessmentSection.tsx` in `src/client/components/detail/` (AC: 1)
  - [x] Props: `label: string; content: string | null`
  - [x] Return `null` (render nothing) when `!content` (handles both `null` and empty string `""`)
  - [x] Render: wrapping `<div className="space-y-1">`, label as `<p className="text-xs text-zinc-500 uppercase tracking-wide">`, content as `<p className="text-sm text-zinc-200 leading-relaxed">`
  - [x] No default export — named export only: `export function AssessmentSection`

- [x] Task 3: Update `JobDrawer.tsx` to render drawer body content (AC: 1, 2, 3, 4)
  - [x] Add `useState` and `useEffect` imports from `react`
  - [x] Add `ExternalLink` import from `lucide-react`
  - [x] Add `Separator` import from `../ui/separator`
  - [x] Add `AssessmentSection` import from `./AssessmentSection`
  - [x] Add `const [showFullDescription, setShowFullDescription] = useState(false)` inside the component
  - [x] Add `useEffect(() => { setShowFullDescription(false) }, [job?.id])` to reset state when job changes
  - [x] Replace the placeholder comment block inside `<div className="flex-1 overflow-y-auto p-4">` with the full content (see Dev Notes for exact structure)
  - [x] Add `space-y-4` to the scrollable div's className

- [x] Task 4: Verify (AC: 1–4)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests still pass (no regressions)
  - [ ] Manual: open drawer → four AssessmentSection blocks render (or fewer if some fields are null)
  - [ ] Manual: job description > 300 chars → first 300 shown with "Show more"; click → expands; "Show less" → collapses
  - [ ] Manual: job description ≤ 300 chars → no toggle shown
  - [ ] Manual: source URL present → link renders with ExternalLink icon, opens new tab
  - [ ] Manual: switch to a different row → `showFullDescription` resets (collapsed again)
  - [ ] Manual: AssessmentSection with null content → no empty block rendered

### Review Findings

- [x] [Review][Decision] Selected row re-click has no toggle behavior — resolved: toggle behavior added; re-clicking selected row now closes the drawer.
- [x] [Review][Decision] Job description section has no label/heading — resolved: "Job Description" label added using `text-xs text-zinc-500 uppercase tracking-wide` pattern.
- [x] [Review][Patch] Orphaned drawer when selected job removed after data refresh [job-hunt-dashboard/src/client/routes/index.tsx] — fixed: useEffect closes drawer when selectedJobId no longer in jobs array.
- [x] [Review][Patch] Missing SheetDescription causes Radix accessibility console warning [job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx] — fixed: added sr-only SheetDescription.
- [x] [Review][Patch] Second Separator unconditionally visible when both jobDescription and sourceUrl are absent [job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx] — fixed: second Separator now conditional on either field being present.

## Dev Notes

### New Files

- `job-hunt-dashboard/src/client/components/ui/separator.tsx` — NEW (shadcn generated — do not hand-edit)
- `job-hunt-dashboard/src/client/components/detail/AssessmentSection.tsx` — NEW

### Modified Files

- `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx` — add imports, `useState`/`useEffect`, fill drawer body

### `AssessmentSection.tsx` — Full Implementation

```tsx
interface AssessmentSectionProps {
  label: string
  content: string | null
}

export function AssessmentSection({ label, content }: AssessmentSectionProps) {
  if (!content) return null
  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-zinc-200 leading-relaxed">{content}</p>
    </div>
  )
}
```

**Why `!content` instead of `content === null`:** The spec says "if a field is `null` or empty" → render nothing. `!content` covers both `null` and `""`.

### `JobDrawer.tsx` — Full Updated Implementation

```tsx
import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { Separator } from '../ui/separator'
import type { Job } from '@shared/schemas'
import { ScoreBadge } from '../pipeline/ScoreBadge'
import { ActionChip } from '../pipeline/ActionChip'
import { AssessmentSection } from './AssessmentSection'

interface JobDrawerProps {
  job: Job | null
  open: boolean
  onClose: () => void
}

export function JobDrawer({ job, open, onClose }: JobDrawerProps) {
  const [showFullDescription, setShowFullDescription] = useState(false)

  useEffect(() => {
    setShowFullDescription(false)
  }, [job?.id])

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent
        side="right"
        className="w-[480px] max-w-none flex flex-col p-0 bg-zinc-900 border-zinc-800"
      >
        <div className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 p-4 shrink-0">
          <SheetHeader className="space-y-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">{job?.company}</p>
            <SheetTitle className="text-lg font-semibold text-zinc-100 leading-snug">
              {job?.jobTitle}
            </SheetTitle>
            <div className="flex items-center gap-2 pt-1">
              {job?.fitScore !== null && job?.fitScore !== undefined && (
                <ScoreBadge score={job.fitScore} />
              )}
              {job?.recommendation && (
                <ActionChip recommendation={job.recommendation} />
              )}
            </div>
          </SheetHeader>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AssessmentSection label="Role Fit" content={job?.roleFit ?? null} />
          <AssessmentSection label="Requirements Met" content={job?.requirementsMet ?? null} />
          <AssessmentSection label="Requirements Missed" content={job?.requirementsMissed ?? null} />
          <AssessmentSection label="Red Flags" content={job?.redFlags ?? null} />
          <Separator className="bg-zinc-800" />
          {job?.jobDescription && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-200 leading-relaxed">
                {showFullDescription
                  ? job.jobDescription
                  : job.jobDescription.slice(0, 300)}
                {!showFullDescription && job.jobDescription.length > 300 && '…'}
              </p>
              {job.jobDescription.length > 300 && (
                <button
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() => setShowFullDescription(!showFullDescription)}
                >
                  {showFullDescription ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          {job?.sourceUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
            >
              <ExternalLink size={14} />
              Source
            </a>
          )}
          <Separator className="bg-zinc-800" />
          {/* Story 4.3: Applied toggle, status override */}
          {/* Story 4.4: StatusTimeline */}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

**Why `useEffect` resetting `showFullDescription` on `job?.id` change:** When the user clicks a different row, `job` prop changes but the component stays mounted (no animation replay per AC from 4.1). Without the reset, the "Show more" expanded state persists across job switches — a stale UI state bug.

**Why `job?.roleFit ?? null` (optional chaining + nullish coalescing):** `job` is typed as `Job | null` (null during close animation). Optional chaining produces `undefined` for null job; `?? null` converts to explicit `null` which `AssessmentSection`'s `!content` guard handles correctly.

**Why two `Separator` components with `className="bg-zinc-800"`:** Shadcn Separator defaults to `bg-border` CSS variable; overriding with `bg-zinc-800` matches the existing `border-zinc-800` divider style used in the sticky header. The second separator is a placeholder divider before the 4.3/4.4 content area — keeping it now prevents layout shifts in the next story.

**Why `target="_blank" rel="noreferrer"` on source URL:** Opens in a new tab per AC3; `rel="noreferrer"` prevents the new page from accessing `window.opener` (security best practice).

**Why `ExternalLink size={14}`:** Matches `text-sm` (14px) line height so the icon aligns inline with the "Source" text.

**Why no separate component for job description collapsible:** The expand/collapse is a one-off local interaction within `JobDrawer`. No other component uses this pattern; creating a wrapper would be speculative abstraction.

### `lucide-react` Icon Availability

`lucide-react@^1.7.0` is already installed (see `package.json`). `ExternalLink` is a standard icon available in all recent versions. No additional install needed.

### `separator` Not Yet Installed

The `src/client/components/ui/separator.tsx` file does NOT exist as of this story (verified: only `button.tsx`, `alert.tsx`, `table.tsx`, `badge.tsx`, `dropdown-menu.tsx`, `skeleton.tsx`, `sheet.tsx` are present). Must be installed via Task 1 before importing.

### Content Order Compliance (AC4)

This story implements the first two content sections: **AssessmentSection ×4 → Separator → job description → source URL → Separator**. The second `Separator` remains as a permanent visual divider before the story 4.3 content (applied toggle, status override) and story 4.4 content (StatusTimeline). Placeholder comments remain for those stories.

### TypeScript Strict Mode Notes

- `job?.roleFit ?? null` — optional chaining returns `undefined` for null job; `?? null` converts to `null` satisfying `content: string | null`
- `job?.jobDescription` — truthy check correctly handles `null` and `undefined` (during close animation)
- `setShowFullDescription(!showFullDescription)` — inversion is safe; no stale closure issue since the button only renders when `job.jobDescription` is non-null

### Critical Anti-Patterns (Do NOT Do)

- ❌ Do NOT import `Job` type from anywhere except `@shared/schemas`
- ❌ Do NOT hand-edit `separator.tsx` after shadcn generates it
- ❌ Do NOT add a loading state inside the drawer
- ❌ Do NOT call `GET /api/jobs/:id` — all data is already in TanStack Query cache via `job` prop
- ❌ Do NOT add "N/A", "None", or other placeholders when AssessmentSection content is null — render nothing
- ❌ Do NOT use `useState` to track both `showFullDescription` AND a separate `expanded` boolean — one boolean suffices
- ❌ Do NOT use `isLoading` (deprecated in TanStack Query v5) — not relevant here but noted for consistency
- ❌ Do NOT add `noopener` without `noreferrer` — `noreferrer` implies `noopener` in modern browsers

### Previous Story Learnings (From 4.1)

- **`bun` not in PATH** — always use `/home/zac/.bun/bin/bun` for CLI commands (e.g., `/home/zac/.bun/bin/bun run --bun tsc --noEmit`)
- **TypeScript strict mode** — `noUnusedLocals`/`noUnusedParameters` are compile errors; remove any unused imports immediately
- **shadcn/ui files in `components/ui/` are generated** — only extend via `className` prop, never edit source
- **Template-literal className on `PipelineTable` rows** — pre-existing pattern; do not convert to `cn()` without a dedicated cleanup story
- **`p-0` on `SheetContent`** — overrides shadcn's default `p-6` padding; the sticky header and scrollable content control their own padding explicitly

### Project Structure After This Story

```
src/client/
  components/
    detail/
      JobDrawer.tsx         ← MODIFIED (add imports, useState/useEffect, fill drawer body)
      AssessmentSection.tsx ← NEW
    ui/
      separator.tsx         ← NEW (shadcn generated — do not hand-edit)
```

### Out-of-Scope (Do NOT Implement)

- ❌ Applied toggle (`Switch`) — Story 4.3
- ❌ Status override (`Select`) — Story 4.3
- ❌ `PATCH /api/jobs/:id` endpoint — Story 4.3
- ❌ `useJobMutation` hook — Story 4.3
- ❌ `StatusTimeline` component — Story 4.4
- ❌ `status_events` table/migration — Story 4.4

### References

- Epic 4 Story 4.2 AC [Source: `_bmad-output/planning-artifacts/epics/epic-4-job-detail-decision-the-triage-moment.md`]
- AssessmentSection component spec [Source: `_bmad-output/planning-artifacts/ux-design-specification/component-strategy.md#AssessmentSection`]
- Drawer content order [Source: `_bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md#Drawer Patterns`]
- Architecture: no loading state in drawer, data pre-cached [Source: `_bmad-output/planning-artifacts/architecture-distillate.md#Frontend Architecture`]
- Previous story learnings [Source: `_bmad-output/implementation-artifacts/4-1-job-detail-drawer-shell-and-row-click.md#Dev Notes`]
- Project context: TypeScript strict, hook conventions, no unused locals [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Installed `separator` shadcn component via `bunx shadcn@latest add separator` — generated `src/client/components/ui/separator.tsx` without hand-editing
- Created `AssessmentSection.tsx` with named export, `!content` null guard, and exact label/prose className spec
- Updated `JobDrawer.tsx`: added `useState`/`useEffect`/`ExternalLink`/`Separator`/`AssessmentSection` imports; `showFullDescription` state with `useEffect` reset on `job?.id` change; replaced placeholder comment block with 4 AssessmentSection blocks, collapsible description (300-char truncation), source URL link, and two Separators
- TypeScript: `bun run --bun tsc --noEmit` → zero errors
- Tests: `bun test` → 28 pass, 0 fail (no regressions)

### File List

- `job-hunt-dashboard/src/client/components/ui/separator.tsx` (new — shadcn generated)
- `job-hunt-dashboard/src/client/components/detail/AssessmentSection.tsx` (new)
- `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx` (modified)

## Change Log

- 2026-04-02: Story created by SM agent (create-story workflow)
- 2026-04-02: Implemented by dev agent — separator installed, AssessmentSection created, JobDrawer body filled with assessment blocks, collapsible description, source link, and separators; TypeScript clean, 28 tests pass
