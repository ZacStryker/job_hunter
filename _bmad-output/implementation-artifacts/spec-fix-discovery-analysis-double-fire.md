---
title: 'Fix Discovery & Analysis workflow double-fire (enforce 1:1:1 click→activity→log)'
type: 'bugfix'
created: '2026-06-26'
status: 'done'
context: ['{project-root}/_bmad-output/project-context.md']
baseline_commit: '08e5afd1ba5967fd04bb4e067c32f4fcfbb8ad7b'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A single click on **Discover Jobs** or **Analyze Jobs** produces **two** rows in the Activity dropdown and **two** rows in the webhook-runs (logs) table. Cover-letter/resume do not double. Both symptoms are authoritative and 1:1 with HTTP requests (the registry replaces its full snapshot per SSE event; `recordRun` writes one DB row per call), and every server path calls `activityRegistry.register` + `recordRun` exactly once per request — so the doubling is **two POST requests per click**. The streaming hook `useWebhookStream.trigger` sets `isPending` (which disables the button) only on re-render, so a re-entrant `trigger()` before that commit slips through; because the server work (`runDiscovery`/`runAnalysis`) is not cancellable, the aborted first request still completes, leaving two finished runs.

**Approach:** Restore a strict 1:1:1 relationship (one click → one Activity row → one log row) with a re-entrancy guard at two layers: a synchronous client guard in `useWebhookStream` that makes a re-entrant `trigger()` a no-op while a run is in flight, plus a server-side per-user, per-type concurrency guard so a duplicate concurrent request can never create a second `register`/`recordRun`. Diagnose empirically first to confirm the duplicate POST originates client-side before finalizing.

## Boundaries & Constraints

**Always:** One user click yields exactly one `activityRegistry.register` and exactly one `recordRun` for that workflow. Preserve existing NDJSON stream events, payloads, and order; preserve live progress updates, the in-progress→done dropdown transition (one row that updates, never two), Analysis `recordRun` cost/token accounting, and legitimate re-runs after a run finishes. The server guard's duplicate-rejection response must NOT surface as a user-facing error alert.

**Ask First:** Changing the user-facing behavior of the abort-on-re-trigger semantics in `useWebhookStream` beyond making re-entrant triggers a no-op (e.g. removing abort entirely, or changing it for non-streaming callers).

**Never:** Do not touch the cover-letter/resume flows (`api-jobs.ts`) or `useWebhookMutation` — they are not affected. Do not add a global mutex that blocks different users or a different workflow type. Do not leave permanent `console.log` diagnostics in committed code (the existing `[discovery-stream]` log may stay only if the user confirms).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single click | No run of that type in flight | 1 POST → 1 `register` + 1 `recordRun` → 1 dropdown row → 1 log row | N/A |
| Re-entrant trigger (sub-frame double-click / programmatic) | A run of that type already in flight client-side | 2nd `trigger()` is a no-op; still 1 POST | N/A |
| Duplicate concurrent POST reaches server | User already has a `running` run of that type | 2nd request rejected before `register`/`recordRun`; no 2nd dropdown/log row | Respond distinctly (e.g. 409); client treats it as benign no-op, no error alert |
| Re-run after completion | Previous run finalized (`done`/`failed`) | New click starts a fresh single run normally | N/A |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/client/hooks/useWebhookStream.ts` -- streaming trigger; add synchronous in-flight ref guard; carries the existing `[discovery-stream]` diagnostic log
- `job-hunt-dashboard/src/server/routes/api-webhooks.ts` -- `/discovery` + `/analysis` handlers; add per-user/per-type concurrency guard before `register`
- `job-hunt-dashboard/src/server/services/activity-registry.ts` -- exposes `snapshot(userId)`; add a small `hasRunning(userId, type)` helper for the guard
- `job-hunt-dashboard/src/client/routes/index.tsx` -- buttons calling `discoveryStream.trigger()` / `analysisStream.trigger()` (reference only)
- `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts` -- HTTP contract tests (1:1 assertions, duplicate-rejection)
- `job-hunt-dashboard/src/server/services/activity-registry.test.ts` -- unit tests for `hasRunning`

## Tasks & Acceptance

**Execution:**
- [x] DIAGNOSE FIRST: confirmed via static trace + a new test ("a single discovery request still produces exactly one register + one log row"). Server is provably 1:1 (each handler calls `register` + `recordRun` once; route mounted once; `PipelineRoute` mounts once; registry keys by UUID + client full-replaces snapshot) ⟹ two rows = two POSTs. Recorded in Design Notes. Browser Network-panel confirmation remains as a final manual check. (No throwaway logging added; could not drive a browser from the agent.)
- [x] `job-hunt-dashboard/src/client/hooks/useWebhookStream.ts` -- added `inFlightRef` gate: re-entrant `trigger()` returns immediately; gate set synchronously before the first `await`, cleared in `finally`. Abort/terminal handling preserved.
- [x] `job-hunt-dashboard/src/server/services/activity-registry.ts` -- added `hasRunning(userId, type)`; exported on the registry object.
- [x] `job-hunt-dashboard/src/server/routes/api-webhooks.ts` -- both `/discovery` and `/analysis` now return `c.json({ error: '… already in progress' }, 409)` before `return stream(...)` when `hasRunning(userId, type)` — no `register`/`recordRun`.
- [x] `job-hunt-dashboard/src/client/hooks/useWebhookStream.ts` -- 409 swallowed as a benign no-op (no error alert), `isPending` reset.
- [x] `job-hunt-dashboard/src/server/services/activity-registry.test.ts` -- `hasRunning` unit tests (running/done/failed/absent, type + user isolation).
- [x] `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts` -- contract tests: duplicate concurrent POST → 409 with no extra `register`/log row (discovery + analysis); single run → one register + one log row; type-scoped guard (running analysis doesn't block discovery). Also fixed a latent test-harness issue (see Design Notes).

**Acceptance Criteria:**
- Given no discovery run is in flight, when the user clicks Discover Jobs once, then exactly one Activity dropdown row appears and exactly one Discovery row is written to the logs table on completion.
- Given a discovery run is already `running` for the user, when a duplicate concurrent POST arrives, then the server returns 409 without a second `register`/`recordRun`, and the client shows no error alert.
- Given the same for Analysis, when clicked once, then one Activity row and one Analysis log row (with correct cost/token accounting) result.
- Given a run has finished, when the user clicks again, then a new single run starts normally.

## Design Notes

Root-cause confirmation belongs in the first task. Static analysis established: server is fully symmetric and 1:1 (`api-webhooks.ts` calls `register` once + `recordRun` once; route mounted once; `PipelineRoute` mounts once; registry keys runs by fresh UUID and the client `setRuns(parsed)` full-replaces). Therefore two dropdown rows + two log rows ⟹ two POSTs. The client gap: `setIsPending(true)` (button disable) only takes effect on re-render, so a synchronous re-entrant `trigger()` is not blocked; the leading `abortRef.current?.abort()` cancels the first client read but the server's `runDiscovery`/`runAnalysis` keep running to completion — two finished runs.

Two-layer fix: the client ref-gate deterministically prevents any client-originated duplicate (double-click, programmatic re-fire); the server `hasRunning` guard is defense-in-depth and the recurrence guard, ensuring the authoritative `register`/`recordRun` layer can never double even if a duplicate request arrives by another path. The 409 must be swallowed client-side so legitimate UX is unaffected.

**Residual nuance (honest):** the server guard checks `hasRunning` *before* `return stream(...)`, but `register` runs inside the stream callback (deferred until the body is pumped). So for two near-simultaneous POSTs, the server guard can race; it is best-effort defense-in-depth. The **client ref-gate is the deterministic fix** for the reported symptom. Registering synchronously in the handler would close the race but risks orphaned `running` runs on client abort (the stream callback owns finalize), so it was deliberately not done for this minimal fix.

**Test-harness fix:** route tests call `webhooksApp.request` without auth middleware, so `c.get('userId')` was `undefined`. The registry treats an `undefined` owner as an unknown id and skips `finalize`/`progress` (`if (userId === undefined) return`), leaving runs stuck `running` and leaking across tests — which tripped the new `hasRunning` guard. Fixed by injecting a real `userId` via an `asUser(n)` wrapper (mirrors production auth), not by weakening the guard. Production always has a real `userId`, so this never affected real behavior.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun test src/server/routes/api-webhooks.test.ts src/server/services/activity-registry.test.ts` -- expected: all pass, including new duplicate-rejection and `hasRunning` tests
- `cd job-hunt-dashboard && bun test` -- expected: full suite green (no regressions in cover-letter/resume/activity tests)

