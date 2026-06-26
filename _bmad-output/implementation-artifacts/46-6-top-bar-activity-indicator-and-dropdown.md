---
baseline_commit: 10c9e8c8a33073251edf5f6ba0357c0986702b21
---

# Story 46.6: Top-Bar Activity Indicator & Dropdown

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user anywhere in the app,
I want an Activity control in the top bar that animates while work runs and opens a panel of live runs,
so that I can monitor Discovery / Analysis / Cover Letter / Resume progress without returning to the page that started it.

## Acceptance Criteria

1. **Control present in the top bar** — An "Activity" control (waveform/pulse glyph) renders in the header of `src/client/components/shared/Layout.tsx`, positioned **to the left of the existing logout button** (i.e. inside the right-hand cluster, before the `<LogOut>` button). It matches the existing header styling: zinc-900 header, `text-zinc-500 hover:text-zinc-200 transition-colors`, `h-5 w-5` icon, `shrink-0`. It is a real button with `aria-label="Activity"` and `title` (mirror the logout button's a11y pattern, `Layout.tsx:108-116`).

2. **Idle state — plain static icon** — When `isActive` is `false` (no run with `state === 'running'`), the control shows a plain, non-animated icon (no spinner ring, no pulse).

3. **Active state — animated** — When `isActive` is `true` (≥1 running run), the icon gains an animated indicator (Plex pattern: a `Loader2` spinner ring overlaid/adjacent, or a Tailwind `animate-pulse`/`animate-spin` treatment). It returns to the plain idle state automatically once nothing is running. Driven **only** by `useActivityStream().isActive` — no local timers, no derived state copy.

4. **Click opens a dark, low-chrome dropdown panel** — Clicking the control opens a panel anchored under the icon. Use the existing shadcn **`Popover`** primitive (`src/client/components/ui/popover.tsx`) — its `PopoverContent` is already the dark `zinc-900` / `border-zinc-800` low-chrome panel this AC wants. Anchor it under the icon with `align="end"` so it doesn't overflow the right edge.

5. **One row per active run with workflow-specific status line** — Each active run renders as a row showing a workflow-name title and a status line, keyed by `run.type`:
   - `discovery` → title "Discovery", status `"{count} jobs discovered so far"`
   - `analysis` → title "Analysis", status `"{count} jobs analyzed so far"`
   - `cover_letter` → title "Cover Letter", status `"Generating cover letter — {company} · {role}"`
   - `resume` → title "Resume", status `"Generating resume — {company} · {role}"`
   Rows are keyed by `run.id`. Multiple concurrent runs each render as their own row.

6. **Running row shows a spinner on its right edge** — A row whose `state === 'running'` renders a small circular spinner (`Loader2` with `animate-spin`) on its right edge.

7. **Finalized rows reflect completion, then drop out** — When a run's `state` becomes `done` it shows a clear success affordance (e.g. `CheckCircle2`, green) and when `failed` a clear failed affordance (e.g. `XCircle`, red) in place of the spinner. The row then disappears on its own when the run leaves `runs` (the server prunes it after its retention window and re-emits; the hook replaces the list — the component does **nothing** to remove it). The component must **not** filter out non-running runs; it renders every run in `runs` so the brief done/failed state is visible.

8. **Persistent Logs footer** — The panel has a footer row that is **always present, even when `runs` is empty**, implemented as a TanStack Router `<Link to="/config/logs">`. Clicking it navigates to the Logs page **and closes the popover**. (Wire the popover `open` state with `useState` so the Link's `onClick` — or the Popover's `onOpenChange` — can set it closed on navigate.)

9. **Empty state** — When `runs` is empty, the panel body shows a brief muted "No active workflows" line (zinc-500) above the persistent footer — it must still open and still show the Logs link.

10. **Single push-driven data source** — The panel and indicator read **exclusively** from one `useActivityStream()` call (placed in the new Activity component, not in `Layout`). No page-local state, no second `fetch`, no polling, no TanStack Query for this data. Activity shown is app/session-wide regardless of the current route.

## Tasks / Subtasks

- [x] **Task 1 — Create the Activity component `src/client/components/shared/ActivityIndicator.tsx`** (AC: 1–10)
  - [x] New file; component name `ActivityIndicator` (PascalCase per project rule). It owns the `useActivityStream()` call and the popover open state — `Layout` just renders `<ActivityIndicator />`.
  - [x] Imports: `import { useState } from 'react'`; `import { Link } from '@tanstack/react-router'`; `import { Activity, Loader2, CheckCircle2, XCircle } from 'lucide-react'` (all four verified present in `lucide-react@^1.7.0`); `import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'`; `import { useActivityStream } from '@/hooks/useActivityStream'`; `import type { ActivityRun } from '@shared/schemas'`; `import { cn } from '@/lib/utils'`.
  - [x] **Export a pure status-line helper (AC5) for unit-testability** — the project has no DOM/React test harness, so the testable logic must be a pure exported function (mirror `AgingRow.tsx`'s `computeOpacity`/`computeDaysAgo` precedent):
        ```ts
        export function runTitle(type: ActivityRun['type']): string {
          switch (type) {
            case 'discovery': return 'Discovery'
            case 'analysis': return 'Analysis'
            case 'cover_letter': return 'Cover Letter'
            case 'resume': return 'Resume'
          }
        }
        export function runStatusLine(run: ActivityRun): string {
          switch (run.type) {
            case 'discovery': return `${'count' in run.progress ? run.progress.count : 0} jobs discovered so far`
            case 'analysis': return `${'count' in run.progress ? run.progress.count : 0} jobs analyzed so far`
            case 'cover_letter': return `Generating cover letter — ${'company' in run.progress ? `${run.progress.company} · ${run.progress.role}` : ''}`
            case 'resume': return `Generating resume — ${'company' in run.progress ? `${run.progress.company} · ${run.progress.role}` : ''}`
          }
        }
        ```
        Note: `activityProgressSchema` is a **non-discriminated union** of `{ count, total }` and `{ company, role }` (`schemas.ts:135-143`) — narrow with `'count' in run.progress` / `'company' in run.progress`, NOT by asserting a discriminant field that doesn't exist. The `runTitle` switch is exhaustive over the enum so TS strict is satisfied without a `default`.
  - [x] Component body:
    - [x] `const { runs, isActive } = useActivityStream()` and `const [open, setOpen] = useState(false)`.
    - [x] `<Popover open={open} onOpenChange={setOpen}>` wrapping a `<PopoverTrigger asChild>` button and `<PopoverContent align="end">`.
    - [x] Trigger button: matches AC1 styling. Render the `Activity` icon; when `isActive`, overlay/adjacent animated affordance (e.g. `<Loader2 className="h-5 w-5 animate-spin" />` swapped in, or wrap `Activity` with `animate-pulse`). Keep it `relative` if overlaying. `aria-label="Activity"`, `title="Activity"`, `type="button"`, `shrink-0`.
    - [x] `PopoverContent`: list `runs.map((run) => <row keyed by run.id>)`. Each row: title (`runTitle(run.type)`, zinc-100 text-sm font-medium) + status line (`runStatusLine(run)`, zinc-400 text-xs) on the left; on the right edge a status glyph by `run.state`: `running` → `<Loader2 className="h-4 w-4 animate-spin text-zinc-400" />`, `done` → `<CheckCircle2 className="h-4 w-4 text-green-500" />`, `failed` → `<XCircle className="h-4 w-4 text-red-500" />`.
    - [x] Empty body: when `runs.length === 0`, render a muted `text-zinc-500 text-sm` "No active workflows" line (AC9).
    - [x] Footer (AC8): a separator (`border-t border-zinc-800`) then `<Link to="/config/logs" onClick={() => setOpen(false)} className="...zinc-400 hover:text-zinc-200...">View all in Logs →</Link>`. Always rendered, independent of `runs.length`.
  - [x] No comments unless non-obvious; no speculative props; component takes no args.

- [x] **Task 2 — Mount the control in `Layout.tsx`** (AC: 1)
  - [x] `import { ActivityIndicator } from '@/components/shared/ActivityIndicator'`.
  - [x] In the right-hand cluster, render `<ActivityIndicator />` immediately **before** the existing logout `<button>` (`Layout.tsx:108-116`). The header is a flex row (`Layout.tsx:30`); the logout button is the last child with `shrink-0`, so insert the indicator just before it. Do not restructure the header, the nav, or the impersonation/main layout.
  - [x] No other edits to `Layout.tsx`.

- [x] **Task 3 — Co-located unit tests `src/client/components/shared/ActivityIndicator.test.ts`** (AC: 5)
  - [x] `bun:test` only: `import { describe, test, expect } from 'bun:test'`; `import { runTitle, runStatusLine } from './ActivityIndicator'`. Mirror `AgingRow.test.tsx` — test **exported pure functions only**, never render the component (no DOM harness exists in this repo; do NOT add one — see Dev Notes "Testing reality").
  - [x] `runTitle` cases: each of the four types → its exact title string.
  - [x] `runStatusLine` cases (build fixtures inline against `activityRunSchema`'s shape):
        (a) discovery `progress: { count: 7, total: 40 }` → `"7 jobs discovered so far"`;
        (b) analysis `progress: { count: 3, total: 10 }` → `"3 jobs analyzed so far"`;
        (c) cover_letter `progress: { company: 'Acme', role: 'SWE' }` → `"Generating cover letter — Acme · SWE"`;
        (d) resume `progress: { company: 'Globex', role: 'PM' }` → `"Generating resume — Globex · PM"`.
  - [x] Fixtures: full `ActivityRun` objects (`id`, `type`, `state`, `startedAt`/`updatedAt` ISO strings, `progress`). Import nothing from server code.

- [x] **Task 4 — Validate** (AC: 1–10)
  - [x] `bun test src/client/components/shared/ActivityIndicator.test.ts` → all green (8 pass / 0 fail).
  - [x] `bunx tsc --noEmit` → zero **new** errors attributable to `ActivityIndicator.tsx` / its test / the `Layout.tsx` edit. Total error count = 88 (pre-existing baseline, unchanged); full suite 465 pass / 40 pre-existing env-dependent fails (was 457 pass before this story's +8 tests; zero new fails).
  - [ ] Manually confirm in `bun run dev`: idle icon static; trigger a run (e.g. Discovery) → icon animates and a row appears with live count from any route; on completion the row shows done/failed then drops out ~5s later; the Logs footer link navigates and closes the panel. (No automated DOM test — this is the one path the pures can't cover.)

### Review Findings

_Code review 2026-06-26 (Blind Hunter / Edge Case Hunter / Acceptance Auditor). All 10 ACs MET, 0 project-rule violations, 0 decision-needed, 0 patches. 2 deferred (out of AC scope), 9 dismissed as noise/false-positive._

- [x] [Review][Defer] No `aria-live`/`role="status"` on the live-updating runs list `[ActivityIndicator.tsx:55-65]` — deferred, out of AC scope (low). SSE-driven row changes are silent to assistive tech while the popover is open; no AC requests it and no aria-live precedent exists in the repo.
- [x] [Review][Defer] No `max-height`/scroll on `PopoverContent` for pathologically many concurrent runs `[ActivityIndicator.tsx:51,55]` — deferred, out of AC scope (low). A large batch of simultaneous runs renders an unbounded `<ul>` in a fixed `w-72` panel with no overflow handling; unlikely in practice, trivial future fix (`max-h-* overflow-y-auto`).

## Dev Notes

### Scope & boundaries
- **This is the final story of Epic 46** and the only one that touches the UI. Everything it consumes is already `done`: the registry (46.1), SSE endpoint (46.2), the four workflow wirings (46.3/46.4), and the `useActivityStream` hook (46.5).
- **Net-new file:** `src/client/components/shared/ActivityIndicator.tsx` (+ its `.test.ts`). **One edit:** `Layout.tsx` (mount the component before logout). No server changes, no new deps, no migrations, no route additions (`/config/logs` already exists — `router.ts:322`, `routes/config/logs.tsx`).
- **Do NOT** modify `useActivityStream.ts`, the schema, the SSE endpoint, or the registry. **Do NOT** add a DOM test library. **Do NOT** introduce TanStack Query/`fetch`/polling for this data — the hook is the sole source (AC10).

### The hook contract you consume (already built — 46.5 `done`)
- `useActivityStream()` returns `{ runs: ActivityRun[]; isActive: boolean }` (`src/client/hooks/useActivityStream.ts:22-63`). `runs` is the live, push-driven, schema-validated array; `isActive` is `true` iff any run is `running`. It opens its own `EventSource`, replaces the list wholesale on every event, reconnects with backoff, and cleans up on unmount. You just render it.
- **Call it exactly once**, in `ActivityIndicator` (not in `Layout`, and not twice) — each call opens a separate `EventSource`. One mounted `ActivityIndicator` = one connection, which is correct.
- **Pruning is automatic and is the component's "remove" mechanism (AC7).** A finalized run lingers `done`/`failed` in `runs` for the registry's `RETENTION_MS` (5 s, `activity-registry.ts`), then the server re-emits the snapshot with it **absent** and the hook drops it from `runs`. So: render every run in `runs`; never filter by state; never remove rows yourself. The list shrinking is what makes rows disappear.

### The data shape (from `@shared/schemas`, 46.1 — read-only)
- `activityRunSchema` (`schemas.ts:144-151`): `{ id: string, type, state, startedAt: string, updatedAt: string, progress }`.
- `type ∈ 'discovery' | 'analysis' | 'cover_letter' | 'resume'`; `state ∈ 'running' | 'done' | 'failed'` (`schemas.ts:133-134`).
- `progress` is a **non-discriminated** `z.union` (`schemas.ts:135-143`):
  - count-progress `{ count: number, total: number | null }` → discovery & analysis
  - doc-progress `{ company: string, role: string }` → cover_letter & resume
  - **Narrow with the `in` operator** (`'count' in run.progress` / `'company' in run.progress`) — there is **no** discriminant field, so a `z.discriminatedUnion`/switch-on-tag approach will not type-check. `total` is nullable; the status lines only use `count`, so you don't render `total`.
- Import `ActivityRun` (the inferred type) via `@shared/schemas`; never redefine it inline (project rule: cross-boundary types only from `src/shared/schemas.ts`).

### Why a pure status-line helper + why test only that (Testing reality — READ THIS)
- **This repo has no React/DOM test environment** — no `happy-dom`/`jsdom`/`@testing-library`/`react-test-renderer` in `package.json`. The only client tests (`AgingRow.test.tsx`, `useActivityStream.test.ts`) import and assert **exported pure functions** and never render React. Follow that precedent exactly.
- Therefore the per-type title/status mapping (the only branching logic with multiple outcomes) is extracted into exported pure functions `runTitle` / `runStatusLine` and unit-tested. The JSX wiring (popover, icon swap, footer link) is verified manually in `bun run dev` (Task 4) — **do not** add a test lib to render it; that's a speculative abstraction the project rules forbid and is out of scope.
- `bun:test` only (`describe`/`test`/`expect`), co-located beside the component, no `__tests__/`.

### UI building blocks already in the repo (reuse — don't reinvent)
- **Popover** (`src/client/components/ui/popover.tsx`): `PopoverContent` is already `z-50 w-72 rounded-md border border-zinc-800 bg-zinc-900 p-3 text-zinc-200 shadow-md` with open/close animations — this **is** the "dark low-chrome panel" the AC asks for. Use `<PopoverTrigger asChild>` to make your styled `<button>` the trigger. Use `align="end"` on `PopoverContent` so it anchors under the right-aligned icon without clipping. Controlled mode (`open`/`onOpenChange`) is needed so the Logs `<Link>` can close it on navigate (AC8). (Note: `dropdown-menu.tsx` also exists, but Popover is the better fit for a custom row list + persistent footer; `DropdownMenuItem` adds keyboard/role semantics you'd have to fight for the Link footer.)
- **Header pattern** (`Layout.tsx:30,107-116`): header is `h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4`; the logout button is `shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors` with `<LogOut className="h-5 w-5" />`, `aria-label`/`title`. Mirror this exactly for visual consistency — the Activity trigger should look like a sibling of logout.
- **`Link to="/config/logs"`** is already used in `routes/config/overview.tsx:105` and `routes/config/layout.tsx:70` — same usage here; route is typed/registered so the `to` is type-checked.
- **Icons:** `lucide-react@^1.7.0` — `Activity`, `Loader2`, `CheckCircle2`, `XCircle`, `AudioWaveform` all verified exported. `animate-spin`/`animate-pulse` are built-in Tailwind utilities (Tailwind 4 via `@tailwindcss/vite`; no config needed).

### Critical project rules that apply here (`_bmad-output/project-context.md`)
- **React components are `PascalCase.tsx`** → `ActivityIndicator.tsx` ✓; **server state lives in TanStack Query only, push/UI state elsewhere** — this is push state, lives in the hook; the only local `useState` here is the popover `open` boolean (UI state, allowed). **No `fetch('/api/...')` in components** — you don't; the hook owns the connection.
- **Component folders by domain** — `components/shared/` is correct for a cross-app top-bar control (alongside `Layout.tsx`).
- **shadcn `ui/` components are generated — do not hand-edit** `popover.tsx`; consume it as-is.
- **TypeScript strict** (`noUnusedLocals`/`noUnusedParameters`) — no unused imports; the `runTitle` switch must be exhaustive over the enum (it is) so no unused `default`.
- **No comments unless non-obvious; no speculative abstractions / feature flags / one-off helpers.** The two pure functions are justified by AC5 testability, not speculative.
- **Dates are ISO strings** — `startedAt`/`updatedAt` are strings; this component never does date math, just passes runs through.

### Previous-story intelligence (46.1–46.5, all `done`)
- **46.5** built `useActivityStream` and deliberately kept the return shape `{ runs, isActive }` "exactly stable for 46.6" (its Dev Notes §"Scope"). Two deferred items from 46.5's review land in *this* story's territory but are **explicitly out of scope here too** unless trivially free: (1) backoff resets to floor on every `onopen`; (2) no surfaced error on permanent auth-expiry (infinite silent reconnect). 46.5's review filed #2 as "belongs to 46.6 UI" — but the AC set for 46.6 does **not** ask for connection-error surfacing, so do **not** add it; if you want to flag it, leave it as a deferred review note, don't expand scope.
- **46.3/46.4** confirm what populates `progress`: discovery's count is the running total across sources; analysis's count/total come from its `Analyzing i / total` messages; cover_letter/resume carry the job's `company` + role. So the status strings in AC5 map 1:1 to real emitted data.
- **Validation baseline** (carried through 46.2–46.5): repo has ~88 pre-existing tsc errors and ~40 env-dependent `bun test` failures, all in unrelated server/test/config files. Your bar is **zero new** of either.

### Git intelligence (recent commits)
- `10c9e8c feat(dashboard): epic-46 global activity dropdown — registry, SSE, hook` — the cumulative 46.1–46.5 landing (registry + SSE + hook). This story sits directly on top of it; `useActivityStream` and the schema are present at this baseline.
- Recent dashboard work (`1ab8d9a`, `0419682`) shows the established pattern: small, scoped client changes with co-located pure-function `bun:test`s and zinc-* dark styling — match that altitude.

### Project Structure Notes
- **New (client):** `src/client/components/shared/ActivityIndicator.tsx` — the component + two exported pures.
- **New (test):** `src/client/components/shared/ActivityIndicator.test.ts` — `bun:test` unit tests for the pures.
- **Edit:** `src/client/components/shared/Layout.tsx` — import + render `<ActivityIndicator />` before the logout button (one insertion; no restructuring).
- `@/` alias → `src/client/*`, `@shared/` → `src/shared/*`, both resolved in `vite.config.ts` + `tsconfig.json`. `DOM` lib already in `tsconfig.json`.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-46-activity-dropdown.md#Story 46.6] — full AC text (control left of logout, idle static / active animated, dropdown rows with per-type status lines, right-edge spinner, finalize-then-drop, persistent Logs footer, single `useActivityStream` source).
- [Source: job-hunt-dashboard/src/client/hooks/useActivityStream.ts:22-63] — the hook contract consumed here: `{ runs, isActive }`, push-driven, wholesale replace, self-managed connection.
- [Source: _bmad-output/implementation-artifacts/46-5-useactivitystream-client-hook.md] — hook design, the replace-not-merge rationale, the ~88-tsc / ~40-suite validation baseline, and the 2 deferred items noted as 46.6-adjacent (do not expand scope to them).
- [Source: job-hunt-dashboard/src/shared/schemas.ts:133-155] — `activityRunSchema`, the non-discriminated `progress` union (`{count,total}` vs `{company,role}`), and `ActivityRun` type to import.
- [Source: job-hunt-dashboard/src/client/components/shared/Layout.tsx:30,107-116] — header styling + logout button pattern to mirror and the exact insertion point.
- [Source: job-hunt-dashboard/src/client/components/ui/popover.tsx] — the dark low-chrome panel primitive (zinc-900/border-zinc-800); use controlled `open`/`onOpenChange` + `PopoverTrigger asChild` + `align="end"`.
- [Source: job-hunt-dashboard/src/client/routes/config/overview.tsx:105, routes/config/layout.tsx:70, lib/router.ts:322] — `/config/logs` route exists and `Link to="/config/logs"` is the established usage.
- [Source: job-hunt-dashboard/src/client/components/tracker/AgingRow.test.tsx] — the project's pure-function `bun:test` precedent to mirror (no DOM render harness exists).
- [Source: job-hunt-dashboard/src/server/services/activity-registry.ts] — `RETENTION_MS` prune-then-re-emit behavior that makes finalized rows drop out of `runs` (AC7).
- [Source: _bmad-output/project-context.md#Framework-Specific Rules (React/TanStack), #Testing Rules, #Code Quality & Style Rules] — PascalCase components, push vs server state, no direct `fetch`, `bun:test` co-located, no speculative abstractions, TS strict.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `bun test src/client/components/shared/ActivityIndicator.test.ts` → 8 pass / 0 fail.
- `bunx tsc --noEmit` → 88 errors total = unchanged pre-existing baseline; none in `ActivityIndicator.tsx`, its test, or `Layout.tsx`.
- `bun test` (full suite) → 465 pass / 40 fail; the 40 are the pre-existing env-dependent baseline (server/config suites), and the +8 over the prior 457 are exactly this story's new tests. Zero new failures.

### Completion Notes List

- **Task 1** — Added `ActivityIndicator.tsx` in `components/shared/`. Single `useActivityStream()` call owns push state; the only local state is the `open` boolean for the controlled `Popover` (UI state, allowed by project rules). Exported pure `runTitle` / `runStatusLine` per AC5; `progress` narrowed with the `in` operator (non-discriminated union, no discriminant field). `runTitle` switch is exhaustive over the enum → TS strict satisfied without a `default`.
- **Active-state affordance (AC3):** the `Activity` glyph gains `animate-pulse text-zinc-200` when `useActivityStream().isActive` is true; reverts to the plain `text-zinc-500` idle icon automatically when nothing runs. No local timers / no derived-state copy.
- **AC7 honored:** the component renders **every** run in `runs` with a per-`state` right-edge glyph (`Loader2` spin / green `CheckCircle2` / red `XCircle`) and never filters by state — finalized rows show their done/failed affordance and disappear only when the hook drops them after the server's retention prune.
- **AC8/AC9:** Logs footer (`<Link to="/config/logs">` that calls `setOpen(false)`) is always rendered regardless of `runs.length`; empty body shows the muted "No active workflows" line.
- **Task 2** — Mounted `<ActivityIndicator />` immediately before the logout button in `Layout.tsx`; no other header/nav restructuring.
- **Task 4 — outstanding manual step:** the interactive `bun run dev` browser walkthrough (idle→animate on a live run, live count row, done/failed-then-drop, footer navigates+closes) is a human-in-the-loop verification with no DOM harness in this repo; left unchecked for the reviewer to confirm. All automated gates (unit tests, tsc, full suite, AC code-review) pass.
- No new dependencies, no server/schema/hook changes, no DOM test library added (project rules).

### File List

- `job-hunt-dashboard/src/client/components/shared/ActivityIndicator.tsx` (new)
- `job-hunt-dashboard/src/client/components/shared/ActivityIndicator.test.ts` (new)
- `job-hunt-dashboard/src/client/components/shared/Layout.tsx` (modified — import + mount `<ActivityIndicator />` before logout)

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-26 | Implemented top-bar Activity indicator & dropdown (AC1–AC10): new `ActivityIndicator` component (single `useActivityStream` source, controlled Popover, per-run rows with state glyphs, persistent Logs footer, empty state) + exported pure `runTitle`/`runStatusLine` with `bun:test` coverage; mounted in `Layout.tsx`. 8/8 new tests pass, 0 new tsc errors (88 baseline), 0 new suite failures. Status → review. |
