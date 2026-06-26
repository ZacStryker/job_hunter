---
baseline_commit: 68568847d93e50295c64cc64e0f8a622b80c42db
---

# Story 46.3: Wire Discovery & Analysis Into the Registry

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user who started Discovery or Analysis,
I want those runs to report live counts to the activity registry,
so that the Activity dropdown shows "N jobs discovered/analyzed so far" from any page.

## Acceptance Criteria

1. **Discovery run registered before work starts** — In `POST /api/webhooks/discovery` (`api-webhooks.ts`), a `discovery` run is registered on the shared `activityRegistry` **before** `runDiscovery(...)` is invoked. The existing per-request `stream(...)` / `write({...})` NDJSON behavior and the existing `recordRun(...)` call are **unchanged** (same events, same order, same payloads).

2. **Discovery live count = running total across sources** — Discovery's existing `(count, source)` jobs-inserted callback (the 3rd arg to `runDiscovery`, currently `(count, source) => write({ jobsReady: true, count, source })`) ALSO advances the registry run's progress so that `progress.count` reflects the **running total of inserted jobs across all sources** (the callback fires once per source with that source's new-job count; the registry must show the accumulated sum, not the last source's count). `progress.total` stays `null` (discovery has no known up-front total).

3. **Analysis run registered on start; count/total derived from existing messages** — In `POST /api/webhooks/analysis`, an `analysis` run is registered on start. Its `progress.count` / `progress.total` are derived from the **existing** `Analyzing ${i} / ${total}: …` status messages already emitted by `runAnalysis` via its `onProgress` callback — by parsing them in the route's existing `onProgress` wrapper. There is **no** change to `runAnalysis`'s own logic or signature, and the existing `write({ status: msg })` NDJSON event for every message is preserved.

4. **Success → finalize done** — When a run reaches completion successfully (the normal, non-throwing path where the existing success `recordRun(...)` is called), the corresponding registry run is finalized via `finalize(id, 'done')`. For discovery, the finalize **state mirrors the same `success` boolean** that is already passed to `recordRun` (i.e. `success ? 'done' : 'failed'`), so an all-sources-errored / zero-inserted run is finalized `failed` exactly as it is recorded `failed`. Analysis's normal path always records `success: true`, so it finalizes `done`.

5. **Throw → finalize failed** — When a run throws and the existing `catch` block runs (the same place `recordRun(..., success: false)` is called), the corresponding registry run is finalized via `finalize(id, 'failed')`.

6. **No leaked / unfinalized runs** — Every registered run is finalized on exactly one terminal path (success or failure); a registered run is never left `running` after the handler's `try/catch` completes. (The registry's own retention timer then prunes it — not this story's concern.)

## Tasks / Subtasks

- [x] **Task 1 — Wire the Discovery handler (`app.post('/discovery', …)`)** (AC: 1, 2, 4, 5, 6)
  - [x] Add `import { activityRegistry } from '../services/activity-registry'` to the existing imports in `src/server/routes/api-webhooks.ts` (alongside `recordRun`, `runDiscovery`, `runAnalysis`). Use the **relative** path — `@shared`/alias imports are not used in server code.
  - [x] Leave the early `if (!process.env.SCRAPER_URL) return c.json({ error: ... }, 503)` guard **above** `stream(...)` untouched — no run is registered when the workflow never starts.
  - [x] Inside the `stream(c, async (s) => { ... })` callback, **before** `await runDiscovery(...)`, register the run:
        `const runId = activityRegistry.register({ userId, type: 'discovery', progress: { count: 0, total: null } })`.
  - [x] Maintain a running total and feed it through the **3rd** `runDiscovery` arg. Keep the existing `write({ jobsReady: true, count, source })` AND add the registry update:
        ```ts
        let discovered = 0
        const { inserted, bySource, errors } = await runDiscovery(
          (msg) => write({ status: msg }),
          userId,
          (count, source) => {
            discovered += count
            write({ jobsReady: true, count, source })
            activityRegistry.progress(runId, { count: discovered, total: null })
          },
        )
        ```
        (Why accumulate: the callback fires once per source with `newForSource.length` for that source — see `discovery-service.ts:280`. AC2 requires the running total, not the per-source value.)
  - [x] After the existing success `recordRun({ userId, name: 'Discovery', success, ... })`, finalize mirroring that same `success` flag:
        `activityRegistry.finalize(runId, success ? 'done' : 'failed')`. Place it right after `recordRun(...)`, before/after `write({ done: true, inserted })` — order within the try-tail does not matter, but it MUST be inside the `try`.
  - [x] In the existing `catch (err)` block, after the existing failure `recordRun({ ..., success: false, ... })`, add `activityRegistry.finalize(runId, 'failed')`.
  - [x] Do not change the `recordRun` arguments, the `success`/`errorMessage` derivation, the NDJSON event shapes, or the 503 guard.

