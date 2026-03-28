# Story 1.2: Database Schema, Shared Types & Boot Migrations

Status: done

## Story

As a developer,
I want the SQLite schema defined, Zod shared types established, and migrations running on boot,
so that every subsequent story has a stable, typed data contract to build against.

## Acceptance Criteria

1. **Given** `src/db/schema.ts` is defined **When** a developer inspects it **Then** the `jobs` table contains all Sheets-owned columns (`company`, `job_title`, `fit_score`, `recommendation`, `role_fit`, `requirements_met`, `requirements_missed`, `red_flags`, `job_description`, `source_url`, `date_scraped`) and all user-owned columns (`applied`, `status`, `status_override`, `cover_letter_sent_at`, `date_applied`) plus `id` (integer autoincrement) **And** a unique index `company_job_title_idx` on `(company, job_title)` is defined **And** column names use `snake_case`; `drizzle.config.ts` already sets `casing: 'camelCase'` (completed in Story 1.1)

2. **Given** `src/shared/schemas.ts` is defined **When** a developer imports from it **Then** `jobSchema`, `ingestPayloadSchema`, `syncResultSchema` (Zod) and their inferred TypeScript types (`Job`, `IngestPayload`, `SyncResult`) are all exported and usable in both `src/server/` and `src/client/`

3. **Given** `src/db/migrate.ts` exists and is called from `src/index.ts` **When** `bun start` is run on a clean install **Then** terminal prints migration success and `data/jobs.db` is created at the path specified by `DB_PATH` **And** running `bun start` again on an existing DB completes without error (idempotent)

## Tasks / Subtasks

- [x] Task 1: Implement `src/db/schema.ts` — full Drizzle table definition (AC: 1)
  - [x] Replace stub with complete `jobs` table using `sqliteTable` from `drizzle-orm/sqlite-core`
  - [x] Define all 17 columns (id + 11 Sheets-owned + 5 user-owned) with explicit `snake_case` DB column names
  - [x] Add `uniqueIndex('company_job_title_idx')` on `(company, job_title)`
  - [x] Use `integer('applied', { mode: 'boolean' })` for boolean mapping; all nullable fields without `.notNull()`
  - [x] Annotate Sheets-owned vs user-owned with inline comments (core invariant reference for Story 2.1)
- [x] Task 2: Implement `src/db/client.ts` — Drizzle client singleton (AC: 3)
  - [x] Replace stub with `Database` from `bun:sqlite` (built-in — do NOT install better-sqlite3)
  - [x] Create `drizzle(sqlite, { schema })` singleton; export as `db`
  - [x] Read DB path from `process.env.DB_PATH ?? './data/jobs.db'`
- [x] Task 3: Implement `src/shared/schemas.ts` — Zod schemas + inferred types (AC: 2)
  - [x] Replace stub with full Zod schemas: `jobSchema`, `ingestPayloadSchema`, `syncResultSchema`
  - [x] Export inferred TypeScript types: `Job`, `IngestPayload`, `SyncResult`
  - [x] `recommendation` field: `z.enum(['apply', 'investigate', 'skip']).nullable()`
  - [x] `applied` field: `z.boolean()`; all date fields: `z.string().nullable()` (ISO 8601)
- [x] Task 4: Generate initial migration (AC: 1, 3)
  - [x] Run `bun run db:generate` — Drizzle Kit generates SQL in `src/db/migrations/`
  - [x] Verify generated SQL has all columns and `CREATE UNIQUE INDEX company_job_title_idx`
  - [x] Commit the generated migration file (it is source-controlled; `data/` is gitignored, migrations are not)
