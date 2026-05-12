# Story 32.1: Apply webhook_runs input_tokens Migration & Harden Startup Runner

Status: done

## Story

As an operator monitoring webhook-triggered discovery runs,
I want webhook runs recorded successfully in the database,
so that I can audit and track all runs triggered by the n8n webhook.

## Acceptance Criteria

1. **Given** the production DB is missing the `input_tokens` column in `webhook_runs`, **When** the migration/repair is applied, **Then** the column exists and INSERT statements for run recording succeed.

2. **Given** a webhook-triggered discovery run completes, **When** `recordRun()` executes, **Then** no `SQLiteError` is thrown and the run is persisted to `webhook_runs` with all expected fields (`durationMs`, `inputTokens`, `outputTokens`, `costUsd`, `matchedCount`, `archivedCount`, `sourceBreakdown`, `userId`).

3. **Given** the application starts, **When** the startup migration runner executes, **Then** all pending migrations — including `0016_webhook_run_metrics.sql` and subsequent webhook_runs migrations — are applied and logged as "Migrations complete".

4. **Given** the migration file is present in the deployed Docker image, **When** verified post-deploy, **Then** the startup log confirms all migrations ran.

5. **Given** the repair is applied to a DB that already has the column (e.g., a fresh install from schema), **When** the runner processes it, **Then** no error is thrown — the repair is idempotent.

## Tasks / Subtasks

- [x] Investigate root cause in production (AC: 3, 4)
  - [x] `docker exec <container> ls src/db/migrations/ | grep 0016` — if the file is missing, root cause is image not rebuilt after migration was added
  - [x] If 0016 is missing from the container: rebuild the Docker image and redeploy — Drizzle `migrate()` will apply it on next boot
  - [x] If 0016 is present but columns still missing: check `__drizzle_migrations` table in the DB for the entry — if absent, Drizzle migration tracking is broken and the runner has a bug
  - [x] Either way, proceed with the repair function below as belt-and-suspenders

- [x] Extend `repairSchema()` pattern in `src/db/migrate.ts` to cover `webhook_runs` (AC: 1, 2, 5)
  - [x] Add `WEBHOOK_RUNS_COLUMNS` constant array with all columns added via ALTER TABLE after initial table creation (from migrations 0016, 0017, 0018, 0025)
  - [x] Add `repairWebhookRunsSchema()` function — same pattern as existing `repairSchema()` but targeting `webhook_runs` table
  - [x] Call `repairWebhookRunsSchema()` in `runMigrations()` immediately after `repairSchema()`
  - [x] Verify idempotency: running on a DB that already has all columns logs nothing and throws no errors

- [x] Verify no regressions (AC: 2)
  - [x] Run `bun test src/server/routes/api-webhooks.test.ts` — all webhook run recording tests must pass
  - [x] Run `bun test src/server/routes/api-webhook-runs.test.ts` — history endpoint tests must pass
  - [x] Confirm `bun run dev` boots without errors after the change

## Dev Notes

### The Bug

`recordRun()` in `src/server/routes/api-webhook-runs.ts:24` does:
```ts
db.insert(webhookRuns).values({
  userId: params.userId,
  durationMs: params.durationMs ?? null,
  inputTokens: params.inputTokens ?? null,   // ← fails if column missing
  outputTokens: params.outputTokens ?? null,
  costUsd: params.costUsd ?? null,
  matchedCount: params.matchedCount ?? null,
  archivedCount: params.archivedCount ?? null,
  sourceBreakdown: ...,
}).run()
```

The `webhook_runs` table was originally created with only 6 columns (`id`, `name`, `run_at`, `success`, `item_count`, `error_message`) in `0009_clever_ezekiel.sql`. The metric columns were added by ALTER TABLE in later migrations:
- `0016_webhook_run_metrics.sql`: `duration_ms`, `input_tokens`, `output_tokens`, `cost_usd`
- `0017_analysis_run_counts.sql`: `matched_count`, `archived_count`
- `0018_discovery_source_breakdown.sql`: `source_breakdown`
- `0025_woozy_maelstrom.sql`: `user_id INTEGER DEFAULT 1 NOT NULL REFERENCES users(id)`

