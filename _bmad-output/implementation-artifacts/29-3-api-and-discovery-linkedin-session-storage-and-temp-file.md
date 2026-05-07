# Story 29.3: API & Discovery — LinkedIn Session Storage & Temp File

Status: done

## Story

As a user,
I want my LinkedIn session state stored encrypted and used automatically during Discovery,
so that LinkedIn scraping works with my own session without manual file management on the server.

## Acceptance Criteria

1. **Given** `PUT /api/onboarding/linkedin` is called with raw `linkedin.json` content in the request body, **When** the server receives the request, **Then** the content is encrypted via `encrypt()` and stored in `user_secrets` with `key_name: 'linkedin_storage_state'`, **And** response is `200 { ok: true }`.

2. **Given** `GET /api/onboarding/status` is called, **When** the response is built, **Then** `hasLinkedinAuth: boolean` is included in the response alongside `hasAnthropicKey` and `hasImap`, **And** `hasLinkedinAuth` is `true` only when a `linkedin_storage_state` row exists in `user_secrets` for the authenticated user.

3. **Given** a Discovery run for a user who has `linkedin_storage_state` in `user_secrets`, **When** `discovery-service.ts` prepares a LinkedIn scrape request, **Then** the service decrypts the stored state via `decrypt()`, **And** writes the decrypted content to `os.tmpdir()/linkedin-{userId}-{timestamp}.json`, **And** passes `{ storageStatePath }` in the scrape request body, **And** deletes the temp file in a `finally` block (whether the scrape succeeds or fails).

4. **Given** stored LinkedIn credentials fail to decrypt, **When** `discovery-service.ts` attempts to prepare the scrape, **Then** the decrypt error is caught; a `{ source: 'linkedin', error: 'Failed to read LinkedIn session — re-upload in Config > Connections' }` entry is added; scrape is skipped; no 500.

## Tasks / Subtasks

- [x] Update `src/shared/schemas.ts` — add `hasLinkedinAuth` to `OnboardingStatusResponse` (AC: 2)
  - [x] Add `hasLinkedinAuth: boolean` field to the `OnboardingStatusResponse` type

- [x] Update `src/server/routes/api-onboarding.ts` — add `PUT /linkedin` and update status (AC: 1, 2)
  - [x] `GET /status`: compute `hasLinkedinAuth = keys.has('linkedin_storage_state')` and include in `c.json(...)` response
  - [x] Add `linkedinSchema = z.object({ content: z.string().min(1) })`
  - [x] Add `app.put('/linkedin', async (c) => { ... })` following the `PUT /anthropic` pattern exactly
  - [x] Store encrypted content as `key_name: 'linkedin_storage_state'` via upsert (same pattern as anthropic upsert)
  - [x] Return `c.json({ ok: true })` on success

- [x] Update `src/server/services/discovery-service.ts` — decrypt + temp file + cleanup (AC: 3, 4)
  - [x] Add imports: `writeFileSync`, `unlinkSync` from `'node:fs'`; `tmpdir` from `'node:os'`; `join` from `'node:path'`; `decrypt` from `'../lib/crypto'`
  - [x] Declare `let storageStatePath: string | undefined` before the LinkedIn check block
  - [x] Replace the existing `hasLinkedinAuth` / `select({ keyName })` check with `select({ ciphertext })` — variable renamed `linkedinSecret`
  - [x] If `!linkedinSecret`: keep existing 29.1 skip behavior unchanged
  - [x] If `linkedinSecret` exists AND LinkedIn searches are configured: wrap decrypt+write in try/catch
    - [x] `try`: `decrypt(linkedinSecret.ciphertext)` → `writeFileSync(tempPath, decrypted, 'utf-8')` → `storageStatePath = tempPath`
    - [x] `catch`: push `{ source: 'linkedin', error: 'Failed to read LinkedIn session — re-upload in Config > Connections' }`, call `onProgress?.(...)`
  - [x] Thread `storageStatePath` into LinkedIn scrape request bodies in `Promise.all` (spread it in for LinkedIn only)
  - [x] Wrap the `Promise.all(...)` and all subsequent processing in a `try {} finally { if (storageStatePath) { try { unlinkSync(storageStatePath) } catch {} } }`