- [x] Task 5: Implement `src/db/migrate.ts` — boot migration runner (AC: 3)
  - [x] Replace stub with `migrate()` from `drizzle-orm/bun-sqlite/migrator`
  - [x] Export `runMigrations()` function (synchronous — bun:sqlite migrate is sync, no await)
  - [x] Use `import.meta.main` guard for standalone execution (Bun pattern — NOT Node's `require.main`)
  - [x] Log `[db] Migrations complete` on success
- [x] Task 6: Wire migrations into `src/index.ts` (AC: 3)
  - [x] Replace `// TODO Story 1.2: boot migrations here` with import + call to `runMigrations()`
  - [x] Keep `// TODO Story 1.3` and `// TODO Epic 2+` comments intact — other stories depend on them
- [x] Task 7: Verify all AC pass
  - [x] `tsc --noEmit` passes with no TypeScript errors
  - [x] `bun run db:generate` produces correct migration SQL
  - [x] `bun start` creates `data/jobs.db` and logs migration success
  - [x] Second `bun start` completes without error (idempotent)
  - [x] `import { Job } from '@shared/schemas'` compiles from both `src/server/` and `src/client/` paths

### Review Follow-ups (AI)

- [x] [Review][Defer] CWD-relative `migrationsFolder` breaks when process not started from project root [src/db/migrate.ts:5] — deferred, by spec design; use `import.meta.dir` in a future refactor
- [x] [Review][Defer] `runMigrations()` has no error handling — migration failure crashes process with raw stack trace [src/db/migrate.ts] — deferred, by spec design
- [x] [Review][Defer] `DB_PATH` env var not validated — arbitrary path accepted, Story 1.3 scope [src/db/client.ts:5] — deferred, pre-existing
- [x] [Review][Defer] `recommendation` column is unconstrained `text` in DB; only Zod enforces the enum [src/db/schema.ts:10] — deferred, architectural (SQLite has no native enum type)
- [x] [Review][Defer] `company`/`jobTitle` accept empty strings — `z.string()` allows `""` per spec [src/shared/schemas.ts:6-7] — deferred, by spec design; add `.min(1)` in future if ingest issues arise
- [x] [Review][Defer] `company`/`jobTitle` uniqueness key has no case normalization — SQLite text comparisons are case-sensitive [src/db/schema.ts] — deferred, architectural decision
- [x] [Review][Defer] `db` singleton never closed on process shutdown — WAL may not flush on unclean exit [src/db/client.ts] — deferred, architectural
- [x] [Review][Defer] Date fields stored as raw `text` with no format constraint — Zod uses `z.string().nullable()` per spec [src/db/schema.ts] — deferred, by spec design
- [x] [Review][Defer] `fitScore` has no DB-level CHECK constraint — only Zod enforces `[0, 100]` [src/db/schema.ts] — deferred, architectural (Drizzle/SQLite pattern)

## Senior Developer Review (AI)

**Review Date:** 2026-03-28
**Outcome:** Approve — 0 patch findings. Implementation matches spec exactly.
**Dismissed (5):** False positive duplicate SQL column (prompt artifact), false positive migration path (diff display artifact), intended TODO removal, cosmetic missing newline, no actionable DB_PATH security issue beyond Story 1.3 scope.
**Deferred (9):** See Review Follow-ups above — all are pre-existing architectural decisions or explicitly deferred to Story 1.3.

## Dev Notes

### CRITICAL: These Are Stub Files — REPLACE Contents, Don't Create New

Story 1.1 created **stub** files at these paths. Do NOT create new files — **replace the stub contents**:
- `src/shared/schemas.ts` — currently `export {}` stub
- `src/db/schema.ts` — stub
- `src/db/client.ts` — stub
- `src/db/migrate.ts` — stub

### Drizzle Schema — Exact Implementation

```ts
// src/db/schema.ts
import { integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Sheets-owned (overwritten on every sync — do NOT protect)
  company: text('company').notNull(),
  jobTitle: text('job_title').notNull(),
  fitScore: integer('fit_score'),
  recommendation: text('recommendation'),
  roleFit: text('role_fit'),
  requirementsMet: text('requirements_met'),
  requirementsMissed: text('requirements_missed'),
  redFlags: text('red_flags'),
  jobDescription: text('job_description'),
  sourceUrl: text('source_url'),
  dateScraped: text('date_scraped'),
  // User-owned (NEVER overwritten on sync — protected by ON CONFLICT clause in Story 2.1)
  applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
  status: text('status'),
  statusOverride: text('status_override'),
  coverLetterSentAt: text('cover_letter_sent_at'),
  dateApplied: text('date_applied'),
}, (table) => [
  uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle),
])
```

**Why explicit column names matter:** `drizzle.config.ts` already has `casing: 'camelCase'` for drizzle-kit SQL generation. Using explicit names like `text('job_title')` ensures `jobTitle` ↔ `job_title` mapping is unambiguous at both compile time and runtime. Do NOT omit the string column names in favor of inference alone.

**The `company_job_title_idx` unique index is required for Story 2.1** — without it, `ON CONFLICT DO UPDATE` upsert has no conflict target and will fail entirely. This is Gap 3 from the architecture doc.

**The inline ownership comments are the system's core invariant** — Story 2.1's upsert logic enforces the Sheets-owned vs user-owned boundary. Keep the comments.

### Drizzle Client — Exact Implementation

```ts
// src/db/client.ts
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

const sqlite = new Database(process.env.DB_PATH ?? './data/jobs.db')
export const db = drizzle(sqlite, { schema })
```

**`bun:sqlite` is built-in — zero install.** Do NOT install `better-sqlite3`, `sqlite3`, or any Node SQLite package. They are Node.js packages incompatible with Bun's native driver.

The `data/` directory exists on disk via `data/.gitkeep` from Story 1.1. `bun:sqlite`'s `Database` creates the `.db` file automatically if it doesn't exist.

### Zod Schemas — Exact Implementation

```ts
// src/shared/schemas.ts
import { z } from 'zod'

// Sheets-sourced input record (no id, no user-owned fields)
// Used for POST /api/ingest payload validation
export const jobInputSchema = z.object({
  company: z.string(),
  jobTitle: z.string(),
  fitScore: z.number().int().min(0).max(100).nullable(),
  recommendation: z.enum(['apply', 'investigate', 'skip']).nullable(),
  roleFit: z.string().nullable(),
  requirementsMet: z.string().nullable(),
  requirementsMissed: z.string().nullable(),
  redFlags: z.string().nullable(),
  jobDescription: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  dateScraped: z.string().nullable(),
})

// Full Job record — as returned by GET /api/jobs and used throughout client
export const jobSchema = jobInputSchema.extend({
  id: z.number().int(),
  applied: z.boolean(),
  status: z.string().nullable(),
  statusOverride: z.string().nullable(),
  coverLetterSentAt: z.string().nullable(),
  dateApplied: z.string().nullable(),
})

// POST /api/ingest body — array of Sheets-sourced records
export const ingestPayloadSchema = z.array(jobInputSchema)

// Success response for POST /api/ingest and POST /api/sync
export const syncResultSchema = z.object({
  added: z.number().int(),
  updated: z.number().int(),
})

export type Job = z.infer<typeof jobSchema>
export type JobInput = z.infer<typeof jobInputSchema>
export type IngestPayload = z.infer<typeof ingestPayloadSchema>
export type SyncResult = z.infer<typeof syncResultSchema>
```

**Import convention (locked):** Always `import { Job } from '@shared/schemas'` — never relative paths. The `@shared/*` → `src/shared/*` path alias was configured in `tsconfig.json` in Story 1.1. Both `src/server/` and `src/client/` must use this alias.

**Frozen API response conventions:**
- All date fields: ISO 8601 strings (`z.string()`) — never Date objects or Unix timestamps
- `applied`: `z.boolean()` — Drizzle's `{ mode: 'boolean' }` maps SQLite `0/1` ↔ `true/false` automatically
- Missing optional fields: explicit `null` — never `undefined` in any API response

### Migration Runner — Exact Implementation

```ts
// src/db/migrate.ts
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { db } from './client'

export function runMigrations(): void {
  migrate(db, { migrationsFolder: './src/db/migrations' })
  console.log('[db] Migrations complete')
}

// Run directly via: bun run src/db/migrate.ts (or `bun run db:migrate`)
if (import.meta.main) {
  runMigrations()
}
```

**`import.meta.main` is Bun's equivalent of Node's `require.main === module`** — Node's pattern will NOT work in a Bun ESM context.

**`migrate()` from `drizzle-orm/bun-sqlite/migrator` is synchronous** — no `await` needed or wanted. Drizzle tracks applied migrations in a `__drizzle_migrations` table, making every run idempotent.

### src/index.ts — Minimal Modification

Add the import and call in place of the Story 1.2 TODO. Do not touch anything else:

```ts
// BEFORE (from Story 1.1):
// TODO Story 1.2: boot migrations here

// AFTER:
import { runMigrations } from './db/migrate'
runMigrations()
```

The call must appear before any route registration or static serving. Existing structure from Story 1.1:

```ts
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { runMigrations } from './db/migrate'  // ← ADD

const app = new Hono()

runMigrations()                                // ← ADD (replaces TODO comment)
// TODO Story 1.3: env validation here
// TODO Epic 2+: mount API routes here

app.use('/*', serveStatic({ root: './dist' }))
app.get('/*', serveStatic({ path: './dist/index.html' }))

export default {
  port: Number(process.env.PORT ?? 3000),
  hostname: '127.0.0.1',
  fetch: app.fetch,
}
```

### Generating the Migration File

After implementing `src/db/schema.ts`, run:

```bash
bun run db:generate
```

Drizzle Kit generates a SQL file in `src/db/migrations/` (typically named `0000_<hash>.sql` or similar). **This file must be committed** — it is source-controlled unlike `data/jobs.db`. The `.gitkeep` in `src/db/migrations/` can be removed once the real migration file exists.

Expected SQL structure to verify (exact column order and constraint names):

```sql
CREATE TABLE `jobs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `company` text NOT NULL,
  `job_title` text NOT NULL,
  `fit_score` integer,
  `recommendation` text,
  `role_fit` text,
  `requirements_met` text,
  `requirements_missed` text,
  `red_flags` text,
  `job_description` text,
  `source_url` text,
  `date_scraped` text,
  `applied` integer DEFAULT false NOT NULL,
  `status` text,
  `status_override` text,
  `cover_letter_sent_at` text,
  `date_applied` text
);

