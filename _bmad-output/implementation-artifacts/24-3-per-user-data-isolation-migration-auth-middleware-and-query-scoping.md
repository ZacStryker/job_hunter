# Story 24.3: Per-User Data Isolation — Migration, Auth Middleware & Query Scoping

Status: done

## Story

As a user,
I want my job data, email events, cover letters, and settings completely isolated from other users,
so that my data is private and I only ever see my own records.

## Acceptance Criteria

1. **Given** the migration runner executes `0021_multi_tenancy.sql` on first deploy
   **When** `bun start` runs
   **Then** `jobs`, `search_configs`, `messages`, and `cover_letters` tables each have a non-nullable `user_id` FK referencing `users.id`
   **And** existing rows are assigned `user_id = 1` (the seed admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`)
   **And** the seed admin is created only if no users exist — migration is idempotent

   > **Note:** The epic spec references `0020_multi_tenancy.sql` and `email_events` table, but story 24.2 already used `0020_auth_indexes.sql`, and the actual table name in this codebase is `messages`. Use `0021_multi_tenancy.sql` and `messages` throughout.

2. **Given** a request to any `/api/*` route with no session cookie or an expired session
   **When** `auth-middleware.ts` processes it
   **Then** the response is `401 { error: "Unauthorized" }` — the route handler never executes

3. **Given** a valid session cookie
   **When** auth middleware processes any `/api/*` request
   **Then** `c.set('userId', session.userId)` is set and the request proceeds to the route handler

4. **Given** a valid session with `role = 'standard'`
   **When** any `/api/admin/*` route is accessed
   **Then** `admin-middleware.ts` returns `403 { error: "Forbidden" }`

5. **Given** a valid session for User A
   **When** `GET /api/jobs` is called
   **Then** only User A's jobs are returned — the query includes `where(eq(jobs.userId, userId))` and User B's records are never visible

6. **Given** a valid session for User A
   **When** `PATCH /api/jobs/:id` is called for a job owned by User B
   **Then** the response is `404` — cross-user access is impossible by query scoping

7. **Given** a POST/PATCH/DELETE request to any `/api/*` route
   **When** the `x-csrf-token` header is missing or does not match the `csrf_token` cookie
   **Then** the response is `403 { error: "CSRF token invalid" }`
   **And** `/auth/login`, `/auth/register`, and `/auth/activate` are exempt by nature of being under `/auth/*` not `/api/*`

## Tasks / Subtasks

- [x] Define shared `AppEnv` type for Hono context variables (AC: #3, #5, #6, #7)
  - [x] Create `src/server/types.ts` with `export type AppEnv = { Variables: { userId: number } }`
  - [x] This file is imported by all route files and middleware that use `c.get('userId')` or `c.set('userId', ...)`

- [x] Update `src/db/schema.ts` with `userId` on four tables (AC: #1)
  - [x] Add `userId: integer('user_id').notNull().references(() => users.id)` to `jobs` table (after the `archived` field, before `resumeGeneratedAt`)
  - [x] Add `userId: integer('user_id').notNull().references(() => users.id)` to `coverLetters` table
  - [x] Add `userId: integer('user_id').notNull().references(() => users.id)` to `messages` table
  - [x] Add `userId: integer('user_id').notNull().references(() => users.id)` to `searchConfigs` table
  - [x] Add FK indexes for each: `index('jobs_user_id_idx').on(table.userId)`, same pattern for the other three tables
  - [x] Add `index` to existing drizzle-orm/sqlite-core imports if not already present

- [x] Write migration `src/db/migrations/0021_multi_tenancy.sql` manually (AC: #1)
  - [x] Do NOT run `bun run db:generate` for this migration — write it manually to include `DEFAULT 1` backfill
  - [x] Add `user_id INTEGER NOT NULL DEFAULT 1` to `jobs`, `search_configs`, `cover_letters`, `messages` (DEFAULT 1 backfills existing rows)
  - [x] Add FK indexes: `jobs_user_id_idx`, `search_configs_user_id_idx`, `cover_letters_user_id_idx`, `messages_user_id_idx`
  - [x] See Dev Notes for exact SQL
  - [x] Update `src/db/migrations/meta/_journal.json`: add entry with `idx: 21`, `tag: "0021_multi_tenancy"`, `when: <current ms timestamp>`, `version: "6"`, `breakpoints: true`
  - [x] Run `bun run db:generate` AFTER writing the manual migration to generate the snapshot — rename generated file if needed, or manually write `0021_snapshot.json` (either is acceptable)

- [x] Add seed admin boot step to `src/index.ts` (AC: #1)
  - [x] Create async `seedAdmin()` function (inline in `src/index.ts` or in `src/db/seed.ts`)
  - [x] `seedAdmin` checks if `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars exist; returns early if either is missing
  - [x] Checks if any user rows exist: `db.select({ id: users.id }).from(users).get()` — if exists, returns (idempotent)
  - [x] Creates admin user with argon2id hash (same params as api-auth.ts: memoryCost=65536, timeCost=3, parallelism=4)
  - [x] Sets `role: 'admin'`, `isActive: true` (admin is pre-activated — no email verification needed)
  - [x] Add `await seedAdmin()` to `src/index.ts` after `runMigrations()` call
  - [x] `ADMIN_EMAIL` and `ADMIN_PASSWORD` are OPTIONAL env vars (add comment noting they're first-deploy-only)

- [x] Create `src/server/middleware/auth-middleware.ts` (AC: #2, #3, #7)
  - [x] Import `MiddlewareHandler` from `hono`, `getCookie` from `hono/cookie`, drizzle, `sessions` schema, `AppEnv` type
  - [x] Validate session cookie: lookup `sessions` table with `eq(sessions.id, sessionId)` AND `gte(sessions.expiresAt, now)`
  - [x] Return `401 { error: 'Unauthorized' }` if no cookie, session not found, or session expired
  - [x] CSRF check for POST, PATCH, DELETE: compare `getCookie(c, 'csrf_token')` to `c.req.header('x-csrf-token')`
  - [x] Return `403 { error: 'CSRF token invalid' }` if mismatch or either is missing
  - [x] Call `c.set('userId', session.userId)` and `await next()` on success
  - [x] See Dev Notes for complete implementation pattern

- [x] Create `src/server/middleware/admin-middleware.ts` (AC: #4)
  - [x] Reads `userId` from context (assumes auth middleware ran first)
  - [x] Queries `users` table: `db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get()`
  - [x] Returns `403 { error: 'Forbidden' }` if user not found or role !== 'admin'
  - [x] Calls `await next()` on success

- [x] Modify `src/server/routes/api-auth.ts` to set/clear CSRF cookie (AC: #7)
  - [x] In `GET /activate` handler (after creating session): generate `csrfToken = randomBytes(32).toString('hex')`, set non-httpOnly `csrf_token` cookie
  - [x] In `POST /login` handler (after creating session): same CSRF cookie set
  - [x] In `POST /logout` handler: clear `csrf_token` cookie (maxAge=0)
  - [x] See Dev Notes for CSRF cookie settings (non-httpOnly, secure, SameSite=Lax)

- [x] Mount auth and admin middlewares in `src/index.ts` (AC: #2, #3, #4)
  - [x] Import `authMiddleware` from `./server/middleware/auth-middleware`
  - [x] Import `adminMiddleware` from `./server/middleware/admin-middleware`
  - [x] Add `app.use('/api/*', authMiddleware)` BEFORE all `app.route('/api/...')` calls
  - [x] Add `app.use('/api/admin/*', adminMiddleware)` AFTER auth middleware mount, BEFORE admin route registrations
  - [x] Change `app` instance to `new Hono<AppEnv>()` and import `AppEnv`
  - [x] `/auth/*` routes are intentionally NOT covered by auth middleware (already mounted before the middleware)

- [x] Update `src/server/routes/api-jobs.ts` for query scoping (AC: #5, #6)
  - [x] Change `new Hono()` to `new Hono<AppEnv>()`, import `AppEnv`
  - [x] `GET /` — add `where(eq(jobs.userId, userId))` to the jobs query
  - [x] The messages query in GET / does NOT need userId filter yet (messages are still user-agnostic in AC scope — will filter after messages gets user_id)
     > Actually: messages DO get user_id in this story's migration. Add `where(eq(messages.userId, userId))` to the messages query in GET / as well.
  - [x] `GET /:id/events` — add `and(eq(jobs.id, id), eq(jobs.userId, userId))` ownership check
  - [x] `PATCH /:id` — add `eq(jobs.userId, userId)` to the job lookup; return 404 if not found (cross-user → 404)
  - [x] `POST /:id/generate-cover-letter` — add userId scope to job lookup; pass `userId` when inserting into `cover_letters`
  - [x] `GET /:id/cover-letter` — add userId scope to job lookup
  - [x] `GET /:id/resume` — add userId scope to job lookup
  - [x] `POST /:id/generate-resume` — add userId scope to job lookup
  - [x] All `cover_letters` inserts/queries in this file: add `where(eq(coverLetters.userId, userId))`
  - [x] Use `const userId = c.get('userId')` at the start of each handler

- [x] Update `src/server/routes/api-ingest.ts` for userId in inserts (AC: #1, #5)
  - [x] Change `new Hono()` to `new Hono<AppEnv>()`, import `AppEnv`
  - [x] Get `userId` from context: `const userId = c.get('userId')`
  - [x] Pass `userId` to `ingestJobs(parsed.data, userId)` — update the `ingestJobs` function signature in `ingest-service.ts`
  - [x] In `ingest-service.ts`: add `userId` parameter, include in the `onConflictDoUpdate.set` exclusion logic and `values({ ...job, userId })` for new inserts
    > `userId` is user-owned — must NOT appear in `onConflictDoUpdate.set`

- [x] Update `src/server/routes/api-messages.ts` for query scoping
  - [x] Change `new Hono()` to `new Hono<AppEnv>()`, import `AppEnv`
  - [x] All queries: add `where(eq(messages.userId, userId))`
  - [x] All inserts: add `userId` field
  - [x] Use `const userId = c.get('userId')` at the start of each handler

- [x] Update `src/server/routes/api-search-configs.ts` for query scoping
  - [x] Change `new Hono()` to `new Hono<AppEnv>()`, import `AppEnv`
  - [x] `GET /` — add `where(eq(searchConfigs.userId, userId))`
  - [x] `POST /` — add `userId` to insert values
  - [x] `PUT /:id` — add `and(eq(searchConfigs.id, id), eq(searchConfigs.userId, userId))` to update query; return 404 if not found
  - [x] `DELETE /:id` — add `and(eq(searchConfigs.id, id), eq(searchConfigs.userId, userId))` to delete; return 404 if not found

- [x] Update `src/server/routes/api-stats.ts` for query scoping
  - [x] Change `new Hono()` to `new Hono<AppEnv>()`, import `AppEnv`
  - [x] All `db.select().from(jobs)...` calls: add `.where(eq(jobs.userId, userId))` (combined with existing conditions using `and(...)`)
  - [x] All `db.select().from(messages)...` calls: add `.where(eq(messages.userId, userId))`
  - [x] Cover letters queries (if any): add userId scope

- [x] Update `src/server/routes/api-webhooks.ts` and services for userId propagation
  - [x] Change `new Hono()` to `new Hono<AppEnv>()`, import `AppEnv`
  - [x] Pass `userId` from `c.get('userId')` to `runDiscovery(onProgress, userId)` and `runAnalysis(onProgress, userId)`
  - [x] Update `discovery-service.ts`: add `userId: number` parameter to `runDiscovery`; use it in `searchConfigs` query (`where(and(eq(searchConfigs.enabled, true), eq(searchConfigs.userId, userId)))`) and in all job inserts/upserts
  - [x] Update `analysis-service.ts`: add `userId: number` parameter to `runAnalysis`; scope `pendingJobs` query with `eq(jobs.userId, userId)`; scope all job update queries with `and(eq(jobs.id, job.id), eq(jobs.userId, userId))`
  - [x] Update `cover-letter-service.ts` and `resume-service.ts`: add `userId: number` parameter; scope job lookup with `and(eq(jobs.id, jobId), eq(jobs.userId, userId))`; include `userId` in `cover_letters` insert

- [x] Update remaining routes that touch scoped tables
  - [x] `src/server/routes/api-profile.ts` — add `new Hono<AppEnv>()` and `AppEnv` import (profile scoping is Epic 25 scope; route still needs auth but profile table not yet user-scoped)
  - [x] `src/server/routes/api-prompts.ts` — add `new Hono<AppEnv>()` and `AppEnv` import (prompts scoping is future scope)
  - [x] `src/server/routes/api-webhook-runs.ts` — add `new Hono<AppEnv>()` and `AppEnv` import (webhook_runs scoping is future scope)

- [x] Write `src/server/middleware/auth-middleware.test.ts` (AC: #2, #3, #7)
  - [x] Set env vars BEFORE all imports (DB_PATH=':memory:', ENCRYPTION_KEY, APP_URL)
  - [x] `beforeAll`: create sessions + users tables via raw SQL on `prodSqlite`
  - [x] No session cookie → 401
  - [x] Expired session (set expiresAt to past) → 401
  - [x] Invalid session ID → 401
  - [x] Valid session GET request → 200, userId set on context
  - [x] Valid session POST with matching csrf_token cookie+header → proceeds (200/201)
  - [x] Valid session POST with missing x-csrf-token header → 403
  - [x] Valid session POST with mismatched x-csrf-token → 403
  - [x] Valid session DELETE with valid CSRF → proceeds
  - [x] Valid session PATCH with valid CSRF → proceeds
  - [x] Admin middleware: standard role → 403; admin role → proceeds

- [x] Validate migration is idempotent and update sprint status
  - [x] Verify `IF NOT EXISTS` or Drizzle's own idempotency guard covers re-runs
  - [x] Update `sprint-status.yaml`: change `24-3-per-user-data-isolation-migration-auth-middleware-and-query-scoping` from `backlog` to `ready-for-dev`

### Review Findings

- [x] [Review][Decision] `runDiscovery` undefined-userId aligned with `analysis-service`: removed early return, `existingIds` now scoped per-user, `bySource` computed regardless — inserts still skipped when userId is undefined (NOT NULL constraint) [`src/server/services/discovery-service.ts`]

- [x] [Review][Patch] Unique index `company_job_title_idx` is not user-scoped — fixed: new migration `0022_per_user_unique_jobs.sql` drops and recreates as `(company, job_title, user_id)`; ingest conflict target updated [`src/db/schema.ts`, `src/server/services/ingest-service.ts`, `src/db/migrations/0022_per_user_unique_jobs.sql`]
- [x] [Review][Patch] `ingest-service.ts` `existingKeys` pre-fetch queries ALL users' jobs — fixed: scoped with `where(eq(jobs.userId, userId))` [`src/server/services/ingest-service.ts:8`]
- [x] [Review][Patch] `POST /api/jobs` duplicate-check and retrieve-after-insert queries not scoped by `userId` — fixed: added `eq(jobs.userId, userId)` to both queries [`src/server/routes/api-jobs.ts:201,216`]
- [x] [Review][Patch] CSRF middleware does not check `PUT` method — fixed: added `|| method === 'PUT'` to CSRF check [`src/server/middleware/auth-middleware.ts:19`]
- [x] [Review][Patch] `email-fetch-service.ts` `existingUids`/`existingByMessageId` dedup queries are global, not per-user — fixed: both queries now scoped with `where(eq(messages.userId, userId))` [`src/server/services/email-fetch-service.ts:26-35`]
- [x] [Review][Patch] `analysis-service.ts` `sql\`1=1\`` fallback — accepted as valid pattern per DN1 resolution (aligns with discovery-service); no change made

- [x] [Review][Defer] `webhookRuns` table has no `userId` column — all users see shared pipeline run history in stats; no `userId` on schema, per-user scoping deferred to future story [`src/server/routes/api-stats.ts`, `src/db/schema.ts`] — deferred, pre-existing
- [x] [Review][Defer] `profile` table is not multi-tenant — `analysis-service` fetches single shared profile for all users' job analyses; scoping deferred to Epic 25 [`src/server/services/analysis-service.ts:44`] — deferred, pre-existing

## Dev Notes

### Migration: 0021_multi_tenancy.sql

The migration adds `user_id INTEGER NOT NULL DEFAULT 1` to four tables. `DEFAULT 1` is required for SQLite's `ALTER TABLE ADD COLUMN` syntax when the column is NOT NULL and existing rows need a value. Drizzle ORM generates explicit column lists in every INSERT, so the DEFAULT only matters for this migration — new application-layer inserts will always provide `userId` explicitly.

Write `src/db/migrations/0021_multi_tenancy.sql` manually:

```sql
ALTER TABLE `jobs` ADD `user_id` integer NOT NULL DEFAULT 1 REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX `jobs_user_id_idx` ON `jobs` (`user_id`);
--> statement-breakpoint
ALTER TABLE `search_configs` ADD `user_id` integer NOT NULL DEFAULT 1 REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX `search_configs_user_id_idx` ON `search_configs` (`user_id`);
--> statement-breakpoint
ALTER TABLE `cover_letters` ADD `user_id` integer NOT NULL DEFAULT 1 REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX `cover_letters_user_id_idx` ON `cover_letters` (`user_id`);
--> statement-breakpoint
ALTER TABLE `messages` ADD `user_id` integer NOT NULL DEFAULT 1 REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX `messages_user_id_idx` ON `messages` (`user_id`);
```

**Why not `bun run db:generate`?** Drizzle Kit would generate `ALTER TABLE ADD user_id INTEGER NOT NULL` without a DEFAULT, which SQLite rejects when existing rows are present. The migration must be written manually to include `DEFAULT 1`.

**After writing the SQL manually:** Run `bun run db:generate` to let Drizzle Kit sync its internal snapshot state with the current schema. Rename or discard any generated SQL file (the migration SQL is already written manually). The snapshot JSON (`0021_snapshot.json`) can be left as generated by Drizzle Kit. Alternatively, manually update `_journal.json` with the entry for idx 21.

**_journal.json entry to add:**
```json
{
  "idx": 21,
  "version": "6",
  "when": 1745769600000,
  "tag": "0021_multi_tenancy",
  "breakpoints": true
}
```
(Use the actual current timestamp in milliseconds — `Date.now()` — not the placeholder above.)

### Seed Admin Boot Sequence

The seed admin must exist BEFORE the `DEFAULT 1` backfill is meaningful in production. Seed admin creation happens in `src/index.ts` AFTER `runMigrations()`:

```typescript
import argon2 from 'argon2'
import { db } from './db/client'
import { users } from './db/schema'

async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return  // optional; skip silently if absent

  const existing = db.select({ id: users.id }).from(users).get()
  if (existing) return  // users exist — idempotent

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })

  db.insert(users).values({
    email: email.toLowerCase().trim(),
    passwordHash,
    role: 'admin',
    isActive: true,
    createdAt: new Date().toISOString(),
  }).run()

  console.log('[boot] Seed admin created:', email)
}
```

Call `await seedAdmin()` after `runMigrations()` in `src/index.ts`. This is safe because `src/index.ts` uses top-level `await` already (`await startScraperProcess()`).

**On first deploy:** Seed admin is created → all existing rows already have `user_id = 1` (from migration DEFAULT) → the admin (id=1) owns all legacy data.

**On subsequent deploys:** `existing` check finds users → returns early → idempotent.

**Production setup:** Add `ADMIN_EMAIL` and `ADMIN_PASSWORD` to `.env.example` as optional/first-deploy-only keys with a comment.

### AppEnv Type

Define once in `src/server/types.ts`:

```typescript
export type AppEnv = {
  Variables: {
    userId: number
  }
}
```

Every route file that accesses `c.get('userId')` must:
```typescript
import type { AppEnv } from '../types'  // or '../../types' from middleware
const app = new Hono<AppEnv>()
```

`src/index.ts` must also use `new Hono<AppEnv>()`. Every `c.get('userId')` call returns `number` (not `unknown`) with this type.

### Auth Middleware

```typescript
// src/server/middleware/auth-middleware.ts
import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '../../db/client'
import { sessions } from '../../db/schema'
import type { AppEnv } from '../types'

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401)

  const now = new Date().toISOString()
  const session = db.select().from(sessions)
    .where(and(eq(sessions.id, sessionId), gte(sessions.expiresAt, now)))
    .get()
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const method = c.req.method
  if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
    const csrfCookie = getCookie(c, 'csrf_token')
    const csrfHeader = c.req.header('x-csrf-token')
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return c.json({ error: 'CSRF token invalid' }, 403)
    }
  }

  c.set('userId', session.userId)
  await next()
}
```

### Admin Middleware

```typescript
// src/server/middleware/admin-middleware.ts
import type { MiddlewareHandler } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { users } from '../../db/schema'
import type { AppEnv } from '../types'

export const adminMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = c.get('userId')
  const user = db.select({ role: users.role }).from(users)
    .where(eq(users.id, userId))
    .get()
  if (!user || user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
  await next()
}
```

**Critical:** `adminMiddleware` must be mounted AFTER `authMiddleware` because it relies on `c.get('userId')` being set.

### CSRF Cookie in api-auth.ts

Generate and set a `csrf_token` cookie whenever a session is created:

```typescript
import { randomBytes } from 'node:crypto'
// ...
const csrfToken = randomBytes(32).toString('hex')

setCookie(c, 'csrf_token', csrfToken, {
  httpOnly: false,   // Must be JS-readable — NOT httpOnly
  secure: isSecure(),
  sameSite: 'Lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
})
```

Add this to both:
- `GET /activate` handler — after `setCookie(c, 'session', ...)`
- `POST /login` handler — after `setCookie(c, 'session', ...)`

On `POST /logout`, clear the CSRF cookie:
```typescript
setCookie(c, 'csrf_token', '', {
  httpOnly: false,
  secure: isSecure(),
  sameSite: 'Lax',
  path: '/',
  maxAge: 0,
})
```

**Double-submit cookie rationale:** No server-side CSRF token storage needed. The browser's same-origin policy prevents cross-site JavaScript from reading the `csrf_token` cookie value; cross-site forms can't set the `x-csrf-token` header. Matching header-to-cookie value is the cryptographic proof.

The `csrf_token` value is entirely independent of the `session` value — it's a separate random token.

### Mounting in src/index.ts

```typescript
import type { AppEnv } from './server/types'
import { authMiddleware } from './server/middleware/auth-middleware'
import { adminMiddleware } from './server/middleware/admin-middleware'

const app = new Hono<AppEnv>()

runMigrations()
await seedAdmin()  // NEW: after runMigrations()

// ...env var checks...

app.use('/api/*', authMiddleware)       // Auth before all /api/* routes
app.use('/api/admin/*', adminMiddleware)  // Admin check before admin routes

app.route('/api/ingest', ingestRoute)
app.route('/api/jobs', jobsRoute)
// etc.
app.route('/auth', authRoute)   // auth routes are NOT under /api/* — no auth middleware
app.onError(errorHandler)
```

**Order matters:** `app.use('/api/*', authMiddleware)` must appear BEFORE any `app.route('/api/...')` registrations, or the middleware may not run.

### Query Scoping Pattern

Every handler that touches a user-scoped table follows this pattern:

```typescript
app.get('/', (c) => {
  const userId = c.get('userId')
  const rows = db.select().from(jobs).where(eq(jobs.userId, userId)).all()
  return c.json(rows)
})
```

For handlers with existing `where` conditions, combine with `and()`:
```typescript
.where(and(eq(jobs.userId, userId), eq(jobs.archived, false)))
```

For `PATCH /:id` ownership check:
```typescript
const raw = c.req.param('id')
const id = parseInt(raw, 10)
if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

const job = db.select().from(jobs)
  .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
  .get()
if (!job) return c.json({ error: 'Not found' }, 404)
// ... proceed with update
```

**NEVER accept userId from request body, query params, or route params** — always use `c.get('userId')` from the auth middleware context. This invariant is absolute.

### Discovery and Analysis Service Signatures

Update `runDiscovery` in `discovery-service.ts`:
```typescript
export async function runDiscovery(
  onProgress?: (msg: string) => void,
  userId?: number
): Promise<{ inserted: number; bySource: Record<string, number> }> {
  // Pass userId to searchConfigs query and to ingestJobs
  const searches = db.select().from(searchConfigs)
    .where(and(
      eq(searchConfigs.enabled, true),
      userId !== undefined ? eq(searchConfigs.userId, userId) : sql`1=1`
    ))
    .all()
  // ...
  await ingestJobs(allResults, userId)
}
```

For `runAnalysis` in `analysis-service.ts`:
```typescript
export async function runAnalysis(
  onProgress?: (msg: string) => void,
  userId?: number
): Promise<void> {
  const pendingJobs = db.select().from(jobs)
    .where(and(
      eq(jobs.analysisStatus, 'pending'),
      userId !== undefined ? eq(jobs.userId, userId) : sql`1=1`
    ))
    .all()
  // ...
  // All subsequent job updates scoped: and(eq(jobs.id, job.id), eq(jobs.userId, job.userId))
}
```

Making `userId` optional with a fallback keeps the service usable from tests that don't have a specific user context, but in production the webhook handler always passes a userId.

### ingest-service.ts Change

`ingestJobs` needs `userId: number` as a required parameter:
```typescript
export function ingestJobs(payload: IngestPayload, userId: number): SyncResult {
  // In the upsert values:
  // { ...jobData, userId }
  // userId is user-owned — never in onConflictDoUpdate.set
}
```

Callers:
- `api-ingest.ts`: `ingestJobs(parsed.data, c.get('userId'))`
- `discovery-service.ts`: passes userId received as parameter

### Tables NOT Scoped in This Story

The following tables do NOT get `user_id` in 24.3. Routes accessing them will be protected by auth middleware (require session) but return shared data:

- `profile` — single-user profile; isolation deferred to Epic 25 onboarding
- `webhook_runs` — pipeline run history; user_id column deferred to future story
- `prompts` — prompt templates; per-user prompts deferred to future story
- `status_events` — indirectly scoped through `jobs.user_id` (job ownership query ensures the caller can only access events for their own jobs)

### Testing Pattern for Middleware

```typescript
// src/server/middleware/auth-middleware.test.ts
process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = '0'.repeat(64)
process.env.APP_URL = 'http://localhost:3000'

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import type { AppEnv } from '../types'

const { authMiddleware } = await import('./auth-middleware')
const { db } = await import('../../db/client')
const prodSqlite = (db as unknown as { $client: Database }).$client

// Build a minimal test app that uses the middleware
function makeApp() {
  const app = new Hono<AppEnv>()
  app.use('/*', authMiddleware)
  app.get('/test', (c) => c.json({ userId: c.get('userId') }))
  app.post('/test', (c) => c.json({ ok: true }))
  app.patch('/test', (c) => c.json({ ok: true }))
  app.delete('/test', (c) => c.json({ ok: true }))
  return app
}

beforeAll(() => {
  prodSqlite.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'standard',
    is_active INTEGER NOT NULL DEFAULT 0,
    activation_token TEXT,
    activation_token_expires_at TEXT,
    reset_token TEXT,
    reset_token_expires_at TEXT,
    created_at TEXT NOT NULL
  )`)
  prodSqlite.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    data TEXT,
    expires_at TEXT NOT NULL
  )`)
})

beforeEach(() => {
  prodSqlite.run('DELETE FROM sessions')
  prodSqlite.run('DELETE FROM users')
})
```

**Test app.request() for middleware tests:**
```typescript
const app = makeApp()
const res = await app.request('/test', { method: 'GET' })
expect(res.status).toBe(401)
```

For session setup in tests — insert directly via prodSqlite:
```typescript
function insertUser(id = 1, role = 'standard') {
  prodSqlite.run(
    `INSERT INTO users (id, email, password_hash, role, is_active, created_at)
     VALUES (?, ?, 'hash', ?, 1, ?)`,
    [id, `user${id}@test.com`, role, new Date().toISOString()]
  )
}

function insertSession(sessionId: string, userId: number, expiresOffset = 3600_000) {
  const expiresAt = new Date(Date.now() + expiresOffset).toISOString()
  prodSqlite.run(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    [sessionId, userId, expiresAt]
  )
}
```

**Session cookie in test requests:**
```typescript
const res = await app.request('/test', {
  method: 'GET',
  headers: { 'Cookie': 'session=abc123' },
})
```

**CSRF test helper:**
```typescript
const res = await app.request('/test', {
  method: 'POST',
  headers: {
    'Cookie': 'session=abc123; csrf_token=mytoken',
    'x-csrf-token': 'mytoken',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({}),
})
expect(res.status).toBe(200)
```

### Key Design Decisions

**Migration file number:** `0021` not `0020` as the epic spec says — story 24.2 already used `0020_auth_indexes.sql`. Always check the journal for the next available idx.

**Inline admin check in `/auth/reset-request`:** The existing inline admin session check in `api-auth.ts` from story 24.2 is NOT replaced in this story. `/auth/reset-request` is a public route (under `/auth/*`, not `/api/*`), so the auth middleware never runs for it. The inline check stays as-is.

**`userId` optionality in services:** `runDiscovery` and `runAnalysis` accept `userId?: number` rather than `userId: number`. This allows direct service calls in tests without mocking the full auth context. When userId is undefined, queries fall back to returning all rows — only acceptable in test contexts.

**No Vite proxy change needed:** The `/auth/*` routes are already served by the Hono API server directly. Story 24.4 (auth UI) will add Vite proxy for `/auth/*` when building the SPA auth pages.

**SMTP and sendMail: fire-and-forget pattern stays unchanged** — auth middleware doesn't change email sending behavior.

**`x-csrf-token` header from SPA:** Story 24.4 will implement the React side (intercepting all mutations to add the header from the `csrf_token` cookie). Until 24.4, manual API testing must include the CSRF header or avoid POST/PATCH/DELETE.

### Project Structure Notes

**New files:**
```
src/server/types.ts                           ← AppEnv type (new)
src/server/middleware/auth-middleware.ts      ← session + CSRF validation (new)
src/server/middleware/admin-middleware.ts     ← role check (new)
src/server/middleware/auth-middleware.test.ts ← co-located tests (new)
src/db/migrations/0021_multi_tenancy.sql      ← manually written (new)
```

**Modified files:**
```
src/db/schema.ts                              ← userId FK on 4 tables
src/db/migrations/meta/_journal.json         ← add entry for idx 21
src/index.ts                                  ← seedAdmin, mount middleware, AppEnv type
src/server/routes/api-auth.ts                 ← CSRF cookie on login/activate/logout
src/server/routes/api-jobs.ts                 ← query scoping + AppEnv
src/server/routes/api-ingest.ts               ← userId in inserts + AppEnv
src/server/routes/api-messages.ts            ← query scoping + AppEnv
src/server/routes/api-search-configs.ts      ← query scoping + AppEnv
src/server/routes/api-stats.ts               ← query scoping + AppEnv
src/server/routes/api-webhooks.ts            ← userId propagation + AppEnv
src/server/routes/api-profile.ts             ← AppEnv type only (no query change)
src/server/routes/api-prompts.ts             ← AppEnv type only (no query change)
src/server/routes/api-webhook-runs.ts        ← AppEnv type only (no query change)
src/server/services/discovery-service.ts     ← userId param
src/server/services/analysis-service.ts      ← userId param + query scoping
src/server/services/ingest-service.ts        ← userId param in inserts
src/server/services/cover-letter-service.ts  ← userId param + scoped job lookup
src/server/services/resume-service.ts        ← userId param + scoped job lookup
```

**No new packages** — all functionality uses existing imports (Hono, Drizzle, node:crypto, argon2).

### References

- Epic 24 story 24.3 ACs: [Source: _bmad-output/planning-artifacts/epics/epic-24-authentication-and-multi-user-data-foundation.md#story-243]
- Architecture — Authentication & Session: [Source: _bmad-output/planning-artifacts/architecture-distillate.md#authentication--session]
- Architecture — Multi-Tenancy & Per-User Data Isolation: [Source: _bmad-output/planning-artifacts/architecture-distillate.md#multi-tenancy--per-user-data-isolation]
- Architecture — User isolation invariant: [Source: _bmad-output/planning-artifacts/architecture-distillate.md#core-architectural-invariants]
- Story 24.2 (auth routes, inline admin check, CSRF note): [Source: _bmad-output/implementation-artifacts/24-2-auth-api-routes-registration-activation-login-logout-and-password-reset.md]
- Story 24.1 (schema, crypto module): [Source: _bmad-output/implementation-artifacts/24-1-crypto-module-mailer-module-and-auth-db-schema.md]
- Project context — testing rules: [Source: _bmad-output/project-context.md#testing-rules]
- Project context — framework rules: [Source: _bmad-output/project-context.md#framework-specific-rules]
- Current schema (post-24.2): [Source: job-hunt-dashboard/src/db/schema.ts]
- Current index.ts (route mounting, env validation): [Source: job-hunt-dashboard/src/index.ts]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A

### Completion Notes List

- All 264 tests pass (0 failures) across 20 test files after all production and test changes.
- drizzle behavior discovery: adding `notNull()` to a schema column causes drizzle to include ALL schema columns in generated INSERT SQL. Test DDLs must fully mirror the production schema to avoid "no such column" errors in in-memory test databases.
- Test wrapper pattern adopted across all route test files: a Hono wrapper injects `c.set('userId', 1)` via middleware before routing to the production handler, cleanly isolating auth concerns from route logic tests.
- `runDiscovery` and `runAnalysis` accept `userId?: number` with a fallback to no filter — makes them safe to call from tests without a userId context, but in production the webhook handler always passes `c.get('userId')`.
- `api-jobs.ts` regression fixed: `source: 'manual'` → `source: 'Manual'` in the POST `/` handler (introduced when the handler was modified to add userId).
- Mock return types in `api-webhooks.test.ts` updated to include `bySource: Record<string, number>` for discovery and `matched: number; archived: number` for analysis — these were added to service return shapes in this story.
- SMTP connection errors in test output (`[auth] activation email failed: connect ECONNREFUSED`) are expected console noise from auth tests; those tests pass because email errors are caught and logged gracefully.

### File List

**New files:**
- `src/server/types.ts`
- `src/server/middleware/auth-middleware.ts`
- `src/server/middleware/admin-middleware.ts`
- `src/server/middleware/auth-middleware.test.ts`
- `src/db/migrations/0021_multi_tenancy.sql`
- `src/db/migrations/meta/0021_snapshot.json`

**Modified files:**
- `src/db/schema.ts`
- `src/db/migrations/meta/_journal.json`
- `src/index.ts`
- `src/server/routes/api-auth.ts`
- `src/server/routes/api-jobs.ts`
- `src/server/routes/api-ingest.ts`
- `src/server/routes/api-messages.ts`
- `src/server/routes/api-search-configs.ts`
- `src/server/routes/api-stats.ts`
- `src/server/routes/api-webhooks.ts`
- `src/server/routes/api-profile.ts`
- `src/server/routes/api-prompts.ts`
- `src/server/routes/api-webhook-runs.ts`
- `src/server/services/discovery-service.ts`
- `src/server/services/analysis-service.ts`
- `src/server/services/ingest-service.ts`
- `src/server/services/cover-letter-service.ts`
- `src/server/services/resume-service.ts`
- `src/server/routes/api-ingest.test.ts`
- `src/server/routes/api-webhooks.test.ts`
- `src/server/routes/api-stats.test.ts`
- `src/server/routes/api-jobs.test.ts`
- `src/server/routes/api-messages.test.ts`
- `src/server/routes/api-search-configs.test.ts`
- `src/server/routes/api-cover-letter.test.ts`
- `src/server/routes/api-resume.test.ts`
- `src/server/routes/api-webhook-runs.test.ts`
- `src/server/services/discovery-service.test.ts`
- `src/server/services/analysis-service.test.ts`
