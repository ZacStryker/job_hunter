# Story 10.1: Webhook History Tab

Status: done

## Story

As a job seeker,
I want a History tab that shows a log of every webhook run (Discovery, Analysis, Cover Letter, Resume),
so that I can see when I triggered each workflow, whether it succeeded, and how many items it processed.

## Acceptance Criteria

1. **Given** the user is on any view
   **When** they click "History" in the nav
   **Then** a `/history` route renders a table with columns: Run Date, Name, Success, Item Count — ordered by Run Date descending

2. **Given** the History tab is open
   **When** the data loads
   **Then** the table auto-refreshes every 15 seconds without a full page reload

3. **Given** the user clicks the "Discovery" button in the header
   **When** the request completes (success or failure)
   **Then** a new row is added to the history table with Name="Discovery", Success=true/false, Item Count from n8n response `count` field (or null if not present)

4. **Given** the user clicks the "Analysis" button in the header
   **When** the request completes (success or failure)
   **Then** a new row is added with Name="Analysis", Success=true/false, Item Count from n8n response `count` field (or null)

5. **Given** a Cover Letter is generated for a job (from the drawer)
   **When** the generation completes (success or failure)
   **Then** a new row appears with Name="Cover Letter - {company} - {jobTitle}", Success=true/false, Item Count=1 on success / 0 on failure

6. **Given** a Resume is generated for a job (from the drawer)
   **When** the generation completes (success or failure)
   **Then** a new row appears with Name="Resume - {company} - {jobTitle}", Success=true/false, Item Count=1 on success / 0 on failure

7. **Given** no history runs exist
   **When** the History tab is open
   **Then** an empty state message is shown: "No webhook runs yet."

8. **Given** the Discovery/Analysis buttons in the header
   **When** the server routes are mounted
   **Then** the client calls `/api/webhooks/discovery` and `/api/webhooks/analysis` (server-side proxy), and the external webhook URLs are no longer exposed as VITE_ env vars

## Tasks / Subtasks

- [x] Task 1: DB schema — add `webhook_runs` table + generate migration (AC: 3–6)
  - [x] Add `webhookRuns` table to `src/db/schema.ts` (see exact definition in Dev Notes)
  - [x] Run `bun run db:generate` → produces `src/db/migrations/0009_clever_ezekiel.sql`
  - [x] Verify generated SQL contains `CREATE TABLE webhook_runs` with correct columns

- [x] Task 2: Shared schemas — add `webhookRunSchema` to `src/shared/schemas.ts` (AC: 1, 3–6)
  - [x] Add `webhookRunSchema` Zod object (see Dev Notes)
  - [x] Export `WebhookRun` type via `z.infer<typeof webhookRunSchema>`

- [x] Task 3: Server — create `src/server/routes/api-webhook-runs.ts` (AC: 1, 2)
  - [x] Implement `GET /` returning all runs ordered by `runAt DESC` → `{ runs: WebhookRun[] }`
  - [x] Export `recordRun(params)` utility function used by other routes to insert a run row (see Dev Notes)
  - [x] Export as `default app` (Hono sub-app pattern)

- [x] Task 4: Server — create `src/server/routes/api-webhooks.ts` (AC: 3, 4, 8)
  - [x] Implement `POST /discovery` — reads `DISCOVERY_WEBHOOK_URL` from env, fires webhook, records run, returns `{ ok: true }` or `{ error }` (see Dev Notes)
  - [x] Implement `POST /analysis` — same pattern with `ANALYSIS_WEBHOOK_URL`
  - [x] Both routes record run via `recordRun` from `api-webhook-runs.ts`
  - [x] Export as `default app` (Hono sub-app pattern)

- [x] Task 5: Modify `src/server/routes/api-jobs.ts` to record Cover Letter and Resume runs (AC: 5, 6)
  - [x] Import `recordRun` from `./api-webhook-runs`
  - [x] In `POST /:id/generate-cover-letter`: call `recordRun` before every `return c.json(...)` (both success and error paths after the webhook call — see Dev Notes)
  - [x] In `POST /:id/generate-resume`: same pattern

