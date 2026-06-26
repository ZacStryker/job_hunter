---
baseline_commit: 68568847d93e50295c64cc64e0f8a622b80c42db
---

# Story 46.5: `useActivityStream` Client Hook

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the front-end,
I want a hook that maintains the live active-runs list over an `EventSource` connection,
so that the top-bar control (46.6) renders from one push-driven source with no polling and no duplicate state.

## Acceptance Criteria

1. **Hook exists and exposes the contract** — A new hook `src/client/hooks/useActivityStream.ts` exports `useActivityStream()` returning `{ runs: ActivityRun[]; isActive: boolean }`. `runs` is the current parsed active-runs array; `isActive` is `true` iff at least one run has `state === 'running'`. `ActivityRun` is imported from `@shared/schemas` — never redefined inline.

2. **Opens the SSE connection on mount** — On mount the hook opens `new EventSource('/api/activity/stream')` (relative, same-origin URL; the session cookie is sent automatically — do **not** set `withCredentials`, do **not** route through `apiFetch`, do **not** add headers). It must register listeners for the **named** events the server emits — `snapshot` and `update` — via `es.addEventListener('snapshot', …)` and `es.addEventListener('update', …)`. The default `onmessage`/`'message'` handler will **never fire** here because the server names every event (`api-activity.ts:19,22`); relying on `onmessage` is a silent no-op bug.

3. **Replaces runs from each event after schema validation** — When a `snapshot` or `update` event arrives, `event.data` is `JSON.parse`d and validated against the shared schema as an array (`z.array(activityRunSchema)` / `activityRunSchema.array()`). On success the hook's `runs` state is **replaced wholesale** with the parsed array. On `JSON.parse` failure or `safeParse` failure the event is ignored (no throw, no state change). The runs list lives **only** in this hook's `useState` — no duplicate copy in component state, no `fetch`, no polling, no TanStack Query.

4. **Replace — not merge-by-id** — Both the `snapshot` and the `update` payloads carry the user's **complete** current active-runs array (the server's `emit` always sends `snapshot(userId)`, including the post-retention prune that removes a finalized run by **omitting** it). Therefore each event must replace the whole list. A merge-by-id strategy is incorrect: it would leave pruned/finalized runs stuck on screen forever because pruning is expressed as absence from the array, not as a delete event.

