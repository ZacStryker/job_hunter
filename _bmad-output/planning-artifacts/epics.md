---
stepsCompleted: [step-01, step-02, step-03, step-04]
inputDocuments:
  - "Epic brief (provided via command arguments — Epic 44: Public-facing Tour Page)"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/architecture-distillate.md"
  - "_bmad-output/planning-artifacts/ux-design-specification/index.md"
---

# HITLOBSTER - Epic 44: Public-Facing Tour Page

## Overview

This document captures the requirements and story breakdown for Epic 44 — a public-facing /tour route that communicates HITLOBSTER's core value proposition to unauthenticated visitors and converts them to signups. No changes to authenticated routes or backend.

## Requirements Inventory

### Functional Requirements

FR1: A public /tour route is accessible without authentication — no beforeLoad session check, no redirect to /login; mounted directly on rootRoute (same level as loginRoute, registerRoute).

FR2: Hero section — final-draft headline, 1-line value prop, primary "Get started" CTA (→ /register), secondary "See how it works ↓" CTA that smooth-scrolls / anchors to section 2.

FR3: Hero visual — static HTML/JSX mockup of the Matches table with an open Job Drawer showing a Fit Score badge, Reqs Met/Missed list, and a Recommendation pill.

FR4: Feature section — Job Discovery & Pre-Scoring (text right / visual left) — copy describes configuring job title+location search pairs and relevance pre-scoring before the full AI pipeline; visual: Config screen mockup with search pairs + discovery results list with Relevance Score badges.

FR5: Feature section — AI Analysis & Fit Score (text left / visual right; star feature / largest section) — copy describes full job description sent to Claude with candidate profile → Fit Score (0–100), role fit summary, Reqs Met, Reqs Missed, Red Flags, Recommendation (skip/investigate/apply); visual: full Job Drawer mockup with all analysis fields; three sample score badges in green/amber/red showing the scoring range.

FR6: Feature section — Tailored Document Generation (text right / visual left) — copy describes one-click resume + cover letter generation from the Job Drawer, tailored to the specific job description, stored against the job record, with visual preview and download; mentions dynamic 1/2-page resume layout; visual: Generate button in drawer alongside rendered resume preview.

FR7: Feature section — Application Tracking & Email Sync (text left / visual right) — copy describes marking jobs applied, connecting IMAP inbox, moving emails into designated subfolders, manually mapping messages to jobs, status history timeline in the drawer; copy explicitly does NOT imply automatic status detection (mapping is manual); visual: Applications view with Applied→Screening→Interview status badges + status history timeline.

FR8: Interactive demo section — fully static React component; hardcoded demoJobs data (5 jobs: mix of Apply/Investigate/Skip recommendations); no API calls, no auth; functional Matches view replica using TanStack Table v8 + shadcn/ui; row click opens a sliding Job Drawer with pre-written analysis for that specific job; Drawer bottom CTA "Analyse your own profile →" links to /register.

FR9: FAQ + Closing CTA section — 4–5 shadcn Accordion items covering: "How is my data secured?", "Do I need my own Claude API key?", "What job boards does it search?", "How does email sync work?" plus a closing "Create your profile" CTA button (→ /register).

FR10: All copy across all 7 sections is final-draft quality per the section descriptions in the brief — zero lorem ipsum placeholder text anywhere.

### NonFunctional Requirements

NFR1: /tour route is registered under rootRoute in router.ts with no beforeLoad — not nested inside protectedRoute.

NFR2: Zero modifications to existing authenticated routes, layouts, or components.

NFR3: Interactive demo has no backend dependency — no TanStack Query hooks, no session hooks, no app-level state, all data is inline constants.

NFR4: Interactive demo may reuse shadcn/ui primitives and TanStack Table directly; it MUST NOT import app-level query hooks (useJobsQuery, etc.) or read/write the localStorage key "job-hunt-column-visibility".

NFR5: Scroll-triggered animations on feature section visuals use pure CSS only (CSS transitions + @keyframes via Intersection Observer or CSS animation-timeline) — no JS animation libraries.

NFR6: Feature section visuals are static HTML/JSX mockups — no live data fetching.

NFR7: No new backend routes, database schema changes, or migrations required.

NFR8: Tour page uses the app's existing dark-mode Tailwind design system — same CSS variables, same semantic color tokens (--score-high, --score-mid, --score-low), no new global CSS files introduced.

### Additional Requirements

