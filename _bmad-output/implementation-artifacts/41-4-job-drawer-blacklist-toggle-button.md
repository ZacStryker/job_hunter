---
baseline_commit: HEAD
---

# Story 41.4: Job Drawer — Blacklist Toggle Button

Status: done

## Story

As a user reviewing a job in the drawer,
I want to add or remove the job's company from my blacklist directly from the drawer,
so that I can blacklist a company in the moment I decide it's not worth my time without navigating to Config.

## Acceptance Criteria

1. **Given** the job drawer is open for a job whose company is NOT in the user's blacklist
   **When** the drawer renders
   **Then** a button labelled "Add Company to Blacklist" is visible in the drawer's action area

2. **Given** the job drawer is open for a job whose company IS in the user's blacklist
   **When** the drawer renders
   **Then** the button label is "Remove from Blacklist" instead

3. **Given** the user clicks "Add Company to Blacklist"
   **When** the `POST /api/blacklist` mutation resolves successfully
   **Then** the button label changes to "Remove from Blacklist" and a success toast "Added [company name] to blacklist" is shown

4. **Given** the user clicks "Remove from Blacklist"
   **When** the `DELETE /api/blacklist/:id` mutation resolves successfully
   **Then** the button label changes to "Add Company to Blacklist" and a success toast "[company name] removed from blacklist" is shown

5. **Given** either mutation is in-flight
   **When** the button is in its pending state
   **Then** the button is disabled

6. **Given** the route loader pre-fetches jobs data before the drawer opens
   **When** the drawer renders
   **Then** the blacklist query is also pre-cached so the button renders in its correct state without a loading spinner

## Tasks / Subtasks

- [x] Update `JobDrawer.tsx` to add blacklist toggle button (AC: 1, 2, 3, 4, 5)
  - [x] Import `useBlacklistQuery` from `@/hooks/useBlacklistQuery`
  - [x] Import `useAddToBlacklist`, `useRemoveFromBlacklist` from `@/hooks/useBlacklistMutations`
  - [x] Import `toast` from `sonner`
  - [x] Import `Ban` from `lucide-react` (or another suitable icon — add to existing import line)
  - [x] Call `useBlacklistQuery()` at the top of `JobDrawer` function body
  - [x] Derive `isBlacklisted` and `entry` from the blacklist data using `job.company.toLowerCase()`
  - [x] Add the toggle button in the existing action row `div` (after the archive button)
  - [x] Button: disabled when `addToBlacklist.isPending || removeFromBlacklist.isPending`
  - [x] Add toast: `toast.success(`Added ${job.company} to blacklist`)` on add success
  - [x] Add toast: `toast.success(`${job.company} removed from blacklist`)` on remove success

- [x] Update `router.ts` to pre-cache blacklist in route loaders (AC: 6)
  - [x] Update `indexRoute` loader to `Promise.all([ensureQueryData(['jobs']), ensureQueryData(['blacklist'])])`
  - [x] Update `trackerRoute` loader to `Promise.all([ensureQueryData(['jobs']), ensureQueryData(['blacklist'])])`
  - [x] Update `archivedRoute` loader to `Promise.all([ensureQueryData(['jobs']), ensureQueryData(['blacklist'])])`
  - [x] Update `matchesRoute` loader to `Promise.all([ensureQueryData(['jobs']), ensureQueryData(['blacklist'])])`

### Review Findings

- [x] [Review][Defer] No `type="button"` on blacklist toggle button [`JobDrawer.tsx` action row] — deferred, pre-existing; every other action button in the file also omits explicit `type`
- [x] [Review][Defer] `configJobSourcesBlacklistRoute` router wiring completed in 41.4 rather than 41.3 [`router.ts`] — deferred, code is correct; story 41.3 was marked done before this step was completed

## Dev Notes

### Files Being Modified

| File | Change |
|------|--------|
| `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx` | UPDATE — add blacklist toggle button |
| `job-hunt-dashboard/src/client/lib/router.ts` | UPDATE — add blacklist pre-fetch to job-showing route loaders |

