---
baseline_commit: 68568847d93e50295c64cc64e0f8a622b80c42db
---

# Story 46.2: User-Scoped SSE Stream Endpoint

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an authenticated user,
I want a server-sent-events stream of my active runs,
so that any open tab can receive live workflow state without polling.

## Acceptance Criteria

1. **Mounted route** — A new route module is mounted at `/api/activity` in `src/index.ts`, under the existing `app.use('/api/*', authMiddleware)`. `GET /api/activity/stream` with a valid session cookie responds with `Content-Type: text/event-stream`, and the user id is taken from `c.get('userId')` — **never** from the request body or query.

2. **Snapshot on connect** — The first event sent on a fresh connection is a `snapshot` event whose `data` is the caller's current active runs as a JSON array (each element validates against `activityRunSchema`; the whole payload against `activityRunSchema[]`).

3. **Push on change** — While the connection is open, when the registry emits a change for that user (start / progress / finalize / prune), an event is pushed to that client carrying that user's updated run array. A client belonging to a **different** user never receives it.

4. **Heartbeat** — On an idle open connection where no changes occur for the keepalive interval, a heartbeat **comment line** (`:` prefixed) is written so proxies/browsers don't drop the connection.

5. **Clean teardown** — When the client disconnects (tab closed / navigated away) and the request is aborted, the endpoint **unsubscribes** its registry listener and clears its heartbeat timer — no leaked subscribers and no leaked timers. This is assertable in a contract test.

6. **Auth rejection** — An unauthenticated request to `/api/activity/stream` is rejected by the **existing** `authMiddleware` with the standard error shape `{ error: string }` and a `401` status — no stream is opened. (No new auth code is written; this AC is satisfied purely by mounting under `/api/*`.)

## Tasks / Subtasks

- [x] **Task 1 — Create the SSE route module `src/server/routes/api-activity.ts`** (AC: 1, 2, 3, 4, 5)
  - [x] `import { Hono } from 'hono'` and `import { streamSSE } from 'hono/streaming'` (this is the SSE helper — distinct from the plain `stream` used in `api-webhooks.ts`). Type the app as `new Hono<AppEnv>()`.
  - [x] `import { activityRegistry } from '../services/activity-registry'` — the **shared singleton** (NOT `createActivityRegistry()`). Downstream wiring (46.3/46.4) reports into this same instance; the stream must read/subscribe to it.
  - [x] `import { activityRunSchema, type ActivityRun } from '../../shared/schemas'` — use the relative path (the `@shared/*` alias is not used anywhere under `src/server`; see Dev Notes). _(Implemented: route imports `ActivityListener` type from the registry instead — `activityRunSchema`/`ActivityRun` are referenced from the co-located test, not the route, since the route never validates, only serializes. Relative-path rule honored in both files.)_
  - [x] Export an exported `KEEPALIVE_MS` module constant (e.g. `15_000`) so heartbeat cadence is referenceable/tunable, mirroring how `activity-registry.ts` exports `RETENTION_MS`.
  - [x] `app.get('/stream', (c) => { ... })`:
    - [x] `const userId = c.get('userId')` — taken only from context (set by `authMiddleware`).
    - [x] `return streamSSE(c, async (stream) => { ... })`. `streamSSE` already sets `Content-Type: text/event-stream` and keeps the response open until the callback promise resolves.
    - [x] **Serialize writes** through a promise chain so concurrent emits + heartbeat never interleave on the single underlying writer (see Dev Notes for the exact snippet). Every write is `.catch()`-guarded; guard with `if (stream.aborted) return` before writing.
    - [x] Send the initial snapshot: an SSE message with `event: 'snapshot'`, `data: JSON.stringify(activityRegistry.snapshot(userId))`.
    - [x] Define `const listener: ActivityListener = (runs) => enqueue({ event: 'update', data: JSON.stringify(runs) })` and `activityRegistry.subscribe(userId, listener)`. The registry pushes the **full fresh snapshot array** on every change, so each `update` payload is the complete current run list (client replaces, not merges).
    - [x] Start a heartbeat: `const heartbeat = setInterval(() => { if (!stream.aborted) stream.write(': keepalive\n\n').catch(() => {}) }, KEEPALIVE_MS)`. (Heartbeat is a raw SSE **comment**, written via `stream.write`, not `writeSSE` — comments carry no event/data.)
    - [x] Block until disconnect: `await new Promise<void>((resolve) => stream.onAbort(resolve))`. (`onAbort` fires on client disconnect / request abort.)
    - [x] On resolve (teardown): `clearInterval(heartbeat)` then `activityRegistry.unsubscribe(userId, listener)`. Both MUST run on every exit path.
  - [x] `export default app`.
