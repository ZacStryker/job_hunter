# Story 29.1: LinkedIn Discovery — Graceful Skip (Stopgap)

Status: done

## Story

As a user running Discovery,
I want LinkedIn searches to be skipped with a clear error when I have no LinkedIn session stored,
so that Discovery completes for other sources instead of throwing a 500.

## Acceptance Criteria

1. **Given** a Discovery run is triggered and the user has LinkedIn search configs, **When** `discovery-service.ts` checks `user_secrets` for `linkedin_storage_state`, **Then** if the secret is absent: all LinkedIn searches are skipped, **And** a `{ source: 'linkedin', error: 'LinkedIn not connected — add your session in Config > Connections' }` entry is included in the run result, **And** Discovery continues and completes for all other sources (no 500).

2. **Given** the discovery run result contains a skipped-LinkedIn entry, **When** the UI displays pipeline run feedback, **Then** the LinkedIn skip error is surfaced via the existing progress/error display channel.

3. **Given** `discovery-service.ts` would have called the scraper for a LinkedIn search, **When** `linkedin_storage_state` is absent from `user_secrets`, **Then** the scraper is NOT called for that search; no Playwright interaction occurs.

## Tasks / Subtasks

- [x] Extend `runDiscovery` return type to include `errors` field (AC: 1)
  - [x] Add `errors: Array<{ source: string; error: string }>` to the function return type interface
- [x] Add `user_secrets` lookup for `linkedin_storage_state` before `Promise.all` (AC: 1, 3)
  - [x] Import `userSecrets` table from `../../db/schema`
  - [x] Query for `linkedin_storage_state` key scoped to `userId`
  - [x] If absent and LinkedIn searches exist: populate errors array, call `onProgress` with skip message, filter LinkedIn from searches
- [x] Update `discovery-service.test.ts` to add `user_secrets` table DDL (AC: 1, 2, 3)
  - [x] Add `CREATE TABLE user_secrets` to `beforeAll`
  - [x] Fix existing "happy path" test — LinkedIn will be skipped unless `linkedin_storage_state` row exists
  - [x] Add test: LinkedIn searches skipped when no `linkedin_storage_state` row, other searches proceed
  - [x] Add test: LinkedIn searches proceed when `linkedin_storage_state` row exists (fake ciphertext — 29.1 only checks presence)
  - [x] Add test: `errors` array contains skip entry when LinkedIn skipped

### Review Findings

- [x] [Review][Patch] Timestamp typo in deduplication test `updated_at` value — false positive; actual file already has correct `'2026-01-01T00:00:00.000Z'` (no fix needed)
- [x] [Review][Patch] AC 1 exact error string not asserted — changed `.toContain('LinkedIn not connected')` to `.toBe('LinkedIn not connected — add your session in Config > Connections')` [`discovery-service.test.ts:223`]
- [x] [Review][Patch] In-test `search_configs` cleanup risks state leak — wrapped test body in try/finally so `DELETE FROM search_configs WHERE source = 'indeed'` always runs [`discovery-service.test.ts`]

- [x] [Review][Defer] `errors` field not consumed by api-webhooks.ts caller [`api-webhooks.ts:24`] — deferred, by design for stopgap; 29.4 will wire errors into UI
- [x] [Review][Defer] api-webhooks.test.ts mock return type missing `errors` field — deferred, outside 2-file story scope; type drift only, not a runtime issue
- [x] [Review][Defer] `inserted: 0` when `userId` is undefined — deferred, pre-existing behavior not introduced by this change
- [x] [Review][Defer] AC 3 (scraper not called when LinkedIn skipped) not explicitly asserted via fetch call count — deferred, implicitly verified by `inserted: 0` and no network errors
- [x] [Review][Defer] Positive AC 3 (scraper IS called when auth present) not verified via fetch call count — deferred, implicitly covered by `errors.toHaveLength(0)` and insert assertions
- [x] [Review][Defer] Stale test name `'happy path: inserts new jobs from all 6 searches'` (only 1 config exists) — deferred, pre-existing before this story

## Dev Notes

### Single-File Scope

**Only two files change in this story:**
- `job-hunt-dashboard/src/server/services/discovery-service.ts` (logic)
- `job-hunt-dashboard/src/server/services/discovery-service.test.ts` (tests)

