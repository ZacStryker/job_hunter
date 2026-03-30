# Story 2.3: /api/sync Endpoint & Sync Button UI

Status: done

## Story

As a user,
I want to click a Sync button and get clear feedback on whether my Google Sheets data synced successfully,
so that I know my dashboard is up to date and trust that my existing data was not corrupted.

## Acceptance Criteria

1. **Given** the user clicks the Sync button **When** the sync is in progress **Then** the button shows a spinner and "Syncing…" label and is disabled for the duration

2. **Given** a successful sync **When** the operation completes **Then** a shadcn `Alert` (default variant) appears below the header bar showing "X records added, Y updated" **And** the TanStack Query `['jobs']` cache is invalidated triggering a re-fetch **And** the alert auto-dismisses after 4 seconds and the button returns to idle

3. **Given** a sync failure (OAuth error, Sheets API error, or DB write error) **When** the operation fails **Then** a shadcn `Alert` (destructive variant) appears below the header bar showing the specific error message and "No data was modified." **And** the alert persists until the user triggers the next sync attempt **And** the existing jobs data in the table is unchanged

4. **Given** the user runs Sync a second time immediately after a successful sync **When** the second sync completes **Then** the result shows "0 records added, X updated" — idempotent behavior with no data corruption

5. **Given** a `POST /api/sync` request **When** it is called **Then** it calls `fetchJobsFromSheets()` → passes `JobInput[]` to the ingest logic → returns `{ added: number, updated: number }` on success **Or** returns `{ error: string }` with HTTP 500 on any service failure — errors bubble to the existing error handler; no new catch logic in the route handler

## Tasks / Subtasks

- [x] Task 1: Extract ingest logic to `src/server/services/ingest-service.ts` (AC: 4, 5)
  - [x] Export `ingestJobs(rows: JobInput[]): { added: number; updated: number }` — move the exact DB transaction logic from `api-ingest.ts` to this function (preserving `\x00` separator, ON CONFLICT SET columns, added/updated counting)
  - [x] Refactor `api-ingest.ts`: replace inline DB logic with `import { ingestJobs } from '../services/ingest-service'` and call `ingestJobs(parsed.data)` — no behavior change, zero test regressions

- [x] Task 2: Create `src/server/routes/api-sync.ts` (AC: 5)
  - [x] Export a Hono app with `app.post('/', ...)` handler
  - [x] Handler: call `await fetchJobsFromSheets()` then call `ingestJobs(jobs)` then return `c.json(result)`
  - [x] No try/catch — throw errors freely; they propagate to the registered `errorHandler` middleware (returns `{ error: string }` + HTTP 500)
  - [x] No payload body expected — `POST /api/sync` takes no request body

- [x] Task 3: Register `/api/sync` route in `src/index.ts` (AC: 5)
  - [x] Add `import syncRoute from './server/routes/api-sync'`
  - [x] Add `app.route('/api/sync', syncRoute)` — place after the existing `app.route('/api/ingest', ingestRoute)` line, before `app.onError(errorHandler)`

- [x] Task 4: Write `src/server/routes/api-sync.test.ts` (AC: 5)
  - [x] Use `mock.module()` to mock both `'../services/sheets-sync'` and `'../services/ingest-service'` — use a mutable variable pattern so mock behavior can be changed per test
  - [x] Test: success path → fetchJobsFromSheets resolves with mock jobs, ingestJobs returns `{ added: 2, updated: 1 }` → 200 `{ added: 2, updated: 1 }`
  - [x] Test: fetchJobsFromSheets throws `"OAuth token expired or invalid"` → test app with errorHandler registered returns 500 `{ error: "OAuth token expired or invalid" }`
  - [x] Test: fetchJobsFromSheets returns `[]` (empty sheet) → ingestJobs([]) returns `{ added: 0, updated: 0 }` → 200 `{ added: 0, updated: 0 }`
  - [x] Response must use `"error"` key, never `"message"` key on failures

