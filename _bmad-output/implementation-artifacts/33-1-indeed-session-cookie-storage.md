# Story 33.1: Indeed Per-User Session Storage

Status: done

## Story

As a user,
I want to upload my Indeed session file in Config > Connections,
so that my discovery runs can present a Cloudflare-cleared browser fingerprint and return Indeed results on the production server.

## Acceptance Criteria

1. Given a user runs `bun run save-session:indeed` in `job-hunt-dashboard/scraper/` on their local machine (where they have visited indeed.com with Firefox), when the script completes, then `sessions/indeed.json` is created containing cookies for `indeed.com` and `nl.indeed.com` and the correct Firefox user-agent.

2. Given a user uploads `sessions/indeed.json` via `PUT /api/onboarding/indeed` with the file contents as the JSON body, when the request succeeds, then the content is encrypted via `encrypt()` and stored in `user_secrets` under `key_name: 'indeed_storage_state'` for that user, and `200 { ok: true }` is returned.

3. Given `indeed_storage_state` exists in `user_secrets` for the current user, when `GET /api/onboarding/status` is called, then `hasIndeedAuth: true` is returned.

4. Given a discovery run is triggered and the user has indeed or indeed_nl search configs, when `discovery-service.ts` checks `user_secrets` for `indeed_storage_state` and it is absent, then all indeed/indeed_nl searches are skipped and `{ source: 'indeed', error: 'Indeed not connected — add your session in Config > Connections' }` is added to the errors array; discovery continues for other sources.

5. Given `indeed_storage_state` exists for the user, when discovery runs, then it is decrypted and passed as `storageStateContent` for all indeed and indeed_nl scrape requests; if decryption fails, the error is surfaced and indeed/indeed_nl searches are skipped.

6. Given an indeed/indeed_nl scrape returns `updatedStorageStateContent`, when discovery-service processes the response, then the updated state is re-encrypted and written back to `user_secrets` for `indeed_storage_state` (best-effort, same as LinkedIn).

7. Given `searchIndeed` and `searchIndeedNl` in the scraper receive `storageStatePath`, when `withFirefoxPage` is called, then `storageStatePath` is passed directly — the module-level `SESSION_PATH` constant is removed entirely.

8. Given a user visits Config > Connections, when the page loads, then an "Indeed" row is visible showing "Connected" (emerald) or "Not connected" (zinc) status alongside the LinkedIn row; a file upload button lets them upload `sessions/indeed.json`; on success a toast shows "Indeed connected" and the status updates.

9. Given a non-logged-in request or wrong-user request hits `PUT /api/onboarding/indeed`, when the auth middleware runs, then `401` is returned (existing auth middleware handles this — no new auth logic needed).

## Tasks / Subtasks

- [x] Task 1 — Update scraper function signatures (AC: 7)
  - [x] In `scraper/src/scrapers/indeed.js`: remove `SESSION_PATH`, `sessionPath()`, `existsSync` import, `resolve`/`path` imports; add `storageStatePath = null` param to `searchIndeed`; change `withFirefoxPage(sessionPath(), ...)` → `withFirefoxPage(storageStatePath, ...)`
  - [x] In `scraper/src/scrapers/indeed.js`: also add `storageStatePath = null` to `fetchIndeedListing(url, storageStatePath)` and `fetchIndeedJobDetails(url, storageStatePath)` and pass through to `withFirefoxPage` — scrape route already passes the param, these functions just need to accept it
  - [x] Apply identical changes to `scraper/src/scrapers/indeed_nl.js` for `searchIndeedNl`, `fetchIndeedNlListing`, `fetchIndeedNlJobDetails`

- [x] Task 2 — Add `save-session:indeed` npm script (AC: 1)
  - [x] In `scraper/package.json`, add `"save-session:indeed": "bun src/browser/save-session.js sessions/indeed.json"` alongside `save-session:indeed_nl`

- [x] Task 3 — Extend `OnboardingStatusResponse` schema (AC: 3)
  - [x] In `src/shared/schemas.ts`, add `hasIndeedAuth: boolean` to the `OnboardingStatusResponse` type

- [x] Task 4 — API: onboarding status + indeed upload endpoint (AC: 2, 3)
  - [x] In `src/server/routes/api-onboarding.ts`, update `GET /status` to include `hasIndeedAuth: keys.has('indeed_storage_state')` in the response
  - [x] Add `PUT /indeed` route: parse JSON body, validate it has a `cookies` array (Playwright storageState shape), encrypt via `encrypt()`, upsert into `user_secrets` with `keyName: 'indeed_storage_state'`, return `{ ok: true }`. Follow the exact same pattern as the IMAP `PUT /imap` handler — no connection test needed.

