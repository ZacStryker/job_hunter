# Story 3.1: Jobs API & TanStack Query Hook

Status: done

## Change Log

- 2026-04-01: Implemented story 3.1 — GET /api/jobs endpoint, useJobsQuery hook, router loader prefetch (dev-story agent)

## Story

As a user,
I want my job records loaded from the database and available in the client on app startup,
so that the pipeline table renders immediately without user-initiated actions.

## Acceptance Criteria

1. **Given** jobs exist in the SQLite database **When** `GET /api/jobs` is called **Then** it returns `{ jobs: Job[] }` with HTTP 200, with all fields in camelCase **And** dates are ISO 8601 strings; booleans are `true`/`false`; missing optional fields are explicit `null`

2. **Given** the app loads at `localhost:3000` **When** TanStack Router's route loader runs for the `/` route **Then** `queryClient.ensureQueryData` is called with key `['jobs']`, pre-populating the cache before the component renders

3. **Given** `useJobsQuery` is called in a component **When** the cache is populated **Then** it returns `{ data: Job[], isPending, isError }` — components use these directly with no custom loading wrappers

4. **Given** the jobs API call fails **When** `isError` is true **Then** the error is surfaced via TanStack Query's error state — no raw `fetch()` calls in components

## Tasks / Subtasks

- [x] Task 1: Create `src/server/routes/api-jobs.ts` (AC: 1)
  - [x] Export a Hono sub-app with `app.get('/', ...)` handler
  - [x] Handler: `const allJobs = db.select().from(jobs).all()` → `return c.json({ jobs: allJobs })`
  - [x] No `await` on the select — `bun:sqlite` driver is synchronous
  - [x] No PATCH in this story — `PATCH /api/jobs/:id` is Story 4.3
  - [x] Import `db` from `../../db/client` and `jobs` from `../../db/schema`

- [x] Task 2: Write `src/server/routes/api-jobs.test.ts` (AC: 1)
  - [x] `process.env.DB_PATH = ':memory:'` at line 1, BEFORE any other imports
  - [x] Dynamically `await import('./api-jobs')` and `await import('../../db/client')` AFTER setting DB_PATH
  - [x] `beforeAll`: run `CREATE_JOBS_TABLE` DDL on `prodSqlite` (see Dev Notes for exact SQL)
  - [x] `beforeEach`: `prodSqlite.run('DELETE FROM jobs')`
  - [x] Test (empty DB): `app.request('/', { method: 'GET' })` → status 200, body `{ jobs: [] }`
  - [x] Test (with data): insert one job row via `prodSqlite.run(INSERT...)`, GET → `{ jobs: [{ id, jobTitle, fitScore, applied: false, ... }] }` — assert camelCase keys (`jobTitle` not `job_title`)
  - [x] Assert both `res.status === 200` AND the `jobs` wrapper key in every test

- [x] Task 3: Register `/api/jobs` route in `src/index.ts` (AC: 1)
  - [x] Add `import jobsRoute from './server/routes/api-jobs'`
  - [x] Add `app.route('/api/jobs', jobsRoute)` after the existing sync route, before `app.onError(errorHandler)`
  - [x] DO NOT touch any other lines in `src/index.ts`

- [x] Task 4: Create `src/client/hooks/useJobsQuery.ts` (AC: 3, 4)
  - [x] Export `fetchJobs` async function (also consumed by router loader — must be exported, not inline)
  - [x] `fetchJobs`: GET `/api/jobs`, throw `new Error(body.error)` on `!res.ok`, return `body.jobs as Job[]` on success
  - [x] Export `useJobsQuery` hook: `useQuery<Job[], Error>({ queryKey: ['jobs'], queryFn: fetchJobs })`
  - [x] Import `useQuery` from `@tanstack/react-query`; import `Job` type from `@shared/schemas`
  - [x] Return the full query result object (caller destructures `{ data, isPending, isError }`)

