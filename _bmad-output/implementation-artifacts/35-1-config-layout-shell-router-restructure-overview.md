# Story 35.1: Config Layout Shell, Router Restructure & Overview Page

Status: done

## Story

As a user in the Config section,
I want a persistent left nav and a landing overview page when I navigate to Config,
so that I can immediately see all configuration areas and navigate directly to any section.

## Acceptance Criteria

1. **Given** the user clicks "Config" in the top nav, **When** the `/config` route loads, **Then** the page renders a left nav (Profile, Job Sources, Prompts, Logs) and a 4-tile overview grid (one tile per section).

2. **Given** the user is on any `/config/*` page, **When** they look at the screen, **Then** the left nav is visible, with the active section link visually distinguished from inactive links.

3. **Given** the user clicks a left nav link (e.g., "Job Sources"), **When** the link activates, **Then** the URL changes to `/config/job-sources` and the section overview page renders inside the content area.

4. **Given** the `/config` overview page is rendered and profile data, onboarding status, search configs, and prompts are loaded, **Then** each section tile displays the correct status badge:
   - Profile tile: "Configured" if `hasAnthropicKey` AND `profile.name` is set (non-null, non-empty) AND `hasImap`; otherwise "Incomplete"
   - Job Sources tile: "Configured" if `hasLinkedinAuth` AND at least one search config exists; otherwise "Incomplete"
   - Prompts tile: "Configured" if at least one prompt has `isCustom: true`; otherwise "Incomplete"
   - Logs tile: no badge — always shows "View logs →"

5. **Given** the old routes `/profile`, `/prompts`, and `/logs` exist in the router, **When** this story is complete, **Then** those three routes are removed from `router.ts`; any references to them are removed.

6. **Given** the TanStack Router `_config` pathless layout route wraps all `/config/*` routes, **When** a user navigates directly to a deep URL like `/config/profile/resume`, **Then** the left nav renders correctly and the correct subpage content is shown.

## Tasks / Subtasks

- [x] Task 1 — Add `fetchOnboardingStatus` export to hook file (AC: 4)
  - [x] In `src/client/hooks/useOnboardingStatusQuery.ts`, add `export async function fetchOnboardingStatus()` that fetches `/api/onboarding/status`; same pattern as `fetchProfile`, `fetchPrompts`, `fetchSearchConfigs`

- [x] Task 2 — Create `ConfigLayout` component (AC: 1, 2, 3, 6)
  - [x] Create `src/client/routes/config/layout.tsx` exporting `ConfigLayout`
  - [x] Layout: outer `div` with `flex h-full`; left nav `<nav>` with `w-52 shrink-0 border-r border-zinc-800 p-4 space-y-1`; content `<main>` with `flex-1 overflow-auto`
  - [x] Left nav contains 4 `<Link>` entries: "Profile" → `/config/profile`, "Job Sources" → `/config/job-sources`, "Prompts" → `/config/prompts`, "Logs" → `/config/logs`
  - [x] Each nav `Link` uses `activeOptions={{ exact: false }}` so "Profile" stays active on `/config/profile/resume`
  - [x] Active link style: `text-zinc-100 font-medium`; inactive: `text-zinc-400 hover:text-zinc-200`; both: `block px-3 py-2 rounded text-sm transition-colors`
  - [x] Content area renders `<Outlet />`

