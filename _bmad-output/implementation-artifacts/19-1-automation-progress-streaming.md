# Story 19.1: Automation Progress Streaming & Auto-Refresh

**Epic:** 19 — Live Pipeline Feedback  
**Story ID:** 19-1-automation-progress-streaming  
**Status:** done  
**Depends on:** Epic 13 (done), Epic 14 (done)  
**Date:** 2026-04-19

---

## User Story

As a job hunter,
I want to see step-by-step status messages while Discovery and Analysis are running, and have the jobs table refresh automatically when they finish,
so that I know the automation is progressing and don't have to manually reload the page.

---

## Acceptance Criteria

### AC1 — Discovery shows per-search progress messages
- While Discovery is running, the alert area (same spot as the current "Discovery triggered" alert) shows the current operation text, updating as each search completes
- Minimum messages: one per search config (e.g. "Searching linkedin: genai python…"), then a completion summary (e.g. "Done — 5 new jobs inserted")

### AC2 — Analysis shows per-job progress messages
- While Analysis is running, the alert area shows the current job being analyzed (e.g. "Analyzing 1 / 8: Acme Corp — Senior Engineer"), then a completion summary (e.g. "Done — 7 analyzed, 1 failed")

### AC3 — Jobs table auto-refreshes after Discovery completes
- When Discovery finishes successfully, the Pipeline table updates to show newly scraped jobs without a manual page refresh

### AC4 — Jobs table auto-refreshes after Analysis completes
- When Analysis finishes successfully, the Pipeline table (and Matches view) updates to reflect newly analyzed jobs (fitScore, recommendation columns populated) without a manual page refresh

### AC5 — Error handling unchanged
- If Discovery or Analysis fails, the error alert continues to work exactly as it does today

### AC6 — Buttons/spinner behavior unchanged
- The Discovery/Analysis buttons still show the spinner + label while running; the action bar behavior is otherwise unchanged

---

## Technical Design

### Server: NDJSON streaming via Hono `stream`

Hono 4.x ships `import { stream } from 'hono/streaming'`. The `stream` helper wraps the response body as a `WritableStream` and sets the correct headers.

**Event shape (newline-delimited JSON on the response body):**
```
{"status":"Searching linkedin: genai python…"}
{"status":"Searching indeed_nl: engineer…"}
{"done":true,"inserted":3}
```
On error (after stream has started):
```
{"error":"Scraper error: timeout"}
```
On pre-flight guard failure (before stream starts), return `c.json({ error: '...' }, 503)` — same as today.

**`runDiscovery` signature change:**
```typescript
export async function runDiscovery(
  onProgress?: (msg: string) => void
): Promise<{ inserted: number }>
```
Emit progress:
- Before each scraper fetch: `onProgress?.('Searching {source}: {query}…')`
- After all fetches resolve: `onProgress?.('Inserting {n} new jobs…')` (only if n > 0)

**`runAnalysis` signature change:**
```typescript
export async function runAnalysis(
  onProgress?: (msg: string) => void
): Promise<{ processed: number; failed: number }>
```
Emit progress:
- At loop start: `onProgress?.('Found {pendingJobs.length} jobs to analyze')`
- Before each job: `onProgress?.('Analyzing {i} / {total}: {job.company} — {job.jobTitle}')`

**Webhook route changes (`src/server/routes/api-webhooks.ts`):**
```typescript
import { stream } from 'hono/streaming'

app.post('/discovery', (c) => {
  if (!process.env.SCRAPER_URL) return c.json({ error: 'SCRAPER_URL not configured' }, 503)
  return stream(c, async (s) => {
    const write = (ev: object) => s.writeln(JSON.stringify(ev))
    try {
      const { inserted } = await runDiscovery((msg) => write({ status: msg }))
      recordRun({ name: 'Discovery', success: true, itemCount: inserted, errorMessage: null })
      write({ done: true, inserted })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[discovery] run failed:', message)
      recordRun({ name: 'Discovery', success: false, itemCount: null, errorMessage: message })
      write({ error: message })
    }
  })
})
```
Same pattern for `/analysis`.

**Remove `fireWebhook`** — it is unused (TS6133 error already present). Delete the function.

### Client: new `useWebhookStream` hook

**New file: `src/client/hooks/useWebhookStream.ts`**

Replaces `useWebhookMutation` for Discovery and Analysis in `PipelineRoute`. Keep `useWebhookMutation.ts` as-is (may be reused elsewhere).