If the Docker image wasn't rebuilt after these migrations were committed, the files don't exist in the container and Drizzle's `migrate()` never applies them. The `recordRun()` try/catch silently swallows the error (`console.error` only), so runs appear to complete but are never persisted.

### The Fix: Extend repairSchema Pattern

The existing `repairSchema()` in `src/db/migrate.ts` already handles this exact problem for the `jobs` table (added in commit `1639253` for the same reason). Add an identical function for `webhook_runs`:

```ts
// Add after JOBS_NULLABLE_COLUMNS:
const WEBHOOK_RUNS_COLUMNS: Array<[string, string]> = [
  ['duration_ms', 'INTEGER'],
  ['input_tokens', 'INTEGER'],
  ['output_tokens', 'INTEGER'],
  ['cost_usd', 'REAL'],
  ['matched_count', 'INTEGER'],
  ['archived_count', 'INTEGER'],
  ['source_breakdown', 'TEXT'],
  ['user_id', 'INTEGER DEFAULT 1 NOT NULL REFERENCES users(id)'],
]

function repairWebhookRunsSchema(): void {
  const rows = sqlite.query('PRAGMA table_info(webhook_runs)').all() as Array<{ name: string }>
  const cols = new Set(rows.map((r) => r.name))
  for (const [col, type] of WEBHOOK_RUNS_COLUMNS) {
    if (!cols.has(col)) {
      sqlite.prepare(`ALTER TABLE webhook_runs ADD COLUMN ${col} ${type}`).run()
      console.log(`[db] Schema repair: added webhook_runs.${col}`)
    }
  }
}
```

Then in `runMigrations()`:
```ts
export function runMigrations(): void {
  migrate(db, { migrationsFolder: join(import.meta.dir, 'migrations') })
  repairSchema()
  repairWebhookRunsSchema()   // ← add this line
  console.log('[db] Migrations complete')
}
```

The `user_id` column entry has a full SQLite column definition including DEFAULT and REFERENCES — SQLite supports this in `ALTER TABLE ADD COLUMN` as long as a DEFAULT is provided (required for NOT NULL columns). The PRAGMA check ensures it only runs when the column is absent.

### Migration Runner Architecture

`src/db/migrate.ts` uses Drizzle's `migrate()` which reads `src/db/migrations/meta/_journal.json` and `__drizzle_migrations` table in the SQLite DB to determine which migrations to apply. The Drizzle migrator uses a hash of the migration SQL file content to track applied migrations.

**Why `repairSchema` is needed alongside Drizzle `migrate()`:** If a migration file was committed after the Docker image was last built, the file doesn't exist inside the container. Drizzle can't apply what it can't find. The repair functions are a runtime safety net that works regardless of what the Drizzle tracker has recorded.

### Idempotency Guarantee

Both repair functions check `PRAGMA table_info(table_name)` first. If the column already exists (fresh install, or migration applied correctly), `cols.has(col)` is true and the ALTER TABLE is skipped entirely. No error is thrown. Safe to run on every boot.

### No New Migration File Needed

Do NOT generate a new migration file for this fix. The schema-correct migration files already exist (`0016`–`0018`, `0025`). The repair function is a startup safeguard for production databases that missed those migrations. Adding a duplicate migration could break Drizzle's hash tracking.

### Testing Approach

The existing test files create `webhook_runs` tables with all columns already included (from a `CREATE TABLE` with full schema), so they don't exercise the repair path. Manual verification is the right approach:

```bash
# Create a minimal DB missing the metric columns:
bun -e "
import { Database } from 'bun:sqlite'
const db = new Database('/tmp/test-repair.db')
db.run('CREATE TABLE webhook_runs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, run_at TEXT NOT NULL, success INTEGER NOT NULL, item_count INTEGER, error_message TEXT)')
db.close()
"

# Run the migration runner against it:
DB_PATH=/tmp/test-repair.db bun run src/db/migrate.ts

# Verify columns were added:
bun -e "
import { Database } from 'bun:sqlite'
const db = new Database('/tmp/test-repair.db')
const cols = db.query('PRAGMA table_info(webhook_runs)').all()
console.log(cols.map(c => c.name))
db.close()
"
```

Expected output: array including `input_tokens`, `output_tokens`, `duration_ms`, `cost_usd`, `matched_count`, `archived_count`, `source_breakdown`, `user_id`.