- [x] Task 3 — Create Config overview page (AC: 1, 4)
  - [x] Create `src/client/routes/config/overview.tsx` exporting `ConfigOverviewRoute`
  - [x] Use `useOnboardingStatusQuery`, `useProfileQuery`, `useSearchConfigsQuery`, `usePromptsQuery` (data is pre-loaded by router loader — all calls return synchronously from cache)
  - [x] Render page heading `<h1>Config</h1>` + a 4-tile grid: `grid grid-cols-2 gap-6`
  - [x] Each tile: `border border-zinc-800 rounded-lg p-4` with a title and status badge (or "View logs →" for Logs)
  - [x] Profile tile: clickable, navigates to `/config/profile`; status badge: "Configured" (emerald-600 bg, emerald-100 text) if `hasAnthropicKey && profile?.name && hasImap`, else "Incomplete" (zinc-700 bg, zinc-300 text)
  - [x] Job Sources tile: navigates to `/config/job-sources`; "Configured" if `hasLinkedinAuth && searchConfigs.length > 0`, else "Incomplete"
  - [x] Prompts tile: navigates to `/config/prompts`; "Configured" (use label "Edited" per epic) if `prompts.some(p => p.isCustom)`, else "Incomplete" (use label "Default")
  - [x] Logs tile: navigates to `/config/logs`; no badge — only "View logs →" text in zinc-500
  - [x] Tile click: use `<Link>` wrapping each tile (or `useNavigate` on role="button" div — prefer `<Link>`)

- [x] Task 4 — Create stub section routes (AC: 3, 6)
  - [x] Create `src/client/routes/config/profile-index.tsx` exporting `ConfigProfileIndexRoute` — renders `<p className="p-6 text-zinc-400">Coming soon</p>`
  - [x] Create `src/client/routes/config/job-sources-index.tsx` exporting `ConfigJobSourcesIndexRoute` — same stub
  - [x] Create `src/client/routes/config/prompts-index.tsx` exporting `ConfigPromptsIndexRoute` — same stub
  - [x] Create `src/client/routes/config/logs.tsx` exporting `ConfigLogsRoute` — same stub (will be replaced in story 35.6)

- [x] Task 5 — Restructure `router.ts` (AC: 1–6)
  - [x] Add `fetchOnboardingStatus` import from `useOnboardingStatusQuery`
  - [x] Add imports for `ConfigLayout`, `ConfigOverviewRoute`, `ConfigProfileIndexRoute`, `ConfigJobSourcesIndexRoute`, `ConfigPromptsIndexRoute`, `ConfigLogsRoute`
  - [x] Remove imports for `ConfigRoute`, `ProfileRoute`, `PromptsRoute`, `HistoryRoute`
  - [x] Create `configLayoutRoute` — pathless layout route: `createRoute({ getParentRoute: () => protectedRoute, id: '_config', component: ConfigLayout })`
  - [x] Create `configOverviewRoute` — path `/config`, child of `configLayoutRoute`; loader: `Promise.all([fetchProfile, fetchOnboardingStatus, fetchSearchConfigs, fetchPrompts, fetchSourceSettings].map(fn => queryClient.ensureQueryData({ queryKey: queryKeyFor(fn), queryFn: fn })))`
  - [x] Create `configProfileRoute` — path `/config/profile`, child of `configLayoutRoute`, component `ConfigProfileIndexRoute`
  - [x] Create `configJobSourcesRoute` — path `/config/job-sources`, child of `configLayoutRoute`, component `ConfigJobSourcesIndexRoute`
  - [x] Create `configPromptsRoute` — path `/config/prompts`, child of `configLayoutRoute`, component `ConfigPromptsIndexRoute`
  - [x] Create `configLogsRoute` — path `/config/logs`, child of `configLayoutRoute`, component `ConfigLogsRoute`
  - [x] Remove `configRoute`, `profileRoute`, `promptsRoute`, `historyRoute` route declarations
  - [x] Update `routeTree`: replace `configRoute, profileRoute, promptsRoute, historyRoute` with `configLayoutRoute.addChildren([configOverviewRoute, configProfileRoute, configJobSourcesRoute, configPromptsRoute, configLogsRoute])`

- [x] Task 6 — Verify Layout.tsx top nav still works (AC: 2)
  - [x] Confirm the "Config" `<Link to="/config">` in `Layout.tsx` uses `activeOptions={{ exact: false }}` (or verify that TanStack Router auto-marks it active on `/config/*` sub-routes); if not, add `activeOptions={{ exact: false }}` to the Config nav link

## Dev Notes

### TanStack Router Pathless Layout Route Pattern

The existing `_protected` route in `router.ts` is the canonical example of a pathless layout route in this codebase:

