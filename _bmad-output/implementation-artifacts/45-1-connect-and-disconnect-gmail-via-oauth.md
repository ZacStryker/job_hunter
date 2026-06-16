# Story 45.1: Connect & Disconnect Gmail via OAuth 2.0

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a job seeker,
I want to link my Gmail account through Google's consent screen instead of entering a password,
so that HITLOBSTER can read my job-related emails securely without me sharing my Gmail credentials.

## Acceptance Criteria

1. **Connect-URL generation:** Given `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, when an authenticated user calls `GET /api/onboarding/gmail/connect`, then the server returns JSON `{ url }` containing a Google OAuth consent URL that requests ONLY the `gmail.readonly` scope, with `access_type=offline` and `prompt=consent` (to guarantee a refresh token), and an opaque CSRF `state` parameter bound to the user's session.
2. **Not-configured guard:** Given `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are NOT set, when any Gmail connect (and, when implemented in 45.2/45.3, labels/sync) action is attempted, then the request fails with `503 { error: "Gmail not configured — …" }`. Application startup is unaffected — these env vars are NEVER required at boot (unlike `PORT` / `DB_PATH`).
3. **Callback token exchange:** Given Google redirects the browser to `GET /api/onboarding/gmail/callback` with a valid `code` and `state`, when the `state` matches the session, then the server exchanges the code for tokens, obtains a refresh token, reads the connected account's email address (via Gmail `users.getProfile` — within `gmail.readonly`, NO extra scope), and stores `gmail_refresh_token` and `gmail_address` encrypted (via `encrypt()`) per-user in `user_secrets`, then redirects the browser back to the originating surface (onboarding or Config) with a success indication.
4. **CSRF rejection:** Given a callback with a missing or invalid `state`, when it is received, then no token exchange occurs and the request is rejected (403).
5. **Status reports hasGmail:** Given a connected user, when `GET /api/onboarding/status` is called, then the response includes `hasGmail: true`; all existing status fields are unchanged.
6. **Disconnect:** Given a connected user, when `DELETE /api/onboarding/gmail` is called, then the refresh token is revoked with Google on a best-effort basis, `gmail_refresh_token` and `gmail_address` are removed from `user_secrets`, and `hasGmail` returns to `false`.
7. **Secret confidentiality:** Given Gmail tokens at any point, when API responses are produced or logs are written, then no token value ever appears in a response body or log line.
8. **Operator runbook + .env.example:** Given the repository documentation and `.env.example`, when an operator sets up Gmail, then a runbook section documents the Testing-mode Google Cloud steps (enable Gmail API; configure OAuth consent screen with `gmail.readonly` scope + test users; create a Web-application OAuth Client ID with the `{APP_URL}/api/onboarding/gmail/callback` redirect URI plus a `http://localhost:3000/...` variant for dev; set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`), and `.env.example` lists both vars as optional (Gmail-only).

## Tasks / Subtasks

- [x] **Task 1 — Add `google-auth-library` dependency** (AC: 1, 3, 6)
  - [x] `bun add google-auth-library` in `job-hunt-dashboard/` (lighter than full `googleapis`; we only need the OAuth2 client — Gmail REST calls use direct `fetch`, matching the existing Anthropic-key-test style).
  - [x] Confirm it appears under `dependencies` in `package.json`.

- [x] **Task 2 — Shared Gmail OAuth helper** `src/server/lib/gmail-oauth.ts` (AC: 1, 2, 3, 4)
  - [x] `export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']` — single source of truth; reused by 45.2/45.3.
  - [x] `export function isGmailConfigured(): boolean` → `!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)`.
  - [x] `export function getOAuthClient(): OAuth2Client` → `new OAuth2Client({ clientId, clientSecret, redirectUri: `${process.env.APP_URL}/api/onboarding/gmail/callback` })`. Throw a typed/sentinel error if not configured (callers translate to 503).
  - [x] `encodeState(payload)` / `decodeState(raw)` using the existing `encrypt()` / `decrypt()` from `../lib/crypto`. Payload: `{ uid: number (sessionUserId), nonce: string (randomBytes hex), exp: number (Date.now()+10*60_000), ret: 'onboarding' | 'config' }`. `decodeState` returns `null` on any `decrypt` failure, malformed JSON, or `exp < Date.now()` (do NOT throw — invalid state must be a clean 403).

- [x] **Task 3 — `GET /api/onboarding/gmail/connect`** in `src/server/routes/api-onboarding.ts` (AC: 1, 2)
  - [x] If `!isGmailConfigured()` → `c.json({ error: 'Gmail not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' }, 503)`.
  - [x] Read optional `return` query (`onboarding` | `config`, default `config`) to remember the originating surface.
  - [x] Build `state = encodeState({ uid: c.get('sessionUserId'), nonce, exp, ret })` — bind to **`sessionUserId`** (the real logged-in session), not the possibly-impersonated `userId`.
  - [x] `url = getOAuthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GMAIL_SCOPES, state })`.
  - [x] Return `c.json({ url })`. (GET → no `x-csrf-token` header required; the SPA fetches this then sets `window.location`.)

- [x] **Task 4 — `GET /api/onboarding/gmail/callback`** in `src/server/routes/api-onboarding.ts` (AC: 3, 4, 7)
  - [x] Read `code`, `state`, and possible `error` query params. If Google returned `error` (e.g. user denied) → redirect to the originating surface with `?gmail=error` (no dead-end page).
  - [x] `const parsed = decodeState(state)`. If `parsed === null` OR `parsed.uid !== c.get('sessionUserId')` → `c.json({ error: 'Invalid state' }, 403)` and perform NO token exchange (AC 4).
  - [x] `const { tokens } = await getOAuthClient().getToken(code)`. If `tokens.refresh_token` is missing → redirect to surface with `?gmail=error` (re-consent needed; `prompt=consent` should prevent this).
  - [x] Fetch the connected address (stays within `gmail.readonly`): `fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${tokens.access_token}` } })` → `{ emailAddress }`. Do NOT request `userinfo.email`/`openid` — that would widen scope and violate AC 1 / NFR3.
  - [x] Upsert two `user_secrets` rows for `c.get('userId')` via the existing `encrypt()` + `onConflictDoUpdate` pattern: `gmail_refresh_token` = `encrypt(tokens.refresh_token)`, `gmail_address` = `encrypt(emailAddress)`.
  - [x] Redirect (302) to the surface path with success: `ret === 'onboarding'` → `/onboarding?gmail=connected`; else `/config/profile/inbox-mapping?gmail=connected`. (45.4 consumes the `?gmail=` flag for the toast.)
  - [x] NEVER log `code`, `state`, tokens, or `emailAddress` token values (AC 7).

- [x] **Task 5 — Extend `GET /api/onboarding/status`** (AC: 5)
  - [x] Add `const hasGmail = keys.has('gmail_refresh_token')` and include `hasGmail` in the returned JSON. Leave all existing fields (`hasAnthropicKey`, `hasImap`, `hasLinkedinAuth`, `hasIndeedAuth`, `onboardingComplete`) untouched.

- [x] **Task 6 — `DELETE /api/onboarding/gmail`** in `src/server/routes/api-onboarding.ts` (AC: 6, 7)
  - [x] Read the encrypted `gmail_refresh_token` row for `userId`; if present, `decrypt()` and call `getOAuthClient().revokeToken(refreshToken)` inside a `try/catch` that swallows failures (best-effort; log a non-token message only).
  - [x] `db.delete(userSecrets).where(and(eq(userSecrets.userId, userId), inArray(userSecrets.keyName, ['gmail_refresh_token', 'gmail_address'])))`.
  - [x] Return `c.json({ ok: true })`. (DELETE → authMiddleware requires the `x-csrf-token` header; the SPA `apiFetch` already attaches it.)
  - [x] Note: clearing `gmail_label_mappings` on disconnect is an additive extension delivered in Story 45.2 — do NOT create that table here.

- [x] **Task 7 — `.env.example` + operator runbook** (AC: 8)
  - [x] Add to `.env.example` (mark optional/Gmail-only): `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=` with a comment that they are required ONLY for Gmail sync and that the app boots fine without them.
  - [x] Add a "Gmail Inbox Integration (optional)" section to `DEPLOYMENT.md`: enable Gmail API; OAuth consent screen in **Testing** mode with the restricted `gmail.readonly` scope and manually-added test users (≤100); create a **Web application** OAuth Client ID with authorized redirect URIs `${APP_URL}/api/onboarding/gmail/callback` and `http://localhost:3000/api/onboarding/gmail/callback`; copy the Client ID/Secret into env. Note the production-verification + CASA assessment caveat is out of scope (Testing mode only).

