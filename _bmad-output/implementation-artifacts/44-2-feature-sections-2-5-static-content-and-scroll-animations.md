# Story 44.2: Feature Sections 2–5 — Static Content & Scroll Animations

Status: done

## Story

As a prospective user,
I want to scroll through four feature sections explaining discovery, AI analysis, document generation, and application tracking,
So that I understand HITLOBSTER's full workflow before deciding to sign up.

## Acceptance Criteria

1. **Given** feature section 2 — Job Discovery & Pre-Scoring **When** I view it **Then** it is laid out text-right / visual-left; copy explains configuring job title+location search pairs and relevance pre-scoring before the full AI pipeline; visual is a static mockup of the Config screen showing search pairs and a discovery results list with Relevance Score badges.

2. **Given** feature section 3 — AI Analysis & Fit Score **When** I view it **Then** it is laid out text-left / visual-right and is visually the largest feature section; copy explains the Claude LLM pipeline output (Fit Score 0–100, role fit summary, Reqs Met, Reqs Missed, Red Flags, Recommendation); visual is a full Job Drawer mockup showing all analysis fields; three sample score badges are shown: one green (≥80), one amber (60–79), one red (<60), using the app's semantic color tokens.

3. **Given** feature section 4 — Tailored Document Generation **When** I view it **Then** it is laid out text-right / visual-left; copy explains one-click resume and cover letter generation from the Job Drawer, tailored to the specific job description, stored against the job record, with visual preview and download, and mentions the dynamic 1/2-page resume layout; visual shows a Generate button in the drawer alongside a rendered resume preview.

4. **Given** feature section 5 — Application Tracking & Email Sync **When** I view it **Then** it is laid out text-left / visual-right; copy explains marking jobs as applied, connecting an IMAP inbox, moving emails into designated subfolders, and manually mapping messages to jobs; copy does NOT state or imply that status changes are detected automatically; visual shows the Applications view with Applied→Screening→Interview status badges and a status history timeline in the drawer.

5. **Given** any feature section visual **When** it enters the viewport during scroll **Then** it animates in with a fade + slide-up effect (opacity 0→1, translateY 24px→0) using pure CSS (no JS animation libraries added).

6. **Given** no browser scroll activity **When** a feature section visual is off-screen **Then** it remains in its pre-animation state (invisible / translated) until it enters the viewport.

7. **Given** all four feature sections **When** I scan the page **Then** their text/visual sides strictly alternate (right, left, right, left) and no lorem ipsum text appears anywhere.

## Tasks / Subtasks

