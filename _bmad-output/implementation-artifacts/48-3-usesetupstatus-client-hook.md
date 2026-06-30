---
baseline_commit: d2d007b14a16e36bb8d4425a9347e5ae9796d6f2
---

# Story 48.3: `useSetupStatus` Client Hook

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the front-end,
I want a hook that maintains live setup status from the query snapshot plus SSE updates,
so that the icon badge, dropdown, and sidenav all read one push-driven source with no duplicated state.

## Acceptance Criteria

1. **Hook + initial snapshot + SSE subscription** — a new hook `src/client/hooks/useSetupStatus.ts` loads the initial snapshot from `GET /api/setup-status` via TanStack Query (key **exactly** `['setup-status']`) and subscribes to the named `setup-status` event on the **existing** Epic 46 EventSource (`/api/activity/stream`). It exposes `{ tasks, ready, badge }` where `badge` is `'none' | 'dot' | 'alert'`.
2. **Reactive invalidation on setup mutations** — when a setup mutation succeeds anywhere in the app (LinkedIn connect, API key save, profile save, inbox connect/disconnect, inbox/Gmail mapping save), `['setup-status']` is invalidated alongside its existing `['onboarding-status']`/`['profile']`/mapping invalidations, so the hook reflects the new status with no stale phantom tasks.
3. **SSE event drives state via the single query cache** — when a `setup-status` SSE event arrives (a background broken/healthy transition from Story 48.2), its `data` is validated against the shared `setupStatusSchema`; on success the validated `SetupStatus` becomes the hook's state. Status lives **only** in the `['setup-status']` query cache — no duplicate copy in component `useState`, no direct `fetch('/api/...')` in components. An event whose payload fails schema validation is ignored (no state change, no throw).
4. **`badge` derivation (single shared rule)** — `badge` is `'alert'` if any task is `broken` **OR** any `required` task is incomplete (`state !== 'complete'`); `'dot'` if all required tasks are complete but an optional task is still pending (present, `state !== 'complete'`, and not `dismissed`); `'none'` if `ready` is `true`. The rule is computed in **one** exported pure function so the icon (48.4) and any other consumer share it.
5. **Exactly one EventSource (no second connection)** — the hook does **not** open a new `EventSource`. It consumes the **same single** Epic 46 connection that `useActivityStream` uses. When the underlying connection errors and reconnects (reconnect/backoff is owned by the shared connection, not duplicated here), `useSetupStatus` resumes from the latest query snapshot + resumed events. On unmount the hook removes its `setup-status` listener with **no leaked subscribers** and without tearing down the connection for other consumers still mounted.
6. **Tests (`bun:test`, co-located)** — co-located `useSetupStatus.test.ts` unit-tests the exported pure functions (badge derivation across every `none`/`dot`/`alert` permutation incl. broken-vs-required-incomplete, optional-pending, dismissed-optional, and `ready`; plus the SSE-payload parse function for valid snapshot / malformed JSON / schema-invalid object). No React DOM harness is added (none exists in the repo — Epic 46 convention); the hook body/subscription/query wiring is verified by `tsc`, build, and the existing `ActivityIndicator` continuing to work (regression guard for the shared-connection refactor).

## Tasks / Subtasks

