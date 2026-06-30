---
baseline_commit: d2d007b14a16e36bb8d4425a9347e5ae9796d6f2
---

# Story 48.1: Setup-Status Source of Truth, Shared Types & Optional-Task Dismissals

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer building the Notifications feature,
I want one server-computed, per-user setup-status contract that classifies every setup task by state and tier and honors dismissals,
so that the dropdown, badge, and sidenav all render from a single source instead of re-deriving status in the UI.

## Acceptance Criteria

1. **Shared types** — `src/shared/schemas.ts` exports Zod schemas (named `*Schema`) for: `setupTaskId` (`'linkedin' | 'apiKey' | 'profile' | 'inboxConnect' | 'inboxMapping'`), `setupTaskState` (`'notStarted' | 'partial' | 'complete' | 'broken'`), `setupTaskTier` (`'required' | 'optional'`), a per-task `setupTask` schema (`id`, `state`, `tier`, `dependsOn` = nullable `setupTaskId`, `dismissed` boolean, `progress` = nullable `{ filled, total }`), and `setupStatus` (an object holding the ordered `tasks` array **plus** a top-level `ready` boolean). All cross-boundary types are exported via `z.infer` from this module — no inline redefinition anywhere else.
2. **Service derivation** — new service `src/server/services/setup-status.ts` exports `computeSetupStatus(userId)` deriving each task state from existing signals (scoped to that `userId` only):
   - `linkedin` ← presence of `linkedin_storage_state` in `user_secrets` (`hasLinkedinAuth`)
   - `apiKey` ← presence of `anthropic_api_key` in `user_secrets` (`hasAnthropicKey`)
   - `profile` ← whether **Name, Email, Phone, Location, Summary, Skills** are all present; returns `partial` with `progress: { filled, total: 6 }` when some-but-not-all are set; `notStarted` when none; `complete` when all 6
   - `inboxConnect` ← inbox connection presence (IMAP creds **or** Gmail refresh token)
   - `inboxMapping` ← at least one folder mapping (`inbox_folder_mappings`) **or** label mapping (`gmail_label_mappings`) exists
3. **Tiers & dependency** — `linkedin`, `apiKey`, `profile` are `required`; `inboxConnect`, `inboxMapping` are `optional`; `inboxMapping.dependsOn === 'inboxConnect'`; every other task's `dependsOn` is `null`.
4. **Order** — the `tasks` array is returned in exactly this order: `linkedin, apiKey, profile, inboxConnect, inboxMapping`.
5. **`ready` flag** — `true` only when every `required` task is `complete` **and** every `optional` task is either `complete` or `dismissed`; `false` if any task is `broken`.
6. **GET route** — `GET /api/setup-status`, mounted under the existing `/api/*` auth middleware, returns that user's computed `setupStatus` object (`{ tasks, ready }`) using the standard **direct-data** shape, deriving the user from `c.get('userId')` — never from request input. An unauthenticated request is rejected with `{ error: string }` + 401.
7. **Dismiss/un-dismiss** — `POST /api/setup-status/dismiss` (body `{ taskId }`) for an `optional` task persists the dismissal per-user; subsequent status reads show `dismissed: true` for that task. Calling it for a `required` task returns `400 { error }` and changes nothing. A corresponding **un-dismiss** path (`POST /api/setup-status/undismiss`, body `{ taskId }`) restores it (`dismissed: false`).
8. **Tests (`bun:test`, co-located)** — business-logic tests cover each state/tier/dependency/`ready` permutation against an in-memory DB; HTTP contract tests assert response shape + status code, that one user never sees another user's status, and that no raw credential data (key values, ciphertext, tokens) ever appears in any response.

## Tasks / Subtasks

