---
title: 'Stream per-source discovery inserts to Jobs table'
type: 'bugfix'
created: '2026-06-10'
status: 'done'
baseline_commit: 'a2fe22f927b79b59952b4613b66950fe57bf49d0'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `runDiscovery` fires all source fetches via `Promise.all` — if any source hits the 120s scraper timeout, the entire call throws and zero jobs are inserted, even though other sources already returned results. The client only invalidates `['jobs']` on a `{ done: true }` event, which never arrives on timeout.

**Approach:** Refactor each source to fetch, filter, insert, and signal independently using per-source async handlers run concurrently. Emit a `{ jobsReady }` stream event immediately after each source's batch is committed so the client refreshes the Jobs table in real time. Use `Promise.allSettled` instead of `Promise.all` so one source failing never aborts siblings.

## Boundaries & Constraints

**Always:** User-owned columns never touched on insert (`applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`). Relevance scoring stays as a post-step after all sources complete — jobs are visible first, scoring follows. `onConflictDoNothing()` is the insert conflict strategy. Return type of `runDiscovery` is unchanged.

**Ask First:** Nothing.

**Never:** Switch to SSE protocol (existing newline-delimited JSON stream is sufficient). Change the final `{ done: true, inserted }` event shape. Wrap the stream in an envelope. Touch the analysis flow.

## I/O & Edge-Case Matrix

| Scenario | State | Expected Behavior | Error Handling |
|---|---|---|---|
| One source completes, another still pending | Source A returns 3 jobs | `{ jobsReady, count: 3, source }` emitted; `['jobs']` invalidated immediately; UI shows 3 new rows | N/A |
| One source times out after another inserted | Source A inserted 3 jobs; Source B times out | `{ done: true, inserted: 3 }` eventually; jobs already visible in UI | timeout error collected in `errors[]`; not thrown |
| All sources fail (HTTP 500) | Scraper returns 500 for all | `{ done: true, inserted: 0 }` emitted; no throw from `runDiscovery` | errors collected in `errors[]`; `recordRun` called with `success: false` if `inserted === 0` and errors exist |
| No new jobs from any source | All results already in DB | `{ done: true, inserted: 0 }` emitted; no `jobsReady` events | N/A |

</frozen-after-approval>

## Code Map

- `src/server/services/discovery-service.ts` — core service: restructure `Promise.all` into per-source concurrent handlers; add `onJobsInserted` 3rd param
- `src/server/routes/api-webhooks.ts` — webhook route: pass `onJobsInserted` callback that writes `{ jobsReady }` to stream; set `success: false` on recordRun when all inserted=0 and errors exist
- `src/client/hooks/useWebhookStream.ts` — client hook: handle `ev.jobsReady === true` by immediately invalidating `['jobs']` query
- `src/server/services/discovery-service.test.ts` — update 'scraper error: throws' test to new no-throw contract; add `onJobsInserted` call count assertion

## Tasks & Acceptance

**Execution:**
- [x] `src/server/services/discovery-service.ts` -- Add `onJobsInserted?: (count: number, source: string) => void` as 3rd optional param. Load `existingIds`, `blacklistedNames`, and shared `seen` Set once upfront before any fetches. Replace `Promise.all(activeSearches.map(...))` block with per-source async handlers: each handler independently fetches, filters, inserts in a transaction, calls `onProgress('Inserting N jobs from source…')` then `onJobsInserted(count, source)`, and returns `{ source, insertedCount, updatedStorageStateContent? }`. Use `Promise.allSettled` to wait for all handlers. Catch per-source errors inside each handler and push to `errors[]` instead of throwing. Keep relevance scoring as post-step over all newly inserted job IDs collected during handlers. Keep bySource/total tallying.
- [x] `src/server/routes/api-webhooks.ts` -- Pass a third argument to `runDiscovery`: `(count, source) => write({ jobsReady: true, count, source })`. In the success branch, if `errors.length > 0 && inserted === 0`, call `recordRun` with `success: false`; otherwise keep `success: true`.
- [x] `src/client/hooks/useWebhookStream.ts` -- In the stream-reading loop (and in the flush-remaining block), add an `else if (ev.jobsReady === true)` branch that calls `queryClient.invalidateQueries({ queryKey: ['jobs'] })`.
- [x] `src/server/services/discovery-service.test.ts` -- Update `'scraper error: throws when any search returns non-ok status'`: change from `rejects.toThrow()` to `expect(inserted).toBe(0)` + `expect(errors.length).toBeGreaterThan(0)`. Add a test: `'onJobsInserted called once per source that inserts new jobs'` — mock fetch returning 1 job, pass `onJobsInserted` callback, assert it was called with `(1, 'linkedin')`.

