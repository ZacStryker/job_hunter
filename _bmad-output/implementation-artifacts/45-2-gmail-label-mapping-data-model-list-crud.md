# Story 45.2: Gmail Label Mapping — Data Model, Label List & CRUD

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a job seeker,
I want to choose which of my Gmail labels map to which application statuses,
so that emails I have organised under specific labels are recorded against the right stage of my job search — the same way IMAP folder mapping works.

## Acceptance Criteria

1. **Data model (migration `0034`):** Given migration `0034`, when it runs (idempotently — re-runnable with no error), then a `gmail_label_mappings` table exists with columns `id` (INTEGER PK AUTOINCREMENT), `user_id` (INTEGER NOT NULL, FK → `users(id)`), `label` (TEXT NOT NULL), `job_status` (TEXT NOT NULL), `created_at` (TEXT NOT NULL), plus a `gmail_label_mappings_user_id_idx` index on `user_id` and a `UNIQUE(user_id, label)` index — mirroring `inbox_folder_mappings` exactly (the analog of `folder_path` is `label`).
2. **Live label list (connected):** Given a Gmail-connected user, when `GET /api/onboarding/gmail/labels` is called, then the response is a JSON array of the user's Gmail labels as `{ id, name }` objects, fetched live from the Gmail API using an access token obtained by refreshing the stored encrypted `gmail_refresh_token`.
3. **Label list (not connected / not configured):** Given a user who has NOT connected Gmail (no `gmail_refresh_token` row) OR Gmail is not configured at the env level, when `GET /api/onboarding/gmail/labels` is called, then the request fails with `503 { error }` (no `message` key) and performs no Gmail API call when unconfigured.
4. **Read mappings (per-user scoped):** Given an authenticated user, when `GET /api/config/gmail-mappings` is called, then only that user's `gmail_label_mappings` rows are returned as a JSON array (empty array if none) — never another user's rows.
5. **Replace mappings transactionally:** Given an authenticated user, when `PUT /api/config/gmail-mappings` is called with a JSON array of `{ label, jobStatus }` where each `jobStatus` ∈ `MESSAGE_TYPES`, then the user's mappings are replaced transactionally (delete-all-then-insert inside a single `db.transaction`, mirroring `PUT /api/config/inbox-mappings`) and the saved rows are returned as JSON.
6. **Validation:** Given a `PUT /api/config/gmail-mappings` with a malformed body, an empty `label`, or a `jobStatus` not in `MESSAGE_TYPES`, when it is received, then the request fails with `400 { error }` (no `message` key) and no rows are mutated.
7. **Disconnect clears mappings:** Given a user disconnects Gmail via `DELETE /api/onboarding/gmail`, when the disconnect completes, then in addition to clearing `gmail_refresh_token` + `gmail_address` (Story 45.1 behaviour, unchanged), that user's `gmail_label_mappings` rows are also deleted (additive extension; the same `db.transaction` or a sibling delete within the existing handler).

## Tasks / Subtasks

- [x] **Task 1 — Migration `0034` + schema table** (AC: 1)
  - [x] Add the `gmailLabelMappings` Drizzle table to `src/db/schema.ts` immediately after `inboxFolderMappings` (line ~167). Mirror it field-for-field, renaming `folderPath`/`folder_path` → `label`:
    ```ts
    export const gmailLabelMappings = sqliteTable('gmail_label_mappings', {
      id: integer('id').primaryKey({ autoIncrement: true }),
      userId: integer('user_id').notNull().references(() => users.id),
      label: text('label').notNull(),
      jobStatus: text('job_status').notNull(),
      createdAt: text('created_at').notNull(),
    }, (table) => [
      index('gmail_label_mappings_user_id_idx').on(table.userId),
      uniqueIndex('gmail_label_mappings_user_label_unique_idx').on(table.userId, table.label),
    ])
    ```
    (`index`, `uniqueIndex`, `sqliteTable`, `integer`, `text` are already imported in `schema.ts` — used by `inboxFolderMappings`.)
  - [x] Generate the migration: `bun run db:generate` (from `job-hunt-dashboard/`). This produces `src/db/migrations/0034_*.sql` AND updates `meta/_journal.json` + a new snapshot. **Do NOT hand-write the SQL file or the journal** — the journal-based `migrate()` runner (`src/db/migrate.ts:72`) requires the snapshot/journal to stay consistent with the generated file.
  - [x] Edit the generated `0034_*.sql` to make every statement idempotent (`CREATE TABLE IF NOT EXISTS …`, `CREATE INDEX IF NOT EXISTS …`, `CREATE UNIQUE INDEX IF NOT EXISTS …`) — match the exact style of `0028_inbox_folder_mappings.sql`. AC 1 requires idempotent re-runs.
  - [x] Commit both the `.sql` file and the regenerated `meta/` files.