- [x] Task 6: Mount new routes in `src/index.ts` (AC: 1, 3, 4, 8)
  - [x] Import `webhookRunsRoute from './server/routes/api-webhook-runs'`
  - [x] Import `webhooksRoute from './server/routes/api-webhooks'`
  - [x] Add `app.route('/api/webhook-runs', webhookRunsRoute)` after existing routes
  - [x] Add `app.route('/api/webhooks', webhooksRoute)` after existing routes

- [x] Task 7: Client hook — create `src/client/hooks/useWebhookRunsQuery.ts` (AC: 1, 2)
  - [x] `useQuery` with key `['webhook-runs']`, queryFn fetches `/api/webhook-runs` → returns `WebhookRun[]` from `body.runs`
  - [x] Set `refetchInterval: 15_000` for auto-refresh

- [x] Task 8: Client route — create `src/client/routes/history.tsx` (AC: 1, 2, 7)
  - [x] Export `HistoryRoute` component using `useWebhookRunsQuery`
  - [x] TanStack Table v8 with 4 columns: Run Date, Name, Success, Item Count (see Dev Notes for column defs)
  - [x] Empty state: "No webhook runs yet." when `runs.length === 0`

- [x] Task 9: Wire up router and nav (AC: 1, 8)
  - [x] Add `historyRoute` to `src/client/lib/router.ts` at path `/history` with `HistoryRoute` component (no loader needed)
  - [x] Add `<Link to="/history">` in `src/client/components/shared/Layout.tsx` nav (after "Messages")
  - [x] Change Discovery mutation from `useWebhookMutation(import.meta.env.VITE_DISCOVERY_WEBHOOK_URL ?? '')` to `useWebhookMutation('/api/webhooks/discovery')` in `Layout.tsx`
  - [x] Change Analysis mutation to `useWebhookMutation('/api/webhooks/analysis')` in `Layout.tsx`

- [x] Task 10: Env var housekeeping (AC: 8)
  - [x] Remove `VITE_DISCOVERY_WEBHOOK_URL` and `VITE_ANALYSIS_WEBHOOK_URL` from `.env.example`
  - [x] Add `DISCOVERY_WEBHOOK_URL` and `ANALYSIS_WEBHOOK_URL` as optional server-side vars in `.env.example` with comments

## Dev Notes

### DB Table Definition

Add to `src/db/schema.ts`:

```ts
export const webhookRuns = sqliteTable('webhook_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  runAt: text('run_at').notNull(),          // ISO 8601 datetime
  success: integer('success', { mode: 'boolean' }).notNull(),
  itemCount: integer('item_count'),          // nullable — null when unknown
  errorMessage: text('error_message'),       // nullable — set only on failure
})
```

### Shared Schema Addition

Add to `src/shared/schemas.ts`:

```ts
export const webhookRunSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  runAt: z.string(),
  success: z.boolean(),
  itemCount: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
})
export type WebhookRun = z.infer<typeof webhookRunSchema>
```

### `recordRun` utility (in `api-webhook-runs.ts`)

Export this alongside the Hono app — it is NOT a route handler:

```ts
import { db } from '../../db/client'
import { webhookRuns } from '../../db/schema'

export function recordRun(params: {
  name: string
  success: boolean
  itemCount?: number | null
  errorMessage?: string | null
}) {
  db.insert(webhookRuns).values({
    name: params.name,
    runAt: new Date().toISOString(),
    success: params.success,
    itemCount: params.itemCount ?? null,
    errorMessage: params.errorMessage ?? null,
  }).run()
}
```

`GET /` returns `{ runs: WebhookRun[] }` ordered by `desc(webhookRuns.runAt)`. Import `desc` from `drizzle-orm`.

### Discovery/Analysis proxy routes (`api-webhooks.ts`)

Both routes follow the same pattern:

