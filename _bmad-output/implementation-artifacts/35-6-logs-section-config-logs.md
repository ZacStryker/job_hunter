# Story 35.6: Logs Section — /config/logs

Status: done

## Story

As a user reviewing automation history,
I want the webhook run logs accessible at `/config/logs` via the left nav,
So that logs are part of the Config section with consistent navigation rather than a standalone top-level route.

## Acceptance Criteria

1. **Given** the user clicks "Logs" in the Config left nav, **When** the navigation completes, **Then** the URL is `/config/logs` and the full webhook runs table renders with sorting, pagination, and all columns.

2. **Given** the user is on `/config/logs`, **When** they look at the left nav, **Then** "Logs" is highlighted as the active item.

3. **Given** no webhook runs exist, **When** the page loads, **Then** an empty state message is shown ("No webhook runs yet.").

4. **Given** runs exist, **When** the table renders, **Then** it shows Run Date, Workflow, Detail, Success, Duration, Input Tokens, Output Tokens, Cost columns with correct sort and pagination behavior (page size 20).

5. **Given** the old `/logs` standalone route existed in the router, **When** this story is complete, **Then** that route entry is gone (already removed in Story 35.1) and `history.tsx` is deleted as dead code.

## Tasks / Subtasks

- [x] Task 1 — Replace `config/logs.tsx` stub with full implementation
  - [x] Replace the `<p className="p-6 text-zinc-400">Coming soon</p>` stub in `src/client/routes/config/logs.tsx` with the full component moved from `src/client/routes/history.tsx`
  - [x] Keep the export name `ConfigLogsRoute` (already used in `router.ts` import — do NOT rename to `HistoryRoute`)
  - [x] Copy ALL code from `history.tsx` verbatim: `parseName`, `columnHelper`, `columns`, and the main component body
  - [x] Update all imports to use `@/` aliases (not relative paths — config route files are one dir deeper):
    - `'../components/ui/button'` → `'@/components/ui/button'`
    - `'../components/ui/table'` → `'@/components/ui/table'`
    - `'../hooks/useWebhookRunsQuery'` → `'@/hooks/useWebhookRunsQuery'`
    - `'@shared/schemas'` stays as-is
  - [x] Keep `useState`, TanStack Table imports, and all other imports exactly as they appear in `history.tsx`

- [x] Task 2 — Export `fetchWebhookRuns` from `useWebhookRunsQuery.ts`
  - [x] In `src/client/hooks/useWebhookRunsQuery.ts`, add a named export `fetchWebhookRuns`:
    ```typescript
    export async function fetchWebhookRuns(): Promise<WebhookRun[]> {
      const res = await fetch('/api/webhook-runs')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { runs: WebhookRun[] }
      return body.runs
    }
    ```
  - [x] Update `useWebhookRunsQuery` to call `fetchWebhookRuns` as its `queryFn` (deduplicates the fetch logic)

- [x] Task 3 — Add loader to `configLogsRoute` in `router.ts`
  - [x] Add import: `import { fetchWebhookRuns } from '../hooks/useWebhookRunsQuery'`
  - [x] Update `configLogsRoute` to add loader:
    ```typescript
    const configLogsRoute = createRoute({
      getParentRoute: () => configLayoutRoute,
      path: '/config/logs',
      component: ConfigLogsRoute,
      loader: () => queryClient.ensureQueryData({ queryKey: ['webhook-runs'], queryFn: fetchWebhookRuns }),
    })
    ```
  - [x] No other router changes needed — `ConfigLogsRoute` is already imported and `configLogsRoute` is already in `configLayoutRoute.addChildren`

- [x] Task 4 — Delete `history.tsx`
  - [x] Delete `src/client/routes/history.tsx` — it is NOT imported anywhere in `router.ts` (the old `/logs` route was removed in story 35.1); it is dead code

- [x] Task 5 — Verify build passes
  - [x] Run `bun run build` (or `tsc --noEmit`) to confirm zero TypeScript errors