- [x] Update `src/server/routes/api-onboarding.test.ts` (AC: 1, 2)
  - [x] Update `GET /status` tests to include `hasLinkedinAuth` field assertions (existing tests add the field check)
  - [x] Add `describe('PUT /api/onboarding/linkedin')` block with: valid content → 200 `{ ok: true }` + row stored; empty string → 400; invalid JSON → 400; second PUT upserts (no duplicate row)

- [x] Update `src/server/services/discovery-service.test.ts` (AC: 3, 4)
  - [x] Add `process.env.ENCRYPTION_KEY = 'a'.repeat(64)` at top of file (line 1, before `DB_PATH`)
  - [x] Import `encrypt` from `'../lib/crypto'` and compute `const VALID_LINKEDIN_CIPHERTEXT = encrypt('{"cookies":[],"origins":[]}')` after all `await import(...)` calls
  - [x] Replace ALL 6 occurrences of `'fake'` ciphertext in `user_secrets` inserts with `${VALID_LINKEDIN_CIPHERTEXT}` (see list below)
  - [x] Add test: `storageStatePath` is included in LinkedIn scrape request body when auth is valid
  - [x] Add test: temp file is deleted after scrape completes (check `existsSync(capturedPath)` is false)
  - [x] Add test: invalid ciphertext → decrypt error caught → `errors` contains `'Failed to read LinkedIn session'` entry, no throw

### Review Findings

- [x] [Review][Patch] `writeFileSync` errors fall into decrypt catch block — user shown misleading "re-upload your session" message when actual failure is disk I/O [discovery-service.ts ~line 65] — fixed: split decrypt/writeFileSync into separate try/catch; disk errors now propagate as server errors
- [x] [Review][Patch] Vacuous temp file deletion test — missing `expect(capturedPath).toBeDefined()` before the `if` block; test passes with no assertion if `storageStatePath` is never threaded into the request body [discovery-service.test.ts ~line 293] — fixed: added assertion before conditional
- [x] [Review][Defer] Process crash between `writeFileSync` and `try` block entry leaves cleartext temp file on disk — OS-level failure, tmpdir cleaned on reboot; deferred
- [x] [Review][Defer] SQL template literals in test fixtures embed `VALID_LINKEDIN_CIPHERTEXT` directly — controlled ciphertext format makes injection impractical; spec-specified pattern; deferred
- [x] [Review][Defer] Callers that only inspect `inserted`/`bySource` silently miss LinkedIn skip — API design note; Epic 29.4 will wire `errors` into UI feedback; deferred
- [x] [Review][Defer] No test for temp file cleanup when `Promise.all` throws — `try/finally` semantics guarantee cleanup; not required by spec; deferred
- [x] [Review][Defer] Unknown scraper source maps to raw string in DB `source` column — pre-existing from story 13.3, not introduced here; deferred

## Dev Notes

### What This Story Does NOT Change

- No scraper changes (`linkedin.js`, `scrape.js`, `pool.js`) — those were completed in Story 29.2. The scraper already accepts `storageStatePath` optionally.
- No UI changes — Story 29.4 handles the Config > Connections upload UI.
- No new DB migration — `user_secrets` table already exists and accepts `key_name: 'linkedin_storage_state'`.
- `auth-middleware.ts` and `scraper-process.ts` — no changes needed.

### Architecture Invariants

**Secret handling rule (from project context):** `decrypt()` must be called inside the SERVICE that needs the value — NEVER in route handlers. The `PUT /linkedin` route only calls `encrypt()` (storing). The `decrypt()` call lives in `discovery-service.ts` (the service). This is correct.