No new files. No backend changes. No migration. All hooks were created in Story 41.3.

---

### File 1: `JobDrawer.tsx` — What to Change

The current action row (starting at line 139) is a `div` with `className="flex flex-wrap items-center gap-2"` containing:
1. Visit link (external)
2. Applied/Unarchive toggle button
3. Archive toggle button

**Add a 4th button after the archive button** (still inside the same `flex flex-wrap` div).

**New imports to add:**

```ts
import { toast } from 'sonner'
import { useBlacklistQuery } from '../../hooks/useBlacklistQuery'
import { useAddToBlacklist, useRemoveFromBlacklist } from '../../hooks/useBlacklistMutations'
```

Add `Ban` to the existing lucide-react import line (line 2):
```ts
import { ExternalLink, Archive, ArchiveRestore, Wand2, FileText, Download, CheckCircle, Circle, Pencil, Info, Ban } from 'lucide-react'
```

**Hook calls to add inside `JobDrawer` function body** (alongside the other hook calls at lines 74–77):

```ts
const { data: blacklist = [] } = useBlacklistQuery()
const addToBlacklist = useAddToBlacklist()
const removeFromBlacklist = useRemoveFromBlacklist()
```

**Derived values** (inside the `if (job && ...)` block or at render time — guard with `job` being non-null):

```ts
const isBlacklisted = job ? blacklist.some(e => e.companyName === job.company.toLowerCase()) : false
const blacklistEntry = job ? blacklist.find(e => e.companyName === job.company.toLowerCase()) : undefined
```

**The toggle button JSX** (place after the archive button, still inside `{job && (...)}` guard):

```tsx
<button
  onClick={() => {
    if (!job) return
    if (isBlacklisted && blacklistEntry) {
      removeFromBlacklist.mutate(blacklistEntry.id, {
        onSuccess: () => toast.success(`${job.company} removed from blacklist`),
        onError: (err: Error) => toast.error(err.message),
      })
    } else {
      addToBlacklist.mutate(
        { companyName: job.company },
        {
          onSuccess: () => toast.success(`Added ${job.company} to blacklist`),
          onError: (err: Error) => toast.error(err.message),
        },
      )
    }
  }}
  disabled={addToBlacklist.isPending || removeFromBlacklist.isPending}
  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
    isBlacklisted
      ? 'border-red-700/60 text-red-400 hover:border-zinc-600 hover:text-zinc-400'
      : 'border-zinc-700 text-zinc-400 hover:border-red-700/60 hover:text-red-400'
  }`}
>
  <Ban size={13} />
  {isBlacklisted ? 'Remove from Blacklist' : 'Add Company to Blacklist'}
</button>
```

**Critical — toast must use original-case company name:** `job.company`, NOT `blacklistEntry.companyName` (which is stored lowercase). The AC explicitly says "[company name]" means original-case.

---

### File 2: `router.ts` — Route Loader Updates

`fetchBlacklist` is **already imported** in `router.ts` at line 38:
```ts
import { fetchBlacklist } from '../hooks/useBlacklistQuery'
```

No new imports needed. Only update the four loaders that currently pre-fetch `['jobs']`:

```ts
// indexRoute (line 131–132): Pipeline view — primary route where drawer opens
loader: () => Promise.all([
  queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
  queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
]),

// trackerRoute (line 138–139): /applications view
loader: () => Promise.all([
  queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
  queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
]),

// archivedRoute (line 144–146): /archive view
loader: () => Promise.all([
  queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
  queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
]),