## Dev Notes

### What Already Exists — Do Not Recreate

The following are already in place from stories 35.1–35.5. Do not touch:
- `src/client/routes/config/layout.tsx` — left nav already has "Logs" → `/config/logs` with `activeOptions={{ exact: false }}`; it will auto-highlight correctly
- `router.ts` — `configLogsRoute` already declared, already imported as `ConfigLogsRoute` from `config/logs`, already added to `configLayoutRoute.addChildren`
- The old standalone `/logs` route was already removed from `router.ts` in story 35.1

### Source File: history.tsx

`src/client/routes/history.tsx` contains the full `HistoryRoute` component. It is currently dead code — NOT imported in `router.ts`. Move its entire content (verbatim) into `config/logs.tsx`, renaming only the exported function from `HistoryRoute` to `ConfigLogsRoute`. Everything else (column definitions, `parseName`, pagination, sorting, table rendering) is copied as-is.

### Import Path Fix

`history.tsx` uses relative imports from `routes/` level. `config/logs.tsx` is at `routes/config/` level — one directory deeper. All project config route files use `@/` aliases (confirmed from `prompts-analysis.tsx`, `job-sources-auth-setup.tsx`, etc.). Use `@/` everywhere:

```tsx
import { useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { SortingState } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { WebhookRun } from '@shared/schemas'
import { useWebhookRunsQuery } from '@/hooks/useWebhookRunsQuery'
```

### fetchWebhookRuns Pattern

All other config route loaders use a standalone `fetch*` function exported from the corresponding hook file (e.g., `fetchPrompts` from `usePromptsQuery.ts`, `fetchProfile` from `useProfileQuery.ts`). Follow the same pattern for webhook runs. The updated `useWebhookRunsQuery.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import type { WebhookRun } from '@shared/schemas'

export async function fetchWebhookRuns(): Promise<WebhookRun[]> {
  const res = await fetch('/api/webhook-runs')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { runs: WebhookRun[] }
  return body.runs
}

export function useWebhookRunsQuery() {
  return useQuery<WebhookRun[]>({
    queryKey: ['webhook-runs'],
    queryFn: fetchWebhookRuns,
    refetchInterval: 15_000,
  })
}
```

### configLogsRoute — Only Add Loader

The route is already declared and registered. Only add the `loader` property:

```typescript
const configLogsRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/logs',
  component: ConfigLogsRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['webhook-runs'], queryFn: fetchWebhookRuns }),
})
```

Import `fetchWebhookRuns` alongside the existing `useWebhookRunsQuery` import area. There is no existing import of anything from `useWebhookRunsQuery` in `router.ts` — add a new import line.

### Loading State in Component

`ConfigLogsRoute` retains the `isPending`/`isError` guards from the original `HistoryRoute`. With a pre-loading router loader, `isPending` will be `false` on initial render. The guards remain harmless and provide edge-case safety. The `refetchInterval: 15_000` on the query continues to poll in the background — this is unchanged behavior.

### No Changes Needed

- `layout.tsx` — "Logs" nav link already correct, active highlighting already wired
- `router.ts` import of `ConfigLogsRoute` — already there
- `configLayoutRoute.addChildren` — `configLogsRoute` already included
- Any backend API — no changes; `/api/webhook-runs` is unchanged

### File Structure Summary

```
Modified files:
  src/client/routes/config/logs.tsx        ← replace stub with full HistoryRoute content
  src/client/hooks/useWebhookRunsQuery.ts  ← add fetchWebhookRuns export
  src/client/lib/router.ts                 ← add fetchWebhookRuns import + loader to configLogsRoute

Deleted files:
  src/client/routes/history.tsx            ← dead code (not imported anywhere since story 35.1)
```

### Cross-Story Context

