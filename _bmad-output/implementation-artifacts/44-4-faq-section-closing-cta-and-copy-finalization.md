# Story 44.4: FAQ Section, Closing CTA & Copy Finalization

Status: done

## Story

As a prospective user,
I want to read answers to common questions and be given a final invitation to sign up,
So that any hesitation is addressed and I can take the next step.

## Acceptance Criteria

1. **Given** the FAQ section **When** I view it **Then** it contains a shadcn Accordion with exactly 4–5 items covering these topics: "How is my data secured?", "Do I need my own Claude API key?", "What job boards does it search?", and "How does email sync work?"

2. **Given** a FAQ accordion item **When** I click it **Then** it expands to show a substantive answer to that question (no lorem ipsum or placeholder text).

3. **Given** the closing CTA block beneath the FAQ **When** I view it **Then** it includes a headline that echoes the hero section's message and a prominent "Create your profile" button that links to `/register`.

4. **Given** the complete tour page from hero to closing CTA **When** I read through all sections **Then** every piece of copy is final-draft quality — no lorem ipsum, no placeholder text, no "TODO" markers anywhere on the page.

5. **Given** the `/tour` route **When** it is navigated to from `/login` or `/register` **Then** a link or nav item is present on those public pages to surface the tour to unauthenticated visitors discovering the app for the first time.

## Tasks / Subtasks

