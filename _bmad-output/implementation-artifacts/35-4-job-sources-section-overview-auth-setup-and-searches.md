# Story 35.4: Job Sources Section — Overview, Auth Setup & Searches

Status: done

## Story

As a user managing job discovery sources,
I want a Job Sources section with auth setup and search configuration subpages,
so that I can manage LinkedIn authentication and search targets from a clean, dedicated area.

## Acceptance Criteria

1. **Given** the user navigates to `/config/job-sources`, **When** the page loads, **Then** two tiles render: "Auth Setup" and "Searches", each with a configured/incomplete badge. Auth Setup tile: Configured if `hasLinkedinAuth` is true; otherwise Incomplete. Searches tile: Configured if at least one search config exists; otherwise Incomplete.

2. **Given** the user clicks the "Auth Setup" tile, **When** the navigation completes, **Then** the URL is `/config/job-sources/auth-setup`.

3. **Given** the user is on `/config/job-sources/auth-setup`, **When** the page loads, **Then** a list of auth-requiring sources is shown; LinkedIn is the first entry with its connected/not-connected status and a "Connect" button.

4. **Given** the user is not connected to LinkedIn, **When** they click Connect, **Then** the LinkedIn browser modal opens (same behavior as the existing `ConnectionsCard`).

5. **Given** the LinkedIn session is captured successfully, **When** the modal closes, **Then** the LinkedIn entry updates to "Connected" status and `['onboarding-status']` is invalidated.

6. **Given** the user clicks the "Searches" tile, **When** the navigation completes, **Then** the URL is `/config/job-sources/searches`.

7. **Given** the user is on `/config/job-sources/searches`, **When** the page loads, **Then** the full search configuration interface renders: the add-search form and the sortable search configs table (identical to existing `SearchConfigCard` functionality).

8. **Given** the user adds, edits, or deletes a search config, **When** mutations succeed, **Then** the table updates and appropriate success/error states are shown.

9. **Given** the old `ConfigRoute` in `config.tsx` contained `ConnectionsCard` and `SearchConfigCard`, **When** this story is complete, **Then** those component functions are removed from `config.tsx`.

## Tasks / Subtasks

- [x] Task 1 — Update `job-sources-index.tsx` overview (AC: 1)
  - [x] Replace the current stub (`<p>Coming soon</p>`) with a 2-tile grid layout identical in pattern to `profile-index.tsx`
  - [x] Import `useOnboardingStatusQuery` and `useSearchConfigsQuery`
  - [x] Auth Setup tile: `<Link to="/config/job-sources/auth-setup">` — Configured if `status?.hasLinkedinAuth`, Incomplete otherwise
  - [x] Searches tile: `<Link to="/config/job-sources/searches">` — Configured if `searchConfigs.length > 0`, Incomplete otherwise
  - [x] Data is pre-populated by router loader — do NOT add loading/error guards

- [x] Task 2 — Create `job-sources-auth-setup.tsx` (AC: 2, 3, 4, 5)
  - [x] Create `src/client/routes/config/job-sources-auth-setup.tsx` exporting `JobSourcesAuthSetupRoute`
  - [x] Lift the `ConnectionsCard` logic from `src/client/routes/config.tsx` verbatim into this component
  - [x] Render as a structured list (`<ul>` / `<li>`) with one entry per auth source — LinkedIn is the only entry now, but the list structure accommodates future sources
  - [x] LinkedIn entry: name + connected/not-connected status text + "Connect LinkedIn" button
  - [x] Same `useLinkedinBrowserSession` + `LinkedInBrowserModal` + `useEffect` pattern as the existing `ConnectionsCard`
  - [x] Same `sessionStatus === 'captured'` toast + `queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })` logic
  - [x] Page heading: `<h1>Auth Setup</h1>` at the top

- [x] Task 3 — Create `job-sources-searches.tsx` (AC: 6, 7, 8)
  - [x] Create `src/client/routes/config/job-sources-searches.tsx` exporting `JobSourcesSearchesRoute`
  - [x] Move `SearchConfigCard` logic from `src/client/routes/config.tsx` into this component verbatim — rename the component to `JobSourcesSearchesRoute` (or keep `SearchConfigCard` as an inner function if preferred)
  - [x] All state, sorting, inline-edit, add, delete, and error display logic remains unchanged
  - [x] Page heading: `<h1>Discovery Searches</h1>` (or keep existing heading from SearchConfigCard: "Discovery Searches")
  - [x] Data is pre-populated by router loader — no loading guards needed for search-configs and source-settings