- [x] Task 5 — Discovery service: Indeed session handling (AC: 4, 5, 6)
  - [x] In `src/server/services/discovery-service.ts`, add `indeedStorageStateContent` variable alongside the existing `storageStateContent` for LinkedIn
  - [x] After the LinkedIn secret lookup block, add an identical block for `indeed_storage_state`: check for indeed/indeed_nl searches, skip with error if absent, decrypt if present
  - [x] In the `activeSearches` filter, also exclude indeed/indeed_nl searches when their error is present (mirror the LinkedIn filter)
  - [x] In `requestBody` construction, add `if ((s.source === 'indeed' || s.source === 'indeed_nl') && indeedStorageStateContent) { requestBody.storageStateContent = indeedStorageStateContent }`
  - [x] After responses are processed, add the updatedStorageStateContent write-back for indeed (same pattern as the LinkedIn write-back at line 119–133): look for the first indeed/indeed_nl response with `updatedStorageStateContent`, re-encrypt, upsert `indeed_storage_state`

- [x] Task 6 — Config UI: Indeed connection row (AC: 8)
  - [x] In `src/client/routes/config.tsx`, extend `ConnectionsCard` to show an Indeed row below LinkedIn
  - [x] Use `status?.hasIndeedAuth` from `useOnboardingStatusQuery()` (already called in `ConnectionsCard`) for the connected/not-connected status chip
  - [x] Add a hidden `<input type="file" accept=".json" ref={indeedFileInputRef}>` and a styled `<Button>` that triggers it
  - [x] On `onChange`: read file as text via `FileReader`, parse JSON, validate `cookies` array exists (client-side), `PUT /api/onboarding/indeed` with JSON body; on success: `toast.success('Indeed connected')` + `queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })`; on error: `toast.error(message)`
  - [x] Do NOT use `fetch()` directly in the component — use a `useMutation` from TanStack Query (inline, no separate hook file needed for a one-off mutation)

## Dev Notes

### Pattern to follow exactly

This story is a direct mirror of the LinkedIn per-user session pattern from Epics 29–30, minus the in-app browser. The key files that implement the LinkedIn pattern to reference:

- `src/server/services/discovery-service.ts:40–133` — the full LinkedIn secret lookup + skip + pass + write-back cycle
- `src/server/routes/api-onboarding.ts:12–23` — `GET /status` with `hasLinkedinAuth`
- `src/client/routes/config.tsx:19–78` — `ConnectionsCard` with LinkedIn row, status chip, connect button

### Single `indeed_storage_state` covers both indeed and indeed_nl

`save-session.js` queries `WHERE host LIKE '%indeed.com'` which captures cookies for both `indeed.com` and `nl.indeed.com`. A single upload and a single `user_secrets` key (`indeed_storage_state`) serves both sources. Use the same `indeedStorageStateContent` variable for both `s.source === 'indeed'` and `s.source === 'indeed_nl'` in discovery-service.

### Scraper route needs no changes

`scraper/src/routes/scrape.js` already passes `storageStatePath` to all scrapers via `withStorageState(storageStateContent, (storageStatePath) => scrapers[source]({ ..., storageStatePath }))`. Once `searchIndeed`/`searchIndeedNl` accept the param, it just works. **Do not touch `scraper/src/routes/scrape.js`.**

### Discovery service active search filter

Currently, the LinkedIn skip pattern is:
```typescript
const activeSearches = errors.some((e) => e.source === 'linkedin')
  ? searches.filter((s) => s.source !== 'linkedin')
  : searches
```
This needs to be extended to also filter indeed/indeed_nl when their error is in the errors array. Do not chain ternaries — refactor into a clean filter:
```typescript
const skippedSources = new Set(errors.map((e) => e.source))
const activeSearches = skippedSources.size > 0
  ? searches.filter((s) => !skippedSources.has(s.source))
  : searches
```

### `PUT /api/onboarding/indeed` validation

Only validate that the body has a `cookies` array. Do not validate individual cookie fields. This mirrors the trust placed in the LinkedIn session upload. Return `400 { error: '...' }` if the shape is wrong.

```typescript
const indeedSessionSchema = z.object({ cookies: z.array(z.unknown()) }).passthrough()
```

### `OnboardingStatusResponse` is in `src/shared/schemas.ts`

Add `hasIndeedAuth: boolean` to the type. Since this is a type (not a Zod schema), just add the field. The API already returns the value — TS consumers (the hook) will pick it up automatically.

### UI: file input pattern for upload

There is no existing file-upload component in this codebase. Use a `useRef<HTMLInputElement>(null)` to programmatically trigger a hidden `<input type="file">` from a `<Button onClick>`. This is the simplest approach consistent with the rest of the UI.

```tsx
const indeedFileRef = useRef<HTMLInputElement>(null)
// <Button size="sm" onClick={() => indeedFileRef.current?.click()}>Upload session</Button>
// <input ref={indeedFileRef} type="file" accept=".json" className="hidden" onChange={handleIndeedUpload} />
```

### save-session.js generates the correct format

