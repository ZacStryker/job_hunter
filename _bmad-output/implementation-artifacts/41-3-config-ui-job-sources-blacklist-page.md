---
baseline_commit: HEAD
---

# Story 41.3: Config UI — `/config/job-sources/blacklist` Page

Status: done

## Story

As a user managing my job search configuration,
I want a Blacklist page under Config > Job Sources where I can view, add, and remove blacklisted companies,
so that I can manage my blacklist without having to open a specific job's drawer.

## Acceptance Criteria

1. **Given** the user is on the `/config/job-sources` overview page
   **When** they look at the card grid
   **Then** a "Blacklist" card tile is present and links to `/config/job-sources/blacklist`

2. **Given** the user navigates to `/config/job-sources/blacklist`
   **When** the page loads
   **Then** the page heading is "Blacklist", the breadcrumb reads "Job Sources > Blacklist", and the list of blacklisted companies is shown (one row per entry)

3. **Given** the user has at least one blacklisted company
   **When** the list renders
   **Then** each row shows the `companyName` and a "Remove" button

4. **Given** the user clicks "Remove" on a blacklisted company entry
   **When** the `DELETE /api/blacklist/:id` mutation resolves successfully
   **Then** that entry disappears from the list and a success toast is shown

5. **Given** the user has no blacklisted companies
   **When** the page loads
   **Then** an empty state message "No companies blacklisted yet" is shown beneath the add form

6. **Given** the user types a company name into the add form input and clicks "Add"
   **When** the `POST /api/blacklist` mutation resolves successfully
   **Then** the input is cleared, the new entry appears in the list, and a success toast is shown

7. **Given** the user tries to add a company that is already blacklisted
   **When** the API returns 409
   **Then** an error toast "Company already blacklisted" is shown and the input is NOT cleared

8. **Given** any mutation (add or remove) is in-flight
   **When** the relevant button is in its pending state
   **Then** the button is disabled to prevent double-submission

## Tasks / Subtasks

- [x] Create `src/client/hooks/useBlacklistQuery.ts` (AC: 2, 3, 5)
  - [x] Export `fetchBlacklist` async function (GET /api/blacklist → BlacklistEntry[])
  - [x] Export `useBlacklistQuery()` using `queryKey: ['blacklist']`

- [x] Create `src/client/hooks/useBlacklistMutations.ts` (AC: 4, 6, 7, 8)
  - [x] Export `useAddToBlacklist()` — POST /api/blacklist with CSRF via `apiFetch`; on success invalidate `['blacklist']`; throw error with API error message on non-ok responses
  - [x] Export `useRemoveFromBlacklist()` — DELETE /api/blacklist/:id with CSRF via `apiFetch`; on success invalidate `['blacklist']`; throw on non-ok

- [x] Create `src/client/routes/config/job-sources-blacklist.tsx` (AC: 2–8)
  - [x] Page heading "Blacklist" matching other config subpage headings
  - [x] Controlled `<input>` + submit button form for adding entries
  - [x] Disable submit button when input is empty or `addMutation.isPending`
  - [x] On add success: clear input, `toast.success('Company blacklisted')`
  - [x] On add 409 error: `toast.error('Company already blacklisted')` — do NOT clear input
  - [x] Render list: one row per entry with `companyName` + "Remove" button
  - [x] Disable remove button when its mutation is pending
  - [x] On remove success: `toast.success('Removed from blacklist')`
  - [x] Empty state "No companies blacklisted yet" shown when list is empty

- [x] Register route in `src/client/lib/router.ts` (AC: 2)
  - [x] Import `ConfigJobSourcesBlacklistRoute` and `fetchBlacklist`
  - [x] Create `configJobSourcesBlacklistRoute` with parent `configLayoutRoute`, path `/config/job-sources/blacklist`, loader calls `queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist })`
  - [x] Add `configJobSourcesBlacklistRoute` to `configLayoutRoute.addChildren([...])` array

- [x] Update `src/client/routes/config/job-sources-index.tsx` to add Blacklist card (AC: 1)
  - [x] Add third `<Link to="/config/job-sources/blacklist">` card tile following the exact same layout/class structure as the Auth Setup and Searches cards
  - [x] No status badge — blacklist is optional, not a prerequisite

- [x] Update `src/client/components/config/ConfigBreadcrumb.tsx` (AC: 2)
  - [x] Add `'/config/job-sources/blacklist': 'Blacklist'` to the `PATH_LABELS` record

## Dev Notes

### Files Being Created / Modified