**Manual checks:**
- `bun run dev`, click Discover Jobs once → exactly one Activity dropdown row, one log row after completion; repeat for Analyze Jobs. Confirm a second click after completion starts a fresh single run. Confirm no error toast ever appears for the de-duplicated request.

## Suggested Review Order

**The deterministic fix (client re-entrancy gate)**

- Entry point: re-entrant `trigger()` returns before any POST — closes the synchronous double-fire window.
  [`useWebhookStream.ts:29`](../../job-hunt-dashboard/src/client/hooks/useWebhookStream.ts#L29)
- Gate set synchronously before the first `await`; reset in `finally` (covers every exit path).
  [`useWebhookStream.ts:30`](../../job-hunt-dashboard/src/client/hooks/useWebhookStream.ts#L30)
  [`useWebhookStream.ts:166`](../../job-hunt-dashboard/src/client/hooks/useWebhookStream.ts#L166)
- 409 swallowed as a benign no-op — no spurious error alert; the in-flight run owns the UI.
  [`useWebhookStream.ts:55`](../../job-hunt-dashboard/src/client/hooks/useWebhookStream.ts#L55)

**Server defense-in-depth (per-user/per-type guard)**

- Registry helper: a run of `type` is `running` for the user → blocks a duplicate.
  [`activity-registry.ts:68`](../../job-hunt-dashboard/src/server/services/activity-registry.ts#L68)
- Discovery + Analysis return 409 before `return stream(...)` (so no `register`/`recordRun`).
  [`api-webhooks.ts:24`](../../job-hunt-dashboard/src/server/routes/api-webhooks.ts#L24)
  [`api-webhooks.ts:66`](../../job-hunt-dashboard/src/server/routes/api-webhooks.ts#L66)

**Tests & harness**

- `hasRunning` unit tests (type/user isolation, done/failed clear the gate).
  [`activity-registry.test.ts:152`](../../job-hunt-dashboard/src/server/services/activity-registry.test.ts#L152)
- Concurrency contract tests: duplicate → 409 with no extra register/log row; single → exactly one.
  [`api-webhooks.test.ts:414`](../../job-hunt-dashboard/src/server/routes/api-webhooks.test.ts#L414)
- `asUser(n)` harness injects a real `userId` (auth-faithful) so finalize/cleanup work in tests.
  [`api-webhooks.test.ts:63`](../../job-hunt-dashboard/src/server/routes/api-webhooks.test.ts#L63)