- [x] **Task 8 — Tests** `src/server/routes/api-onboarding.test.ts` (extend existing file) (AC: 1–7)
  - [x] Follow the existing harness exactly: `process.env.DB_PATH = ':memory:'` + `ENCRYPTION_KEY = 'a'.repeat(64)` at the very top BEFORE imports; wrap the route in a test `Hono` that sets `c.set('userId', 1)` — and ALSO `c.set('sessionUserId', 1)` (new requirement for the state binding); raw-SQL `CREATE TABLE user_secrets` in `beforeAll`; `DELETE FROM user_secrets` in `beforeEach`.
  - [x] Set `process.env.GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`APP_URL` in tests where a configured path is exercised; unset (delete) them for the 503 case.
  - [x] `GET /gmail/connect`: configured → 200 with `{ url }` whose `scope` contains `gmail.readonly` and includes `access_type=offline`, `prompt=consent`, and a non-empty `state`. Not configured → 503 with `error` key (and NO `message` key).
  - [x] `GET /gmail/callback`: invalid/missing `state` → 403, no rows written. (Mock `getOAuthClient`/`getToken` and the profile `fetch` so the happy path can assert two encrypted rows are upserted and a 302 redirect with `?gmail=connected` is returned; assert stored ciphertext ≠ plaintext token.)
  - [x] `GET /status`: with a `gmail_refresh_token` row present → `hasGmail: true`; absent → `hasGmail: false`.
  - [x] `DELETE /gmail`: removes both `gmail_*` rows; returns `{ ok: true }`; tolerates revoke failure.
  - [x] Assert error responses carry `error` and NOT `message`, with correct status codes (project testing rule).

## Dev Notes

### This story mirrors the IMAP onboarding pattern — reuse, do not reinvent
- **Secret storage:** identical to the IMAP path in `src/server/routes/api-onboarding.ts:134-152` — `encrypt(value)` then `db.insert(userSecrets).values({ userId, keyName, ciphertext, updatedAt: now }).onConflictDoUpdate({ target: [userSecrets.userId, userSecrets.keyName], set: { ciphertext, updatedAt: now } })`. Use the SAME pattern; do not write a new secrets helper.
- **`user_secrets` schema** (`src/db/schema.ts:149`): composite PK `(user_id, key_name)`, columns `ciphertext`, `updated_at`. New keys this story adds: `gmail_refresh_token`, `gmail_address`. No migration needed — `user_secrets` is generic key/value (the new `gmail_label_mappings` table is Story 45.2, NOT here).
- **Crypto:** `encrypt()` / `decrypt()` from `src/server/lib/crypto.ts` (AES-256-GCM, format `iv:ciphertext:authTag`). Reuse as-is; do not add a new crypto scheme.
- **Status endpoint:** `GET /api/onboarding/status` (`api-onboarding.ts:12-25`) already derives boolean flags from the set of `keyName`s. Add `hasGmail` the same way (`keys.has('gmail_refresh_token')`).

### OAuth flow design (the new part)
- **Routes mount under** `app.route('/api/onboarding', onboardingRoute)` (`src/index.ts:108`). So add handlers `/gmail/connect`, `/gmail/callback`, and `DELETE /gmail` INSIDE the exported `onboardingRoute` Hono instance — no new file/registration needed. (The existing LinkedIn/Indeed browser sub-routes mount at more specific paths BEFORE this line; `/gmail/*` does not collide.)
- **Auth + the callback:** all `/api/*` routes pass through `authMiddleware` (`src/server/middleware/auth-middleware.ts`), which requires the `session` cookie. The session cookie is **`SameSite=Lax`** (`src/server/routes/api-auth.ts:136-137`), so Google's **top-level GET redirect** to the callback DOES carry it — the callback is authenticated and `c.get('userId')` / `c.get('sessionUserId')` are populated. This is exactly why the connect flow must be a full-page redirect (per epic scope decision), not an embedded webview.
- **CSRF — two distinct mechanisms, don't conflate them:**
  1. authMiddleware's header CSRF (`x-csrf-token` cookie==header) applies to `POST/PUT/PATCH/DELETE` only. `GET /gmail/connect` and `GET /gmail/callback` are GETs → exempt. `DELETE /gmail` is covered automatically (SPA `apiFetch` attaches the header — `src/client/lib/api.ts:9-12`).
  2. The OAuth `state` param is OUR app's CSRF defense for the callback (a GET that header-CSRF can't cover). Encrypt `{ uid: sessionUserId, nonce, exp, ret }` with `encrypt()`; on callback `decrypt`, check `exp` and `uid === c.get('sessionUserId')`. This makes a forged/replayed callback for a victim's session impossible. Use **`sessionUserId`** for binding (not impersonation `userId`).

### Library & API specifics (prevent wrong choices)
- **Use `google-auth-library`** (`OAuth2Client`), NOT the full `googleapis` meta-package — minimal footprint, consistent with the project's "no speculative abstractions" rule. Key calls: `generateAuthUrl({ access_type, prompt, scope, state })`, `getToken(code)` → `{ tokens: { refresh_token, access_token } }`, `revokeToken(refreshToken)`.
- **Reading the connected email address WITHOUT widening scope:** call Gmail `GET https://gmail.googleapis.com/gmail/v1/users/me/profile` with `Authorization: Bearer <access_token>` → `{ emailAddress }`. `getProfile` is covered by `gmail.readonly`. Do NOT add `userinfo.email`/`openid`/`profile` scopes — AC 1, FR10, and NFR3 require `gmail.readonly` ONLY.
- **`redirect_uri` must match Google Cloud config exactly:** `${APP_URL}/api/onboarding/gmail/callback`. `APP_URL` is already a required boot env var (`src/index.ts` `REQUIRED_ENV_VARS`); dev default `http://localhost:3000`.
- **Refresh token guarantee:** Google only returns a refresh token on the FIRST consent unless `prompt=consent` is set. Always send `access_type=offline` + `prompt=consent`.

### Boot-safety (NFR4) — critical
- Do NOT add `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to `REQUIRED_ENV_VARS` in `src/index.ts` (lines ~76-94). They must remain optional; absence yields a 503 only when a Gmail action is attempted (`isGmailConfigured()` gate), never a boot failure.

### Project conventions to honor (from project-context.md)
- Error responses: `{ error: string }` + status only — never `{ message }` or an envelope. Validation 400s returned inline; everything else can throw to the single `errorHandler`.
- Dates: ISO 8601 strings (`new Date().toISOString()`) for `updatedAt`.
- Server files are `kebab-case.ts`; route params `:id` only (n/a here).
- No comments unless non-obvious; no backwards-compat shims; no helpers for one-time ops.
- Booleans in JSON are real `true`/`false` (`hasGmail`).

### Out of scope for THIS story (do not build ahead)
- `gmail_label_mappings` table + migration `0034`, label-list endpoint, mapping CRUD → **Story 45.2**.
- `gmail-fetch-service`, `POST /api/messages/sync` Gmail branching → **Story 45.3**.
- Any UI (buttons, badges, toasts, onboarding either/or) → **Story 45.4**. This story is server-only; it just produces the `{ url }` to redirect to and the `?gmail=connected|error` return flag.

### Project Structure Notes
- New file: `src/server/lib/gmail-oauth.ts` (OAuth client factory + scopes + state encode/decode). Lives in `lib/` beside `crypto.ts`.
- Edited: `src/server/routes/api-onboarding.ts` (3 new handlers + `hasGmail` in status), `src/server/routes/api-onboarding.test.ts`, `.env.example`, `DEPLOYMENT.md`, `package.json`.
- No `src/index.ts` route-registration change (handlers nest under the existing `/api/onboarding` mount).
- No schema/migration change in this story.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 45.1] — acceptance criteria, FR1–FR3/FR8–FR10, NFR1–NFR8, scope decisions
- [Source: src/server/routes/api-onboarding.ts:12-25,134-177] — status flags + IMAP secret-upsert pattern to mirror
- [Source: src/server/lib/crypto.ts] — `encrypt()` / `decrypt()` (AES-256-GCM)
- [Source: src/db/schema.ts:149] — `user_secrets` composite-PK key/value table
- [Source: src/server/middleware/auth-middleware.ts] — session cookie auth + header-CSRF; sets `userId` & `sessionUserId`
- [Source: src/server/routes/api-auth.ts:136-142] — `session` cookie is `SameSite=Lax`, `csrf_token` readable by JS
- [Source: src/index.ts:76-112] — `REQUIRED_ENV_VARS` (keep Gmail vars OUT), onboarding route mount
- [Source: src/client/lib/router.ts:112,225] — client route paths `/onboarding` and `/config/profile/inbox-mapping` (redirect targets)
- [Source: src/server/routes/api-onboarding.test.ts:1-40] — test harness pattern (in-memory DB, mocked `userId`, raw-SQL DDL)
- [Source: _bmad-output/project-context.md] — error shape, ISO dates, bun:test rules, no-comment style

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- `bun test src/server/routes/api-onboarding.test.ts` — 30 pass / 5 fail. All 17 new Gmail tests pass; the 5 failures are pre-existing and unrelated (obsolete `PUT /api/onboarding/linkedin` tests for a route removed in a prior LinkedIn-browser refactor — they failed identically before any change in this story).
- `bunx tsc --noEmit` — changed files (`gmail-oauth.ts`, `api-onboarding.ts`, `api-onboarding.test.ts`) are type-clean. The repo has a pre-existing backlog of ~84 `tsc` errors in unrelated files; the project gates on `bun:test`, not `tsc`.
- `bun test` (full suite) — 384 pass / 43 fail. All 43 failures are pre-existing in unrelated areas (discovery, jobs upsert/ingest, resume embeddings, scraper, analysis, cover-letter) plus the 5 obsolete LinkedIn tests. No regression introduced by this story.

### Completion Notes List

- Added `google-auth-library@^10.7.0` (OAuth2 client only); Gmail REST `getProfile` is a direct `fetch`, matching the existing Anthropic-key-test style.
- New `src/server/lib/gmail-oauth.ts`: `GMAIL_SCOPES` (single source of truth, `gmail.readonly` only), `isGmailConfigured()`, `getOAuthClient()` (throws `GmailNotConfiguredError` sentinel when unconfigured), and `encodeState()`/`decodeState()` built on the existing AES-256-GCM `encrypt()`/`decrypt()`. `decodeState` returns `null` (never throws) on decrypt failure, malformed JSON, bad shape, or expiry — so an invalid callback is a clean 403.
- `GET /api/onboarding/gmail/connect`: 503 when unconfigured (`{ error }`, no `message`); otherwise returns `{ url }` with `access_type=offline`, `prompt=consent`, `gmail.readonly` scope, and a CSRF `state` bound to `sessionUserId` (not the impersonation `userId`).
- `GET /api/onboarding/gmail/callback`: validates `state` (`decodeState` + `uid === sessionUserId`) before any token exchange (403 on failure); exchanges code, reads the connected address via Gmail `users/me/profile` (no extra scope), encrypts and upserts `gmail_refresh_token` + `gmail_address` into `user_secrets`, then 302-redirects to the originating surface with `?gmail=connected`. User-denied / missing-refresh-token / profile-fetch errors redirect with `?gmail=error`. No tokens/code/state/address logged.
- `GET /api/onboarding/status`: added `hasGmail` (`keys.has('gmail_refresh_token')`); all existing flags untouched.
- `DELETE /api/onboarding/gmail`: best-effort `revokeToken` (failures swallowed, non-token log line only) then deletes both `gmail_*` rows; returns `{ ok: true }`.
- Boot-safety honored: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are NOT added to `REQUIRED_ENV_VARS`; absence yields 503 only on a Gmail action.
- `.env.example` + `DEPLOYMENT.md` document the optional vars and the Google Cloud Testing-mode runbook (Gmail API enable, restricted-scope consent screen + test users, Web OAuth client with prod + `localhost:3000` redirect URIs).
- Test harness updated to also set `c.set('sessionUserId', 1)` and typed with `Hono<AppEnv>`; network boundaries mocked at `OAuth2Client.prototype.getToken/revokeToken` and `globalThis.fetch` so `getOAuthClient`/`generateAuthUrl`/state-crypto run for real.

### File List

- `job-hunt-dashboard/package.json` (modified — added `google-auth-library` dependency)
- `job-hunt-dashboard/bun.lock` (modified — lockfile)
- `job-hunt-dashboard/src/server/lib/gmail-oauth.ts` (new)
- `job-hunt-dashboard/src/server/routes/api-onboarding.ts` (modified — `hasGmail`, connect/callback/disconnect handlers)
- `job-hunt-dashboard/src/server/routes/api-onboarding.test.ts` (modified — Gmail test suites, harness `sessionUserId` + typing)
- `job-hunt-dashboard/.env.example` (modified — optional Gmail vars)
- `job-hunt-dashboard/DEPLOYMENT.md` (modified — Gmail Inbox Integration runbook)

## Change Log

| Date       | Change                                                                 |
|------------|------------------------------------------------------------------------|
| 2026-06-15 | Implemented Story 45.1 — Gmail connect/callback/disconnect via OAuth 2.0, `hasGmail` status flag, env + runbook docs, tests. Status → review. |

## Review Findings

Code review 2026-06-15 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Acceptance Auditor: all 8 ACs fully met. Findings below are robustness/security hardening, not AC violations.

### Decision Needed (resolved 2026-06-15)

- [x] [Review][Decision] OAuth `state` nonce is never validated — **RESOLVED: accept.** The CSRF/forgery protection is the encrypted, session-bound `state` (`uid === sessionUserId` + server-key AES-GCM), which holds in the multitenant hosted model. The nonce is defense-in-depth against `state` leakage, but a replay still requires the victim's live session cookie, so the gap is not exploitable. User accepted as-is; a server-side single-use nonce store is deliberately out of scope. [src/server/lib/gmail-oauth.ts:460]

### Patch

- [x] [Review][Patch] Callback failure paths throw raw 500 instead of redirecting — **FIXED:** wrapped the exchange→profile→store block in try/catch redirecting to `?gmail=error`, and guard a missing `emailAddress`. [src/server/routes/api-onboarding.ts:207-243]
- [x] [Review][Patch] Two-secret upsert is non-atomic — **FIXED:** both upserts now run inside a single `db.transaction((tx) => …)`. [src/server/routes/api-onboarding.ts:226-237]
- [x] [Review][Patch] Test "invalid/garbage state → 403" doesn't prove "no token exchange" — **FIXED:** test now `mockClear()`s and asserts `expect(getTokenSpy).not.toHaveBeenCalled()`. [src/server/routes/api-onboarding.test.ts:387]
- [x] [Review][Patch] Callback returns raw `401` JSON when the session cookie is absent mid-flow — **FIXED (was decision D2):** `authMiddleware` now special-cases `/api/onboarding/gmail/callback`, redirecting to `/config/profile/inbox-mapping?gmail=error` on auth failure instead of returning 401 JSON; the session-bound model is untouched on the happy path. [src/server/middleware/auth-middleware.ts:8-19]

### Deferred

- [x] [Review][Defer] Concurrent disconnect/connect race in `DELETE /gmail` — read→`revokeToken`(await)→delete is not atomic; a callback completing in the await window can re-upsert rows the delete then removes. Low impact on single-user localhost; more relevant after the multi-user expansion. [src/server/routes/api-onboarding.ts:388-407] — deferred, low impact pre multi-user

### Dismissed (noise / false positive / by-design)

- `sessionUserId` (state binding) vs `userId` (storage) "mismatch" — by design per Dev Notes: CSRF binds the real session; storage is impersonation-aware.
- `decodeState` doesn't validate `ret` (open-redirect concern) — `ret` is whitelisted to two constant paths via ternary; no open redirect possible.
- `hasGmail` status test row bleed — global `beforeEach` (test line 36) truncates `user_secrets`; handled.
- `APP_URL` unset → `redirect_uri_mismatch` — `APP_URL` ∈ `REQUIRED_ENV_VARS` (src/index.ts:77); the app cannot boot without it.
