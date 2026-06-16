# Story 45.3: Gmail Sync into the Messages View

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a job seeker,
I want syncing my inbox to pull labelled Gmail emails into my Messages view,
so that my Gmail-connected account behaves exactly like an IMAP-connected one when I track applications.

## Acceptance Criteria

1. **Gmail fetch service (per mapped label, 30-day cutoff):** Given a Gmail-connected user with `gmail_label_mappings` rows, when `POST /api/messages/sync` runs and Gmail is the connected provider, then a new `gmail-fetch-service` obtains an access token by refreshing the stored encrypted `gmail_refresh_token`, and for each mapped label lists that label's messages with a 30-day recency cutoff via the Gmail query `newer_than:30d`.
2. **Message persistence into the existing `messages` table:** Given a fetched Gmail message, when it is stored, then its From (`Name <address>` form), Subject, received date (ISO 8601 `received_at`), and RFC 2822 Message-ID are written into the existing `messages` table with `type` set to the label's mapped job status and `userId` set. No new column or table is added.
3. **Dedup + type-fill parity with IMAP:** Given a message already stored (matched by its Gmail-message-id-derived `uid` `gmail:<gmailMessageId>` OR by its `Message-ID`), when sync runs again, then it is NOT duplicated; and a message newly seen under a mapped label updates `type` ONLY if the existing row's `type` was previously `null` — identical to `fetchAndStoreEmails`' in-place update branch.
4. **Blocked-sender filtering:** Given a message whose From matches a `BLOCKED_SENDERS` address, when sync runs, then it is filtered out (same list and `.includes()` behaviour as the IMAP path) and is neither inserted nor counted in `added`.
5. **Provider branching + result shape:** Given the sync endpoint, when it is called, then it uses the Gmail path if Gmail is connected (a `gmail_refresh_token` row exists), otherwise the existing IMAP path if IMAP is configured, otherwise returns `503 { error }` (no `message` key); and on success it returns `{ added: n }` exactly like the IMAP path.
6. **Expired/revoked token → actionable error, no token logged:** Given an expired or revoked Gmail refresh token (or Gmail env unconfigured while a token row exists), when sync runs, then it returns a clear, actionable `5xx { error }` prompting the user to reconnect, and NO token/access-token/refresh-token value is ever written to a log line or response body.
7. **Messages-view parity:** Given Gmail messages have been synced, when the user views `GET /api/messages` and edits one via `PATCH /api/messages/:id`, then they appear and behave identically to IMAP-sourced messages (company / jobTitle / type editable; `BLOCKED_SENDERS` `notLike` filter applies). No change to `GET /api/messages` or `PATCH /api/messages/:id` is required.

## Tasks / Subtasks

