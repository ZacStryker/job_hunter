# Story 31.5: Switch Arc Scraper to Firefox

Status: review

## Story

As a user running discovery,
I want Arc.dev scraping to use Firefox,
So that it is consistent with the Firefox-first strategy and resilient to future bot detection changes.

## Acceptance Criteria

1. **Given** `searchArc` is called, **When** it executes, **Then** it uses `withFirefoxPage` instead of `withPage` (Chromium).

2. **Given** Arc.dev requires no authentication, **When** `withFirefoxPage` is called, **Then** no `storageStatePath` is passed (null first arg — auth-free operation preserved).

3. **Given** the browser switch, **When** Arc search results are returned, **Then** returned job fields match what were returned before the change — no data regression.

## Tasks / Subtasks

- [x] Switch `searchArc` to Firefox (AC: 1, 2, 3)
  - [x] In `arc.js` line 1: swap `withPage` → `withFirefoxPage` in the import
  - [x] In `arc.js` line 6: change `withPage(null, async (page) => {` to `withFirefoxPage(null, async (page) => {`

- [x] Manual verification (AC: 3)
  - [x] Trigger a discovery run with Arc enabled; confirm job cards are returned without errors in the scraper console

## Dev Notes

### The One File to Change

Only `job-hunt-dashboard/scraper/src/scrapers/arc.js` changes. Nothing else.

**Current state:**
```js
// line 1
import { withPage, scrapeWithRetry, parseRelativeDate, isWithin24Hours } from './base.js';

// line 6
return withPage(null, async (page) => {
```

**Target state — two edits:**
```js
// line 1
import { withFirefoxPage, scrapeWithRetry, parseRelativeDate, isWithin24Hours } from './base.js';

// line 6
return withFirefoxPage(null, async (page) => {
```

The `null` first argument is intentional and correct — Arc has no authentication/session, so `storageStatePath` is null. `withFirefoxPage` accepts null without issues.

### withFirefoxPage Signature (from base.js line 34)

```js
export async function withFirefoxPage(storageStatePath, fn, contextOverrides = {}) {
  const { page, context } = await getFirefoxPage(storageStatePath, contextOverrides);
  try {
    const result = await fn(page);
    if (storageStatePath) await context.storageState({ path: storageStatePath });
    return result;
  } finally {
    await releasePage(context);
  }
}
```

No third argument (`contextOverrides`) is needed — default `{}` is fine. The `storageState` save only fires when `storageStatePath` is truthy, so passing `null` is exactly right for Arc.

### Behavior Difference: No Scroll-on-Load

`withPage` registers a `page.on('load', ...)` handler that scrolls 0–300px. `withFirefoxPage` does not. This is intentional — arc.js already has its own randomized wait (`page.waitForTimeout(1500 + Math.random() * 1000)`) which provides the human-simulation delay. No behavioral change is needed in the arc.js body.

### Post-Change: withPage Becomes Dead Code in base.js

After this story, `withPage` is defined in `base.js` (line 45) but has no callers anywhere in the scraper service:

- `linkedin.js` — switched to `withFirefoxPage` in story 31.1
- `indeed.js` — already uses `withFirefoxPage`
- `indeed_nl.js` — already uses `withFirefoxPage`
- `arc.js` — being switched in this story

`withPage` can be left as-is (it's exported and causes no harm) or removed. **Do not remove it as part of this story** — it is out of scope and would require verifying all import sites. Flag it in the completion notes for future cleanup if desired.

### Locale: Already Correct for Arc

Story 31.2 changed `getFirefoxPage` to default to `locale: 'en-US'` / `timezoneId: 'America/New_York'`. Arc uses the default (no explicit locale args), so Arc will run with English locale — which is correct. No locale work needed.

### Arc Bot Detection Context

Arc.dev has less aggressive bot detection than LinkedIn or Indeed. The Firefox switch is primarily for consistency with the Firefox-first strategy (Epic 31) rather than an active bot-detection fix. Low risk of regression.

### Project Structure Notes

- The scraper is a **separate Node.js service**: `job-hunt-dashboard/scraper/`
- Plain JavaScript (`.js`), not TypeScript — no types, no strict-mode enforcement
- Scraper source files live in `scraper/src/scrapers/`
- No test files exist in the scraper (by design) — manual verification is expected
- The Firefox pool (2 instances, from story 31.3) handles concurrency — no pool changes needed

### Reference Implementation

Story 31.1 applied the identical `withPage` → `withFirefoxPage` swap to `linkedin.js` lines 32 and 44. The pattern is proven.

### References

- `job-hunt-dashboard/scraper/src/scrapers/arc.js` — the only file to modify (lines 1, 6)
- `job-hunt-dashboard/scraper/src/scrapers/base.js:34–43` — `withFirefoxPage` definition
- `job-hunt-dashboard/scraper/src/scrapers/base.js:45–58` — `withPage` definition (for comparison)
- `job-hunt-dashboard/scraper/src/browser/pool.js` — `getFirefoxPage` (locale defaults set in story 31.2)
- Story 31.1: `_bmad-output/implementation-artifacts/31-1-switch-linkedin-listing-detail-fetchers-to-firefox.md` (identical pattern, reference)
- Epic 31: `_bmad-output/planning-artifacts/epics/epic-31-scraper-reliability-bot-detection-hardening.md` (story 31.5 section)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — two-line mechanical swap, no debugging required.

### Completion Notes List

- Swapped import from `withPage` to `withFirefoxPage` in arc.js line 1.
- Swapped call site from `withPage(null, ...)` to `withFirefoxPage(null, ...)` in arc.js line 6.
- `null` storageStatePath is intentional and correct — Arc has no authentication.
- No other files changed. No test suite exists in the scraper service (by design).
- Note for future cleanup: `withPage` in base.js is now dead code with no callers — can be removed in a separate story.

### File List

- job-hunt-dashboard/scraper/src/scrapers/arc.js

### Change Log

- 2026-05-12: Switched arc.js scraper from Chromium (`withPage`) to Firefox (`withFirefoxPage`) — import and call site updated (Story 31.5)