- [x] Task 1: Install shadcn Accordion component (AC: #1)
  - [x] Run `bunx shadcn add accordion` in the `job-hunt-dashboard/` directory
  - [x] Verify `src/client/components/ui/accordion.tsx` was created (do not hand-edit)
  - [x] Verify no new npm packages were added beyond what shadcn adds automatically (usually just `@radix-ui/react-accordion`)

- [x] Task 2: Build `FaqSection` component in `tour.tsx` (AC: #1, #2)
  - [x] Add `import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'` to `tour.tsx` imports
  - [x] Define `FaqSection` as an internal (non-exported) component below `InteractiveDemo` in `tour.tsx`
  - [x] Render 4 accordion items with the required topics and substantive answers (see **Dev Notes — FAQ Content**)
  - [x] Wrap in a `<section>` with `py-24 border-t border-zinc-800/50` and `max-w-3xl mx-auto px-6` container
  - [x] Add section heading: `<h2 className="text-3xl font-bold text-zinc-100 mb-10 text-center">Frequently asked questions</h2>`

- [x] Task 3: Build `ClosingCta` component in `tour.tsx` (AC: #3)
  - [x] Define `ClosingCta` as an internal (non-exported) component below `FaqSection` in `tour.tsx`
  - [x] Headline echoing the hero: "Your job search, on autopilot." (or similar — see **Dev Notes — Copy**)
  - [x] "Create your profile" button: `<Button asChild size="lg"><Link to="/register">Create your profile</Link></Button>`
  - [x] Wrap in a `<section>` with `py-24 border-t border-zinc-800/50 text-center`

- [x] Task 4: Insert `<FaqSection />` and `<ClosingCta />` into `TourRoute` (AC: #4)
  - [x] Add both components after `<InteractiveDemo />` inside the `min-h-screen` wrapper
  - [x] No changes to existing components in `TourRoute`

- [x] Task 5: Add tour link to `/login` and `/register` pages (AC: #5)
  - [x] In `login.tsx`: add `<Link to="/tour" className="text-sm text-zinc-500 hover:text-zinc-300 mt-2 block text-center">See how it works →</Link>` below the existing `/register` link
  - [x] In `register.tsx`: add `<Link to="/tour" className="text-sm text-zinc-500 hover:text-zinc-300 mt-2 block text-center">See how it works →</Link>` below the existing `/login` link
  - [x] `Link` is already imported in both files — do NOT add duplicate imports

- [x] Task 6: Verify (AC: all)
  - [x] `bun tsc --noEmit` — zero new TypeScript errors
  - [x] FAQ section renders with ≥4 accordion items, all expand on click
  - [x] Closing CTA "Create your profile" button present and links to `/register`
  - [x] No lorem ipsum, no "TODO", no placeholder text anywhere in `tour.tsx`
  - [x] `/login` and `/register` both show a "See how it works →" link to `/tour`
  - [x] Test baseline unchanged: 369 pass / 46 fail (no server code changed)

## Dev Notes

### Files to Change

| File | Action |
|------|--------|
| `job-hunt-dashboard/src/client/components/ui/accordion.tsx` | Created by `bunx shadcn add accordion` — do NOT hand-edit |
| `job-hunt-dashboard/src/client/routes/tour.tsx` | Modified — add `FaqSection` and `ClosingCta` components; insert in `TourRoute` |
| `job-hunt-dashboard/src/client/routes/login.tsx` | Modified — add tour link |
| `job-hunt-dashboard/src/client/routes/register.tsx` | Modified — add tour link |

No new server files. No new CSS files. No new test files.

### Critical First Step: Install Accordion

The shadcn `Accordion` component is NOT present in `src/client/components/ui/`. Before writing any JSX:

```bash
cd job-hunt-dashboard
bunx shadcn add accordion
```

This generates `src/client/components/ui/accordion.tsx`. Do not create it manually — shadcn generates it from the project's Tailwind/CSS variables config. After installing, import with:

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
```

### Existing Imports in tour.tsx (already there — do not duplicate)

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ScoreBadge } from '../components/pipeline/ScoreBadge'
import { ActionChip } from '../components/pipeline/ActionChip'
```

Only add: `import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'`

### Current TourRoute Structure (simplified)

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
      <InteractiveDemo />
      {/* ADD HERE: */}
      <FaqSection />
      <ClosingCta />
    </div>
  )
}
```

### FAQ Component Structure

```tsx
function FaqSection() {
  return (
    <section className="py-24 border-t border-zinc-800/50">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-zinc-100 mb-10 text-center">
          Frequently asked questions
        </h2>
        <Accordion type="single" collapsible className="space-y-2">
          <AccordionItem value="security" className="border border-zinc-800 rounded-lg px-4">
            <AccordionTrigger className="text-zinc-100 hover:text-zinc-100 hover:no-underline py-4 text-sm font-medium text-left">
              How is my data secured?
            </AccordionTrigger>
            <AccordionContent className="text-zinc-400 text-sm pb-4 leading-relaxed">
              {/* See FAQ Content below */}
            </AccordionContent>
          </AccordionItem>
          {/* ... remaining items */}
        </Accordion>
      </div>
    </section>
  )
}
```

**Shadcn Accordion props:** `type="single" collapsible` allows one item open at a time and allows closing. Each `AccordionItem` needs a unique `value` prop (string). `AccordionTrigger` renders a `<button>` internally — do not nest `<button>` inside it.

### FAQ Content (substantive answers — use these verbatim or close)

**"How is my data secured?"**
HITLOBSTER runs entirely on your own server. Your job data, resume profile, and API keys live in a SQLite database on your machine — nothing is sent to HITLOBSTER's servers because there are no HITLOBSTER servers. In production, API keys are encrypted at rest using AES-256-GCM before being written to the database. HTTPS is handled by Nginx with Let's Encrypt certificates.

**"Do I need my own Claude API key?"**
Yes. HITLOBSTER uses your Anthropic API key to run the AI analysis pipeline — Fit Score, role fit summary, requirements breakdown, and cover letter generation all call the Claude API on your behalf. Your key is stored encrypted on your server and is never transmitted anywhere except directly to Anthropic. The cost of a typical job search run is a few cents per job analysed.

**"What job boards does it search?"**
HITLOBSTER currently supports LinkedIn, Indeed, and ARC (Work at a Startup). You configure search pairs — a job title and a location — and the discovery pipeline scrapes matching listings from each source on demand. Results are scored for semantic relevance to your resume profile before the full AI analysis runs.

**"How does email sync work?"**
Connect your IMAP inbox (Gmail, Outlook, or any IMAP-compatible provider) in the Config → Connections settings. HITLOBSTER does not scan your entire inbox — instead, you move relevant emails (recruiter outreach, application confirmations, interview invites) into a designated subfolder, then manually map them to jobs inside the app. Status transitions are logged in the job's status history.

### Closing CTA Component Structure

```tsx
function ClosingCta() {
  return (
    <section className="py-24 border-t border-zinc-800/50 text-center">
      <div className="max-w-2xl mx-auto px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-zinc-100 mb-4">
          Stop drowning in job boards.<br />Start making informed decisions.
        </h2>
        <p className="text-zinc-400 mb-10">
          Set up your profile once. Let HITLOBSTER do the searching, scoring, and sorting.
        </p>
        <Button asChild size="lg">
          <Link to="/register">Create your profile</Link>
        </Button>
      </div>
    </section>
  )
}
```

You may adjust the headline/subheadline copy as long as it:
- Echoes the hero's "Discover smarter. Apply faster. Track everything." theme
- Contains no placeholder text or TODO markers
- Does not introduce any new claims not already covered by the rest of the tour

### Tour Link on Login and Register Pages

**login.tsx** — current bottom of `<AuthFormCard>`:
```tsx
<Link to="/register" className="text-sm text-zinc-500 hover:text-zinc-300 mt-4 block text-center">
  Register with Invite Key
</Link>
```
Add immediately after it:
```tsx
<Link to="/tour" className="text-sm text-zinc-500 hover:text-zinc-300 mt-2 block text-center">
  See how it works →
</Link>
```

**register.tsx** — current bottom of `<AuthFormCard>`:
```tsx
<Link to="/login" className="text-sm text-zinc-500 hover:text-zinc-300 mt-4 block text-center">
  Already have an account? Sign in
</Link>
```
Add immediately after it:
```tsx
<Link to="/tour" className="text-sm text-zinc-500 hover:text-zinc-300 mt-2 block text-center">
  See how it works →
</Link>
```

`Link` is already imported in both files. Do NOT add duplicate imports.

### TypeScript Notes

- `noUnusedLocals` and `noUnusedParameters` are enabled — every declared variable, parameter, and import must be used
- Shadcn `AccordionItem`, `AccordionTrigger`, `AccordionContent` types are automatically correct — no casting needed
- `FaqSection` and `ClosingCta` are internal components in `tour.tsx` — define them below `InteractiveDemo` (following the established pattern where all sub-components are defined after `TourRoute`)
- No props interfaces needed for `FaqSection` or `ClosingCta` — they are self-contained

### Scope Boundaries

- Changes ONLY to: `tour.tsx`, `login.tsx`, `register.tsx`, and the shadcn-generated `accordion.tsx`
- Do NOT modify: `router.ts`, `index.css`, any server file, any other component, any test file
- Do NOT add a footer or global navigation component — the tour page has its own header
- Do NOT add `FadeInView` to `FaqSection` or `ClosingCta` — scroll animation is only on feature section visuals (44.2 pattern)
- Do NOT change the hero copy ("Discover smarter. Apply faster. Track everything.") — only add new sections

### Anti-Patterns to Avoid

- Do not hand-edit `accordion.tsx` — it is a shadcn-generated file; only install it via `bunx shadcn add accordion`
- Do not create a separate `FaqAccordion` file — all components go inside `tour.tsx` following the established pattern
- Do not use `<details>`/`<summary>` HTML elements — the AC requires shadcn Accordion specifically
- Do not import `Accordion` before running `bunx shadcn add accordion` — the component file won't exist yet
- Do not add `FadeInView` wrappers to FAQ or CTA sections — scroll animations are scoped to feature section visuals only
- Do not add a 5th FAQ question unless you have a truly substantive answer for it — 4 is sufficient per AC ("4–5 items")

### Learnings from Stories 44.1–44.3

**Pattern: internal component extraction.** All sub-components (`HeroMockup`, `MockupRow`, `FadeInView`, `FeatureSection2–5`, `InteractiveDemo`, `DemoTable`, `DemoDrawer`) are defined below `TourRoute` in the same file. Follow this pattern for `FaqSection` and `ClosingCta`.

**Pattern: section border separator.** Every major section uses `border-t border-zinc-800/50` to visually separate from the section above. Use `py-24` consistent with `InteractiveDemo`.

**Pattern: max-width containers.** Feature sections use `max-w-6xl`; hero uses `max-w-2xl`; demo uses `max-w-6xl`. FAQ and CTA use `max-w-3xl` (FAQ) and `max-w-2xl` (CTA) for narrower, more readable prose widths.

**TypeScript strict mode.** Previous stories confirmed `noUnusedLocals` and `noUnusedParameters` are active. Run `bun tsc --noEmit` before marking done.

**Test baseline.** After stories 44.1–44.3: 369 pass / 46 fail. This story adds only frontend JSX and modifies two auth pages — no server code changes, no new test files. Baseline must remain 369 pass / 46 fail.

**Review pattern from 44.3.** The 44.3 review found that the `tourRoute` had a `beforeLoad` redirecting authenticated users — this was fixed and removed. The current `router.ts` has `tourRoute` as a clean `createRoute({ getParentRoute: () => rootRoute, path: '/tour', component: TourRoute })` with no `beforeLoad`. Do NOT add any `beforeLoad` to `tourRoute`.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

Installed shadcn Accordion via `bunx shadcn add accordion` (generated `accordion.tsx`, added `@radix-ui/react-accordion`). Added `FaqSection` and `ClosingCta` as internal components to `tour.tsx` following the established pattern (defined below `MockupRow` at end of file). Inserted both after `<InteractiveDemo />` in `TourRoute`. Added "See how it works →" tour link to both `login.tsx` and `register.tsx` without duplicating existing imports. No new TypeScript errors introduced (pre-existing errors in unrelated files remain). Test baseline held at 369 pass / 46 fail.

### File List

| File | Action |
|------|--------|
| `job-hunt-dashboard/src/client/components/ui/accordion.tsx` | Created by shadcn |
| `job-hunt-dashboard/src/client/routes/tour.tsx` | Modified |
| `job-hunt-dashboard/src/client/routes/login.tsx` | Modified |
| `job-hunt-dashboard/src/client/routes/register.tsx` | Modified |

### Review Findings

- [x] [Review][Decision] Accordion animation keyframes missing — fixed: added `@keyframes accordion-down/up` and `--animate-accordion-*` theme variables to `index.css`. [`index.css`]
- [x] [Review][Patch] FaqSection Accordion missing `aria-labelledby` — fixed: added `id="faq-heading"` to `<h2>` and `aria-labelledby="faq-heading"` to `<Accordion>`. [`tour.tsx:627,630`]
- [x] [Review][Defer] Keyboard focus enters invisible DemoDrawer when closed [`tour.tsx:589`] — deferred, pre-existing from story 44.3
- [x] [Review][Defer] ChevronDown SVG has no explicit `aria-hidden` [`accordion.tsx:35`] — deferred, pre-existing shadcn pattern; lucide-react likely handles it
- [x] [Review][Defer] `hover:no-underline` override reliability without confirmed `tailwind-merge` in `cn` [`tour.tsx:632`] — deferred, pre-existing shadcn/cn concern across all trigger overrides
- [x] [Review][Defer] `InteractiveDemo` `lastJobRef` stale on React Strict Mode double-invoke [`tour.tsx:439`] — deferred, pre-existing from story 44.3

## Change Log

- 2026-06-12: Story created
- 2026-06-12: Implemented — shadcn Accordion installed; FaqSection and ClosingCta added to tour.tsx; tour link added to login.tsx and register.tsx
- 2026-06-12: Code review — 1 decision-needed, 1 patch, 4 deferred, 8 dismissed
