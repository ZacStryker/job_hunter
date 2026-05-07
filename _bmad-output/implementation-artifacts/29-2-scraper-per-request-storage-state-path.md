# Story 29.2: Scraper — Per-Request storageStatePath

Status: review

## Story

As the Discovery service,
I want to pass a `storageStatePath` in each scrape request body,
so that each user's LinkedIn session is used without a shared global constant.

## Acceptance Criteria

1. **Given** `POST /scrape/search`, `POST /scrape/listing`, `POST /scrape/job-details` in the scraper, **When** the request body includes `{ storageStatePath: string }`, **Then** the scraper passes this path to `getPage(storageStatePath)` instead of the module-level `AUTH_PATH` constant.

2. **Given** the `AUTH_PATH` constant at the top of `scraper/src/scrapers/linkedin.js`, **When** this story is complete, **Then** the constant is removed and `process.env.AUTH_DIR` is no longer read in `linkedin.js`.

3. **Given** `scraper-process.ts` currently sets `AUTH_DIR` in the child process env block, **When** this story is complete, **Then** `AUTH_DIR` is removed from `scraper-process.ts`'s env block.

4. **Given** `pool.js` `getPage(storageStatePath)` already accepts a path parameter, **When** the scraper routes pass `storageStatePath` from the request body, **Then** no changes are needed to `pool.js`.

## Tasks / Subtasks

- [x] Update `scraper/src/scrapers/linkedin.js` to accept `storageStatePath` per call (AC: 1, 2)
  - [x] Remove `import path from 'path'` (no longer needed)
  - [x] Remove `const AUTH_PATH = path.resolve(process.env.AUTH_DIR, 'linkedin.json')` top-level constant
  - [x] Add `storageStatePath = null` to `searchLinkedIn` destructured param; replace `withPage(AUTH_PATH, ...)` with `withPage(storageStatePath, ...)`
  - [x] Add `storageStatePath = null` param to `fetchLinkedInListing(url, storageStatePath)`; replace `withPage(AUTH_PATH, ...)` with `withPage(storageStatePath, ...)`
  - [x] Add `storageStatePath = null` param to `fetchLinkedInJobDetails(url, storageStatePath)`; replace `withPage(AUTH_PATH, ...)` with `withPage(storageStatePath, ...)`
- [x] Update `scraper/src/routes/scrape.js` to thread `storageStatePath` through route handlers (AC: 1)
  - [x] Add `storageStatePath: z.string().optional()` to `SearchSchema`
  - [x] Add `storageStatePath: z.string().optional()` to `ListingSchema`
  - [x] Add `storageStatePath: z.string().optional()` to `JobDetailsSchema`
  - [x] Extract `storageStatePath` from `body.data` in `/scrape/search` handler; pass to `scrapers[source]({ ..., storageStatePath })`
  - [x] Extract `storageStatePath` from `body.data` in `/scrape/listing` handler; pass as second arg: `fetchers[source](url, storageStatePath)`
  - [x] Extract `storageStatePath` from `body.data` in `/scrape/job-details` handler; pass as second arg: `fetchers[source](url, storageStatePath)`
- [x] Update `src/server/services/scraper-process.ts` to remove `AUTH_DIR` from child process env (AC: 3)
  - [x] Remove `const authDir = process.env.AUTH_DIR ?? join(SCRAPER_DIR, 'auth')`
  - [x] Remove `AUTH_DIR: authDir` from the `env` object in `spawn()`

## Dev Notes

### What This Story Does (and Does NOT Do)

**This story is scraper-side plumbing only.** It makes the scraper *capable* of receiving `storageStatePath` per request. The Discovery service (`discovery-service.ts`) does **not** change in this story — it still sends requests without `storageStatePath`. Story 29.3 wires the actual per-user decrypted path into the request body.

**No test file changes are needed.** The scraper is vanilla JavaScript with no test infrastructure. `scraper-process.ts` is a child-process launcher with no tests. The integration will be verified when 29.3 is implemented.