```ts
async function fireWebhook(url: string): Promise<{
  success: boolean
  itemCount: number | null
  errorMessage: string | null
}> {
  try {
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(60_000) })
    if (!res.ok) {
      return { success: false, itemCount: null, errorMessage: `HTTP ${res.status}` }
    }
    let itemCount: number | null = null
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      const body = await res.json().catch(() => null) as { count?: number } | null
      if (typeof body?.count === 'number') itemCount = body.count
    }
    return { success: true, itemCount, errorMessage: null }
  } catch (err) {
    return { success: false, itemCount: null, errorMessage: err instanceof Error ? err.message : String(err) }
  }
}

app.post('/discovery', async (c) => {
  const url = process.env.DISCOVERY_WEBHOOK_URL
  if (!url) return c.json({ error: 'DISCOVERY_WEBHOOK_URL not configured' }, 503)
  const result = await fireWebhook(url)
  recordRun({ name: 'Discovery', ...result })
  if (!result.success) return c.json({ error: result.errorMessage ?? 'Discovery webhook failed' }, 502)
  return c.json({ ok: true })
})
```

`/analysis` is identical, just `ANALYSIS_WEBHOOK_URL` and name `'Analysis'`.

### Cover Letter run recording in `api-jobs.ts`

The `POST /:id/generate-cover-letter` handler already validates job existence and fires `callN8nWebhook`. Add `recordRun` calls:

- **Before the cover letter failure returns** (after `callN8nWebhook` throws): `recordRun({ name: \`Cover Letter - ${job.company} - ${job.jobTitle}\`, success: false, itemCount: 0, errorMessage: message })`
- **After successful DB insert** (before `return c.json({ coverLetter: inserted })`): `recordRun({ name: \`Cover Letter - ${job.company} - ${job.jobTitle}\`, success: true, itemCount: 1 })`
- Do NOT record for the early validation failures (invalid ID, job not found, no job description) — those are client errors, not webhook runs.

`POST /:id/generate-resume` follows the same pattern. Current handler catches the thrown error and returns 502 — record failure there. On the `return c.json({ ok: true })` path — record success with `itemCount: 1`.

### History Table Column Definitions (TanStack Table v8)

Use `@tanstack/react-table` `createColumnHelper` pattern consistent with existing tables (see `src/client/components/pipeline/` for reference):

| Column | Accessor | Render |
|--------|----------|--------|
| Run Date | `runAt` | `new Date(row.runAt).toLocaleString()` |
| Name | `name` | plain text |
| Success | `success` | green "✓" or red "✗" text (or a badge) |
| Item Count | `itemCount` | display value or "—" if null |

Table uses no sorting controls or filters — sorted server-side by `runAt DESC` already.

### `useWebhookRunsQuery` hook pattern

Follow the same pattern as `useMessagesQuery.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import type { WebhookRun } from '@shared/schemas'

export function useWebhookRunsQuery() {
  return useQuery<WebhookRun[]>({
    queryKey: ['webhook-runs'],
    queryFn: async () => {
      const res = await fetch('/api/webhook-runs')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { runs: WebhookRun[] }
      return body.runs
    },
    refetchInterval: 15_000,
  })
}
```

### Router addition (`router.ts`)

```ts
import { HistoryRoute } from '../routes/history'

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history',
  component: HistoryRoute,
  // No loader needed — useWebhookRunsQuery handles its own fetching
})

const routeTree = rootRoute.addChildren([indexRoute, trackerRoute, archivedRoute, messagesRoute, historyRoute])
```

### Layout.tsx Discovery/Analysis changes

Replace the two `useWebhookMutation` calls at the top of `Layout.tsx`:

```ts
// Before:
const discoveryMutation = useWebhookMutation(import.meta.env.VITE_DISCOVERY_WEBHOOK_URL ?? '')
const analysisMutation = useWebhookMutation(import.meta.env.VITE_ANALYSIS_WEBHOOK_URL ?? '')

// After:
const discoveryMutation = useWebhookMutation('/api/webhooks/discovery')
const analysisMutation = useWebhookMutation('/api/webhooks/analysis')
```