- Route registration: add tourRoute to rootRoute.addChildren([...]) in router.ts alongside loginRoute, registerRoute (before protectedRoute block)
- Component naming: PascalCase.tsx (TourPage, TourHeroSection, TourDemoSection, TourFaqSection, etc.)
- Route file: src/client/routes/tour.tsx (kebab-case, matching convention)
- Demo table state is isolated: no shared QueryClient, no shared column visibility state
- Browser target: Firefox latest only (no polyfills for other browsers)
- Hono server: no changes required — /tour is a SPA client-side route, Nginx already serves the SPA for all non-/api/* paths

### UX Design Requirements

UX-DR1: Tour page uses the app's dark-mode base (same globals.css variables, same Tailwind config) — no separate light theme.

UX-DR2: Semantic color tokens used for score badges throughout the tour (emerald-500 ≥80, amber-400 60–79, red-500 <60) — consistent with FitScoreBadge in the app.

UX-DR3: Feature sections alternate text-right/visual-left vs text-left/visual-right layout across sections 2–5 for visual rhythm.

UX-DR4: Interactive demo replicates the visual language of the Matches view (same table density, score badge colors, drawer layout) but is visually framed as a contained demo — browser chrome mockup, rounded container with a subtle border/shadow, or an explicit "Interactive Demo" label — so visitors clearly understand it is not the live app interface.

UX-DR5: Scroll-triggered animations: feature section visuals enter with fade-in + slide-up (opacity 0→1, translateY 24px→0) triggered on viewport intersection.

### FR Coverage Map

```
FR1:  Epic 44 — Public /tour route registered on rootRoute, no auth guard
FR2:  Epic 44 — Hero section: headline, value prop, dual CTAs
FR3:  Epic 44 — Hero visual: static Matches table + Job Drawer mockup
FR4:  Epic 44 — Feature section: Job Discovery & Pre-Scoring
FR5:  Epic 44 — Feature section: AI Analysis & Fit Score (star section)
FR6:  Epic 44 — Feature section: Tailored Document Generation
FR7:  Epic 44 — Feature section: Application Tracking & Email Sync
FR8:  Epic 44 — Interactive demo: static TanStack Table + Job Drawer, 5 seed jobs
FR9:  Epic 44 — FAQ accordion + closing CTA
FR10: Epic 44 — Final-draft copy across all 7 sections (no lorem ipsum)

NFR1–NFR8: Epic 44 — Route isolation, zero backend deps, CSS-only animation,
            design system consistency
UX-DR1–UX-DR5: Epic 44 — Dark mode, semantic tokens, alternating layout,
                demo framing, scroll animations
```

## Epic List

### Epic 44: Public-Facing Tour Page
Unauthenticated visitors can navigate to `/tour` and experience a polished, scroll-driven marketing page that communicates HITLOBSTER's core workflow, interact with a live demo of the Matches view, and follow a CTA to register.

**FRs covered:** FR1–FR10
**NFRs covered:** NFR1–NFR8
**UX-DRs covered:** UX-DR1–UX-DR5

---

## Epic 44: Public-Facing Tour Page

Unauthenticated visitors can navigate to `/tour` and experience a polished, scroll-driven marketing page that communicates HITLOBSTER's core workflow, interact with a live demo of the Matches view, and follow a CTA to register.

### Story 44.1: Tour Route Scaffold & Hero Section

As a prospective user,
I want to navigate to `/tour` without logging in and see a compelling hero section,
So that I can understand what HITLOBSTER does and decide whether to sign up.

**Acceptance Criteria:**

**Given** I visit `/tour` while unauthenticated
**When** the page loads
**Then** I see the tour page (not a login redirect)
**And** no session fetch is triggered by the route

**Given** the `/tour` route in `router.ts`
**When** it is registered
**Then** it is a direct child of `rootRoute` (not `protectedRoute`), with no `beforeLoad` function

**Given** the hero section
**When** I view it
**Then** it displays a headline, a single-line value proposition, and two CTAs: a primary "Get started" button (links to `/register`) and a secondary "See how it works ↓" anchor that smooth-scrolls to the first feature section

**Given** the hero visual
**When** I view it
**Then** it shows a static HTML/JSX mockup of the Matches table with an open Job Drawer, including a Fit Score badge (e.g. 84), a Reqs Met list (3 items), a Reqs Missed list (1 item), and a Recommendation pill showing "Apply"

**Given** the tour page
**When** it renders
**Then** it uses the app's existing dark-mode CSS variables and Tailwind config — no new global CSS files are introduced

**Given** the tour page in the router tree
**When** any existing authenticated route is accessed
**Then** its behavior is unchanged — no modifications to `protectedRoute`, `Layout`, or any existing route component

### Story 44.2: Feature Sections 2–5 — Static Content & Scroll Animations

As a prospective user,
I want to scroll through four feature sections explaining discovery, AI analysis, document generation, and application tracking,
So that I understand HITLOBSTER's full workflow before deciding to sign up.

**Acceptance Criteria:**

**Given** feature section 2 — Job Discovery & Pre-Scoring
**When** I view it
**Then** it is laid out text-right / visual-left; copy explains configuring job title+location search pairs and relevance pre-scoring before the full AI pipeline; visual is a static mockup of the Config screen showing search pairs and a discovery results list with Relevance Score badges

**Given** feature section 3 — AI Analysis & Fit Score
**When** I view it
**Then** it is laid out text-left / visual-right and is visually the largest feature section; copy explains the Claude LLM pipeline output (Fit Score 0–100, role fit summary, Reqs Met, Reqs Missed, Red Flags, Recommendation); visual is a full Job Drawer mockup showing all analysis fields; three sample score badges are shown: one green (≥80), one amber (60–79), one red (<60), using the app's semantic color tokens

**Given** feature section 4 — Tailored Document Generation
**When** I view it
**Then** it is laid out text-right / visual-left; copy explains one-click resume and cover letter generation from the Job Drawer, tailored to the specific job description, stored against the job record, with visual preview and download, and mentions the dynamic 1/2-page resume layout; visual shows a Generate button in the drawer alongside a rendered resume preview

**Given** feature section 5 — Application Tracking & Email Sync
**When** I view it
**Then** it is laid out text-left / visual-right; copy explains marking jobs as applied, connecting an IMAP inbox, moving emails into designated subfolders, and manually mapping messages to jobs; copy does NOT state or imply that status changes are detected automatically; visual shows the Applications view with Applied→Screening→Interview status badges and a status history timeline in the drawer

**Given** any feature section visual
**When** it enters the viewport during scroll
**Then** it animates in with a fade + slide-up effect (opacity 0→1, translateY 24px→0) using pure CSS (no JS animation libraries added)

**Given** no browser scroll activity
**When** a feature section visual is off-screen
**Then** it remains in its pre-animation state (invisible / translated) until it enters the viewport

**Given** all four feature sections
**When** I scan the page
**Then** their text/visual sides strictly alternate (right, left, right, left) and no lorem ipsum text appears anywhere

### Story 44.3: Interactive Demo

As a prospective user,
I want to interact with a live demo of the Matches view — without creating an account,
So that I can experience the product's core interface before committing to sign up.

**Acceptance Criteria:**

**Given** the interactive demo section
**When** it renders
**Then** it displays a visually contained component — using a rounded border, subtle shadow, and/or an explicit "Interactive Demo" label — that is clearly distinguishable from a live app interface

**Given** the demo
**When** the page loads
**Then** zero API calls, zero session fetches, and zero TanStack Query hooks from the main app are invoked; all data is inline constants defined within the demo component tree

**Given** the demo table
**When** I view it
**Then** it shows exactly 5 hardcoded jobs with a mix of recommendations: at least one "Apply", at least one "Investigate", and at least one "Skip"; each row shows company, job title, Fit Score badge, and Recommendation chip using the same semantic color tokens as the real app

**Given** a demo job row
**When** I click it
**Then** a Job Drawer slides in from the right showing the pre-written analysis for that specific job: Fit Score, role fit summary, Reqs Met (2–3 items), Reqs Missed (1–2 items), Red Flags (0–1 items), and a Recommendation pill

**Given** the demo Job Drawer
**When** it is open
**Then** a CTA at the bottom reads "Analyse your own profile →" and links to `/register`

**Given** the demo table
**When** it renders
**Then** it does NOT read from or write to the `localStorage` key `"job-hunt-column-visibility"` (uses isolated in-component state only)

**Given** any app-level query hook or mutation (e.g. `useJobsQuery`, `useJobMutation`)
**When** the demo renders
**Then** none of those hooks are imported or called within the demo component tree

### Story 44.4: FAQ Section, Closing CTA & Copy Finalization

As a prospective user,
I want to read answers to common questions and be given a final invitation to sign up,
So that any hesitation is addressed and I can take the next step.

**Acceptance Criteria:**

**Given** the FAQ section
**When** I view it
**Then** it contains a shadcn Accordion with exactly 4–5 items covering these topics: "How is my data secured?", "Do I need my own Claude API key?", "What job boards does it search?", and "How does email sync work?"

**Given** a FAQ accordion item
**When** I click it
**Then** it expands to show a substantive answer to that question (no lorem ipsum or placeholder text)

**Given** the closing CTA block beneath the FAQ
**When** I view it
**Then** it includes a headline that echoes the hero section's message and a prominent "Create your profile" button that links to `/register`

**Given** the complete tour page from hero to closing CTA
**When** I read through all sections
**Then** every piece of copy is final-draft quality as specified in the epic brief — no lorem ipsum, no placeholder text, no "TODO" markers anywhere on the page

**Given** the `/tour` route
**When** it is navigated to from `/login` or `/register`
**Then** a link or nav item is present on those public pages to surface the tour to unauthenticated visitors discovering the app for the first time