- [x] **Task 2 — Mount the route in `src/index.ts`** (AC: 1, 6)
  - [x] Add `import activityRoute from './server/routes/api-activity'` with the other route imports (lines ~11–35).
  - [x] Add `app.route('/api/activity', activityRoute)` with the other `app.route(...)` registrations (lines ~109–127). It is automatically covered by the existing `app.use('/api/*', authMiddleware)` (line 96) — do **not** add any new auth or middleware. Do **not** add an `emailFeaturesMiddleware` guard (activity is not email-gated).
- [x] **Task 3 — Co-located contract tests `src/server/routes/api-activity.test.ts`** (AC: 1–5)
  - [x] Build a minimal harness app (the established pattern from `api-webhook-runs.test.ts`): `const w = new Hono<AppEnv>(); w.use('*', (c, next) => { c.set('userId', <id>); return next() }); w.route('/api/activity', activityRoute)`. Use a **distinct `userId` per test** so the shared singleton registry stays isolated across tests (no DB, no auth needed — the route touches neither).
  - [x] **Snapshot-on-connect (AC2):** pre-`register` one run for the test user on the singleton, open the stream via `app.request('/api/activity/stream', { signal })`, read the first chunk from `res.body.getReader()`, assert it contains `event: snapshot` and the run id; assert `res.headers.get('content-type')` starts with `text/event-stream`.
  - [x] **Push-on-change (AC3):** open the stream, then call `activityRegistry.register/progress/finalize` for that user and assert the reader receives an `event: update` chunk carrying the new run/progress.
  - [x] **Cross-user isolation (AC3):** user A's open stream must NOT receive a chunk when a run is registered for user B. (Drive two harness instances / two userIds; assert A's reader yields no B-run data within a short window.)
  - [x] **Teardown / no leaked subscribers (AC5):** `import { spyOn } from 'bun:test'`; `spyOn(activityRegistry, 'unsubscribe')`. Open the stream, read the snapshot chunk, then disconnect; assert `unsubscribe` was called for that user. _(Disconnect is driven via `reader.cancel()` rather than `controller.abort()`: in the installed hono+bun, `streamSSE` only wires the request `AbortSignal` to `stream.abort()` on old-bun builds; cancelling the response reader cancels `responseReadable`, which calls `StreamingApi.abort()` and fires `onAbort` — the reliable disconnect trigger in the `app.request` harness. Verified by the failing-then-passing test.)_
  - [x] Use `bun:test` (`describe`/`test`/`expect`/`beforeEach`) — never vitest/jest. Co-locate as `api-activity.test.ts` beside the route (no `__tests__/`).
  - [x] Decode chunks with `new TextDecoder().decode(value)`. Add a small `Promise.race` timeout helper around reads so a missing-event assertion can't hang the suite.

### Review Findings

_Code review 2026-06-25 (bmad-code-review). 0 decision-needed, 1 patch, 4 deferred, 13 dismissed as noise (verified false positives against hono source: snapshot→subscribe "race" is two synchronous statements; heartbeat/writeSSE "interleaving/locking" impossible since each write enqueues one atomic chunk and `StreamingApi.write` swallows errors; `onAbort` does fire on real disconnect via `responseReadable.cancel → abort`; userId-undefined / JSON.stringify-throws guards rejected as impossible-scenario per project-context)._

