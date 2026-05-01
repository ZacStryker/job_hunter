# Story 25.1: Onboarding API — Status, Anthropic API Key & IMAP Setup

Status: done

## Story

As a user completing onboarding,
I want API endpoints that store my Anthropic API key and IMAP credentials after live testing them,
so that the app can make AI analysis calls and poll my email using credentials that are private and encrypted.

## Acceptance Criteria

1. **Given** a valid session and incomplete onboarding
   **When** `GET /api/onboarding/status` is called
   **Then** response is `200 { hasAnthropicKey: boolean, hasImap: boolean, onboardingComplete: boolean }`
   **And** `onboardingComplete` is `true` only when `hasAnthropicKey` is `true` (IMAP is optional)
   **And** raw secret values are never included in the response — presence flags only

2. **Given** I submit an Anthropic API key
   **When** `PUT /api/onboarding/anthropic` is called with `{ apiKey }`
   **Then** the server makes a minimal live Anthropic API test call using the provided key
   **And** on success: the key is encrypted via `encrypt()` and upserted in `user_secrets` (key_name: `anthropic_api_key`); response is `200 { ok: true }`

3. **Given** an invalid Anthropic API key
   **When** `PUT /api/onboarding/anthropic` is called
   **Then** the key is NOT stored; response is `400 { error: "Invalid key — verify at console.anthropic.com" }`

4. **Given** the Anthropic test times out (> 10 seconds)
   **When** `PUT /api/onboarding/anthropic` is called
   **Then** response is `400 { error: "Connection timed out — check your network and try again" }`

5. **Given** a server-side error from the Anthropic API
   **When** `PUT /api/onboarding/anthropic` is called
   **Then** response is `400 { error: "Server error — try again in a moment" }`

6. **Given** valid IMAP credentials are submitted
   **When** `PUT /api/onboarding/imap` is called with `{ host, port, user, pass }`
   **Then** the server attempts a live IMAP connection test with a 10-second timeout
   **And** on success: all four values are encrypted and upserted in `user_secrets` (key_names: `imap_host`, `imap_port`, `imap_user`, `imap_pass`); response is `200 { ok: true }`

7. **Given** IMAP credentials with wrong password
   **When** `PUT /api/onboarding/imap` is called
   **Then** credentials are NOT stored; response is `400 { error: "Authentication failed — check username and password" }`

8. **Given** an unreachable IMAP host
   **When** `PUT /api/onboarding/imap` is called
   **Then** response is `400 { error: "Cannot reach host — verify server address and port" }`

9. **Given** the IMAP test times out (> 10 seconds)
   **When** `PUT /api/onboarding/imap` is called
   **Then** response is `400 { error: "Connection timed out — check your network and try again" }`

10. **Given** a user has IMAP credentials stored in `user_secrets`
    **When** `POST /api/messages/sync` is called
    **Then** credentials are read from `user_secrets` (key_names: `imap_host`, `imap_port`, `imap_user`, `imap_pass`) and decrypted via `decrypt()`
    **And** `fetchAndStoreEmails` is called with the decrypted per-user credentials and the authenticated `userId`
    **And** global env var IMAP credentials (`IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`) are no longer used

11. **Given** a user has no IMAP credentials in `user_secrets`
    **When** `POST /api/messages/sync` is called
    **Then** response is `503 { error: "Email sync not configured — add IMAP credentials in settings" }`

12. **Given** stored IMAP credentials fail to decrypt
    **When** `POST /api/messages/sync` is called
    **Then** response is `500 { error: "Failed to read email credentials" }`
    **And** the decrypt error is logged via `console.error`

## Tasks / Subtasks

### 1. Create `src/server/routes/api-onboarding.ts` (AC: #1–#9)

- [x] Create `src/server/routes/api-onboarding.ts`
  - [x] Import: `Hono`, `z` from zod, `eq`, `and` from drizzle-orm, `db` from db/client, `userSecrets` from db/schema, `encrypt` from `../lib/crypto`, `ImapFlow` from `imapflow`, `AppEnv` from `../types`
  - [x] `const app = new Hono<AppEnv>()`