- **Story 35.1** (done): Removed the old `historyRoute` (`/logs`) from `router.ts`, created the `configLogsRoute` stub at `/config/logs`, added "Logs" nav link to `layout.tsx`
- **Story 35.2–35.5** (done): Established all profile, job-sources, and prompts routes — this is the final story in Epic 35
- **Epic 36** (done): Arc listing description scraper — separate, no overlap

### Project Conventions

- `@/` path aliases for all imports in `src/client/routes/config/` files
- `bun:test` for tests (no new tests needed — this is a UI move, not new logic)
- TypeScript strict mode: no unused locals/params (all existing code in `history.tsx` is used)
- No comments for obvious code
- Route loaders use `queryClient.ensureQueryData` — consistent with every other config route

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward with no debugging required.

### Completion Notes List

- Replaced stub in `config/logs.tsx` with full component content from `history.tsx`, renaming export to `ConfigLogsRoute` and updating all imports to `@/` aliases
- Extracted `fetchWebhookRuns` as a named export in `useWebhookRunsQuery.ts`; updated `useWebhookRunsQuery` to use it as its `queryFn` (deduplication)
- Added `fetchWebhookRuns` import and `loader` property to `configLogsRoute` in `router.ts` for consistent pre-loading pattern
- Deleted `history.tsx` dead code
- `bun run build` passes with zero TypeScript errors

### File List

- `src/client/routes/config/logs.tsx` — replaced stub with full webhook runs table implementation
- `src/client/hooks/useWebhookRunsQuery.ts` — added `fetchWebhookRuns` named export; `useWebhookRunsQuery` calls it as `queryFn`
- `src/client/lib/router.ts` — added `fetchWebhookRuns` import; added `loader` to `configLogsRoute`
- `src/client/routes/history.tsx` — deleted (dead code)

### Review Findings

- [x] [Review][Patch] `fetchWebhookRuns` returns `null` if API responds with `{ runs: null }` — crashes component on `.length`/`.map()` calls [`useWebhookRunsQuery.ts:5`]
- [x] [Review][Defer] `parseName` silently produces empty Detail for unrecognized workflow names [`logs.tsx:26-29`] — deferred, pre-existing from history.tsx
- [x] [Review][Defer] `sourceBreakdown` values assumed to be numbers — no type validation before `>= 1` comparison [`logs.tsx:59`] — deferred, pre-existing from history.tsx
- [x] [Review][Defer] `queryKey: ['webhook-runs']` hardcoded in both router loader and hook — no shared constant [`router.ts:271`, `useWebhookRunsQuery.ts:7`] — deferred, systemic project pattern
- [x] [Review][Defer] `onSortingChange` calls `table.setPageIndex(0)` before `setSorting` — may produce two renders [`logs.tsx:130-133`] — deferred, pre-existing from history.tsx
- [x] [Review][Defer] `getFilteredRowModel()` used for total row count when no filter is configured [`logs.tsx:136`] — deferred, pre-existing from history.tsx
- [x] [Review][Defer] Raw `<table>` used with shadcn `TableHeader`/`TableBody` without `<Table>` root wrapper [`logs.tsx:160`] — deferred, pre-existing from history.tsx
- [x] [Review][Defer] Invalid `runAt` string renders literal "Invalid Date" — no `isNaN` guard on `new Date()` [`logs.tsx:35`] — deferred, pre-existing from history.tsx
- [x] [Review][Defer] Loader throw renders blank screen — no `errorComponent` or global `defaultErrorComponent` on router [`router.ts:268-272`] — deferred, systemic pattern across all routes
- [x] [Review][Defer] Double fetch on every navigation — `ensureQueryData` has no `staleTime`, data always stale [`router.ts:271`] — deferred, systemic pattern across all route loaders

## Change Log

- 2026-05-18: Story created — final story in Epic 35, logs section moved from dead history.tsx into /config/logs
- 2026-05-18: Implemented — full webhook runs table at /config/logs; fetchWebhookRuns extracted; router loader added; history.tsx deleted