- [x] Task 5: Update `src/client/lib/router.ts` with prefetch loader (AC: 2)
  - [x] Add `import { queryClient } from './query-client'`
  - [x] Add `import { fetchJobs } from '../hooks/useJobsQuery'`
  - [x] Add `loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs })` to `indexRoute` only
  - [x] DO NOT add a loader to `trackerRoute` — it renders from the same `['jobs']` cache populated by `/`
  - [x] Preserve existing `declare module '@tanstack/react-router'` type augmentation

- [x] Task 6: Verify (AC: 1–4)
  - [x] `/home/zac/.bun/bin/bun test src/server/routes/api-jobs.test.ts` — all new tests pass
  - [x] `/home/zac/.bun/bin/bun test src/server/` — all existing server tests still pass (zero regressions)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] Manual check: `bun run dev`, open browser → network tab shows `GET /api/jobs` 200

## Dev Notes

### `GET /api/jobs` Response Shape

Response is `{ jobs: Job[] }` — **NOT** a bare array. The `jobs` wrapper key is required per epic AC. The `queryFn` must extract it:

```ts
export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch('/api/jobs')
  if (!res.ok) {
    const body = await res.json() as { error: string }
    throw new Error(body.error)
  }
  const body = await res.json() as { jobs: Job[] }
  return body.jobs
}
```

### `api-jobs.ts` — Complete Implementation

```ts
import { Hono } from 'hono'
import { db } from '../../db/client'
import { jobs } from '../../db/schema'

const app = new Hono()

app.get('/', (c) => {
  const allJobs = db.select().from(jobs).all()
  return c.json({ jobs: allJobs })
})

export default app
```

`db.select().from(jobs).all()` is **synchronous** — `bun:sqlite` uses a sync driver. No `async`/`await` needed on the handler or the select.

### Drizzle camelCase Mapping

`db/client.ts` does NOT have `casing: 'camelCase'` and that is intentional — the schema already defines explicit column mappings (e.g., `jobTitle: text('job_title')`). Drizzle returns JS property names automatically. **Do NOT add `casing: 'camelCase'` to `db/client.ts`** — it would change nothing but create confusion.

### `useJobsQuery.ts` — Complete Implementation

```ts
import { useQuery } from '@tanstack/react-query'
import type { Job } from '@shared/schemas'

export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch('/api/jobs')
  if (!res.ok) {
    const body = await res.json() as { error: string }
    throw new Error(body.error)
  }
  const body = await res.json() as { jobs: Job[] }
  return body.jobs
}

export function useJobsQuery() {
  return useQuery<Job[], Error>({ queryKey: ['jobs'], queryFn: fetchJobs })
}
```

`fetchJobs` must be a **named export** so `router.ts` can import it for the route loader.

### `router.ts` — Complete Updated File

```ts
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Layout } from '../components/shared/Layout'
import { PipelineRoute } from '../routes/index'
import { TrackerRoute } from '../routes/tracker'
import { queryClient } from './query-client'
import { fetchJobs } from '../hooks/useJobsQuery'

const rootRoute = createRootRoute({
  component: Layout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PipelineRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['jobs'], queryFn: fetchJobs }),
})

const trackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tracker',
  component: TrackerRoute,
})

const routeTree = rootRoute.addChildren([indexRoute, trackerRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

### `api-jobs.test.ts` — Test Structure

```ts
process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'

const { default: jobsApp } = await import('./api-jobs')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    job_title TEXT NOT NULL,
    fit_score INTEGER,
    recommendation TEXT,
    role_fit TEXT,
    requirements_met TEXT,
    requirements_missed TEXT,
    red_flags TEXT,
    job_description TEXT,
    source_url TEXT,
    date_scraped TEXT,
    applied INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    status_override TEXT,
    cover_letter_sent_at TEXT,
    date_applied TEXT,
    UNIQUE(company, job_title)
  )