- [x] `GET /api/onboarding/status` (AC: #1)
  - [x] `const userId = c.get('userId')`
  - [x] Query all `user_secrets` rows for this user: `.select({ keyName: userSecrets.keyName }).from(userSecrets).where(eq(userSecrets.userId, userId)).all()`
  - [x] `const keys = new Set(rows.map((r) => r.keyName))`
  - [x] `const hasAnthropicKey = keys.has('anthropic_api_key')`
  - [x] `const hasImap = keys.has('imap_host') && keys.has('imap_user') && keys.has('imap_pass')`
  - [x] `const onboardingComplete = hasAnthropicKey`
  - [x] Return `200 { hasAnthropicKey, hasImap, onboardingComplete }`
  - [x] Never include ciphertext or raw secrets in the response

- [x] `PUT /api/onboarding/anthropic` (AC: #2–#5)
  - [x] Parse body with `z.object({ apiKey: z.string().min(1) })` — invalid body → `400 { error: '...' }`
  - [x] Make live Anthropic test call using raw fetch
  - [x] If `res.status === 401`: return `400 { error: "Invalid key — verify at console.anthropic.com" }`
  - [x] If `res.status >= 500`: return `400 { error: "Server error — try again in a moment" }`
  - [x] Catch `AbortError` (or `err.name === 'TimeoutError'`): return `400 { error: "Connection timed out — check your network and try again" }`
  - [x] Catch other errors: return `400 { error: "Server error — try again in a moment" }`
  - [x] On success (res.ok): upsert into `user_secrets`
  - [x] Return `200 { ok: true }`

- [x] `PUT /api/onboarding/imap` (AC: #6–#9)
  - [x] Parse body with Zod imapSchema (host, port, user, pass)
  - [x] Invalid body → `400 { error: '...' }`
  - [x] Make live IMAP connection test with 10-second timeout using `Promise.race`
  - [x] On success: encrypt all four values and upsert each into `user_secrets`
  - [x] Return `200 { ok: true }`
  - [x] Error classification for IMAP catch block (TimeoutError, auth, unreachable)
  - [x] Logout tracked with `connected` flag — logout errors after successful connect are ignored
  - [x] `export default app`

### 2. Mount `api-onboarding` in `src/index.ts` (AC: all)

- [x] Add import: `import onboardingRoute from './server/routes/api-onboarding'`
- [x] Mount AFTER `authMiddleware` (already applied to `/api/*`): `app.route('/api/onboarding', onboardingRoute)`
- [x] Place alongside other `/api/*` route mounts (after the existing job/message/etc routes)

### 3. Update `src/server/routes/api-auth.ts` — `POST /auth/login` (AC: #1)

- [x] Add import: `userSecrets` from `../../db/schema`
- [x] After creating the session, compute real `onboardingComplete` from `user_secrets`
- [x] Change `return c.json({ onboardingComplete: true })` → `return c.json({ onboardingComplete })`
- [x] This uses `and` — already imported

### 4. Update `src/server/services/email-fetch-service.ts` (AC: #10)

- [x] Add `port?: number` to the `ImapCredentials` interface
- [x] Update the `ImapFlow` constructor inside `fetchAndStoreEmails` to use `port: credentials.port ?? 993`

### 5. Update `src/server/routes/api-messages.ts` — `POST /sync` (AC: #10–#12)

- [x] Add imports: `userSecrets` from `../../db/schema`; `decrypt` from `../lib/crypto`; `inArray` from `drizzle-orm`
- [x] Replace the env var block with user_secrets query using `inArray` helper
- [x] 503 when no IMAP credentials; 500 with decrypt failure; decrypt errors caught and logged

### 6. Tests: `src/server/routes/api-onboarding.test.ts` (AC: #1, #11, #12)

- [x] Create `src/server/routes/api-onboarding.test.ts`
  - [x] Env vars set before imports; dynamic import pattern
  - [x] Hono wrapper injecting userId: 1
  - [x] `user_secrets` table DDL in beforeAll; DELETE in beforeEach

- [x] `GET /api/onboarding/status` tests (4 tests — all flags, ciphertext not exposed)
- [x] `PUT /api/onboarding/anthropic` input validation tests (3 tests)
- [x] `PUT /api/onboarding/imap` input validation tests (3 tests)

### 7. Tests: additions to `src/server/routes/api-messages.test.ts` (AC: #11, #12)

- [x] Add `user_secrets` table DDL to `beforeAll`; DELETE in `beforeEach`
- [x] `POST /api/messages/sync` — no user_secrets → `503` with error containing `"not configured"`
- [x] `POST /api/messages/sync` — corrupt ciphertext → `500` with `"Failed to read email credentials"`

## Dev Notes

### Architecture Context

This is a pure backend API story — no UI changes. `api-onboarding.ts` is a new route file under `/api/onboarding/*`, protected by the existing `authMiddleware` (applied to all `/api/*` in `src/index.ts`).

### `user_secrets` Upsert Pattern

The `user_secrets` table uses a composite PK `(user_id, key_name)`. Use Drizzle's `.onConflictDoUpdate` targeting both columns:

```ts
db.insert(userSecrets)
  .values({ userId, keyName: 'anthropic_api_key', ciphertext: encrypt(apiKey), updatedAt: now })
  .onConflictDoUpdate({
    target: [userSecrets.userId, userSecrets.keyName],
    set: { ciphertext: encrypt(apiKey), updatedAt: now },
  })
  .run()
```

Multiple secrets for IMAP must each be upserted individually — loop over them with separate `.insert().onConflictDoUpdate()` calls.

### Anthropic Live Test Call

Follow the same raw-fetch pattern as `analysis-service.ts`. Use `claude-haiku-4-5-20251001` with `max_tokens: 1` for minimal cost/latency:

```ts
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  }),
  signal: AbortSignal.timeout(10000),
})
```

Error mapping:
- `res.status === 401` → invalid key
- `res.status >= 500` → server error
- `err.name === 'TimeoutError'` (AbortSignal timeout) → timed out

### IMAP Live Test — ImapFlow

`ImapFlow` is already installed (used by `email-fetch-service.ts`). Import directly from `imapflow`. Connect-then-logout pattern:

```ts
const client = new ImapFlow({
  host, port, secure: true,
  auth: { user, pass },
  logger: false,
})

let connected = false
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(Object.assign(new Error('IMAP timeout'), { name: 'TimeoutError' })), 10000)
)

try {
  await Promise.race([client.connect(), timeoutPromise])
  connected = true
  await client.logout()
} catch (err) {
  if (!connected) {
    // classify connection/auth error
  }
  if (connected) throw err // logout error — ignore
}
```

IMAP error message classification heuristics (ImapFlow error messages vary by server):
- `err.name === 'TimeoutError'` → timeout
- `err.message?.toLowerCase()` includes `'auth'` or `'authentication'` or `'login'` or `'credentials'` → auth failure
- Otherwise → cannot reach host (ECONNREFUSED, EHOSTUNREACH, ENOTFOUND, etc.)

### `POST /auth/login` — Real `onboardingComplete`

Line 189 of `src/server/routes/api-auth.ts` currently returns `onboardingComplete: true` hardcoded. This story updates it to query `user_secrets`:

```ts
// After db.insert(sessions).values({ ... }).run()
const secret = db.select({ keyName: userSecrets.keyName })
  .from(userSecrets)
  .where(and(eq(userSecrets.userId, user.id), eq(userSecrets.keyName, 'anthropic_api_key')))
  .get()
const onboardingComplete = !!secret
return c.json({ onboardingComplete })
```

Import `userSecrets` alongside `users`, `inviteKeys`, `sessions` at the top of `api-auth.ts`. Import `and` is already present.

### `email-fetch-service.ts` Port Update

The `ImapCredentials` interface currently omits `port`:

```ts
export interface ImapCredentials {
  host: string
  user: string
  pass: string
}
```

Add `port?: number` and update the `ImapFlow` constructor to use `credentials.port ?? 993`. This is a non-breaking change — all existing callers that don't pass port continue to use 993.

### `api-messages.ts` IMAP Credentials Migration

The env-var block in `POST /sync`:

```ts
const { IMAP_HOST, IMAP_USER, IMAP_PASS } = process.env
if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
  return c.json({ error: 'Email sync not configured (IMAP credentials missing)' }, 503)
}
```

Replace entirely with user_secrets query. Use `sql` template for the `IN` clause:

```ts
import { eq, desc, notLike, and, sql } from 'drizzle-orm'
import { userSecrets } from '../../db/schema'
import { decrypt } from '../lib/crypto'
```

The new 503 error message is `"Email sync not configured — add IMAP credentials in settings"` (different from the old env-var message — OK to change, string not relied on by tests).

### Security: Secret Handling

Per architecture invariant: secrets returned as presence flags ONLY. `GET /api/onboarding/status` must never include `ciphertext` columns in its response. Only query `keyName` column in the status endpoint.

All `decrypt()` calls inside `POST /api/messages/sync` must be wrapped in a `try/catch` — GCM auth tag validation throws on tampered data and will crash the handler without the catch.

### `sql` Import for IN Clause

If using `sql` for the IN clause in `api-messages.ts`, note that this is already imported from `drizzle-orm` in other files. Alternatively, use multiple `or(eq(...), eq(...), ...)` conditions — both are valid. The `sql` approach is simpler for 4 values.

Or use Drizzle's `inArray` helper:

```ts
import { inArray } from 'drizzle-orm'

const rows = db.select({ keyName: userSecrets.keyName, ciphertext: userSecrets.ciphertext })
  .from(userSecrets)
  .where(and(
    eq(userSecrets.userId, userId),
    inArray(userSecrets.keyName, ['imap_host', 'imap_port', 'imap_user', 'imap_pass']),
  ))
  .all()
```

`inArray` is available from `drizzle-orm` — preferred over raw `sql` template.

### `onConflictDoUpdate` Import

`onConflictDoUpdate` is already used by `api-ingest.ts` on the `jobs` table. The Drizzle API is `db.insert(table).values(...).onConflictDoUpdate({ target: [...], set: {...} }).run()`. No new imports needed — `db`, `insert`, `onConflictDoUpdate` come from the same `drizzle-orm` package.

### Route Mounting Order in `src/index.ts`

Add alongside existing routes (after `app.use('/api/*', authMiddleware)`):

```ts
import onboardingRoute from './server/routes/api-onboarding'
// ...
app.route('/api/onboarding', onboardingRoute)
```

Place it near `messagesRoute` and other API routes. The auth middleware protects it automatically.

### Test: Setting up `ENCRYPTION_KEY` for Tests

`encrypt()` reads `process.env.ENCRYPTION_KEY`. In tests, set it before importing:

```ts
process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64) // 32-byte hex = 64 hex chars
```

`'a'.repeat(64)` is valid hex (all lowercase 'a' = 0xAAAA...) and 64 characters = 32 bytes. This lets tests call `encrypt()` without a real key.

### Test: Corrupt Ciphertext for Decrypt Failure Test

To trigger a decrypt failure in `api-messages.test.ts`, insert a clearly invalid ciphertext (not in the `iv:ciphertext:authtag` format):

```ts
prodSqlite.run(`
  INSERT INTO user_secrets (user_id, key_name, ciphertext, updated_at)
  VALUES
    (1, 'imap_host', 'not-valid-ciphertext', '2026-04-30T00:00:00.000Z'),
    (1, 'imap_user', 'not-valid-ciphertext', '2026-04-30T00:00:00.000Z'),
    (1, 'imap_pass', 'not-valid-ciphertext', '2026-04-30T00:00:00.000Z')
`)
```

`decrypt('not-valid-ciphertext')` throws because it splits on `:` and gets 1 segment (expected 3). This tests the `500` error branch without a network call.

### Files NOT to Touch

- `src/server/middleware/auth-middleware.ts` — protects all `/api/*`; do not modify
- `src/db/schema.ts` — `user_secrets` table already exists; no schema changes needed
- `src/db/migrations/*` — no new migration needed; `user_secrets` was created in migration `0019_auth_schema.sql`
- Any other frontend files — this story is backend only

### Project Structure Notes

**New files:**
```
src/server/routes/api-onboarding.ts           ← GET /status, PUT /anthropic, PUT /imap
src/server/routes/api-onboarding.test.ts      ← status endpoint tests, input validation
```

**Modified files:**
```
src/index.ts                                  ← mount api-onboarding route
src/server/routes/api-auth.ts                 ← login: compute real onboardingComplete
src/server/routes/api-messages.ts             ← /sync: read from user_secrets instead of env
src/server/routes/api-messages.test.ts        ← add user_secrets setup + sync error tests
src/server/services/email-fetch-service.ts    ← add port?: number to ImapCredentials
```

**No new packages** — `imapflow` already installed; no new npm/bun deps needed.

### References

- Epic 25 spec: `_bmad-output/planning-artifacts/epics/epic-25-user-onboarding.md`
- Architecture distillate — `user_secrets` encryption invariant, per-user data isolation: `_bmad-output/planning-artifacts/architecture-distillate.md#encryption-at-rest`
- Story 24.1 — `encrypt()`/`decrypt()` module: `_bmad-output/implementation-artifacts/24-1-crypto-module-mailer-module-and-auth-db-schema.md`
- Story 24.3 — auth middleware, `ctx.get('userId')` pattern: `_bmad-output/implementation-artifacts/24-3-per-user-data-isolation-migration-auth-middleware-and-query-scoping.md`
- Story 24.4 — `POST /auth/login` response shape `{ onboardingComplete }`, line 189 hardcoded to `true`: `_bmad-output/implementation-artifacts/24-4-auth-ui-landing-page-registration-check-email-and-login.md`
- Current `src/server/services/email-fetch-service.ts` — `ImapFlow` connection pattern, `ImapCredentials` interface
- Current `src/server/services/analysis-service.ts` — Anthropic raw-fetch pattern and `AbortSignal.timeout` usage
- Current `src/server/routes/api-messages.ts` — `POST /sync` handler to be replaced
- Project context: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `api-onboarding.ts` with GET /status, PUT /anthropic, PUT /imap — all protected by existing authMiddleware
- `PUT /anthropic` uses raw fetch with AbortSignal.timeout(10000); error-maps 401→invalid key, >=500→server error, TimeoutError→timeout
- `PUT /imap` uses ImapFlow + Promise.race against a 10s timeout promise; connected flag tracks whether logout errors should propagate
- IMAP error classification: TimeoutError, auth keywords (auth/authentication/login/credentials), fallback→cannot reach host
- Used `inArray` helper in api-messages.ts /sync (cleaner than raw sql template)
- api-auth.ts login now queries user_secrets to compute real `onboardingComplete` instead of hardcoded `true`
- email-fetch-service.ts `ImapCredentials` interface now has `port?: number` (non-breaking: existing callers omit port → 993)
- api-auth.test.ts updated: added user_secrets DDL, added DELETE in beforeEach, updated login success test to expect `onboardingComplete: false`
- 283 tests pass, 0 failures across full test suite

### File List

- job-hunt-dashboard/src/server/routes/api-onboarding.ts (new)
- job-hunt-dashboard/src/server/routes/api-onboarding.test.ts (new)
- job-hunt-dashboard/src/index.ts (modified — mount onboarding route)
- job-hunt-dashboard/src/server/routes/api-auth.ts (modified — real onboardingComplete in login)
- job-hunt-dashboard/src/server/routes/api-messages.ts (modified — /sync reads from user_secrets)
- job-hunt-dashboard/src/server/routes/api-messages.test.ts (modified — user_secrets DDL + sync error tests)
- job-hunt-dashboard/src/server/routes/api-auth.test.ts (modified — user_secrets DDL + updated login assertion)
- job-hunt-dashboard/src/server/services/email-fetch-service.ts (modified — port?: number in ImapCredentials)

### Review Findings

- [x] [Review][Patch] `PUT /anthropic` — missing `res.ok` guard stores key on 402/403/429/other non-401 non-5xx responses [api-onboarding.ts:60-76]
- [x] [Review][Patch] Double `encrypt()` calls per upsert in `PUT /anthropic` and `PUT /imap` loop [api-onboarding.ts:68-74, 135-142]
- [x] [Review][Patch] Unused `and` import in `api-onboarding.ts` [api-onboarding.ts:3]
- [x] [Review][Patch] `Number(decrypt(port))` result not validated for NaN/out-of-range in `POST /sync` [api-messages.ts:50]
- [x] [Review][Patch] `.env.example` still lists `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` as active config after env-var removal [.env.example:5-8]
- [x] [Review][Defer] Dangling `setTimeout` after IMAP `connect()` resolves before 10s (spec-prescribed pattern) — deferred, pre-existing
- [x] [Review][Defer] IMAP TCP connection left open in background when timeout fires before connect completes — deferred, ImapFlow cleanup API uncertain, low practical impact
- [x] [Review][Defer] `hasImap` omits `imap_port` from presence check (benign — POST /sync defaults to 993) — deferred, pre-existing
- [x] [Review][Defer] IMAP `onConflictDoUpdate` loop not wrapped in a transaction (partial write on crash) — deferred, common pattern, rare failure path
- [x] [Review][Defer] SSRF via user-supplied IMAP `host` field — deferred, trusted-user design decision
- [x] [Review][Defer] Raw `fetchAndStoreEmails` error message exposed in 502 response body — deferred, pre-existing pattern
- [x] [Review][Defer] `console.error` call in POST /sync decrypt-failure path not asserted in tests — deferred, test coverage gap
- [x] [Review][Defer] No Anthropic API key format validation before outbound call — deferred, spec design choice
