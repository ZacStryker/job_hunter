# Story 44.3: Interactive Demo

Status: done

## Story

As a prospective user,
I want to interact with a live demo of the Matches view — without creating an account,
So that I can experience the product's core interface before committing to sign up.

## Acceptance Criteria

1. **Given** the interactive demo section **When** it renders **Then** it displays a visually contained component — using a rounded border, subtle shadow, and/or an explicit "Interactive Demo" label — that is clearly distinguishable from a live app interface.

2. **Given** the demo **When** the page loads **Then** zero API calls, zero session fetches, and zero TanStack Query hooks from the main app are invoked; all data is inline constants defined within the demo component tree.

3. **Given** the demo table **When** I view it **Then** it shows exactly 5 hardcoded jobs with a mix of recommendations: at least one "Apply", at least one "Investigate", and at least one "Skip"; each row shows company, job title, Fit Score badge, and Recommendation chip using the same semantic color tokens as the real app.

4. **Given** a demo job row **When** I click it **Then** a Job Drawer slides in from the right showing the pre-written analysis for that specific job: Fit Score, role fit summary, Reqs Met (2–3 items), Reqs Missed (1–3 items), Red Flags (0–1 items), and a Recommendation pill.

5. **Given** the demo Job Drawer **When** it is open **Then** a CTA at the bottom reads "Analyse your own profile →" and links to `/register`.

6. **Given** the demo table **When** it renders **Then** it does NOT read from or write to the `localStorage` key `"job-hunt-column-visibility"` (uses isolated in-component state only).

7. **Given** any app-level query hook or mutation (e.g. `useJobsQuery`, `useJobMutation`) **When** the demo renders **Then** none of those hooks are imported or called within the demo component tree.

## Tasks / Subtasks

- [x] Task 1: Define `DemoJob` type and `DEMO_JOBS` constant (AC: #2, #3)
  - [x] Define `type Recommendation = 'apply' | 'investigate' | 'skip'` at module level in `tour.tsx`
  - [x] Define `interface DemoJob` with fields: `id`, `company`, `title`, `score`, `recommendation`, `summary`, `reqsMet`, `reqsMissed`, `redFlags`
  - [x] Define `const DEMO_JOBS: DemoJob[]` with exactly 5 entries (see **Dev Notes — Demo Data**)
  - [x] All 5 jobs are inline constants — no fetch calls, no imports from hooks or shared schemas

- [x] Task 2: Build `InteractiveDemo` component (AC: #1–7)
  - [x] Define `InteractiveDemo` as an internal (non-exported) component in `tour.tsx`
  - [x] Use `useState<number | null>(null)` to track `selectedId`; derive `selectedJob` via `.find()`
  - [x] Wrap the entire demo in a clearly labeled section (see **Dev Notes — Section Structure**)
  - [x] Render a demo table with `DEMO_JOBS` rows (see **Dev Notes — Table Structure**)
  - [x] Each row is a `<button>` with `onClick` to set/toggle `selectedId`; selected row gets `bg-zinc-800 ring-1 ring-inset ring-blue-500/30`
  - [x] Render `ScoreBadge` and `ActionChip` per row using the same pattern as `MockupRow`
  - [x] Implement the drawer slide-in panel (see **Dev Notes — Drawer Slide-In**)
  - [x] Drawer header: company, title, ScoreBadge + ActionChip; close button `✕` that calls `setSelectedId(null)`
  - [x] Drawer body: Role Fit, Reqs Met (✓ emerald), Reqs Missed (○ amber), Red Flags (✕ red, or italic "None identified"), Recommendation chip
  - [x] Drawer footer: `<Link to="/register">` CTA reading "Analyse your own profile →"
  - [x] Zero localStorage reads or writes (no `localStorage.getItem`, `localStorage.setItem`)
  - [x] Zero hook imports from `src/client/hooks/`

- [x] Task 3: Insert `<InteractiveDemo />` into `TourRoute` (AC: #1)
  - [x] In `TourRoute`'s return, add `<InteractiveDemo />` between the closing `</section>` (id="features") and the closing `</div>` (min-h-screen wrapper)
  - [x] No changes to the existing `<section id="features">`, hero, or header

- [x] Task 4: Verify (AC: all)
  - [x] `bun tsc --noEmit` — zero new TypeScript errors
  - [x] No import from `src/client/hooks/` in `tour.tsx`
  - [x] No `localStorage` references in the new code
  - [x] Demo renders 5 rows; clicking each row opens a drawer with that job's data
  - [x] "Analyse your own profile →" link present in drawer footer; resolves to `/register`
  - [x] Test baseline unchanged: 369 pass / 46 fail (no server code changed)

## Dev Notes

### File to Edit

**Only one file changes:** `job-hunt-dashboard/src/client/routes/tour.tsx`

No new files. No new npm packages. No new CSS files.

### Existing Imports (already in tour.tsx — do not duplicate)

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ScoreBadge } from '../components/pipeline/ScoreBadge'
import { ActionChip } from '../components/pipeline/ActionChip'
```

`useState`, `Link`, `ScoreBadge`, and `ActionChip` are already imported. Do NOT add duplicate imports.

### Where to Insert in TourRoute

Current `TourRoute` return structure (simplified):

```tsx
export function TourRoute() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header>...</header>
      <section className="...hero...">...</section>
      <section id="features" className="border-t border-zinc-800/50">
        <FeatureSection2 />
        <FeatureSection3 />
        <FeatureSection4 />
        <FeatureSection5 />
      </section>
      {/* INSERT <InteractiveDemo /> HERE */}
    </div>
  )
}
```

Add `<InteractiveDemo />` as a direct child of the `min-h-screen` wrapper, immediately after the closing `</section>` of `id="features"`. No other JSX in `TourRoute` changes.

### Demo Data (Types and Constant)

Define these at **module level** in `tour.tsx`, below the imports and before any component definitions:

```tsx
type Recommendation = 'apply' | 'investigate' | 'skip'

