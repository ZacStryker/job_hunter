# Story 44.1: Tour Route Scaffold & Hero Section

Status: done

## Story

As a prospective user,
I want to navigate to `/tour` without logging in and see a compelling hero section,
So that I can understand what HITLOBSTER does and decide whether to sign up.

## Acceptance Criteria

1. **Given** I visit `/tour` while unauthenticated **When** the page loads **Then** I see the tour page (not a login redirect) **And** no session fetch is triggered by the route.

2. **Given** the `/tour` route in `router.ts` **When** it is registered **Then** it is a direct child of `rootRoute` (not `protectedRoute`), with no `beforeLoad` function.

3. **Given** the hero section **When** I view it **Then** it displays a headline, a single-line value proposition, and two CTAs: a primary "Get started" button (links to `/register`) and a secondary "See how it works ↓" anchor that smooth-scrolls to the first feature section.

4. **Given** the hero visual **When** I view it **Then** it shows a static HTML/JSX mockup of the Matches table with an open Job Drawer, including a Fit Score badge (e.g. 84), a Reqs Met list (3 items), a Reqs Missed list (1 item), and a Recommendation pill showing "Apply".

5. **Given** the tour page **When** it renders **Then** it uses the app's existing dark-mode CSS variables and Tailwind config — no new global CSS files are introduced.

6. **Given** the tour page in the router tree **When** any existing authenticated route is accessed **Then** its behavior is unchanged — no modifications to `protectedRoute`, `Layout`, or any existing route component.

## Tasks / Subtasks

