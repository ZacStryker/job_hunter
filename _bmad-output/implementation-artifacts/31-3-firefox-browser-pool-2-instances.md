# Story 31.3: Firefox Browser Pool (2+ Instances)

Status: done

## Story

As a user of the application,
I want Firefox browser operations served from a pool of ≥2 instances,
so that concurrent discovery runs do not serialize on a single browser process.

## Acceptance Criteria

1. **Given** a `FIREFOX_POOL_SIZE` constant (default: 2) is defined in `pool.js`, **When** the pool initializes at startup, **Then** at least 2 Firefox browser instances are launched.

2. **Given** two concurrent scraping operations (e.g., LinkedIn search + Indeed fetch), **When** both execute simultaneously, **Then** each is served by a separate pool instance with no blocking.

3. **Given** all pool instances are busy, **When** a new request arrives, **Then** it queues and waits for an available instance (same behavior as the Chromium pool — random selection from the array; per-source throttle queues in `base.js` handle the actual serialization).

4. **Given** the Chromium pool still runs `POOL_SIZE=2`, **When** 31.3 is implemented, **Then** a comment in `pool.js` documents the Chromium pool size decision: keep at 2 for now since `arc.js` still uses Chromium; revisit after Story 31.5 switches Arc to Firefox.

## Tasks / Subtasks

- [x] Add `FIREFOX_POOL_SIZE` constant and convert `firefoxBrowser` to an array (AC: 1, 2, 4)
  - [x] Add `const FIREFOX_POOL_SIZE = 2;` after `POOL_SIZE`
  - [x] Add comment on `POOL_SIZE` line: `// Chromium — used by arc.js; revisit after Story 31.5 (Arc → Firefox)`
  - [x] Change `let firefoxBrowser = null;` to `let firefoxBrowsers = [];`

- [x] Update `initPool()` to launch a Firefox pool (AC: 1)
  - [x] Replace `firefox.launch({ headless: true })` (single instance) with `Promise.all(Array.from({ length: FIREFOX_POOL_SIZE }, () => firefox.launch({ headless: true })))`
  - [x] Update the destructured assignment: `[browsers, firefoxBrowsers] = await Promise.all([...])`
  - [x] Update log message to `Browser pool initialized (${POOL_SIZE} Chromium + ${FIREFOX_POOL_SIZE} Firefox)`

- [x] Update `getFirefoxPage()` to pick from the pool (AC: 2, 3)
  - [x] Add `const browser = firefoxBrowsers[Math.floor(Math.random() * firefoxBrowsers.length)];` as first line
  - [x] Change `await firefoxBrowser.newContext(...)` to `await browser.newContext(...)`

- [x] Update `destroyPool()` to close all Firefox instances (AC: 1)
  - [x] Change `firefoxBrowser?.close()` to `...firefoxBrowsers.map(b => b.close())`

## Dev Notes

### The One File to Change

Only `job-hunt-dashboard/scraper/src/browser/pool.js`. Nothing else changes.

### Current State (full file)

```js
import { chromium } from 'playwright-extra';
import { firefox } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const POOL_SIZE = 2;
let browsers = [];
let firefoxBrowser = null;           // ← single instance, becomes array

const USER_AGENTS = [...];           // unchanged

export async function initPool() {
  [browsers, firefoxBrowser] = await Promise.all([   // ← destructuring changes
    Promise.all(
      Array.from({ length: POOL_SIZE }, () =>
        chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      )
    ),
    firefox.launch({ headless: true }),              // ← single launch, becomes pool
  ]);
  console.log(`Browser pool initialized (${POOL_SIZE} Chromium + 1 Firefox)`);  // ← update message
}

export async function getFirefoxPage(storageStatePath = null, contextOverrides = {}) {
  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ...contextOverrides,
  };
  if (storageStatePath) contextOptions.storageState = storageStatePath;
  const context = await firefoxBrowser.newContext(contextOptions);  // ← uses single var
  const page = await context.newPage();
  return { page, context };
}

export async function destroyPool() {
  await Promise.all([...browsers.map(b => b.close()), firefoxBrowser?.close()]);  // ← optional chain
}
```

### Target State (full file — write this exactly)

```js
import { chromium } from 'playwright-extra';
import { firefox } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const POOL_SIZE = 2; // Chromium — used by arc.js; revisit after Story 31.5 (Arc → Firefox)
const FIREFOX_POOL_SIZE = 2;
let browsers = [];
let firefoxBrowsers = [];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

export async function initPool() {
  [browsers, firefoxBrowsers] = await Promise.all([
    Promise.all(
      Array.from({ length: POOL_SIZE }, () =>
        chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      )
    ),
    Promise.all(
      Array.from({ length: FIREFOX_POOL_SIZE }, () =>
        firefox.launch({ headless: true })
      )
    ),
  ]);
  console.log(`Browser pool initialized (${POOL_SIZE} Chromium + ${FIREFOX_POOL_SIZE} Firefox)`);
}

export async function getPage(storageStatePath = null, contextOverrides = {}) {
  const browser = browsers[Math.floor(Math.random() * browsers.length)];
  const contextOptions = {
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ...contextOverrides,
  };
  if (storageStatePath) {
    contextOptions.storageState = storageStatePath;
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return { page, context };
}

export async function releasePage(context) {
  await context.close();
}

export async function getFirefoxPage(storageStatePath = null, contextOverrides = {}) {
  const browser = firefoxBrowsers[Math.floor(Math.random() * firefoxBrowsers.length)];
  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ...contextOverrides,
  };
  if (storageStatePath) contextOptions.storageState = storageStatePath;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return { page, context };
}

export async function destroyPool() {
  await Promise.all([...browsers.map(b => b.close()), ...firefoxBrowsers.map(b => b.close())]);
}
```