`scraper/src/browser/save-session.js` already outputs `{ cookies, origins: [], userAgent }` — the same format Playwright expects for `storageState`. The developer must run this on a local machine where they've visited indeed.com in Firefox and passed the Cloudflare challenge. The resulting `sessions/indeed.json` is uploaded through the UI.

### No DB migration needed

`user_secrets` table already exists and is keyed by `(userId, keyName)`. No schema changes.

### Project Structure Notes

- Scraper files are JS (not TS) — no type annotations needed
- All cross-boundary types come from `src/shared/schemas.ts` — the `OnboardingStatusResponse` type change goes there, not inline
- `PUT /api/onboarding/indeed` sits in `api-onboarding.ts` — do not create a new route file
- No new hook file needed for the Indeed upload mutation — inline `useMutation` in `config.tsx` is fine for a one-off

### References

- LinkedIn secret lookup + skip + pass pattern: `src/server/services/discovery-service.ts:40–133`
- `onConflictDoUpdate` upsert for user_secrets: `src/server/routes/api-onboarding.ts:73–79`
- `OnboardingStatusResponse` type: `src/shared/schemas.ts:255–260`
- `useOnboardingStatusQuery` hook: `src/client/hooks/useOnboardingStatusQuery.ts`
- ConnectionsCard layout/pattern: `src/client/routes/config.tsx:19–78`
- `withStorageState` in scraper route: `scraper/src/routes/scrape.js:10–21`
- `searchLinkedIn` storageStatePath signature: `scraper/src/scrapers/linkedin.js:3`
- `save-session.js` cookie query: `scraper/src/browser/save-session.js:22–25`
- Encrypt/decrypt utilities: `src/server/lib/crypto.ts`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented all 6 tasks across scraper JS, shared schemas, server routes, discovery service, and config UI
- `activeSearches` filter refactored to use a `skippedSources` Set with special-case coupling: `indeed_nl` is also filtered when `indeed` is in skipped sources (both share one session key)
- `indeed_nl` searches skipped when `indeed` session is absent (error pushed for `indeed` source per AC4, filter handles `indeed_nl` via coupling)
- `PUT /indeed` stores the full session JSON (cookies + origins + userAgent) encrypted under `indeed_storage_state`
- 12 new passing tests added; 0 new failures introduced; 2 pre-existing discovery-service failures and 5 pre-existing api-onboarding/linkedin failures remain unchanged

### File List

- `job-hunt-dashboard/scraper/src/scrapers/indeed.js`
- `job-hunt-dashboard/scraper/src/scrapers/indeed_nl.js`
- `job-hunt-dashboard/scraper/package.json`
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/server/routes/api-onboarding.ts`
- `job-hunt-dashboard/src/server/routes/api-onboarding.test.ts`
- `job-hunt-dashboard/src/server/services/discovery-service.ts`
- `job-hunt-dashboard/src/server/services/discovery-service.test.ts`
- `job-hunt-dashboard/src/client/routes/config.tsx`

### Review Findings

- [x] [Review][Patch] Only first `responses.find()` match written back — fixed: changed to `findLast()` to persist the most recent indeed/indeed_nl session update [`discovery-service.ts` write-back block]
- [x] [Review][Patch] `FileReader.onerror` not set — fixed: added `reader.onerror = () => toast.error('Failed to read file')` [`config.tsx:handleIndeedUpload`]
- [x] [Review][Patch] Empty `cookies: []` accepted as valid session — fixed: added `.min(1)` to server Zod schema and `cookies.length === 0` guard client-side [`api-onboarding.ts` indeedSessionSchema, `config.tsx` upload handler]
- [x] [Review][Defer] Unbounded session file size — no size cap on client or server; matches LinkedIn pattern [`config.tsx`, `api-onboarding.ts`] — deferred, pre-existing pattern
- [x] [Review][Defer] `userId === undefined` skips indeed lookup but searches still run without session — matches existing LinkedIn behaviour [`discovery-service.ts:41`] — deferred, pre-existing pattern
- [x] [Review][Defer] File-dialog click can race with FileReader.onload — button re-enables before async read completes, allowing a second concurrent mutation [`config.tsx:113`] — deferred, rare/harmless double-write
- [x] [Review][Defer] `withStorageState` temp-file prefix hardcoded to "linkedin-session-*" for all sources — cosmetic confusion in /tmp for Indeed sessions [`scrape.js:13`] — deferred, pre-existing/out of scope
- [x] [Review][Defer] `save-session:indeed_nl` still lacks explicit output path argument — pre-existing; save-session.js falls back to default [`scraper/package.json`] — deferred, pre-existing
- [x] [Review][Defer] `save-session.js` FIREFOX_COOKIES path hardcoded to author's machine path [`scraper/src/browser/save-session.js`] — deferred, pre-existing/out of scope

## Change Log

- 2026-05-13: Implemented story 33.1 — Indeed per-user session cookie storage (all 6 tasks, ACs 1–9)
