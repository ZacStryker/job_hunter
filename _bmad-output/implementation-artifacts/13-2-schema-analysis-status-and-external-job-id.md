# Story 13.2: Schema — Analysis Status & External Job ID

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-2-schema-analysis-status-and-external-job-id  
**Status:** done  
**Depends on:** 13-1  
**Date:** 2026-04-14

---

## User Story

As a developer, I want the jobs table to track analysis pipeline state and store the scraper's job ID, so that Discovery can mark jobs for analysis and Analysis can fetch their full descriptions.

---

## Acceptance Criteria

### AC1 — analysisStatus column added
- `jobs` table gains a nullable `analysis_status` text column
- Valid values: `'pending' | 'analyzing' | 'done' | 'failed'`; `null` means pre-pipeline or manually ingested
- Drizzle schema in `src/db/schema.ts` reflects the new column with camelCase mapping (`analysisStatus`)

### AC2 — externalJobId column added
- `jobs` table gains a nullable `external_job_id` text column
- Stores the scraper service's `job_id` for use by Analysis when fetching descriptions
- Drizzle schema reflects the new column (`externalJobId`)

### AC3 — Migration generated and committed
- `bun run db:generate` produces a new SQL migration file (will be `0011_*.sql`)
- Migration file is committed to the repo
- Migration is idempotent (safe to re-run)

### AC4 — shared/schemas.ts updated
- `jobInputSchema` gains `analysisStatus` and `externalJobId` — both `z.string().nullable()` — so Discovery can send them in the ingest payload
- Both flow into `jobSchema` automatically (it extends `jobInputSchema`)