### Why Random Selection Satisfies AC 3

The Chromium pool uses the same random-pick approach — it does not implement a true acquire/release queue at the browser level. Concurrency control happens via `PQueue` throttle queues in `base.js` (per-source: linkedin 7s interval, indeed 4s interval, arc 3s). The "pool" here prevents all requests from funneling through one browser process; the queues prevent hammering a single source. Random selection distributes load across instances without requiring mutex logic.

### What Does NOT Change

- `base.js` — `withFirefoxPage`, `withPage`, `scrapeWithRetry`, `queues` — no changes needed
- `linkedin.js`, `indeed.js`, `indeed_nl.js`, `arc.js` — no changes needed; they call `withFirefoxPage` which calls `getFirefoxPage`
- `getPage()` function — no changes (Chromium pool selection pattern is the reference, not the target)
- `releasePage()` — no changes; context.close() works the same for Firefox contexts

### Project Structure Reminder

- Scraper is a separate Node.js service: `job-hunt-dashboard/scraper/`
- Plain JavaScript (`.js`), not TypeScript — no strict-mode rules
- No test files exist in the scraper (by design); manual verification expected
- The scraper process is started as a child process of the main app

### References

- `job-hunt-dashboard/scraper/src/browser/pool.js` — the only file to modify
- `job-hunt-dashboard/scraper/src/scrapers/base.js` — `withFirefoxPage` caller, `queues` definition (concurrency context)
- Epic 31: `_bmad-output/planning-artifacts/epics/epic-31-scraper-reliability-bot-detection-hardening.md` (Story 31.3 section, dev note at bottom)
- Story 31.2 file: `_bmad-output/implementation-artifacts/31-2-parameterize-firefox-pool-locale-and-timezone.md` (prev story — pool.js pattern context)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- Converted `firefoxBrowser` (single null) to `firefoxBrowsers` (array) with `FIREFOX_POOL_SIZE = 2`
- `initPool()` now launches both pools concurrently via nested `Promise.all`; destructuring updated to `[browsers, firefoxBrowsers]`
- `getFirefoxPage()` picks a random instance from `firefoxBrowsers` array, matching the Chromium pool pattern in `getPage()`
- `destroyPool()` spread-maps over `firefoxBrowsers` to close all instances cleanly
- No other files required changes; callers use `withFirefoxPage` in `base.js` which delegates to `getFirefoxPage` — interface unchanged

### Review Findings

- [x] [Review][Defer] `getFirefoxPage` crashes if called before `initPool` [pool.js] — deferred, pre-existing; old code threw identically on `null.newContext()`
- [x] [Review][Defer] Partial Firefox pool init leaves Chromium browser processes leaked [pool.js:initPool] — deferred, pre-existing; theoretical; no try/catch around `initPool` in either design
- [x] [Review][Defer] `storageStatePath` concurrent write race across 2 Firefox instances [pool.js:getFirefoxPage] — deferred, theoretical; LinkedIn PQueue (concurrency:1, 7s interval) serializes all callers
- [x] [Review][Defer] Unbounded context accumulation per browser instance [pool.js] — deferred, pre-existing; mirrors Chromium pool behavior
- [x] [Review][Defer] `destroyPool` lacks robustness on crashed or double-called [pool.js:destroyPool] — deferred, pre-existing pattern in Chromium pool; empty-array spread is a safe no-op
- [x] [Review][Defer] `initPool` double-initialization leaks browser processes [pool.js:initPool] — deferred, pre-existing
- [x] [Review][Defer] `USER_AGENTS` array not applied to Firefox contexts [pool.js:getFirefoxPage] — deferred, pre-existing; untouched by this story
- [x] [Review][Defer] Firefox launched without `--no-sandbox` / sandbox hardening flags [pool.js:initPool] — deferred, pre-existing; untouched by this story
- [x] [Review][Defer] `FIREFOX_POOL_SIZE` not env-configurable [pool.js] — deferred, out of scope for this story
- [x] [Review][Defer] `storageState` persistence not atomic in `withFirefoxPage` [base.js:withFirefoxPage] — deferred, pre-existing in base.js; untouched by this story

### Change Log

- 2026-05-12: Implemented Firefox browser pool (2 instances) — converted single `firefoxBrowser` to `firefoxBrowsers[]` array with random selection

### File List

- job-hunt-dashboard/scraper/src/browser/pool.js
