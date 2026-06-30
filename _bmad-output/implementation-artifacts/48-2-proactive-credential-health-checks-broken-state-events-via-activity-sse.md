---
baseline_commit: d2d007b14a16e36bb8d4425a9347e5ae9796d6f2
---

# Story 48.2: Proactive Credential Health-Checks & Broken-State Events via Activity SSE

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user who finished setup,
I want the app to notice in the background when a connection breaks,
so that I'm alerted before a run silently fails at 2am instead of discovering it later.

## Acceptance Criteria

1. **Per-user health cache + background probes** — a new in-process health service caches a per-user, per-task `healthy | broken` result with an ISO timestamp. On a conservative background interval (driven by the per-user activity-stream lifecycle — see AC6/Dev Notes), it actively validates each **present** credential **without blocking any request path**:
   - `apiKey` ← Anthropic key validity (reuse the `PUT /api/onboarding/anthropic` probe: `POST https://api.anthropic.com/v1/messages`, haiku, `max_tokens: 1`).
   - `inboxConnect` ← IMAP login (reuse the `PUT /api/onboarding/imap` probe: `ImapFlow.connect()` + `logout()`) **or** Gmail token validity (`getAccessToken(refreshToken)` succeeds).
   - `inboxMapping` ← mapping target existence: every mapped Gmail label still present in the account's label list / every mapped IMAP folder still openable.
   - `linkedin` ← **passive** (see AC7) — **no** background browser probe in this story.
   - `profile` is **never** health-checked (it is local data, not a credential) and can never become `broken`.
2. **`computeSetupStatus` reports `broken` from the cache** — when a credential is present (would be `complete` per Story 48.1) **but** the health cache marks that task `broken`, `computeSetupStatus(userId)` (Story 48.1) returns that task's `state` as `broken`, and therefore `ready` becomes `false` (the existing `!anyBroken` short-circuit). A task whose credential is **absent** is unaffected by the cache (stays `notStarted`/`partial`). `computeSetupStatus` stays a single **synchronous** function.
3. **SSE `setup-status` event on transition** — when a task's health transitions (`healthy → broken` **or** `broken → healthy`), a `setup-status` named event is emitted to that user's existing Epic 46 SSE subscribers carrying the updated `SetupStatus` snapshot. It reuses the Epic 46 per-user registry + the **single** `/api/activity/stream` connection — **no** second `EventSource`, **no** new polling endpoint, **no** new route.
4. **Per-user isolation** — a user only ever receives their own `setup-status` events; a different user's broken credential is never pushed to them (assertable in a contract/unit test). The cache and emit path are keyed on `userId` only, never on request input.
5. **Repair clears promptly + emits healthy** — when a credential is repaired (user reconnects), the task returns to `complete` and a healthy `setup-status` event is emitted so the badge/dropdown clear promptly. Because the existing credential-save routes (`PUT /anthropic`, `PUT /imap`, Gmail OAuth callback) **already validate** the credential before persisting, on their success they mark the corresponding task `healthy` in the cache (clearing any cached `broken` and emitting a healthy transition event). The next scheduled health-check is the secondary safety net.
6. **No-flap guard + interval cadence** — a single inconclusive probe (network error, timeout, 5xx, transient throw) **does not** flip a task to `broken`; only a **confirmed-invalid** result (e.g. Anthropic `401`, IMAP auth failure, Gmail `invalid_grant`, a definitively-missing mapping target) marks `broken`. `console.error` is used for server-side probe errors (never `console.log`); no credential values appear in logs or any response. The interval is conservative and only runs for users with an **open activity stream** (started on SSE subscribe, stopped on the last unsubscribe) — no global all-users poller.
7. **Passive LinkedIn detection (via discovery)** — the LinkedIn scraper detects an auth-wall / logged-out session and surfaces a distinct `sessionInvalid` flag on the scrape response; the discovery service maps it: `sessionInvalid === true` for a LinkedIn search ⇒ `markBroken(userId, 'linkedin')`; a LinkedIn search that returns results normally ⇒ `markHealthy(userId, 'linkedin')`. A generic scraper error (HTTP 5xx, fetch throw, timeout) is **inconclusive** and never marks `linkedin` broken (no-flap). The resulting `broken`/`healthy` transition emits a `setup-status` event exactly as AC3.
8. **Tests (`bun:test`, co-located)** — business-logic tests cover: each probe's healthy/broken/inconclusive classification (mocked probes — no real network); cache transition + event emission only on a real transition (not on repeated same-state probes); `computeSetupStatus` override (present + cached-broken ⇒ `broken` & `ready:false`; absent + cached-broken ⇒ unaffected); per-user isolation (user A's broken never reaches user B). HTTP/contract tests assert a `setup-status` event reaches the right user's stream and carries a schema-valid `SetupStatus`, and that no credential value (ciphertext/key/token) appears in any emitted payload or log.

## Tasks / Subtasks