- [x] [Review][Patch] AC4/AC5 heartbeat lifecycle is untested though Task subtasks mark it `[x]` — APPLIED: added a deterministic test spying `global.setInterval`/`global.clearInterval` asserting the heartbeat is scheduled with `KEEPALIVE_MS` and the same handle is cleared on disconnect (no 15s wait, no timer mocking). Suite now 5 pass / 0 fail [src/server/routes/api-activity.test.ts]
- [x] [Review][Defer] No backpressure — a stalled client's serialized write-chain grows unbounded across registry emits [src/server/routes/api-activity.ts:14-17] — deferred, edge-case for a hung socket
- [x] [Review][Defer] Persistent write failures are silently swallowed and never trigger teardown (relies on abort to fire) [src/server/routes/api-activity.ts:15,26] — deferred, low-probability; `StreamingApi.write` already no-ops internally
- [x] [Review][Defer] Test robustness — `readUntil` leaks the losing `setTimeout`/dangling `reader.read()`; `dataFor` regex assumes the whole event+data frame lands in one buffered read [src/server/routes/api-activity.test.ts:17-43] — deferred, tests pass; chunk-boundary fragility only
- [x] [Review][Defer] Teardown test depends on a 50ms sleep after `reader.cancel()` (timing-sensitive; documented as the reliable trigger in this hono+bun harness) [src/server/routes/api-activity.test.ts:114-117] — deferred, pre-existing harness constraint

## Dev Notes