- [x] Task 4 — Router updates (AC: 1, 2, 6)
  - [x] In `src/client/lib/router.ts`, add loader to the existing `configJobSourcesRoute`: `loader: () => Promise.all([queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }), queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs })])`
  - [x] Add imports: `JobSourcesAuthSetupRoute` from `'../routes/config/job-sources-auth-setup'` and `JobSourcesSearchesRoute` from `'../routes/config/job-sources-searches'`
  - [x] Add `configJobSourcesAuthSetupRoute`: `createRoute({ getParentRoute: () => configLayoutRoute, path: '/config/job-sources/auth-setup', component: JobSourcesAuthSetupRoute, loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }) })`
  - [x] Add `configJobSourcesSearchesRoute`: `createRoute({ getParentRoute: () => configLayoutRoute, path: '/config/job-sources/searches', component: JobSourcesSearchesRoute, loader: () => Promise.all([queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs }), queryClient.ensureQueryData({ queryKey: ['source-settings'], queryFn: fetchSourceSettings })]) })`
  - [x] Add both to `configLayoutRoute.addChildren([..., configJobSourcesAuthSetupRoute, configJobSourcesSearchesRoute, ...])`

- [x] Task 5 — Cleanup `config.tsx` (AC: 9)
  - [x] Remove the `ConnectionsCard` function (lines ~21–81) from `src/client/routes/config.tsx`
  - [x] Remove the `SearchConfigCard` function (lines ~238–495) and its helpers `parseName` (only used by `LogsPreviewCard` — keep if still referenced), `SortIcon`, `SortCol`, `SortDir`, `SORT_COL_LABELS` type/const declarations from `config.tsx`
  - [x] Verify `ConfigRoute` in `config.tsx` still compiles (it references `ConnectionsCard` and `SearchConfigCard` — remove those usages from `ConfigRoute`'s JSX too, since the component itself is also dead code)
  - [x] Note: `config.tsx` is not imported anywhere in `router.ts` — it is orphaned dead code; removing functions from it is cleanup only

- [x] Task 6 — Verify build passes (AC: all)
  - [x] Run `bun run build` (or `tsc --noEmit`) to confirm zero TypeScript errors

## Dev Notes

### Key Source to Lift — `ConnectionsCard` (config.tsx lines 21–81)

The `ConnectionsCard` component in `src/client/routes/config.tsx` is the **exact source** for the auth-setup page. Lift it verbatim, adapting only:
- Component name → `JobSourcesAuthSetupRoute`
- Wrap the LinkedIn row in a `<ul><li>` list structure
- Add `<h1 className="text-xl font-semibold text-zinc-100 mb-6">Auth Setup</h1>` header
- Remove the outer card `<div className="border border-zinc-800 rounded-lg p-4">` wrapper — the page itself is the container

```tsx
// Existing ConnectionsCard internals to preserve:
const { data: status } = useOnboardingStatusQuery()
const queryClient = useQueryClient()
const { status: sessionStatus, error, startSession, sendClick, sendKey, sendCancel, onFrameRef } = useLinkedinBrowserSession()
const [modalOpen, setModalOpen] = useState(false)
const isLinkedinConnected = status?.hasLinkedinAuth ?? false

useEffect(() => {
  if (sessionStatus === 'captured' && modalOpen) {
    setModalOpen(false)
    toast.success('LinkedIn connected')
    queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
  } else if ((sessionStatus === 'timeout' || sessionStatus === 'error') && modalOpen) {
    setModalOpen(false)
  }
}, [sessionStatus, modalOpen, queryClient])
```

### Key Source to Lift — `SearchConfigCard` (config.tsx lines 238–495)

The `SearchConfigCard` function plus its helpers (`SortIcon`, `SortCol`, `SortDir`, `SORT_COL_LABELS`) move to `job-sources-searches.tsx` **verbatim**. The only change is the wrapping export function name becomes `JobSourcesSearchesRoute` and it no longer has the outer `border border-zinc-800 rounded-lg p-4` wrapper card (or keep it — it's fine either way since the page IS the container).

Imports needed by `job-sources-searches.tsx`:
```tsx
import { useState } from 'react'
import { useSearchConfigsQuery } from '@/hooks/useSearchConfigsQuery'
import { useAddSearchConfigMutation, useDeleteSearchConfigMutation, useUpdateSearchConfigMutation } from '@/hooks/useSearchConfigMutations'
import { useSourceSettingsQuery } from '@/hooks/useSourceSettingsQuery'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SCRAPER_SOURCES } from '@shared/schemas'
import type { ScraperSource } from '@shared/schemas'
```

Imports needed by `job-sources-auth-setup.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { useLinkedinBrowserSession } from '@/hooks/useLinkedinBrowserSession'
import { LinkedInBrowserModal } from '@/components/linkedin/LinkedInBrowserModal'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
```

### `job-sources-index.tsx` — Exact Tile Pattern

Follow `profile-index.tsx` exactly (established in story 35.2/35.3). The tile grid uses the same badge style as all other overview pages:

```tsx
import { Link } from '@tanstack/react-router'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
import { useSearchConfigsQuery } from '@/hooks/useSearchConfigsQuery'

export function ConfigJobSourcesIndexRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const { data: searchConfigs = [] } = useSearchConfigsQuery()

  const authConfigured = status?.hasLinkedinAuth ?? false
  const searchesConfigured = searchConfigs.length > 0

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Job Sources</h1>
      <div className="grid grid-cols-2 gap-4">
        <Link to="/config/job-sources/auth-setup" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Auth Setup</span>
            {authConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>
        <Link to="/config/job-sources/searches" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Searches</span>
            {searchesConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>
      </div>
    </div>
  )
}
```

### Router — Exact Route Additions

```typescript
// Add to existing configJobSourcesRoute (it currently has NO loader — add one):
const configJobSourcesRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources',
  component: ConfigJobSourcesIndexRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
    queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs }),
  ]),
})

// New routes:
const configJobSourcesAuthSetupRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources/auth-setup',
  component: JobSourcesAuthSetupRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
})

const configJobSourcesSearchesRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources/searches',
  component: JobSourcesSearchesRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs }),
    queryClient.ensureQueryData({ queryKey: ['source-settings'], queryFn: fetchSourceSettings }),
  ]),
})

// Updated routeTree addChildren — insert after configProfileInboxMappingRoute:
configLayoutRoute.addChildren([
  configOverviewRoute,
  configProfileRoute,
  configProfileResumeRoute,
  configProfileApiKeysRoute,
  configProfileInboxMappingRoute,
  configJobSourcesRoute,
  configJobSourcesAuthSetupRoute,    // ← add
  configJobSourcesSearchesRoute,     // ← add
  configPromptsRoute,
  configLogsRoute,
])
```

`fetchSourceSettings` is already imported in router.ts (used by `adminUsersRoute`). `fetchSearchConfigs` is already imported. `fetchOnboardingStatus` is already imported. No new imports needed beyond the two new route components.

### `config.tsx` Cleanup

`config.tsx` is **not imported anywhere in the router** — it is orphaned dead code left from the pre-Epic-35 config. The cleanup task is to remove `ConnectionsCard` and `SearchConfigCard` from it so they no longer exist in two places. The `ConfigRoute` export itself and remaining components (`LogsPreviewCard`, `ProfilePreviewCard`, `PromptsPreviewCard`) can stay — they are dead code but harmless. Only remove what the AC specifies.

If `LogsPreviewCard` uses `parseName`, keep that helper function. `parseName` is local to `config.tsx` and only used there — it is NOT used by `SearchConfigCard`. Check before deleting.

### Project Conventions

- `apiFetch` from `@/lib/api` for API calls in components — `ConnectionsCard`'s LinkedIn session uses `useLinkedinBrowserSession` which handles its own fetch internally, so no `apiFetch` needed in auth-setup
- `useQueryClient` from `@tanstack/react-query` (NOT the singleton `queryClient`) for invalidation inside components
- Route loader data pre-caches queries — do NOT add loading/error guards in components for pre-loaded keys
- Toast: `import { toast } from 'sonner'`
- No comments for obvious code; no docstrings

### File Structure Summary

```
New files:
  src/client/routes/config/job-sources-auth-setup.tsx
  src/client/routes/config/job-sources-searches.tsx

Modified files:
  src/client/routes/config/job-sources-index.tsx   ← replace stub with 2-tile grid
  src/client/lib/router.ts                          ← add loader to configJobSourcesRoute + 2 new routes
  src/client/routes/config.tsx                      ← remove ConnectionsCard + SearchConfigCard functions
```

### Cross-Story Context

- **Story 35.3** (done): Established `profile-api-keys.tsx` and `profile-inbox-mapping.tsx`. The tile grid pattern for overview pages (2×N grid, Link tiles, emerald/zinc badges) is now well-established — follow it exactly.
- **Story 35.5** adds Prompts section (Analysis, Cover Letter, Resume subpages) — do not implement beyond scope
- **Story 35.6** adds Logs section — `/config/logs` route already exists from 35.1; do not modify it
- `configJobSourcesRoute` currently has **no loader** — this story adds the loader (the `ConfigJobSourcesIndexRoute` stub never needed data; now it does)
- `useLinkedinBrowserSession` and `LinkedInBrowserModal` are proven components from Epic 30 — do not modify them

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Replaced `job-sources-index.tsx` stub with 2-tile grid (Auth Setup, Searches) following the established profile-index pattern with emerald/zinc configured/incomplete badges.
- Created `job-sources-auth-setup.tsx` lifting `ConnectionsCard` logic verbatim; LinkedIn row wrapped in `<ul><li>`, outer card div removed, page-level `<h1>Auth Setup</h1>` added.
- Created `job-sources-searches.tsx` lifting `SearchConfigCard` + helpers (`SortIcon`, `SortCol`, `SortDir`, `SORT_COL_LABELS`) verbatim; outer card div retained, renamed export to `JobSourcesSearchesRoute`, page-level `<h1>Discovery Searches</h1>` at top.
- Updated `router.ts`: added loader to `configJobSourcesRoute`, added `configJobSourcesAuthSetupRoute` and `configJobSourcesSearchesRoute` with appropriate loaders, registered both in `configLayoutRoute.addChildren`.
- Cleaned `config.tsx`: removed `ConnectionsCard`, `SearchConfigCard`, `SortIcon`, `SortCol`, `SortDir`, `SORT_COL_LABELS` and their associated imports; kept `parseName` (still used by `LogsPreviewCard`); removed `ConnectionsCard` and `SearchConfigCard` from `ConfigRoute` JSX.
- Build passes: zero TypeScript errors (`bun run build` ✓).

### File List

- `job-hunt-dashboard/src/client/routes/config/job-sources-index.tsx` (modified)
- `job-hunt-dashboard/src/client/routes/config/job-sources-auth-setup.tsx` (created)
- `job-hunt-dashboard/src/client/routes/config/job-sources-searches.tsx` (created)
- `job-hunt-dashboard/src/client/lib/router.ts` (modified)
- `job-hunt-dashboard/src/client/routes/config.tsx` (modified)

### Review Findings

- [x] [Review][Defer] Second session can start if modal closes while session is running [job-sources-auth-setup.tsx:29-31, 49] — deferred, pre-existing (ConnectionsCard)
- [x] [Review][Defer] `handleModalClose` doesn't call `sendCancel` — session stays active after modal close [job-sources-auth-setup.tsx:36-38] — deferred, pre-existing (ConnectionsCard)
- [x] [Review][Defer] `source` state diverges from `addableSources` on source-settings change — submit fires with stale source [job-sources-searches.tsx:32, 103] — deferred, pre-existing (SearchConfigCard)
- [x] [Review][Defer] `deleteMutation.reset()` not called before new delete — stale error persists [job-sources-searches.tsx] — deferred, pre-existing (SearchConfigCard)
- [x] [Review][Defer] Edit select shows original disabled source as selectable; can submit disabled source [job-sources-searches.tsx:180] — deferred, pre-existing (SearchConfigCard)
- [x] [Review][Defer] `[...configs].sort()` creates new array on every render; sort comparator type-assumes string [job-sources-searches.tsx:88-91] — deferred, pre-existing (SearchConfigCard)
- [x] [Review][Defer] `Promise.all` in loaders swallows individual query errors [router.ts:212-215, 229-232] — deferred, project-wide pattern
- [x] [Review][Defer] Raw `<table>` wraps ShadCN TableHeader/TableBody without ShadCN Table root [job-sources-searches.tsx:153] — deferred, pre-existing (SearchConfigCard)