- [x] **Task 1 — Health cache + probe service** (AC: #1, #2, #4, #6)
  - [x] Create `src/server/services/setup-health.ts`. Module-level singleton cache `Map<number /*userId*/, Map<SetupTaskId, { state: 'healthy' | 'broken'; checkedAt: string }>>`. Export a factory `createSetupHealth()` (mirroring `createActivityRegistry()`) **and** a singleton `setupHealth` so tests can build an isolated instance while production imports the singleton. [Source: src/server/services/activity-registry.ts — factory+singleton pattern]
  - [x] Export `getHealth(userId, taskId): 'healthy' | 'broken' | null` (null = unknown/never-checked). This is the **synchronous** reader that `computeSetupStatus` consults.
  - [x] Export `markBroken(userId, taskId)` / `markHealthy(userId, taskId)`: update the cache entry (+ `checkedAt`); if and only if the state **changed** (including unknown→broken / broken→healthy / healthy→broken), emit a `setup-status` event for that user (Task 3). Same-state writes are a no-op for emission (AC8 transition-only).
  - [x] Export `clear(userId, taskId)` (delete the cache entry) — used so a task whose credential is **removed** doesn't retain a stale `broken`/`healthy`.
  - [x] Export `async checkUserHealth(userId): Promise<void>` — read the user's `user_secrets` keyNames once (mirror `computeSetupStatus`/`api-onboarding /status`), then for each task whose credential is **present** run its probe (Task 2) and call `markBroken`/`markHealthy` per the result; **inconclusive results call neither** (no-flap, AC6). For a task whose credential is **absent**, `clear(userId, taskId)`. Wrap each probe in its own try/catch so one failing probe never aborts the others; `console.error` probe errors.
  - [x] Per-user isolation: every cache key and every DB read is scoped to the passed `userId` only — never from request input (AC4). [Source: src/server/services/setup-status.ts — per-user read pattern]
- [x] **Task 2 — Probes (reuse existing validation code, do not re-invent)** (AC: #1, #6)
  - [x] `probeAnthropic(apiKey): Promise<'healthy' | 'broken' | 'inconclusive'>` — copy the request from `api-onboarding.ts` `PUT /anthropic` (`POST https://api.anthropic.com/v1/messages`, model `claude-haiku-4-5-20251001`, `max_tokens: 1`, `messages:[{role:'user',content:'hi'}]`, `AbortSignal.timeout(10000)`). Map: `401` ⇒ `broken`; `2xx` ⇒ `healthy`; `>=500`, `TimeoutError`/`AbortError`, fetch throw ⇒ `inconclusive`. Decrypt the stored key with `decrypt()` to get the plaintext to send. [Source: src/server/routes/api-onboarding.ts:38-80; src/server/lib/crypto.ts:14]
  - [x] `probeImap({host,port,user,pass}): Promise<...>` — copy the `ImapFlow` connect/logout-with-timeout pattern from `PUT /imap`; map auth-failure message (`auth`/`authentication`/`login`/`credentials`) ⇒ `broken`; timeout / cannot-reach-host ⇒ `inconclusive`. Decrypt `imap_host`/`imap_port`/`imap_user`/`imap_pass`. [Source: src/server/routes/api-onboarding.ts:101-143]
  - [x] `probeGmailToken(refreshToken): Promise<...>` — call `getAccessToken(refreshToken)`; success ⇒ `healthy`; an `invalid_grant` (revoked/expired refresh token) ⇒ `broken`; any other network error ⇒ `inconclusive`. [Source: src/server/lib/gmail-oauth.ts:27]
  - [x] `probeInboxMapping(userId): Promise<...>` — only runs when `inboxMapping` is present. For **Gmail mappings**: fetch the live label list (`GET https://gmail.googleapis.com/gmail/v1/users/me/labels` with a bearer from `getAccessToken`, mirroring `api-onboarding.ts` `/gmail/labels` and `gmail-fetch-service.ts`), and compare against this user's `gmail_label_mappings` rows — a mapped label name absent from the live list ⇒ `broken`; a 5xx/network failure ⇒ `inconclusive`. For **IMAP mappings**: connect once and `getMailboxLock(folderPath)` for each `inbox_folder_mappings` row (mirror `email-fetch-service.ts:48-53` — a non-existent folder throws on lock); a definitively-missing folder ⇒ `broken`; connection failure ⇒ `inconclusive`. If the user has both, a broken target in either ⇒ `broken`. [Source: src/server/routes/api-onboarding.ts:255-279; src/server/services/gmail-fetch-service.ts:39-45; src/server/services/email-fetch-service.ts:36-66]
  - [x] **Never** log or return credential plaintext/ciphertext/tokens from any probe (AC6, AC8). Probes take already-decrypted inputs from `checkUserHealth`; keep decryption local and short-lived.
- [x] **Task 3 — Extend Epic 46 registry with a `setup-status` channel** (AC: #3, #4)
  - [x] In `src/server/services/activity-registry.ts` add a parallel per-user listener channel that does **not** disturb the existing activity (`runs`) listeners: `type SetupStatusListener = (status: SetupStatus) => void`; `subscribeSetupStatus(userId, listener)`, `unsubscribeSetupStatus(userId, listener)`, and `emitSetupStatus(userId, status: SetupStatus)` (iterate a `setupListenersByUser: Map<number, Set<SetupStatusListener>>`, try/catch each, `console.error` on throw — mirror the existing `emit`). Import `SetupStatus` **type-only** from `../../shared/schemas`. Export `SetupStatusListener`. [Source: src/server/services/activity-registry.ts:1-95 — mirror `listenersByUser`/`subscribe`/`emit`]
  - [x] The health service (Task 1) emits in strict order on a confirmed transition: **(1)** write the new state into the cache, **(2)** compute the snapshot **once** via `computeSetupStatus(userId)` (which now reads the just-written cache via `getHealth`, so it reflects the transition), **(3)** call `activityRegistry.emitSetupStatus(userId, snapshot)`. Computing before writing the cache would emit a stale snapshot — order matters. Keep `activity-registry.ts` free of any `computeSetupStatus` import (the health service owns that call) to preserve layering — the registry stays a dumb per-user pipe.
- [x] **Task 4 — Emit `setup-status` over the existing SSE stream** (AC: #3)
  - [x] In `src/server/routes/api-activity.ts`, inside the same `streamSSE` handler, additionally `subscribeSetupStatus(userId, ...)` with a listener that `enqueue({ event: 'setup-status', data: JSON.stringify(status) })` (reuse the existing serialized `enqueue` chain). On `onAbort`, `unsubscribeSetupStatus(userId, listener)` alongside the existing `activityRegistry.unsubscribe`. Do **not** add a second snapshot-on-connect for setup-status — the Story 48.3 hook seeds initial state from `GET /api/setup-status` (the query), and AC3 is transition-push only. [Source: src/server/routes/api-activity.ts:11-39]
- [x] **Task 5 — Per-user interval lifecycle (start on stream open, stop on last close)** (AC: #1, #6)
  - [x] In `setup-health.ts` add ref-counted scheduling: `startForUser(userId)` (increment a per-user refcount; on `0 → 1`, immediately `void checkUserHealth(userId)` then `setInterval(() => void checkUserHealth(userId), HEALTH_INTERVAL_MS)` stored per user) and `stopForUser(userId)` (decrement; on `1 → 0`, `clearInterval` and drop the timer). Export `HEALTH_INTERVAL_MS` as a conservative constant (recommend `5 * 60_000`) so a test can reference it. Multiple tabs/streams for one user share one interval via the refcount.
  - [x] In `api-activity.ts` `streamSSE` handler call `setupHealth.startForUser(userId)` right after subscribing and `setupHealth.stopForUser(userId)` in the `onAbort` teardown (next to `unsubscribe`). This is the **only** trigger — no boot-time global poller, satisfying "checks only run for users with an open stream". [Source: src/server/routes/api-activity.ts:24-38]
- [x] **Task 6 — Wire the health cache into `computeSetupStatus`** (AC: #2)
  - [x] In `src/server/services/setup-status.ts`, after building the presence-derived `STATE` map and **before** assembling `tasks`, override: for each task that is `complete` per presence, if `setupHealth.getHealth(userId, id) === 'broken'` set its state to `'broken'`. Absent credentials (`notStarted`/`partial`/profile) are **never** overridden. Import `getHealth` (or the `setupHealth` singleton) from `./setup-health`. The existing `anyBroken`/`ready` logic already handles the rest — do not duplicate it. Keep the function synchronous. [Source: src/server/services/setup-status.ts:62-98]
  - [x] Guard against an import cycle: `setup-status.ts` imports `setup-health.ts` (for `getHealth`), and `setup-health.ts` imports `setup-status.ts` (for `computeSetupStatus` in the emit path). This is a genuine 2-way module reference. Make it safe by importing `computeSetupStatus` lazily inside the health service's emit function, or by having the health service receive the snapshot computer as already-resolved at call time — verify `bun` resolves it without a TDZ error (a top-level `import` of a function used only inside a later-invoked function body is fine; a top-level *call* would not be). Document whichever you choose in Completion Notes.
- [x] **Task 7 — Repair path: credential-save success marks healthy** (AC: #5)
  - [x] In `api-onboarding.ts`: after the successful `db.insert(...).onConflictDoUpdate(...)` in `PUT /anthropic`, call `setupHealth.markHealthy(userId, 'apiKey')`. After the successful IMAP secrets write in `PUT /imap`, call `setupHealth.markHealthy(userId, 'inboxConnect')`. In the Gmail OAuth `GET /gmail/callback` success branch (after the refresh-token write), call `setupHealth.markHealthy(userId, 'inboxConnect')`. Each `markHealthy` emits a healthy `setup-status` event only if the task was previously `broken` (transition-only). [Source: src/server/routes/api-onboarding.ts:82-90, 144-160, 230-252]
  - [x] In `DELETE /gmail` (and any other disconnect that removes a credential), call `setupHealth.clear(userId, 'inboxConnect')` so a removed credential doesn't keep a stale cache entry. (Disconnect also makes `computeSetupStatus` report `notStarted` via presence — the `clear` just prevents a stale `broken` from surviving.) [Source: src/server/routes/api-onboarding.ts:280-299]
  - [x] **Do NOT** add `['setup-status']` query invalidation here — that belongs to Story 48.3 (the client hook). This story only touches the server cache/emit.
- [x] **Task 8 — Passive LinkedIn signal via the scraper + discovery** (AC: #7)
  - [x] **Scraper:** in `scraper/src/scrapers/linkedin.js` detect a logged-out/auth-wall page after navigation (current URL contains `/authwall`, `/login`, `/uas/login`, or `/checkpoint`, or the results container is absent because of a sign-in interstitial) and surface a distinct boolean up to the route. In `scraper/src/routes/scrape.js` `/scrape/search`, include `sessionInvalid: true` on the response body for that case (default `false`/omitted otherwise). Keep the change minimal and LinkedIn-specific. [Source: job-hunt-dashboard/scraper/src/scrapers/linkedin.js; job-hunt-dashboard/scraper/src/routes/scrape.js:50-53]
  - [x] **Discovery:** in `src/server/services/discovery-service.ts`, where the scrape JSON is parsed (`const data = await res.json() as {...}`), extend the type with `sessionInvalid?: boolean`. For `s.source === 'linkedin'` and `userId !== undefined`: if `data.sessionInvalid === true` ⇒ `setupHealth.markBroken(userId, 'linkedin')`; else (a normal successful LinkedIn response) ⇒ `setupHealth.markHealthy(userId, 'linkedin')`. Do **not** mark broken on the generic `!res.ok` / fetch-throw branches (those are inconclusive, AC6/AC7). [Source: src/server/services/discovery-service.ts:218-245, 192-218]
- [x] **Task 9 — Tests** (AC: #8)
  - [x] `src/server/services/setup-health.test.ts` (business logic, `bun:test`, `process.env.DB_PATH=':memory:'` first line, raw-SQL DDL in `beforeAll`, `DELETE` in `beforeEach` — mirror `setup-status.test.ts`). Build an isolated instance via `createSetupHealth()`. Mock probes with `mock.module`/`spyOn` (or inject) — **no real network**. Cover: confirmed-invalid ⇒ `broken`; valid ⇒ `healthy`; inconclusive ⇒ no state change + no emit; transition emits exactly once, same-state re-probe emits zero; `markBroken`/`markHealthy`/`clear` semantics; per-user isolation (user A broken ⇒ `getHealth(B)` null); absent-credential path calls `clear`. [Source: src/server/services/setup-status.test.ts; src/server/services/activity-registry.test.ts]
  - [x] Extend `src/server/services/activity-registry.test.ts`: `subscribeSetupStatus`/`emitSetupStatus` notifies only the right user's setup-status listeners; `unsubscribeSetupStatus` stops delivery; activity (`runs`) listeners are unaffected by setup-status emits and vice-versa.
  - [x] `src/server/services/setup-status.test.ts` (extend): present credential + cached `broken` ⇒ task `broken` + `ready:false`; absent credential + cached `broken` ⇒ unaffected (`notStarted`); profile is never `broken` even if (somehow) cached.
  - [x] HTTP/contract: extend `src/server/routes/api-activity.test.ts` to assert a `setup-status` event is delivered to user 1's stream after `setupHealth.markBroken(1, 'apiKey')` (and **not** to user 2's), parses against `setupStatusSchema`, and contains no `ciphertext`/raw-key/token strings. Use the existing `readUntil`/`dataFor` SSE harness. [Source: src/server/routes/api-activity.test.ts:1-45]
  - [x] (If feasible without a scraper harness) a focused unit test that discovery maps `data.sessionInvalid` ⇒ `markBroken('linkedin')` and a normal result ⇒ `markHealthy('linkedin')` by spying on `setupHealth`. If the discovery test scaffold can't reach this path cleanly, assert the mapping logic in isolation and note the harness gap in Completion Notes.

## Dev Notes

### What this story is (and is NOT)
- **IS:** a per-user, in-memory credential **health cache** + active probes for the network-only credentials (Anthropic, Gmail, IMAP, mapping targets), wired so `computeSetupStatus` reports `broken`, and `broken/healthy` transitions push over the **existing** Epic 46 SSE stream. Plus a **passive** LinkedIn signal routed through discovery (no background browser probe — decided with the product owner).
- **IS NOT:** the `useSetupStatus` client hook / query invalidation (Story 48.3 — do not add `['setup-status']` invalidation), the dropdown/icon (48.4), the user menu (48.5), or sidenav propagation (48.6). No new route, no new `EventSource`, no new polling endpoint, no DB table/migration (the cache is in-memory only).

### Decided: LinkedIn is passive, not actively probed (product-owner decision, 2026-06-30)
Actively validating LinkedIn would require launching Firefox with the stored `storageState` on an interval — directly at odds with the entire **Epic 31** bot-detection-hardening effort and the per-request browser cost. **Decision: passive via discovery** (Task 8). LinkedIn health flips only when a real discovery run (already a background-triggered activity) reports `sessionInvalid`. Trade-off accepted: LinkedIn breakage is detected on the next discovery run rather than on the health interval. The other three credentials are cheap network calls and **are** probed on the interval.

### Reuse existing probes — do NOT re-implement detection
The credential-validation logic already exists and is battle-tested; copy the request/timeout/classification shape, don't invent new clients:
- Anthropic: `api-onboarding.ts` `PUT /anthropic` (`POST /v1/messages`, haiku, `max_tokens:1`, 10s timeout; `401`⇒invalid). [Source: src/server/routes/api-onboarding.ts:38-80]
- IMAP: `PUT /imap` (`ImapFlow.connect()`+`logout()` with a 10s race timeout; auth-keyword message ⇒ invalid). [Source: src/server/routes/api-onboarding.ts:101-143]
- Gmail token: `getAccessToken(refreshToken)`; `invalid_grant`⇒invalid. [Source: src/server/lib/gmail-oauth.ts:27]
- Gmail labels list: `GET /gmail/v1/users/me/labels` (bearer). [Source: src/server/routes/api-onboarding.ts:255-279; src/server/services/gmail-fetch-service.ts:39-45]
- IMAP folder existence: `client.getMailboxLock(folderPath)` throws when a folder doesn't exist. [Source: src/server/services/email-fetch-service.ts:48-66]
- Crypto: `encrypt`/`decrypt` from `src/server/lib/crypto.ts`. Decrypt only inside `checkUserHealth`/probes; never expose plaintext. [Source: src/server/lib/crypto.ts:5,14]

### Health cache shape & no-flap discipline (the crux)
- Cache: `Map<userId, Map<SetupTaskId, { state: 'healthy'|'broken'; checkedAt: ISOstring }>>`. Only `apiKey`, `inboxConnect`, `inboxMapping`, `linkedin` ever appear. `profile` never does.
- `getHealth` returns `'healthy' | 'broken' | null`. `computeSetupStatus` only overrides a **present-and-otherwise-`complete`** task to `broken` when `getHealth === 'broken'`. It never *promotes* a `notStarted` task using the cache.
- **No-flap (AC6):** the three probe outcomes are `healthy | broken | inconclusive`. Only `healthy`/`broken` write the cache; `inconclusive` (network/timeout/5xx/throw) leaves the previous state untouched and emits nothing. A previously-`broken` task stays broken across an inconclusive probe; a previously-`healthy` task stays healthy. This is the guard against false 2am alarms.
- **Transition-only emit:** `markBroken`/`markHealthy` compare against the prior cached state and emit a `setup-status` event **only** when the state actually changes. Repeated same-state probes are silent. This keeps the SSE quiet and matches AC3/AC8.

### SSE reuse — the single most important constraint
There is exactly **one** per-user `EventSource` (Epic 46, `GET /api/activity/stream`). This story adds a **second named event** (`setup-status`) on that same connection via a **parallel registry listener channel** — it must not touch or reshape the existing `snapshot`/`update` activity events (the Epic 46 `useActivityStream` hook and Story 48.3's `useSetupStatus` both read this one stream). Do not change `ActivityListener`, the `runs` payload, or the existing `snapshot`/`update` event names. Mirror the registry's existing `listenersByUser`/`emit` exactly for the new `setupListenersByUser`/`emitSetupStatus`. [Source: src/server/services/activity-registry.ts; src/server/routes/api-activity.ts]

### Interval lifecycle (piggyback on the stream, no global poller)
Per the epic dev-note, checks "only run for users with an open stream or recent activity." Implement via ref-counted `startForUser`/`stopForUser` keyed to SSE subscribe/abort in `api-activity.ts`. First stream for a user ⇒ immediate check + `setInterval(HEALTH_INTERVAL_MS)`; last stream closes ⇒ `clearInterval`. Multiple tabs share one interval. No boot-time loop over all users. Recommended `HEALTH_INTERVAL_MS = 5 * 60_000` (credentials rarely break; keep it conservative).

### Resolves the Story 48.1 deferred item (partially)
`deferred-work.md` (48.1 review) flagged "invalid-but-present credentials resolve to `notStarted` instead of `broken`." This story closes that for `apiKey`/`inboxConnect`/`inboxMapping` (and `linkedin` passively). Note: the profile-parse-failure half of that defer is **not** addressed here — `profile` is local data, never health-checked; leave it. Update `deferred-work.md` only if the dev workflow's review step instructs it. [Source: _bmad-output/implementation-artifacts/deferred-work.md:3-5]

### Per-user isolation (mandatory invariant — same as 48.1)
Every cache entry, probe, DB read, and emit is keyed on a `userId` that originates from `c.get('userId')` (in `api-activity.ts`) or an explicit `userId` argument (in discovery/onboarding) — **never** from request body/query/params. A health-check for user A must never read user B's secrets or push to user B's stream. Assert this in tests. [Source: src/server/middleware/auth-middleware.ts; src/server/services/setup-status.ts]

### Schema / response-shape compliance (project rules — non-negotiable)
- No new shared schema needed: the SSE `setup-status` payload **is** the existing `setupStatusSchema` (`{ tasks, ready }`) from Story 48.1. Import the `SetupStatus` **type** from `src/shared/schemas.ts` only (type-only in the registry). [Source: src/shared/schemas.ts setup* schemas]
- `console.error` for server-side probe errors; `console.log` for errors is forbidden. ISO 8601 strings for `checkedAt`. Explicit values, no `undefined` leaking into payloads. [Source: _bmad-output/project-context.md Language/Quality Rules]
- No speculative abstractions/feature flags; no comments unless logic is non-obvious; service/route files kebab-case; Zod schemas `*Schema`; types via `z.infer`. [Source: _bmad-output/project-context.md]
- Bind nothing new to the network; no new env vars. No credential value ever logged or returned. [Source: _bmad-output/project-context.md Security]

### Testing standards summary
- `bun:test` only (`describe/test/expect/beforeAll/beforeEach`); co-located, no `__tests__/`. `process.env.DB_PATH=':memory:'` as the **first line** before any prod import; create touched tables via raw SQL in `beforeAll`; `DELETE` rows in `beforeEach`. Mirror `setup-status.test.ts` for DB DDL (and remember the 48.1 lesson: shared `:memory:` singleton means your test DDL must match other files' DDL exactly — e.g. `UNIQUE(user_id)` on profile — or it corrupts cross-file upserts). [Source: src/server/services/setup-status.test.ts; 48.1 Debug Log]
- Mock all network probes with `mock.module`/`spyOn` — never hit Anthropic/Gmail/IMAP for real. [Source: src/server/routes/api-jobs.test.ts mock.module pattern]
- SSE contract tests reuse the `readUntil`/`dataFor` harness in `api-activity.test.ts`. [Source: src/server/routes/api-activity.test.ts:14-44]
- Two layers: call `checkUserHealth`/`markBroken` directly (business logic) **and** assert the event over the real SSE handler via `app.request` (contract). Assert payload shape + that no secret string appears.

### Baselines (from Story 48.1 completion — your bar is zero-new)
- `tsc --noEmit`: **87** pre-existing errors baseline; introduce **zero** new in any touched file.
- Full `bun test`: **505 pass / 40 pre-existing** env/network-dependent fails; your new tests add to the pass count with **zero regressions**.
- `bun run build`: green. [Source: 48-1 story Completion Notes/Validation]

### Project Structure Notes
- **New files:** `src/server/services/setup-health.ts`, `src/server/services/setup-health.test.ts`.
- **Edited files:** `src/server/services/activity-registry.ts` (setup-status channel), `src/server/routes/api-activity.ts` (subscribe/emit + start/stop), `src/server/services/setup-status.ts` (cache override), `src/server/routes/api-onboarding.ts` (markHealthy/clear on save/disconnect), `src/server/services/discovery-service.ts` (LinkedIn passive mapping), `scraper/src/scrapers/linkedin.js` + `scraper/src/routes/scrape.js` (`sessionInvalid` flag), plus the test files listed in Task 9.
- **No** migration / DB table (cache is in-memory). **No** new route. **No** new shared schema.
- Naming: service files kebab-case; route param convention `:id` only (not relevant — no path params added).

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-48-notifications-dropdown-top-nav-cluster.md#Story 48.2] (ACs + architecture note + dev note)
- [Source: _bmad-output/implementation-artifacts/48-1-setup-status-source-of-truth-shared-types-optional-task-dismissals.md] (48.1 contract, forward-compat note, baselines, :memory: DDL lesson)
- [Source: _bmad-output/project-context.md] (Hono/Drizzle/Zod/TanStack/testing/security rules)
- [Source: src/server/services/activity-registry.ts] (per-user registry + listener/emit pattern to mirror)
- [Source: src/server/routes/api-activity.ts] (SSE stream, enqueue chain, subscribe/onAbort lifecycle)
- [Source: src/server/services/setup-status.ts] (computeSetupStatus — synchronous; cache override point)
- [Source: src/server/routes/api-onboarding.ts:38-160,230-299] (Anthropic/IMAP/Gmail validation + save/disconnect — probe + repair-path source)
- [Source: src/server/lib/gmail-oauth.ts:27] (getAccessToken — Gmail token probe)
- [Source: src/server/services/gmail-fetch-service.ts; src/server/services/email-fetch-service.ts] (label-list / folder-lock existence checks)
- [Source: src/server/services/discovery-service.ts:180-245] (scrape response parse — LinkedIn passive mapping point)
- [Source: job-hunt-dashboard/scraper/src/scrapers/linkedin.js; job-hunt-dashboard/scraper/src/routes/scrape.js] (auth-wall detection + `sessionInvalid` flag)
- [Source: src/server/lib/crypto.ts] (encrypt/decrypt)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:3-5] (48.1 deferred health-detection item this story resolves)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- **`tsc --noEmit`:** 87 errors before and after — zero new errors in any touched file. (A transient +3 came from three new `globalThis.fetch = mock(...)` assignments in `discovery-service.test.ts` matching the file's pre-existing `preconnect`-missing pattern; resolved by casting those three `as unknown as typeof fetch`.)
- **`bun run build`:** green (Vite client build succeeds).
- **Touched test files, in isolation:** `setup-health.test.ts`, `setup-status.test.ts`, `activity-registry.test.ts`, `api-activity.test.ts`, `discovery-service.test.ts` → **88 pass / 0 fail**.
- **Full-suite flakiness (pre-existing, NOT this story):** the repo's test files share a single in-process `:memory:` SQLite DB (db/client singleton). When many files run together, unrelated files collide on cross-file table state — e.g. `api-jobs.test.ts` + `api-ingest.test.ts` alone produce **19 failures** with **zero involvement from any module in this story** (they don't import setup-health). Full-suite pass/fail counts fluctuate run-to-run (e.g. 530/42 vs 528/44). None of the failing tests are in files this story created or changed. The inherited working tree also contains pre-existing uncommitted `PUT /api/onboarding/linkedin` tests for a route that does not exist (5 failures) — unrelated to 48.2.
- **Cross-file race fixed in this story's own test:** `api-messages.test.ts` leaves a `gmail_label_mappings` row for user 1 in the shared DB; at stream-open `startForUser`→`checkUserHealth` saw that mapping and emitted an early `inboxMapping=healthy` `setup-status` event, which the contract test's `readUntil` captured instead of the event from the explicit `markBroken`. Fixed deterministically by clearing `user_secrets` + both mapping tables in the test's `beforeEach`.

### Completion Notes List

- **Health service (`setup-health.ts`):** module-level per-user cache `Map<userId, Map<HealthTaskId, {state, checkedAt:ISO}>>`; only `apiKey`/`inboxConnect`/`inboxMapping`/`linkedin` are ever cached — `profile` never is. Factory `createSetupHealth(deps?)` + singleton `setupHealth`. The factory accepts optional `probes`/`computeStatus`/`emit` injection so tests build an isolated, network-free instance while production wires the real probes, `computeSetupStatus`, and `activityRegistry.emitSetupStatus`.
- **No-flap (AC6):** probes return `healthy | broken | inconclusive`; only `healthy`/`broken` write the cache, `inconclusive` (network/timeout/5xx/throw/non-401 4xx) leaves prior state untouched. `probeAnthropic` is intentionally stricter than the onboarding route: only a `401` ⇒ broken, `2xx` ⇒ healthy, everything else ⇒ inconclusive (avoids false 2am alarms).
- **Transition-only emit (AC3/AC8):** `markBroken`/`markHealthy` compare prior cached state and emit only on a real change. Strict order per Task 3: write cache → `computeSetupStatus(userId)` (reflects the just-written cache) → `emitSetupStatus`. The emit is wrapped in try/catch so a snapshot-compute failure can never break a credential-save route.
- **Import cycle (Task 6):** `setup-status.ts` ↔ `setup-health.ts` is a genuine 2-way reference. Resolved with plain static top-level imports both ways: `computeSetupStatus` is a hoisted `export function` (available during circular eval) and is only *called* later inside the emit path; `setup-status.ts` only *calls* `setupHealth.getHealth` inside `computeSetupStatus` (also later). Verified `bun` resolves with no TDZ error (tests + build green).
- **Interval lifecycle (Task 5):** ref-counted `startForUser`/`stopForUser` keyed to SSE subscribe/abort in `api-activity.ts`; first stream ⇒ immediate check + `setInterval(HEALTH_INTERVAL_MS=5min)`, last close ⇒ `clearInterval`. The immediate/interval checks are `.catch`-guarded against unhandled rejections. No boot-time global poller.
- **Passive LinkedIn (Task 8):** scraper `searchLinkedIn` now returns `{ results, sessionInvalid }`; auth-wall detected via URL patterns (`/authwall`, `/login`, `/uas/login`, `/checkpoint`) plus a login-form selector fallback on selector-timeout, distinguished from generic failures (which still throw ⇒ inconclusive). `scrape.js` normalizes (other sources still return arrays) and surfaces `sessionInvalid`. Discovery maps `sessionInvalid===true ⇒ markBroken`, normal LinkedIn result ⇒ `markHealthy`, never the `!res.ok`/throw branches (inconclusive).
- **Test harness gap:** the `scraper/` package has no test harness (browser-driven, no co-located `.test.js`), so the `linkedin.js`/`scrape.js` change is exercised indirectly through the discovery mapping tests (spying on `setupHealth`) rather than by a direct scraper unit test.
- **48.1 deferred item:** this story closes the "invalid-but-present credential resolves to `notStarted` instead of `broken`" gap for `apiKey`/`inboxConnect`/`inboxMapping` (+ `linkedin` passively). The `profile`-parse-failure half is intentionally left — `profile` is local data, never health-checked.

### File List

**New:**
- `job-hunt-dashboard/src/server/services/setup-health.ts`
- `job-hunt-dashboard/src/server/services/setup-health.test.ts`

**Modified:**
- `job-hunt-dashboard/src/server/services/activity-registry.ts` (setup-status listener channel)
- `job-hunt-dashboard/src/server/services/activity-registry.test.ts` (channel tests)
- `job-hunt-dashboard/src/server/services/setup-status.ts` (health-cache `broken` override)
- `job-hunt-dashboard/src/server/services/setup-status.test.ts` (override tests)
- `job-hunt-dashboard/src/server/routes/api-activity.ts` (subscribe/emit setup-status + start/stop interval)
- `job-hunt-dashboard/src/server/routes/api-activity.test.ts` (:memory: isolation + setup-status SSE contract tests)
- `job-hunt-dashboard/src/server/routes/api-onboarding.ts` (markHealthy on save success; clear on DELETE /gmail)
- `job-hunt-dashboard/src/server/services/discovery-service.ts` (passive LinkedIn `sessionInvalid` mapping)
- `job-hunt-dashboard/src/server/services/discovery-service.test.ts` (LinkedIn mapping tests)
- `job-hunt-dashboard/scraper/src/scrapers/linkedin.js` (auth-wall detection ⇒ `sessionInvalid`)
- `job-hunt-dashboard/scraper/src/routes/scrape.js` (normalize + surface `sessionInvalid`)

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-30 | Created Story 48.2 — proactive credential health-checks (Anthropic/Gmail/IMAP/mapping-targets) + per-user health cache + `setup-status` SSE event over the existing Epic 46 stream + passive LinkedIn detection via discovery. Status → ready-for-dev. |
| 2026-06-30 | Implemented all 9 tasks: `setup-health.ts` cache+probes+interval lifecycle, `activity-registry` setup-status channel, SSE wiring in `api-activity`, `computeSetupStatus` broken override, onboarding repair path, passive LinkedIn via scraper+discovery, and full `bun:test` coverage. `tsc` zero-new, build green, all touched test files pass in isolation. Status → review. |

## Review Findings

_3-layer adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-06-30. Acceptance Auditor: 7/8 ACs MET, AC8 PARTIALLY MET._

- [x] [Review][Patch] Dismissed-but-`broken` optional task still blocks global `ready` [setup-status.ts:95] — _(resolved from decision-needed, 2026-06-30: user chose "dismissed broken ≠ blocks ready")_ — change `anyBroken` to `tasks.some((t) => t.state === 'broken' && !t.dismissed)` so a dismissed optional that goes broken no longer forces `ready:false`; its own badge still renders `broken`.
- [x] [Review][Patch] `probeInboxMapping` returns `'healthy'` without verifying any target [setup-health.ts:96-156] — mappings present but no matching creds (e.g. Gmail disconnected, label rows linger; no folder rows) falls through to `return 'healthy'`. Should be `'inconclusive'`. (blind+edge+auditor)
- [x] [Review][Patch] Transient IMAP `getMailboxLock` failure misclassified as `'broken'` [setup-health.ts:140-149] — a connection drop / server blip mid-loop is caught by the same `catch { return 'broken' }` as a genuinely missing folder, violating no-flap (AC6). Use `client.usable` to distinguish (connection lost ⇒ inconclusive). (edge High + blind)
- [x] [Review][Patch] `probeImap` socket leak when `connect()` resolves after the race timeout [setup-health.ts:51-83] — on `TimeoutError` the pending `client.connect()` is never closed; a slow IMAP host leaks a TCP/TLS socket every 5-min tick. Close the client in `finally`. (blind High)
- [x] [Review][Patch] `probeInboxMapping` IMAP `connect()` has no timeout [setup-health.ts:135-139] — unlike `probeImap`, a non-responsive server blocks the probe indefinitely; the non-awaited interval then stacks more hung connections. Add the same 10s race + close. (blind High + edge)
- [x] [Review][Patch] AC8 gap — probe-internal classification untested [setup-health.test.ts] — tests inject probe *results* but never assert `probeAnthropic`/`probeGmailToken` mapping (401⇒broken, 2xx⇒healthy, 5xx⇒inconclusive, invalid_grant⇒broken) with mocked network. Add focused unit tests for the network-mockable probes. (auditor)
- [x] [Review][Defer] `probeAnthropic` hardcoded model id `claude-haiku-4-5-20251001` → permanent `inconclusive` if the model is retired [setup-health.ts:37] — deferred, pre-existing pattern (mirrors onboarding `PUT /anthropic`).
- [x] [Review][Defer] `probeImap` hardcodes `secure: true` → STARTTLS/port-143 IMAP never connects [setup-health.ts:55,131] — deferred, faithfully mirrors onboarding `PUT /imap` per spec; pre-existing connection-mode constraint.
- [x] [Review][Defer] Stale `broken` for LinkedIn after re-auth until the next discovery run [discovery-service.ts:222-226] — deferred, spec-documented passive trade-off (no `clear`/`markHealthy` on LinkedIn credential save; flips only on discovery).
- [x] [Review][Defer] Failed `emit`/`computeStatus` during a transition is not retried [setup-health.ts:179-196] — deferred, rare; the write-then-compute-then-emit order is spec-mandated (Task 3), so a clean retry is non-trivial.
- [x] [Review][Defer] Immediate billable probe sweep on every stream open + reconnect churn re-fires the full sweep on each 0→1 refcount [setup-health.ts:283-292; api-activity.ts] — deferred, spec mandates check-on-subscribe; a debounce/last-checked guard is a future optimization.

_Dismissed as verified false positives / by-design (11): circular `setup-status`↔`setup-health` import (verified safe — hoisted fn, all refs in function bodies); `clear()` emits nothing (user-action paths refetch via 48.3; spec scoped emit to transitions); `probeAnthropic` 401-only-as-broken (intentional no-flap, AC6 names 401); LinkedIn `/login` substring match (acceptable LinkedIn-specific heuristic); `scrape.js` non-null `result` assumption (scrapers throw, never return nullish); in-flight probe emit after disconnect (emit is a no-op with listeners removed); concurrent LinkedIn searches flapping (same session ⇒ consistent results); unguarded `res.json()` in discovery (pre-existing parse, new mapping is downstream); Gmail-not-configured ⇒ inconclusive (env-misconfig operational edge); IMAP auth detection via message substring (mirrors onboarding validated pattern); `markHealthy` emits on unknown→healthy vs Task-7 "only if broken" wording (harmless — a real cache transition)._