### File-by-File Changes

#### `job-hunt-dashboard/scraper/src/scrapers/linkedin.js`

Current top-of-file (remove entirely):
```js
import path from 'path';
// ...
const AUTH_PATH = path.resolve(process.env.AUTH_DIR, 'linkedin.json');
```

Updated function signatures and `withPage` calls:

```js
export async function searchLinkedIn({ query, location = 'Remote', maxResults = 25, storageStatePath = null }) {
  return scrapeWithRetry('linkedin', () => {
    // ...
    return withPage(storageStatePath, async (page) => { ... });
  });
}

export async function fetchLinkedInListing(url, storageStatePath = null) {
  return scrapeWithRetry('linkedin', () =>
    withPage(storageStatePath, async (page) => { ... })
  );
}

export async function fetchLinkedInJobDetails(url, storageStatePath = null) {
  return scrapeWithRetry('linkedin', () =>
    withPage(storageStatePath, async (page) => { ... }), 0);
}
```

`pool.js`'s `getPage(storageStatePath = null)` already handles `null` correctly — it only sets `storageState` when `storageStatePath` is truthy:
```js
if (storageStatePath) {
  contextOptions.storageState = storageStatePath;
}
```
**Do not touch `pool.js`.**

#### `job-hunt-dashboard/scraper/src/routes/scrape.js`