```typescript
export interface WebhookStreamState {
  isPending: boolean
  statusMessage: string | null
  isSuccess: boolean
  isError: boolean
  error: string | null
  trigger: () => void
  reset: () => void
}

export function useWebhookStream(url: string): WebhookStreamState
```

**Implementation notes:**
- `trigger()` sets `isPending = true`, clears prior state, then calls `fetch(url, { method: 'POST' })`
- If `!response.ok` before streaming: extract `{ error }` from JSON body, set error state
- Read `response.body` as a `ReadableStream` via `response.body.getReader()`; decode with `TextDecoder`; buffer and split on `'\n'`; `JSON.parse` each non-empty line
- On `{ status }` event: `setStatusMessage(event.status)`
- On `{ done }` event: `setIsPending(false)`, `setIsSuccess(true)`, invalidate `['jobs']` + `['webhook-runs']` via `queryClient`
- On `{ error }` event: `setIsPending(false)`, `setIsError(true)`, `setError(event.error)`, invalidate `['webhook-runs']`
- On stream end without a `done` event: treat as error — "Stream ended unexpectedly"
- `reset()` clears `isSuccess`, `isError`, `error`, `statusMessage` (mirrors TanStack mutation `.reset()`)

**NDJSON parsing pattern (critical — use this exact approach):**
```typescript
const reader = response.body!.getReader()
const decoder = new TextDecoder()
let buf = ''
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buf += decoder.decode(value, { stream: true })
  const lines = buf.split('\n')
  buf = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    const ev = JSON.parse(line) as Record<string, unknown>
    // handle ev
  }
}
```

### `PipelineRoute` changes (`src/client/routes/index.tsx`)

Replace:
```typescript
const discoveryMutation = useWebhookMutation('/api/webhooks/discovery')
const analysisMutation = useWebhookMutation('/api/webhooks/analysis')
```
With:
```typescript
const discoveryStream = useWebhookStream('/api/webhooks/discovery')
const analysisMutation = useWebhookStream('/api/webhooks/analysis')
```
(Use your preferred variable names.)

**Alert area:** While `isPending`, show `statusMessage` (if any) instead of the current static "Discovery triggered / Workflow started successfully" text. The alert title can remain (e.g. "Discovery running…") with the `statusMessage` as the description.

**Success/error alerts:** Use `isSuccess` / `isError` exactly as today — same `useEffect` / `setTimeout` dismiss pattern, same Alert components. On success alert, show the final `statusMessage` (which will be the summary like "Done — 5 new jobs inserted") as the description instead of "Workflow started successfully."

**Disable logic:** Use `.isPending` from each stream state in place of `.isPending` from each mutation — same guard on the buttons.

**Remove the 4 `useEffect` blocks** that watch `discoveryMutation.isSuccess`, `discoveryMutation.isError`, `analysisMutation.isSuccess`, `analysisMutation.isError` — the stream hook manages success/error state internally, so those effects are no longer needed. Replace with two effects watching `discoveryStream.isSuccess` and `analysisMutation.isSuccess` to auto-dismiss the alert after 4 s (same pattern, just fewer effects needed if you keep alert state in PipelineRoute).

---

## Files to Change

| File | Change |
|---|---|
| `src/server/services/discovery-service.ts` | Add `onProgress?: (msg: string) => void` param; emit progress at search start |
| `src/server/services/analysis-service.ts` | Add `onProgress?: (msg: string) => void` param; emit per-job progress |
| `src/server/routes/api-webhooks.ts` | Switch both routes to `stream()`; delete unused `fireWebhook`; pass `onProgress` to services |
| `src/client/hooks/useWebhookStream.ts` | **New file** — NDJSON streaming hook with `trigger`, `reset`, state fields |
| `src/client/routes/index.tsx` | Swap `useWebhookMutation` → `useWebhookStream`; update alert rendering to show `statusMessage` |

`src/client/hooks/useWebhookMutation.ts` — **do not modify** (kept for potential reuse).

---

## Dev Agent Guardrails

**Do not use `EventSource`** — it only supports GET. This is POST-initiated streaming; use `fetch` + `ReadableStream`.

**Do not use `streamText` from 'hono/streaming'** — it sets `Content-Type: text/plain`. Use `stream` (sets `application/octet-stream`, which is fine for NDJSON).

**TypeScript strict mode**: `stream` returns `Response`, so `app.post('/discovery', (c) => stream(c, ...))` is valid. No `async` on the outer handler — `stream` handles the async internally.