**Acceptance Criteria:**
- Given a discovery run where source A completes and source B times out, when source A inserts 3 jobs, the Jobs table immediately refreshes with those 3 rows before `{ done: true }` arrives
- Given all sources returning HTTP 500, when discovery completes, `runDiscovery` resolves (does not throw) and `inserted === 0` with non-empty `errors`
- Given `onJobsInserted` is passed to `runDiscovery`, when a source inserts jobs, `onJobsInserted(count, source)` is called with the correct count before the next source's results are processed
- Given a `{ jobsReady: true }` event on the stream, when `useWebhookStream` processes it, `queryClient.invalidateQueries({ queryKey: ['jobs'] })` is called immediately

## Design Notes

The `seen` Set is safe under concurrent per-source handlers because JS is single-threaded — filter logic (including `seen.has()` / `seen.add()`) runs synchronously between `await` points, so two handlers cannot interleave during deduplication.

The `existingIds` pre-load is an optimization only — stale reads for jobs inserted by a concurrent handler are harmless because `onConflictDoNothing()` provides the real guard.

Storage-state writes (LinkedIn/Indeed session refresh) happen inside each per-source handler using the same logic as before — each handler updates its own session independently.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun test src/server/services/discovery-service.test.ts` -- expected: all tests pass
- `cd job-hunt-dashboard && bun run typecheck` -- expected: no errors

**Manual checks:**
- Trigger discovery from the UI; watch browser devtools Network tab; confirm `{ jobsReady: true, count: N, source: "..." }` events appear in the stream response before `{ done: true }`; confirm job rows appear in the table before the Discover button re-enables

## Suggested Review Order

**Core per-source processing (entry point)**

- `processSearch` function: the new independent handler unit replacing the `Promise.all` block
  [`discovery-service.ts:161`](../../job-hunt-dashboard/src/server/services/discovery-service.ts#L161)

- `Promise.allSettled` replaces `Promise.all`; failures isolated per-source now
  [`discovery-service.ts:270`](../../job-hunt-dashboard/src/server/services/discovery-service.ts#L270)

- `onJobsInserted` fires immediately after each per-source transaction, before siblings complete
  [`discovery-service.ts:266`](../../job-hunt-dashboard/src/server/services/discovery-service.ts#L266)

**Error isolation**

- Per-source fetch errors push to `errors[]` and return; no throw propagates up
  [`discovery-service.ts:192`](../../job-hunt-dashboard/src/server/services/discovery-service.ts#L192)

- `existingIds` and `blacklistedNames` loaded upfront; `seen` Set shared safely (single-threaded JS)
  [`discovery-service.ts:141`](../../job-hunt-dashboard/src/server/services/discovery-service.ts#L141)

**Stream event protocol**

- Webhook passes `onJobsInserted` callback that emits `{ jobsReady: true, count, source }` mid-stream
  [`api-webhooks.ts:27`](../../job-hunt-dashboard/src/server/routes/api-webhooks.ts#L27)

- `success` flag false only when `inserted === 0 && errors.length > 0` (all sources failed)
  [`api-webhooks.ts:29`](../../job-hunt-dashboard/src/server/routes/api-webhooks.ts#L29)

**Client invalidation**

- `jobsReady` branch invalidates `['jobs']` immediately in the main stream read loop
  [`useWebhookStream.ts:89`](../../job-hunt-dashboard/src/client/hooks/useWebhookStream.ts#L89)

- Same handling in flush-remaining block for edge-case final buffered event
  [`useWebhookStream.ts:114`](../../job-hunt-dashboard/src/client/hooks/useWebhookStream.ts#L114)

**Tests**

- Updated scraper-error test: no longer expects throw; asserts errors[] instead
  [`discovery-service.test.ts:227`](../../job-hunt-dashboard/src/server/services/discovery-service.test.ts#L227)

- New callback test: asserts `onJobsInserted` fires with correct count and source
  [`discovery-service.test.ts:241`](../../job-hunt-dashboard/src/server/services/discovery-service.test.ts#L241)