No scraper changes, no `api-webhooks.ts` changes, no schema migrations, no frontend changes.

### Implementation Pattern

**Imports to add** in `discovery-service.ts`:
```ts
import { userSecrets } from '../../db/schema'
```
`and`, `eq` are already imported. `db` is already imported. No new packages needed.

**Where to insert the check** — between the `searches` query and the `Promise.all` call (current line 30):

```ts
// After fetching `searches`:
const errors: Array<{ source: string; error: string }> = []

if (userId !== undefined) {
  const hasLinkedinAuth = db
    .select({ keyName: userSecrets.keyName })
    .from(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'linkedin_storage_state')))
    .get()

  if (!hasLinkedinAuth) {
    const linkedinSearches = searches.filter((s) => s.source === 'linkedin')
    if (linkedinSearches.length > 0) {
      const errMsg = 'LinkedIn not connected — add your session in Config > Connections'
      errors.push({ source: 'linkedin', error: errMsg })
      onProgress?.(`LinkedIn skipped: ${errMsg}`)
    }
  }
}

const activeSearches = errors.some((e) => e.source === 'linkedin')
  ? searches.filter((s) => s.source !== 'linkedin')
  : searches
```

Then pass `activeSearches` to `Promise.all` instead of `searches`.

**Return type change** — add `errors` to the return value (non-breaking; `api-webhooks.ts` destructures only `inserted` and `bySource` and ignores extra fields):

```ts
// Change signature from:
Promise<{ inserted: number; bySource: Record<string, number> }>
// To:
Promise<{ inserted: number; bySource: Record<string, number>; errors: Array<{ source: string; error: string }> }>

// Early return at line 70 also needs the errors field:
if (newJobs.length === 0) return { inserted: 0, bySource: {}, errors }

// Final return:
return { inserted: userId !== undefined ? newJobs.length : 0, bySource, errors }
```

### Test File Changes (Critical — Tests Will Break Without This)

The existing test `beforeAll` creates `jobs` and `search_configs` tables but **not `user_secrets`**. After the change, `runDiscovery` will query `user_secrets` — the test will throw if the table doesn't exist.

**Add to `beforeAll`:**
```ts
const CREATE_USER_SECRETS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_secrets (
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key_name)
  )
`
// In beforeAll:
prodSqlite.run(CREATE_USER_SECRETS_TABLE)
```

**Add to `beforeEach`** (for isolation):
```ts
prodSqlite.run('DELETE FROM user_secrets')
```

**Existing happy path test** (line 87) will now insert 0 jobs because the only search config is `linkedin` and there's no `linkedin_storage_state`. Either:
- Option A: Change the test to also verify LinkedIn is skipped (test the new behavior)
- Option B: Insert a fake `linkedin_storage_state` row in that test to restore the original behavior

For the happy path test, inserting a fake storage state is cleaner — it keeps the test focused on the "happy path with auth configured":
```ts
prodSqlite.run(
  `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', 'fake', '2026-01-01T00:00:00.000Z')`
)
```

**New tests to add:**

```ts
test('LinkedIn searches skipped when no linkedin_storage_state, other sources complete', async () => {
  // Insert a non-linkedin search config
  prodSqlite.run(`INSERT INTO search_configs (source, query, enabled, user_id) VALUES ('indeed', 'backend dev', 1, 1)`)

  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(
      JSON.stringify({ results: [{ id: 'job-ind', title: 'Dev', company: 'Co', location: null, url: null }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  )

  const { inserted, errors } = await runDiscovery(undefined, 1)
  expect(inserted).toBe(1) // indeed job inserted
  expect(errors).toHaveLength(1)
  expect(errors[0].source).toBe('linkedin')
  expect(errors[0].error).toContain('LinkedIn not connected')
  // Clean up extra search
  prodSqlite.run(`DELETE FROM search_configs WHERE source = 'indeed'`)
})

test('LinkedIn skipped emits onProgress message', async () => {
  const messages: string[] = []
  globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } })))
  await runDiscovery((msg) => messages.push(msg), 1)
  expect(messages.some((m) => m.toLowerCase().includes('linkedin'))).toBe(true)
})