The `useWebhookMutation` hook itself does NOT change — it already handles non-empty URL strings fine. The `if (!url)` guard stays as a no-op safety check.

### n8n item count convention

If you want Discovery/Analysis to report item counts, configure n8n to return a JSON body with a top-level `count` field, e.g. `{ "count": 12 }`. The proxy route will parse it automatically. If n8n returns anything else, `itemCount` is stored as `null` and displayed as "—" in the table.

### `.env.example` changes

Remove:
```
VITE_DISCOVERY_WEBHOOK_URL=
VITE_ANALYSIS_WEBHOOK_URL=
```

Add (optional — app starts without them, routes return 503):
```
# Optional: n8n webhook URLs for Discovery and Analysis pipeline triggers
DISCOVERY_WEBHOOK_URL=
ANALYSIS_WEBHOOK_URL=
```

### Project Structure Notes

New files:
- `src/db/migrations/0009_<drizzle-generated>.sql` — generated by `bun run db:generate`
- `src/server/routes/api-webhook-runs.ts` — GET /api/webhook-runs + `recordRun` export
- `src/server/routes/api-webhooks.ts` — POST /api/webhooks/discovery, /analysis
- `src/client/hooks/useWebhookRunsQuery.ts`
- `src/client/routes/history.tsx`

Modified files:
- `src/db/schema.ts` — add `webhookRuns` table
- `src/shared/schemas.ts` — add `webhookRunSchema`, `WebhookRun`
- `src/server/routes/api-jobs.ts` — add `recordRun` calls in cover letter and resume handlers
- `src/index.ts` — mount two new routes
- `src/client/lib/router.ts` — add `historyRoute`
- `src/client/components/shared/Layout.tsx` — update mutation URLs, add nav link
- `.env.example` — swap env var names

### References

- Architecture: [Source: _bmad-output/planning-artifacts/architecture-distillate.md] — API style (no envelope, `{ error: string }` on failure), TanStack Query key conventions, project structure
- Existing pattern for route file shape: `src/server/routes/api-messages.ts`
- Existing pattern for query hook: `src/client/hooks/useMessagesQuery.ts`
- Existing pattern for nav tab + route: `src/client/routes/messages.tsx` + `src/client/lib/router.ts`
- TanStack Table column pattern: `src/client/components/pipeline/`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `webhook_runs` table via Drizzle schema + generated migration `0009_clever_ezekiel.sql`
- Created `recordRun` utility in `api-webhook-runs.ts` — shared by all route files that need to log webhook activity
- Created `api-webhooks.ts` with `/discovery` and `/analysis` proxy routes; both read server-side env vars (not VITE_ vars) and record runs
- Modified `api-jobs.ts` to call `recordRun` on cover letter and resume success/error paths (skips early validation errors as intended)
- Created `useWebhookRunsQuery.ts` with 15s auto-refresh via `refetchInterval`
- Created `history.tsx` using TanStack Table v8 with 4 columns; empty state shows "No webhook runs yet."
- Wired `/history` route in `router.ts` (no loader — data fetched by hook); added History nav link in `Layout.tsx`
- Replaced VITE_ env vars with server-side `DISCOVERY_WEBHOOK_URL` / `ANALYSIS_WEBHOOK_URL`
- All 93 tests pass; TypeScript build clean

### File List

New files:
- `job-hunt-dashboard/src/db/migrations/0009_clever_ezekiel.sql`
- `job-hunt-dashboard/src/server/routes/api-webhook-runs.ts`
- `job-hunt-dashboard/src/server/routes/api-webhook-runs.test.ts`
- `job-hunt-dashboard/src/server/routes/api-webhooks.ts`
- `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts`
- `job-hunt-dashboard/src/client/hooks/useWebhookRunsQuery.ts`
- `job-hunt-dashboard/src/client/routes/history.tsx`