**`s.writeln(str)`** writes `str + '\n'` — no need to manually append `\n`.

**QueryClient invalidation in hook**: import `useQueryClient` from `@tanstack/react-query`; call `queryClient.invalidateQueries({ queryKey: ['jobs'] })` and `queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })` on completion.

**No TanStack `useMutation`** in the new hook — streaming state is plain `useState`. This is intentional: `useMutation` doesn't natively support incremental progress updates.

**Alert state ownership stays in `PipelineRoute`** — the hook exposes `isSuccess`/`isError`/`statusMessage`; `PipelineRoute` owns the 4 s auto-dismiss timer and the `activeAlert` state, same as today.

**`onProgress` is optional** in both services — existing callers (tests) don't break. Signature: `onProgress?: (msg: string) => void`.

---

## Project Context Reference

- `src/shared/schemas.ts` — single source of truth for types; no new types needed here (webhook responses are internal)
- All errors: `console.error` on server; `{ error: string }` shape in JSON
- Bun 1.3.x runtime — `TextDecoder` is available globally
- Hono 4.x — `import { stream } from 'hono/streaming'` is available
- TanStack Query v5 — `queryClient.invalidateQueries({ queryKey: [...] })` is the correct v5 API
- Firefox latest target — `ReadableStream` and `TextDecoder` fully supported

---

## Tasks/Subtasks

- [x] Task 1: Add `onProgress` callback to `runDiscovery` in discovery-service.ts
  - [x] Emit "Searching {source}: {query}…" before each scraper fetch
  - [x] Emit "Inserting {n} new jobs…" before the DB transaction (only when n > 0)
- [x] Task 2: Add `onProgress` callback to `runAnalysis` in analysis-service.ts
  - [x] Emit "Found {n} jobs to analyze" after fetching pending jobs
  - [x] Emit "Analyzing {i} / {total}: {company} — {title}" before each job
- [x] Task 3: Rewrite `api-webhooks.ts` to use Hono `stream()` and delete unused `fireWebhook`
  - [x] Switch `/discovery` route to NDJSON streaming with `onProgress` callback
  - [x] Switch `/analysis` route to NDJSON streaming with `onProgress` callback
  - [x] Pre-flight 503 guards remain as JSON (before stream starts)
- [x] Task 4: Create `useWebhookStream.ts` hook with NDJSON streaming and TanStack Query invalidation
  - [x] `trigger()` initiates fetch and reads NDJSON stream with `TextDecoder`
  - [x] State: `isPending`, `statusMessage`, `isSuccess`, `isError`, `error`
  - [x] On `done` event: invalidate `['jobs']` and `['webhook-runs']`
  - [x] On `error` event: set error state, invalidate `['webhook-runs']`
  - [x] `reset()` clears success/error/statusMessage state
- [x] Task 5: Update `PipelineRoute` in `index.tsx` to use `useWebhookStream`
  - [x] Replace `useWebhookMutation` with `useWebhookStream` for both buttons
  - [x] Show `statusMessage` in alert area while pending
  - [x] Update success alert to show final `statusMessage` as description
  - [x] Keep 4-second auto-dismiss on success/error
- [x] Task 6: Update tests
  - [x] Update `api-webhooks.test.ts` to consume NDJSON stream and test progress events
  - [x] Add `onProgress` tests to `discovery-service.test.ts`
  - [x] Add `onProgress` tests to `analysis-service.test.ts`
  - [x] Add `search_configs` table creation to discovery-service test setup

### Review Findings