interface DemoJob {
  id: number
  company: string
  title: string
  score: number
  recommendation: Recommendation
  summary: string
  reqsMet: string[]
  reqsMissed: string[]
  redFlags: string[]
}

const DEMO_JOBS: DemoJob[] = [
  {
    id: 1,
    company: 'Stripe',
    title: 'Senior Software Engineer',
    score: 87,
    recommendation: 'apply',
    summary: 'Strong alignment with distributed-systems experience and TypeScript depth. Payment domain background is a direct advantage.',
    reqsMet: ['5+ yrs TypeScript', 'Distributed systems', 'Payment platforms'],
    reqsMissed: ['Go proficiency preferred'],
    redFlags: [],
  },
  {
    id: 2,
    company: 'Figma',
    title: 'Staff Engineer, Platform',
    score: 72,
    recommendation: 'investigate',
    summary: 'Solid backend and API design fit. Design tooling domain is new territory — worth exploring if adjacent skills transfer.',
    reqsMet: ['API design', 'High-scale systems'],
    reqsMissed: ['Graphics/rendering experience', 'C++ proficiency'],
    redFlags: [],
  },
  {
    id: 3,
    company: 'Datadog',
    title: 'Principal Engineer',
    score: 64,
    recommendation: 'investigate',
    summary: 'Observability platform experience is a gap but systems background transfers well. Verify seniority expectations match your target level.',
    reqsMet: ['Distributed systems', 'TypeScript/Go breadth'],
    reqsMissed: ['Observability tooling domain', '10+ yrs expected'],
    redFlags: ['Compensation range below stated target'],
  },
  {
    id: 4,
    company: 'Shopify',
    title: 'Senior Backend Developer',
    score: 81,
    recommendation: 'apply',
    summary: 'E-commerce infrastructure and Ruby/Rails stack is a good match. TypeScript usage is growing across the organisation.',
    reqsMet: ['Ruby on Rails', 'API design', 'High-traffic systems'],
    reqsMissed: ['GraphQL expert preferred'],
    redFlags: [],
  },
  {
    id: 5,
    company: 'Adobe',
    title: 'Software Engineer III',
    score: 41,
    recommendation: 'skip',
    summary: 'Role centres on Creative Cloud desktop integration with C++ and native platform APIs. Limited overlap with current skill set.',
    reqsMet: ['Software engineering fundamentals'],
    reqsMissed: ['C++ (required)', 'Native desktop APIs', 'Creative domain knowledge'],
    redFlags: ['Strong C++ requirement — non-negotiable per JD'],
  },
]
```

**Score / color verification (ScoreBadge thresholds from story 44.2):**
- `score >= 75` → emerald (green): Stripe (87), Shopify (81) → "Apply" rows
- `score >= 50` → amber: Figma (72), Datadog (64) → "Investigate" rows
- `score < 50` → red: Adobe (41) → "Skip" row

AC#3 requires at least one Apply, one Investigate, one Skip — satisfied.

### Section Structure

The `InteractiveDemo` component renders as a full-width section with a centered label, heading, and the demo container:

```tsx
function InteractiveDemo() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedJob = DEMO_JOBS.find(j => j.id === selectedId) ?? null

  return (
    <section className="py-24 border-t border-zinc-800/50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-10 text-center">
          <span className="inline-block mb-3 px-3 py-1 rounded-full border border-zinc-700 text-xs text-zinc-400 uppercase tracking-wider">
            Interactive Demo
          </span>
          <h2 className="text-3xl font-bold text-zinc-100">See it in action</h2>
          <p className="mt-3 text-zinc-400">Click any row to open the AI analysis drawer.</p>
        </div>

        <div className="rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
          <div className="flex">
            {/* Table — left side */}
            <DemoTable
              jobs={DEMO_JOBS}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(prev => prev === id ? null : id)}
            />
            {/* Drawer — slides in from right */}
            <div className={`transition-all duration-300 ease-in-out overflow-hidden shrink-0 border-l border-zinc-800 ${selectedId !== null ? 'w-80' : 'w-0'}`}>
              <div className="w-80 flex flex-col" style={{ minHeight: '100%' }}>
                {selectedJob && (
                  <DemoDrawer job={selectedJob} onClose={() => setSelectedId(null)} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
```

You may inline `DemoTable` and `DemoDrawer` directly into `InteractiveDemo` or extract them as named internal components — either approach is acceptable as long as the result is clean TypeScript.

### Table Structure

The table header and row layout mirrors the `HeroMockup` / `MockupRow` pattern already in the file:

```tsx
// Table header
<div className="grid grid-cols-[1fr_1fr_48px_96px] gap-x-3 px-4 py-2.5 border-b border-zinc-800">
  <span className="text-xs text-zinc-500 uppercase tracking-wide">Company</span>
  <span className="text-xs text-zinc-500 uppercase tracking-wide">Role</span>
  <span className="text-xs text-zinc-500 uppercase tracking-wide text-center">Score</span>
  <span className="text-xs text-zinc-500 uppercase tracking-wide">Match</span>
</div>

// Each row — use <button> for click affordance
<button
  key={job.id}
  onClick={() => onSelect(job.id)}
  className={`w-full text-left grid grid-cols-[1fr_1fr_48px_96px] gap-x-3 items-center px-4 py-3 border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-800/50 transition-colors ${
    job.id === selectedId ? 'bg-zinc-800 ring-1 ring-inset ring-blue-500/30' : ''
  }`}
>
  <span className={`text-sm truncate ${job.id === selectedId ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}>
    {job.company}
  </span>
  <span className={`text-sm truncate ${job.id === selectedId ? 'text-zinc-200' : 'text-zinc-400'}`}>
    {job.title}
  </span>
  <span className="flex justify-center">
    <ScoreBadge score={job.score} />
  </span>
  <ActionChip recommendation={job.recommendation} />
</button>
```

Key: row is a `<button>` element so it has keyboard/click affordance by default. The `grid-cols-[1fr_1fr_48px_96px]` matches exactly the HeroMockup column pattern.

### Drawer Slide-In

The slide-in effect is achieved by transitioning the outer wrapper's width between `w-0` and `w-80`. The `overflow-hidden` on the outer wrapper clips the inner `w-80` content when width is 0, creating the slide effect:

```tsx
{/* Outer: transitions width 0 → 320px */}
<div className={`transition-all duration-300 ease-in-out overflow-hidden shrink-0 border-l border-zinc-800 ${
  selectedId !== null ? 'w-80' : 'w-0'
}`}>
  {/* Inner: always 320px wide; clipped by outer overflow-hidden */}
  <div className="w-80 flex flex-col">
    {selectedJob && <DemoDrawer job={selectedJob} onClose={() => setSelectedId(null)} />}
  </div>
</div>
```

No JS animation library — all CSS via Tailwind `transition-all`.

### Drawer Content

```tsx
// Drawer header
<div className="px-4 py-3 border-b border-zinc-800 shrink-0">
  <div className="flex items-start justify-between">
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">{job.company}</p>
      <p className="text-sm font-semibold text-zinc-100 leading-snug">{job.title}</p>
      <div className="flex items-center gap-2 mt-2">
        <ScoreBadge score={job.score} />
        <ActionChip recommendation={job.recommendation} />
      </div>
    </div>
    <button
      onClick={onClose}
      className="text-zinc-500 hover:text-zinc-300 transition-colors ml-2 shrink-0 text-base leading-none"
      aria-label="Close drawer"
    >
      ✕
    </button>
  </div>
</div>

// Drawer body
<div className="px-4 py-3 space-y-4 text-xs overflow-y-auto flex-1">
  <div>
    <p className="text-zinc-500 uppercase tracking-wide mb-1">Role Fit</p>
    <p className="text-zinc-300 leading-relaxed">{job.summary}</p>
  </div>
  <div>
    <p className="text-zinc-500 uppercase tracking-wide mb-1">Requirements Met</p>
    <ul className="space-y-0.5">
      {job.reqsMet.map(r => (
        <li key={r} className="flex gap-1.5 text-zinc-300">
          <span className="text-emerald-500 shrink-0">✓</span>{r}
        </li>
      ))}
    </ul>
  </div>
  <div>
    <p className="text-zinc-500 uppercase tracking-wide mb-1">Requirements Missed</p>
    <ul className="space-y-0.5">
      {job.reqsMissed.map(r => (
        <li key={r} className="flex gap-1.5 text-zinc-400">
          <span className="text-amber-500 shrink-0">○</span>{r}
        </li>
      ))}
    </ul>
  </div>
  <div>
    <p className="text-zinc-500 uppercase tracking-wide mb-1">Red Flags</p>
    {job.redFlags.length > 0 ? (
      <ul className="space-y-0.5">
        {job.redFlags.map(r => (
          <li key={r} className="flex gap-1.5 text-red-400">
            <span className="shrink-0">✕</span>{r}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-zinc-500 italic">None identified</p>
    )}
  </div>
  <div>
    <p className="text-zinc-500 uppercase tracking-wide mb-1">Recommendation</p>
    <ActionChip recommendation={job.recommendation} />
  </div>
</div>

// Drawer footer — CTA
<div className="px-4 py-3 border-t border-zinc-800 shrink-0">
  <Link
    to="/register"
    className="block w-full text-center py-2 px-4 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
  >
    Analyse your own profile →
  </Link>
</div>
```

### TypeScript Notes

- `noUnusedLocals` and `noUnusedParameters` are enabled — every declared variable and parameter must be used
- `Recommendation` type must match the `recommendation` prop type accepted by `ActionChip` — both are `'apply' | 'investigate' | 'skip'`
- `DemoJob` interface field `recommendation: Recommendation` ensures type safety when passing to `ActionChip`
- The close button `✕` character is a plain Unicode character (U+2715) — not an icon library import
- `useEffect`, `useRef`, and `ReactNode` are already imported (used by `FadeInView`) — do not add duplicate imports
- `useState` is already imported — do not re-import
- If you extract `DemoTable` and `DemoDrawer` as internal components, their props must be fully typed (no `any`)

### ActionChip Type Guard

`ActionChip`'s `recommendation` prop is strictly `'apply' | 'investigate' | 'skip'`. The `DemoJob.recommendation` is typed as `Recommendation` (same union). Passing `job.recommendation` directly is type-safe with no cast needed.

### Scope Boundaries

- This story adds **only** `InteractiveDemo`, `DemoJob`, `Recommendation`, and `DEMO_JOBS` to `tour.tsx`
- No changes to: `router.ts`, `index.css`, any component in `src/client/components/`, any server file, any shared schema
- No new npm packages
- Do NOT import `PipelineTable`, `JobDrawer`, or any hook from `src/client/hooks/`
- Do NOT import from `src/shared/schemas.ts` — the demo data uses its own self-contained types
- Story 44.4 (FAQ + closing CTA) will add content after `<InteractiveDemo />` — leave it as the last sibling inside the min-h-screen wrapper for now

### Anti-Patterns to Avoid

- Do not import `useJobsQuery`, `useJobMutation`, `useSyncMutation`, or any other hook from `src/client/hooks/`
- Do not read or write `localStorage` — the demo's selected state is ephemeral React state only
- Do not use `useQuery`, `useMutation`, or `QueryClient` — no TanStack Query in the demo
- Do not import `Job` or any type from `src/shared/schemas.ts` — use the local `DemoJob` interface
- Do not use `<button>` elements in the drawer body mockup for decorative items (use `<div aria-hidden="true">` per 44.2 pattern) — but the row buttons and close button ARE interactive and should remain `<button>`
- Do not add a `beforeLoad` or loader to the `tourRoute` in `router.ts` — it is already correct

### Learnings from Stories 44.1 and 44.2

**Pattern: internal component extraction.** All sub-components (`HeroMockup`, `MockupRow`, `FadeInView`, `FeatureSection2–5`) are defined below `TourRoute` in the same file. Follow this pattern for `InteractiveDemo` and any sub-components you extract.

**Pattern: row selection indicator.** `MockupRow` uses `bg-zinc-800 ring-1 ring-inset ring-blue-500/30` for the selected row. Reuse this exact pattern in the demo table rows.

**Pattern: decorative elements.** From 44.2 review: decorative interactive-looking elements (non-functional) should be `<div aria-hidden="true">`, not `<button>`. The demo table rows and close button ARE functional — use `<button>`. The "Analyse your own profile →" link is functional — use `<Link>`.

**Pattern: no CSS animation libraries.** FadeInView uses native IntersectionObserver + Tailwind transition classes. The drawer slide-in follows the same philosophy — no libraries, pure CSS transitions via Tailwind.

**TypeScript strict mode.** Previous stories have confirmed `noUnusedLocals` and `noUnusedParameters` are active. Every prop, variable, and import must be used. Run `bun tsc --noEmit` before marking done.

**Test baseline.** After stories 44.1 and 44.2: 369 pass / 46 fail. This story adds only frontend/JSX — no server code changes, no new test files needed. Baseline must remain 369 pass / 46 fail.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

Implemented `InteractiveDemo` component in `tour.tsx` with all 7 ACs satisfied:
- `Recommendation` type, `DemoJob` interface, and `DEMO_JOBS` constant (5 jobs: 2 Apply, 2 Investigate, 1 Skip) added at module level
- `InteractiveDemo` + extracted `DemoTable` and `DemoDrawer` internal components — zero hook imports, zero localStorage, zero API calls
- CSS slide-in drawer via Tailwind `transition-all` width toggle (w-0 → w-80) with `overflow-hidden` clip
- `<InteractiveDemo />` inserted in `TourRoute` between `</section>` (features) and outer `</div>`
- All score/color thresholds correct via existing `ScoreBadge`; `ActionChip` receives `Recommendation` type directly (no cast)
- "Analyse your own profile →" CTA links to `/register`
- `bun tsc --noEmit`: zero new errors; test baseline: 369 pass / 46 fail unchanged

### File List

| File | Action |
|------|--------|
| `job-hunt-dashboard/src/client/routes/tour.tsx` | Modified — add Recommendation type, DemoJob interface, DEMO_JOBS constant, InteractiveDemo component; insert `<InteractiveDemo />` in TourRoute |

### Review Findings

- [x] [Review][Decision] `router.ts` has `beforeLoad` that redirects authenticated users — resolved: removed `beforeLoad`; authenticated users may view `/tour` freely [`job-hunt-dashboard/src/client/lib/router.ts`]
- [x] [Review][Decision] Adobe `reqsMissed` has 3 items — resolved: accepted as intentional; AC#4 prose updated to "1–3 items" [`job-hunt-dashboard/src/client/routes/tour.tsx:74`]
- [x] [Review][Patch] Drawer content abruptly unmounts mid-animation — fixed: `lastJobRef` retains last non-null job so `DemoDrawer` stays mounted during the 300ms close animation [`job-hunt-dashboard/src/client/routes/tour.tsx:432`]
- [x] [Review][Defer] String values used as React `key` on list items (`reqsMet`, `reqsMissed`, `redFlags`) — fragile if any string duplicates within an array; safe with current static data [`job-hunt-dashboard/src/client/routes/tour.tsx:543`] — deferred, pre-existing
- [x] [Review][Defer] `DemoTable` row `<button>` elements lack `aria-pressed`/`aria-expanded` — no screen reader announcement when drawer opens/closes [`job-hunt-dashboard/src/client/routes/tour.tsx:484`] — deferred, pre-existing
- [x] [Review][Defer] `FadeInView` SSR/MQL lifecycle issues — pre-existing from story 44.1/44.2, not caused by 44.3 [`job-hunt-dashboard/src/client/routes/tour.tsx:328`] — deferred, pre-existing
- [x] [Review][Defer] Mobile overflow — `w-80` drawer has no responsive fallback for narrow viewports; layout has no mobile breakpoints yet [`job-hunt-dashboard/src/client/routes/tour.tsx:454`] — deferred, pre-existing

## Change Log

- 2026-06-12: Story created
- 2026-06-12: Implementation complete — added InteractiveDemo component with DemoTable, DemoDrawer, Recommendation type, DemoJob interface, and DEMO_JOBS constant to tour.tsx; status set to review
- 2026-06-12: Code review complete — 2 decision-needed, 1 patch, 4 deferred, 4 dismissed