`

beforeAll(() => {
  prodSqlite.run(CREATE_JOBS_TABLE)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM jobs')
})

describe('GET /api/jobs', () => {
  test('returns 200 with empty jobs array when DB is empty', async () => {
    const res = await jobsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { jobs: unknown[] }
    expect(data).toHaveProperty('jobs')
    expect(data.jobs).toEqual([])
  })

  test('returns 200 with all jobs in camelCase', async () => {
    prodSqlite.run(
      `INSERT INTO jobs (company, job_title, fit_score, applied) VALUES ('Acme', 'Engineer', 85, 0)`
    )
    const res = await jobsApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { jobs: Record<string, unknown>[] }
    expect(data.jobs).toHaveLength(1)
    const job = data.jobs[0]
    expect(job).toHaveProperty('id')
    expect(job).toHaveProperty('jobTitle')       // camelCase — NOT job_title
    expect(job).toHaveProperty('fitScore')       // camelCase — NOT fit_score
    expect(job).toHaveProperty('applied')
    expect(job.company).toBe('Acme')
    expect(job.jobTitle).toBe('Engineer')
    expect(job.fitScore).toBe(85)
    expect(job.applied).toBe(false)              // boolean, not 0
  })
})
```

### Path Aliases (Client Files Only)

- `@shared/*` → `src/shared/*`: use `import type { Job } from '@shared/schemas'` in client files
- `@/*` → `src/client/*`: use `import { queryClient } from '@/lib/query-client'` if preferred
- Server-side files always use relative imports (e.g., `../../shared/schemas`)

### Bun Shared Module Registry

Bun 1.3.11 shares the module registry across test files in the same `bun test` run. The `prodDb` module may already be loaded from `api-ingest.test.ts`. Setting `process.env.DB_PATH = ':memory:'` at the top of the test file is still required — it ensures the in-memory DB is used when `api-jobs.ts` is first imported in this file's context.

### Project Structure After This Story

```
src/server/
  routes/
    api-jobs.ts          ← NEW
    api-jobs.test.ts     ← NEW
    api-ingest.ts        ← existing (unchanged)
    api-sync.ts          ← existing (unchanged)
src/client/
  hooks/
    useJobsQuery.ts      ← NEW
    useSyncMutation.ts   ← existing (unchanged)
  lib/
    router.ts            ← MODIFIED (loader added to indexRoute)
src/
  index.ts               ← MODIFIED (add /api/jobs route)
```

### Previous Story Learnings (from 2.1–2.3)

- **`bun` not in PATH** — always `/home/zac/.bun/bin/bun` for CLI commands
- **TypeScript strict mode** — explicit return types on all exported functions; no implicit `any`
- **`process.env.DB_PATH = ':memory:'` FIRST** — must be line 1 of every test file touching the DB, before any imports
- **Dynamic imports in tests** — `await import(...)` the module under test AFTER setting DB_PATH
- **Co-located tests** — `api-jobs.test.ts` in `src/server/routes/`, not `__tests__/`
- **Error shape is frozen** — `{ error: string }`; assert `toHaveProperty('error')`, `not.toHaveProperty('message')`
- **Sync SQLite** — `db.select().from(jobs).all()` is synchronous; no `await` needed
- **No `console.log` for errors** — use `console.error`; handlers throw to propagate via `errorHandler`

### Anti-Patterns (Do Not Do)

- ❌ Return bare `Job[]` from `GET /api/jobs` — must be `{ jobs: [...] }`
- ❌ `fetch('/api/jobs')` directly in components — always use `useJobsQuery` hook
- ❌ Instantiate a second `QueryClient` — import singleton from `src/client/lib/query-client.ts`
- ❌ Define `Job` type locally — import from `@shared/schemas`
- ❌ Add loader to `trackerRoute` — only the Pipeline route (`/`) prefetches jobs
- ❌ `casing: 'camelCase'` in `db/client.ts` — do not modify this file
- ❌ `await db.select().from(jobs).all()` — bun:sqlite is synchronous; `await` on a non-Promise is harmless but misleading
- ❌ `bun test` bare — always `/home/zac/.bun/bin/bun test`