- [x] Task 5: Install shadcn Alert component (AC: 2, 3)
  - [x] Run `bunx shadcn@latest add alert` — adds `src/client/components/ui/alert.tsx`
  - [x] Do NOT hand-write the Alert component — use the shadcn CLI to generate it

- [x] Task 6: Create `src/client/hooks/useSyncMutation.ts` (AC: 2, 3, 4)
  - [x] Use TanStack Query `useMutation` + `useQueryClient`
  - [x] `mutationFn`: POST to `/api/sync`, check `res.ok`, throw `new Error(body.error)` on failure, return `res.json() as Promise<SyncResult>` on success
  - [x] `onSuccess`: call `queryClient.invalidateQueries({ queryKey: ['jobs'] })` — full re-fetch, not optimistic update
  - [x] Export `useSyncMutation` as default named export; return the full mutation object from the hook

- [x] Task 7: Create `src/client/components/shared/SyncButton.tsx` (AC: 1)
  - [x] Accept props: `{ onSync: () => void; isPending: boolean }` — caller (Layout) owns mutation state
  - [x] Idle: renders shadcn `<Button variant="outline" size="sm">Sync</Button>`
  - [x] Loading: renders `<Button variant="outline" size="sm" disabled>` with `<Loader2 className="mr-2 h-4 w-4 animate-spin" />` + "Syncing…" — import `Loader2` from `lucide-react` (already available via shadcn setup)
  - [x] No success/error state in the button itself — feedback lives in the Alert (owned by Layout)

- [x] Task 8: Update `src/client/components/shared/Layout.tsx` (AC: 1, 2, 3)
  - [x] Import and call `useSyncMutation()` at the top of `Layout` — owns the mutation state
  - [x] Add local state: `const [alertDismissed, setAlertDismissed] = useState(false)`
  - [x] `useEffect` reset: when `syncMutation.isPending` becomes true, call `setAlertDismissed(false)` to clear prior alert state
  - [x] `useEffect` auto-dismiss: when `syncMutation.isSuccess && !alertDismissed`, set a 4-second `setTimeout` → `setAlertDismissed(true)`; return cleanup with `clearTimeout`
  - [x] Replace disabled placeholder `<Button>` with `<SyncButton onSync={() => syncMutation.mutate()} isPending={syncMutation.isPending} />`
  - [x] Render alert strip between `<header>` and `<main>` — only when `!alertDismissed && (syncMutation.isSuccess || syncMutation.isError)`:
    - Success: `<Alert>` (default variant) — title "Sync complete", description `"{data.added} records added, {data.updated} updated"`
    - Error: `<Alert variant="destructive">` — title "Sync failed", description `"{error.message} No data was modified."`
  - [x] Keep the existing structure of `<main className="h-[calc(100vh-56px)] overflow-auto"><Outlet /></main>` intact — alert strip sits outside `<main>`, between header and main, does NOT push main height (use absolute or non-layout positioning if needed, or accept that main height shrinks slightly — either is fine)

- [x] Task 9: Verify (AC: 1–5)
  - [x] `/home/zac/.bun/bin/bun test src/server/` — all server tests pass including new api-sync tests and unchanged api-ingest regression tests
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] Manual check: `bun run dev`, click Sync → loading state visible → Alert appears with result

### Review Findings

