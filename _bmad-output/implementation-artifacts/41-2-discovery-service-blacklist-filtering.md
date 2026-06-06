---
baseline_commit: HEAD
---

# Story 41.2: Discovery Service — Blacklist Filtering

Status: done

## Story

As a user running a discovery job,
I want newly scraped results to be filtered against my company blacklist before they are inserted,
so that jobs from companies I've ruled out never appear in my pipeline.

## Acceptance Criteria

1. **Given** a user has "acme corp" in their company blacklist
   **When** a discovery run for that user completes and the scraper returned a job with `company: "Acme Corp"`
   **Then** that job is NOT inserted into the `jobs` table

2. **Given** a user has "acme corp" in their company blacklist
   **When** a discovery run for that user completes and the scraper returned a job with `company: "ACME CORP"` (different case)
   **Then** that job is NOT inserted (matching is case-insensitive)

3. **Given** a user has "acme corp" in their company blacklist
   **When** a discovery run for that user completes and the scraper returned a job with `company: "Acme Corporation"` (different string)
   **Then** that job IS inserted (matching is exact after normalization, not substring)

4. **Given** a discovery run is triggered without a `userId` (system/admin context)
   **When** the run completes
   **Then** no blacklist filtering is applied (blacklist is per-user only)

5. **Given** a user with an empty blacklist runs discovery
   **When** the run completes
   **Then** all deduped results are inserted as normal (no regression)

6. **Given** the discovery service's progress logging
   **When** companies are filtered by the blacklist
   **Then** the count logged for "new jobs" reflects post-blacklist-filter totals (not pre-filter)

## Tasks / Subtasks

- [x] Add `companyBlacklist` to schema import in `discovery-service.ts` (AC: 1, 2, 3)
  - [x] Append `companyBlacklist` to the existing `import { ..., profile } from '../../db/schema'` at line 3
  - [x] No other import changes needed — `eq` and `db` are already imported

- [x] Load blacklist after `existingIds` set, before `newJobs` filter (AC: 1, 2, 4, 5)
  - [x] Insert the `blacklistedNames` Set immediately after line 213 (`const existingIds = new Set(...)`)
  - [x] Use `userId !== undefined` guard — when undefined, use `new Set<string>()` (no filtering)
  - [x] Query: `db.select({ companyName: companyBlacklist.companyName }).from(companyBlacklist).where(eq(companyBlacklist.userId, userId)).all().map((r) => r.companyName)`
  - [x] Stored values are already lowercase (enforced by Story 41.1 insert logic)

- [x] Add blacklist filter condition to `newJobs` filter (AC: 1, 2, 3, 6)
  - [x] Add as a second early-return line inside the existing `.filter()` callback, after the existing guard and before `seen.add(r.id)`
  - [x] Condition: `if (blacklistedNames.size > 0 && blacklistedNames.has(r.company.toLowerCase())) return false`
  - [x] The `size > 0` short-circuit avoids the `.toLowerCase()` call on every job when blacklist is empty
  - [x] This placement means `newJobs.length` (used in the log at line 222 and in `onProgress` at line 228) already reflects post-blacklist count — AC 6 is satisfied automatically

- [x] Add `company_blacklist` table DDL to `discovery-service.test.ts` (AC: 1–5)
  - [x] Add `CREATE_COMPANY_BLACKLIST_TABLE` constant (raw SQL, no UNIQUE constraint needed for test purposes)
  - [x] Call `prodSqlite.run(CREATE_COMPANY_BLACKLIST_TABLE)` in `beforeAll` after existing table creations
  - [x] Add `prodSqlite.run('DELETE FROM company_blacklist')` to `beforeEach` alongside existing clears

- [x] Write 3 new test cases in `discovery-service.test.ts` (AC: 1–5)
  - [x] Blacklisted company (exact case match, case-insensitive): insert `"acme corp"` in blacklist, scraper returns `company: "Acme Corp"` → `inserted === 0`
  - [x] Case-insensitive: store `"acme corp"`, scraper returns `company: "ACME CORP"` → not inserted
  - [x] Non-substring (exact match only): store `"acme corp"`, scraper returns `company: "Acme Corporation"` → inserted (`inserted === 1`)
  - [x] (Optional but recommended) Empty blacklist regression: no blacklist rows, scraper returns 1 job → `inserted === 1`

