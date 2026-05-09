# Story 31.1: Switch LinkedIn Listing/Detail Fetchers to Firefox

Status: ready-for-dev

## Story

As a user running discovery,
I want LinkedIn listing and job detail fetches to use Firefox (withFirefoxPage),
so that the analysis flow is not blocked by LinkedIn's bot detection.

## Acceptance Criteria

1. **Given** `fetchLinkedInListing` is called with a valid LinkedIn URL, **When** the function executes, **Then** it uses `withFirefoxPage` instead of `withPage` (Chromium + stealth); **And** the job listing HTML is returned without a timeout.

2. **Given** `fetchLinkedInJobDetails` is called with a valid LinkedIn job URL, **When** the function executes, **Then** it uses `withFirefoxPage`; **And** the full job description and metadata are returned.

3. **Given** a LinkedIn session exists in the DB for the current user, **When** either function runs, **Then** the session's `storageStatePath` is passed to `withFirefoxPage` (this is already implemented via the function parameter — no signature change needed).

4. **Given** both functions previously used `withPage` (Chromium + stealth), **When** the refactor is complete, **Then** no `withPage` call remains in either function; **And** `withPage` is removed from the import if no longer referenced anywhere in `linkedin.js`.

## Tasks / Subtasks

- [ ] Switch `fetchLinkedInListing` to Firefox (AC: 1, 4)
  - [ ] In `linkedin.js` line 32: change `withPage(storageStatePath, async (page) => {` to `withFirefoxPage(storageStatePath, async (page) => {`

- [ ] Switch `fetchLinkedInJobDetails` to Firefox (AC: 2, 4)
  - [ ] In `linkedin.js` line 44: change `withPage(storageStatePath, async (page) => {` to `withFirefoxPage(storageStatePath, async (page) => {`

- [ ] Clean up import (AC: 4)
  - [ ] In `linkedin.js` line 1: remove `withPage` from the import — after this change only `withFirefoxPage` and `scrapeWithRetry` are used; `withPage` is dead code

- [ ] Manual verification
  - [ ] Trigger a discovery run with LinkedIn enabled; confirm no `TimeoutError` from LinkedIn listing/detail fetches in the scraper console

## Dev Notes

### The One File to Change

Only `job-hunt-dashboard/scraper/src/scrapers/linkedin.js` changes. Nothing else.

**Current state (lines 30–67):**
```js
export async function fetchLinkedInListing(url, storageStatePath = null) {
  return scrapeWithRetry('linkedin', () =>
    withPage(storageStatePath, async (page) => {     // ← Chromium + stealth
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[data-testid="expandable-text-box"]', { timeout: 20000 });
      return page.evaluate(() =>
        document.querySelector('[data-testid="expandable-text-box"]')?.innerText?.trim() ?? ''
      );
    })
  );
}

export async function fetchLinkedInJobDetails(url, storageStatePath = null) {
  return scrapeWithRetry('linkedin', () =>
    withPage(storageStatePath, async (page) => {     // ← Chromium + stealth
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(
        '.job-details-jobs-unified-top-card__job-title, h1.topcard__title',
        { timeout: 20000 }
      );
      return page.evaluate(() => { ... });
    }), 0);
}
```

**Target state — two-word change per function:**
```js
export async function fetchLinkedInListing(url, storageStatePath = null) {
  return scrapeWithRetry('linkedin', () =>
    withFirefoxPage(storageStatePath, async (page) => {  // ← Firefox
      // body unchanged
    })
  );
}

export async function fetchLinkedInJobDetails(url, storageStatePath = null) {
  return scrapeWithRetry('linkedin', () =>
    withFirefoxPage(storageStatePath, async (page) => {  // ← Firefox
      // body unchanged
    }), 0);
}
```

### Reference Implementation: searchLinkedIn

