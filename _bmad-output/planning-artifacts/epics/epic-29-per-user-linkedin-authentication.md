# Epic 29: Per-User LinkedIn Authentication

Users store their own LinkedIn Playwright session state (`linkedin.json`) encrypted in `user_secrets`. The Discovery service decrypts it at runtime, writes it to a temp file per-request, and passes `storageStatePath` to the scraper. Users without LinkedIn auth configured see a clear error instead of a 500. A Config > Connections section lets users upload their session file without server access.

**FRs covered:** net-new (post-Epic-27 production requirement — multi-user LinkedIn auth)
**NFRs addressed:** NFR-A1 (per-user secrets isolation), NFR-A6 (graceful degradation)
**Architecture:** Extends `user_secrets` pattern; removes `AUTH_DIR` global constant; adds `PUT /api/onboarding/linkedin`; discovery-service writes temp file per-request
**UX:** Config > Connections section (file upload pattern, extends Epic 17 Config view)
**Pattern reference:** Follow Epic 25 (IMAP) exactly for API and encryption; follow Epic 25 `ConnectionTestButton` for UI

---

## Story 29.1: LinkedIn Discovery — Graceful Skip (Stopgap)

**Priority: IMMEDIATE — deploy to production as soon as implemented.**

As a user running Discovery,
I want LinkedIn searches to be skipped with a clear error when I have no LinkedIn session stored,
so that Discovery completes for other sources instead of throwing a 500.

**Acceptance Criteria:**

**Given** a Discovery run is triggered and the user has LinkedIn search configs
**When** `discovery-service.ts` checks `user_secrets` for `linkedin_storage_state`
**Then** if the secret is absent: all LinkedIn searches are skipped
**And** a `{ source: 'linkedin', error: 'LinkedIn not connected — add your session in Config > Connections' }` entry is included in the run result
**And** Discovery continues and completes for all other sources (no 500)

**Given** the discovery run result contains a skipped-LinkedIn entry
**When** the UI displays pipeline run feedback
**Then** the LinkedIn skip error is surfaced via the existing progress/error display channel

**Given** `discovery-service.ts` would have called the scraper for a LinkedIn search
**When** `linkedin_storage_state` is absent from `user_secrets`
**Then** the scraper is NOT called for that search; no Playwright interaction occurs

> **Dev note:** Changes are confined to `src/server/services/discovery-service.ts`. Add a `user_secrets` lookup for `linkedin_storage_state` scoped to the authenticated `userId` before any LinkedIn scrape call. If null, push error entry and continue. No scraper or scraper route changes in this story.

---

## Story 29.2: Scraper — Per-Request storageStatePath

As the Discovery service,
I want to pass a `storageStatePath` in each scrape request body,
so that each user's LinkedIn session is used without a shared global constant.

**Acceptance Criteria:**

**Given** `POST /scrape/search`, `POST /scrape/listing`, `POST /scrape/job-details` in the scraper
**When** the request body includes `{ storageStatePath: string }`
**Then** the scraper passes this path to `getPage(storageStatePath)` instead of the module-level `AUTH_PATH` constant

**Given** the `AUTH_PATH` constant at the top of `scraper/src/scrapers/linkedin.js`
**When** this story is complete
**Then** the constant is removed and `process.env.AUTH_DIR` is no longer read in `linkedin.js`

**Given** `scraper-process.ts` currently sets `AUTH_DIR` in the child process env block
**When** this story is complete
**Then** `AUTH_DIR` is removed from `scraper-process.ts`'s env block

**Given** `pool.js` `getPage(storageStatePath)` already accepts a path parameter
**When** the scraper routes pass `storageStatePath` from the request body
**Then** no changes are needed to `pool.js`

> **Dev note:** `scraper/src/scrapers/linkedin.js` — remove top-level `AUTH_PATH` constant; update each route handler to read `storageStatePath` from `req.body` and pass it to `getPage()`. Update `src/server/services/scraper-process.ts` — remove `AUTH_DIR` from the env object passed to the child process.

---