- [x] [Review][Patch] Completion summary never constructed — `done` event payload fields (`inserted`, `processed`, `failed`) are received but ignored; `setStatusMessage` is never called in the `done` branch, so the success alert shows the last in-progress status line instead of "Done — 5 new jobs inserted" / "Done — 7 analyzed, 1 failed" (AC1, AC2) [`useWebhookStream.ts:65-70`]
- [x] [Review][Patch] No AbortController — `trigger()` starts a fetch with a `reader.read()` loop but never wires an AbortController; on component unmount mid-stream, state updates and query invalidations continue firing in the detached closure [`useWebhookStream.ts:22-93`]
- [x] [Review][Patch] Reader not released on error paths — `reader` is never `cancel()`ed or `releaseLock()`ed in the catch block or when an error event is received mid-stream, leaving the underlying connection open [`useWebhookStream.ts` error/catch paths]
- [x] [Review][Patch] JSON.parse no per-line catch — a malformed NDJSON line throws synchronously inside the for-loop, unwinds to the outer catch, discards all remaining buffered events (including a `done` or `error` that may already be in the buffer), and closes the reader without cancelling it [`useWebhookStream.ts:62`]
- [x] [Review][Patch] Trailing buffer discarded + TextDecoder not flushed — after the read loop, `buf` may hold the final line if no trailing `\n` was sent; `decoder.decode()` (flush mode) is also never called, potentially corrupting the last multi-byte character in a status message [`useWebhookStream.ts:54-81`]
- [x] [Review][Patch] Timer callback calls reset() on in-flight stream — the 4-second timeout calls `discoveryStream.reset()`, which clears `statusMessage` (and `isSuccess`/`isError`) while a second run may already be in-flight; `trigger()` already resets state at startup, making the timer's `reset()` redundant and harmful [`index.tsx:85,91,100,106`]
- [x] [Review][Patch] `response.body!` non-null assertion — if `body` is null (204, or consumed stream), throws an unhelpful TypeError that lands in the outer catch as an unintelligible error message rather than a clear diagnostic [`useWebhookStream.ts:50`]
- [x] [Review][Patch] Test: single search_configs row inserted in beforeAll never cleaned up — persists across all tests in the suite, causing unexpected extra fetch invocations in tests that don't account for it [`discovery-service.test.ts:beforeAll`]
- [x] [Review][Defer] `runDiscovery` silently discards per-source fetch errors — `.catch()` returns `{source, results:[]}` with no progress message and no counter; user sees "Inserting 0 jobs…" or nothing with no indication a scraper call failed [`discovery-service.ts`] — deferred, pre-existing
- [x] [Review][Defer] No client-side stream timeout — `isPending` can hang indefinitely if the server becomes unresponsive after sending HTTP 200 headers; no AbortSignal timeout or Promise.race escape [`useWebhookStream.ts:54-79`] — deferred, pre-existing design limitation not in spec scope
- [x] [Review][Defer] `recordRun` throw inside stream callback — if `recordRun` throws (e.g. DB not initialized), the exception exits the `stream()` callback; client hits "Stream ended unexpectedly" with no useful message [`api-webhooks.ts`] — deferred, pre-existing

---

## Dev Agent Record

### Completion Notes

Implemented NDJSON streaming for Discovery and Analysis webhook routes. Both service functions now accept an optional `onProgress` callback that is entirely backward-compatible with existing callers. The new `useWebhookStream` hook uses `fetch` + `ReadableStream` (not EventSource, which only supports GET) and accumulates NDJSON lines using the TextDecoder + buffer-split pattern specified in the story.

Key decisions:
- Used a local `encounteredError` variable in the hook to avoid stale closure bug when checking error state after the stream loop
- The 503 pre-flight guards remain as JSON responses (stream not started) — consistent with AC5 (error handling unchanged)
- Streaming errors (service throws mid-run) result in HTTP 200 with `{"error":"..."}` NDJSON event — tests updated accordingly
- `useWebhookMutation.ts` left untouched as specified (kept for potential reuse)

All 200 tests pass (7 pre-existing failures in `api-ingest.test.ts` unrelated to this story — missing `date_analyzed` column in that test's DDL). Build succeeds cleanly.

---

## File List

- `job-hunt-dashboard/src/server/services/discovery-service.ts` — added `onProgress` param, search/insert progress messages
- `job-hunt-dashboard/src/server/services/analysis-service.ts` — added `onProgress` param, found/per-job progress messages
- `job-hunt-dashboard/src/server/routes/api-webhooks.ts` — switched to `stream()`, deleted `fireWebhook`, pass `onProgress`
- `job-hunt-dashboard/src/client/hooks/useWebhookStream.ts` — new NDJSON streaming hook
- `job-hunt-dashboard/src/client/routes/index.tsx` — swapped to `useWebhookStream`, updated alert area
- `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts` — updated for streaming response format + progress event tests
- `job-hunt-dashboard/src/server/services/discovery-service.test.ts` — added `search_configs` table, `onProgress` tests
- `job-hunt-dashboard/src/server/services/analysis-service.test.ts` — added `onProgress` tests

---

## Change Log

- 2026-04-19: Implemented story 19-1 — NDJSON streaming for Discovery/Analysis with real-time status messages, auto-refresh on completion