**User isolation rule:** `userId` always comes from `ctx.get('userId')` in routes, never from request body/params. The route passes it to the service. The service uses `eq(userSecrets.userId, userId)` in all queries.

**Error response shape:** `{ error: string }` on route-level HTTP errors. The `errors` array in `runDiscovery`'s return type is an internal service return, not an HTTP error — same pattern established in Story 29.1.

**`console.error` rule:** Do NOT `console.error` for LinkedIn skip/decrypt errors — these are expected user configuration states. Only use `console.error` for genuine server failures.

### `PUT /api/onboarding/linkedin` — Exact Implementation

Follow `PUT /anthropic` pattern verbatim but simpler (no live API validation):

```ts
const linkedinSchema = z.object({ content: z.string().min(1) })

app.put('/linkedin', async (c) => {
  const userId = c.get('userId')

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = linkedinSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)

  const now = new Date().toISOString()
  const ciphertext = encrypt(parsed.data.content)
  db.insert(userSecrets)
    .values({ userId, keyName: 'linkedin_storage_state', ciphertext, updatedAt: now })
    .onConflictDoUpdate({
      target: [userSecrets.userId, userSecrets.keyName],
      set: { ciphertext, updatedAt: now },
    })
    .run()

  return c.json({ ok: true })
})
```

**Client sends:** `{ content: "<file content as string>" }` with `Content-Type: application/json`. Story 29.4 reads the file via `FileReader.readAsText()` and JSON-stringifies it as the `content` field.

### `GET /api/onboarding/status` — Minimal Change

The `userId` row query already fetches all `keyName` values. Just add one line:

```ts
const hasLinkedinAuth = keys.has('linkedin_storage_state')
return c.json({ hasAnthropicKey, hasImap, hasLinkedinAuth, onboardingComplete })
```

### `discovery-service.ts` — Full Restructured LinkedIn Block

The existing `hasLinkedinAuth` block (lines 32–47 after 29.1) must be replaced with:

```ts
let storageStatePath: string | undefined

if (userId !== undefined) {
  const linkedinSecret = db
    .select({ ciphertext: userSecrets.ciphertext })
    .from(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'linkedin_storage_state')))
    .get()

  if (!linkedinSecret) {
    const linkedinSearches = searches.filter((s) => s.source === 'linkedin')
    if (linkedinSearches.length > 0) {
      const errMsg = 'LinkedIn not connected — add your session in Config > Connections'
      errors.push({ source: 'linkedin', error: errMsg })
      onProgress?.(`LinkedIn skipped: ${errMsg}`)
    }
  } else {
    const linkedinSearches = searches.filter((s) => s.source === 'linkedin')
    if (linkedinSearches.length > 0) {
      try {
        const decrypted = decrypt(linkedinSecret.ciphertext)
        const tempPath = join(tmpdir(), `linkedin-${userId}-${Date.now()}.json`)
        writeFileSync(tempPath, decrypted, 'utf-8')
        storageStatePath = tempPath
      } catch {
        const errMsg = 'Failed to read LinkedIn session — re-upload in Config > Connections'
        errors.push({ source: 'linkedin', error: errMsg })
        onProgress?.(`LinkedIn skipped: ${errMsg}`)
      }
    }
  }
}
```

The `activeSearches` filter line remains unchanged (already correct):
```ts
const activeSearches = errors.some((e) => e.source === 'linkedin')
  ? searches.filter((s) => s.source !== 'linkedin')
  : searches
```

### `Promise.all` — Threading `storageStatePath` and Cleanup

Replace the `const responses = await Promise.all(...)` block with a `try/finally` wrapper. The scrape request body gains `storageStatePath` conditionally:

```ts
try {
  const responses = await Promise.all(
    activeSearches.map((s) => {
      onProgress?.(`Searching ${s.source}: ${s.query}…`)
      const requestBody: Record<string, unknown> = {
        source: s.source, query: s.query, location: s.location,
      }
      if (s.source === 'linkedin' && storageStatePath) {
        requestBody.storageStatePath = storageStatePath
      }
      return fetch(`${scraperUrl}/scrape/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scraperToken ? { Authorization: `Bearer ${scraperToken}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(60_000),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`Scraper error ${res.status} for "${s.query}"`)
        const data = await res.json() as { results?: ScraperResult[] }
        return { source: DB_SOURCE[s.source as ScraperSource] ?? s.source, results: data.results ?? [] }
      })
    })
  )

  // ... rest of existing processing (allResults, existing, newJobs, transaction, bySource) ...

  return { inserted: userId !== undefined ? newJobs.length : 0, bySource, errors }
} finally {
  if (storageStatePath) {
    try { unlinkSync(storageStatePath) } catch { /* ignored — best-effort cleanup */ }
  }
}
```

Note: `finally` runs even on early returns (`if (newJobs.length === 0) return { inserted: 0, bySource: {}, errors }`). This is correct JavaScript behavior.

### New Imports for `discovery-service.ts`

Add at the top of the file:
```ts
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decrypt } from '../lib/crypto'
```

Path `'../lib/crypto'` is correct: the service is at `src/server/services/` and crypto is at `src/server/lib/crypto.ts`.

### `OnboardingStatusResponse` Type Update

In `src/shared/schemas.ts` at the bottom, update the type:

```ts
export type OnboardingStatusResponse = {
  hasAnthropicKey: boolean
  hasImap: boolean
  hasLinkedinAuth: boolean
  onboardingComplete: boolean
}
```

There is no `onboardingStatusSchema` Zod schema in the file — only this TypeScript type. Do NOT create a separate Zod schema.

### Critical: `discovery-service.test.ts` Migration

**Story 29.2 stored `'fake'` as ciphertext for 6 tests** that expected LinkedIn to proceed or be present. After 29.3, any `linkedin_storage_state` row causes `decrypt()` to be called. Decrypting `'fake'` throws (`decrypt: malformed ciphertext — expected 3 segments, got 1`). This triggers the catch block → error added → LinkedIn skipped → those tests FAIL.

**Fix: Replace `'fake'` with `${VALID_LINKEDIN_CIPHERTEXT}` in these 6 tests:**
1. `'happy path: inserts new jobs from all 6 searches'` (line 94)
2. `'deduplication: skips jobs already in DB by externalJobId'` (line 115)
3. `'scraper error: throws when any search returns non-ok status'` (line 139)
4. `'onProgress: emits search messages before fetches...'` (line 157)
5. `'sets analysisStatus to pending on insert'` (line 196)
6. `'LinkedIn proceeds when linkedin_storage_state exists'` (line 239)

**Setup at top of `discovery-service.test.ts` (lines 1-2, before DB_PATH):**
```ts
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DB_PATH = ':memory:'
```

**After all `await import(...)` calls, add:**
```ts
const { encrypt } = await import('../lib/crypto')
const VALID_LINKEDIN_CIPHERTEXT = encrypt('{"cookies":[],"origins":[]}')
```

**Then in each affected `beforeEach` or test insert:**
```ts
prodSqlite.run(
  `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
)
```

### New Tests for `discovery-service.test.ts`

```ts
test('LinkedIn with valid auth passes storageStatePath in request body', async () => {
  prodSqlite.run(
    `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
  )

  let capturedStorageStatePath: string | undefined
  globalThis.fetch = mock((url: unknown, options: unknown) => {
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>
    if (body.source === 'linkedin') capturedStorageStatePath = body.storageStatePath as string
    return Promise.resolve(new Response(
      JSON.stringify({ results: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  })

  await runDiscovery(undefined, 1)
  expect(capturedStorageStatePath).toBeDefined()
  expect(capturedStorageStatePath).toMatch(/linkedin-1-\d+\.json$/)
})

test('temp file is deleted after scrape (finally block)', async () => {
  prodSqlite.run(
    `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', '${VALID_LINKEDIN_CIPHERTEXT}', '2026-01-01T00:00:00.000Z')`
  )

  let capturedPath: string | undefined
  globalThis.fetch = mock((_url: unknown, options: unknown) => {
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>
    if (body.storageStatePath) capturedPath = body.storageStatePath as string
    return Promise.resolve(new Response(
      JSON.stringify({ results: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))
  })

  await runDiscovery(undefined, 1)
  if (capturedPath) {
    const { existsSync } = await import('node:fs')
    expect(existsSync(capturedPath)).toBe(false)
  }
})

test('invalid ciphertext: decrypt error caught, LinkedIn skipped, no throw', async () => {
  prodSqlite.run(
    `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', 'fake', '2026-01-01T00:00:00.000Z')`
  )
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
  )

  const { inserted, errors } = await runDiscovery(undefined, 1)
  expect(errors).toHaveLength(1)
  expect(errors[0].source).toBe('linkedin')
  expect(errors[0].error).toBe('Failed to read LinkedIn session — re-upload in Config > Connections')
  expect(inserted).toBe(0)
})
```

### New Tests for `api-onboarding.test.ts`

```ts
describe('PUT /api/onboarding/linkedin', () => {
  test('valid content → 200 { ok: true } and row stored', async () => {
    const res = await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '{"cookies":[],"origins":[]}' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
    const row = prodSqlite.prepare(
      `SELECT key_name FROM user_secrets WHERE user_id = 1 AND key_name = 'linkedin_storage_state'`
    ).get() as { key_name: string } | undefined
    expect(row?.key_name).toBe('linkedin_storage_state')
  })

  test('empty content → 400', async () => {
    const res = await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBeDefined()
  })

  test('missing content field → 400', async () => {
    const res = await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  test('invalid JSON body → 400', async () => {
    const res = await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
  })

  test('second PUT upserts — single row in user_secrets', async () => {
    await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '{"cookies":[],"origins":[]}' }),
    })
    await onboardingApp.request('/linkedin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '{"cookies":[{"new":"true"}],"origins":[]}' }),
    })
    const rows = prodSqlite.prepare(
      `SELECT * FROM user_secrets WHERE key_name = 'linkedin_storage_state'`
    ).all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
  })
})
```

**Update existing `GET /status` tests** to assert `hasLinkedinAuth`:
- `'no secrets → all false'`: add `expect(body.hasLinkedinAuth).toBe(false)`
- Other status tests: add `expect(body.hasLinkedinAuth).toBe(false)` where no linkedin row inserted

**Add new GET /status test:**
```ts
test('with linkedin_storage_state → hasLinkedinAuth true', async () => {
  prodSqlite.run(
    `INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at) VALUES (1, 'linkedin_storage_state', 'cipher', '2026-04-30T00:00:00.000Z')`
  )
  const res = await onboardingApp.request('/status', { method: 'GET' })
  expect(res.status).toBe(200)
  const body = await res.json() as { hasLinkedinAuth: boolean }
  expect(body.hasLinkedinAuth).toBe(true)
})
```

### Project Structure Notes

**Files changed (5 total):**
- `job-hunt-dashboard/src/shared/schemas.ts` — `OnboardingStatusResponse` type update
- `job-hunt-dashboard/src/server/routes/api-onboarding.ts` — status + new linkedin route
- `job-hunt-dashboard/src/server/services/discovery-service.ts` — decrypt + temp file + cleanup
- `job-hunt-dashboard/src/server/routes/api-onboarding.test.ts` — new tests + existing test updates
- `job-hunt-dashboard/src/server/services/discovery-service.test.ts` — ENCRYPTION_KEY + 6 ciphertext fixes + 3 new tests

**No new files created.** No migration. No schema changes. No scraper changes.

**TypeScript strict mode:** All catch blocks must be `catch { }` (no typed parameter for empty catches), or `catch (err) { void err }` if needed — but for empty catches `catch { }` is cleanest. The `noUnusedLocals` rule means any declared variable must be used.

**`join` from `'node:path'`** — not already imported in `discovery-service.ts`. Need to add alongside the other new imports.

**`decrypt` from `'../lib/crypto'`** — `crypto.ts` already exports it. Relative path from `src/server/services/` to `src/server/lib/crypto.ts` is `'../lib/crypto'`.

### References

- `src/server/routes/api-onboarding.ts` — `PUT /anthropic` at lines 27–81 (exact pattern to follow for `PUT /linkedin`)
- `src/server/routes/api-onboarding.ts` — `GET /status` at lines 12–23 (add `hasLinkedinAuth` here)
- `src/shared/schemas.ts:255–259` — `OnboardingStatusResponse` type (update this)
- `src/server/services/discovery-service.ts:30–51` — the existing LinkedIn check block (replace with new decrypt+tempfile logic)
- `src/server/services/discovery-service.ts:53–70` — the `Promise.all` block (wrap in `try/finally`, add `storageStatePath` threading)
- `src/server/lib/crypto.ts` — `encrypt()` and `decrypt()` exports
- `src/server/routes/api-onboarding.test.ts` — test setup pattern to follow (`ENCRYPTION_KEY`, Hono wrapper with userId middleware)
- `src/server/services/discovery-service.test.ts` — 6 lines with `'fake'` ciphertext that need updating (lines 94, 115, 139, 157, 196, 239)
- Epic 29: `_bmad-output/planning-artifacts/epics/epic-29-per-user-linkedin-authentication.md`
- Story 29.1: `_bmad-output/implementation-artifacts/29-1-linkedin-discovery-graceful-skip-stopgap.md`
- Story 29.2: `_bmad-output/implementation-artifacts/29-2-scraper-per-request-storage-state-path.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward, following spec exactly.