// matchesRoute (line 155–159): /matches view
loader: () => Promise.all([
  queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
  queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: fetchBlacklist }),
]),
```

`messagesRoute` also pre-fetches `['jobs']` but the drawer is unlikely to be opened from that route — skip it for now (no AC requires it, and the query will be fetched on-demand by the hook if needed).

---

### Architecture Compliance

- `useBlacklistQuery()` returns cached data — no extra network request when blacklist is pre-fetched by the loader
- Hook calls follow the existing pattern: all hooks called unconditionally at the function body level, not inside conditionals
- `useAddToBlacklist` / `useRemoveFromBlacklist` return mutation objects; do NOT call `.mutate()` at hook call time
- `queryClient` singleton from `lib/query-client.ts` is already used in `router.ts` — consistent
- `toast` from `sonner` — already used in other components (e.g., `job-sources-blacklist.tsx`)
- `apiFetch` CSRF injection is handled inside the hook's `mutationFn` — no extra work in the component
- TypeScript strict mode: `blacklistEntry` typed as `BlacklistEntry | undefined`; guard before accessing `.id`
- Do NOT import `BlacklistEntry` type into `JobDrawer.tsx` — the `blacklist.find(...)` return type infers it automatically

### Critical Don't-Miss Rules

- **No `fetch()` directly in the component** — use the hooks (`useBlacklistQuery`, `useAddToBlacklist`, `useRemoveFromBlacklist`)
- **No server state in `useState`** — blacklist data lives exclusively in TanStack Query cache
- **`job.company` (original case) in toasts** — not `blacklistEntry.companyName` (stored lowercase)
- **`job.company.toLowerCase()` for matching** — blacklist stores lowercase; job data stores original case
- **Disable button on BOTH mutations pending** — `addToBlacklist.isPending || removeFromBlacklist.isPending` (not just one)
- **Guard `blacklistEntry` before accessing `.id`** — use `isBlacklisted && blacklistEntry` in the condition
- **`Promise.all` in loaders** — `queryClient.ensureQueryData` returns a Promise; must use `Promise.all` when combining with an existing `ensureQueryData`

### What Story 41.3 Created (Do Not Recreate)

- `job-hunt-dashboard/src/client/hooks/useBlacklistQuery.ts` — `fetchBlacklist` + `useBlacklistQuery`
- `job-hunt-dashboard/src/client/hooks/useBlacklistMutations.ts` — `useAddToBlacklist` + `useRemoveFromBlacklist`
- API: `GET/POST/DELETE /api/blacklist` — fully working from Story 41.1
- `fetchBlacklist` is already imported in `router.ts` line 38

### References

- Epic 41 spec: `_bmad-output/planning-artifacts/epics/epic-41-company-blacklist.md`
- Story 41.3 (done, hooks created): `_bmad-output/implementation-artifacts/41-3-config-ui-job-sources-blacklist-page.md`
- JobDrawer: `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx`
- Router: `job-hunt-dashboard/src/client/lib/router.ts`
- useBlacklistQuery hook: `job-hunt-dashboard/src/client/hooks/useBlacklistQuery.ts`
- useBlacklistMutations hook: `job-hunt-dashboard/src/client/hooks/useBlacklistMutations.ts`
- Toast: `sonner` — `import { toast } from 'sonner'`
- Project context (all rules): `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `Ban`, `toast`, `useBlacklistQuery`, `useAddToBlacklist`, `useRemoveFromBlacklist` imports to `JobDrawer.tsx`
- Added three hook calls at the top of `JobDrawer` function body (unconditionally, per rules)
- Derived `isBlacklisted` and `blacklistEntry` from blacklist data before the return statement using `job.company.toLowerCase()` for matching
- Added blacklist toggle button after the archive button in the action row; uses original-case `job.company` in toasts
- Button disabled on both mutation pending states; `blacklistEntry` guarded before `.id` access
- Updated four route loaders (`/`, `/applications`, `/archive`, `/matches`) to `Promise.all` pre-fetching both `['jobs']` and `['blacklist']`; `messagesRoute` intentionally skipped per story notes
- All 10 blacklist tests pass; 13 pre-existing failures in `api-onboarding.test.ts` were present before this story

### File List

- `job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx`
- `job-hunt-dashboard/src/client/lib/router.ts`

## Change Log

- 2026-06-06: Added blacklist toggle button to JobDrawer action row and pre-cached blacklist in four route loaders