- [x] **Task 2 — Shared Zod schema + type for mappings** (AC: 4, 5, 6)
  - [x] In `src/shared/schemas.ts`, directly after the `inboxFolderMapping*` block (lines 73–85), add the Gmail analog (mirror exactly, `folderPath` → `label`):
    ```ts
    export const gmailLabelMappingSchema = z.object({
      id: z.number().int(),
      userId: z.number().int(),
      label: z.string(),
      jobStatus: z.enum(MESSAGE_TYPES),
      createdAt: z.string(),
    })
    export const gmailLabelMappingInputSchema = z.array(z.object({
      label: z.string().min(1),
      jobStatus: z.enum(MESSAGE_TYPES),
    }))
    export type GmailLabelMapping = z.infer<typeof gmailLabelMappingSchema>
    export type GmailLabelMappingInput = z.infer<typeof gmailLabelMappingInputSchema>
    ```
  - [x] Reuse the existing `MESSAGE_TYPES` const (line 71) — do NOT redefine the status list.

- [x] **Task 3 — Access-token-from-refresh-token helper in `gmail-oauth.ts`** (AC: 2)
  - [x] Add `export async function getAccessToken(refreshToken: string): Promise<string>` to `src/server/lib/gmail-oauth.ts`. Implementation: `const client = getOAuthClient(); client.setCredentials({ refresh_token: refreshToken }); const { token } = await client.getAccessToken(); if (!token) throw new Error('Failed to obtain Gmail access token'); return token`.
  - [x] This is shared infrastructure (Story 45.3's sync will reuse it) — put it in `gmail-oauth.ts` beside `getOAuthClient`, not inline in the route. `getOAuthClient()` already throws `GmailNotConfiguredError` when env is missing, so the unconfigured path is covered.

- [x] **Task 4 — `GET /api/onboarding/gmail/labels`** in `src/server/routes/api-onboarding.ts` (AC: 2, 3)
  - [x] Add handler `app.get('/gmail/labels', async (c) => { … })` after the existing `/gmail/callback` handler (line ~246).
  - [x] If `!isGmailConfigured()` → `c.json({ error: 'Gmail not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' }, 503)` (mirror the `/gmail/connect` 503 exactly; no Gmail API call).
  - [x] Read the encrypted `gmail_refresh_token` row for `c.get('userId')` (same `db.select({ ciphertext }).from(userSecrets).where(and(eq(userId), eq(keyName, 'gmail_refresh_token'))).get()` pattern used by `DELETE /gmail`). If absent → `c.json({ error: 'Gmail not connected' }, 503)`.
  - [x] `const accessToken = await getAccessToken(decrypt(row.ciphertext))`.
  - [x] `fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', { headers: { Authorization: \`Bearer ${accessToken}\` } })`. On non-`ok` → `c.json({ error: 'Failed to fetch Gmail labels — reconnect Gmail and try again' }, 502)` (NFR6: expired/revoked refresh token surfaces an actionable error; mirrors IMAP's 502 style).
  - [x] Response JSON shape: `{ labels: [{ id, name, type }, …] }`. Map to `[{ id, name }]` and return the array directly: `c.json(labels.map((l) => ({ id: l.id, name: l.name })))`. (Optionally filter to `type === 'user'` to hide system labels — but the AC only requires id+name; returning all is acceptable. If filtering, keep `INBOX`/`SENT` etc. only if useful — default: return all, simplest.)
  - [x] NEVER log the access token, refresh token, or `Authorization` header (Story 45.1 secret-confidentiality rule, NFR).

- [x] **Task 5 — `gmail-mappings` CRUD route file** (AC: 4, 5, 6)
  - [x] Create `src/server/routes/api-config-gmail-mappings.ts` as a near-verbatim copy of `api-config-inbox-mappings.ts`, swapping the table (`inboxFolderMappings` → `gmailLabelMappings`), the input schema (`inboxFolderMappingInputSchema` → `gmailLabelMappingInputSchema`), and the insert field (`folderPath: row.folderPath` → `label: row.label`). Keep the identical structure: `GET '/'` returns scoped rows; `PUT '/'` parses JSON (400 on bad JSON), validates with the input schema (400 on failure), then `db.transaction((tx) => { tx.delete(...).where(eq(userId)).run(); for (row) tx.insert(...).values({ userId, label, jobStatus, createdAt: now }).run() })`, then re-selects and returns the saved rows.
  - [x] Use `c.get('userId')` for scoping (impersonation-aware, consistent with inbox-mappings).
  - [x] `export default app`.

- [x] **Task 6 — Register the route in `src/index.ts`** (AC: 4, 5)
  - [x] `import gmailMappingsRoute from './server/routes/api-config-gmail-mappings'` beside the inbox-mappings import (line 30).
  - [x] `app.route('/api/config/gmail-mappings', gmailMappingsRoute)` directly after the `inbox-mappings` mount (line 109). Order does not matter here (distinct path), but keep it adjacent for readability.

- [x] **Task 7 — Extend `DELETE /api/onboarding/gmail` to clear mappings** (AC: 7)
  - [x] In the existing `app.delete('/gmail', …)` handler (`api-onboarding.ts:248`), after revoking the token, add a delete of the user's `gmail_label_mappings` rows alongside the existing `user_secrets` delete. Import `gmailLabelMappings` from `../../db/schema`.
  - [x] Wrap the two deletes (`user_secrets` gmail keys + `gmail_label_mappings`) in a single `db.transaction((tx) => { … })` so disconnect is atomic, then `return c.json({ ok: true })`. (The revoke `fetch` stays OUTSIDE the transaction — it's a network call.)

- [x] **Task 8 — Tests** (AC: 1–7)
  - [x] **Extend `src/server/routes/api-onboarding.test.ts`** for `GET /gmail/labels` and the disconnect-clears-mappings behaviour:
    - [x] Add `gmail_label_mappings` DDL to `beforeAll` (raw SQL `CREATE TABLE IF NOT EXISTS gmail_label_mappings (...)` matching the migration) and `DELETE FROM gmail_label_mappings` to `beforeEach`.
    - [x] `GET /gmail/labels`: configured + connected → mock `OAuth2Client.prototype.getAccessToken` (returns `{ token: 'at' }`) and `globalThis.fetch` (returns `{ labels: [{ id: 'Label_1', name: 'Jobs', type: 'user' }] }`); assert 200 and body `[{ id: 'Label_1', name: 'Jobs' }]`. Connected but Gmail-list fetch fails (`ok: false`) → 502 `{ error }`. Not connected (no refresh-token row) → 503 `{ error }`. Not configured (unset `GOOGLE_CLIENT_ID`/`SECRET`) → 503 `{ error }`, and assert `getAccessToken`/`fetch` were NOT called.
    - [x] `DELETE /gmail`: seed a `gmail_label_mappings` row for user 1, then assert the row is gone after disconnect (in addition to the existing `gmail_*` secret-row assertions) and the response is `{ ok: true }`.
  - [x] **Create `src/server/routes/api-config-gmail-mappings.test.ts`** (mirror the HTTP-contract harness used in `api-onboarding.test.ts`: `process.env.DB_PATH = ':memory:'` + `ENCRYPTION_KEY` at the very top before imports; wrap the route in a test `Hono<AppEnv>` that sets `c.set('userId', 1)`; raw-SQL `CREATE TABLE gmail_label_mappings` in `beforeAll`; `DELETE FROM gmail_label_mappings` in `beforeEach`):
    - [x] `GET /` empty → `200 []`.
    - [x] `PUT /` with `[{ label: 'Jobs', jobStatus: 'Interview' }]` → 200, body is the saved row(s) with `id`, `userId: 1`, `label`, `jobStatus`, `createdAt`; then `GET /` returns the same.
    - [x] `PUT /` is a full replace: seed two rows via a first PUT, then PUT a single different row → only that one remains.
    - [x] `PUT /` per-user scoping: a row for userId 2 (insert via raw SQL) is untouched by user 1's PUT and absent from user 1's `GET /`.
    - [x] `PUT /` invalid `jobStatus` (e.g. `'Bogus'`) → 400 `{ error }`; malformed JSON → 400 `{ error }`; empty `label` → 400 `{ error }`. Assert no rows mutated.
    - [x] Every assertion checks BOTH the HTTP status AND that error bodies have `error` and NOT `message` (project testing rule).
  - [x] Run `bun test src/server/routes/api-onboarding.test.ts src/server/routes/api-config-gmail-mappings.test.ts` — all new tests pass. (The full suite has ~43 pre-existing unrelated failures + 5 obsolete LinkedIn tests noted in 45.1; do not treat those as regressions, but do NOT add to them.)

### Review Findings

_Code review 2026-06-15 (bmad-code-review, 3 layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). ACs 1, 2, 4, 5, 6, 7 met; AC3 partial (see patch 1)._

- [x] [Review][Patch] `GET /gmail/labels` returns a raw 500 instead of the intended actionable 502 when the refresh token is revoked/expired [job-hunt-dashboard/src/server/routes/api-onboarding.ts:~533] — FIXED 2026-06-15: wrapped the token-refresh + labels fetch in try/catch returning the 502 "reconnect" response; added test `connected but refresh token revoked (getAccessToken rejects) → 502`. — `const accessToken = await getAccessToken(decrypt(row.ciphertext))` is not wrapped in try/catch, unlike the `!res.ok` labels-fetch branch one line below (502). On a revoked/expired refresh token (the most common real failure) `getAccessToken` rejects; `decrypt()` also throws on corrupt ciphertext or a rotated `ENCRYPTION_KEY`. Both escape to the global `errorHandler` → `{ error: err.message }, 500`, bypassing the spec's 502 "reconnect Gmail and try again" intent (Task 4, Dev Notes line 121, NFR6) and echoing internal error text. The `getAccessToken`-rejects path has no test (the 502 test only mocks `res.ok === false`). Fix: wrap the token-refresh + fetch in try/catch returning `c.json({ error: 'Failed to fetch Gmail labels — reconnect Gmail and try again' }, 502)`, and add a test mocking `getAccessToken` rejecting. (blind+edge+auditor)
- [x] [Review][Patch] Duplicate labels in one `PUT /api/config/gmail-mappings` payload return a raw 500 instead of 400 [job-hunt-dashboard/src/server/routes/api-config-gmail-mappings.ts:16-22] — FIXED 2026-06-15: added a `.refine()` duplicate-label guard to `gmailLabelMappingInputSchema` (→ 400); added test `duplicate labels in one payload → 400`. (inbox-mappings still has the sibling gap — left as a future consistency pass.) — `gmailLabelMappingInputSchema` has no per-label uniqueness check, so `[{label:'Jobs',…},{label:'Jobs',…}]` violates `UNIQUE(user_id,label)`; the transaction catch returns the raw SQLite message with status 500 — a client input error surfaced as a server error. Transaction rolls back (no corruption). Fix: add a `.refine()` (or in-route dedupe check) rejecting duplicate labels with 400. NOTE: the same gap exists in the mirrored `api-config-inbox-mappings.ts`; consider fixing both for consistency. (edge)
- [x] [Review][Defer] Migration snapshot drift — `0034_snapshot.json` declares `jobs.date_archived`, but no migration `.sql` creates that column [job-hunt-dashboard/src/db/migrations/meta/0034_snapshot.json] — deferred, pre-existing. Runtime-safe (added on boot by `repairSchema`/`JOBS_NULLABLE_COLUMNS` in `migrate.ts`); root cause belongs to the separate `spec-add-date-archived-field.md`. Hazard is only future `db:generate` diff baselines.
- [x] [Review][Defer] OAuth `state` `nonce` is generated but never stored/verified — replayable within the 10-min `exp` window [job-hunt-dashboard/src/server/lib/gmail-oauth.ts:646-662] — deferred, pre-existing. This is Story 45.1's state/CSRF design, explicitly out of scope for 45.2; low impact (encrypted, bound to `uid`+`exp`, self-scoped).
- [x] [Review][Defer] No upper bound on the gmail-mappings PUT array length or `label` string length [job-hunt-dashboard/src/shared/schemas.ts:54-57] — deferred, pre-existing. Shared hardening gap with `inbox-mappings`; input is authenticated and self-scoped, so abuse only bloats the caller's own rows.

## Dev Notes

### This story mirrors the IMAP folder-mapping path — copy, do not invent
- The mapping data model, Zod schemas, CRUD route, and tests are a 1:1 analog of the IMAP equivalents with `folderPath`/`folder_path` renamed to `label`. The epic's explicit data-model decision: a **dedicated `gmail_label_mappings` table** (NOT reusing `inbox_folder_mappings`) so the IMAP `email-fetch-service` and the future `gmail-fetch-service` stay fully independent with no shared rows to disambiguate. [Source: epics.md:123, epics.md:185]
- Reference files to mirror:
  - Table: `src/db/schema.ts:158-167` (`inboxFolderMappings`)
  - Migration: `src/db/migrations/0028_inbox_folder_mappings.sql` (idempotent `IF NOT EXISTS` style)
  - Schemas: `src/shared/schemas.ts:71-85` (`MESSAGE_TYPES`, `inboxFolderMapping*`)
  - CRUD route: `src/server/routes/api-config-inbox-mappings.ts` (entire file — copy structure verbatim)
  - Mount: `src/index.ts:30,109`

### Migration mechanics — the one place to be careful
- The runner is drizzle's **journal-based** `migrate(db, { migrationsFolder })` (`src/db/migrate.ts:71-73`), driven by `meta/_journal.json` (latest entry is `idx: 33`, tag `0033_curly_punisher`). The next migration MUST be `0034`. **Generate it** with `bun run db:generate` so the journal + snapshot are updated atomically; then hand-edit only the `.sql` to add `IF NOT EXISTS` for idempotency. Hand-writing the SQL alone (without the journal/snapshot) means drizzle will not register or run it. [Source: src/db/migrate.ts, src/db/migrations/meta/_journal.json]
- Tests do NOT run the migration runner — they create tables via raw SQL DDL in `beforeAll` (project testing rule). So your test DDL must match the migration's columns/indexes by hand.

### Gmail Labels API + token refresh (the new part)
- **Access token from refresh token:** `google-auth-library`'s `OAuth2Client` — `client.setCredentials({ refresh_token })` then `await client.getAccessToken()` → `{ token }`. Google refreshes transparently using the stored refresh token (NFR6). Encapsulate in `gmail-oauth.ts` `getAccessToken(refreshToken)` so Story 45.3 reuses it.
- **Labels endpoint:** `GET https://gmail.googleapis.com/gmail/v1/users/me/labels` with `Authorization: Bearer <accessToken>` → `{ labels: [{ id, name, type, … }] }`. Direct `fetch` (consistent with the project's no-`googleapis`-meta-package decision from 45.1 and the Anthropic-key-test `fetch` style). Stays within the `gmail.readonly` scope already granted — no scope widening.
- **Error mapping:** unconfigured → 503; not-connected (no refresh-token row) → 503; refresh or labels fetch failure (revoked/expired token) → 502 with an actionable "reconnect" message (NFR6 parity with IMAP's 502/503 `{ error }` responses). Never leak tokens in the message or logs.

### Routing — two different mounts (don't conflate)
- **Labels** lives on the **onboarding** router (`GET /api/onboarding/gmail/labels`) beside the existing `/gmail/connect|callback` handlers — it needs the connected user's refresh token and pairs with the connection lifecycle. [Source: epics.md:188, api-onboarding.ts:181-268]
- **Mappings CRUD** lives on a **new `/api/config/gmail-mappings`** router, parallel to `/api/config/inbox-mappings` — it's config-surface data, not an onboarding action. [Source: epics.md:196-201]
- All `/api/*` routes pass through `authMiddleware` (session cookie + header-CSRF on mutating verbs). `PUT /api/config/gmail-mappings` is covered automatically — the SPA `apiFetch` attaches `x-csrf-token` (`src/client/lib/api.ts`). `GET` endpoints are exempt. No new middleware needed.

### Project conventions to honor (from project-context.md)
- **Error shape:** `{ error: string }` + HTTP status only — never `{ message }`, never an envelope. Validation 400s returned inline (as in the inbox-mappings `PUT`); other thrown errors hit the single `errorHandler`.
- **API JSON:** direct data on success (the rows array), no `{ success, data }` wrapper. Collections are always arrays. Booleans real `true`/`false`. Dates ISO 8601 (`new Date().toISOString()` for `createdAt`).
- **Cross-boundary types** only from `src/shared/schemas.ts` — `MESSAGE_TYPES`, `gmailLabelMapping*` defined there, never inline.
- **Multi-row writes** use `db.transaction((tx) => { … })` with `.run()` per statement (PUT replace; disconnect deletes).
- **Naming:** server files `kebab-case.ts` (`api-config-gmail-mappings.ts`); Drizzle table object `camelCase` (`gmailLabelMappings`); DB columns `snake_case`; route params `:id` only (n/a here).
- **No comments** unless non-obvious; no backwards-compat shims; no helpers for one-time ops; no speculative abstractions.
- **DB singleton:** import `db` from `src/db/client.ts`; never a second instance.

### Multi-user / data-isolation invariant (NFR5)
- This is a **live multi-user hosted platform**, not single-user localhost. Every query MUST be scoped by `userId`. `GET`/`PUT /gmail-mappings` filter on `c.get('userId')`; the `UNIQUE(user_id, label)` index permits the same label across different users. The labels endpoint reads only the calling user's refresh token. Never return or mutate another user's rows.

### Out of scope for THIS story (do not build ahead)
- `gmail-fetch-service.ts`, the `POST /api/messages/sync` Gmail branch, 30-day cutoff / dedup / writing `messages` rows → **Story 45.3**.
- Any UI: the label-dropdown mapping table, "Connect Gmail" Google button, connected badge, toasts, onboarding either/or → **Story 45.4**. This story is **server-only**: it ships the table, the live labels list, the mappings CRUD API, and the disconnect cleanup.

### Project Structure Notes
- **New files:** `src/db/migrations/0034_*.sql` (+ regenerated `meta/`), `src/server/routes/api-config-gmail-mappings.ts`, `src/server/routes/api-config-gmail-mappings.test.ts`.
- **Edited:** `src/db/schema.ts` (add `gmailLabelMappings`), `src/shared/schemas.ts` (add `gmailLabelMapping*`), `src/server/lib/gmail-oauth.ts` (add `getAccessToken`), `src/server/routes/api-onboarding.ts` (add `/gmail/labels`; extend `DELETE /gmail`), `src/server/routes/api-onboarding.test.ts` (labels + disconnect-mappings tests), `src/index.ts` (mount gmail-mappings route).
- No change to Story 45.1's connect/callback handlers, the `state` CSRF design, or `REQUIRED_ENV_VARS` (Gmail env stays optional-at-boot, NFR4).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 45.2 (lines 175-206)] — ACs, data-model decision, dependency order
- [Source: _bmad-output/planning-artifacts/epics.md:60-79] — NFR5 (per-user isolation), NFR6 (transparent token refresh / actionable errors), additional-requirements (labels endpoint, table decision)
- [Source: _bmad-output/implementation-artifacts/45-1-connect-and-disconnect-gmail-via-oauth.md] — prior story: OAuth helper, secret-upsert pattern, `DELETE /gmail` handler to extend, test harness with `sessionUserId`
- [Source: job-hunt-dashboard/src/server/routes/api-config-inbox-mappings.ts] — CRUD route to mirror verbatim
- [Source: job-hunt-dashboard/src/db/schema.ts:158-167] — `inboxFolderMappings` table to mirror
- [Source: job-hunt-dashboard/src/db/migrations/0028_inbox_folder_mappings.sql] — idempotent migration style
- [Source: job-hunt-dashboard/src/shared/schemas.ts:71-85] — `MESSAGE_TYPES` + `inboxFolderMapping*` schemas to mirror
- [Source: job-hunt-dashboard/src/server/lib/gmail-oauth.ts] — `getOAuthClient`/`GmailNotConfiguredError`; add `getAccessToken` here
- [Source: job-hunt-dashboard/src/server/routes/api-onboarding.ts:181-268] — gmail connect/callback/disconnect; add `/gmail/labels`, extend `DELETE /gmail`
- [Source: job-hunt-dashboard/src/db/migrate.ts:71-73] — journal-based migration runner
- [Source: job-hunt-dashboard/src/index.ts:30,108-109] — route imports + mounts
- [Source: job-hunt-dashboard/src/server/routes/api-onboarding.test.ts:1-38] — test harness (in-memory DB, mocked userId/sessionUserId, raw-SQL DDL)
- [Source: _bmad-output/project-context.md] — error shape, ISO dates, transactions, bun:test rules, naming, no-comment style

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, dev-story workflow)

### Debug Log References

- `bun test src/server/routes/api-config-gmail-mappings.test.ts` → 7 pass / 0 fail.
- `bun test src/server/routes/api-onboarding.test.ts src/server/routes/api-config-gmail-mappings.test.ts` → 42 pass / 5 fail. The 5 failures are the pre-existing obsolete `PUT /api/onboarding/linkedin` tests noted in 45.1 (route removed); confirmed identical on the committed baseline via `git stash`.
- Full suite: baseline (changes stashed) 371 pass / 45 fail → with this story 396 pass / 43–44 fail. No new regressions (failure count dropped; +25 passing tests). No failure references gmail/labels or gmail-mappings.
- `tsc --noEmit` clean for all touched/new files (pre-existing repo-wide TS errors are unrelated and unchanged).

### Completion Notes List

- **Migration scope correction (important):** `bun run db:generate` swept an out-of-scope `ALTER TABLE jobs ADD date_archived` into `0034` because `schema.ts` already carried a committed `dateArchived` field (commit 843df7d) whose drizzle snapshot had drifted. That field belongs to the separate `spec-add-date-archived-field.md`, which explicitly handles it via the `JOBS_NULLABLE_COLUMNS` repair pattern in `migrate.ts` — **"no new migration files needed."** I stripped the `ALTER TABLE jobs` statement from `0034_sleepy_maximus.sql` so the migration contains only the `gmail_label_mappings` table + indexes (made idempotent with `IF NOT EXISTS`, matching `0028`). The regenerated `0034_snapshot.json` correctly reflects `date_archived` (matching `schema.ts` truth), so future `db:generate` runs stay clean and produce no spurious diff.
- Migration generated via `bun run db:generate` (journal idx 34, tag `0034_sleepy_maximus`); only the `.sql` was hand-edited (idempotency), journal + snapshot left as generated.
- `getAccessToken` added to `gmail-oauth.ts` as shared infra for Story 45.3 reuse; relies on `getOAuthClient()` which already throws `GmailNotConfiguredError` when env is missing — so the unconfigured path on `/gmail/labels` short-circuits at the `isGmailConfigured()` guard before any token/fetch (verified by test asserting `getAccessToken`/`fetch` not called).
- `DELETE /gmail` now wraps the `user_secrets` delete + `gmail_label_mappings` delete in a single `db.transaction`; the revoke `fetch` stays outside the transaction.
- `/api/config/gmail-mappings` is a verbatim mirror of `api-config-inbox-mappings.ts` with `inboxFolderMappings → gmailLabelMappings`, `inboxFolderMappingInputSchema → gmailLabelMappingInputSchema`, `folderPath → label`. All scoping via `c.get('userId')`.
- All error responses use `{ error }` (no `message`), direct-array success bodies, ISO `createdAt` — per project-context.

### File List

**New files**
- `job-hunt-dashboard/src/db/migrations/0034_sleepy_maximus.sql`
- `job-hunt-dashboard/src/db/migrations/meta/0034_snapshot.json`
- `job-hunt-dashboard/src/server/routes/api-config-gmail-mappings.ts`
- `job-hunt-dashboard/src/server/routes/api-config-gmail-mappings.test.ts`

**Modified files**
- `job-hunt-dashboard/src/db/schema.ts` — add `gmailLabelMappings` table
- `job-hunt-dashboard/src/db/migrations/meta/_journal.json` — `0034` entry
- `job-hunt-dashboard/src/shared/schemas.ts` — add `gmailLabelMapping*` schemas + types
- `job-hunt-dashboard/src/server/lib/gmail-oauth.ts` — add `getAccessToken`
- `job-hunt-dashboard/src/server/routes/api-onboarding.ts` — add `GET /gmail/labels`; extend `DELETE /gmail` to clear mappings (transactional)
- `job-hunt-dashboard/src/server/routes/api-onboarding.test.ts` — `GET /gmail/labels` + disconnect-clears-mappings tests; gmail_label_mappings DDL/cleanup
- `job-hunt-dashboard/src/index.ts` — mount `/api/config/gmail-mappings`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status → review

### Change Log

| Date | Change |
|------|--------|
| 2026-06-15 | Implemented Story 45.2: `gmail_label_mappings` table + migration `0034`, shared Zod schemas, `getAccessToken` helper, `GET /api/onboarding/gmail/labels`, `/api/config/gmail-mappings` CRUD, disconnect-clears-mappings. Tests added (7 new CRUD + 5 onboarding). Status → review. |