### AC5 — Ingest upsert simplified
- ON CONFLICT SET clause updated: **remove** `fitScore`, `recommendation`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription`, `salary`, `benefits`, `contactName`, `contactEmail`, `contactPhone` — these are now Analysis-owned and must not be clobbered on re-ingest
- **Keep** in ON CONFLICT SET: `sourceUrl`, `dateScraped`, `source`, `location` — these are scraper metadata, still refreshed on each scrape
- `analysisStatus` and `externalJobId` — set on INSERT but **not** in the SET clause (protected on conflict, same as user-owned fields)
- User-owned fields (`applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`, `archived`) unchanged — remain protected

### AC6 — Tests updated
- `CREATE_JOBS_TABLE` DDL in test adds `analysis_status TEXT, external_job_id TEXT` columns
- `baseJob` fixture adds `analysisStatus: null, externalJobId: null`
- `runIngest` helper SET clause mirrors the new production upsert
- Existing test "user-owned fields are NOT overwritten on re-ingest" **must be updated**: `fitScore` is no longer in the SET clause, so a re-ingest with `fitScore: 90` must now assert the original value `80` is preserved (not overwritten)
- New test: `analysisStatus` is NOT overwritten on re-ingest conflict
- New test: `externalJobId` is NOT overwritten on re-ingest conflict
- All tests pass with `bun test`

---

## Technical Requirements

### Files to modify (exact list)

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add 2 columns to `jobs` table |
| `src/shared/schemas.ts` | Add 2 fields to `jobInputSchema` |
| `src/server/services/ingest-service.ts` | Simplify ON CONFLICT SET clause |
| `src/server/routes/api-ingest.test.ts` | Update DDL, fixture, helper, assertions |
| `src/db/migrations/0011_*.sql` | Generated via `bun run db:generate` — commit it |

No new files. No UI changes. No API route changes.

---

## Implementation Notes

### 1. `src/db/schema.ts` — exact additions

Add these two columns to the `jobs` table, after `dateScraped` (keep them in the scraper-owned block since Discovery sets them):

```ts
// in the scraper-owned block, after dateScraped:
analysisStatus: text('analysis_status'),     // null | 'pending' | 'analyzing' | 'done' | 'failed'
externalJobId: text('external_job_id'),       // scraper's job_id — used by Analysis to fetch description
```

Full updated `jobs` table (for reference, showing column ordering):

```ts
export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Scraper-owned (overwritten on every ingest — do NOT protect)
  company: text('company').notNull(),
  jobTitle: text('job_title').notNull(),
  sourceUrl: text('source_url'),
  dateScraped: text('date_scraped'),
  source: text('source'),
  location: text('location'),
  externalJobId: text('external_job_id'),
  // Analysis-owned (set by Analysis service — never overwrite on ingest)
  analysisStatus: text('analysis_status'),   // null | 'pending' | 'analyzing' | 'done' | 'failed'
  fitScore: integer('fit_score'),
  recommendation: text('recommendation'),
  roleFit: text('role_fit'),
  requirementsMet: text('requirements_met'),
  requirementsMissed: text('requirements_missed'),
  redFlags: text('red_flags'),
  jobDescription: text('job_description'),
  salary: text('salary'),
  benefits: text('benefits'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  // User-owned (NEVER overwritten on ingest — protected by ON CONFLICT clause)
  applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
  status: text('status'),
  statusOverride: text('status_override'),
  coverLetterSentAt: text('cover_letter_sent_at'),
  dateApplied: text('date_applied'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle),
])
```

Note: The column reorganization (moving analysis fields into their own block) is intentional — it clarifies ownership for future developers. No functional impact since Drizzle maps by name, not position.

### 2. Generate the migration

From `job-hunt-dashboard/`:

```bash
bun run db:generate
```

This produces `src/db/migrations/0011_<random-name>.sql` with:

```sql
ALTER TABLE `jobs` ADD `analysis_status` text;
ALTER TABLE `jobs` ADD `external_job_id` text;
```

Commit the generated file. Do not hand-edit it.

### 3. `src/shared/schemas.ts` — add to `jobInputSchema`

Add two nullable fields at the end of `jobInputSchema`, before the closing `})`:

```ts
analysisStatus: z.string().nullable(),
externalJobId: z.string().nullable(),
```

`jobSchema` extends `jobInputSchema` automatically — no changes needed there.
`jobDetailSchema` uses `.pick()` — no changes needed.
`JobInput` and `Job` types are inferred, so they update automatically.

### 4. `src/server/services/ingest-service.ts` — new ON CONFLICT SET

The new `onConflictDoUpdate.set` block keeps only scraper metadata:

```ts
.onConflictDoUpdate({
  target: [jobs.company, jobs.jobTitle],
  set: {
    sourceUrl: sql`excluded.source_url`,
    dateScraped: sql`excluded.date_scraped`,
    source: sql`excluded.source`,
    location: sql`excluded.location`,
  },
})
```

**Removed from SET:** `fitScore`, `recommendation`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription`, `salary`, `benefits`, `contactName`, `contactEmail`, `contactPhone`

**Not in SET (protected on conflict):** `analysisStatus`, `externalJobId`, and all user-owned fields — they keep their existing values on re-ingest.

### 5. `src/server/routes/api-ingest.test.ts` — required changes

#### a) DDL — add 2 columns to `CREATE_JOBS_TABLE`:

```sql
analysis_status TEXT,
external_job_id TEXT,
```

(add before the UNIQUE constraint line)

#### b) `baseJob` fixture — add 2 nullable fields:

```ts
const baseJob: JobInput = {
  // ...existing fields...
  analysisStatus: null,
  externalJobId: null,
}
```

#### c) `runIngest` helper — update SET clause to match production:

```ts
.onConflictDoUpdate({
  target: [jobs.company, jobs.jobTitle],
  set: {
    sourceUrl: sql`excluded.source_url`,
    dateScraped: sql`excluded.date_scraped`,
    source: sql`excluded.source`,
    location: sql`excluded.location`,
  },
})
```

#### d) Fix broken assertion in existing test "user-owned fields are NOT overwritten on re-ingest"