- [x] **Task 2 — Wire the Analysis handler (`app.post('/analysis', …)`)** (AC: 3, 4, 5, 6)
  - [x] Leave the early `ANTHROPIC_API_KEY` / `user_secrets` 503 guard **above** `stream(...)` untouched — no run is registered when the key is missing.
  - [x] Inside the `stream(...)` callback, **before** `await runAnalysis(...)`, register:
        `const runId = activityRegistry.register({ userId, type: 'analysis', progress: { count: 0, total: null } })`.
  - [x] Wrap the existing `onProgress` to parse `Analyzing ${i} / ${total}: …` and update the registry, while STILL emitting the existing `write({ status: msg })` for every message:
        ```ts
        const ANALYZING_RE = /^Analyzing (\d+) \/ (\d+):/
        const result = await runAnalysis((msg) => {
          write({ status: msg })
          const m = ANALYZING_RE.exec(msg)
          if (m) activityRegistry.progress(runId, { count: Number(m[1]), total: Number(m[2]) })
        }, userId)
        ```
        (The exact message format is `Analyzing ${i} / ${pendingJobs.length}: ${company} — ${jobTitle}` — see `analysis-service.ts:148`. Match the `i / total` prefix only; the suffix is free text. Do NOT also try to parse `Found N jobs to analyze` — `count`/`total` come from the per-item `Analyzing …` lines per AC3.)
  - [x] After the existing success `recordRun({ userId, name: 'Analysis', success: true, ... })`, add `activityRegistry.finalize(runId, 'done')` (analysis's normal path is always `success: true`).
  - [x] In the existing `catch (err)` block, after the existing failure `recordRun({ ..., success: false, ... })`, add `activityRegistry.finalize(runId, 'failed')`.
  - [x] Do not change `runAnalysis`'s signature or the cost/token math; only wrap its `onProgress` argument.

- [x] **Task 3 — Extend the co-located contract tests (`src/server/routes/api-webhooks.test.ts`)** (AC: 1–6)
  - [x] This file ALREADY exists and mocks both services via `mock.module(...)`. **Critical:** the current discovery mock drops the 3rd callback — `runDiscovery: (onProgress?, _userId?) => mockRunDiscovery(onProgress)`. To exercise AC2 you must forward the `onJobsInserted` callback to the mock. Update the mock factory and the `mockRunDiscovery` type to accept and call a 3rd `onJobsInserted?: (count: number, source: string) => void` arg, e.g. `runDiscovery: (onProgress?, _userId?, onJobsInserted?) => mockRunDiscovery(onProgress, onJobsInserted)`. Preserve all existing passing tests (they pass `mockRunDiscovery = async () => (...)` ignoring extra args — still valid).
  - [x] `import { activityRegistry } from '../services/activity-registry'` and `spyOn` from `bun:test`. Use `spyOn(activityRegistry, 'register' | 'progress' | 'finalize')` to assert wiring without standing up the SSE layer. Restore spies in `afterEach` (`mock.restore()` or `.mockRestore()`).
  - [x] **Discovery registers + finalizes done (AC1, AC4):** with `SCRAPER_URL` set and a mock returning `{ inserted: 5, bySource: { linkedin: 5 }, errors: [] }`, assert `register` was called once with `{ type: 'discovery', ... }` and `finalize` called with `(<id>, 'done')`. Verify the existing `done`/`status`/`jobsReady` NDJSON events are still produced (AC1 regression guard).
  - [x] **Discovery running total (AC2):** make `mockRunDiscovery` invoke `onJobsInserted(3, 'linkedin')` then `onJobsInserted(2, 'indeed')`, and assert `activityRegistry.progress` was called with cumulative counts (`{ count: 3, total: null }` then `{ count: 5, total: null }`). Also assert the existing `jobsReady` events still carry the per-source `count` (3, then 2) — both behaviors coexist.
  - [x] **Discovery all-sources-errored finalizes failed (AC4 mirror):** mock returns `{ inserted: 0, bySource: {}, errors: [{ source: 'linkedin', error: 'x' }] }` so the route's `success` is `false`; assert `finalize` called with `(<id>, 'failed')` AND the existing `webhook_runs` row still records `success = 0` (regression).
  - [x] **Discovery throw finalizes failed (AC5):** `mockRunDiscovery = async () => { throw new Error('Scraper timeout') }`; assert `finalize(<id>, 'failed')` and the existing `error` NDJSON event + `success = 0` row are preserved.
  - [x] **Analysis registers + derives count/total (AC3):** mock emits `onProgress('Found 3 jobs to analyze')`, `onProgress('Analyzing 1 / 3: Acme — Eng')`, `onProgress('Analyzing 2 / 3: Beta — Eng')`; assert `register({ type: 'analysis', ... })` once and `progress` called with `{ count: 1, total: 3 }` then `{ count: 2, total: 3 }` (and NOT called for the `Found …` line). Assert the two `status` NDJSON events still stream (AC3 regression).
  - [x] **Analysis success / throw finalize (AC4, AC5):** success mock → `finalize(<id>, 'done')`; throwing mock → `finalize(<id>, 'failed')`; both keep their existing `done`/`error` events and `webhook_runs` rows.
  - [x] Keep `bun:test` only (`describe`/`test`/`expect`/`beforeAll`/`beforeEach`/`afterEach`/`mock`/`spyOn`). Reuse the existing `parseNdjson(res)` helper and the existing in-memory DB harness — do not duplicate table-creation boilerplate.

- [x] **Task 4 — Validate** (AC: 1–6)
  - [x] `bun test src/server/routes/api-webhooks.test.ts` → all green (existing + new).
  - [x] `bunx tsc --noEmit` → no new errors in `api-webhooks.ts` / `api-webhooks.test.ts`.
  - [x] Record the full-suite pass/fail delta vs. the pre-existing baseline in Completion Notes (the repo carries ~40 pre-existing, environment-dependent failures unrelated to this story — see 46.2's note; do not chase them).

## Dev Notes

### Scope & boundaries
- This story wires **only** `api-webhooks.ts` (Discovery + Analysis) into the already-built registry. **No** changes to `runDiscovery` / `runAnalysis` internals or signatures (AC2/AC3 are explicit on this), **no** changes to `api-jobs.ts` (that's 46.4 — Cover Letter & Resume), **no** SSE/route changes (46.2 is `done`), **no** client/UI (46.5/46.6). Consume the registry's public surface exactly as exported by 46.1.
- The registry singleton you import is the **same instance** the SSE endpoint (`api-activity.ts`, 46.2) already subscribes to. Reporting into `activityRegistry` here is what makes the live stream show discovery/analysis progress end-to-end — that wiring is the whole point of this story.

### Registry public surface (from `src/server/services/activity-registry.ts`, 46.1 — READ-ONLY, do not modify)
- `register({ userId, type, progress }): string` — creates a `running` run, returns its `id`. `userId` is a **number**. `type` is one of `'discovery' | 'analysis' | 'cover_letter' | 'resume'` (you use the first two). `progress` is the initial `ActivityProgress`.
- `progress(id, payload): void` — updates progress + `updatedAt`, emits to subscribers. No-ops if the run isn't `running` (so a late callback after finalize is harmless).
- `finalize(id, 'done' | 'failed'): void` — sets terminal state, emits, then prunes after `RETENTION_MS` (5s). No-ops if already finalized → calling it twice is safe, but you should still finalize on exactly one path (AC6).
- For discovery/analysis, the progress shape is the **count variant**: `{ count: number, total: number | null }` (`activityCountProgressSchema`). The doc variant `{ company, role }` is for cover_letter/resume (46.4) — do not use it here.

### Read-before-write: the file this story touches
- **`src/server/routes/api-webhooks.ts` (UPDATE)** — the only production file changed. Current state (read in full):
  - **Discovery handler (`api-webhooks.ts:20-43`):** early `503` if `!SCRAPER_URL`; reads `userId = c.get('userId')`; opens `stream(c, async (s) => {...})`; `write = (ev) => s.writeln(JSON.stringify(ev))`; calls `runDiscovery(onProgress, userId, onJobsInserted)`; derives `success = !(inserted === 0 && errors.length > 0)`; calls `recordRun({ name: 'Discovery', success, itemCount: inserted, ... sourceBreakdown })`; `write({ done: true, inserted })`. `catch` → `console.error` + `recordRun({ success: false, itemCount: null, ... })` + `write({ error })`.
  - **Analysis handler (`api-webhooks.ts:45-79`):** early `503` if no `ANTHROPIC_API_KEY` env AND no per-user `anthropic_api_key` secret; opens `stream(...)`; calls `runAnalysis(onProgress, userId)`; does cost/token math (`SONNET_*`, cache mults — **leave untouched**); `recordRun({ name: 'Analysis', success: true, itemCount: processed, inputTokens, outputTokens, costUsd, matchedCount, archivedCount })`; `write({ done: true, processed, failed, matched, archived })`. `catch` → `console.error` + `recordRun({ success: false, ... })` + `write({ error })`.
  - **What you change:** one import; per handler — register before the await, update progress inside the existing callbacks/wrapper, finalize on both the try-tail and the catch. **What you must preserve:** the `stream`/NDJSON event contract (the client's discovery/analysis console UI parses `status`/`jobsReady`/`done`/`error`), the `recordRun` calls and their args, the cost math, and the two 503 guards. This story is additive — it must leave both endpoints working exactly as before, plus the registry reporting.
- **`src/server/services/discovery-service.ts` (READ-ONLY reference):** `runDiscovery(onProgress?, userId?, onJobsInserted?)`. `onJobsInserted(newForSource.length, dbSource)` fires once per source that inserted ≥1 new job (`discovery-service.ts:280`), AFTER that source's transaction commits. `bySource[dbSource]` accumulates separately for `recordRun`. Returns `{ inserted, bySource, errors }`.
- **`src/server/services/analysis-service.ts` (READ-ONLY reference):** `runAnalysis(onProgress?, userId?)`. Per-item progress line is exactly `Analyzing ${i} / ${pendingJobs.length}: ${job.company} — ${job.jobTitle}` (`analysis-service.ts:148`); also emits `Found ${n} jobs to analyze` (`:115`). `i` is 1-based, `total` = `pendingJobs.length`. Returns `{ processed, failed, matched, archived, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }`.

### Why the finalize-state nuance (AC4) matters
Discovery has a "soft failure": all sources error and nothing is inserted, but `runDiscovery` returns normally (no throw). The existing code records that as `success: false` in `webhook_runs`. The Activity dropdown should reflect the same truth — a run that produced nothing because every source failed should clear as **failed**, not "done". Hence `finalize(runId, success ? 'done' : 'failed')` in the discovery try-tail, reusing the `success` boolean the handler already computes. Analysis has no soft-failure path (its only `success: false` is in the `catch`), so its try-tail always finalizes `done`.

### Critical project rules (from `_bmad-output/project-context.md`)
- **`userId` is a `number`**, read only from `c.get('userId')` (set by `authMiddleware`). The registry keys on it. Never read it from body/query.
- **No envelope / error shape changes:** you author no new responses here. Errors still flow through the existing `write({ error })` NDJSON line and the existing 503 `c.json({ error }, 503)`. Do not introduce `{ message }`.
- **Shared types** come only from `src/shared/schemas.ts` (`ActivityRunType`, `ActivityProgress`, etc.) — already consumed transitively via the registry's typed `register/progress`. Do not redefine progress shapes inline.
- **`console.error`** for server errors (already used in both catch blocks — leave as-is). `console.log` for errors is forbidden.
- **No speculative abstractions, no comments unless non-obvious, no helpers for one-time ops.** The wiring is a few inline lines per handler; do not extract a "registry-wiring" helper.
- **No error handling for impossible scenarios** — `register` always returns an id; `progress`/`finalize` no-op safely on unknown/finalized ids, so you need no guards around them.

### Testing standards (from project-context.md#Testing Rules)
- Runner is `bun:test` — import `describe`, `test`, `expect`, `beforeAll`, `beforeEach`, `afterEach`, `mock`, `spyOn` from `bun:test`. Never vitest/jest.
- **Reuse the existing `api-webhooks.test.ts`** (co-located, `process.env.DB_PATH = ':memory:'` at top, `mock.module` for both services hoisted before the dynamic `await import('./api-webhooks')`, raw-SQL table creation in `beforeAll`, `DELETE` in `beforeEach`, `parseNdjson` helper). Extend it — don't create a parallel file.
- **The discovery mock must forward the 3rd `onJobsInserted` arg** to exercise AC2 (currently dropped). This is the single non-obvious test change; without it `progress` is never called and AC2 is untestable.
- HTTP contract tests use `webhooksApp.request('/discovery' | '/analysis', { method: 'POST' })` against the real handler — no HTTP server. Assert BOTH the registry calls (via `spyOn`) AND that the existing NDJSON events / `webhook_runs` rows are unchanged (regression guards for AC1).
- Assert error responses keep the `error` key and no `message` key (already covered by existing 503 tests — keep them green).

### Project Structure Notes
- **Edited (production):** `src/server/routes/api-webhooks.ts` — one import + additive wiring in two handlers. No other production file changes (registry, services, schemas, `index.ts` all untouched).
- **Edited (test):** `src/server/routes/api-webhooks.test.ts` — forward the discovery mock's 3rd arg + add registry-wiring assertions.
- No new files, no new dependencies, no new migrations. `activityRegistry` (46.1) and `bun:test` cover everything.
- Path/route alignment unchanged: `POST /api/webhooks/discovery` and `POST /api/webhooks/analysis` keep their mounts in `src/index.ts`.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-46-activity-dropdown.md#Story 46.3] — full AC text; the "register before invoke / live count / finalize done|failed" contract and the architecture note that all wiring happens at the route-handler layer (no service internals change).
- [Source: _bmad-output/implementation-artifacts/46-1-in-progress-run-registry-and-shared-activity-types.md] — registry public surface, `userId: number` rule, relative-import convention, `RETENTION_MS` pruning.
- [Source: _bmad-output/implementation-artifacts/46-2-user-scoped-sse-stream-endpoint.md] — the SSE consumer (`api-activity.ts`) that subscribes to the same `activityRegistry` singleton this story reports into; the full-suite baseline (~422 pass / 40 pre-existing env-dependent fails) to compare against.
- [Source: job-hunt-dashboard/src/server/routes/api-webhooks.ts:20-79] — both handlers being edited (stream/NDJSON contract, `recordRun` calls, `success` derivation, 503 guards, catch blocks).
- [Source: job-hunt-dashboard/src/server/services/activity-registry.ts:28-66,84] — `register`/`progress`/`finalize` signatures, no-op-on-finalized guards, exported `activityRegistry` singleton.
- [Source: job-hunt-dashboard/src/server/services/discovery-service.ts:40-44,252,280] — `runDiscovery` signature; `onJobsInserted(newForSource.length, dbSource)` fires per-source (drives the AC2 running-total accumulation).
- [Source: job-hunt-dashboard/src/server/services/analysis-service.ts:75,115,148] — `runAnalysis` signature; exact `Analyzing ${i} / ${total}: …` message format the route parses for AC3 (and the `Found … jobs` line to ignore).
- [Source: job-hunt-dashboard/src/shared/schemas.ts:133-155] — `activityRunTypeSchema`, `activityCountProgressSchema` (`{ count, total|null }`), `ActivityProgress`, `ActivityRun`.
- [Source: job-hunt-dashboard/src/server/routes/api-webhooks.test.ts:1-70] — existing harness (hoisted `mock.module`, in-memory DB, `parseNdjson`); the discovery mock at lines 9-11 that must be updated to forward the 3rd callback.
- [Source: _bmad-output/project-context.md#Testing Rules, #Framework-Specific Rules] — `bun:test` only, co-located tests, `{ error }` shape, `console.error`, no speculative abstractions.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8)

### Debug Log References

- `bun test src/server/routes/api-webhooks.test.ts` → 16 pass / 0 fail (10 pre-existing + 6 new registry-wiring tests).
- `bunx tsc --noEmit` → no errors in `api-webhooks.ts` / `api-webhooks.test.ts`. (Initial run flagged 4 TS2769 errors in the new `toEqual([runId, …])` tuple assertions because `spy.mock.results[0].value` is typed `unknown`; resolved by casting `const runId = … as string`.)
- `bun test` (full suite) → 434 pass / 40 fail. The 40 failures are entirely pre-existing, environment-dependent ones in unrelated files (`upsert business logic`, `runDiscovery()`, `runAnalysis()`, `POST /api/ingest`, `POST /api/jobs`, `PUT /api/onboarding/linkedin`, `startScraperProcess`, cover-letter, bulk-archive) and match the documented ~40-fail baseline from 46.2. None are in `api-webhooks.test.ts`; zero regressions introduced.

### Completion Notes List

- **Discovery (AC1, AC2, AC4, AC5, AC6):** Registered a `discovery` run with `{ count: 0, total: null }` before `runDiscovery(...)`, after the untouched 503 guard, inside the `stream` callback. The existing 3rd `onJobsInserted` callback now accumulates a `discovered` running total and calls `activityRegistry.progress(runId, { count: discovered, total: null })` alongside the unchanged `write({ jobsReady: true, count, source })`. Finalize in the try-tail mirrors the existing `success` boolean (`success ? 'done' : 'failed'`), so the all-sources-errored soft-failure clears as `failed` exactly as it is recorded; the catch block finalizes `failed`.
- **Analysis (AC3, AC4, AC5, AC6):** Registered an `analysis` run before `runAnalysis(...)`. Wrapped the `onProgress` arg to still `write({ status: msg })` for every message and additionally parse `^Analyzing (\d+) \/ (\d+):` to drive `progress(runId, { count, total })`; the `Found … jobs` line and other free-text lines are ignored. Try-tail finalizes `done` (analysis's normal path is always `success: true`); catch finalizes `failed`. Cost/token math and `recordRun` args left untouched.
- **Additive only:** no changes to `runDiscovery`/`runAnalysis` signatures or internals, the NDJSON event contract, the `recordRun` calls, or the two 503 guards. Each handler finalizes on exactly one terminal path (AC6).
- **Tests:** Forwarded the discovery mock's previously-dropped 3rd `onJobsInserted` arg (the key enabler for AC2) and added a `bun:test` `spyOn` of `register`/`progress`/`finalize` — asserting wiring plus regression guards (NDJSON events + `webhook_runs` rows unchanged). `mock.restore()` added to `afterEach` to clear spies.

### File List

- `job-hunt-dashboard/src/server/routes/api-webhooks.ts` (modified) — registry import + additive register/progress/finalize wiring in both handlers.
- `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts` (modified) — forwarded the discovery mock's 3rd callback; added 6 registry-wiring tests with `spyOn`.

## Change Log

- 2026-06-25 — Wired Discovery & Analysis webhook handlers into the shared `activityRegistry` (register on start, progress via existing callbacks, finalize done/failed on both terminal paths). Additive only — no service-internal, NDJSON, or `recordRun` changes. Extended `api-webhooks.test.ts` (6 new registry-wiring tests; forwarded discovery mock's 3rd callback). Status → review. (claude-opus-4-8)

## Review Findings

_Code review 2026-06-25 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 6 ACs verified MET. 1 patch, 3 deferred, 7 dismissed as false positives._

- [x] [Review][Patch] Finalize tests don't lock AC6's single-terminal-path guarantee [src/server/routes/api-webhooks.test.ts] — APPLIED: added `expect(finalizeSpy).toHaveBeenCalledTimes(1)` to all four finalize tests (discovery done/soft-fail/throw, analysis done/throw). 16/16 pass.
- [x] [Review][Defer] Regex↔message format coupling has no shared constant [src/server/routes/api-webhooks.ts:67] — deferred. `ANALYZING_RE = /^Analyzing (\d+) \/ (\d+):/` is tightly coupled to `analysis-service.ts:148`'s emitted string; any producer format drift (spacing, colon, localization) silently disables analysis progress with no error. A shared constant is the clean fix but requires touching `analysis-service.ts`, which AC3 explicitly forbids ("no change to runAnalysis logic or signature"). Out of scope for 46.3.
- [x] [Review][Defer] No `try/finally` guaranteeing finalize on pre-`try` throw / stream teardown [src/server/routes/api-webhooks.ts:27,66] — deferred. `register` runs outside the `try`; a throw between register and the try body, or a `stream()` wrapper rejection, would leave a run permanently `running` (registry only prunes after finalize). Low concrete risk today: `finalize` is idempotent (`activity-registry.ts:57`), there is no throwing statement between register and try, and a client disconnect still runs the callback to completion. A defensive `try/finally { finalize-if-running }` would harden against future edits. Relates to 46.1's deferred uncancellable-retention-timer concern.
- [x] [Review][Defer] `userId` forwarding to `register` is unasserted [src/server/routes/api-webhooks.test.ts] — deferred. Production passes `userId` into `register`, but no test asserts it (`toMatchObject` only checks `type`/`progress`). The contract-test harness mounts the sub-app without `authMiddleware`, so `c.get('userId')` is `undefined` in tests — a meaningful assertion needs the harness to simulate auth context. Genuine coverage gap, but not closable without harness changes.

### Dismissed (false positives, verified)
- Double-finalize done→failed when a trailing `write` throws — `finalize` no-ops unless `state === 'running'` (`activity-registry.ts:57`), so the second call after success is a no-op; state stays `done`.
- `register` before auth gating in `/analysis` — the 503 guard sits above `stream(...)`; `register` only runs for authorized requests that reach the stream callback.
- `discovered` running total not reconciled against `inserted` — AC2 mandates `progress.count` = the callback running total, by design; no reconciliation required.
- `mock.restore()` doesn't reset `spyOn` spies — empirically false: all `toHaveBeenCalledTimes`/per-test assertions pass (16/16); conforms to spec Task 3.
- Soft-failure emits `done:true` NDJSON while registry shows `failed` — pre-existing, spec-mandated NDJSON contract (unchanged); `done` = run finished, `failed`/`success:0` = produced nothing. Two consumers, two correct truths.
- Regex `Number()` overflow / leading zeros — unreachable; `analysis-service.ts` caps `pendingJobs` at `.limit(10)`, so total ≤ 10.
- `mock.restore()` broader blast radius — conforms to spec (offered `mock.restore()` OR `.mockRestore()`); module mocks are re-established per test; suite green.