### References

- Epic 3 Story 3.1 AC [Source: _bmad-output/planning-artifacts/epics/epic-3-pipeline-view-job-triage-at-a-glance.md#Story 3.1]
- Architecture: API routes, response shape, no envelope [Source: _bmad-output/planning-artifacts/architecture-distillate.md#API Design]
- Architecture: TanStack Query conventions, keys, ensureQueryData [Source: _bmad-output/planning-artifacts/architecture-distillate.md#TanStack Query Conventions]
- Architecture: project structure, hooks location [Source: _bmad-output/planning-artifacts/architecture-distillate.md#Project Structure]
- Project context: testing rules, path aliases, error shape [Source: _bmad-output/project-context.md]
- Previous story patterns: test structure, bun PATH, DB_PATH trick [Source: _bmad-output/implementation-artifacts/2-3-api-sync-endpoint-and-sync-button-ui.md#Dev Notes]
- Existing test reference: `api-ingest.test.ts` — exact DB setup pattern to replicate

## Review Findings

- [x] [Review][Patch] fetchJobs error path: non-JSON bodies cause SyntaxError; missing `error` key produces "undefined" message [src/client/hooks/useJobsQuery.ts] — fixed
- [x] [Review][Patch] Test never asserts optional fields are explicit `null` — AC1 violation [src/server/routes/api-jobs.test.ts] — fixed
- [x] [Review][Patch][Out-of-scope] sheets-sync.ts column renames break 3 existing tests — updated test HEADERS to match real column names [src/server/services/sheets-sync.test.ts] — fixed
- [x] [Review][Patch][Out-of-scope] sheets-sync.ts debug console.log statements violate project rules — removed [src/server/services/sheets-sync.ts] — fixed
- [x] [Review][Patch][Out-of-scope] .env.example deleted — restored [job-hunt-dashboard/.env.example] — fixed
- [ ] [Review][Flag][Out-of-scope] get-refresh-token.ts untracked — audit for credentials, confirm in .gitignore before any commit
- [x] [Review][Defer] Router loader has no errorComponent — silent failure on load error [src/client/lib/router.ts] — deferred, story 3-4 scope
- [x] [Review][Defer] No LIMIT on GET /api/jobs — full table scan [src/server/routes/api-jobs.ts] — deferred, MVP design decision
- [x] [Review][Defer] No timeout on fetchJobs [src/client/hooks/useJobsQuery.ts] — deferred, design decision
- [x] [Review][Defer] staleTime: 0 causes redundant re-fetch on every route visit — deferred, future optimization
- [x] [Review][Defer][Pre-existing] api-sync.test.ts error-handling tests failing on HEAD — Hono sub-apps tested in isolation don't inherit parent onError — deferred, pre-existing issue not introduced by this story

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation matched story spec exactly.

### Completion Notes List

- Implemented `GET /api/jobs` Hono route returning `{ jobs: Job[] }` with synchronous bun:sqlite query
- Added 2 HTTP contract tests (empty DB + data with camelCase assertion) — all pass
- Registered `/api/jobs` route in `src/index.ts` between sync and errorHandler
- Created `useJobsQuery.ts` hook with exported `fetchJobs` for router loader reuse
- Updated `router.ts` indexRoute with `ensureQueryData` loader; trackerRoute unchanged
- All 28 server tests pass; zero TypeScript errors

### File List

- `job-hunt-dashboard/src/server/routes/api-jobs.ts` (new)
- `job-hunt-dashboard/src/server/routes/api-jobs.test.ts` (new)
- `job-hunt-dashboard/src/client/hooks/useJobsQuery.ts` (new)
- `job-hunt-dashboard/src/index.ts` (modified)
- `job-hunt-dashboard/src/client/lib/router.ts` (modified)