CREATE UNIQUE INDEX `company_job_title_idx` ON `jobs` (`company`,`job_title`);
```

### What Is NOT in Scope

- API routes (`/api/jobs`, `/api/ingest`, `/api/sync`) — Epic 2+
- Env validation / fail-fast on missing vars — Story 1.3
- React/TanStack Router/Query changes — Story 1.3
- `status_events` table — post-MVP (architecture notes it as a future extension seam)
- Sheets column mapping — Story 2.2
- Any changes to `drizzle.config.ts` — already correct from Story 1.1
- shadcn component installation — Epic 3+

### Anti-Patterns to Avoid

- ❌ `import { Database } from 'better-sqlite3'` — use `import { Database } from 'bun:sqlite'`
- ❌ `require.main === module` — use `import.meta.main` in Bun
- ❌ `async function runMigrations()` with `await migrate(...)` — bun:sqlite migrate is synchronous
- ❌ Relative imports for `@shared/schemas` (e.g., `'../../shared/schemas'`) — always `'@shared/schemas'`
- ❌ Defining `Job` type inline anywhere — always import from `@shared/schemas`
- ❌ Adding any additional tables — only `jobs` in this story
- ❌ Omitting the unique index — the entire ingest upsert strategy depends on it

### Project Structure Notes

Files to modify (all are stubs from Story 1.1 — no new directories needed):

| File | Action |
|------|--------|
| `src/db/schema.ts` | Replace stub with full Drizzle schema |
| `src/db/client.ts` | Replace stub with Drizzle client singleton |
| `src/db/migrate.ts` | Replace stub with migration runner |
| `src/shared/schemas.ts` | Replace stub with full Zod schemas + types |
| `src/index.ts` | Replace TODO Story 1.2 comment with import + call |
| `src/db/migrations/0000_*.sql` | New file — generated by `bun run db:generate` |

No new directories needed — all created via `.gitkeep` in Story 1.1.

### References

- Architecture: Data Architecture — schema ownership split, upsert strategy, Drizzle + bun:sqlite [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- Architecture: Gap 3 — Compound Key Unique Constraint (`company_job_title_idx`) [Source: _bmad-output/planning-artifacts/architecture.md#Gap Analysis]
- Architecture: Gap 1 — Drizzle camelCase config (already done in Story 1.1) [Source: _bmad-output/planning-artifacts/architecture.md#Gap Analysis]
- Architecture: Naming Patterns — snake_case DB columns, camelCase API/JS [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns]
- Architecture: Enforcement Guidelines — import from `src/shared/schemas.ts`, frozen date/bool/null conventions [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines]
- Architecture: Complete Project Directory Structure [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure]
- Epics: Story 1.2 Acceptance Criteria [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]
- Story 1.1: Completion notes — stub files, drizzle.config.ts, bun:sqlite, path alias, Bun 1.3.11 [Source: _bmad-output/implementation-artifacts/1-1-project-scaffold-and-dev-prod-scripts.md]
- Story 1.1: Anti-patterns — bun:sqlite, no better-sqlite3 [Source: _bmad-output/implementation-artifacts/1-1-project-scaffold-and-dev-prod-scripts.md#Anti-Patterns to Avoid]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_None — clean implementation, no debugging required._

### Completion Notes List

- Replaced all 4 stub files with full implementations as specified in Dev Notes
- `src/db/schema.ts`: Full Drizzle `jobs` table with 17 columns, explicit snake_case column names, and `company_job_title_idx` unique index. Ownership comments preserved.
- `src/db/client.ts`: Drizzle singleton using `bun:sqlite` (built-in), reads DB path from `DB_PATH` env var with `./data/jobs.db` fallback.
- `src/shared/schemas.ts`: Full Zod schemas (`jobInputSchema`, `jobSchema`, `ingestPayloadSchema`, `syncResultSchema`) plus inferred TypeScript types (`Job`, `JobInput`, `IngestPayload`, `SyncResult`).
- `src/db/migrate.ts`: Synchronous migration runner using `drizzle-orm/bun-sqlite/migrator`, with `import.meta.main` guard for standalone execution.
- `src/index.ts`: Replaced TODO comment with `runMigrations()` call before route registration; `// TODO Story 1.3` and `// TODO Epic 2+` comments preserved.
- Migration generated: `src/db/migrations/0000_dashing_mister_fear.sql` — SQL matches spec (all 17 columns + unique index).
- All ACs verified: `tsc --noEmit` passes, `bun start` creates `data/jobs.db` and logs `[db] Migrations complete`, second run is idempotent.

### File List

- `src/db/schema.ts` (modified)
- `src/db/client.ts` (modified)
- `src/db/migrate.ts` (modified)
- `src/shared/schemas.ts` (modified)
- `src/index.ts` (modified)
- `src/db/migrations/0000_dashing_mister_fear.sql` (new)

### Change Log

- 2026-03-28: Implemented Story 1.2 — database schema, Drizzle client, Zod shared types, boot migration runner, and wired migrations into server entry point.