- [x] **Task 1 — Shared schemas** (AC: #1)
  - [x] In `src/shared/schemas.ts` add `setupTaskIdSchema = z.enum([...])`, `setupTaskStateSchema = z.enum([...])`, `setupTaskTierSchema = z.enum([...])`.
  - [x] Add `setupTaskSchema = z.object({ id: setupTaskIdSchema, state: setupTaskStateSchema, tier: setupTaskTierSchema, dependsOn: setupTaskIdSchema.nullable(), dismissed: z.boolean(), progress: z.object({ filled: z.number().int(), total: z.number().int() }).nullable() })`.
  - [x] Add `setupStatusSchema = z.object({ tasks: z.array(setupTaskSchema), ready: z.boolean() })`.
  - [x] Export inferred types: `SetupTaskId`, `SetupTaskState`, `SetupTaskTier`, `SetupTask`, `SetupStatus` via `z.infer`.
  - [x] (Optional but encouraged) export `SETUP_TASK_ORDER` const array `['linkedin','apiKey','profile','inboxConnect','inboxMapping']` so service + tests share one ordering source — keep it co-located with the schemas.
- [x] **Task 2 — Dismissal persistence (new per-user table)** (AC: #7)
  - [x] Add `setupDismissals` Drizzle table to `src/db/schema.ts`: `userId` (int, FK users.id), `taskId` (text), `dismissedAt` (text ISO) — composite PK `[userId, taskId]` (mirror `userSecrets` shape).
  - [x] Generate migration with `bun run db:generate`; verify the emitted SQL uses `CREATE TABLE IF NOT EXISTS` and commit the `.sql` file (see `0028_inbox_folder_mappings.sql` for the per-user table shape).
- [x] **Task 3 — `setup-status` service** (AC: #2,#3,#4,#5)
  - [x] Create `src/server/services/setup-status.ts` exporting `computeSetupStatus(userId: number): SetupStatus`.
  - [x] Read `user_secrets` keyNames for the user once (one query → `Set<string>`), exactly like `api-onboarding.ts /status` (`anthropic_api_key`, `linkedin_storage_state`, `imap_host`/`imap_user`/`imap_pass`, `gmail_refresh_token`).
  - [x] Read profile via `profile.profileData` JSON → parse with `profileDataSchema.safeParse`; count the 6 personal fields (`fullName`, `email`, `phone`, `location`, `summary`, `skills`) that are non-empty after `.trim()`. `filled===6` ⇒ complete; `filled===0` ⇒ notStarted; else partial.
  - [x] `inboxConnect`: complete if (`imap_host`&`imap_user`&`imap_pass`) OR `gmail_refresh_token` present; else notStarted.
  - [x] `inboxMapping`: complete if `count(inbox_folder_mappings WHERE userId)` > 0 OR `count(gmail_label_mappings WHERE userId)` > 0; else notStarted.
  - [x] Load this user's dismissed `taskId`s from `setup_dismissals`; set `dismissed: true` only for `optional` tasks (required tasks always `dismissed: false`).
  - [x] Assemble the `tasks` array in fixed order with correct `tier`/`dependsOn`; attach `progress` only on `profile` (others `null`).
  - [x] Compute `ready` per AC #5 (broken short-circuit first, then required-complete, then optional complete-or-dismissed).
  - [x] **Do NOT implement health/`broken` detection here** — that is Story 48.2. A present credential is `complete`. No task ever resolves to `broken` in this story; keep the `broken` value in the enum and in the `ready` logic for 48.2 to populate. Do not add a speculative health seam/abstraction (project rule: no speculative abstractions).
- [x] **Task 4 — `setup-status` route** (AC: #6,#7)
  - [x] Create `src/server/routes/api-setup-status.ts` (default-export `Hono<AppEnv>`).
  - [x] `GET /` → `c.json(computeSetupStatus(c.get('userId')))` (direct data, no envelope).
  - [x] `POST /dismiss` → parse body `{ taskId }` with `setupTaskIdSchema`; invalid/unknown taskId ⇒ `400 { error }`; if the task is `required` ⇒ `400 { error }` (no write); else upsert into `setup_dismissals` (`onConflictDoNothing`/`onConflictDoUpdate` on PK) and return `c.json(computeSetupStatus(userId))`.
  - [x] `POST /undismiss` → parse `{ taskId }`; delete the `(userId, taskId)` row; return refreshed `computeSetupStatus(userId)`.
  - [x] Mount in `src/index.ts`: `app.route('/api/setup-status', setupStatusRoute)` (no extra `app.use` needed — `/api/*` auth middleware already covers it). Place the import + mount beside the other `/api/*` routes.
- [x] **Task 5 — Tests** (AC: #8)
  - [x] `src/server/services/setup-status.test.ts` (business logic): `process.env.DB_PATH = ':memory:'` at top; create all touched tables via raw SQL in `beforeAll`; `DELETE` in `beforeEach`. Cover: all-empty ⇒ all notStarted & `ready:false`; profile partial `{ filled, total:6 }`; all required complete + optionals not done ⇒ `ready:false`; optionals dismissed ⇒ `ready:true`; `inboxMapping.dependsOn==='inboxConnect'`; tier assignments; order assertion.
  - [x] `src/server/routes/api-setup-status.test.ts` (HTTP contract): wrap the route with a `c.set('userId', 1)` test app and an `authMiddleware` app (see `api-blacklist.test.ts` for the exact two-app pattern). Assert: GET shape + 200; unauth ⇒ 401 with `error` key and no `message` key; user 1 never sees user 2's data; dismiss required ⇒ 400 + unchanged; dismiss optional ⇒ `dismissed:true`; undismiss restores; **no response body field contains a secret value** (assert absence of `ciphertext`/raw key strings).

## Dev Notes

### What this story is (and is NOT)
- **IS:** one server-side, per-user read model + persistence for dismissals + shared contract. Pure *read* of existing setup signals; it changes **nothing** about how any setup page saves its data.
- **IS NOT:** health checks / `broken` detection (Story 48.2), the `useSetupStatus` client hook (48.3), the dropdown/icon (48.4), or sidenav propagation (48.6). Do not pull those forward.

### Source signals to reuse (do not re-implement detection)
`api-onboarding.ts` `GET /status` already derives the exact credential flags — mirror its logic, do not duplicate the route. [Source: src/server/routes/api-onboarding.ts:13-34]
- `hasAnthropicKey` = `keys.has('anthropic_api_key')`
- `hasLinkedinAuth` = `keys.has('linkedin_storage_state')`
- inbox/IMAP = `keys.has('imap_host') && keys.has('imap_user') && keys.has('imap_pass')`
- Gmail = `keys.has('gmail_refresh_token')`

`user_secrets` is `(userId, keyName, ciphertext)` composite-PK per-user store. **Read only `keyName` presence — never decrypt, never select `ciphertext` into the response.** [Source: src/db/schema.ts userSecrets]

### Profile field mapping (must match Epic 43 schema names exactly)
Profile lives as JSON in `profile.profileData`; parse with `profileDataSchema`. The 6 required fields map to `personal.*`: **Name→`fullName`, Email→`email`, Phone→`phone`, Location→`location`, Summary→`summary`, Skills→`skills`**. `phone/location/summary/skills` are `.nullable()`; `fullName/email` are non-nullable but can be `''` (empty profile returns all-empty). Treat empty/whitespace/null as "not present". [Source: src/shared/schemas.ts:230-238 profilePersonalSchema; src/server/routes/api-profile.ts EMPTY_PROFILE_DATA]

### Inbox mapping presence
Two independent per-user mapping tables — a mapping in *either* satisfies `inboxMapping`:
- `inbox_folder_mappings` (IMAP) [Source: src/server/routes/api-config-inbox-mappings.ts]
- `gmail_label_mappings` (Gmail) [Source: src/server/routes/api-config-gmail-mappings.ts]

### Dismissal persistence — why a NEW table
`feature_settings` is **global** (PK = `feature`, no `userId`) and `user_secrets` is for encrypted credentials — neither fits per-user dismissals. Add a dedicated `setup_dismissals` table (composite PK `[userId, taskId]`, same shape as `userSecrets`). This is the "add a migration only if no suitable store exists" branch of the epic dev-note — confirmed: no suitable store exists. [Source: src/db/schema.ts featureSettings (global), userSecrets (PK pattern)]

### Auth & per-user isolation (mandatory invariant)
`userId` comes from `c.get('userId')`, set by `authMiddleware` (honors impersonation). **Never** read user identity from request body/query/params. Every DB read is `WHERE userId = <that id>`. The `/api/*` middleware already returns `{ error: 'Unauthorized' }` + 401 for missing/expired sessions — you do not add auth logic in the route. [Source: src/server/middleware/auth-middleware.ts:8-44; src/index.ts `app.use('/api/*', authMiddleware)`]

### Route mounting
Import + mount in `src/index.ts` alongside the other route mounts (e.g. after `app.route('/api/activity', activityRoute)`): `app.route('/api/setup-status', setupStatusRoute)`. No `emailFeaturesMiddleware` gate — setup-status must be readable regardless of the email-features flag. [Source: src/index.ts:103-128]

### Schema/response shape compliance (project rules — non-negotiable)
- Direct data on success — **no** `{ success, data }` envelope. Errors: `{ error: string }` + status only — never `{ message }`. [project-context.md Hono rules]
- Booleans `true/false`; **nulls explicit** for missing optionals (`progress: null`, `dependsOn: null`) — never `undefined`. Collections are arrays. ISO 8601 strings for `dismissedAt`. [project-context.md Language Rules]
- All shared types imported from `src/shared/schemas.ts` only; Zod schemas suffixed `*Schema`; types via `z.infer`. [project-context.md]
- `console.error` for server errors; `console.log` for errors is forbidden. No comments unless logic is non-obvious; no speculative abstractions/feature flags. [project-context.md Quality Rules]

### Forward-compat for 48.2 (context only — build nothing)
Story 48.2 will make `computeSetupStatus` consult a per-user health cache so a present-but-invalid credential resolves to `broken`, and will emit a `setup-status` event through the **existing** Epic 46 registry/SSE (`activity-registry.ts`). Keep `computeSetupStatus(userId)` a single synchronous function reading current DB state so 48.2 can extend it cleanly. Do not add the cache, the event, or any SSE wiring in this story. [Source: epic-48 Story 48.2; src/server/services/activity-registry.ts]

### Testing standards summary
- `bun:test` only (`describe/test/expect/beforeAll/beforeEach`); files co-located, no `__tests__/`. [project-context.md Testing]
- `process.env.DB_PATH = ':memory:'` as the **first line**, before any prod import; access the underlying sqlite via `(prodDb as unknown as { $client: Database }).$client` and create tables with raw SQL in `beforeAll`; `DELETE` rows in `beforeEach`. [Source: src/server/routes/api-blacklist.test.ts:1-46]
- Two layers: call `computeSetupStatus` directly (business logic) **and** `app.request('/', {...})` against the real handler (HTTP contract). Assert both body shape and status code; assert error bodies have `error` and **not** `message`. [project-context.md Testing]

### Project Structure Notes
- New files: `src/server/services/setup-status.ts`, `src/server/routes/api-setup-status.ts`, two co-located `*.test.ts`, one migration `.sql`.
- Edited files: `src/shared/schemas.ts` (append schemas), `src/db/schema.ts` (add table), `src/index.ts` (import + mount).
- Naming: service/route files kebab-case; route param convention is `:id` only — this story avoids path params by using body `{ taskId }`, which is consistent and dodges the `:taskId` naming friction.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-48-notifications-dropdown-top-nav-cluster.md#Story 48.1] (ACs + architecture note + dev note)
- [Source: _bmad-output/project-context.md] (Hono/Drizzle/Zod/TanStack/testing rules)
- [Source: src/server/routes/api-onboarding.ts:13-34] (credential-presence derivation)
- [Source: src/server/routes/api-profile.ts; src/shared/schemas.ts:230-256] (profile fields)
- [Source: src/server/routes/api-config-inbox-mappings.ts; src/server/routes/api-config-gmail-mappings.ts] (mapping presence)
- [Source: src/server/middleware/auth-middleware.ts; src/index.ts] (auth + mounting)
- [Source: src/db/schema.ts; src/db/migrations/0028_inbox_folder_mappings.sql] (per-user table + migration pattern)
- [Source: src/server/routes/api-blacklist.test.ts] (two-app test scaffold + per-user isolation assertion)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- New tests pass in isolation (22/22) but full suite jumped 40→44 fails. Root cause: shared in-memory sqlite singleton across `bun:test` files — my `profile` test DDL omitted `UNIQUE(user_id)`, so whichever file's `CREATE TABLE IF NOT EXISTS` ran first won, and api-profile's upsert (`onConflictDoUpdate` on user_id) broke when my no-unique-constraint table existed first. Fixed by mirroring api-profile's exact DDL (`UNIQUE(user_id)`) in both setup-status test files. Other shared tables already matched conventions (user_secrets PK matches api-onboarding; gmail/inbox mappings match api-config-gmail-mappings, no unique index in test DDL; setup_dismissals + inbox_folder_mappings only created by these tests). Full suite back to 40 baseline fails.

### Completion Notes List

- **AC1** — `src/shared/schemas.ts`: added `setupTaskIdSchema`/`setupTaskStateSchema`/`setupTaskTierSchema` enums, `setupTaskSchema`, `setupStatusSchema`, inferred types (`SetupTaskId/State/Tier/Task/Status`), and `SETUP_TASK_ORDER` const as the single ordering source.
- **AC2/3/4/5** — `src/server/services/setup-status.ts`: `computeSetupStatus(userId)` derives each task from existing signals only (one `user_secrets` keyName query mirroring `api-onboarding /status`; profile via `profileDataSchema.safeParse` of `profile.profileData`, counting 6 trimmed `personal.*` fields; inbox connect = IMAP triple OR gmail refresh token; inbox mapping = any folder OR label mapping). Fixed order via `SETUP_TASK_ORDER`; tiers/`dependsOn` from const maps (`inboxMapping.dependsOn === 'inboxConnect'`); `ready` = `!anyBroken && allRequiredComplete && allOptionalCompleteOrDismissed`. No `broken`/health detection (left for 48.2); `broken` retained in enum + ready logic. `progress` attached only on `profile`.
- **AC6/7** — `src/server/routes/api-setup-status.ts`: `GET /` returns direct `computeSetupStatus(userId)` (no envelope), user from `c.get('userId')`. `POST /dismiss` validates `taskId` via `setupTaskIdSchema` (400 on invalid), rejects required tasks with 400 (no write), else `onConflictDoNothing` upsert into `setup_dismissals` and returns refreshed status. `POST /undismiss` deletes the `(userId, taskId)` row and returns refreshed status. Mounted at `/api/setup-status` in `src/index.ts` under existing `/api/*` auth middleware (401 `{ error }` handled there; no email-features gate).
- **AC7 storage** — new per-user `setup_dismissals` table (composite PK `[userId, taskId]`, mirroring `userSecrets`); migration `0038_spooky_harry_osborn.sql` hand-edited to `CREATE TABLE IF NOT EXISTS` for idempotent boot migration.
- **AC8** — two co-located test files: business-logic (`setup-status.test.ts`, 16 tests) + HTTP contract (`api-setup-status.test.ts`, 6 tests). Cover every state/tier/dependency/`ready` permutation, per-user isolation (user 1 never sees user 2), and no-secret-leak (response never contains ciphertext value or the literal `ciphertext`). 22/22 pass.
- **Validation** — `tsc --noEmit`: 87 errors, all pre-existing baseline; zero in any story-touched file. Full `bun test`: 505 pass / 40 fail (the 40 are pre-existing env/network-dependent baseline fails; +22 net new tests, zero regressions). `bun run build` green.

### File List

- `job-hunt-dashboard/src/shared/schemas.ts` (modified — appended setup-status schemas + types + `SETUP_TASK_ORDER`)
- `job-hunt-dashboard/src/db/schema.ts` (modified — added `setupDismissals` table)
- `job-hunt-dashboard/src/db/migrations/0038_spooky_harry_osborn.sql` (new — `setup_dismissals` table, IF NOT EXISTS)
- `job-hunt-dashboard/src/db/migrations/meta/_journal.json` (modified — drizzle journal entry for 0038)
- `job-hunt-dashboard/src/db/migrations/meta/0038_snapshot.json` (new — drizzle snapshot)
- `job-hunt-dashboard/src/server/services/setup-status.ts` (new — `computeSetupStatus`)
- `job-hunt-dashboard/src/server/services/setup-status.test.ts` (new — business-logic tests)
- `job-hunt-dashboard/src/server/routes/api-setup-status.ts` (new — GET/dismiss/undismiss route)
- `job-hunt-dashboard/src/server/routes/api-setup-status.test.ts` (new — HTTP contract tests)
- `job-hunt-dashboard/src/index.ts` (modified — import + mount `/api/setup-status`)

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-30 | Implemented Story 48.1 — setup-status shared types, `computeSetupStatus` service, `/api/setup-status` route (GET/dismiss/undismiss), `setup_dismissals` table + migration 0038, and co-located business-logic + HTTP contract tests. tsc zero-new (87 baseline), full suite 505 pass / 40 pre-existing fails, build green. Status → review. |

## Review Findings

_Code review 2026-06-30 (3 layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). All 8 ACs verified MET by the Acceptance Auditor. 1 patch, 1 defer, 9 dismissed as noise/by-design._

- [x] [Review][Patch] `/dismiss` recomputes full setup status twice per request [job-hunt-dashboard/src/server/routes/api-setup-status.ts:24-25] — FIXED: exported `SETUP_TASK_TIER` from the service and replaced the `computeSetupStatus(...).tasks.find(...)` tier lookup in the dismiss guard with `SETUP_TASK_TIER[taskId] === 'required'`, removing the redundant DB derivation (and the now-unnecessary `!task` check, since `taskId` is already enum-validated). 22/22 setup-status tests pass; tsc clean. Source: blind+auditor.
- [x] [Review][Defer] Invalid-but-present credentials/profile surface as `notStarted`, never `broken` [job-hunt-dashboard/src/server/services/setup-status.ts] — deferred, Story 48.2 scope. A profile blob that fails `profileDataSchema.safeParse` (only reachable via legacy/external DB writes — the app save path is gated by the identical schema) and a partially-entered IMAP credential set both resolve to `notStarted` rather than `broken`. The `broken` enum value and the `!anyBroken` term in `ready` are intentionally retained for 48.2, which adds per-user health detection. No action this story. Source: blind+edge.