`searchLinkedIn` (lines 3–28) already uses `withFirefoxPage` — it's the exact pattern to mirror. It was switched in commit `4ba6b61` ("fix(scraper): switch LinkedIn search to Firefox to avoid bot detection"). This story applies the same change to the two fetchers.

### Do NOT Change the Retry Count

`fetchLinkedInListing` uses the default `scrapeWithRetry` retries (3). `fetchLinkedInJobDetails` explicitly passes `0` retries (`scrapeWithRetry('linkedin', fn, 0)`). **Preserve both as-is.** Retry reduction is Story 31.4's scope.

### Do NOT Change Function Signatures

Both functions already accept `storageStatePath = null` as a second parameter, and that value is passed straight to `withFirefoxPage`. AC 3 is satisfied automatically — no signature changes needed.

### Locale Awareness (Known Limitation — Not This Story's Scope)

`getFirefoxPage` in `pool.js` (lines 50–61) hardcodes `locale: 'nl-NL'` and `timezoneId: 'Europe/Amsterdam'`. After switching to `withFirefoxPage`, these fetchers will send Dutch locale to LinkedIn. However:
- `searchLinkedIn` already sends Dutch locale today (it uses `withFirefoxPage` since `4ba6b61`) — this is a pre-existing condition, not a new regression introduced by this story
- Story 31.2 will fix the locale for all Firefox callers at once by making locale/timezone parameters with English defaults

Do not attempt to fix locale in this story. Story 31.2 handles it.

### Stealth Plugin: Why It Disappears

The stealth plugin (`puppeteer-extra-plugin-stealth`) is applied to the Chromium browser via `chromium.use(StealthPlugin())` in `pool.js` line 5. It only affects Chromium pages. Firefox never uses the stealth plugin. By switching to `withFirefoxPage`, stealth is gone by construction — no explicit removal needed.

### withFirefoxPage Signature

```js
// base.js line 34
export async function withFirefoxPage(storageStatePath, fn, contextOverrides = {}) {
  const { page, context } = await getFirefoxPage(storageStatePath, contextOverrides);
  try {
    return await fn(page);
  } finally {
    await releasePage(context);
  }
}
```

No third argument needed for this story (no contextOverrides to pass).

### Project Structure Notes

- The scraper is a separate Node.js service under `job-hunt-dashboard/scraper/` — plain JavaScript (`.js`), not TypeScript
- No TypeScript strict-mode enforcement applies; but removing unused imports is still correct cleanup
- Scraper source files live in `scraper/src/scrapers/` and `scraper/src/browser/`
- No test files exist in the scraper — manual verification is expected

### How the Scraper Is Called

The main app calls the scraper over HTTP. `discovery-service.ts` calls `POST /scraper/scrape/search` (for search). The analysis service calls `POST /scraper/scrape/listing` and `POST /scraper/scrape/job-details` (for fetching job content after discovery). The route handler in `scraper/src/routes/scrape.js` dispatches to these functions and already threads `storageStatePath` through.

### References

- `job-hunt-dashboard/scraper/src/scrapers/linkedin.js` — the only file to modify (lines 1, 32, 44)
- `job-hunt-dashboard/scraper/src/browser/pool.js` — `getFirefoxPage` definition (lines 50–61); `withPage`/`withFirefoxPage` defined in `base.js` lines 34–56
- `job-hunt-dashboard/scraper/src/scrapers/base.js` — `withFirefoxPage` and `scrapeWithRetry` signatures
- `job-hunt-dashboard/scraper/src/routes/scrape.js` — how scrape endpoints thread `storageStatePath` to fetchers
- Commit `4ba6b61` — reference for the `searchLinkedIn` Firefox switch pattern
- Epic 31: `_bmad-output/planning-artifacts/epics/epic-31-scraper-reliability-bot-detection-hardening.md`

## Dev Agent Record

### Agent Model Used

_to be filled in_

### Debug Log References

_none_

### Completion Notes List

_to be filled in_

### File List

_to be filled in_