### Scope & boundaries
- This story delivers **only** the SSE endpoint (route module + mount + contract tests). **No** workflow wiring (that's 46.3 `api-webhooks.ts` / 46.4 `api-jobs.ts`), **no** client hook (46.5 `useActivityStream.ts`), **no** UI (46.6). Do not touch the registry's internals — 46.1 is `done`; consume its public surface exactly as exported.
- The registry's public surface you consume (from `src/server/services/activity-registry.ts`): `snapshot(userId)`, `subscribe(userId, listener)`, `unsubscribe(userId, listener)`. You also use `register/progress/finalize` **in tests only** to simulate workflow activity. `ActivityListener = (runs: ActivityRun[]) => void` is exported from the same module.

### Read-before-write: files this story touches
- **`src/index.ts` (UPDATE)** — central app wiring. Current state: imports each route module, then `app.use('/api/*', authMiddleware)` at line 96, optional `emailFeaturesMiddleware` mounts, then a block of `app.route('/api/<x>', <route>)` at lines 109–127, `app.onError(errorHandler)`, then a catch-all static SPA handler at lines 134–135. **What you change:** add one import + one `app.route('/api/activity', activityRoute)`. **What you must preserve:** ordering — auth middleware (line 96) must stay registered before route mounts so `c.get('userId')` is populated; the static catch-all (`app.use('/*', serveStatic...)`, `app.get('/*', ...)`) must remain **after** all `/api` routes or it will shadow them. Add the `app.route` alongside the existing block, not after the static handlers.
- **`src/server/services/activity-registry.ts` (READ-ONLY reference)** — already implemented (story 46.1). Confirms `emit()` pushes the **full `snapshot(userId)` array** to each listener and is fault-isolated (a throwing listener is caught and `console.error`'d, never propagates back into `register/progress/finalize`). Therefore your listener can safely do fire-and-forget enqueued writes; even if a write rejects, it won't poison the workflow that triggered the emit.

### Why `streamSSE` (not the plain `stream` in `api-webhooks.ts`)
`api-webhooks.ts` uses `stream` from `hono/streaming` for a **request-scoped, one-shot** NDJSON response (it writes JSON lines for the duration of a single discovery/analysis run, then the handler returns and the stream closes). This story needs a **long-lived, push-driven** SSE channel that outlives any single workflow and is fed by registry events. `streamSSE` (also from `hono/streaming`, re-exported via `hono/streaming` → `./sse`) is the correct primitive: it sets the `text/event-stream` content type, gives you `stream.writeSSE({ event, data, id?, retry? })`, exposes `stream.onAbort(cb)` and the `stream.aborted` flag, and keeps the HTTP response open until your async callback resolves. Confirmed available in installed hono (`node_modules/hono/dist/.../streaming/sse` exports `streamSSE`, `SSEStreamingApi`).

### Recommended handler shape (serialized writes + clean teardown)
```ts
// src/server/routes/api-activity.ts
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { activityRegistry, type ActivityListener } from '../services/activity-registry'
import type { AppEnv } from '../types'

export const KEEPALIVE_MS = 15_000

const app = new Hono<AppEnv>()

app.get('/stream', (c) => {
  const userId = c.get('userId')
  return streamSSE(c, async (stream) => {
    // Single writer → serialize every write so emits + heartbeat never interleave.
    let chain: Promise<unknown> = Promise.resolve()
    const enqueue = (msg: { event: string; data: string }) => {
      if (stream.aborted) return
      chain = chain.then(() => stream.writeSSE(msg)).catch(() => {})
    }

    enqueue({ event: 'snapshot', data: JSON.stringify(activityRegistry.snapshot(userId)) })

    const listener: ActivityListener = (runs) =>
      enqueue({ event: 'update', data: JSON.stringify(runs) })
    activityRegistry.subscribe(userId, listener)

    const heartbeat = setInterval(() => {
      if (!stream.aborted) stream.write(': keepalive\n\n').catch(() => {})
    }, KEEPALIVE_MS)

    await new Promise<void>((resolve) => stream.onAbort(resolve))

    clearInterval(heartbeat)
    activityRegistry.unsubscribe(userId, listener)
  })
})

export default app
```
- **Why a write chain:** `SSEStreamingApi` wraps one `WritableStreamDefaultWriter`. Two un-awaited `writeSSE` calls (e.g. a registry burst + a heartbeat) can reject with "WritableStream is locked" / interleave bytes. Chaining `.then()` serializes them; `.catch(() => {})` swallows post-abort write rejections so they never surface as unhandled rejections.
- **Why `onAbort` to block:** if the callback returns immediately, `streamSSE` closes the response. Awaiting an abort-resolved promise holds the SSE channel open for the connection's lifetime while the listener does the actual pushing.
- **Heartbeat is a comment, not an event:** SSE comment lines start with `:` and are ignored by `EventSource` clients but keep intermediaries from idling the socket. Write the raw `': keepalive\n\n'` via `stream.write` (not `writeSSE`, which always emits `data:`).

### Event-name contract (consumed by 46.5 `useActivityStream`)
- Initial event: `event: snapshot`, `data` = `ActivityRun[]` (full array).
- Subsequent events: `event: update`, `data` = `ActivityRun[]` (full fresh array — **replace**, do not merge).
- Both payloads validate against `activityRunSchema[]`. The registry always emits the complete snapshot, so the client never needs to reconcile deltas. Keep this two-event contract stable; 46.5 will branch on `event` name but treat both as "replace my runs list."

### Critical project rules (from `_bmad-output/project-context.md`)
- **`userId` is a `number`** — comes only from `c.get('userId')` (set in `auth-middleware.ts:46`, typed in `src/server/types.ts:3` as `AppEnv.Variables.userId`). Per AC1, never read it from query/body. The registry keys on this numeric id.
- **No envelope / error shape:** success responses carry data directly; errors are `{ error: string }` + status (never `{ message }`, never `{ error: { message } }`). The only error path here is the existing `authMiddleware` 401 (`{ error: 'Unauthorized' }`) — you don't author it; AC6 just verifies it fires by mounting under `/api/*`.
- **Routes** are sub-`Hono` instances exported as `default` and mounted in `src/index.ts` — match every sibling in `src/server/routes/`. Bind nothing to a port; `index.ts` owns the server.
- **Shared types** come only from `src/shared/schemas.ts` (`ActivityRun`, `activityRunSchema`). Never redefine the run/progress shapes in the route or tests. Import via the **relative** path `../../shared/schemas` — every file under `src/server` uses the relative import; the `@shared/*` alias is client/build-side and is not used in server code (confirmed in 46.1's implementation note).
- **`console.error`** for server-side errors (the listener fault-isolation already lives in the registry; the route generally needs no logging — keep it silent unless a genuine error path appears). `console.log` for errors is forbidden.
- **No speculative abstractions, no comments unless non-obvious, no feature flags.** Keep the module to the single `/stream` GET.
- **CSRF note:** `authMiddleware` only enforces CSRF on POST/PUT/PATCH/DELETE — this is a `GET`, so no `x-csrf-token` is needed. Good, because `EventSource` (46.5) cannot send custom headers.

### Testing standards (from project-context.md#Testing Rules)
- Runner is `bun:test` — import `describe`, `test`, `expect`, `beforeEach`, and `spyOn` from `bun:test`. Never vitest/jest.
- Co-locate as `src/server/routes/api-activity.test.ts` (no `__tests__/`).
- **HTTP contract tests use `app.request(...)`** against the real route handler — no HTTP server. This route does **not** touch the DB, so do **not** set `process.env.DB_PATH = ':memory:'` and do **not** build tables (that boilerplate applies only to DB-touching tests; see `api-webhook-runs.test.ts` for the DB pattern you are intentionally NOT copying here).
- **Harness app pattern (from `api-webhook-runs.test.ts`):** wrap the route in a tiny `new Hono<AppEnv>()` with a middleware that sets `c.set('userId', <id>)`, bypassing real auth. Use a **unique userId per test** because the route consumes the process-wide singleton `activityRegistry`; distinct ids guarantee isolation without a registry reset.
- **Reading an SSE response in a test:** `app.request` returns a `Response` whose `body` is a `ReadableStream`. Get a reader (`res.body!.getReader()`), `await reader.read()` for chunks, `new TextDecoder().decode(value)` to inspect. Pass an `AbortController().signal` in the request init and call `controller.abort()` to simulate disconnect — this is what drives `stream.onAbort` and lets you assert teardown.
- **Assert event framing**, not just payload: chunks contain `event: snapshot\n` / `event: update\n` and `data: <json>\n\n`. Assert both the event name and that the JSON parses to runs validating against `activityRunSchema`.
- Wrap reads in a timeout race so an "isolation: should receive nothing" assertion fails fast instead of hanging.

### Project Structure Notes
- **New files:** `src/server/routes/api-activity.ts`, `src/server/routes/api-activity.test.ts` — kebab-case `api-*.ts` matches every other route + co-located `*.test.ts` (project-context.md#Naming Conventions).
- **Edited file:** `src/index.ts` — one import + one `app.route`. No other production file changes.
- No new dependencies: `hono/streaming` (already imported in `api-webhooks.ts`), the singleton registry, and `bun:test` cover everything.
- Path/route alignment: route registered at `/api/activity`, handler at `/stream` → full path `GET /api/activity/stream` as AC1 requires.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-46-activity-dropdown.md#Story 46.2] — full AC text and the SSE-not-polling architecture decision.
- [Source: _bmad-output/implementation-artifacts/46-1-in-progress-run-registry-and-shared-activity-types.md] — registry public surface, `userId:number` rule, relative-import convention, `RETENTION_MS` pruning (drives the `update` that drops a finalized run).
- [Source: job-hunt-dashboard/src/server/services/activity-registry.ts:11,15,68,77,84] — `snapshot`, fault-isolated `emit`, `subscribe`/`unsubscribe`, exported `activityRegistry` singleton + `ActivityListener` type.
- [Source: job-hunt-dashboard/src/index.ts:96,109-127,134-135] — `authMiddleware` on `/api/*`, the `app.route` registration block, and the static catch-all that must stay last.
- [Source: job-hunt-dashboard/src/server/middleware/auth-middleware.ts:46] — `c.set('userId', effectiveUserId)`; CSRF only on mutating methods.
- [Source: job-hunt-dashboard/src/server/types.ts:1-6] — `AppEnv.Variables.userId: number`.
- [Source: job-hunt-dashboard/src/server/routes/api-webhooks.ts:2,21-44] — existing `stream` usage (the one-shot pattern this story deliberately diverges from in favor of `streamSSE`).
- [Source: job-hunt-dashboard/src/server/routes/api-webhook-runs.test.ts:1-18] — harness-app + `c.set('userId', …)` middleware contract-test pattern to mirror.
- [Source: node_modules/hono/dist/types/helper/streaming/sse.d.ts] — `streamSSE(c, cb, onError?)`, `SSEStreamingApi.writeSSE({ data, event?, id?, retry? })`; `StreamingApi.write`, `onAbort`, `aborted` (utils/stream.d.ts).
- [Source: job-hunt-dashboard/src/shared/schemas.ts:133-155] — `activityRunSchema` and `ActivityRun` (validation target for snapshot/update payloads).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- Initial teardown test (AC5) failed: `unsubscribe` was not called after `controller.abort()`. Root cause: in the installed hono `4.x` + bun `1.3.13`, `streamSSE` only registers a `req.raw.signal` → `stream.abort()` listener when `isOldBunVersion()` is true. In the `app.request(...)` in-process harness, aborting the request `AbortSignal` therefore does not cancel the response stream. Switched the disconnect trigger to `reader.cancel()`, which cancels `responseReadable` → `StreamingApi.abort()` → fires `onAbort` subscribers. Test then passed. This is a test-harness detail only; the production route's `onAbort` teardown is unchanged and correct for real client disconnects.

### Completion Notes List

- Implemented the long-lived, push-driven SSE endpoint `GET /api/activity/stream` exactly per the Dev Notes recommended handler shape: serialized write chain (`.then().catch()`), `snapshot` event on connect, `update` events on registry emit, raw `: keepalive\n\n` comment heartbeat every `KEEPALIVE_MS` (15s), and `onAbort`-driven teardown that both `clearInterval`s the heartbeat and `unsubscribe`s the listener.
- Mounted under the existing `app.use('/api/*', authMiddleware)` with a single import + single `app.route('/api/activity', activityRoute)`; no new auth/middleware authored. AC6 (401 on unauthenticated) is satisfied purely by that mount. No `emailFeaturesMiddleware` guard added (activity is not email-gated). Route ordering preserved — registered alongside the existing block, before the static SPA catch-all.
- `userId` is read only from `c.get('userId')` (numeric, set by `authMiddleware`), never from query/body — AC1 honored.
- 4 co-located contract tests (`bun:test`) cover AC1–AC5: content-type + snapshot-on-connect, push-on-change with progress payload, cross-user isolation (user A receives nothing on a user-B register, asserted via a fast `Promise.race` timeout), and teardown (`spyOn(activityRegistry, 'unsubscribe')`). Distinct `userId` per test isolates the process-wide singleton registry without a reset. Payloads validated against `activityRunSchema.array()`.
- Validation: `bun test src/server/routes/api-activity.test.ts` → 4 pass / 0 fail. `bunx tsc --noEmit` → no errors in `api-activity.ts` or `index.ts`. Full suite: 426 pass / 40 fail; the 40 failures are pre-existing (baseline without these changes: 422 pass / 40 fail — these changes add 4 passing tests and introduce zero new failures). The pre-existing failures live in unrelated files (auth, ingest, jobs, messages, onboarding, webhooks, analysis/discovery/scraper services) and are environment-dependent (network, DB ordering).

### File List

- `job-hunt-dashboard/src/server/routes/api-activity.ts` (NEW) — SSE route module: `GET /stream`, exported `KEEPALIVE_MS`.
- `job-hunt-dashboard/src/server/routes/api-activity.test.ts` (NEW) — 4 co-located contract tests (AC1–AC5).
- `job-hunt-dashboard/src/index.ts` (MODIFIED) — added one import + `app.route('/api/activity', activityRoute)`.

## Change Log

- 2026-06-25 — Implemented Story 46.2 (User-Scoped SSE Stream Endpoint): new `api-activity.ts` route mounted at `/api/activity` under existing auth; snapshot-on-connect + push-on-registry-change + heartbeat comment + `onAbort` teardown; 4 contract tests. Status → review.