### Completion Notes List

- Added `hasLinkedinAuth: boolean` to `OnboardingStatusResponse` type in schemas.ts
- Added `PUT /linkedin` route to api-onboarding.ts following the `PUT /anthropic` pattern exactly (no live validation, just encrypt + upsert)
- Added `hasLinkedinAuth` computation to `GET /status` handler
- Replaced `hasLinkedinAuth` / `select({ keyName })` check in discovery-service.ts with `select({ ciphertext })` → `linkedinSecret`
- Added decrypt + writeFileSync to tmpdir, storageStatePath threading into LinkedIn request bodies
- Wrapped entire Promise.all block and subsequent processing in try/finally for guaranteed temp file cleanup via unlinkSync
- Migrated discovery-service.test.ts: added ENCRYPTION_KEY env, VALID_LINKEDIN_CIPHERTEXT constant, replaced 6 'fake' ciphertext values
- Added 3 new discovery tests: storageStatePath in request body, temp file deleted after scrape, invalid ciphertext caught gracefully
- Added 6 new onboarding tests: PUT /linkedin valid/empty/missing/invalid-json/upsert + GET /status hasLinkedinAuth true
- Updated 3 existing GET /status tests to assert hasLinkedinAuth field
- All 16 onboarding tests pass, all 13 discovery tests pass; pre-existing failures in scraper-process.test.ts and api-cover-letter.test.ts confirmed pre-existing (verified via git stash)

### File List

- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/server/routes/api-onboarding.ts`
- `job-hunt-dashboard/src/server/services/discovery-service.ts`
- `job-hunt-dashboard/src/server/routes/api-onboarding.test.ts`
- `job-hunt-dashboard/src/server/services/discovery-service.test.ts`

### Change Log

- 2026-05-07: Implemented Story 29.3 — LinkedIn session storage (PUT /linkedin route, GET /status hasLinkedinAuth), discovery-service decrypt+tempfile+cleanup, test migrations and new tests