## Dev Notes

### Files Being Modified

| File | Change |
|------|--------|
| `job-hunt-dashboard/src/server/services/discovery-service.ts` | UPDATE — add blacklist load + filter |
| `job-hunt-dashboard/src/server/services/discovery-service.test.ts` | UPDATE — add DDL, beforeEach clear, 3 new tests |

No new files. No migration. No schema change. Story 41.1 already created the `company_blacklist` table.

### Exact Code Change in `discovery-service.ts`

**Line 3 — add to existing schema import:**

```ts
import { jobs, searchConfigs, userSecrets, sourceSettings, profile, companyBlacklist } from '../../db/schema'
```

**After line 213 (`const existingIds = new Set(existing.map((r) => r.externalJobId!))`) — insert:**

```ts
const blacklistedNames = userId !== undefined
  ? new Set(
      db.select({ companyName: companyBlacklist.companyName })
        .from(companyBlacklist)
        .where(eq(companyBlacklist.userId, userId))
        .all()
        .map((r) => r.companyName)
    )
  : new Set<string>()
```

**Lines 216–220 — the existing `newJobs` filter becomes:**

```ts
const seen = new Set<string>()
const newJobs = allResults.filter((r) => {
  if (!r.id || !r.company || !r.title || existingIds.has(r.id) || seen.has(r.id)) return false
  if (blacklistedNames.size > 0 && blacklistedNames.has(r.company.toLowerCase())) return false
  seen.add(r.id)
  return true
})
```

The only change to the existing filter body is inserting the second `if` line. Everything else is unchanged.

### Key Invariants to Preserve