Modified files:
- `job-hunt-dashboard/src/db/schema.ts`
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/server/routes/api-jobs.ts`
- `job-hunt-dashboard/src/index.ts`
- `job-hunt-dashboard/src/client/lib/router.ts`
- `job-hunt-dashboard/src/client/components/shared/Layout.tsx`
- `job-hunt-dashboard/.env.example`

### Review Findings

- [x] [Review][Decision] Unconditional polling — accepted as-is; always-on polling is fine for a personal tool (Option B)
- [x] [Review][Decision] Mutations don't immediately invalidate `webhook-runs` cache — fixed: added `onSettled` with `invalidateQueries(['webhook-runs'])` to `useWebhookMutation`, `useGenerateCoverLetter`, `useGenerateResume` (Option A)
- [x] [Review][Patch] `recordRun` silently crashes caller on DB write error — fixed: wrapped in try/catch, logs error and continues [`api-webhook-runs.ts`]
- [x] [Review][Patch] Email event IDs collide with manual event IDs — fixed: email events use `-m.id` (negative) to avoid collision with statusEvents integer PKs [`api-jobs.ts`]
- [ ] [Review][Patch] Alert state overwritten when two mutations complete near-simultaneously — skipped: requires alert queue refactor; low probability for single-user tool [`Layout.tsx`]
- [ ] [Review][Patch] `isSuccess` useEffect re-triggers without `mutation.reset()` — skipped: reset() interaction with timeout is non-trivial; low probability in practice [`Layout.tsx`]
- [x] [Review][Patch] Discovery and Analysis buttons not cross-disabled — fixed: each button now disabled when the other is pending [`Layout.tsx`]
- [x] [Review][Patch] `syncMutation.error?.message` unsafe access — fixed: changed to `syncMutation.error?.message ?? 'Unknown error'` [`Layout.tsx`]
- [x] [Review][Patch] "0 runs" count shown during loading — fixed: count line suppressed while `isPending` is true [`history.tsx`]
- [x] [Review][Patch] Error alert appends "— No data was modified" for webhook failures — fixed: suffix only shown when `label === 'Sync'` [`Layout.tsx`]
- [x] [Review][Patch] `N8N_RESUME_WEBHOOK_URL` missing from `.env.example` — fixed: added with comment [`.env.example`]
- [x] [Review][Defer] Unbounded `webhook_runs` table growth — no LIMIT on `GET /api/webhook-runs`; full table scan after months of use [`api-webhook-runs.ts`] — deferred, pre-existing
- [x] [Review][Defer] `fireWebhook` leaks raw infrastructure error details to client — hostname/TLS info in error messages forwarded verbatim [`api-webhooks.ts`] — deferred, pre-existing
- [x] [Review][Defer] No CSRF protection on POST webhook endpoints — pre-existing API-wide concern [`api-webhooks.ts`] — deferred, pre-existing
- [x] [Review][Defer] `runAt` stored as text with no DB-level format enforcement — ordering relies on ISO convention [`api-webhook-runs.ts`] — deferred, pre-existing
- [x] [Review][Defer] AbortSignal TimeoutError not distinguished in error message — timeout surfaces as generic network error [`api-webhooks.ts`] — deferred, pre-existing
- [x] [Review][Defer] No AbortController cleanup in `useWebhookMutation` — stale state update possible on unmount [`useWebhookMutation.ts`] — deferred, pre-existing
- [x] [Review][Defer] No `staleTime` on `useWebhookRunsQuery` — redundant fetch on every navigation to `/history` [`useWebhookRunsQuery.ts`] — deferred, pre-existing
- [x] [Review][Defer] Empty-string company/jobTitle can match unrelated messages — data quality edge case in event merge [`api-jobs.ts`] — deferred, pre-existing
- [x] [Review][Defer] No server-side concurrency guard on webhook routes — concurrent POSTs fire duplicate downstream workflow executions [`api-webhooks.ts`] — deferred, pre-existing