## Story 29.3: API & Discovery — LinkedIn Session Storage & Temp File

As a user,
I want my LinkedIn session state stored encrypted and used automatically during Discovery,
so that LinkedIn scraping works with my own session without manual file management on the server.

**Acceptance Criteria:**

**Given** `PUT /api/onboarding/linkedin` is called with raw `linkedin.json` content in the request body
**When** the server receives the request
**Then** the content is encrypted via `encrypt()` and stored in `user_secrets` with `key_name: 'linkedin_storage_state'`
**And** response is `200 { ok: true }`

**Given** `GET /api/onboarding/status` is called
**When** the response is built
**Then** `hasLinkedinAuth: boolean` is included in the response alongside `hasAnthropicKey` and `hasImap`
**And** `hasLinkedinAuth` is `true` only when a `linkedin_storage_state` row exists in `user_secrets` for the authenticated user

**Given** a Discovery run for a user who has `linkedin_storage_state` in `user_secrets`
**When** `discovery-service.ts` prepares a LinkedIn scrape request
**Then** the service decrypts the stored state via `decrypt()`
**And** writes the decrypted content to `os.tmpdir()/linkedin-{userId}-{timestamp}.json`
**And** passes `{ storageStatePath }` in the scrape request body
**And** deletes the temp file in a `finally` block (whether the scrape succeeds or fails)

**Given** stored LinkedIn credentials fail to decrypt
**When** `discovery-service.ts` attempts to prepare the scrape
**Then** the decrypt error is caught; a `{ source: 'linkedin', error: 'Failed to read LinkedIn session — re-upload in Config > Connections' }` entry is added; scrape is skipped; no 500

> **Dev note:** Follow `api-onboarding.ts` existing pattern exactly for the new `PUT /api/onboarding/linkedin` route. Add `hasLinkedinAuth` to the `onboardingStatusSchema` in `src/shared/schemas.ts`. Wrap all `decrypt()` calls in explicit try/catch. Temp file path: `path.join(os.tmpdir(), \`linkedin-\${userId}-\${Date.now()}.json\`)`.

---

## Story 29.4: UI — Config > Connections: LinkedIn Upload & Status

As a user,
I want a Config > Connections section where I can upload my `linkedin.json` and see whether it's connected,
so that I can authenticate LinkedIn without touching the server directly.

**Acceptance Criteria:**

**Given** I navigate to Config > Connections
**When** the section renders
**Then** I see a "LinkedIn" row with a file upload button and a connection status indicator
**And** if `hasLinkedinAuth: true` (from `GET /api/onboarding/status`): status reads "Connected" (emerald-500)
**And** if `hasLinkedinAuth: false`: status reads "Not connected" (zinc-500)

**Given** I select a `linkedin.json` file via the file upload
**When** I click "Upload"
**Then** the file content is read client-side and sent via `PUT /api/onboarding/linkedin`
**And** on success: status indicator updates to "Connected"; a success toast confirms upload
**And** on failure: an `<Alert variant="destructive">` shows the error message from the API

**Given** the upload is in progress
**When** `PUT /api/onboarding/linkedin` is pending
**Then** the Upload button shows a spinner and is disabled

**Given** a "How to generate linkedin.json" section exists below the upload control
**When** the user expands it
**Then** they see the command: `node scripts/generate-linkedin-auth.js` and a brief explanation that it opens a browser to log in to LinkedIn and saves the session file locally

**Given** `scripts/generate-linkedin-auth.js` exists in the project root
**When** run with `node scripts/generate-linkedin-auth.js`
**Then** it launches a Chromium browser via Playwright, waits for the user to log in to LinkedIn, and writes `linkedin.json` to the current directory

> **Dev note:** Create `src/client/hooks/useLinkedinAuthMutation.ts` following the pattern of existing mutation hooks. UI component goes in the Config view (Epic 17). File input: use `<input type="file" accept=".json">`, read content via `FileReader.readAsText()`. Status indicator follows the same visual pattern as IMAP status in the onboarding UI.

---
