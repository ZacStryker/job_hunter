# Story 5.2: Visual Row Aging (`AgingRow`)

Status: done

## Story

As a user,
I want applied rows to visually fade over time based on how long ago I applied,
so that I can feel the passage of time and naturally deprioritize stale applications without needing an explicit "ghosted" label.

## Acceptance Criteria

1. **Given** a job with `date_applied` set 0–7 days ago
   **When** its row renders in the Tracker table
   **Then** the row renders at full opacity (`opacity: 1.0`)

2. **Given** a job with `date_applied` set 8–14 days ago
   **When** its row renders
   **Then** the row renders at `opacity: 0.75`

3. **Given** a job with `date_applied` set 15–21 days ago
   **When** its row renders
   **Then** the row renders at `opacity: 0.55`

4. **Given** a job with `date_applied` set 22+ days ago
   **When** its row renders
   **Then** the row renders at `opacity: 0.35`

5. **Given** any row in the Tracker table
   **When** the user hovers over it
   **Then** a shadcn `Tooltip` appears showing "Applied N days ago" regardless of the row's current opacity level

6. **Given** a job where `date_applied` is `null`
   **When** its row renders
   **Then** `AgingRow` renders at full opacity — no decay applied

7. **Given** a user with `prefers-reduced-motion` enabled
   **When** `AgingRow` applies opacity
   **Then** only CSS `opacity` is used (not animation or transition) — the preference is respected automatically

## Tasks / Subtasks

- [x] Task 1: Install shadcn Tooltip component (AC: 5)
  - [x] Run `/home/zac/.bun/bin/bun x shadcn@latest add tooltip` from `job-hunt-dashboard/` directory
  - [x] Verify `src/client/components/ui/tooltip.tsx` was generated

- [x] Task 2: Create `src/client/components/tracker/AgingRow.tsx` (AC: 1–7)
  - [x] Export pure functions `computeOpacity(dateApplied: string | null): number` and `computeDaysAgo(dateApplied: string): number` — these are testable without rendering
  - [x] `computeDaysAgo`: `Math.floor((Date.now() - new Date(dateApplied + 'T00:00:00').getTime()) / 86400000)`
  - [x] `computeOpacity`: if null → 1.0; else compute days via `computeDaysAgo`; threshold: ≤7 → 1.0, ≤14 → 0.75, ≤21 → 0.55, else 0.35
  - [x] `AgingRow` props: `dateApplied: string | null`, `isSelected: boolean`, `onClick: () => void`, `children: React.ReactNode`
  - [x] Apply opacity via `style={{ opacity: computeOpacity(dateApplied) }}` on the `TableRow` — NOT via Tailwind class (dynamic fractional values not reliably supported without safelisting)
  - [x] `TableRow` receives same class logic as before: `border-zinc-800 cursor-pointer` + selected: `bg-zinc-800` / hover: `hover:bg-zinc-800/50`
  - [x] Wrap `TableRow` with `<Tooltip>` / `<TooltipTrigger asChild>` / `<TooltipContent>`
  - [x] Tooltip content: `"Applied N days ago"` where N = `computeDaysAgo(dateApplied ?? '')` — show even when `dateApplied` is null (show "Applied 0 days ago" or skip tooltip per AC 5: tooltip shows "regardless of opacity level"; since AC 6 covers null → full opacity, tooltip for null rows is acceptable to show "Applied 0 days ago" but AC 5 says "any row"; keep it simple — always render the tooltip)
  - [x] Do NOT add CSS `transition` or `animation` to opacity — plain `style` property only (AC: 7)

- [x] Task 3: Update `src/client/components/tracker/TrackerTable.tsx` to use `AgingRow` (AC: 1–7)
  - [x] Add `TooltipProvider` from `../ui/tooltip` wrapping the entire `<table>` (so all row tooltips share one provider)
  - [x] Replace each bare `<TableRow ...>` + `<TableCell ...>` block with `<AgingRow dateApplied={job.dateApplied} isSelected={job.id === selectedJobId} onClick={() => onRowClick(job)}>`
  - [x] Move `<TableCell>` elements inside `<AgingRow>` as children
  - [x] Remove inline `className` and `onClick` from `TableRow` (now handled by `AgingRow`)
  - [x] Import `AgingRow` from `./AgingRow`