```typescript
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_protected',        // id without path = pathless layout route
  component: Layout,
  beforeLoad: async () => { ... },
})
```

Follow the same pattern for `_config`:

```typescript
const configLayoutRoute = createRoute({
  getParentRoute: () => protectedRoute,
  id: '_config',
  component: ConfigLayout,
})
```

All `/config/*` routes become children of `configLayoutRoute`, NOT of `protectedRoute` directly:

```typescript
const configOverviewRoute = createRoute({
  getParentRoute: () => configLayoutRoute,   // ← child of layout, not protectedRoute
  path: '/config',
  component: ConfigOverviewRoute,
  loader: () => Promise.all([...])
})
```

In the `routeTree`, `configLayoutRoute` goes inside `protectedRoute.addChildren([...])`, and its children go inside `configLayoutRoute.addChildren([...])`:

```typescript
const routeTree = rootRoute.addChildren([
  loginRoute,
  ...,
  protectedRoute.addChildren([
    dashboardRoute,
    indexRoute,
    ...,
    adminUsersRoute,
    configLayoutRoute.addChildren([
      configOverviewRoute,
      configProfileRoute,
      configJobSourcesRoute,
      configPromptsRoute,
      configLogsRoute,
    ]),
  ]),
])
```

### Router Loader for `/config` Overview

The loader must fetch all 4 data sources in parallel. Use existing named fetch functions — do NOT inline `fetch()` calls in the loader. Precise query key alignment with the hook definitions:

```typescript
const configOverviewRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config',
  component: ConfigOverviewRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
    queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
    queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs }),
    queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
  ]),
})
```

Note: `source-settings` is NOT needed for the overview page (only needed for the Job Sources section in later stories).

### Adding `fetchOnboardingStatus` to the Hook

`useOnboardingStatusQuery.ts` currently does not export a standalone fetch function (unlike `fetchProfile`, `fetchPrompts`, `fetchSearchConfigs`). Add one:

```typescript
export async function fetchOnboardingStatus(): Promise<OnboardingStatusResponse> {
  const res = await fetch('/api/onboarding/status')
  if (!res.ok) throw new Error('Failed to load onboarding status')
  return res.json() as Promise<OnboardingStatusResponse>
}
```

The existing `useOnboardingStatusQuery` hook can call this function via `queryFn: fetchOnboardingStatus` (remove the inline queryFn to avoid duplication).

### ConfigLayout Left Nav — Active Link Behavior

TanStack Router's `<Link>` uses `exact` matching by default. A link to `/config/profile` would NOT be marked active when on `/config/profile/resume`. Use `activeOptions={{ exact: false }}` on all config nav links:

```tsx
<Link
  to="/config/profile"
  activeOptions={{ exact: false }}
  className="block px-3 py-2 rounded text-sm transition-colors"
  activeProps={{ className: 'text-zinc-100 font-medium bg-zinc-800' }}
  inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
>
  Profile
</Link>
```

Repeat for all 4 nav entries. For "Logs" (no children), `exact: false` is fine to keep (harmless).

### Layout.tsx Top Nav — Config Link Active State

The "Config" link in `Layout.tsx` is currently:
```tsx
<Link to="/config" className="px-3 py-1.5 text-sm transition-colors" activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }} inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}>
```

Without `activeOptions={{ exact: false }}`, this will NOT be highlighted when on `/config/profile` etc. Add `activeOptions={{ exact: false }}` to this Link so "Config" stays highlighted across all config sub-routes.

### Overview Page — Tile Status Badge Pattern

Tiles showing status badges should follow this pattern (emerald for configured, zinc for incomplete):

```tsx
// Configured badge
<span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>

// Incomplete badge
<span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
```

For the Prompts tile, use "Edited" / "Default" labels per epic spec (not "Configured" / "Incomplete").

Each tile is a full clickable area. Use a `<Link>` or wrap with a `<div role="button">` with `useNavigate`. `<Link>` is preferred to avoid accessibility issues.

### Overview Tile Status Badge Logic