- [x] **Task 1 — New `gmail-fetch-service.ts`** `src/server/services/gmail-fetch-service.ts` (AC: 1, 2, 3, 4)
  - [x] Export `async function fetchAndStoreGmail(refreshToken: string, userId: number): Promise<{ added: number }>` — the Gmail analog of `fetchAndStoreEmails`. Mirror its dedup/type-fill structure exactly; only the message source (Gmail REST vs IMAP) differs.
  - [x] Reuse the SAME `BLOCKED_SENDERS` constant. Define it once and share it: export `BLOCKED_SENDERS` from `email-fetch-service.ts` and import it here (do NOT duplicate the literal array — single source of truth). The `GET /api/messages` route's two `notLike` filters already hard-code the same two addresses; leave those untouched (out of scope), but the fetch-side filter must come from the shared constant.
  - [x] `const accessToken = await getAccessToken(refreshToken)` (import from `../lib/gmail-oauth` — added in 45.2). Any throw here (revoked/expired refresh token, or `GmailNotConfiguredError`) must propagate to the route, which maps it to the actionable 5xx (AC 6). Do NOT catch-and-swallow inside the service.
  - [x] Load the user's mappings: `db.select({ label: gmailLabelMappings.label, type: gmailLabelMappings.jobStatus }).from(gmailLabelMappings).where(eq(gmailLabelMappings.userId, userId)).all()`. If empty → return `{ added: 0 }` (no Gmail calls needed).
  - [x] Resolve label NAME → Gmail label ID once per sync: `GET https://gmail.googleapis.com/gmail/v1/users/me/labels` → `{ labels: [{ id, name }] }`; build a `Map<name, id>`. For each mapping whose `label` (name) is absent from the map, SKIP it (parity with IMAP's "folder doesn't exist on this account → skip"). See Dev Notes "Label name→id contract" — `gmail_label_mappings.label` stores the label NAME.
  - [x] Build the dedup sets BEFORE fetching (mirror `fetchAndStoreEmails:23-34`): `existingUids = Set(messages.uid where userId)`, and `existingByMessageId = Map(messageId → { id, type })` over rows where `messageId !== null`.
  - [x] For each resolved label id: page through `GET https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=<id>&q=newer_than:30d` following `nextPageToken` until exhausted, collecting `{ id }` message stubs. Each list page returns `{ messages?: [{ id, threadId }], nextPageToken? }` (note: `messages` is absent when a label has zero matches — guard with `?? []`).
  - [x] For each message stub: compute `uid = \`gmail:${stub.id}\``. If `existingUids.has(uid)` → skip WITHOUT fetching detail (efficiency; also prevents re-counting a message that appears under multiple mapped labels in the same run). Otherwise fetch metadata: `GET https://gmail.googleapis.com/gmail/v1/users/me/messages/<stub.id>?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID` → `{ internalDate, payload: { headers: [{ name, value }] } }`.
  - [x] Extract headers case-insensitively (`h.name.toLowerCase() === 'from' | 'subject' | 'message-id'`). `fromAddress = From header value ?? ''` (Gmail already returns the `Name <address>` RFC form — do NOT re-derive it). `subject = Subject header value ?? ''`. `msgId = Message-ID header value ?? null` (keep the raw value, brackets included, as the stable cross-folder key). `receivedAt = new Date(Number(internalDate)).toISOString()` (`internalDate` is epoch-ms as a string — most reliable received timestamp; fall back to `new Date().toISOString()` if absent).
  - [x] `if (BLOCKED_SENDERS.some((s) => fromAddress.includes(s))) continue` (AC 4 — before any insert/update/count).
  - [x] Apply the IDENTICAL dedup/type-fill branch as IMAP (`fetchAndStoreEmails:78-97`):
    - If `msgId !== null && existingByMessageId.has(msgId)` → in-place update of the existing row: always set `uid = uidStr`; set `type = label.type` ONLY if the existing row's `type === null`; `existingUids.add(uidStr)`; `continue` (do NOT increment `added`).
    - Else if `existingUids.has(uid)` → `continue`.
    - Else `db.insert(messages).values({ uid, messageId: msgId, receivedAt, fromAddress, subject, type: label.type, userId }).onConflictDoNothing().run()`; if `msgId !== null` seed `existingByMessageId.set(msgId, { id: 0, type: label.type })`; `existingUids.add(uid)`; `added++`.
  - [x] Return `{ added }`. NEVER `console.*` the access token, refresh token, `Authorization` header, or full message bodies (AC 6; NFR2).

- [x] **Task 2 — Branch `POST /api/messages/sync` to the Gmail path** `src/server/routes/api-messages.ts` (AC: 5, 6)
  - [x] At the TOP of the existing `app.post('/sync', …)` handler, BEFORE the IMAP secret lookup, read the Gmail refresh-token row: `const gmailRow = db.select({ ciphertext: userSecrets.ciphertext }).from(userSecrets).where(and(eq(userSecrets.userId, userId), eq(userSecrets.keyName, 'gmail_refresh_token'))).get()`.
  - [x] If `gmailRow` exists → take the Gmail branch (Gmail wins when connected, per AC 5 ordering):
    - `let refreshToken: string; try { refreshToken = decrypt(gmailRow.ciphertext) } catch (err) { console.error('[messages/sync] Failed to decrypt Gmail refresh token'); return c.json({ error: 'Failed to read Gmail credentials' }, 500) }` — log NO token/err detail that could echo ciphertext.
    - `try { const result = await fetchAndStoreGmail(refreshToken, userId); return c.json({ added: result.added }) } catch (err) { console.error('[messages/sync] Gmail sync failed:', err instanceof Error ? err.message : 'unknown'); return c.json({ error: 'Gmail sync failed — reconnect Gmail and try again' }, 502) }`. (google-auth-library / fetch errors do not contain the token; the static 502 message satisfies NFR6.)
  - [x] If no `gmailRow` → fall through to the EXISTING IMAP block unchanged (secret lookup, decrypt, `fetchAndStoreEmails`, 503-if-unconfigured). The existing `503 { error: 'Email sync not configured — …' }` remains the neither-connected response (AC 5).
  - [x] Add imports: `fetchAndStoreGmail` from `../services/gmail-fetch-service`. (`userSecrets`, `decrypt`, `and`, `eq`, `inArray` are already imported.)

- [x] **Task 3 — Tests** (AC: 1–7)
  - [x] **Extend `src/server/routes/api-messages.test.ts`** (HTTP-contract layer — preferred; the service hits the network, so drive it through the real `/sync` handler with mocked boundaries):
    - [x] Add `gmail_label_mappings` raw-SQL DDL to `beforeAll` (`CREATE TABLE IF NOT EXISTS gmail_label_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, label TEXT NOT NULL, job_status TEXT NOT NULL, created_at TEXT NOT NULL)`) and add `message_id` + `gmail_label_mappings` cleanup. NOTE: the existing `CREATE_MESSAGES_TABLE` in this file is MISSING the `message_id` column the real schema has — add `message_id TEXT UNIQUE` to that DDL so the Gmail dedup-by-Message-ID branch can be exercised. Add `DELETE FROM gmail_label_mappings` to `beforeEach`.
    - [x] Set `process.env.GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`APP_URL` at the top (after the `DB_PATH`/`ENCRYPTION_KEY` lines, before imports) so `getOAuthClient()` constructs. Mock `OAuth2Client.prototype.getAccessToken` to resolve `{ token: 'test-access-token' }` for happy paths.
    - [x] Mock `globalThis.fetch` with URL-based branching: `…/labels` → `{ labels: [{ id: 'Label_1', name: 'Jobs' }] }`; `…/messages?labelIds=Label_1…` → `{ messages: [{ id: 'm1' }] }` (no `nextPageToken`); `…/messages/m1?…` → `{ internalDate: '1718409600000', payload: { headers: [{ name: 'From', value: 'Acme HR <hr@acme.com>' }, { name: 'Subject', value: 'Application received' }, { name: 'Message-ID', value: '<abc@acme.com>' }] } }`. Restore `globalThis.fetch` in `afterEach`/`afterAll` so other suites are unaffected.
    - [x] **Happy path:** seed a `gmail_refresh_token` user_secret (real `encrypt('refresh-token')`) + a `gmail_label_mappings` row `{ label: 'Jobs', job_status: 'Submitted' }`; `POST /sync` → 200 `{ added: 1 }`; assert a `messages` row exists with `uid: 'gmail:m1'`, `type: 'Submitted'`, `from_address: 'Acme HR <hr@acme.com>'`, `message_id: '<abc@acme.com>'`, `received_at` an ISO string.
    - [x] **Dedup (no double-insert):** run `POST /sync` twice with the same mocks → second call returns `{ added: 0 }` and the `messages` count stays 1.
    - [x] **Type-fill only when null:** pre-insert a row with `uid='gmail:m1'`... actually seed by Message-ID with `type=NULL` and a DIFFERENT `uid` (e.g. `uid='old', message_id='<abc@acme.com>', type=NULL`); after sync assert the row's `type` became `'Submitted'` and `uid` updated to `'gmail:m1'`, `added: 0`. Then a second run with the same row but `type='Rejected'` pre-set must NOT overwrite to `'Submitted'`.
    - [x] **Blocked sender filtered:** point the `messages/m1` mock From at `indeedapply@indeed.com` → `POST /sync` → `{ added: 0 }`, no row inserted.
    - [x] **Provider branching:** with a `gmail_refresh_token` row present AND IMAP creds also present, assert the Gmail path runs (the `…/labels` fetch is called, `fetchAndStoreEmails`/IMAP is not). With NEITHER gmail nor imap secrets → existing `503 { error }` (no `message` key) still holds.
    - [x] **Revoked/expired token → 502:** make `OAuth2Client.prototype.getAccessToken` reject → `POST /sync` → `502 { error }` containing "reconnect", `message` key absent, and assert NO token string appears in the body.
    - [x] Every assertion checks BOTH HTTP status AND that error bodies carry `error` and NOT `message` (project testing rule).
  - [x] **Optional business-logic layer:** a direct `fetchAndStoreGmail` unit test is acceptable but redundant given the contract tests above mock the same boundaries; prefer NOT to add a second harness unless a branch is unreachable via HTTP.
  - [x] Run `bun test src/server/routes/api-messages.test.ts` — all new + existing tests pass. (Full suite carries ~43 pre-existing unrelated failures + 5 obsolete LinkedIn tests noted in 45.1/45.2 — do not treat as regressions, do not add to them.)

## Dev Notes

### This story mirrors the IMAP sync path — copy structure, swap the source
The dedup/type-fill state machine is the crown jewel of `fetchAndStoreEmails` (`src/server/services/email-fetch-service.ts:14-113`). Reproduce it EXACTLY in `gmail-fetch-service.ts`; the only differences are:
- **Source:** Gmail REST (`fetch` + `getAccessToken`) instead of `ImapFlow`.
- **Folder → label:** iterate `gmail_label_mappings` instead of `inbox_folder_mappings`; resolve label name→id; query `messages.list` instead of `client.search`/`client.fetch`.
- **uid scheme:** `gmail:<gmailMessageId>` (the IMAP path uses `folder:uid`). Same `messages.uid` column, same dedup semantics.
Everything else — `BLOCKED_SENDERS` filter, the `existingByMessageId` in-place update, `type` set only when `null`, `onConflictDoNothing`, `added` counting — is identical.

### Label name→id contract (the one design decision to pin)
`gmail_label_mappings.label` (Story 45.2) stores the Gmail label **NAME** (mirrors IMAP `inbox_folder_mappings.folderPath`, which is a human path; 45.2's test fixtures use `'Jobs'`). Story 45.4's label dropdown MUST therefore store the label **name** as the mapping value (it can show the name and submit the name). The Gmail `messages.list` API filters by label **ID**, not name, so `gmail-fetch-service` lists labels once (`users/me/labels` → `{ id, name }[]`), builds a `Map<name, id>`, and resolves each mapping. A mapping whose name no longer exists on the account is skipped (parity with IMAP's missing-folder skip). This keeps mappings human-readable and resilient to the user renaming the dropdown source later.

### Gmail REST specifics (prevent wrong calls)
- **Access token:** `getAccessToken(refreshToken)` is already implemented in `src/server/lib/gmail-oauth.ts` (45.2) — `OAuth2Client.setCredentials({ refresh_token })` + `getAccessToken()`. Reuse it; do NOT construct a second OAuth client or re-implement refresh. It throws on a revoked/expired token → the route maps that to the 502 "reconnect" response.
- **List:** `GET https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=<id>&q=newer_than:30d` with `Authorization: Bearer <accessToken>`. Returns `{ messages?: [{ id, threadId }], nextPageToken? }`. `messages` is OMITTED (not `[]`) when a label has zero matches in-window — guard with `?? []`. Page via `nextPageToken` until absent. `newer_than:30d` is Gmail's server-side 30-day cutoff (AC 1, NFR7) — do not compute a `Date` yourself.
- **Metadata fetch:** `GET …/messages/<id>?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`. `format=metadata` avoids downloading bodies (we only store From/Subject/Date/Message-ID). Headers arrive as `payload.headers: [{ name, value }]` with provider-cased names — match case-insensitively. `internalDate` is the epoch-ms received time (string) → `new Date(Number(internalDate)).toISOString()`.
- **Direct `fetch`, not `googleapis`:** consistent with 45.1/45.2's decision (`google-auth-library` only; Gmail REST via `fetch`, like the Anthropic-key test). Do NOT add the `googleapis` meta-package.
- **From form:** Gmail's `From` header is already `Name <address>` (or bare address) — store it verbatim as `fromAddress`. The IMAP path reconstructs this from `envelope.from`; here it's pre-formatted, so no reconstruction.

### Provider precedence & error mapping
- Order (AC 5): **Gmail if a `gmail_refresh_token` row exists → else IMAP if configured → else 503.** Branch on the row's presence at the top of `/sync`; only fall through to the existing IMAP block when no Gmail row.
- A user has Gmail OR IMAP (epic scope), so the precedence rarely collides; if both secrets exist, Gmail wins deterministically.
- Error responses: revoked/expired/refresh failure → `502 { error: 'Gmail sync failed — reconnect Gmail and try again' }` (NFR6, mirrors the labels endpoint's 502 and IMAP's 502). Decrypt failure on the stored ciphertext → `500 { error: 'Failed to read Gmail credentials' }` (mirrors the IMAP decrypt-failure 500). Neither-provider → existing `503`. All are `{ error }` only — never `{ message }`.
- **NFR2 / AC 6:** never log token values. Log only static strings or `err.message` from the google lib (which does not embed the token). Do NOT log the refresh-token ciphertext or the decrypted token.

### Project conventions to honor (from project-context.md)
- **Error shape:** `{ error: string }` + status only — never `{ message }`, never an envelope. Inline returns are fine for these handled 5xx/503 cases (the global `errorHandler` is the fallback; here we map deliberately).
- **`console.error` for server errors;** `console.log` for errors is forbidden.
- **Service files** `kebab-case.ts` under `src/server/services/` (`gmail-fetch-service.ts`, beside `email-fetch-service.ts`).
- **DB singleton:** import `db` from `src/db/client`; never a second instance. Use `.all()`/`.get()`/`.run()` (better-sqlite-style sync API, as the IMAP service does).
- **Dates:** ISO 8601 strings (`received_at`).
- **No comments** unless non-obvious; no speculative abstractions; no backwards-compat shims.
- **Multi-user isolation (NFR5):** every query scoped by `userId` (mappings read, dedup sets, inserts all carry `userId`). Never read or write another user's `messages`/mappings/secrets. This is a live multi-user hosted platform — not single-user localhost.

### Testing harness specifics (this file has two gotchas)
- `api-messages.test.ts` wraps the route in a test `Hono` that sets `c.set('userId', 1)` via middleware (line 12-17) — it does NOT set `sessionUserId` (the Gmail sync path only needs `userId`, so no change needed there).
- The file's `CREATE_MESSAGES_TABLE` DDL is **stale** — it lacks the `message_id TEXT UNIQUE` column present in the real schema (`src/db/schema.ts:92`). Add it so the Message-ID dedup branch is testable. Tests build tables via raw SQL (project rule — never run the migration runner in tests), so the DDL must be hand-corrected.
- Mock the network boundary at `OAuth2Client.prototype.getAccessToken` and `globalThis.fetch` (the pattern 45.1/45.2 established). Restore `globalThis.fetch` after the Gmail suite so unrelated suites that may rely on real/other fetch are not poisoned.

### Out of scope for THIS story (do not build ahead)
- **All UI** — the "Connect Gmail" button, connected badge, label-dropdown mapping table, onboarding either/or, success toasts → **Story 45.4**. This story is server-only: a sync service + a `/sync` branch.
- No change to `GET /api/messages` or `PATCH /api/messages/:id` (AC 7 parity is automatic — synced Gmail rows are ordinary `messages` rows). Do not touch the `notLike` block-sender filter on `GET /api/messages`.
- No schema/migration change (the `messages` and `gmail_label_mappings` tables already exist from prior stories). No new `user_secrets` keys.
- No background polling (on-demand sync only, like IMAP) — epic-level out-of-scope.

### Project Structure Notes
- **New file:** `src/server/services/gmail-fetch-service.ts` (`fetchAndStoreGmail`), beside `email-fetch-service.ts`.
- **Edited:** `src/server/services/email-fetch-service.ts` (export `BLOCKED_SENDERS` so the Gmail service shares it), `src/server/routes/api-messages.ts` (Gmail branch in `/sync`), `src/server/routes/api-messages.test.ts` (Gmail sync contract tests + corrected DDL).
- No `src/index.ts` change — `/api/messages` is already mounted (line 99); the new branch lives inside the existing `/sync` handler.
- No new route registration, no new env var, no migration.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 45.3 (lines 208-243)] — ACs, FR6/FR7, NFR6/NFR7, gmail-fetch-service + branching decision
- [Source: _bmad-output/planning-artifacts/epics.md:41,76-77,123] — FR6 sync rules, gmail-fetch-service module, dedicated-table independence
- [Source: job-hunt-dashboard/src/server/services/email-fetch-service.ts:12-113] — `BLOCKED_SENDERS`, dedup + type-fill state machine to mirror exactly
- [Source: job-hunt-dashboard/src/server/routes/api-messages.ts:31-70] — `/sync` handler to branch; IMAP decrypt + error-mapping pattern
- [Source: job-hunt-dashboard/src/server/lib/gmail-oauth.ts] — `getAccessToken(refreshToken)`, `GmailNotConfiguredError` (reuse; do not re-implement)
- [Source: job-hunt-dashboard/src/db/schema.ts:90-104] — `messages` table (uid, message_id, received_at, from_address, subject, type, user_id)
- [Source: job-hunt-dashboard/src/server/routes/api-config-gmail-mappings.ts] — `gmailLabelMappings` shape + per-user scoping
- [Source: _bmad-output/implementation-artifacts/45-2-gmail-label-mapping-data-model-list-crud.md] — `getAccessToken`, labels endpoint, label-name semantics, mapping CRUD
- [Source: job-hunt-dashboard/src/server/routes/api-messages.test.ts:1-51] — test harness (in-memory DB, mocked `userId`, raw-SQL DDL — note stale `message_id`)
- [Source: _bmad-output/project-context.md] — error shape, `console.error` rule, ISO dates, service naming, bun:test rules, multi-user isolation

## Review Findings

_Code review 2026-06-15 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Acceptance Auditor: all 7 ACs satisfied, no spec violations._

### Patch (unchecked)

- [x] [Review][Patch] Guard `h.name` before `.toLowerCase()` — a header lacking `name` throws `TypeError` and aborts the whole sync (502) [gmail-fetch-service.ts:81] — FIXED (`h.name?.toLowerCase()`)
- [x] [Review][Patch] Guard non-numeric `internalDate` — `new Date(Number(internalDate))` on a non-numeric/NaN value yields `new Date(NaN).toISOString()` which throws `RangeError` and aborts the sync [gmail-fetch-service.ts:86] — FIXED (`Number.isFinite` guard, falls back to now)

### Deferred (pre-existing / mirrored from IMAP)

- [x] [Review][Defer] Multi-label message → `type` assigned by arbitrary mapped-label order [gmail-fetch-service.ts:55-108] — deferred, spec-acknowledged parity. A Gmail message carrying two mapped labels with different statuses is skipped on the second label via `existingUids.has(uid)`, so its `type` is whichever label the DB returns first. Spec explicitly chose first-seen-wins / no-double-count; Gmail labels (unlike IMAP folders) make multi-label common, so flag if status precedence ever matters.
- [x] [Review][Defer] `existingByMessageId` seeded with `id: 0` after insert [gmail-fetch-service.ts:106] — deferred, pre-existing (identical to `email-fetch-service.ts:96`). A later same-Message-ID message in one run would `UPDATE ... WHERE id = 0` (no-op). Practically unreachable for the same gmail id (guarded by `existingUids`); faithful mirror of the IMAP state machine the spec mandated.
- [x] [Review][Defer] Unbounded pagination + serial per-message detail fetches [gmail-fetch-service.ts:62-72] — deferred, pre-existing pattern (IMAP fetches all too). No page cap or request timeout; a heavily-labelled account (thousands of messages in 30d) means thousands of sequential round-trips inside one `/sync` handler — quota/timeout risk.
- [x] [Review][Defer] No retry/backoff on Gmail 429/5xx; mid-sync failure aborts but commits partial rows [gmail-fetch-service.ts:35-36] — deferred, mirrors IMAP whole-sync-abort. A transient 429 mid-run throws → 502, but rows inserted before it stay committed and `added` is lost; next sync re-fetches.
- [x] [Review][Defer] No per-user sync lock — concurrent `/sync` calls race [gmail-fetch-service.ts:46-108] — deferred, pre-existing architectural (IMAP shares it). Two overlapping syncs snapshot the same dedup sets; `onConflictDoNothing` covers uid collisions but the type-fill update can fire twice and `added` is double-counted. Relevant on this multi-user hosted platform.
- [x] [Review][Defer] `added++` unconditional after `onConflictDoNothing()` [gmail-fetch-service.ts:104-108] — deferred, pre-existing (IMAP line 97). If a unique-constraint conflict silently skips the insert (row not in the in-memory set), `added` over-reports vs rows actually written; `.changes` is never checked.
- [x] [Review][Defer] Revoked refresh token → 502 on every sync; stale `gmail_refresh_token` row never cleared/flagged [gmail-fetch-service.ts:35] — deferred, reconnect/clear flow is Story 45.4 (Connect Gmail UI) scope.

### Dismissed as noise

11 findings dismissed: `Bearer undefined` (false positive — `getAccessToken` returns `Promise<string>` and throws otherwise); token in `err.message` logged (confirmed safe — google-auth-library errors don't embed the token); missing `stub.id` / missing label `id`/`name` / list-entry shape (Gmail API contract guarantees these); label-name collision after rename (contract edge); Gmail-row-present-but-no-mappings skips IMAP (spec: Gmail wins, user has Gmail OR IMAP); 429 surfaced as "reconnect" (spec mandates the static 502 message); redundant dead `existingUids.has(uid)` re-check at line 100 (harmless, mirrors IMAP line 87); test monkeypatches restored in `afterEach` (acceptable); "Gmail wins" test coverage adequacy (early-return + `labelsCalled` give sufficient signal); `received_at` fallback-to-now semantics (mirrors IMAP line 89).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `bun test src/server/routes/api-messages.test.ts` → 15 pass / 0 fail (7 new Gmail-sync contract tests + 8 pre-existing).
- `bun test` (full suite) → 405 pass / 43 fail; the 43 are the documented pre-existing unrelated failures (api-ingest archived-field, obsolete LinkedIn, etc.). None are in `messages`/`gmail`/`email-fetch` files — confirmed via grep. No regressions added.
- `bunx tsc --noEmit` → production files clean. The only remaining error in `api-messages.test.ts` (`c.set('userId', 1)` on the untyped test `Hono`) is pre-existing (verified via `git stash`), unrelated to this story.

### Completion Notes List

- **Task 1** — Added `src/server/services/gmail-fetch-service.ts` exporting `fetchAndStoreGmail(refreshToken, userId)`. Mirrors the IMAP `fetchAndStoreEmails` dedup/type-fill state machine exactly; only the source differs (Gmail REST via `fetch` + `getAccessToken`). Resolves label NAME→ID once via `users/me/labels`, skips mappings whose label no longer exists (IMAP missing-folder parity), pages `messages.list` with `q=newer_than:30d`, fetches `format=metadata` headers (case-insensitive), filters `BLOCKED_SENDERS`, dedups by `gmail:<id>` uid and by Message-ID. `getAccessToken` throws propagate to the route (no catch-and-swallow). Never logs tokens.
- **Shared constant** — `BLOCKED_SENDERS` is now `export`ed from `email-fetch-service.ts` and imported by the Gmail service (single source of truth); the `GET /api/messages` `notLike` filters were left untouched (out of scope).
- **Task 2** — Branched `POST /api/messages/sync`: a `gmail_refresh_token` user-secret row now takes precedence (Gmail wins when connected). Decrypt failure → `500 { error: 'Failed to read Gmail credentials' }` (no token/err detail logged); sync failure (revoked/expired/refresh) → `502 { error: 'Gmail sync failed — reconnect Gmail and try again' }`. No Gmail row → existing IMAP block unchanged (incl. neither-provider `503`).
- **Task 3** — Extended `api-messages.test.ts`: corrected the stale `CREATE_MESSAGES_TABLE` DDL (added `message_id TEXT UNIQUE`), added the `gmail_label_mappings` DDL + cleanup, set Google env vars, mocked `OAuth2Client.prototype.getAccessToken` and `globalThis.fetch` (URL-branched, restored in `afterEach`). Covers happy path, dedup, type-fill-only-when-null (+ no-overwrite), blocked-sender, Gmail-wins-over-IMAP, no-mappings-no-network, and revoked-token→502-with-no-token-leak. All error bodies asserted to carry `error` and NOT `message`.
- No schema/migration change, no new route registration, no new env var, no UI (all per story scope).

### File List

- `job-hunt-dashboard/src/server/services/gmail-fetch-service.ts` (new)
- `job-hunt-dashboard/src/server/services/email-fetch-service.ts` (modified — export `BLOCKED_SENDERS`)
- `job-hunt-dashboard/src/server/routes/api-messages.ts` (modified — Gmail branch in `/sync`)
- `job-hunt-dashboard/src/server/routes/api-messages.test.ts` (modified — DDL fix + Gmail sync contract tests)

## Change Log

- 2026-06-15 — Implemented Gmail sync into the Messages view (Story 45.3): new `gmail-fetch-service`, `/sync` Gmail provider branch, shared `BLOCKED_SENDERS`, and contract tests. Status → review.