- [x] [Review][Patch] Non-JSON error response (502/504 HTML body) crashes `res.json()` in useSyncMutation, surfacing a SyntaxError instead of a meaningful message [useSyncMutation.ts:9-11]
- [x] [Review][Patch] Error alert description missing punctuation — `"{error.message} No data was modified."` produces run-on text when error lacks trailing period [Layout.tsx]
- [x] [Review][Patch] `showAlert` does not exclude `isPending` — if TanStack does not immediately clear isSuccess/isError on new mutate(), stale alert may flash during loading [Layout.tsx]
- [x] [Review][Patch] Missing test: `mockIngestJobs` throws → verifies 500 `{ error: string }` (AC5 requires DB write errors are also covered) [api-sync.test.ts]
- [x] [Review][Patch] `SyncButton` two-branch early-return pattern unmounts/remounts DOM node on state change, causing focus loss during pending transition [SyncButton.tsx]
- [x] [Review][Defer] TOCTOU: pre-query snapshot outside transaction creates race for count accuracy under concurrent requests [ingest-service.ts:8-12] — deferred, single-user localhost tool; same pattern already logged from Story 2.1
- [x] [Review][Defer] `body.error` undefined guard — non-standard server error shape would render "undefined. No data was modified." [useSyncMutation.ts:11] — deferred, error handler guarantees `{ error: string }` shape
- [x] [Review][Defer] `role="alert"` may not announce dynamically-inserted content in all screen reader/browser combos [alert.tsx] — deferred, personal tool; revisit if accessibility requirements harden
- [x] [Review][Defer] `\x00` null-byte separator collision if company/jobTitle contains a null byte [ingest-service.ts:12] — deferred, exotic input; DB unique index still enforces correctness
- [x] [Review][Defer] Empty `rows[]` still runs full table scan pre-query; add early-return guard [ingest-service.ts:8-11] — deferred, negligible at expected data volumes
- [x] [Review][Defer] `afterEach` resets `mockIngestJobs` to real implementation backed by shared `:memory:` DB; DB state not cleared between files [api-sync.test.ts:14] — deferred, pre-existing test architecture pattern

## Dev Notes

### Critical: `ingest-service.ts` Extraction

The ingest logic in `api-ingest.ts` is inline in the handler. You MUST extract it so `/api/sync` can reuse it without duplication.

**DO NOT** call `fetch('/api/ingest', ...)` internally — no internal HTTP calls.
**DO NOT** duplicate the DB transaction logic in `api-sync.ts`.

The extracted `ingestJobs` function must preserve:
- `\x00` separator for compound key collision prevention (not `::` — see review finding from Story 2.1)
- Exact ON CONFLICT SET columns: `fitScore`, `recommendation`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription`, `sourceUrl`, `dateScraped`
- User-owned fields **NOT** in the SET clause: `applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`

After refactoring `api-ingest.ts`, run the existing tests to confirm zero regressions before moving on.

The test file `api-ingest.test.ts` has a local `runIngest()` helper that mirrors the production logic — this does NOT need to be updated (it's a test fixture, not a dependency on production code).

### New Files This Story

```
src/server/
  services/
    ingest-service.ts         ← NEW (Task 1) — extracted from api-ingest.ts
  routes/
    api-sync.ts               ← NEW (Task 2)
    api-sync.test.ts          ← NEW (Task 4)
src/client/
  hooks/
    useSyncMutation.ts        ← NEW (Task 6)
  components/
    shared/
      SyncButton.tsx          ← NEW (Task 7)
      Layout.tsx              ← MODIFY (Task 8)
    ui/
      alert.tsx               ← NEW via shadcn CLI (Task 5)
```

**Modified files**: `src/server/routes/api-ingest.ts` (refactor only), `src/index.ts` (add route), `src/client/components/shared/Layout.tsx`
**DO NOT touch**: `src/shared/schemas.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `src/server/services/oauth-client.ts`, `src/server/services/sheets-sync.ts`

### `api-sync.ts` Route — Complete Implementation

```ts
import { Hono } from 'hono'
import { fetchJobsFromSheets } from '../services/sheets-sync'
import { ingestJobs } from '../services/ingest-service'

const app = new Hono()

app.post('/', async (c) => {
  const jobs = await fetchJobsFromSheets()
  const result = ingestJobs(jobs)
  return c.json(result)
})

export default app
```

No try/catch — errors thrown by `fetchJobsFromSheets()` (e.g., `"OAuth token expired or invalid"`, `"Sheets API error 403: ..."`) propagate to the Hono `errorHandler` middleware in `src/index.ts`, which returns `{ error: message }` + HTTP 500.

### `useSyncMutation.ts` — Complete Implementation

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SyncResult } from '../../shared/schemas'