```typescript
// In ConfigOverviewRoute component:
const { data: status } = useOnboardingStatusQuery()
const { data: profile } = useProfileQuery()
const { data: searchConfigs = [] } = useSearchConfigsQuery()
const { data: prompts = [] } = usePromptsQuery()

// Profile badge
const profileConfigured = !!(status?.hasAnthropicKey && profile?.name && status?.hasImap)

// Job Sources badge
const jobSourcesConfigured = !!(status?.hasLinkedinAuth && searchConfigs.length > 0)

// Prompts badge
const promptsEdited = prompts.some(p => p.isCustom)
```

Data is pre-loaded by the router loader, so all `useQuery` calls return immediately from cache — no loading states needed in the overview page.

### What to Delete vs. Keep

**Delete from `router.ts`:**
- `configRoute` (old flat `/config` route)
- `profileRoute` (old `/profile`)
- `promptsRoute` (old `/prompts`)
- `historyRoute` (old `/logs`)
- All their imports: `ConfigRoute`, `ProfileRoute`, `PromptsRoute`, `HistoryRoute`

**Keep in `router.ts`:**
- All other existing routes unchanged
- The `fetchProfile`, `fetchPrompts`, `fetchSearchConfigs`, `fetchSourceSettings` imports (still used by other routes)

**Do NOT delete yet:**
- `src/client/routes/config.tsx` — still contains `ConnectionsCard`, `SearchConfigCard`, etc. that will be moved in stories 35.2–35.4. Leave the file in place, but it's no longer mounted in the router. Delete it in a later story.
- `src/client/routes/profile.tsx`, `src/client/routes/prompts.tsx`, `src/client/routes/history.tsx` — leave files in place; they'll be moved/deleted in later stories (35.2, 35.5, 35.6). Only remove their route registrations in `router.ts`.

### File Structure for Config Routes

New directory: `src/client/routes/config/`

```
src/client/routes/config/
  layout.tsx           ← ConfigLayout (left nav + Outlet)
  overview.tsx         ← ConfigOverviewRoute (4-tile grid)
  profile-index.tsx    ← ConfigProfileIndexRoute (stub)
  job-sources-index.tsx ← ConfigJobSourcesIndexRoute (stub)
  prompts-index.tsx    ← ConfigPromptsIndexRoute (stub)
  logs.tsx             ← ConfigLogsRoute (stub — replaced in 35.6)
```

All files in `src/client/routes/config/` are new files created in this story.

### Naming Conventions

- React components: `PascalCase.tsx`
- The component in `layout.tsx` is named `ConfigLayout`
- The component in `overview.tsx` is named `ConfigOverviewRoute`
- Stub components follow `Config{Section}IndexRoute` naming pattern
- Route variable names in `router.ts`: `configLayoutRoute`, `configOverviewRoute`, `configProfileRoute`, etc.

### No Backend Changes

This story is purely frontend. No API routes, DB migrations, or schema changes needed.

### Testing

No new test files required for this story. Existing test suite should pass unchanged (no backend changes). Verify via `bun test` after implementation.

### Cross-Story Context

- **Story 35.2** will replace `ConfigProfileIndexRoute` stub with the real Profile section overview (3-tile grid) and add `/config/profile/resume` subpage.
- **Story 35.3** adds `/config/profile/api-keys` and `/config/profile/inbox-mapping` subpages.
- **Story 35.4** replaces `ConfigJobSourcesIndexRoute` stub with Job Sources section and moves `ConnectionsCard`/`SearchConfigCard` from `config.tsx`.
- **Story 35.5** replaces `ConfigPromptsIndexRoute` stub with Prompts section and moves `PromptSection` components.
- **Story 35.6** replaces `ConfigLogsRoute` stub with the full webhook runs table (moved from `history.tsx`).

The stubs created in this story are intentional scaffolding — do NOT implement section content beyond "Coming soon" placeholders.

### References