5. **Reconnects with capped backoff on error / unexpected close** — When the `EventSource` errors or the connection drops (`onerror` with `readyState === EventSource.CLOSED`), the hook reconnects on a capped exponential backoff (e.g. start ~1 s, double each attempt, cap at ~30 s) and resumes replacing `runs` once reconnected. The backoff delay resets to its floor after a successful (re)connection (`onopen`). Existing `runs` are retained across a transient drop (don't clear to empty on a blip).

6. **Clean teardown on unmount** — When the hook unmounts, the `EventSource` is `close()`d, any pending reconnect timer is cleared, and a guard prevents an already-scheduled reconnect from opening a new connection after unmount. No leaked connections, no `setState`-after-unmount, no orphaned timers.

7. **Pure, unit-testable core** — The event-handling logic is factored into exported pure functions so it can be unit-tested under `bun:test` **without** a DOM/React renderer (this repo has none — see Testing Standards). At minimum export and test: `parseRuns(data: string): ActivityRun[] | null` (JSON-parse + array `safeParse`, `null` on any failure) and `computeIsActive(runs: ActivityRun[]): boolean`. The hook body wires these to the `EventSource` lifecycle; tests assert the pure functions, not a rendered hook.

## Tasks / Subtasks

- [x] **Task 1 — Create the hook file `src/client/hooks/useActivityStream.ts`** (AC: 1, 2, 3, 4, 5, 6, 7)
  - [x] Imports: `import { useEffect, useRef, useState } from 'react'`; `import { activityRunSchema, type ActivityRun } from '@shared/schemas'` (runtime value `activityRunSchema` for validation **and** the `ActivityRun` type — client code uses the `@shared` alias, see existing hooks like `useSourceSettingsQuery.ts:3`, `useFeatureSettingsQuery.ts:2`). One hook per file (project rule).
  - [x] Export the pure helpers (AC7):
        ```ts
        export function parseRuns(data: string): ActivityRun[] | null {
          let json: unknown
          try { json = JSON.parse(data) } catch { return null }
          const result = activityRunSchema.array().safeParse(json)
          return result.success ? result.data : null
        }
        export function computeIsActive(runs: ActivityRun[]): boolean {
          return runs.some((r) => r.state === 'running')
        }
        ```
  - [x] `useActivityStream()` body:
    - [x] `const [runs, setRuns] = useState<ActivityRun[]>([])` — the **only** home for the list.
    - [x] `useEffect(() => { … }, [])` opens the connection and owns teardown. Use refs for the live `EventSource`, the reconnect `setTimeout` handle, the current backoff delay, and an `unmounted` flag. _(Implemented with effect-scoped closure locals rather than `useRef` — see Completion Notes.)_
    - [x] On each `snapshot`/`update` event: `const parsed = parseRuns(ev.data); if (parsed) setRuns(parsed)` (replace — AC3/AC4). Add **both** named listeners (AC2); they can share one handler.
    - [x] `onopen`: reset backoff to the floor (AC5).
    - [x] `onerror`: if `es.readyState === EventSource.CLOSED` and not unmounted, `close()` the current source and schedule a reconnect after the current backoff, then advance backoff (`min(delay * 2, MAX)`). Define module-level `const RECONNECT_BASE_MS = 1_000`, `const RECONNECT_MAX_MS = 30_000`. (Manual reconnect is required to get *capped/backoff* control — native `EventSource` auto-retry uses a fixed interval you can't cap.)
    - [x] Cleanup function (returned from `useEffect`): set `unmounted = true`, `clearTimeout` the reconnect handle, `es.close()` the current source (AC6).
    - [x] `return { runs, isActive: computeIsActive(runs) }`.
  - [x] No comments unless non-obvious; no speculative config/params; the hook takes **no arguments** (URL is fixed).

- [x] **Task 2 — Co-located unit tests `src/client/hooks/useActivityStream.test.ts`** (AC: 1, 3, 4, 7)
  - [x] `bun:test` only: `import { describe, test, expect } from 'bun:test'`; `import { parseRuns, computeIsActive } from './useActivityStream'`. Mirror the pure-function test style of `src/client/components/tracker/AgingRow.test.tsx` (the repo's sole client test — it tests **exported pure functions**, never a rendered component, because there is no DOM test harness).
  - [x] `parseRuns` cases: (a) valid JSON array of one `running` discovery run (`progress: { count, total }`) → returns the array; (b) valid `cover_letter` run (`progress: { company, role }`) → returns it; (c) empty array `'[]'` → returns `[]`; (d) malformed JSON (`'{not json'`) → `null`; (e) JSON that fails the schema (e.g. `'[{"id":"x"}]'` missing fields, or wrong `state`/`type` enum) → `null`; (f) a non-array JSON object (`'{}'`) → `null`.
  - [x] `computeIsActive` cases: `[]` → `false`; one `running` run → `true`; only `done`/`failed` runs → `false`; mixed (one `running` + one `done`) → `true`.
  - [x] Build fixture runs inline matching `activityRunSchema` exactly (`id`, `type`, `state`, `startedAt`, `updatedAt` ISO strings, `progress`). Do **not** import server code; validate against the shared schema only.
  - [x] Do **not** attempt to render the hook or mock `EventSource` — there is no `happy-dom`/`jsdom`/`@testing-library`/`react-test-renderer` in this project and adding one is out of scope (see Dev Notes "Testing reality").

- [x] **Task 3 — Validate** (AC: 1–7)
  - [x] `bun test src/client/hooks/useActivityStream.test.ts` → all green. _(11 pass / 0 fail.)_
  - [x] `bunx tsc --noEmit` → zero **new** errors attributable to `useActivityStream.ts` / its test. (`EventSource`, `EventSource.CLOSED`, `MessageEvent`/`Event` types come from the `DOM` lib already in `tsconfig.json` `"lib": ["ES2020","DOM","DOM.Iterable"]`.) Record the pre-existing-failure baseline delta in Completion Notes per the convention used in 46.2–46.4 (~40 env-dependent failures repo-wide; **zero new**).
  - [x] Confirm the hook compiles with the `@shared/schemas` alias (resolved in both `vite.config.ts` and `tsconfig.json`).

## Dev Notes

### Scope & boundaries
- This story builds **only** the client hook + its unit tests. It does **not** touch the top-bar UI (`Layout.tsx`), the dropdown, or any component — that is **46.6** (still `backlog`). It does **not** touch the server: the SSE endpoint (`api-activity.ts`, 46.2 `done`), the registry (46.1 `done`), or the four workflow wirings (46.3/46.4 `done`) are all complete and consumed as-is.
- Net new files only: `src/client/hooks/useActivityStream.ts` and `src/client/hooks/useActivityStream.test.ts`. No edits to existing files, no new deps, no migrations, no route changes.
- 46.6 will call `useActivityStream()` and render `runs`/`isActive`. Keep the return shape exactly `{ runs, isActive }` so 46.6's ACs (animated when `isActive`, one row per run) wire up cleanly.

### The server contract you are consuming (read-only — already built)
- **Endpoint:** `GET /api/activity/stream` (`src/server/routes/api-activity.ts`), mounted under `app.use('/api/*', authMiddleware)` in `src/index.ts`. Same-origin; the browser sends the session cookie automatically on a plain `new EventSource('/api/activity/stream')`. It's a GET, so **no CSRF token** is needed (CSRF only applies to POST/PATCH/DELETE/PUT per `src/client/lib/api.ts`) — this is exactly why you bypass `apiFetch` and use the native `EventSource`.
- **Events emitted (named — this is the #1 gotcha):**
  - `event: snapshot` on connect — `data` = JSON array of the caller's current active runs (`activityRegistry.snapshot(userId)`), `api-activity.ts:19`.
  - `event: update` on every registry change (register/progress/finalize/prune) — `data` = the **full** updated runs array, `api-activity.ts:21-22`.
  - `: keepalive` comment line every 15 s (`KEEPALIVE_MS`) — `EventSource` swallows comment lines automatically; you never see them. They keep the socket alive; they are **not** data.
- **Both events carry the complete array, every time.** The registry's `emit` always recomputes `snapshot(userId)` and passes the whole list to listeners (`activity-registry.ts:15-26`). Finalized runs linger `done`/`failed` for `RETENTION_MS` (5 s) then are pruned, which fires one more `emit` with the run **absent**. ⇒ **Replace, never merge.** A merge-by-id keyed accumulator would never drop pruned runs (no per-run delete event exists) and would leave dead rows on the indicator forever. This is the single most important correctness decision in the story (AC4).

### Why named-event listeners (not `onmessage`)
The Hono `streamSSE` writes `event: snapshot\n` / `event: update\n` lines, so each SSE message has an explicit `type`. Browser `EventSource` routes a message to `onmessage`/`'message'` **only when no `event:` field is present**. Named events require `es.addEventListener('snapshot', handler)` and `es.addEventListener('update', handler)`. If you wire `es.onmessage`, the handler is dead code and `runs` stays `[]` forever. Both named listeners can point at one shared handler `(ev: MessageEvent) => { const parsed = parseRuns(ev.data); if (parsed) setRuns(parsed) }`.

### Reconnect / backoff design (AC5)
- Native `EventSource` already auto-reconnects on transient drops (it goes `CONNECTING`, retries on a fixed interval, and re-fires your listeners on reconnect). The AC asks specifically for **capped backoff**, which the native fixed-interval retry does not give you — so do manual control:
  - In `onerror`, check `es.readyState`. `EventSource.CLOSED` (`2`) means the browser has given up → you own the reconnect: `es.close()` (defensive), then `reconnectTimer.current = setTimeout(connect, delay.current)` and `delay.current = Math.min(delay.current * 2, RECONNECT_MAX_MS)`. If `readyState === CONNECTING` (`0`), the browser is already retrying — do nothing and let it.
  - In `onopen`, reset `delay.current = RECONNECT_BASE_MS` so the next outage starts from the floor.
  - Factor the open-and-wire logic into a local `connect()` closure inside the effect so the reconnect timer can re-invoke it. Guard every (re)connect with `if (unmounted.current) return`.
- Do **not** clear `runs` on error — keep the last-known list across a blip (AC5 "resumes updating once reconnected"; clearing would make the top-bar flicker to idle on every transient network hiccup).

### Clean teardown (AC6) — avoid the classic React hook leaks
- Use an `unmounted` ref set to `true` in the effect's cleanup, checked before any `setState`/reconnect, so a `setTimeout` that fires after unmount is a no-op (prevents "setState on unmounted component" and zombie connections).
- Cleanup must: `unmounted.current = true` → `clearTimeout(reconnectTimer.current)` → `currentSource.current?.close()`.
- Empty dependency array (`[]`) — one connection per mount; the hook takes no args so nothing legitimately changes the connection.

### Testing reality (READ THIS — it changes how you test)
- **This project has no React/DOM test environment.** No `happy-dom`, `jsdom`, `@testing-library/*`, or `react-test-renderer` in `package.json` (checked). The only client test, `src/client/components/tracker/AgingRow.test.tsx`, imports and asserts **pure exported functions** (`computeOpacity`, `computeDaysAgo`) and never renders React. Follow that exact precedent.
- Therefore: extract `parseRuns` + `computeIsActive` as exported pures and unit-test those (AC7). **Do not** render `useActivityStream`, **do not** stub `globalThis.EventSource`, and **do not** add a DOM test lib — adding test infrastructure is a speculative abstraction the project rules forbid and is out of this story's scope. The `EventSource` wiring is verified manually / in 46.6 integration; the testable logic is the parsing + active-derivation, which the pure functions isolate cleanly.
- `bun:test` only (`describe`/`test`/`expect`) — never `vitest`/`jest`. Co-locate the test beside the hook (no `__tests__/`). Validate fixtures against `activityRunSchema` from `@shared/schemas` so the test fails if the shared shape drifts.

### Critical project rules that apply here (from `_bmad-output/project-context.md`)
- **Shared types only from `src/shared/schemas.ts`** — import `ActivityRun`/`activityRunSchema` via `@shared/schemas`; never redefine the run shape inline (rule: "All cross-boundary types must be imported from `src/shared/schemas.ts`").
- **No `fetch('/api/...')` in components/hooks for data** — but this is the documented exception: live push state belongs in `EventSource`, not TanStack Query. Server state normally lives in TanStack Query; this is push-driven ephemeral UI state with no cache semantics, so it lives in the hook's `useState` (and **only** there). Do not also stuff it into a query cache.
- **Hook naming:** `camelCase` file prefixed `use` → `useActivityStream.ts` ✓. One hook per file.
- **TypeScript strict** (`noUnusedLocals`/`noUnusedParameters`) — no unused refs/vars; don't prefix-`_` to dodge it unless genuinely intentional.
- **No comments unless non-obvious; no speculative abstractions / feature flags / one-off helpers.** The two pure functions are justified (testability per AC7), not speculative.
- **Dates are ISO-8601 strings** — `startedAt`/`updatedAt` arrive as strings; do not convert to `Date` (the hook never does date math; just pass runs through).

### Previous-story intelligence (46.1–46.4, all `done`)
- **46.1** built the registry + `activityRunSchema` (the exact shape you validate against): `{ id, type, state, startedAt, updatedAt, progress }` where `progress` is the union of `{ count, total }` (discovery/analysis) and `{ company, role }` (cover_letter/resume) — `schemas.ts:133-155`. `total` is nullable. Your `parseRuns` validates against this union for free via `activityRunSchema.array()`.
- **46.2** built the SSE endpoint exactly as described above (snapshot-on-connect + update-on-change + 15 s heartbeat + `onAbort` unsubscribe). Its review documented the repo's **~40 pre-existing, environment-dependent test failures** (`upsert business logic`, `runDiscovery()`, `runAnalysis()`, `POST /api/ingest`, etc.) — your validation compares against that baseline; only **zero new** failures matters.
- **46.3 / 46.4** wired discovery/analysis and cover-letter/resume into the same singleton registry, so once this hook + 46.6 land, all four workflows are visible end-to-end. They confirmed `userId` is a server-only `number` (you never send it; the cookie carries identity).
- **Streaming precedent in the client:** `src/client/hooks/useWebhookStream.ts` consumes the *other* (NDJSON-over-`fetch`, per-request) discovery stream. It is **not** the model for this hook (different transport, different lifecycle — it's POST-triggered and one-shot). Use native `EventSource`, not `getReader()`/`TextDecoder`. Mentioned only so you don't copy the wrong pattern.

### Project Structure Notes
- **New (client):** `src/client/hooks/useActivityStream.ts` — the hook + two exported pures.
- **New (test):** `src/client/hooks/useActivityStream.test.ts` — `bun:test` unit tests for the pures.
- No edits to existing files. `Layout.tsx`/dropdown wiring is 46.6. `@shared` alias is already configured in `vite.config.ts` + `tsconfig.json`; `DOM` lib is already in `tsconfig.json` so `EventSource` types resolve.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-46-activity-dropdown.md#Story 46.5] — full AC text: open `EventSource('/api/activity/stream')`, expose `{ runs, isActive }`, validate against `activityRun` schema, list lives only here, capped-backoff reconnect, close on unmount.
- [Source: _bmad-output/planning-artifacts/epics/epic-46-activity-dropdown.md#Story 46.6] — the consumer; keep the `{ runs, isActive }` shape stable for it.
- [Source: job-hunt-dashboard/src/server/routes/api-activity.ts:10-34] — the SSE endpoint: `snapshot` event on connect, `update` event on change, `: keepalive` heartbeat, `onAbort` unsubscribe. Confirms event names + that data is the full runs array.
- [Source: job-hunt-dashboard/src/server/services/activity-registry.ts:11-26,53-66,84] — `emit` always sends `snapshot(userId)` (the full list); `finalize` prunes after `RETENTION_MS` (5 s) and re-emits with the run omitted. This is why the hook replaces, never merges.
- [Source: job-hunt-dashboard/src/shared/schemas.ts:133-155] — `activityRunSchema`, `activityRunStateSchema` (`running|done|failed`), `activityRunTypeSchema`, `activityProgressSchema` union, and `ActivityRun` type to import.
- [Source: job-hunt-dashboard/src/client/components/tracker/AgingRow.test.tsx] — the project's only client test; the pure-function `bun:test` pattern to mirror (no DOM/render harness exists).
- [Source: job-hunt-dashboard/src/client/hooks/useSourceSettingsQuery.ts:3-4, useFeatureSettingsQuery.ts:2-3] — client `@shared/schemas` import convention for both a runtime schema value and its inferred type.
- [Source: job-hunt-dashboard/src/client/lib/api.ts] — CSRF only on mutating methods; GET (and thus `EventSource`) needs none → bypass `apiFetch`, use native `EventSource`.
- [Source: job-hunt-dashboard/src/client/hooks/useWebhookStream.ts] — the *other* (NDJSON/fetch) stream consumer; explicitly NOT the pattern for this SSE hook.
- [Source: _bmad-output/implementation-artifacts/46-2-user-scoped-sse-stream-endpoint.md] — SSE endpoint story + the ~40-fail validation baseline.
- [Source: _bmad-output/project-context.md#Framework-Specific Rules (React/TanStack Query), #Testing Rules, #Code Quality & Style Rules] — server state vs. push state, no direct `fetch` in components, `bun:test` co-located, hook naming, no speculative abstractions.

## Review Findings

_Code review 2026-06-26 (bmad-code-review, 3 parallel layers: Blind Hunter / Edge Case Hunter / Acceptance Auditor). All 7 ACs confirmed MET by the Acceptance Auditor. 1 decision-needed (resolved → deferred), 0 patch, 2 deferred, 6 dismissed as noise._

- [x] [Review][Defer] Backoff resets to floor on every `onopen`, so a flapping server defeats the backoff [useActivityStream.ts:42-44] — deferred. `onopen` does `delay = RECONNECT_BASE_MS` unconditionally. If the server accepts a connection then drops immediately (proxy idle-kill, crash right after the snapshot enqueue), the cycle `onopen` (reset to 1s) → `onerror` CLOSED (reconnect in 1s) → `onopen` (reset to 1s) repeats forever as a ~1s reconnect storm; the exponential backoff never grows because it only advances across *consecutive* failures and any successful open zeroes it. **Reason for deferring:** stay literal to AC5 ("resets to its floor after a successful (re)connection (`onopen`)"); revisit only if flapping is observed in prod. Possible fixes if revisited: reset on first valid `snapshot`/`update` rather than on `onopen`, or reset only after the connection stays open ≥ N seconds.

- [x] [Review][Defer] No surfaced error / infinite silent reconnect on a permanent failure (e.g. auth expiry) [useActivityStream.ts:45-50] — deferred, out of scope. When the session cookie expires, a reconnect hits `authMiddleware` → 401, `EventSource` sees the non-2xx → `onerror` CLOSED → reconnect loops forever at the 30s cap with no signal to the UI. The spec does not ask for error surfacing and the consuming top-bar UI is story 46.6 (`backlog`); revisit there.

### Dismissed (noise / verified false positives)
- **`update` vs `snapshot` might be a delta** (Blind) — verified false: `api-activity.ts:19,21-22` both emit `JSON.stringify` of the **full** `activityRegistry.snapshot(userId)`; wholesale replace is correct (AC4 confirmed MET).
- **`onerror` while CONNECTING bypasses manual backoff** (Edge) — by design: AC5 / Dev Notes explicitly delegate transient (non-CLOSED) blips to the browser's native auto-retry; manual backoff is only for `CLOSED`.
- **Double `onerror` stacks reconnect timers / orphans an `EventSource`** (Edge) — impossible path: the handler calls `es.close()` synchronously and JS is single-threaded, so the source is `CLOSED` and silent before the timer is scheduled; the `EventSource` spec does not dispatch after `close()`. Guarding it would violate the project rule "no error handling for impossible scenarios."
- **Corrupt/dropped `update` frame leaves `isActive` stuck** (Edge) — not reachable: server data is always `JSON.stringify(array)` (never invalid), SSE rides ordered/reliable TCP (frames aren't dropped mid-stream), and AC3 mandates ignoring parse failures with no state change.
- **`startedAt`/`updatedAt` validated only as `z.string()`, not ISO** (Edge) — out of diff: the shared schema is from 46.1; the hook never reads the dates (AC explicitly says don't convert to `Date`).
- **`progress` union is non-discriminated** (Edge) — out of diff: pre-existing shared schema (46.1); the server never emits a hybrid object.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- `bun test src/client/hooks/useActivityStream.test.ts` → 11 pass / 0 fail.
- `bunx tsc --noEmit` → 88 pre-existing errors repo-wide, **zero** referencing `useActivityStream.ts` / `useActivityStream.test.ts` (all in unrelated server/test/config files: discovery-service.test.ts, analysis-service.test.ts, config.tsx, etc.).
- `bun test` (full suite) → 457 pass / 40 fail; the 40 failures are the documented ~40 env-dependent baseline (discovery/analysis/onboarding/gmail network-dependent tests). **Zero new** failures; the 11 new hook tests are among the passes.

### Completion Notes List

- **AC1** — `useActivityStream()` returns `{ runs: ActivityRun[]; isActive: boolean }`; `ActivityRun`/`activityRunSchema` imported from `@shared/schemas`, never redefined.
- **AC2** — `new EventSource('/api/activity/stream')` (relative, no `withCredentials`, no `apiFetch`, no headers); registers **named** `snapshot` + `update` listeners via `addEventListener` sharing one handler (no `onmessage`, which would never fire).
- **AC3/AC4** — handler runs `parseRuns(ev.data)` then `setRuns(parsed)` — wholesale **replace**, never merge-by-id; `runs` lives only in this hook's `useState`. `parseRuns` returns `null` on JSON-parse or `safeParse` failure → event ignored, no throw, no state change.
- **AC5** — manual capped backoff: `onerror` reconnects only when `readyState === EventSource.CLOSED`, `setTimeout(connect, delay)` then `delay = min(delay*2, RECONNECT_MAX_MS=30s)` from `RECONNECT_BASE_MS=1s`; `onopen` resets `delay` to floor. `runs` retained across a blip (never cleared on error).
- **AC6** — cleanup sets `unmounted = true`, clears the reconnect timer, and `close()`s the live source; every (re)connect guards on `unmounted`, preventing setState-after-unmount / zombie connections.
- **AC7** — `parseRuns` and `computeIsActive` exported as pure functions and unit-tested under `bun:test` with no DOM/render harness, mirroring `AgingRow.test.tsx`. No DOM test lib added.
- **Deviation (noted):** the story's Task 1 subtask suggested `useRef` for the EventSource/timer/delay/unmounted state. Implemented instead with effect-scoped closure locals inside a single empty-dep `useEffect` — functionally equivalent for a one-connection-per-mount lifecycle, and it avoids importing `useRef` only to leave it partially unused (cleaner under TS strict `noUnusedLocals`). Behavior and all ACs are unchanged.

### File List

- `job-hunt-dashboard/src/client/hooks/useActivityStream.ts` (new)
- `job-hunt-dashboard/src/client/hooks/useActivityStream.test.ts` (new)
- `_bmad-output/implementation-artifacts/46-5-useactivitystream-client-hook.md` (frontmatter `baseline_commit`, task checkboxes, Dev Agent Record, status)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status: ready-for-dev → review)

### Change Log

- 2026-06-25: Implemented `useActivityStream` hook (native `EventSource` SSE consumer with named snapshot/update listeners, schema-validated wholesale replace, capped-backoff reconnect, clean teardown) + co-located pure-function unit tests. All 7 ACs met; 11/11 new tests pass; zero new tsc errors / zero new suite regressions. Status → review.