Add `storageStatePath` to all three Zod schemas (optional — non-LinkedIn calls won't include it):

```js
const SearchSchema = z.object({
  source: z.enum(['indeed', 'indeed_nl', 'linkedin', 'arc']),
  query: z.string().min(1),
  location: z.string().optional(),
  maxResults: z.number().int().min(1).max(50).optional().default(25),
  storageStatePath: z.string().optional(),        // ← ADD
});

const ListingSchema = z.object({
  source: z.enum(['indeed', 'indeed_nl', 'linkedin']),
  url: z.string().url(),
  storageStatePath: z.string().optional(),        // ← ADD
});

const JobDetailsSchema = z.object({
  source: z.enum(['linkedin', 'indeed', 'indeed_nl']),
  url: z.string().url(),
  storageStatePath: z.string().optional(),        // ← ADD
});
```

Route handler updates:

```js
// /scrape/search
const { source, query, location, maxResults, storageStatePath } = body.data;
const results = await scrapers[source]({ query, location, maxResults, storageStatePath });

// /scrape/listing
const { source, url, storageStatePath } = body.data;
const description = await fetchers[source](url, storageStatePath);

// /scrape/job-details
const { source, url, storageStatePath } = body.data;
const result = await fetchers[source](url, storageStatePath);
```

Non-LinkedIn scraper functions (`searchIndeed`, `fetchIndeedListing`, etc.) receive the extra arg but ignore it — JavaScript destructuring silently drops unknown keys; extra positional args are simply not used. **No changes to indeed.js, indeed_nl.js, or arc.js.**

#### `job-hunt-dashboard/src/server/services/scraper-process.ts`

Current `startChild` (lines 30–36):
```ts
function startChild(port: number): void {
  intentionalStop = false
  const authDir = process.env.AUTH_DIR ?? join(SCRAPER_DIR, 'auth')   // ← REMOVE

  child = spawn('node', [join(SCRAPER_DIR, 'src', 'server.js')], {
    env: { ...process.env, PORT: String(port), AUTH_DIR: authDir, LOG_LEVEL: 'warn' },  // ← REMOVE AUTH_DIR: authDir
```

After change:
```ts
function startChild(port: number): void {
  intentionalStop = false
  child = spawn('node', [join(SCRAPER_DIR, 'src', 'server.js')], {
    env: { ...process.env, PORT: String(port), LOG_LEVEL: 'warn' },
```

Note: `...process.env` still spreads the parent environment. If `AUTH_DIR` is in the system environment, it flows through — that's fine; `linkedin.js` no longer reads it after this story.

### Architecture Compliance

- **TypeScript strict mode** applies only to `.ts` files. The scraper is plain JavaScript — no type annotations needed.
- **No new imports** in `scraper-process.ts`; the `join` import from `node:path` remains (still used for `SCRAPER_DIR` path construction).
- **Scraper-process is not tested** — it spawns a real child process. No test file exists or is needed here.
- **`discovery-service.ts` does not change** — it continues sending `{ source, query, location }` without `storageStatePath`. The scraper treats `storageStatePath: undefined` as `null` (no session state → anonymous browsing). This is correct behavior for the stopgap period between 29.1 and 29.3.

### Previous Story Context (29.1)

Story 29.1 changed only `discovery-service.ts` and `discovery-service.test.ts`. It added the `errors` field to `runDiscovery`'s return type and added a check that skips LinkedIn searches when `linkedin_storage_state` is absent from `user_secrets`. No scraper files changed in 29.1.

Key insight: after 29.1, if a user has `linkedin_storage_state` in `user_secrets`, `discovery-service.ts` still sends the search request to the scraper **without** `storageStatePath`. Until 29.3, the scraper will run LinkedIn using anonymous Playwright context (no session). This is acceptable — the scraper won't 500, it just won't be authenticated. Story 29.3 fixes this.

### Project Structure Notes

- Scraper lives at `job-hunt-dashboard/scraper/` — entirely separate Node.js project, plain JS, no TypeScript, no bun:test
- Main server lives at `job-hunt-dashboard/src/` — TypeScript, bun:test
- `scraper-process.ts` is the only main-server file that touches scraper configuration
- No Zod schema changes in `src/shared/schemas.ts` — the scraper's Zod schemas are internal to the scraper (`scraper/src/routes/scrape.js`) and are separate from the shared TypeScript schemas

### References

- `scraper/src/scrapers/linkedin.js` — all three functions currently use module-level `AUTH_PATH`
- `scraper/src/routes/scrape.js` — Fastify route handlers; Zod schemas for each endpoint
- `scraper/src/browser/pool.js:29` — `getPage(storageStatePath = null)` already accepts path param; no change needed
- `scraper/src/scrapers/base.js:43` — `withPage(storageStatePath, fn)` already receives and passes through to `getPage`; no change needed
- `src/server/services/scraper-process.ts:31` — `const authDir` and `AUTH_DIR: authDir` to remove
- Epic 29 full context: `_bmad-output/planning-artifacts/epics/epic-29-per-user-linkedin-authentication.md`
- Previous story: `_bmad-output/implementation-artifacts/29-1-linkedin-discovery-graceful-skip-stopgap.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Removed `import path from 'path'` and `AUTH_PATH` module-level constant from `linkedin.js`; all three exported functions now accept `storageStatePath = null` and pass it directly to `withPage()`
- Added `storageStatePath: z.string().optional()` to all three Zod schemas in `scrape.js`; each route handler now extracts and forwards `storageStatePath` — non-LinkedIn scrapers silently ignore the extra arg
- Removed `const authDir` and `AUTH_DIR: authDir` from `scraper-process.ts` `startChild()` env block; `...process.env` spread still passes any system-level `AUTH_DIR` through, but `linkedin.js` no longer reads it
- 328 tests pass, 2 pre-existing failures (cover-letter user_id constraint, messages sync crypto) unrelated to this story

### File List

- job-hunt-dashboard/scraper/src/scrapers/linkedin.js
- job-hunt-dashboard/scraper/src/routes/scrape.js
- job-hunt-dashboard/src/server/services/scraper-process.ts

## Change Log

- 2026-05-07: Implemented per-request `storageStatePath` threading through scraper routes and LinkedIn scraper functions; removed module-level `AUTH_PATH` and `AUTH_DIR` env injection from child process launcher
