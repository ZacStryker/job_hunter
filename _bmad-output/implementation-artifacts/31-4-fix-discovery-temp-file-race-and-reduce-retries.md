# Story 31.4: Fix Discovery Temp File Race & Reduce Retries

Status: done

## Story

As a user running LinkedIn discovery,
I want the storageState temp file to remain available for all retry attempts,
So that discovery runs don't produce ENOENT errors and retries have a fair chance to succeed.

## Acceptance Criteria

1. **Given** a discovery run is in progress with a temp storageState file on disk, **When** the AbortSignal fires, **Then** the `unlinkSync` call does not execute until after all in-flight attempts complete (deferred to a finally block or equivalent).

2. **Given** `scrapeWithRetry` is called for any route, **When** configured, **Then** retries is set to 1 (down from 3).

3. **Given** a discovery run times out, **When** the AbortSignal fires with a retry in flight, **Then** no ENOENT error appears in logs for the storageState file.

4. **Given** cleanup is moved to a finally block, **When** a run completes or errors by any path, **Then** the temp file is always deleted — no file leaks.

## Tasks / Subtasks

- [x] Change `scrapeWithRetry` default retries from 3 to 1 in `base.js` (AC: 2)
  - [x] Change `retries = 3` to `retries = 1` in the function signature
  - [x] Verify all callers that rely on the default now get 1 retry (not 3)
  - [x] Confirm callers that explicitly pass `0` still get 0 retries

## Dev Notes

### Architecture Reality Check — Read Before Touching Anything

The epic originally pointed to `discovery-service.ts` lines 183-185 as the source of the temp file race (an `unlinkSync` in an AbortSignal callback). **That bug no longer exists.** Commit `89157fe` ("fix(scraper): pass LinkedIn storage state as content, auto-persist after search") refactored the entire storage state flow:

- `discovery-service.ts` no longer manages temp files at all. It passes `storageStateContent` (the JSON string) in the HTTP request body to the scraper service.
- `job-hunt-dashboard/scraper/src/routes/scrape.js` now owns temp file lifecycle via `withStorageState()`:

```javascript
async function withStorageState(content, fn) {
  if (!content) return { result: await fn(null), updatedContent: null };
  const tempPath = join(tmpdir(), `linkedin-session-${Date.now()}.json`);
  writeFileSync(tempPath, content, 'utf-8');
  try {
    const result = await fn(tempPath);
    const updatedContent = readFileSync(tempPath, 'utf-8');
    return { result, updatedContent };
  } finally {
    try { unlinkSync(tempPath); } catch {}  // ← already correct: finally + swallowed ENOENT
  }
}
```

AC 1, 3, and 4 are already satisfied by this `try/finally` pattern. The `fn(tempPath)` call wraps the entire scraper call (including all retries via `scrapeWithRetry`). The `finally` only runs after all retries complete or all throw. Do NOT touch `withStorageState` or `discovery-service.ts` — they are correct.

### The Only Actual Change: Reduce Default Retries

`job-hunt-dashboard/scraper/src/scrapers/base.js` line 60:

```javascript
// CURRENT (wrong):
export async function scrapeWithRetry(source, fn, retries = 3) {

// TARGET (correct):
export async function scrapeWithRetry(source, fn, retries = 1) {
```

That is the entire implementation. One word change.

### Why This Change Matters

With 3 retries, a failing scraper operation (e.g., LinkedIn bot detection) runs 4 total attempts (1 initial + 3 retries) with a 2-second minimum gap. On a 60-120 second timeout, this wastes cycles that have no recovery value since LinkedIn bot detection doesn't resolve within seconds. Reducing to 1 retry (2 total attempts) gives one fair retry while avoiding unnecessary delay.

### Caller Inventory — What Changes With This Default

All callers that do NOT explicitly pass a retries argument will change from 3 → 1:

| Caller | Current retries | After change |
|--------|----------------|--------------|
| `searchIndeed` (indeed.js:9) | default → 3 | default → 1 |
| `fetchIndeedListing` (indeed.js:50) | default → 3 | default → 1 |
| `searchIndeedNl` (indeed_nl.js:9) | default → 3 | default → 1 |
| `fetchIndeedNlListing` (indeed_nl.js:53) | default → 3 | default → 1 |
| `searchArc` (arc.js:4) | default → 3 | default → 1 |
| `fetchLinkedInListing` (linkedin.js:31) | default → 3 | default → 1 |

Callers with explicit values are NOT affected:
| Caller | Explicit value | Unchanged |
|--------|---------------|-----------|
| `searchLinkedIn` (linkedin.js:4) | `1` | stays 1 |
| `fetchIndeedJobDetails` (indeed.js:61) | `0` | stays 0 |
| `fetchIndeedNlJobDetails` (indeed_nl.js:65) | `0` | stays 0 |
| `fetchLinkedInJobDetails` (linkedin.js:42) | `0` | stays 0 |

### What NOT to Change

- `scrape.js` — `withStorageState` is correct; do not touch
- `discovery-service.ts` — no temp file code; do not touch
- Any scraper caller files — no retries changes needed at call sites
- `withFirefoxPage` in `base.js` — works correctly; do not touch
- `pool.js` — out of scope for this story

### Project Structure Reminder

- Scraper is a **separate Node.js service**: `job-hunt-dashboard/scraper/`
- Plain JavaScript (`.js`), not TypeScript — no strict-mode rules, no types
- No test files in scraper (by design); manual verification expected
- The only file to modify: `job-hunt-dashboard/scraper/src/scrapers/base.js`

### References

- `job-hunt-dashboard/scraper/src/scrapers/base.js:60` — the one line to change
- `job-hunt-dashboard/scraper/src/routes/scrape.js:10-21` — `withStorageState` (already correct; read-only reference)
- `job-hunt-dashboard/scraper/src/scrapers/linkedin.js` — explicit retry values at call sites
- `job-hunt-dashboard/scraper/src/scrapers/indeed.js` — callers that will inherit new default
- `job-hunt-dashboard/scraper/src/scrapers/indeed_nl.js` — callers that will inherit new default
- `job-hunt-dashboard/scraper/src/scrapers/arc.js` — caller that will inherit new default
- Epic 31: `_bmad-output/planning-artifacts/epics/epic-31-scraper-reliability-bot-detection-hardening.md` (Story 31.4 section)
- Story 31.3: `_bmad-output/implementation-artifacts/31-3-firefox-browser-pool-2-instances.md` (previous story context)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- AC 1, 3, 4 were pre-satisfied by `withStorageState` in `scrape.js` (try/finally already correct per commit 89157fe)
- Changed `scrapeWithRetry` default from `retries = 3` to `retries = 1` in `base.js:60`
- Verified callers: `searchLinkedIn` (explicit `1`, unchanged), `fetchIndeedJobDetails`/`fetchIndeedNlJobDetails`/`fetchLinkedInJobDetails` (explicit `0`, unchanged), all other callers now inherit default of `1`

### File List

- `job-hunt-dashboard/scraper/src/scrapers/base.js`

## Change Log

- 2026-05-12: Changed `scrapeWithRetry` default retries from 3 to 1 (AC 2)