### Files to Modify

Only one file: `src/db/migrate.ts` (within `job-hunt-dashboard/`)

### Project Structure Notes

- `src/db/migrate.ts` — only file to touch; follows existing `repairSchema()` pattern exactly
- No route, service, schema, or test file changes needed
- `src/db/schema.ts` already has all columns defined correctly (Drizzle schema is source of truth for code; the DB just needs to catch up)

### References

- `job-hunt-dashboard/src/db/migrate.ts` — file to modify; `repairSchema()` at lines 21–30 is the pattern to replicate for `webhook_runs`
- `job-hunt-dashboard/src/db/migrations/0016_webhook_run_metrics.sql` — source of `duration_ms`, `input_tokens`, `output_tokens`, `cost_usd`
- `job-hunt-dashboard/src/db/migrations/0017_analysis_run_counts.sql` — source of `matched_count`, `archived_count`
- `job-hunt-dashboard/src/db/migrations/0018_discovery_source_breakdown.sql` — source of `source_breakdown`
- `job-hunt-dashboard/src/db/migrations/0025_woozy_maelstrom.sql` — source of `user_id` column on `webhook_runs`
- `job-hunt-dashboard/src/server/routes/api-webhook-runs.ts` — `recordRun()` function (lines 9–42) is what fails with missing columns
- `job-hunt-dashboard/src/db/schema.ts` — `webhookRuns` table definition (lines ~in schema.ts); shows all expected columns
- `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts` — existing run recording tests; must all pass after fix
- Epic 32: `_bmad-output/planning-artifacts/epics/epic-32-webhook-run-recording-hotfix.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `WEBHOOK_RUNS_COLUMNS` array and `repairWebhookRunsSchema()` to `src/db/migrate.ts`, following the exact pattern of the existing `repairSchema()` for the `jobs` table.
- Called `repairWebhookRunsSchema()` in `runMigrations()` immediately after `repairSchema()`.
- Fixed pre-existing test failure in `api-webhooks.test.ts` where the `CREATE_WEBHOOK_RUNS_TABLE` DDL was missing the `user_id` column, causing 5 test failures.
- Verified idempotency: repair logic adds 0 columns on second run when all columns already present.
- All 17 webhook tests pass (was 5 failures before fix). The 2 remaining suite failures (`startScraperProcess` and `GET /:id/cover-letter`) are pre-existing and unrelated to this story.

### File List

- `job-hunt-dashboard/src/db/migrate.ts`
- `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts`

## Review Findings

- [x] [Review][Patch] Test DDL `user_id` missing `REFERENCES users(id)` — diverges from production schema [`job-hunt-dashboard/src/server/routes/api-webhooks.test.ts:37`]
- [x] [Review][Patch] `user_id` entry in `WEBHOOK_RUNS_COLUMNS` has unexplained magic `DEFAULT 1` value — add inline comment identifying `1` as bootstrap admin user [`job-hunt-dashboard/src/db/migrate.ts:29`]
- [x] [Review][Defer] FK enforcement edge case when adding `user_id` repair column if `users` table absent — deferred, pre-existing [`job-hunt-dashboard/src/db/migrate.ts:49`]
- [x] [Review][Defer] Concurrent startup race condition on `ALTER TABLE` — deferred, pre-existing [`job-hunt-dashboard/src/db/migrate.ts:44-52`]
- [x] [Review][Defer] No automated test covering repair path — deferred, pre-existing (acknowledged in story notes)
- [x] [Review][Defer] No automated idempotency test — deferred, pre-existing (copied from `repairSchema()` pattern)
- [x] [Review][Defer] No assertion on `user_id` value in tests — deferred, pre-existing test gap
- [x] [Review][Defer] `process.env` not cleaned in `afterEach` — deferred, pre-existing test hygiene
- [x] [Review][Defer] No `users` row in test DB — deferred, pre-existing FK latency hole

## Change Log

- 2026-05-08: Implemented `repairWebhookRunsSchema()` in `migrate.ts`; fixed `api-webhooks.test.ts` CREATE TABLE DDL missing `user_id`.
- 2026-05-08: Code review complete — 2 patches, 7 deferred, 4 dismissed.