- [x] Task 1: Create `src/client/routes/tour.tsx` — TourRoute component (AC: #1–5)
  - [x] Create `TourRoute` function (PascalCase, `.tsx`, matches naming convention)
  - [x] Hero section: headline ("Discover smarter. Apply faster. Track everything."), value proposition, and two CTAs
  - [x] Primary CTA: `<Link to="/register">` using TanStack Router `Link` — not a bare `<a>` tag
  - [x] Secondary CTA: `<a href="#features">` anchor for smooth-scroll (CSS `scroll-behavior: smooth` on the `html` element already applies; use a plain anchor tag with `href="#features"`)
  - [x] Static hero visual: JSX mockup of Matches table + open Job Drawer (see Dev Notes for exact structure)
  - [x] Use existing Tailwind dark-mode color tokens only (`bg-zinc-900`, `text-zinc-100`, `border-zinc-800`, etc.)
  - [x] Import and use `ScoreBadge` and `ActionChip` from their existing locations — do NOT recreate the badge/chip CSS logic

- [x] Task 2: Register route in `src/client/lib/router.ts` (AC: #2, #6)
  - [x] Import `TourRoute` from `../routes/tour`
  - [x] Create `tourRoute` with `getParentRoute: () => rootRoute`, `path: '/tour'`, `component: TourRoute` — **no `beforeLoad`**
  - [x] Add `tourRoute` to the `routeTree` array as a direct sibling of `loginRoute`, `registerRoute`, etc.
  - [x] Do NOT touch `protectedRoute`, `loginRoute`, `registerRoute`, `onboardingRoute`, or any other existing route

- [x] Task 3: Verify (AC: all)
  - [x] `bun tsc --noEmit` — zero new TypeScript errors in tour.tsx or router.ts (pre-existing errors in unrelated files unchanged)
  - [x] Route is a direct child of `rootRoute` with no `beforeLoad` — confirmed in router.ts
  - [x] Both CTAs present: primary `<Link to="/register">` and secondary `<a href="#features">`
  - [x] Static mockup: ScoreBadge(84) + ActionChip("apply") + 3 Requirements Met + 1 Requirements Missed
  - [x] No regressions: 369 pass / 46 fail (baseline was 369 pass / 46 fail without changes)

### Review Findings

- [x] [Review][Decision] CSS vs Tailwind approach for scroll-behavior — resolved: keep in `index.css` (consistent with existing global element base styles); add `prefers-reduced-motion` override inline → see Patch below
- [x] [Review][Decision] Recommendation pill text case — resolved: dismissed as spec gap; `ActionChip` rendering is pre-existing app behavior
- [x] [Review][Patch] `scroll-behavior: smooth` missing `prefers-reduced-motion` guard — fixed: added `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }` to index.css [index.css:56]
- [x] [Review][Patch] HeroMockup silently clips on narrow viewports — fixed: changed `overflow-hidden` to `overflow-x-auto` so the mockup scrolls horizontally rather than clipping on narrow screens [tour.tsx:53]
- [x] [Review][Defer] Authenticated users see marketing header with no auth state awareness [tour.tsx:12] — deferred, out of scope for 44.1; UX improvement for a later story
- [x] [Review][Defer] Hardcoded brand name "HITLOBSTER" in component literal [tour.tsx:11] — deferred, pre-existing pattern across route files

## Dev Notes

### Route Registration Pattern

All public routes in the router follow this exact pattern:

```typescript
const tourRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tour',
  component: TourRoute,
  // NO beforeLoad — this is the key difference from loginRoute/registerRoute
})
```

Then add to `routeTree`:
```typescript
const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  registerPendingRoute,
  onboardingRoute,
  tourRoute,           // <-- add here
  protectedRoute.addChildren([...]),
])
```

`loginRoute` and `registerRoute` both have a `beforeLoad` that redirects to `/` if session is active. The `/tour` route must NOT have this — an authenticated user viewing `/tour` should see the page, not get redirected.

### File Location and Export Pattern

- New file: `job-hunt-dashboard/src/client/routes/tour.tsx`
- Export: `export function TourRoute() { ... }`
- Import in router: `import { TourRoute } from '../routes/tour'`
- Matches the naming convention of `LoginRoute`, `RegisterRoute`, etc.

### Reuse Existing Components

`ScoreBadge` and `ActionChip` are **pure display components** (no hooks, no API calls) — import them directly:

```typescript
import { ScoreBadge } from '../components/pipeline/ScoreBadge'
import { ActionChip } from '../components/pipeline/ActionChip'
```

They accept typed props from `Job` schema. For the static mockup, pass values directly:

```tsx
<ScoreBadge score={84} />
<ActionChip recommendation="apply" />
```

`ScoreBadge` color thresholds: `≥75` → emerald, `≥50` → amber, `<50` → red. A score of 84 renders green (`border-emerald-600 text-emerald-400`).

`ActionChip` chip styles: `apply` → `bg-blue-950 text-blue-300`, `investigate` → `bg-amber-950 text-amber-300`, `skip` → `bg-zinc-800 text-zinc-400`.

### Static Hero Mockup Structure

The hero visual should be a non-interactive JSX representation of the Matches view with a Job Drawer open. Key points:

- **Do NOT import or render the real `PipelineTable` or `JobDrawer`** — those import hooks and query clients
- Build a self-contained JSX layout using raw Tailwind only
- Mirror the visual style of the real drawer: `bg-zinc-900`, `border-zinc-800`, `text-zinc-100`, etc.
- The mockup should look like a screenshot, not a live interactive element (no click handlers needed in the hero)

Suggested structure for the mockup:
```tsx
{/* Outer container — simulate split layout */}
<div className="flex rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden shadow-xl">
  {/* Left: table-style job list (3-4 static rows) */}
  <div className="flex-1 min-w-0">
    {/* Table header row */}
    <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
      <span>Company</span><span>Role</span><span>Score</span><span>Match</span>
    </div>
    {/* Selected row — highlighted */}
    <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-4 py-2.5 bg-zinc-800 border-l-2 border-blue-500">
      <span className="text-sm text-zinc-100">Stripe</span>
      <span className="text-sm text-zinc-200">Senior SWE</span>
      <ScoreBadge score={84} />
      <ActionChip recommendation="apply" />
    </div>
    {/* Other rows */}
    ...
  </div>
  {/* Right: Job Drawer mockup */}
  <div className="w-64 border-l border-zinc-800 p-4 space-y-3">
    <p className="text-xs text-zinc-500 uppercase">Stripe</p>
    <p className="text-base font-semibold text-zinc-100">Senior SWE</p>
    <div className="flex gap-2"><ScoreBadge score={84} /><ActionChip recommendation="apply" /></div>
    {/* Analysis fields */}
    <div><p className="text-xs text-zinc-500 uppercase">Requirements Met</p>
      <ul className="mt-1 space-y-0.5 text-sm text-zinc-200">
        <li>• 5+ years TypeScript</li>
        <li>• Distributed systems exp.</li>
        <li>• Payment systems background</li>
      </ul>
    </div>
    <div><p className="text-xs text-zinc-500 uppercase">Requirements Missed</p>
      <ul className="mt-1 text-sm text-zinc-400">
        <li>• Go experience preferred</li>
      </ul>
    </div>
  </div>
</div>
```

This is a rough sketch — tune the layout to look polished. The visual only needs to show the key fields from the AC: Fit Score badge (84), Reqs Met (3 items), Reqs Missed (1 item), Recommendation pill ("Apply").

### Smooth Scroll CTA

The secondary CTA links to `#features` — the first feature section in story 44.2 will have `id="features"` on it. For this story, add a placeholder `<div id="features" className="pt-16">` at the bottom of the hero section or at the start of the content area so the scroll target exists (even if 44.2 content isn't built yet).

Use a plain `<a>` tag for the anchor (not TanStack's `Link`):
```tsx
<a href="#features" className="...">See how it works ↓</a>
```

### Navigation Link to /register

Use TanStack Router's `Link` component for all internal route navigation (consistent with the rest of the app):

```tsx
import { Link } from '@tanstack/react-router'

<Link to="/register" className="...">Get started</Link>
```

### TanStack Router Type Augmentation

The `declare module '@tanstack/react-router'` block in `router.ts` must remain. No changes needed — adding a new route doesn't require modifying that declaration.

### No Global CSS

All styling must use Tailwind utility classes. The app uses `@tailwindcss/vite` (no PostCSS config). Do not create a `.css` file for the tour page.

The `html` element already has `scroll-behavior: smooth` applied via the app's global styles (or add it as a Tailwind class `scroll-smooth` on a wrapper `div` if needed).

### TypeScript Strict Mode Note

- `noUnusedLocals` and `noUnusedParameters` are enabled — every imported symbol must be used
- No `_` prefix unless genuinely intentional

### Scope Boundary

This story's scope ends at: the `/tour` route is accessible and renders a hero section with static mockup. The hero section should visually be complete and polished but the page beyond the hero (sections, demo, FAQ) is NOT part of this story — those are 44.2–44.4.

Add an `id="features"` anchor div at the bottom of what the tour page renders so the "See how it works ↓" CTA has a valid scroll target even before 44.2 is built. Stub with empty content.

## Dev Agent Record

### Completion Notes

Implemented all 3 tasks. Key decisions:
- `TourRoute` is composed of a minimal nav header, centered hero section, and a `HeroMockup` sub-component. Two additional internal components (`MockupRow`) keep the mockup self-contained and type-safe.
- `ScoreBadge` and `ActionChip` are imported directly — both are pure display components with no hooks or API calls, safe to use in a static mockup context.
- Selection indicator on the mockup row uses `ring-1 ring-inset ring-blue-500/30` + `bg-zinc-800` to avoid absolute-positioning edge cases in CSS Grid.
- `scroll-behavior: smooth` added to `html {}` in `index.css` — this is a global improvement that makes the `#features` anchor scroll work correctly. Not a new file.
- `tourRoute` has no `beforeLoad` — authenticated users visiting `/tour` see the page, not a redirect.
- Added `<div id="features" />` stub at the bottom as the scroll target for the "See how it works ↓" CTA; story 44.2 will populate content there.
- Test baseline: 369 pass / 46 fail before and after changes — zero impact from frontend-only additions.

## File List

| File | Action |
|------|--------|
| `job-hunt-dashboard/src/client/routes/tour.tsx` | Created — TourRoute, HeroMockup, MockupRow components |
| `job-hunt-dashboard/src/client/lib/router.ts` | Modified — added TourRoute import, tourRoute constant, tourRoute in routeTree |
| `job-hunt-dashboard/src/client/index.css` | Modified — added `html { scroll-behavior: smooth; }` |

## Change Log

- 2026-06-12: Story implemented — created `/tour` route with hero section, static Matches mockup with Job Drawer, TanStack Router navigation links, and smooth-scroll anchor

## Architecture Compliance

- Route file: `src/client/routes/tour.tsx` (follows existing route file pattern)
- Component name: `TourRoute` (PascalCase.tsx naming convention)
- No server-side changes; no database changes; no API routes
- No new npm packages required
- No changes to `src/shared/schemas.ts`
- TanStack Router: `Link` for internal nav, plain `<a>` for hash anchors
- shadcn/ui `Button` component can be used for CTA buttons (already available at `@/components/ui/button`)

## Test Baseline

Previous story context: 403 passing, 12 pre-existing failures. This story adds no server-side code and no logic requiring tests. No new test files are needed.

`bun tsc --noEmit` should pass with zero new errors after this story.