export function useSyncMutation() {
  const queryClient = useQueryClient()
  return useMutation<SyncResult, Error>({
    mutationFn: async () => {
      const res = await fetch('/api/sync', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json() as { error: string }
        throw new Error(body.error)
      }
      return res.json() as Promise<SyncResult>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
```

### `Layout.tsx` Alert Placement — Concrete Pattern

```tsx
const syncMutation = useSyncMutation()
const [alertDismissed, setAlertDismissed] = useState(false)

useEffect(() => {
  if (syncMutation.isPending) setAlertDismissed(false)
}, [syncMutation.isPending])

useEffect(() => {
  if (syncMutation.isSuccess && !alertDismissed) {
    const t = setTimeout(() => setAlertDismissed(true), 4000)
    return () => clearTimeout(t)
  }
}, [syncMutation.isSuccess, alertDismissed])

const showAlert = !alertDismissed && (syncMutation.isSuccess || syncMutation.isError)

// Template:
<div className="min-h-screen bg-zinc-950 text-zinc-100">
  <header ...>
    {/* ...existing header content... */}
    <SyncButton onSync={() => syncMutation.mutate()} isPending={syncMutation.isPending} />
  </header>

  {showAlert && (
    <div className="px-4 py-2">
      {syncMutation.isSuccess && (
        <Alert>
          <AlertTitle>Sync complete</AlertTitle>
          <AlertDescription>
            {syncMutation.data.added} records added, {syncMutation.data.updated} updated
          </AlertDescription>
        </Alert>
      )}
      {syncMutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Sync failed</AlertTitle>
          <AlertDescription>
            {syncMutation.error.message} No data was modified.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )}

  <main className="h-[calc(100vh-56px)] overflow-auto">
    <Outlet />
  </main>
</div>
```

Note: If you add the alert strip, `main`'s `h-[calc(100vh-56px)]` will be slightly off — adjust to `overflow-auto` without the fixed height constraint, or wrap both in a flex-col container. Don't overthink it; correctness matters more than pixel-perfect scroll height at this stage.

### `api-sync.test.ts` — Test Structure

Mock pattern to allow per-test behavior control:

```ts
import { mock, test, expect, describe } from 'bun:test'
import { Hono } from 'hono'
import type { JobInput } from '../../shared/schemas'

// Mutable mock functions — reassign per test for different behaviors
let mockFetchJobs: () => Promise<JobInput[]> = () => Promise.resolve([])
let mockIngestJobs: (rows: JobInput[]) => { added: number; updated: number } = () => ({ added: 0, updated: 0 })

mock.module('../services/sheets-sync', () => ({
  fetchJobsFromSheets: () => mockFetchJobs(),
}))
mock.module('../services/ingest-service', () => ({
  ingestJobs: (rows: JobInput[]) => mockIngestJobs(rows),
}))

// Import AFTER mock.module() calls
const { default: syncRoute } = await import('./api-sync')
const { errorHandler } = await import('../middleware/error-handler')

// Test app with error handler — matches production setup
const testApp = new Hono()
testApp.route('/', syncRoute)
testApp.onError(errorHandler)

describe('POST /api/sync', () => {
  test('returns 200 with sync result on success', async () => {
    mockFetchJobs = () => Promise.resolve([/* any valid JobInput */])
    mockIngestJobs = () => ({ added: 2, updated: 1 })

    const res = await testApp.request('/', { method: 'POST' })
    expect(res.status).toBe(200)
    const data = await res.json() as { added: number; updated: number }
    expect(data).toEqual({ added: 2, updated: 1 })
  })

  test('propagates OAuth error as 500 { error: string }', async () => {
    mockFetchJobs = () => Promise.reject(new Error('OAuth token expired or invalid'))

    const res = await testApp.request('/', { method: 'POST' })
    expect(res.status).toBe(500)
    const data = await res.json() as Record<string, unknown>
    expect(data).toHaveProperty('error')
    expect(data).not.toHaveProperty('message')
    expect(data.error).toBe('OAuth token expired or invalid')
  })

  test('returns { added: 0, updated: 0 } for empty spreadsheet', async () => {
    mockFetchJobs = () => Promise.resolve([])
    mockIngestJobs = () => ({ added: 0, updated: 0 })

    const res = await testApp.request('/', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ added: 0, updated: 0 })
  })
})
```

### Shared Types — What to Import

- `SyncResult` from `../../shared/schemas` — the response type for `/api/sync` (already defined: `{ added: number, updated: number }`)
- `JobInput` from `../../shared/schemas` — the input type for `ingestJobs()`
- **DO NOT** redefine these types locally — always import from shared

### Error Response Shape (Hard Rule)

All error responses MUST be `{ error: string }` — NEVER `{ message: string }` or `{ error: { message } }`.
This is enforced by the existing `errorHandler` middleware and tested in `api-ingest.test.ts`.

### Bun PATH — Critical

Do NOT use `bun` as a bare command in shell commands. Always use `/home/zac/.bun/bin/bun`.
- ✅ `/home/zac/.bun/bin/bun test src/server/`
- ✅ `/home/zac/.bun/bin/bun run --bun tsc --noEmit`
- ❌ `bun test` (not in PATH)

### TanStack Query Cache Strategy

| Operation | Strategy |
|---|---|
| `POST /api/sync` success | `invalidateQueries({ queryKey: ['jobs'] })` — full re-fetch |
| `PATCH /api/jobs/:id` (future story) | optimistic update on `['jobs']` |

**Never** use `setQueryData` for sync — sync may add/modify many records; only full invalidation is safe.

### UX Constraints

| Requirement | Source |
|---|---|
| Alert below header bar (not floating toast) | UX-DR13 |
| Success alert auto-dismisses after 4s | UX-DR13 |
| Error alert persists until next sync | UX-DR13 |
| Button spinner + disabled during load | UX-DR7 (loading state) |
| `Loader2` from `lucide-react` for spinner | shadcn convention |
| Column visibility toggle NOT in this story | Epic 3 / Story 3.3 |

### Anti-Patterns (Do Not Do)

- ❌ Internal `fetch('/api/ingest', ...)` from api-sync — use `ingestJobs()` directly
- ❌ Duplicate the DB transaction in api-sync.ts — extract to ingest-service.ts
- ❌ Toast notifications — all sync feedback via inline Alert
- ❌ `useState` for server sync state — use TanStack Query mutation state
- ❌ `fetch('/api/sync')` directly in a component — always use `useSyncMutation` hook
- ❌ Define `SyncResult` type locally — import from `src/shared/schemas`
- ❌ Modify `src/shared/schemas.ts`, `oauth-client.ts`, `sheets-sync.ts`, or any DB files
- ❌ `0.0.0.0` binding — `src/index.ts` already binds to `127.0.0.1`; do not change
- ❌ Installing `googleapis` or any Google SDK — already handled in previous story

### Project Structure After This Story

```
src/server/
  middleware/
    error-handler.ts          ← existing (unchanged)
  routes/
    api-ingest.ts             ← existing (refactored: calls ingestJobs())
    api-ingest.test.ts        ← existing (unchanged — runIngest helper stays)
    api-sync.ts               ← NEW
    api-sync.test.ts          ← NEW
  services/
    ingest-service.ts         ← NEW (extracted from api-ingest.ts)
    oauth-client.ts           ← existing (unchanged)
    oauth-client.test.ts      ← existing (unchanged)
    sheets-sync.ts            ← existing (unchanged)
    sheets-sync.test.ts       ← existing (unchanged)
src/client/
  hooks/
    useSyncMutation.ts        ← NEW
  components/
    shared/
      Layout.tsx              ← MODIFIED
      SyncButton.tsx          ← NEW
    ui/
      button.tsx              ← existing
      alert.tsx               ← NEW (shadcn add alert)
```

### Previous Story Learnings (from 2.1 & 2.2)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **TypeScript strict mode** — all exported functions need explicit return types; no implicit `any`
- **Composite key separator** — MUST be `\x00` not `::` — prevent collision on company/jobTitle values containing `::`
- **Co-located tests** — place `api-sync.test.ts` in `src/server/routes/`, not `__tests__/`
- **Error shape is frozen** — `{ error: string }`, never `{ message: string }`
- **No `console.log` for errors** — use `console.error` in handlers; services throw
- **`mock.module()` must be called BEFORE dynamic import of module under test** — see oauth-client.test.ts and sheets-sync.test.ts patterns
- **`global.fetch` mock state bleeds** — restore after each test or use `mock.module()` instead of global mock

### References

- Architecture: `POST /api/sync` route spec [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- Architecture: Cache invalidation strategy — `POST /api/sync` invalidates `['jobs']` [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns]
- Architecture: Error response shape `{ error: string }` frozen [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines]
- Architecture: No direct fetch in components — use hooks [Source: _bmad-output/planning-artifacts/architecture.md#Anti-Patterns]
- UX-DR7: SyncButton states (idle, loading) [Source: _bmad-output/planning-artifacts/epics.md#UX Design Requirements]
- UX-DR13: Alert below header, success 4s dismiss, error persists [Source: _bmad-output/planning-artifacts/epics.md#UX Design Requirements]
- Epics: Story 2.3 acceptance criteria [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]
- Shared types: `SyncResult`, `JobInput` [Source: src/shared/schemas.ts]
- Previous story 2.2 learnings: services throw, `mock.module()` pattern [Source: _bmad-output/implementation-artifacts/2-2-google-sheets-oauth-client-and-column-mapping.md#Dev Notes]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Bun 1.3.11 shares module registry across test files in same `bun test` run. `mock.module()` live bindings bleed between files. Fixed by importing real `ingestJobs` before mocking in `api-sync.test.ts` so the default mock delegate is the real implementation; `afterEach` resets to prevent per-test state leakage.

### Completion Notes List

- Extracted `ingestJobs()` from `api-ingest.ts` to `src/server/services/ingest-service.ts` preserving `\x00` separator, ON CONFLICT SET columns, and add/update counting. All 14 existing `api-ingest` tests pass with zero regressions.
- Created `api-sync.ts` route (no try/catch, errors propagate to errorHandler) and registered it in `src/index.ts`.
- Wrote 3 tests covering success, OAuth error (propagated as 500), and empty sheet (idempotent zero counts). All pass.
- Installed shadcn Alert via CLI (`bunx shadcn@latest add alert`).
- Created `useSyncMutation` hook with TanStack Query mutation + `['jobs']` cache invalidation on success.
- Created `SyncButton` component with idle/loading states using `Loader2` from lucide-react.
- Updated `Layout.tsx`: wired `useSyncMutation`, added alert strip between header and main with 4-second auto-dismiss for success and persistent display for errors.
- All 25 server tests pass; zero TypeScript errors.

### File List

- `job-hunt-dashboard/src/server/services/ingest-service.ts` (new)
- `job-hunt-dashboard/src/server/routes/api-ingest.ts` (modified — refactored to call ingestJobs)
- `job-hunt-dashboard/src/server/routes/api-sync.ts` (new)
- `job-hunt-dashboard/src/server/routes/api-sync.test.ts` (new)
- `job-hunt-dashboard/src/index.ts` (modified — added sync route)
- `job-hunt-dashboard/src/client/components/ui/alert.tsx` (new — shadcn CLI)
- `job-hunt-dashboard/src/client/hooks/useSyncMutation.ts` (new)
- `job-hunt-dashboard/src/client/components/shared/SyncButton.tsx` (new)
- `job-hunt-dashboard/src/client/components/shared/Layout.tsx` (modified)

## Change Log

- 2026-03-30: Story implemented — extracted ingest logic to service, added /api/sync route, installed shadcn Alert, created useSyncMutation hook and SyncButton component, updated Layout with sync feedback UI. 25 server tests pass, 0 TypeScript errors.