- Epic 35 full spec: `_bmad-output/planning-artifacts/epics/epic-35-config-section-nav-refactor.md`
- Router pattern reference: `src/client/lib/router.ts` (pathless `_protected` route as canonical example)
- `useOnboardingStatusQuery`: `src/client/hooks/useOnboardingStatusQuery.ts`
- `useProfileQuery` / `fetchProfile`: `src/client/hooks/useProfileQuery.ts`
- `useSearchConfigsQuery` / `fetchSearchConfigs`: `src/client/hooks/useSearchConfigsQuery.ts`
- `usePromptsQuery` / `fetchPrompts`: `src/client/hooks/usePromptsQuery.ts`
- Existing config page (source of `ConnectionsCard`, `SearchConfigCard`): `src/client/routes/config.tsx`
- Layout top nav (needs `activeOptions` fix): `src/client/components/shared/Layout.tsx`
- Shared types: `src/shared/schemas.ts` (`OnboardingStatusResponse`, `Profile`, `Prompt`, `SearchConfig`)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented all 6 tasks. Added `fetchOnboardingStatus` standalone export to `useOnboardingStatusQuery.ts` with hook refactored to use it. Created `ConfigLayout` (pathless `_config` layout route with left nav + Outlet). Created `ConfigOverviewRoute` with 4-tile 2-column grid; status badges derived from onboarding status, profile, search configs, and prompts queries preloaded by router loader. Created 4 stub section routes (`profile-index`, `job-sources-index`, `prompts-index`, `logs`). Restructured `router.ts`: removed `configRoute`, `profileRoute`, `promptsRoute`, `historyRoute` and their imports; added new config route hierarchy under `configLayoutRoute`. Added `activeOptions={{ exact: false }}` to Config link in `Layout.tsx`. Build passes with 0 TypeScript errors (2578 modules); 11 pre-existing backend test failures unrelated to these changes.

### File List

- `job-hunt-dashboard/src/client/hooks/useOnboardingStatusQuery.ts` (modified)
- `job-hunt-dashboard/src/client/routes/config/layout.tsx` (new)
- `job-hunt-dashboard/src/client/routes/config/overview.tsx` (new)
- `job-hunt-dashboard/src/client/routes/config/profile-index.tsx` (new)
- `job-hunt-dashboard/src/client/routes/config/job-sources-index.tsx` (new)
- `job-hunt-dashboard/src/client/routes/config/prompts-index.tsx` (new)
- `job-hunt-dashboard/src/client/routes/config/logs.tsx` (new)
- `job-hunt-dashboard/src/client/lib/router.ts` (modified)
- `job-hunt-dashboard/src/client/components/shared/Layout.tsx` (modified)

### Review Findings

- [x] [Review][Defer] Stub section routes (`/config/profile`, `/config/job-sources`, `/config/prompts`, `/config/logs`) have no loaders [router.ts] — deferred, intentional scaffolding; loaders will be added per-story as sections are implemented (35.2–35.6)
- [x] [Review][Defer] No redirect from removed `/logs` → `/config/logs` [router.ts] — deferred, URL reorganization is intentional; redirect not spec'd
- [x] [Review][Defer] Tile status badges flash "Incomplete" on stale-cache re-fetch due to `staleTime: 0` [overview.tsx] — deferred, pre-existing hook behavior not introduced by this story
- [x] [Review][Defer] `res.json() as Promise<OnboardingStatusResponse>` type cast is unsound (no runtime validation) [useOnboardingStatusQuery.ts] — deferred, pre-existing pattern throughout codebase
- [x] [Review][Defer] `profile.name` whitespace-only (e.g. `" "`) would evaluate as "Configured" — no `.trim()` guard [overview.tsx] — deferred, form validation on save should prevent whitespace-only names; extremely edge case

## Change Log

- 2026-05-18: Implemented Config layout shell, router restructure, and overview page. Added `fetchOnboardingStatus` export, created `_config` pathless layout route with persistent left nav, created 4-tile overview page with status badges, created 4 stub section routes, removed old flat routes (`/profile`, `/prompts`, `/logs`), fixed Config top-nav active state.