Current test (line ~184):
```ts
expect(stored[0].fitScore).toBe(90)  // Sheets-owned: updated
```

**Must change to:**
```ts
expect(stored[0].fitScore).toBe(80)  // Analysis-owned: preserved (not overwritten on re-ingest)
```

Update the comment too: `// Analysis-owned: preserved` (not "Sheets-owned").

#### e) Add new tests for the two protected columns:

```ts
test('analysisStatus is NOT overwritten on re-ingest conflict', () => {
  runIngest(testDb, [baseJob])

  testDb
    .update(jobs)
    .set({ analysisStatus: 'done' })
    .where(sql`company = 'Acme Corp' AND job_title = 'Senior Engineer'`)
    .run()

  runIngest(testDb, [{ ...baseJob, analysisStatus: 'pending' }])

  const stored = testDb.select().from(jobs).all()
  expect(stored[0].analysisStatus).toBe('done') // preserved — not clobbered by re-ingest
})

test('externalJobId is NOT overwritten on re-ingest conflict', () => {
  runIngest(testDb, [{ ...baseJob, externalJobId: 'scraper-job-42' }])
  runIngest(testDb, [{ ...baseJob, externalJobId: 'scraper-job-99' }])

  const stored = testDb.select().from(jobs).all()
  expect(stored[0].externalJobId).toBe('scraper-job-42') // first value preserved
})
```

---

## Architecture Guardrails

**Data ownership tiers (post-13-2):**

| Tier | Fields | Ingest behavior |
|------|--------|----------------|
| Scraper-owned (refreshed) | `company`, `jobTitle`, `sourceUrl`, `dateScraped`, `source`, `location` | Updated on every re-ingest |
| Scraper/pipeline (insert-only) | `externalJobId`, `analysisStatus` | Set on INSERT, never overwritten on conflict |
| Analysis-owned | `fitScore`, `recommendation`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription`, `salary`, `benefits`, `contactName`, `contactEmail`, `contactPhone` | NOT touched by ingest at all |
| User-owned | `applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`, `archived` | Never overwritten by ingest |

**TypeScript strict mode** — `noUnusedLocals` is on. After removing fields from the SET clause, verify `ingest-service.ts` compiles cleanly (`bun run build` or TypeScript check).

**Schema comment hygiene** — The current `schema.ts` has two comment blocks labeled "Scraper-owned" and "User-owned". After adding the new columns, add a third block comment `// Analysis-owned` for clarity (shown in the schema example above).

**No migration runner changes** — the boot migration runner in `src/db/migrate.ts` auto-runs all pending migrations; no changes needed there.

**No `api-ingest.ts` changes** — the HTTP handler itself doesn't change; Zod validation picks up new fields from `jobInputSchema` automatically, and the service handles the rest.

**`externalJobId` is nullable in ingest** — manually ingested jobs (e.g., via curl to `/api/ingest`) won't have a scraper ID; that's fine.

---

## Previous Story Context (13-1)

Story 13-1 completed:
- Deleted all Google Sheets / OAuth integration files
- Removed Sheets sync route and UI
- Updated comments in `schema.ts` from "Sheets-owned" to "Scraper-owned"
- Updated `project-context.md` data ownership terminology

Current state of `ingest-service.ts` ON CONFLICT SET includes `salary`, `benefits`, `contactName`, `contactEmail`, `contactPhone` — these were added after the original Epic 2 stories. Story 13-2 removes them from the SET clause.

Review findings from 13-1 (all done, none deferred to this story).

---

## Dev Agent Record

### Completion Notes

All 6 Acceptance Criteria satisfied in a single session:

- **AC1:** `analysisStatus text('analysis_status')` added to `jobs` table in schema.ts (Analysis-owned block)
- **AC2:** `externalJobId text('external_job_id')` added to `jobs` table in schema.ts (Scraper/pipeline block)
- **AC3:** Migration `0011_wise_doctor_doom.sql` generated via `bun run db:generate` — adds both columns via `ALTER TABLE`
- **AC4:** `jobInputSchema` in `shared/schemas.ts` extended with `analysisStatus: z.string().nullable()` and `externalJobId: z.string().nullable()`
- **AC5:** `ingest-service.ts` ON CONFLICT SET simplified to scraper metadata only (`sourceUrl`, `dateScraped`, `source`, `location`); removed all analysis-owned fields (`fitScore`, `recommendation`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription`, `salary`, `benefits`, `contactName`, `contactEmail`, `contactPhone`)
- **AC6:** Test DDL updated in `api-ingest.test.ts` and all other test files sharing the production DB (`api-jobs.test.ts`, `api-stats.test.ts`, `api-cover-letter.test.ts`); `baseJob` fixture updated; `runIngest` helper SET clause updated; existing `fitScore` assertion fixed (80 preserved, not 90); two new protection tests added for `analysisStatus` and `externalJobId`

All 123 tests pass. Build clean.

---

## File Checklist

### Files modified:
- `job-hunt-dashboard/src/db/schema.ts`
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/server/services/ingest-service.ts`
- `job-hunt-dashboard/src/server/routes/api-ingest.test.ts`
- `job-hunt-dashboard/src/server/routes/api-jobs.test.ts` (DDL updated — new columns)
- `job-hunt-dashboard/src/server/routes/api-stats.test.ts` (DDL updated — new columns)
- `job-hunt-dashboard/src/server/routes/api-cover-letter.test.ts` (DDL updated — new columns)

### Files generated and committed:
- `job-hunt-dashboard/src/db/migrations/0011_wise_doctor_doom.sql`

---

## Change Log

- Created story with implementation context (Date: 2026-04-14)
- Implemented all ACs: schema columns, migration, Zod schema, ingest SET simplification, tests (Date: 2026-04-14)

---

## Review Findings

_Code review conducted 2026-04-14. 3 layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor. 16 dismissed as noise or pre-existing._

- [x] [Review][Decision] **analysisStatus typed as `z.string().nullable()` but AC1 defines a constrained enum** — Fixed: changed to `z.enum(['pending', 'analyzing', 'done', 'failed']).nullable()` in `shared/schemas.ts`.

- [x] [Review][Patch] **schema.ts comment "Scraper-owned (refreshed on every ingest)" covers `externalJobId` but `externalJobId` is insert-only, not refreshed** [`src/db/schema.ts:5`] — Fixed: added `// Scraper/pipeline (set on INSERT — never overwritten on conflict)` comment before `externalJobId`.

- [x] [Review][Patch] **Test DDL adds `analysis_status`/`external_job_id` after `contact_phone` instead of in their ownership blocks** [`api-ingest.test.ts:53`, `api-jobs.test.ts:30`, `api-stats.test.ts:31`, `api-cover-letter.test.ts:38`] — Fixed: moved both columns to after `location`, order matching schema.ts (`external_job_id` then `analysis_status`).

- [x] [Review][Defer] **`externalJobId: z.string().nullable()` accepts empty string** — Enhancement to add `.min(1)` when non-null. Out of scope for this story's spec; address when Discovery contract is firmed up. — deferred, pre-existing
- [x] [Review][Defer] **`fitScore`, `recommendation`, etc. still accepted in `jobInputSchema` but discarded on re-ingest conflict** — Pre-existing design; `jobInputSchema` predates the analysis ownership split. Scope removal in a future story. — deferred, pre-existing
- [x] [Review][Defer] **Unique conflict target is `(company, job_title)` — `externalJobId` not used for deduplication** — Pre-existing architecture decision; not in scope for this story. — deferred, pre-existing
- [x] [Review][Defer] **Existing rows get `NULL` for both new columns on migration** — Operational: Analysis service must handle `null` gracefully at first deploy to avoid processing all historical rows simultaneously. — deferred, pre-existing