- [x] Task 4: Write unit tests `src/client/components/tracker/AgingRow.test.tsx` (AC: 1–6)
  - [x] Import `computeOpacity` and `computeDaysAgo` from `./AgingRow`
  - [x] Use `bun:test` imports: `import { describe, test, expect, beforeAll, afterAll } from 'bun:test'`
  - [x] Freeze `Date.now` via a spy to control "today" — e.g., `const RealDate = Date; beforeAll(() => { Date.now = () => fixedTimestamp }); afterAll(() => { Date.now = RealDate.now })`
  - [x] Test `computeOpacity`:
    - null dateApplied → 1.0
    - 0 days ago → 1.0
    - 7 days ago → 1.0
    - 8 days ago → 0.75
    - 14 days ago → 0.75
    - 15 days ago → 0.55
    - 21 days ago → 0.55
    - 22 days ago → 0.35
    - 60 days ago → 0.35
  - [x] Test `computeDaysAgo`: spot-check a known date offset

- [x] Task 5: Verify (AC: all)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests pass + new `AgingRow.test.tsx` tests pass (53 total across 6 files: 43 server + 10 AgingRow)
  - [ ] Manual: navigate to `/tracker` — verify applied rows show correct opacity based on their `date_applied`
  - [ ] Manual: hover a row — verify tooltip shows "Applied N days ago"
  - [ ] Manual: null `date_applied` row — renders at full opacity with tooltip showing "Applied 0 days ago"

## Dev Notes

### Critical Date Parsing Rule

`date_applied` is stored as a date-only ISO string (e.g., `"2026-03-27"`). Parsing it bare treats it as UTC midnight, which renders the previous day in negative-offset timezones. **Always append `'T00:00:00'`** to force local-time parsing:

```ts
new Date(dateApplied + 'T00:00:00').getTime()
```

This pattern was established in Story 5.1 (`TrackerTable.tsx:21`) and `AppliedToggle.tsx:18`. **Do not deviate.**

---

### `AgingRow` — Full Implementation Reference

```tsx
import { TableRow } from '../ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { ReactNode } from 'react'

export function computeDaysAgo(dateApplied: string): number {
  return Math.floor((Date.now() - new Date(dateApplied + 'T00:00:00').getTime()) / 86400000)
}

export function computeOpacity(dateApplied: string | null): number {
  if (!dateApplied) return 1.0
  const days = computeDaysAgo(dateApplied)
  if (days <= 7) return 1.0
  if (days <= 14) return 0.75
  if (days <= 21) return 0.55
  return 0.35
}

interface AgingRowProps {
  dateApplied: string | null
  isSelected: boolean
  onClick: () => void
  children: ReactNode
}

export function AgingRow({ dateApplied, isSelected, onClick, children }: AgingRowProps) {
  const days = dateApplied ? computeDaysAgo(dateApplied) : 0
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TableRow
          onClick={onClick}
          style={{ opacity: computeOpacity(dateApplied) }}
          className={`border-zinc-800 cursor-pointer ${
            isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
          }`}
        >
          {children}
        </TableRow>
      </TooltipTrigger>
      <TooltipContent>
        <p>Applied {days} days ago</p>
      </TooltipContent>
    </Tooltip>
  )
}
```

---

### `TrackerTable.tsx` — Updated `TableBody` Section

```tsx
import { TooltipProvider } from '../ui/tooltip'
import { AgingRow } from './AgingRow'

// Inside return (replacing the existing TableBody block):
<TooltipProvider>
  <table className="w-full caption-bottom text-sm">
    {/* ... TableHeader unchanged ... */}
    <TableBody>
      {appliedJobs.map((job) => (
        <AgingRow
          key={job.id}
          dateApplied={job.dateApplied}
          isSelected={job.id === selectedJobId}
          onClick={() => onRowClick(job)}
        >
          <TableCell className="py-1.5 px-3 text-sm text-zinc-200">{job.company}</TableCell>
          <TableCell className="py-1.5 px-3 text-sm text-zinc-200">{job.jobTitle}</TableCell>
          <TableCell className="py-1.5 px-3 text-sm text-zinc-200">
            {job.statusOverride ?? job.status ?? '—'}
          </TableCell>
          <TableCell className="py-1.5 px-3 text-sm text-zinc-200">
            {job.dateApplied ? formatDate(job.dateApplied) : '—'}
          </TableCell>
        </AgingRow>
      ))}
    </TableBody>
  </table>
</TooltipProvider>
```