- [x] **Task 1 — Extract the single EventSource into a shared connection manager** (AC: #1, #3, #5)
  - [x] Create `src/client/lib/activity-stream.ts`: a **module-level singleton** that owns exactly one `EventSource('/api/activity/stream')`, plus the reconnect/backoff logic currently inlined in `useActivityStream` (`RECONNECT_BASE_MS = 1_000`, `RECONNECT_MAX_MS = 30_000`, reset-to-base on `onopen`, manual reconnect only when `readyState === EventSource.CLOSED`). Expose `subscribeActivityStream(event: 'snapshot' | 'update' | 'setup-status', handler: (ev: MessageEvent) => void): () => void` that: lazily opens the connection on the first subscriber, `addEventListener(event, handler)`, ref-counts subscribers, and on the returned unsubscribe `removeEventListener(event, handler)` + closes the connection (and clears any pending reconnect timer) only when the **last** subscriber leaves. [Source: src/client/hooks/useActivityStream.ts:1-63 — reconnect/backoff/teardown to migrate verbatim]
  - [x] **Refactor `useActivityStream` to consume the manager** without changing its public API: it must still return `{ runs, isActive }` and still parse via `parseRuns`/`computeIsActive`. Replace its inline `new EventSource(...)` + reconnect effect with two `subscribeActivityStream('snapshot', handle)` / `subscribeActivityStream('update', handle)` subscriptions cleaned up on unmount. `ActivityIndicator.tsx` (its only consumer) must remain untouched and keep working. [Source: src/client/components/shared/ActivityIndicator.tsx:36 — sole consumer, `const { runs, isActive } = useActivityStream()`]
  - [x] Result invariant: with both `ActivityIndicator` (activity) and the future Notifications icon (setup-status) mounted, there is **exactly one** `EventSource` and one server stream — preserving Story 48.2's "no second EventSource, one per-user stream + one health-check interval lifecycle" constraint. Do **not** reshape or rename the `snapshot`/`update` events or the `runs` payload.
- [x] **Task 2 — `useSetupStatus` hook** (AC: #1, #3, #4, #5)
  - [x] Create `src/client/hooks/useSetupStatus.ts`. Query: `useQuery<SetupStatus>({ queryKey: ['setup-status'], queryFn: fetchSetupStatus, staleTime: 0 })`, mirroring `useOnboardingStatusQuery`. `fetchSetupStatus()` does `fetch('/api/setup-status')`, throws on `!res.ok`, and returns `setupStatusSchema.parse(await res.json())` (validate the response — shared-type discipline; mirror `useProfileMutation`'s `profileDataSchema.parse`). Export `fetchSetupStatus` so a route loader could prefetch later. [Source: src/client/hooks/useOnboardingStatusQuery.ts:1-16; src/client/hooks/useProfileMutation.ts (response `.parse`)]
  - [x] SSE wiring inside a `useEffect(..., [])`: `subscribeActivityStream('setup-status', handler)` where `handler` runs `parseSetupStatus(ev.data)`; on a non-null result, write it into the cache with `queryClient.setQueryData(['setup-status'], parsed)` (the SSE payload **is** the full authoritative snapshot — see Dev Notes "setQueryData is intentional & documented"). On a null result, ignore (no state change). Return the unsubscribe from the effect so the listener is removed on unmount (AC5 — no leaked subscribers). Use the singleton `queryClient` from `@/lib/query-client`. [Source: src/client/lib/query-client.ts; AC3]
  - [x] Derive and return: `const { data } = useQuery(...)`, `const tasks = data?.tasks ?? []`, `const ready = data?.ready ?? false`, `const badge = computeBadge(data)`. Return `{ tasks, ready, badge }`. Do **not** introduce a `useState` mirror of the status — the `['setup-status']` query cache is the single source (AC3). [Source: _bmad-output/project-context.md "Server state lives in TanStack Query only — never duplicate in useState"]
- [x] **Task 3 — Exported pure functions** (AC: #4, #6)
  - [x] `export function parseSetupStatus(data: string): SetupStatus | null` — `JSON.parse` in a try/catch (return `null` on throw), then `setupStatusSchema.safeParse`; return `result.success ? result.data : null`. Mirror `parseRuns` exactly. [Source: src/client/hooks/useActivityStream.ts:7-16]
  - [x] `export function computeBadge(status: SetupStatus | undefined): 'none' | 'dot' | 'alert'` — order matters: if `!status` ⇒ `'none'`; else if `status.ready` ⇒ `'none'`; else if `status.tasks.some((t) => t.state === 'broken')` **or** `status.tasks.some((t) => t.tier === 'required' && t.state !== 'complete')` ⇒ `'alert'`; else ⇒ `'dot'`. (Reaching the final `'dot'` means `ready` is false with no broken task and all required complete — i.e. an optional is pending/undismissed, matching AC4.) [Source: AC4; src/shared/schemas.ts:396-408 — `SetupTask` fields `state`/`tier`/`dismissed`]
- [x] **Task 4 — Add `['setup-status']` invalidation to the existing setup mutations** (AC: #2)
  - [x] `src/client/routes/config/connections-api-key.tsx:41` — after the existing `await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })`, also invalidate `['setup-status']`.
  - [x] `src/client/routes/config/connections-linkedin.tsx:23` — after the `['onboarding-status']` invalidation in the captured-session effect, also invalidate `['setup-status']`.
  - [x] `src/client/routes/config/connections-inbox.tsx:76` and `:114` — at both `['onboarding-status']` invalidation sites (IMAP save + Gmail disconnect paths), also invalidate `['setup-status']`.
  - [x] `src/client/hooks/useGmailConnection.ts:27` — after the `['onboarding-status']` invalidation, also invalidate `['setup-status']`.
  - [x] `src/client/hooks/useProfileMutation.ts` `onSuccess` — alongside `['profile']`, also invalidate `['setup-status']` (profile completeness feeds the `profile` task). [Source: src/client/hooks/useProfileMutation.ts:22-24]
  - [x] `src/client/hooks/useInboxMappingsMutation.ts` and `src/client/hooks/useGmailMappingsMutation.ts` `onSuccess` — alongside `['inbox-mappings']` / `['gmail-mappings']`, also invalidate `['setup-status']` (mapping existence feeds the `inboxMapping` task). [Source: src/client/hooks/useInboxMappingsMutation.ts:22-24; src/client/hooks/useGmailMappingsMutation.ts:22-24]
  - [x] **Do NOT** create a dismiss mutation here — `POST /api/setup-status/dismiss` already exists (Story 48.1) but its client mutation/UI is built in Story 48.4; that mutation will invalidate `['setup-status']` when added. Onboarding-wizard saves (`src/client/routes/onboarding.tsx:106`) may also add the invalidation for consistency, but the hook is not mounted there — leave it unless trivially adjacent.
- [x] **Task 5 — Tests** (AC: #6)
  - [x] Create `src/client/hooks/useSetupStatus.test.ts` (`bun:test`: `describe/test/expect`), importing `{ parseSetupStatus, computeBadge }` from `./useSetupStatus`. Mirror the structure of `useActivityStream.test.ts`. Add a small `task(partial)` factory returning a valid `SetupTask`.
  - [x] `parseSetupStatus`: valid full snapshot string ⇒ deep-equals the object; `'{not json'` ⇒ `null`; a schema-invalid object (e.g. `{"tasks":[{"id":"x"}],"ready":true}` or missing `ready`) ⇒ `null`; non-object array ⇒ `null`.
  - [x] `computeBadge`: `undefined` ⇒ `'none'`; `ready:true` ⇒ `'none'`; a `broken` task (required or optional) ⇒ `'alert'`; an incomplete required task with no broken ⇒ `'alert'`; all required complete + a pending undismissed optional + `ready:false` ⇒ `'dot'`; all required complete + only a **dismissed** optional pending but `ready:false` (edge) ⇒ assert the literal AC outcome and note it (see Dev Notes "dismissed-broken / dismissed-optional nuance").
  - [x] **Do NOT** add `@testing-library/*` or any React DOM test harness — none exists in the repo (Epic 46 convention). Test only the exported pures. [Source: src/client/hooks/useActivityStream.test.ts — pures-only precedent]

## Review Findings

_Code review 2026-06-30 — 3-layer (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Acceptance Auditor: PASS, all 6 ACs MET. Findings all concentrate in the new `activity-stream.ts` singleton's reconnect/refcount lifecycle._

- [x] [Review][Patch] (applied) `connect()` never clears a pending reconnect timer → duplicate/leaked EventSource [src/client/lib/activity-stream.ts:27] — After `onerror` nulls `source` and arms `reconnectTimer = setTimeout(connect, delay)`, a new subscriber arriving in that window hits `if (!source) connect()` and opens a fresh `EventSource` **without** clearing the pending timer; when the timer later fires, `connect()` runs again and overwrites `source`, orphaning the first connection (open, listeners attached, never `.close()`d). Reachable once `useSetupStatus` (48.4) and `useActivityStream` mount/unmount independently. Fix: at the top of `connect()`, `if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }` (also resolves the stale already-fired timer handle never being nulled). (blind+edge)
- [x] [Review][Patch] (applied) Unsubscribe is not idempotent — unguarded `subscriberCount--` can desync the refcount [src/client/lib/activity-stream.ts:70] — The returned cleanup does `set.delete(handler); subscriberCount--` with no guard; `set.delete` is idempotent but the decrement is not. A double-invoked cleanup drives the count negative, so `subscriberCount === 0` is never satisfied again and `teardown()` never runs (permanent leak of the shared `EventSource`). Fix: latch with `let done = false; if (done) return; done = true;` and only decrement when `set.delete(handler)` returns `true`. (blind+edge)
- [x] [Review][Patch] (applied) Empty per-event listener `Set` left in `listeners` map → dispatcher re-attached for zero-listener events on reconnect [src/client/lib/activity-stream.ts:71] — When the last handler for an event is removed, the now-empty `Set` stays in `listeners`; on the next `connect()` the loop over `listeners.keys()` re-adds a dispatcher for the dead event. Functionally inert (dispatcher iterates an empty set) but accumulating cruft. Fix: `if (set.size === 0) listeners.delete(event)` in the unsubscribe. (blind+edge+auditor)
- [x] [Review][Defer] Last-subscriber teardown thrashes the shared connection on transient `subscriberCount === 0` [src/client/lib/activity-stream.ts:76] — deferred, design choice (StrictMode double-mount / route swap closes+reopens the stream; not triggered in prod today — `ActivityIndicator` stays mounted in `Layout`)
- [x] [Review][Defer] No surfaced error / silent infinite reconnect on permanent connection failure [src/client/lib/activity-stream.ts:36] — deferred, pre-existing (behavior migrated verbatim from `useActivityStream`; auth-expiry error surfacing already deferred in 46.5/48.2)
- [x] [Review][Defer] `activity-stream.ts` reconnect/refcount/teardown lifecycle has no unit tests [src/client/lib/activity-stream.ts] — deferred, the one file with real concurrency is untested (AC6 is pures-only per Epic 46 no-DOM-harness convention; a focused EventSource-mock test would cover the patched lifecycle)

**Dismissed (8) as noise / by-design / false-positive:** (1) `computeBadge` returns `'dot'` for empty-tasks + `ready:false` — defined fall-through behavior, server always sends full `SETUP_TASK_ORDER`; (2) SSE `setQueryData` vs mutation `invalidateQueries` race on `['setup-status']` — by-design, same authoritative shape, documented in Dev Notes ("idempotent, not a double-render bug"); (3) "`setup-status` event never emitted" (Blind, no server access) — false positive, server emits it (shipped 48.2, Auditor-verified `api-activity.ts:27`); (4) unawaited `invalidateQueries` in some `onSuccess` — matches each file's pre-existing adjacent pattern, standard RQ; (5) `isActive` stale/hardcoded after refactor — verified correctly derived via `computeIsActive(runs)`; (6) `removeEventListener` reference fragility — verified correct via memoized `getDispatcher`; (7) `router.ts` route-registration gap for renamed routes — out of 48.3 scope (Epic 47); (8) AC4 dismissed-optional still yields `'dot'` — intentional, documented (Task 3 / Dev Notes), and locked by a test.

## Dev Notes

### What this story is (and is NOT)
- **IS:** the client `useSetupStatus` hook (query snapshot + live `setup-status` SSE updates, exposing `{ tasks, ready, badge }`), the shared single-EventSource refactor that lets it piggyback on the Epic 46 stream, and adding `['setup-status']` invalidation to the existing setup mutations.
- **IS NOT:** the Notifications icon/dropdown (48.4), the user menu (48.5), or the sidenav dot propagation / badge retirement (48.6). This story renders **no new UI** — its only visible surface is the unchanged `ActivityIndicator` (which must keep working). The dismiss button/mutation is 48.4. No server changes (the `GET /api/setup-status` route, the `setup-status` SSE event, and the health cache all already exist from 48.1/48.2).

### The crux: exactly one EventSource (hard constraint inherited from 48.2)
Story 48.2 established and repeatedly enforced: **there is exactly one per-user `EventSource`** (`/api/activity/stream`), and the per-user health-check interval is ref-counted to that stream's subscribe/abort. Today `useActivityStream` owns that single connection inline (`src/client/hooks/useActivityStream.ts:38`, the **only** `new EventSource(...)` in the client). If `useSetupStatus` opened its own `EventSource`, there would be **two** server streams and the 48.2 health interval refcount would double — explicitly forbidden ("no second EventSource, no polling endpoint").
- **Decision (recommended): extract a module-level singleton connection manager** (`src/client/lib/activity-stream.ts`) that owns the one `EventSource` + reconnect/backoff and exposes `subscribeActivityStream(event, handler)`; refactor `useActivityStream` to consume it (public API unchanged) and have `useSetupStatus` subscribe to the `setup-status` event. This matches the codebase's existing singleton idiom (`queryClient`, `db`, the server `activityRegistry`) and the epic dev-note: *"Do not open a new EventSource — consume the Epic 46 stream … by registering an additional event listener on the same connection."*
- **Alternative considered (not recommended):** a React `ActivityStreamProvider` context at app root. Also valid, but more wiring and still requires refactoring `useActivityStream`; the module singleton is lower-ceremony and consistent with the project's no-global-store-but-yes-module-singleton pattern. If you choose the context approach, document why in Completion Notes.
- **Regression guard:** the `snapshot`/`update` event names and the `runs` payload must be untouched (the server emits them and `useActivityStream`/`ActivityIndicator` consume them). After refactor, manually confirm `bun run dev` → the Activity indicator still lists runs and pulses (proves the shared connection still delivers the activity channel).

### `setQueryData` here is intentional & documented (project rule compliance)
Project rule: *"Never use `queryClient.setQueryData` without a documented invalidation strategy."* This story satisfies that:
- The `setup-status` SSE event carries the **full authoritative `SetupStatus` snapshot** (Story 48.2 emits `computeSetupStatus(userId)` over the channel). So on an event we validate and `setQueryData(['setup-status'], parsed)` — adopting the server's pushed truth directly (AC3: *"its data is validated against the shared setupStatus schema and the hook's state updates accordingly"*). This avoids an extra round-trip when the server already handed us the new state.
- The **invalidation** strategy is AC2: every setup mutation invalidates `['setup-status']`, triggering a refetch through `fetchSetupStatus`. So the cache is fed by (a) initial query, (b) mutation-invalidation refetches, (c) authoritative SSE snapshots — all the same shape, single source of truth. (If you prefer to avoid `setQueryData` entirely, calling `queryClient.invalidateQueries({ queryKey: ['setup-status'] })` in the SSE handler also satisfies AC3's "updates accordingly" at the cost of a refetch per transition — but the pushed payload makes `setQueryData` the literal, cheaper reading of the AC. Recommended: `setQueryData`.)

### `badge` rule — follow AC4 literally; note the dismissed nuance
AC4's `'alert'` clause is *"any task is `broken` OR any required task is incomplete"* — it does **not** exclude dismissed tasks. Implement it literally: a `broken` task (even a dismissed optional) yields `'alert'`. This is in mild tension with the 48.2 product decision that a *dismissed* broken optional should not block global `ready` (48.2 made `ready` ignore `dismissed && broken`). They are different signals: `ready` (server) vs `badge` (this hook). Implement `badge` exactly as AC4 states, and add the dismissed-broken case to the badge test asserting the literal `'alert'` outcome. If the product owner later wants dismissed-broken to be quieter, that is a one-line change isolated in `computeBadge` — flag it in Completion Notes rather than pre-deciding here.

### Exact data contract (already shipped — do not redefine)
- Import `setupStatusSchema`, `type SetupStatus`, `type SetupTask` from `@shared/schemas` (NEVER redefine inline). `SetupTask = { id, state, tier, dependsOn, dismissed, progress }`; `state ∈ notStarted|partial|complete|broken`; `tier ∈ required|optional`. `SetupStatus = { tasks: SetupTask[], ready: boolean }`. [Source: src/shared/schemas.ts:390-414]
- `GET /api/setup-status` returns the direct `SetupStatus` object (no envelope) under `/api/*` auth; unauth ⇒ `{ error }`. [Source: src/server/routes/api-setup-status.ts; src/index.ts:130]
- The SSE event name is exactly `setup-status` and its `data` is `JSON.stringify(SetupStatus)`. [Source: src/server/routes/api-activity.ts:27]

### Existing patterns to mirror (do not re-invent)
- **Query hook shape:** `useOnboardingStatusQuery` — `useQuery({ queryKey, queryFn, staleTime: 0 })` + a standalone exported `fetch*` fn that throws on `!res.ok`. [Source: src/client/hooks/useOnboardingStatusQuery.ts:1-16]
- **SSE parse pure + state replace:** `parseRuns`/`computeIsActive` + wholesale `setRuns(parsed)` replace (server always sends full snapshots — no merge-by-id). `parseSetupStatus`/`computeBadge` mirror this. [Source: src/client/hooks/useActivityStream.ts:7-62]
- **Response validation with shared schema:** `useProfileMutation` does `profileDataSchema.parse(await res.json())`. Do the same for `fetchSetupStatus`. [Source: src/client/hooks/useProfileMutation.ts]
- **Singleton queryClient import:** `import { queryClient } from '@/lib/query-client'` (used in `useInboxMappingsMutation`/`useGmailMappingsMutation`); inside components/route files the existing code uses a `queryClient` already in scope. [Source: src/client/lib/query-client.ts; src/client/hooks/useInboxMappingsMutation.ts]

### Project rules that bite here (non-negotiable)
- **TanStack Query is the only home for server state** — no `useState` mirror of `tasks`/`ready`; the `['setup-status']` cache is the source. [Source: project-context.md React rules]
- **Never `fetch('/api/...')` directly in components** — components consume `useSetupStatus`; the `fetch` lives in the hook's `queryFn`. [Source: project-context.md]
- **Query key shape is frozen by convention** — use the literal `['setup-status']` everywhere (matches the epic dev-note); never invent a parameterized variant. [Source: epic-48 Story 48.3 dev-note; project-context.md Query key rules]
- **Path aliases:** `@shared/*` → `src/shared/*`, `@/*` → `src/client/*`. Hook file is `camelCase` `useSetupStatus.ts`; lib file is `kebab-case` `activity-stream.ts`. [Source: project-context.md Naming/Path aliases]
- **TS strict (`noUnusedLocals`/`noUnusedParameters`)** — no unused imports/vars; don't suppress with `_`. [Source: project-context.md]
- **No comments unless non-obvious; no speculative abstractions/feature flags.** [Source: project-context.md]

### Previous-story intelligence (48.2, just completed)
- 48.2 wired the **server** side: `setup-status` SSE event over the single stream, the per-user health cache, and `computeSetupStatus` reporting `broken`. It explicitly **deferred** all client/query-invalidation work to *this* story (48.2 Task 7: *"Do NOT add `['setup-status']` query invalidation here — that belongs to Story 48.3"*). So AC2 of this story is the deferred half coming due.
- 48.2 review confirmed `clear()` emits nothing by design, *"user-action paths refetch via 48.3"* — i.e. credential **removal** (disconnect) won't push an SSE event; it relies on this story's mutation invalidation (AC2) to refresh the badge. That's why the inbox **disconnect** path (`connections-inbox.tsx:114`, `useGmailConnection.ts:27`) must invalidate `['setup-status']`, not just the connect paths.
- 48.2 emits a healthy `setup-status` on credential-save success (repair path) — so after a save, the hook gets **both** an SSE push (from the server markHealthy transition) **and** a mutation-invalidation refetch (AC2). Both converge on the same cache key with the same shape; this is fine (idempotent), not a double-render bug to "fix".

### Testing standards summary
- `bun:test` only (`describe/test/expect`); co-located `useSetupStatus.test.ts` beside the hook; no `__tests__/`. [Source: project-context.md Testing]
- **No React DOM harness in the repo** (Epic 46/46.5/46.6 precedent — `useActivityStream`/`ActivityIndicator` unit-test only exported pures). Test `parseSetupStatus` + `computeBadge`; do **not** add a render library or attempt to mount the hook. [Source: src/client/hooks/useActivityStream.test.ts; epic notes 46.5/46.6]
- These are pure-function tests over in-memory objects — no DB, so no `DB_PATH=':memory:'`/DDL needed (unlike server tests).

### Baselines (your bar is zero-new)
- `tsc --noEmit`: **87** pre-existing errors baseline (per 48.2 completion). Introduce **zero** new in any touched file; re-confirm the count before/after. [Source: 48-2 story Dev Notes/Baselines; sprint-status 48.2 done note]
- Full `bun test`: ~**505 pass / ~40 pre-existing** env/shared-`:memory:` fails (flaky run-to-run). Your new pure tests add to the pass count with **zero regressions** in touched files. [Source: 48-2 Debug Log]
- `bun run build`: green. After the `useActivityStream` refactor, **manually** confirm via `bun run dev` that the Activity indicator still streams (the only runtime regression risk). [Source: 48-2 Validation]

### Project Structure Notes
- **New files:** `src/client/hooks/useSetupStatus.ts`, `src/client/hooks/useSetupStatus.test.ts`, `src/client/lib/activity-stream.ts`.
- **Edited files:** `src/client/hooks/useActivityStream.ts` (consume the shared manager; public API unchanged), `src/client/hooks/useProfileMutation.ts`, `src/client/hooks/useInboxMappingsMutation.ts`, `src/client/hooks/useGmailMappingsMutation.ts`, `src/client/hooks/useGmailConnection.ts`, `src/client/routes/config/connections-api-key.tsx`, `src/client/routes/config/connections-linkedin.tsx`, `src/client/routes/config/connections-inbox.tsx` (all: add `['setup-status']` invalidation).
- **No** server changes, **no** new route, **no** migration, **no** new shared schema (all server pieces shipped in 48.1/48.2). **No** new `EventSource`.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-48-notifications-dropdown-top-nav-cluster.md#Story 48.3] (ACs + architecture note + dev note)
- [Source: _bmad-output/implementation-artifacts/48-2-proactive-credential-health-checks-broken-state-events-via-activity-sse.md] (server SSE/health contract, deferred client-invalidation handoff, single-EventSource constraint, baselines)
- [Source: _bmad-output/implementation-artifacts/48-1-setup-status-source-of-truth-shared-types-optional-task-dismissals.md] (setup-status schema + route + dismiss endpoints)
- [Source: src/shared/schemas.ts:390-414] (`setupStatusSchema`, `SetupStatus`, `SetupTask`, `SETUP_TASK_ORDER`)
- [Source: src/client/hooks/useActivityStream.ts] (single EventSource + reconnect/backoff to extract; `parseRuns`/`computeIsActive` pures to mirror)
- [Source: src/client/components/shared/ActivityIndicator.tsx:36] (sole `useActivityStream` consumer — must remain untouched)
- [Source: src/client/hooks/useOnboardingStatusQuery.ts] (query-hook shape to mirror)
- [Source: src/client/hooks/useProfileMutation.ts; useInboxMappingsMutation.ts; useGmailMappingsMutation.ts; useGmailConnection.ts] (mutation invalidation insertion points)
- [Source: src/client/routes/config/connections-api-key.tsx:41; connections-linkedin.tsx:23; connections-inbox.tsx:76,114] (route-level invalidation insertion points)
- [Source: src/server/routes/api-setup-status.ts; src/server/routes/api-activity.ts:27; src/index.ts:130] (GET route + `setup-status` SSE event already shipped)
- [Source: src/client/lib/query-client.ts] (singleton queryClient)
- [Source: _bmad-output/project-context.md] (TanStack Query / React / naming / testing / type-safety rules)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `bunx tsc --noEmit`: **87** errors — exactly the 48.2 baseline, **zero new**. Confirmed none of the 11 touched files appear in the error list (grep over the captured output returned no matches).
- `bun run build`: green (Vite build succeeded; only the pre-existing >500 kB chunk-size advisory).
- New + regression hook tests (`useSetupStatus.test.ts` + `useActivityStream.test.ts`): **23 pass / 0 fail** (12 new + 11 existing).
- Full `bun test`: **550 pass / 42 fail** (1582 assertions). The 42 failures are the documented pre-existing shared `:memory:` singleton flakes (HTTP-contract / scraper / discovery / onboarding server tests) — none are in any file touched by this story (all touched files are client-side). Pass count rose from the ~505 baseline by the 12 new pure tests plus normal run-to-run variance.

### Completion Notes List

- **Single-EventSource refactor (Decision: module-level singleton — the recommended option in Dev Notes).** Created `src/client/lib/activity-stream.ts`, a module singleton owning the one `EventSource('/api/activity/stream')` plus the reconnect/backoff migrated verbatim from `useActivityStream` (`RECONNECT_BASE_MS=1_000`, `RECONNECT_MAX_MS=30_000`, reset-to-base on `onopen`, manual reconnect only on `readyState === CLOSED`). `subscribeActivityStream(event, handler)` ref-counts subscribers across a per-event dispatcher; it lazily opens the connection on the first subscriber, attaches a stable dispatcher per event, and on the returned unsubscribe removes the handler — closing the connection (and clearing any pending reconnect timer) only when the **last** subscriber leaves. Chose this over the `ActivityStreamProvider` context per the Dev Notes recommendation and the project's "module-singleton, no global store" idiom (mirrors `queryClient`, `db`, server `activityRegistry`).
- **`useActivityStream` public API unchanged** — still returns `{ runs, isActive }`, still parses via `parseRuns`/`computeIsActive`; the inline `new EventSource` + reconnect effect was replaced by two `subscribeActivityStream('snapshot'|'update', handle)` subscriptions cleaned up on unmount. `ActivityIndicator.tsx` was **not** touched. The `snapshot`/`update` event names and `runs` payload are untouched.
- **`setQueryData` is the documented strategy (AC3):** the `setup-status` SSE event carries the full authoritative `SetupStatus` snapshot, so the handler validates via `parseSetupStatus` and adopts it directly with `queryClient.setQueryData(['setup-status'], parsed)`; a `null` (malformed/schema-invalid) result is ignored. The complementary invalidation strategy is AC2 — every setup mutation invalidates `['setup-status']`.
- **`computeBadge` implements AC4 literally** — a `broken` task (even a dismissed optional) yields `'alert'`; this is intentionally distinct from the server `ready` signal (which ignores dismissed-broken). Flagged here per Dev Notes: if the product owner later wants dismissed-broken to be quieter, it is a one-line change isolated in `computeBadge`. The dismissed-optional-pending edge is asserted in the test to lock the literal AC outcome (`'dot'`).
- **Manual runtime check still owed (human-in-the-loop):** the story asks for a `bun run dev` browser confirmation that the Activity indicator still streams after the shared-connection refactor. This was **not** run interactively here (no DOM harness in repo — Epic 46 precedent; same as 46.6). The regression risk is guarded by green tsc/build and the unchanged `useActivityStream` tests, but the live walkthrough should be performed before merge.

### File List

- `src/client/lib/activity-stream.ts` (new) — module-singleton EventSource connection manager + `subscribeActivityStream`
- `src/client/hooks/useSetupStatus.ts` (new) — hook + exported `fetchSetupStatus`, `parseSetupStatus`, `computeBadge`
- `src/client/hooks/useSetupStatus.test.ts` (new) — pure-function tests (`bun:test`)
- `src/client/hooks/useActivityStream.ts` (modified) — consume the shared manager; public API unchanged
- `src/client/hooks/useProfileMutation.ts` (modified) — invalidate `['setup-status']`
- `src/client/hooks/useInboxMappingsMutation.ts` (modified) — invalidate `['setup-status']`
- `src/client/hooks/useGmailMappingsMutation.ts` (modified) — invalidate `['setup-status']`
- `src/client/hooks/useGmailConnection.ts` (modified) — invalidate `['setup-status']` on disconnect
- `src/client/routes/config/connections-api-key.tsx` (modified) — invalidate `['setup-status']` on save
- `src/client/routes/config/connections-linkedin.tsx` (modified) — invalidate `['setup-status']` on capture
- `src/client/routes/config/connections-inbox.tsx` (modified) — invalidate `['setup-status']` on Gmail connect + IMAP save

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-30 | Created Story 48.3 — `useSetupStatus` client hook (query snapshot + live `setup-status` SSE), shared single-EventSource manager refactor, and `['setup-status']` invalidation added to existing setup mutations. Status → ready-for-dev. |
| 2026-06-30 | Implemented Story 48.3 — new `activity-stream.ts` singleton connection manager, `useActivityStream` refactored to consume it (public API unchanged), new `useSetupStatus` hook + pures (`fetchSetupStatus`/`parseSetupStatus`/`computeBadge`), `['setup-status']` invalidation added to all setup mutations, 12 new pure tests. tsc 87 (zero-new), build green, full suite 550 pass / 42 pre-existing fails. Status → review. |