- [x] Task 1: Add `FadeInView` wrapper component to `tour.tsx` (AC: #5, #6)
  - [x] Define `FadeInView` as an internal component (not exported) in `tour.tsx`
  - [x] Use `useRef` + `useEffect` + native `IntersectionObserver` to detect viewport entry
  - [x] On entry: add Tailwind `opacity-100 translate-y-0` classes; before entry: `opacity-0 translate-y-6`
  - [x] Use Tailwind transition utilities: `transition-all duration-700 ease-out`
  - [x] After first trigger, call `observer.disconnect()` so the element stays visible
  - [x] Respect `prefers-reduced-motion`: if `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, start in the visible state (`inView = true`) immediately — no animation
  - [x] Return cleanup function from `useEffect` that calls `observer.disconnect()`

- [x] Task 2: Replace the `<div id="features" />` stub with the four feature sections (AC: #1–4, #7)
  - [x] Wrap all four sections in a `<section id="features">` parent so the scroll anchor from the hero CTA still works
  - [x] Section 2 layout: `md:flex-row-reverse` (visual left, text right on wide screens; stacked on mobile)
  - [x] Section 3 layout: `md:flex-row` (text left, visual right); make this section taller / padding more generous than the others to signal it is the "largest"
  - [x] Section 4 layout: `md:flex-row-reverse`
  - [x] Section 5 layout: `md:flex-row`
  - [x] Each section: `flex flex-col md:flex-row gap-12 items-center py-20 max-w-6xl mx-auto px-6`
  - [x] Wrap each section visual in `<FadeInView>` so only the visual animates in (text block is always visible)

- [x] Task 3: Write final-draft copy for each section (AC: #1–4, #7)
  - [x] Section 2 headline + body: see **Dev Notes — Copy**
  - [x] Section 3 headline + body: see **Dev Notes — Copy**
  - [x] Section 4 headline + body: see **Dev Notes — Copy**
  - [x] Section 5 headline + body: see **Dev Notes — Copy**
  - [x] Zero lorem ipsum, zero placeholder text, zero "TODO" markers

- [x] Task 4: Build static mockups for each section (AC: #1–4)
  - [x] All mockups: use only existing Tailwind dark-mode color tokens; no new CSS files
  - [x] All mockups: self-contained JSX (no imported hooks, no API calls, no TanStack Query)
  - [x] Section 2 mockup: see **Dev Notes — Mockups**
  - [x] Section 3 mockup: see **Dev Notes — Mockups**
  - [x] Section 4 mockup: see **Dev Notes — Mockups**
  - [x] Section 5 mockup: see **Dev Notes — Mockups**

- [x] Task 5: Verify (AC: all)
  - [x] `bun tsc --noEmit` — zero new TypeScript errors
  - [x] Layout alternation confirmed: S2 visual-left/text-right → S3 text-left/visual-right → S4 visual-left/text-right → S5 text-left/visual-right
  - [x] `id="features"` still resolves the hero "See how it works ↓" smooth-scroll
  - [x] No `localStorage` reads or writes in the feature section tree
  - [x] No hooks from `src/client/hooks/` imported or called
  - [x] Test baseline unchanged (no server code changed; 369 pass / 46 fail expected)

## Dev Notes

### File to Edit

**Only one file changes:** `job-hunt-dashboard/src/client/routes/tour.tsx`

No new files. No new npm packages. No new global CSS.

### FadeInView Component

Internal component, not exported. Add near the bottom of `tour.tsx` alongside `HeroMockup` and `MockupRow`:

```tsx
import { useEffect, useRef, useState } from 'react'

function FadeInView({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [inView, setInView] = useState(prefersReduced)

  useEffect(() => {
    if (prefersReduced) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [prefersReduced])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
```

This is 100% valid with TypeScript strict mode — no unused vars, all props typed. The `prefersReduced` check runs synchronously so the initial state is correct (no flash of invisible content for reduced-motion users).

No JS animation library is added — `IntersectionObserver` is a native browser API, not a library. The animation itself is driven entirely by Tailwind transition classes.

### Replacing the #features Stub

Current `tour.tsx` ends with:
```tsx
      <div id="features" />
    </div>   // closes min-h-screen wrapper
  )
}
```

Replace `<div id="features" />` with a `<section id="features">` that wraps all four feature sections. Keep the outer closing `</div>` and `</section>` in the right place.

Structure:
```tsx
      <section id="features" className="border-t border-zinc-800/50">
        <FeatureSection2 />
        <FeatureSection3 />
        <FeatureSection4 />
        <FeatureSection5 />
      </section>
    </div>  // closes min-h-screen
  )
}
```

Each `FeatureSection*` is an internal component defined below `TourRoute`.

### Section Layout Pattern

Every section follows the same two-column pattern, toggled via `md:flex-row` vs `md:flex-row-reverse`:

```tsx
function FeatureSectionN() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-20 flex flex-col md:flex-row gap-12 items-center">
      {/* On mobile, text always comes first (before visual). On md+, flex-row or flex-row-reverse controls sides. */}
      <div className="flex-1 space-y-4">
        {/* text block */}
      </div>
      <FadeInView className="flex-1">
        {/* static mockup */}
      </FadeInView>
    </div>
  )
}
```

For `flex-row-reverse` sections (S2, S4), the visual `<FadeInView>` comes SECOND in JSX but renders on the LEFT on wide screens. Stacking on mobile is automatic since `flex-col` dominates below `md:`.

Add a subtle separator between sections: `border-t border-zinc-800/40` on the inner `<div>` of S3, S4, S5 (not S2 — it is the first section after the `<section id="features">` border).

### Copy

**Section 2 — Job Discovery & Pre-Scoring**

Headline: `Find the right jobs before the AI even runs`

Body (3–4 sentences):
> Configure job title and location search pairs once. HITLOBSTER scrapes matching listings across LinkedIn, Indeed, and ARC — then scores each one for semantic similarity to your resume profile before the full AI pipeline runs. Only the most relevant results make it through, so you spend your attention budget on real opportunities.

**Section 3 — AI Analysis & Fit Score**

Headline: `Instant clarity on every listing`

Body (4–5 sentences):
> Every job that clears the relevance threshold is analysed by Claude. The result is a Fit Score from 0 to 100, a one-paragraph role fit summary, a breakdown of Requirements Met and Missed against your profile, any Red Flags worth knowing about, and a Recommendation — Apply, Investigate, or Skip. Three tiers, colour-coded so you can triage a full day's listings in seconds.

**Section 4 — Tailored Document Generation**

Headline: `One click. Two documents. Zero boilerplate.`

Body (3–4 sentences):
> From the Job Drawer, click once to generate a tailored resume and cover letter — each rewritten to match the specific job description. Both documents are stored against the job record so you can preview and download at any time. The resume uses a dynamic 1/2-page layout that expands or trims to the most relevant experience automatically.

**Section 5 — Application Tracking & Email Sync**

Headline: `Every application, accounted for`

Body (3–4 sentences):
> Mark a job as applied directly from the Job Drawer to move it into the Applications view. Connect your IMAP inbox, move relevant emails into dedicated subfolders, and manually map messages to jobs to keep a complete status history. As you update statuses — Applied, Screening, Interview, Offer — the timeline in the drawer stays in sync.

### Mockups

All mockups use the same Tailwind token set as the existing `HeroMockup`:
`bg-zinc-900`, `bg-zinc-800`, `border-zinc-700/800`, `text-zinc-100/200/300/400/500`, `text-emerald-400/500`, `text-amber-400/500`, `text-red-500`.

#### Section 2 Mockup — Config + Discovery Results

```tsx
<div className="rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden text-left">
  {/* Config panel header */}
  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
    Search Pairs
  </div>
  {/* Two search pair rows */}
  <div className="px-4 py-2.5 border-b border-zinc-800 flex gap-3 text-xs">
    <span className="text-zinc-300 flex-1">Senior Software Engineer</span>
    <span className="text-zinc-500">San Francisco, CA</span>
  </div>
  <div className="px-4 py-2.5 border-b border-zinc-800 flex gap-3 text-xs">
    <span className="text-zinc-300 flex-1">Staff Engineer</span>
    <span className="text-zinc-500">Remote, US</span>
  </div>
  {/* Discovery results header */}
  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide mt-2">
    Latest Results
  </div>
  {/* 3 result rows with relevance badges */}
  {[
    { company: 'Stripe', role: 'Senior SWE', rel: 94 },
    { company: 'Linear', role: 'Staff Eng.', rel: 88 },
    { company: 'Vercel', role: 'Platform Eng.', rel: 71 },
  ].map(({ company, role, rel }) => (
    <div key={company} className="px-4 py-2.5 border-b border-zinc-800/50 last:border-b-0 flex items-center gap-3 text-xs">
      <span className="flex-1 text-zinc-200">{company}</span>
      <span className="text-zinc-400">{role}</span>
      <span className="inline-flex items-center justify-center w-8 h-5 border rounded text-xs font-semibold border-violet-600 text-violet-400">
        {rel}
      </span>
    </div>
  ))}