Note: `key` prop moves from `<TableRow>` to `<AgingRow>` — React reconciles on the outermost returned element.

---

### Installing shadcn Tooltip

Run from `job-hunt-dashboard/` directory:
```
/home/zac/.bun/bin/bun x shadcn@latest add tooltip
```

This generates `src/client/components/ui/tooltip.tsx`. **Do not hand-edit it** — use the exported primitives as-is.

Exports you need: `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`

---

### `prefers-reduced-motion` Compliance (AC: 7)

Using `style={{ opacity: value }}` (static inline style) **never** adds a CSS `transition`. This automatically respects `prefers-reduced-motion` — there is no animation to suppress. Do NOT add any CSS like `transition: opacity 200ms` or Tailwind's `transition-opacity`.

---

### Unit Testing `computeOpacity` and `computeDaysAgo`

The pure functions are exported from `AgingRow.tsx` specifically to enable lightweight unit tests. Freeze `Date.now` to control relative time:

```tsx
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { computeOpacity, computeDaysAgo } from './AgingRow'

const BASE_DATE = new Date('2026-04-10T12:00:00').getTime()
const originalNow = Date.now
beforeAll(() => { Date.now = () => BASE_DATE })
afterAll(() => { Date.now = originalNow })

function daysAgo(n: number): string {
  return new Date(BASE_DATE - n * 86400000).toISOString().split('T')[0]
}

describe('computeOpacity', () => {
  test('null → 1.0', () => expect(computeOpacity(null)).toBe(1.0))
  test('0 days → 1.0', () => expect(computeOpacity(daysAgo(0))).toBe(1.0))
  test('7 days → 1.0', () => expect(computeOpacity(daysAgo(7))).toBe(1.0))
  test('8 days → 0.75', () => expect(computeOpacity(daysAgo(8))).toBe(0.75))
  test('14 days → 0.75', () => expect(computeOpacity(daysAgo(14))).toBe(0.75))
  test('15 days → 0.55', () => expect(computeOpacity(daysAgo(15))).toBe(0.55))
  test('21 days → 0.55', () => expect(computeOpacity(daysAgo(21))).toBe(0.55))
  test('22 days → 0.35', () => expect(computeOpacity(daysAgo(22))).toBe(0.35))
  test('60 days → 0.35', () => expect(computeOpacity(daysAgo(60))).toBe(0.35))
})

describe('computeDaysAgo', () => {
  test('7 days ago', () => expect(computeDaysAgo(daysAgo(7))).toBe(7))
})
```

Note: `daysAgo(n)` computes the ISO date string as `YYYY-MM-DD`. However since `BASE_DATE` is at noon UTC, subtracting `n * 86400000` ms and then splitting on `'T'` gives the correct date string. The test helper mirrors the real-world production input shape.

---

### Critical Anti-Patterns

- ❌ Do NOT add `transition` or `animation` CSS to the row — opacity must be static, not animated
- ❌ Do NOT use Tailwind opacity classes like `opacity-75` — dynamic class names aren't in the Tailwind safelist; use inline `style={{ opacity }}`
- ❌ Do NOT place `TooltipProvider` inside `AgingRow` — one provider per table is correct; `AgingRow` uses `Tooltip/TooltipTrigger/TooltipContent` only
- ❌ Do NOT parse `dateApplied` without appending `'T00:00:00'` — UTC midnight parsing breaks in negative-offset timezones
- ❌ Do NOT put `AgingRow` anywhere except `components/tracker/` — it's a Tracker-specific component
- ❌ Do NOT add a new API call, new query key, or new mutation — this is entirely client-side rendering logic
- ❌ Do NOT import `Job` from anywhere except `@shared/schemas`

---

### Architecture Compliance Checkpoints

- **No new API endpoint** — pure client-side opacity calculation
- **No new query keys** — no new TanStack Query usage
- **Component folder** — `components/tracker/AgingRow.tsx` per architecture spec
- **shadcn/ui** — Tooltip added via CLI; `components/ui/tooltip.tsx` generated, not hand-edited
- **Type imports** — `Job` from `@shared/schemas` only (no `Job` import needed in `AgingRow.tsx` directly — it only takes `string | null` and `ReactNode`)
- **Test co-location** — `AgingRow.test.tsx` lives next to `AgingRow.tsx`