test('LinkedIn proceeds when linkedin_storage_state exists', async () => {
  prodSqlite.run(
    `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', 'fake', '2026-01-01T00:00:00.000Z')`
  )
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(
      JSON.stringify({ results: [{ id: 'job-li', title: 'PM', company: 'Corp', location: null, url: null }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  )
  const { errors } = await runDiscovery(undefined, 1)
  expect(errors).toHaveLength(0)
})
```

### Architecture Compliance

- **Secret handling**: Story 29.1 only checks *presence* of `linkedin_storage_state` — it does NOT decrypt or use the value. The `ciphertext` column is not read. This satisfies the architecture rule: "per-user secrets NEVER returned raw".
- **User isolation**: Query uses `eq(userSecrets.userId, userId)` — never from request body/params. The `userId` always comes from `ctx.get('userId')` in the route layer (not from the discovery service itself).
- **Error response shape**: `errors` array is an internal service return; the `{ error: string }` API response shape rule applies to HTTP responses only (not service return types).
- **`console.error` for server errors**: Do NOT `console.error` for the LinkedIn skip — it's an expected user configuration state, not a server error.
- **No 500s**: Using filter approach (not try/catch) ensures non-LinkedIn searches proceed regardless.

### `userId` Guard

The function signature accepts `userId?: number`. The LinkedIn check must guard with `userId !== undefined` to avoid querying `user_secrets` when no user context is available (legacy/undefined case). The existing early-exit pattern for undefined userId on inserts (line 76) is the model to follow.

### Existing Search Config Setup

In the existing test's `beforeAll`, there is exactly one search config: `('linkedin', 'genai python', 1)`. After 29.1, with no `linkedin_storage_state`, this LinkedIn search will be skipped → `inserted = 0`. Every test that inserts a LinkedIn search and expects it to succeed must also insert a `linkedin_storage_state` row.

### Project Structure Notes

- No new files created — changes are additive modifications to existing files
- No Zod schema changes in `src/shared/schemas.ts` — the `errors` array type is internal to `discovery-service.ts`
- No migration needed — no DB schema changes
- `userSecrets` table already exists in DB schema (`src/db/schema.ts`)

### References

- Discovery service: `job-hunt-dashboard/src/server/services/discovery-service.ts`
- Discovery service tests: `job-hunt-dashboard/src/server/services/discovery-service.test.ts`
- Webhook route (caller context): `job-hunt-dashboard/src/server/routes/api-webhooks.ts:24` — destructures `{ inserted, bySource }` only; adding `errors` is non-breaking
- `user_secrets` table: `job-hunt-dashboard/src/db/schema.ts` — `userSecrets` export; `primaryKey([userId, keyName])`
- IMAP user_secrets query pattern: `job-hunt-dashboard/src/server/routes/api-onboarding.ts:14-19`
- Analysis service user_secrets pattern: `job-hunt-dashboard/src/server/routes/api-webhooks.ts:39-43`
- Epic 29 full context: `_bmad-output/planning-artifacts/epics/epic-29-per-user-linkedin-authentication.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Test DDL was missing `date_analyzed` column (added to schema since test file was written); added it to `CREATE_JOBS_TABLE` in test.

### Completion Notes List

- Extended `runDiscovery` return type to include `errors: Array<{ source: string; error: string }>` on all return paths.
- Added `user_secrets` lookup for `linkedin_storage_state` before `Promise.all`; filters LinkedIn searches and emits `onProgress` when absent.
- Added `CREATE_USER_SECRETS_TABLE` DDL and `DELETE FROM user_secrets` in `beforeEach` for test isolation.
- Fixed 5 existing tests to insert a fake `linkedin_storage_state` row where LinkedIn search must proceed.
- Added 3 new tests covering: LinkedIn skip with other sources completing, LinkedIn skip emitting onProgress, LinkedIn proceeding when auth exists.
- All 10 tests pass; no regressions.

### File List

- job-hunt-dashboard/src/server/services/discovery-service.ts
- job-hunt-dashboard/src/server/services/discovery-service.test.ts

## Change Log

- 2026-05-07: Implemented LinkedIn graceful skip in discovery-service; added errors field to return type; 3 new tests + 5 existing test fixes; all 10 tests pass.

## Status

done