| File | Change |
|------|--------|
| `job-hunt-dashboard/src/client/hooks/useBlacklistQuery.ts` | NEW |
| `job-hunt-dashboard/src/client/hooks/useBlacklistMutations.ts` | NEW |
| `job-hunt-dashboard/src/client/routes/config/job-sources-blacklist.tsx` | NEW |
| `job-hunt-dashboard/src/client/lib/router.ts` | UPDATE — add route + routeTree entry |
| `job-hunt-dashboard/src/client/routes/config/job-sources-index.tsx` | UPDATE — add Blacklist card tile |
| `job-hunt-dashboard/src/client/components/config/ConfigBreadcrumb.tsx` | UPDATE — add PATH_LABELS entry |

No backend changes. No migration. No shared schema changes. Story 41.1 already created the `BlacklistEntry` type and the `/api/blacklist` API.

---

### File 1: `useBlacklistQuery.ts` — Exact Pattern

Follow the same pattern as `useSearchConfigsQuery.ts`. The `fetchBlacklist` export is required because `router.ts` uses it directly in route loaders.

```ts
import { useQuery } from '@tanstack/react-query'
import { blacklistEntrySchema } from '@shared/schemas'
import type { BlacklistEntry } from '@shared/schemas'

export async function fetchBlacklist(): Promise<BlacklistEntry[]> {
  const res = await fetch('/api/blacklist')
  if (!res.ok) throw new Error('Failed to fetch blacklist')
  const items = await res.json() as unknown[]
  return items.flatMap((item) => {
    const result = blacklistEntrySchema.safeParse(item)
    return result.success ? [result.data] : []
  })
}

export function useBlacklistQuery() {
  return useQuery({ queryKey: ['blacklist'], queryFn: fetchBlacklist })
}
```

**Critical:** The query key `['blacklist']` is new — no conflict with any existing key in `router.ts`. Story 41.4 will add this key to the pipeline route loader; do not add it to other route loaders here.

---

### File 2: `useBlacklistMutations.ts` — Exact Pattern

Follow `useSearchConfigMutations.ts` pattern — no built-in toasts (the component controls toast messages, enabling Story 41.4 to use different copy). Use `apiFetch` for CSRF token injection on POST/DELETE.

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { BlacklistEntry, BlacklistEntryInput } from '@shared/schemas'

async function extractError(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: string }
    return body.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

export function useAddToBlacklist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: BlacklistEntryInput): Promise<BlacklistEntry> => {
      const res = await apiFetch('/api/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(await extractError(res))
      return res.json() as Promise<BlacklistEntry>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blacklist'] })
    },
  })
}