- `eq` is already imported from `drizzle-orm` (line 1) — do NOT re-import
- `and` is already imported — not needed here since the WHERE clause is single-column
- `db` is already imported from `../../db/client` — do NOT re-import
- The `blacklistedNames` values are already lowercase (stored lowercase by Story 41.1's `companyName.trim().toLowerCase()` in the POST handler) — only `r.company.toLowerCase()` is needed on the comparison side
- The `blacklistedNames.size > 0` guard means the `.toLowerCase()` call is skipped entirely when the blacklist is empty — no regression for users with no blacklist
- `newJobs.length` appears in the `console.log` at line 222 and in `onProgress` at line 228, both AFTER the filter — they naturally reflect post-blacklist count

### Test DDL to Add

```ts
const CREATE_COMPANY_BLACKLIST_TABLE = `
  CREATE TABLE IF NOT EXISTS company_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    company_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`
```

No UNIQUE constraint needed in the test table (no duplicate-detection logic tested here).

### New Test Cases

All new tests go inside the existing `describe('runDiscovery()', ...)` block. They follow the established pattern: set up a fake `globalThis.fetch`, insert a linkedin secret so the search proceeds, insert blacklist row(s) via raw SQL, call `runDiscovery(undefined, 1)`, assert on `inserted` and/or DB rows.

```ts
describe('blacklist filtering', () => {
  test('blacklisted company (case-sensitive match) is not inserted', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(`INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (1, 'acme corp', '2026-01-01T00:00:00.000Z')`)

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'bl-1', title: 'SWE', company: 'Acme Corp', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )

    const { inserted } = await runDiscovery(undefined, 1)
    expect(inserted).toBe(0)
    const rows = prodSqlite.prepare('SELECT * FROM jobs WHERE external_job_id = ?').all('bl-1')
    expect(rows).toHaveLength(0)
  })

  test('blacklisted company (ALL CAPS) is not inserted — case-insensitive', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(`INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (1, 'acme corp', '2026-01-01T00:00:00.000Z')`)

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'bl-2', title: 'SWE', company: 'ACME CORP', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )

    const { inserted } = await runDiscovery(undefined, 1)
    expect(inserted).toBe(0)
  })

  test('partial name match is NOT blocked — exact normalized match required', async () => {
    prodSqlite.run(
      `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
    )
    prodSqlite.run(`INSERT INTO company_blacklist (user_id, company_name, created_at) VALUES (1, 'acme corp', '2026-01-01T00:00:00.000Z')`)

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        JSON.stringify({ results: [{ id: 'bl-3', title: 'SWE', company: 'Acme Corporation', location: null, url: null }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ))
    )

    const { inserted } = await runDiscovery(undefined, 1)
    expect(inserted).toBe(1)
    const rows = prodSqlite.prepare('SELECT * FROM jobs WHERE external_job_id = ?').all('bl-3')
    expect(rows).toHaveLength(1)
  })
})
```

### Architecture Compliance

- `companyBlacklist` imported from `../../db/schema` — consistent with all other table imports in this file
- `.all().map(...)` synchronous Drizzle pattern — consistent with `existingIds` pattern on line 205–213
- `eq(companyBlacklist.userId, userId)` — user-scoped query consistent with rest of service
- No new services, no new files, no new abstractions — minimal, targeted change
- TypeScript strict mode: `userId` is typed as `number | undefined` — the ternary satisfies the type checker without any cast

### What This Story Does NOT Include

- No frontend changes (Story 41.3)
- No job drawer changes (Story 41.4)
- No API changes — the blacklist API was fully implemented in Story 41.1
- No changes to the log format string itself — AC 6 is satisfied by filter placement, not by editing the log line

### Testing Architecture Note

The existing `discovery-service.test.ts` already:
- Sets `process.env.DB_PATH = ':memory:'` and `process.env.ENCRYPTION_KEY` as first two lines
- Uses dynamic `await import(...)` after mock setup
- Has a `VALID_LINKEDIN_CIPHERTEXT` constant ready to use
- Has `prodSqlite` exposed for raw DDL and inserts

New tests should NOT re-define any of these — just add the DDL constant, the `beforeAll` call, the `beforeEach` clear, and the new `describe('blacklist filtering', ...)` block.

### References

- Epic 41 spec: `_bmad-output/planning-artifacts/epics/epic-41-company-blacklist.md`
- Story 41.1 (done): `_bmad-output/implementation-artifacts/41-1-db-schema-migration-and-blacklist-api.md`
- Discovery service: `job-hunt-dashboard/src/server/services/discovery-service.ts`
- Discovery service tests: `job-hunt-dashboard/src/server/services/discovery-service.test.ts`
- Schema (companyBlacklist table): `job-hunt-dashboard/src/db/schema.ts` lines 198–205
- Project context (all rules): `_bmad-output/project-context.md`

### Review Findings

- [x] [Review][Patch] Blacklist names not lowercased at load time — AC2 fails at runtime for any entry stored in mixed case [`job-hunt-dashboard/src/server/services/discovery-service.ts:221`]
- [x] [Review][Patch] Missing test for AC4 (userId undefined → no filtering applied) [`job-hunt-dashboard/src/server/services/discovery-service.test.ts`]
- [x] [Review][Patch] Missing test for AC5 (empty blacklist → no regression) [`job-hunt-dashboard/src/server/services/discovery-service.test.ts`]
- [x] [Review][Patch] Misleading test name "case-sensitive match" actually tests case-insensitive behavior [`job-hunt-dashboard/src/server/services/discovery-service.test.ts:~524`]
- [x] [Review][Defer] Schema lacks case-normalized unique index on company_blacklist — pre-existing Story 41.1 design gap, deferred
- [x] [Review][Defer] bySource counts vs insert count mismatch when userId is undefined — pre-existing discovery service behavior, deferred

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `companyBlacklist` to schema import in `discovery-service.ts`
- Inserted `blacklistedNames` Set query (scoped by `userId`) after `existingIds` build; when `userId` is undefined, the Set is empty so no filtering occurs
- Added second guard in `newJobs` filter: `if (blacklistedNames.size > 0 && blacklistedNames.has(r.company.toLowerCase())) return false` — satisfies case-insensitive exact-match requirement and short-circuits when blacklist is empty
- `newJobs.length` usage in log and `onProgress` naturally reflects post-blacklist count (AC 6)
- Added `CREATE_COMPANY_BLACKLIST_TABLE` DDL constant, `beforeAll` run, and `beforeEach` clear in test file
- Added `describe('blacklist filtering', ...)` with 3 tests: exact case-insensitive block, ALL CAPS block, and partial-name-NOT-blocked — all 3 pass
- 2 pre-existing test failures (`storageStatePath` and `temp file is deleted`) are unrelated to this story and existed before these changes

### File List

- `job-hunt-dashboard/src/server/services/discovery-service.ts`
- `job-hunt-dashboard/src/server/services/discovery-service.test.ts`