---

### New File Structure After This Story

```
src/
  client/
    components/
      tracker/
        TrackerTable.tsx               ← MODIFIED (add TooltipProvider, use AgingRow)
        AgingRow.tsx                   ← NEW
        AgingRow.test.tsx              ← NEW
      ui/
        tooltip.tsx                    ← NEW (shadcn generated)
```

---

### Previous Story Learnings (from Story 5.1)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **TypeScript strict mode** — `noUnusedLocals`/`noUnusedParameters` are compile errors; no unused imports or parameters
- **shadcn/ui files in `components/ui/`** — do not hand-edit; extend via className only
- **`dateApplied + 'T00:00:00'`** — critical timezone fix; all date parsing must use this pattern
- **`bun x` for shadcn** — use `/home/zac/.bun/bin/bun x shadcn@latest add <component>` not `npx` or `bunx`

---

### References

- Epic 5 Story 5.2 AC: `_bmad-output/planning-artifacts/epics/epic-5-tracker-view-monitoring-applied-applications.md`
- Architecture aging spec: `_bmad-output/planning-artifacts/architecture-distillate.md` (Frontend Architecture: "Visual aging (AgingRow)" section)
- UX novel pattern description: `_bmad-output/planning-artifacts/ux-design-specification/core-experience-deep-dive.md` ("Pattern 2 — Visual aging as passive state")
- Existing TrackerTable to modify: `job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx`
- Date parsing pattern reference: `job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx:16-22`
- shadcn component folder: `job-hunt-dashboard/src/client/components/ui/`
- Architecture constraints: `_bmad-output/planning-artifacts/architecture-distillate.md`
- Project rules: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Verified `bun test` (no args) discovers AgingRow.test.tsx — its 10 tests ARE included in the 53-pass / 6-file output; the file runs silently (no console output unlike server tests that log errors)
- Confirmed by: `bun test src/server/` → 43 tests / 5 files; `bun test src/client/` → 10 tests / 1 file; total = 53 / 6 ✓

### Completion Notes List

- Installed shadcn tooltip via `bun x shadcn@latest add tooltip` → generated `src/client/components/ui/tooltip.tsx`
- Created `AgingRow.tsx` with exported pure functions `computeOpacity` and `computeDaysAgo` for testability
- Applied `prefers-reduced-motion` compliance via static inline `style={{ opacity }}` — no CSS transition added
- Updated `TrackerTable.tsx`: wrapped `<table>` in `<TooltipProvider>`, replaced `<TableRow>` blocks with `<AgingRow>` components
- Added 10 unit tests covering all opacity thresholds and the `computeDaysAgo` spot-check using frozen `Date.now`
- All 53 tests pass (0 failures); TypeScript strict mode check clean

### File List

- `job-hunt-dashboard/src/client/components/ui/tooltip.tsx` (new — shadcn generated)
- `job-hunt-dashboard/src/client/components/tracker/AgingRow.tsx` (new)
- `job-hunt-dashboard/src/client/components/tracker/AgingRow.test.tsx` (new)
- `job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx` (modified)

### Review Findings

- [x] [Review][Defer] Tooltip `animate-in`/`animate-out` on `TooltipContent` ignores `prefers-reduced-motion` [tooltip.tsx] — deferred, shadcn-generated per spec constraint; can't hand-edit
- [x] [Review][Defer] `aria-describedby` injected by Radix `TooltipTrigger asChild` onto `<tr>` (ARIA role `row`) [AgingRow.tsx:29] — deferred, specified approach in story; address in future accessibility pass
- [x] [Review][Defer] `computeDaysAgo` midnight boundary edge case [AgingRow.tsx:6] — deferred, established local-time pattern; benign in practice
- [x] [Review][Defer] Tooltip portal may clip or mismatch z-index if scroll container gets `overflow: hidden` [AgingRow.tsx:28] — deferred, Radix portals to body; low risk

## Change Log

- 2026-04-04: Story created by SM agent (create-story workflow)
- 2026-04-04: Implemented by dev agent (claude-sonnet-4-6) — AgingRow component, tooltip integration, unit tests