export function useRemoveFromBlacklist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const res = await apiFetch(`/api/blacklist/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await extractError(res))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blacklist'] })
    },
  })
}
```

**Why no built-in toasts:** Story 41.4 reuses these hooks with different toast copy ("Added [company name] to blacklist" / "[company name] removed from blacklist"). If toasts lived in the hook, 41.4 would get wrong messages. Component passes `onSuccess`/`onError` at the `.mutate()` call site.

**409 handling:** When the API returns 409, `extractError(res)` reads the body and returns `"Company already blacklisted"` (the exact string the API sends). The mutation throws, and the component catches it via `onError` callback.

---

### File 3: `job-sources-blacklist.tsx` — Route Component

Key UI rules from the codebase:
- Heading style: `text-xl font-semibold text-zinc-100 mb-6`
- Input style: `bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100`
- Button style (add): `px-3 py-1 rounded bg-zinc-700 text-zinc-100 text-sm hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed`
- Button style (remove, destructive): `text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`
- Toast: `import { toast } from 'sonner'` — already a project dependency; `toast.success(...)`, `toast.error(...)`
- No shadcn `Button` or `Input` needed — existing config pages use plain HTML elements with Tailwind classes

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import { useBlacklistQuery } from '@/hooks/useBlacklistQuery'
import { useAddToBlacklist, useRemoveFromBlacklist } from '@/hooks/useBlacklistMutations'

export function ConfigJobSourcesBlacklistRoute() {
  const { data: entries = [], isPending } = useBlacklistQuery()
  const addMutation = useAddToBlacklist()
  const removeMutation = useRemoveFromBlacklist()
  const [company, setCompany] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = company.trim()
    if (!trimmed) return
    addMutation.mutate(
      { companyName: trimmed },
      {
        onSuccess: () => {
          setCompany('')
          toast.success('Company blacklisted')
        },
        onError: (err: Error) => {
          toast.error(err.message)
        },
      }
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Blacklist</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 items-end mb-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="bl-company" className="text-xs text-zinc-400">Company name</label>
          <input
            id="bl-company"
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Acme Corp"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-1 rounded bg-zinc-700 text-zinc-100 text-sm hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!company.trim() || addMutation.isPending}
        >
          Add
        </button>
      </form>
      {isPending && <p className="text-sm text-zinc-400">Loading…</p>}
      {!isPending && entries.length === 0 && (
        <p className="text-sm text-zinc-400">No companies blacklisted yet</p>
      )}
      {!isPending && entries.length > 0 && (
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-1 border-b border-zinc-800 last:border-0">
              <span className="text-sm text-zinc-300">{entry.companyName}</span>
              <button
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={removeMutation.isPending}
                onClick={() =>
                  removeMutation.mutate(entry.id, {
                    onSuccess: () => toast.success('Removed from blacklist'),
                    onError: (err: Error) => toast.error(err.message),
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Note on empty state placement:** The AC says "empty state shown beneath the add form" — the form renders first, empty state renders below it.

**Note on remove button disabling:** The `removeMutation.isPending` flag applies to all remove buttons while any remove is in-flight. This is intentional to prevent concurrent removals and is consistent with how `deleteMutation.isPending` works in `job-sources-searches.tsx`.

---

### File 4: `router.ts` — Route Registration

Add to existing imports at the top:

```ts
import { ConfigJobSourcesBlacklistRoute } from '../routes/config/job-sources-blacklist'
import { fetchBlacklist } from '../hooks/useBlacklistQuery'
```

Add the route constant (place it next to `configJobSourcesSearchesRoute`):

```ts
const configJobSourcesBlacklistRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources/blacklist',
  component: ConfigJobSourcesBlacklistRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
})
```

Add to `configLayoutRoute.addChildren([...])` array (after `configJobSourcesSearchesRoute`):

```ts
configJobSourcesBlacklistRoute,
```

---

### File 5: `job-sources-index.tsx` — Blacklist Card Tile

The existing grid has two cards. Add a third following the **exact same structure** as the Auth Setup and Searches cards (with tooltip, without status badge). The grid uses `grid-cols-2 gap-4` — 3 cards will wrap naturally.

The tooltip text to use: `"Companies blocked from appearing in discovery results."`

No status badge on the Blacklist card — it is optional, not a prerequisite for discovery runs.

Example third card to insert after the `</Link>` for the Searches card:

```tsx
<Link to="/config/job-sources/blacklist" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium text-zinc-200">Blacklist</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="What is this?"
            onClick={e => { e.preventDefault(); e.stopPropagation() }}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Companies blocked from appearing in discovery results.
        </TooltipContent>
      </Tooltip>
    </div>
  </div>
</Link>
```

No additional imports needed — `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`, `CircleHelp`, and `Link` are already imported in this file.

---

### File 6: `ConfigBreadcrumb.tsx` — PATH_LABELS Update

Add one entry to the `PATH_LABELS` record (insert alphabetically/logically after `'/config/job-sources/searches'`):

```ts
'/config/job-sources/blacklist': 'Blacklist',
```

This makes the breadcrumb render "Config / Job Sources / Blacklist" automatically when the user is on `/config/job-sources/blacklist`.

---

### Architecture Compliance

- Query key `['blacklist']` is new and does not conflict with any existing key
- `fetchBlacklist` exported from hook file — consistent with `fetchSearchConfigs`, `fetchInboxMappings` patterns (needed for router loaders)
- `apiFetch` used for POST/DELETE — required for CSRF token injection (see `src/client/lib/api.ts`)
- `useQueryClient()` from `@tanstack/react-query` used in mutations — NOT the singleton import (`queryClient` from `lib/query-client`) which is only used in `router.ts` loaders
- `BlacklistEntry` / `BlacklistEntryInput` imported only from `@shared/schemas` — never redefined
- No shadcn `Button` or `Input` — plain HTML + Tailwind matches all other config subpage styles
- `toast` from `sonner` — the project-wide toast library (Toaster mounted in `main.tsx`)
- Route path `/config/job-sources/blacklist` as child of `configLayoutRoute` — same parent as all other `/config/*` routes
- Component name `ConfigJobSourcesBlacklistRoute` — PascalCase, matches naming convention of siblings

### What Story 41.4 Will Reuse From This Story

- `useBlacklistQuery` + `fetchBlacklist` — 41.4 imports and uses in the pipeline route loader
- `useAddToBlacklist` + `useRemoveFromBlacklist` — 41.4 imports in `JobDrawer.tsx`
- The `['blacklist']` query key — 41.4 adds `queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist })` to the `indexRoute` and `trackerRoute` loaders so drawer opens with data pre-cached

### Critical Don't-Miss Rules (from project-context.md)

- TypeScript strict mode: all variables must be used; no unused imports
- No `fetch('/api/...')` directly in components — always use hooks from `src/client/hooks/`
- Server state in TanStack Query only — no `useState` for the blacklist data
- `apiFetch` on all POST/DELETE (CSRF) — never raw `fetch()` for mutations
- `isPending`/`isError` directly from TanStack Query — no custom wrappers
- Error shape from API: `{ error: string }` — `extractError` reads `.error` field

### References

- Epic 41 spec: `_bmad-output/planning-artifacts/epics/epic-41-company-blacklist.md`
- Story 41.1 (done): `_bmad-output/implementation-artifacts/41-1-db-schema-migration-and-blacklist-api.md`
- Story 41.2 (done): `_bmad-output/implementation-artifacts/41-2-discovery-service-blacklist-filtering.md`
- Blacklist API: `job-hunt-dashboard/src/server/routes/api-blacklist.ts`
- Shared schemas (BlacklistEntry): `job-hunt-dashboard/src/shared/schemas.ts` lines 284–294
- ConfigBreadcrumb: `job-hunt-dashboard/src/client/components/config/ConfigBreadcrumb.tsx`
- Router: `job-hunt-dashboard/src/client/lib/router.ts`
- Job Sources index: `job-hunt-dashboard/src/client/routes/config/job-sources-index.tsx`
- Pattern: query hook: `job-hunt-dashboard/src/client/hooks/useSearchConfigsQuery.ts`
- Pattern: mutation hook: `job-hunt-dashboard/src/client/hooks/useSearchConfigMutations.ts`
- Pattern: config subpage: `job-hunt-dashboard/src/client/routes/config/job-sources-searches.tsx`
- apiFetch (CSRF): `job-hunt-dashboard/src/client/lib/api.ts`
- Project context (all rules): `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation, all pre-existing TS errors confirmed unrelated to this story.

### Completion Notes List

- Created `useBlacklistQuery.ts` with `fetchBlacklist` export (for router loader use) and `useBlacklistQuery` hook following `useSearchConfigsQuery` pattern exactly
- Created `useBlacklistMutations.ts` with `useAddToBlacklist` and `useRemoveFromBlacklist` hooks; no built-in toasts so Story 41.4 can reuse with different copy
- Created `job-sources-blacklist.tsx` route component with add form, entry list, empty state, disabled states during pending mutations, and success/error toasts
- Registered `configJobSourcesBlacklistRoute` in `router.ts` with prefetch loader; added to `configLayoutRoute.addChildren`
- Added Blacklist card to `job-sources-index.tsx` — no status badge per spec (optional, not a prerequisite)
- Added `'/config/job-sources/blacklist': 'Blacklist'` to `ConfigBreadcrumb.tsx` PATH_LABELS

### File List

- `job-hunt-dashboard/src/client/hooks/useBlacklistQuery.ts` — NEW
- `job-hunt-dashboard/src/client/hooks/useBlacklistMutations.ts` — NEW
- `job-hunt-dashboard/src/client/routes/config/job-sources-blacklist.tsx` — NEW
- `job-hunt-dashboard/src/client/lib/router.ts` — UPDATED (imports + route constant + addChildren)
- `job-hunt-dashboard/src/client/routes/config/job-sources-index.tsx` — UPDATED (Blacklist card tile)
- `job-hunt-dashboard/src/client/components/config/ConfigBreadcrumb.tsx` — UPDATED (PATH_LABELS entry)

### Review Findings

- [x] [Review][Patch] `fetchBlacklist` crashes on non-array API response [`useBlacklistQuery.ts:8`]
- [x] [Review][Patch] Fetch error (`isError`) not surfaced to user [`job-sources-blacklist.tsx`]
- [x] [Review][Patch] `handleSubmit` missing `addMutation.isPending` guard [`job-sources-blacklist.tsx`]
- [x] [Review][Patch] Add button not disabled while remove mutation in-flight [`job-sources-blacklist.tsx`]
- [x] [Review][Patch] `React.FormEvent` used without `React` in scope [`job-sources-blacklist.tsx:12`]
- [x] [Review][Patch] Blank toast when HTTP/2 `statusText` is empty [`useBlacklistMutations.ts:6`]
- [x] [Review][Defer] Route loader has no `errorComponent` [`router.ts`] — deferred, pre-existing pattern across all routes
- [x] [Review][Defer] No optimistic update for remove mutation [`job-sources-blacklist.tsx`] — deferred, UX enhancement not in spec

## Change Log

- 2026-06-06: Implemented all 6 tasks — created useBlacklistQuery, useBlacklistMutations, job-sources-blacklist route component, registered route in router.ts, added Blacklist card to job-sources-index, added PATH_LABELS entry to ConfigBreadcrumb. All ACs satisfied. No regressions introduced (13 pre-existing test failures confirmed unrelated).