</div>
```

#### Section 3 Mockup — Full Job Drawer

This is the "largest" section — the mockup should be taller. Show the three score badge tiers separately in an explanatory strip above the drawer.

ScoreBadge actual thresholds: `≥75` = emerald (green), `≥50` = amber, `<50` = red.
Use scores **87** (green), **64** (amber), **32** (red) to hit all three tiers.

```tsx
<div className="space-y-4">
  {/* Score tier legend */}
  <div className="flex gap-4 justify-center">
    {[{ score: 87, label: 'Strong fit' }, { score: 64, label: 'Partial fit' }, { score: 32, label: 'Low fit' }].map(({ score, label }) => (
      <div key={score} className="flex flex-col items-center gap-1.5">
        <ScoreBadge score={score} />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
    ))}
  </div>

  {/* Drawer mockup */}
  <div className="rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden text-left">
    <div className="px-4 py-3 border-b border-zinc-800">
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Stripe</p>
      <p className="text-sm font-semibold text-zinc-100 leading-snug">Senior Software Engineer</p>
      <div className="flex items-center gap-2 mt-2">
        <ScoreBadge score={87} />
        <ActionChip recommendation="apply" />
      </div>
    </div>
    <div className="px-4 py-3 space-y-3 text-xs">
      <div>
        <p className="text-zinc-500 uppercase tracking-wide mb-1">Role Fit</p>
        <p className="text-zinc-300 leading-relaxed">Strong alignment with distributed-systems experience and TypeScript depth. Payment domain background is a direct advantage.</p>
      </div>
      <div>
        <p className="text-zinc-500 uppercase tracking-wide mb-1">Requirements Met</p>
        <ul className="space-y-0.5">
          {['5+ yrs TypeScript', 'Distributed systems', 'Payment platforms'].map(r => (
            <li key={r} className="flex gap-1.5 text-zinc-300"><span className="text-emerald-500">✓</span>{r}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-zinc-500 uppercase tracking-wide mb-1">Requirements Missed</p>
        <ul className="space-y-0.5">
          <li className="flex gap-1.5 text-zinc-400"><span className="text-amber-500">○</span>Go proficiency preferred</li>
        </ul>
      </div>
      <div>
        <p className="text-zinc-500 uppercase tracking-wide mb-1">Red Flags</p>
        <p className="text-zinc-500 italic">None identified</p>
      </div>
    </div>
  </div>
</div>
```

#### Section 4 Mockup — Generate Button + Resume Preview

```tsx
<div className="rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden text-left">
  <div className="px-4 py-3 border-b border-zinc-800">
    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Stripe — Senior SWE</p>
    <p className="text-xs text-zinc-500 mb-2">Documents generated 2 min ago</p>
    <div className="flex flex-col gap-2">
      <button className="w-full text-left px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 flex items-center justify-between hover:bg-zinc-700 transition-colors">
        <span>Resume (tailored)</span>
        <span className="text-zinc-500">↓ PDF</span>
      </button>
      <button className="w-full text-left px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 flex items-center justify-between hover:bg-zinc-700 transition-colors">
        <span>Cover Letter</span>
        <span className="text-zinc-500">↓ PDF</span>
      </button>
    </div>
  </div>
  {/* Resume preview strip */}
  <div className="px-4 py-3 space-y-1.5">
    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Resume Preview</p>
    <div className="space-y-1 text-xs text-zinc-400">
      <div className="h-2 bg-zinc-700 rounded w-3/4" />
      <div className="h-1.5 bg-zinc-800 rounded w-full" />
      <div className="h-1.5 bg-zinc-800 rounded w-5/6" />
      <div className="h-1.5 bg-zinc-800 rounded w-4/5 mt-2" />
      <div className="h-1.5 bg-zinc-800 rounded w-full" />
    </div>
  </div>
</div>
```

Note: the `<button>` elements in the mockup are purely decorative (no click handlers needed in this static context). They use `hover:` classes to look interactive without being functional.

#### Section 5 Mockup — Applications Table + Status Timeline

```tsx
<div className="rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden text-left">
  {/* Table header */}
  <div className="grid grid-cols-[1fr_1fr_auto] gap-x-3 px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
    <span>Company</span><span>Role</span><span>Status</span>
  </div>
  {/* Rows with status badges */}
  {[
    { company: 'Stripe', role: 'Senior SWE', status: 'Interview', color: 'bg-emerald-950 text-emerald-300' },
    { company: 'Linear', role: 'Staff Eng.', status: 'Screening', color: 'bg-blue-950 text-blue-300' },
    { company: 'Vercel', role: 'Platform Eng.', status: 'Applied', color: 'bg-zinc-800 text-zinc-300' },
  ].map(({ company, role, status, color }) => (
    <div key={company} className="grid grid-cols-[1fr_1fr_auto] gap-x-3 items-center px-4 py-2.5 border-b border-zinc-800/50 last:border-b-0 text-xs">
      <span className="text-zinc-200">{company}</span>
      <span className="text-zinc-400">{role}</span>
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{status}</span>
    </div>
  ))}
  {/* Status timeline in drawer hint */}
  <div className="px-4 py-3 border-t border-zinc-800 space-y-2">
    <p className="text-xs text-zinc-500 uppercase tracking-wide">Status History — Stripe</p>
    {[
      { label: 'Interview scheduled', date: 'Jun 10' },
      { label: 'Moved to screening', date: 'Jun 7' },
      { label: 'Applied', date: 'Jun 5' },
    ].map(({ label, date }) => (
      <div key={date} className="flex items-center gap-2 text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
        <span className="text-zinc-300 flex-1">{label}</span>
        <span className="text-zinc-600">{date}</span>
      </div>
    ))}
  </div>
</div>
```

### TypeScript Notes

- `noUnusedLocals` and `noUnusedParameters` are on — every import and variable must be used
- `FadeInView` must import `useEffect`, `useRef`, `useState` from `'react'` (not `react-dom`)
- If React is already imported at the top of the file, add `useEffect, useRef, useState` to the existing import (or add a new `import { useEffect, useRef, useState } from 'react'`)
- Array `.map()` callbacks: the key prop must be a unique string or number per element; use `company` as key only when company values are unique in a given list (they are in these mockups)
- The `CHIP_STYLES` object in `ActionChip` only accepts `'apply' | 'investigate' | 'skip'` — do not pass any other string as `recommendation`

### Section 3 Score Badge Caveat

The AC says "one green (≥80), one amber (60–79), one red (<60)." These describe the *intended visual appearance*, not the exact `ScoreBadge` implementation thresholds. The actual `ScoreBadge` component (`src/client/components/pipeline/ScoreBadge.tsx`) uses:
- `score >= 75` → `border-emerald-600 text-emerald-400` (green)
- `score >= 50` → `border-amber-500 text-amber-400` (amber)
- `score < 50`  → `border-red-700 text-red-500` (red)

Use scores **87**, **64**, and **32** — they render green, amber, and red respectively while also being numbers that "read" correctly in context.

### Scope Boundaries

- This story adds the four feature sections to `tour.tsx` only
- The `#features` stub `<div>` is removed and replaced with a `<section id="features">` containing the four sections
- No changes to `router.ts`, `index.css`, `shared/schemas.ts`, or any server file
- No changes to any existing component in `components/`
- No new npm packages
- Story 44.3 (interactive demo) and 44.4 (FAQ + CTA) add content after these sections — leave room at the bottom of the `<section id="features">` for them

### Avoiding Regressions

- Do not import `PipelineTable`, `JobDrawer`, or any hook-bearing component
- Do not read from or write to `localStorage`
- Do not modify `protectedRoute`, `loginRoute`, `registerRoute`, or `onboardingRoute`
- The existing `HeroMockup` and `MockupRow` components at the bottom of `tour.tsx` must remain unchanged
- All existing tests pass without modification (frontend-only additions; server code untouched)

## Dev Agent Record

### Completion Notes

Implemented all four feature sections (S2–S5) plus `FadeInView` in a single file edit to `tour.tsx`. `FadeInView` uses native `IntersectionObserver` with `threshold: 0.1`, Tailwind transition classes (`transition-all duration-700 ease-out`), and respects `prefers-reduced-motion` by initialising `inView = true` synchronously for reduced-motion users. Each section visual is wrapped in `<FadeInView>` while text blocks remain always-visible. Layout alternation: S2 `md:flex-row-reverse`, S3 `md:flex-row` (py-28), S4 `md:flex-row-reverse`, S5 `md:flex-row`. The `<div id="features" />` stub was replaced with `<section id="features">` preserving the hero smooth-scroll anchor. All mockups use existing zinc/emerald/amber/red Tailwind tokens from the existing design system; `ScoreBadge` and `ActionChip` components are reused in S3. Zero new npm packages, CSS files, or hook imports. TypeScript strict-mode clean (zero errors in tour.tsx). Test baseline confirmed: 369 pass / 46 fail.

## File List

| File | Action |
|------|--------|
| `job-hunt-dashboard/src/client/routes/tour.tsx` | Modified — add FadeInView, FeatureSection2–5 components; replace `<div id="features" />` stub |

### Review Findings

- [x] [Review][Patch] Add `beforeLoad` to `tourRoute` that detects an active session and redirects to `/` [router.ts]
- [x] [Review][Patch] AC4 copy: reword "the timeline in the drawer stays in sync" → "each change is recorded in the drawer's status history" [tour.tsx]
- [x] [Review][Patch] AC2: add labeled "Recommendation" row to S3 drawer body alongside Role Fit / Reqs Met / Missed / Red Flags [tour.tsx]
- [x] [Review][Dismiss] AC3: S4 post-generation state accepted as-is; "Generate" button not required
- [x] [Review][Patch] `prefersReduced` stale closure in FadeInView — replaced with `useRef` + `addEventListener('change', ...)` on MediaQueryList [tour.tsx]
- [x] [Review][Patch] `scroll-behavior: smooth` removed from `index.css`; anchor uses JS `scrollIntoView` with per-call motion check [tour.tsx, index.css]
- [x] [Review][Patch] Decorative document buttons in FeatureSection4 mockup changed from `<button>` to `<div aria-hidden="true">` [tour.tsx]
- [x] [Review][Defer] FadeInView initial `opacity-0` state — no-JS users see permanently invisible feature mockups; SPA architectural limitation, not actionable in this story
- [x] [Review][Defer] `ActionChip` undefined-value fragility — pre-existing issue in component; not caused by this change

## Change Log

- 2026-06-12: Story created
- 2026-06-12: Implementation complete — FadeInView component + FeatureSection2–5 added to tour.tsx; `<div id="features" />` stub replaced with `<section id="features">`; status → review
- 2026-06-12: Code review complete — 4 decision-needed, 3 patch, 2 deferred, 3 dismissed
