# Deferred Work

## Deferred from: update-resume-prompt-include-all-jobs (2026-06-09)

- **Sparse-entry bullet floor conflict**: the `CONTENT LIMITS` rule mandates 3-5 bullets per experience entry, but the `no invented content` HARD RULE forbids padding. For old/short profile entries this creates an impossible constraint. Resolution: add a clause allowing fewer bullets when the profile entry has insufficient documented detail. [`prompt-defaults.ts` resume config]
- **No override mechanism for deliberate user exclusions**: there is no way for a user to mark a profile experience entry as "exclude from resume." The new mandatory-inclusion rule would force it in regardless. Future story: add an `excludeFromResume` flag to profile experience entries. [`prompt-defaults.ts`, profile schema]

## Deferred from: fix-resume-production-path-and-error-surfacing (2026-06-09)

- `api-cover-letter.test.ts` `CREATE_WEBHOOK_RUNS_TABLE` is missing the `user_id` column — `recordRun` fails silently in that test file, masking any cover-letter failure recording. Same fix applied to `api-resume.test.ts` in this story. [`api-cover-letter.test.ts`]
- `resume-service.ts` uses `import.meta.dir` (Bun-specific non-standard alias) rather than `import.meta.dirname` — would break path resolution if the server ever runs from a bundled dist output. Pre-existing; no current impact. [`resume-service.ts:97`]

## Deferred from: code review of 42-4-end-to-end-tests-and-contract-drift-guard (2026-06-09)

- `buildInjectedHtml` regex replacement silently no-ops if the `<script id="resume-data" type="application/json">` tag format changes — downstream `evaluatePageCount` would run on an un-injected template, failing with an opaque timeout rather than a clear diagnostic. [`resume-e2e.test.ts`]
- E2E tests use `waitUntil: 'domcontentloaded'` while production `generate-pdf.ts` uses `networkidle` — documented intentional tradeoff to avoid font-preconnect TCP hangs in environments without reliable external network access; real-world parity concern for environments where fonts load cleanly. [`resume-e2e.test.ts`, `generate-pdf.ts`]

## Deferred from: code review of 42-3-migrate-resume-service-to-json-pipeline (2026-06-09)

- `__paginationComplete` waitForFunction produces opaque playwright `TimeoutError` if template JS throws inside the browser page — no distinguishable error from a genuine hang; would require page error event listeners or console capture to surface. [`generate-pdf.ts`]
- `resumeDataSchema` allows empty strings for all required scalar fields (`first_name`, `last_name`, `email`, `title_01`, `title_02`, etc.) — an LLM returning `""` passes validation and the template renders blank fields in the PDF header. Pre-existing from 42.1 schema design; Story 42.4 contract tests are the intended enforcement point. [`schemas.ts`]
- AC8 test gap: no assertion that the captured HTML for the valid-JSON test originated from `resume_template(1).html` specifically — test verifies `<script id="resume-data">` presence but not any Sage-template-unique structure (e.g., `window.__paginationComplete`). [`resume-service.test.ts`]

## Deferred from: code review of 42-2-rewrite-llm-prompt-to-emit-canonical-flat-schema (2026-06-09)

- `projects[].stack` middle-dot separator (`·`) format not validated in schema — any downstream code that splits on `·` would silently fail if the LLM uses a different separator (comma, bullet `•`, etc.). Add a `.refine()` or normalize at parse time in Story 42.3+. [`schemas.ts`]
- `experience[].location` is a required field in `resumeDataSchema` but may be legitimately absent from a candidate profile — forces the LLM to either invent a value (violates "no invented content" rule) or return an empty string. Consider making it `z.string().optional()` or providing explicit guidance in the prompt. [`schemas.ts`]
- `max_tokens: 4096` in `resume-service.ts` could truncate a large JSON payload mid-object for candidates with extensive experience — `JSON.parse()` will throw on a truncated string when 42.3 wires in JSON parsing. Raise the limit or add a truncation-detection fallback in 42.3. [`resume-service.ts`]
- No validation that `{{CANDIDATE_PROFILE}}`/`{{JOB_DETAILS}}` placeholders resolve to non-empty strings before the prompt is sent to the LLM — an unreplaced literal placeholder produces a resume with invented content and no error signal. Add a guard in the service layer in 42.3. [`resume-service.ts`]

## Deferred from: code review of 42-1-define-canonical-resume-json-schema (2026-06-09)

- Email/website/linkedin accept any string — no format, URL, or pattern constraint in either schema; format validation is Story 42.4+ scope. [`resume-schema.json`, `schemas.ts`]
- Zod and JSON Schema have no sync enforcement mechanism — two parallel artifacts; Story 42.4 explicitly adds the contract test to catch drift. [`schemas.ts`, `resume-schema.json`]
- `title_02` "no and/&" rule is advisory-only — `$comment` in JSON Schema is non-normative; no `.refine()` in Zod; runtime enforcement deferred to Story 42.4. [`resume-schema.json`, `schemas.ts`]
- Content limit bounds unenforced in schemas — maxItems for skill_groups count, skills per group, bullets per experience, and experience array have no upper bound; Story 42.4 scope. [`resume-schema.json`, `schemas.ts`]
- All scalar string fields accept empty strings — `minLength: 1` not required by Story 42.1 spec; future validation story. [`resume-schema.json`, `schemas.ts`]
- `dates` and `year` are free-form strings with no format/pattern constraint — consistent date formatting not required by spec. [`resume-schema.json`]
- Zod `.strict()` not used — Zod silently strips unknown keys while JSON Schema `additionalProperties: false` rejects them; intentional: ajv handles strict LLM output validation, Zod provides TypeScript types. [`schemas.ts`]
- `$id` value is a bare string ("resume-schema") rather than a URI reference — non-normative for draft-07 usage, no impact on ajv functionality. [`resume-schema.json`]
- `skill_groups[].skills` inner array has no `minItems: 1` — a group with label and zero skills passes validation silently; not required by Story 42.1 spec; Story 42.4 scope. [`resume-schema.json`, `schemas.ts`]
- `title_01` and `title_02` could be identical strings — no cross-field uniqueness check enforceable in standard JSON Schema / Zod without `.superRefine()`. [`schemas.ts`, `resume-schema.json`]

## Deferred from: code review of 41-4-job-drawer-blacklist-toggle-button (2026-06-06)

- No `type="button"` attribute on the blacklist toggle button in the action row — pre-existing omission across all action buttons in `JobDrawer.tsx`; applied and archive buttons also lack explicit `type`. [`JobDrawer.tsx`]
- `configJobSourcesBlacklistRoute` router wiring and `ConfigJobSourcesBlacklistRoute` import completed in story 41.4 but belong to story 41.3 scope — story 41.3 was marked done before this step was completed; code is functionally correct. [`router.ts`]

## Deferred from: code review of 41-3-config-ui-job-sources-blacklist-page (2026-06-06)

- Route loader `configJobSourcesBlacklistRoute` has no `errorComponent` — project-wide pattern; a loader failure (network down, 500) falls to the root error boundary with no per-route handling. [`router.ts`]
- No optimistic update for remove mutation — after clicking Remove, all Remove buttons are disabled until the server round-trip + query invalidation completes; UX enhancement, not spec-required. [`job-sources-blacklist.tsx`]

## Deferred from: code review of 41-2-discovery-service-blacklist-filtering (2026-06-06)

- Schema lacks case-normalized unique index on `company_blacklist.company_name` — if a user inserts "Acme Corp" and "acme corp" as separate entries, both are stored; DB-level uniqueness enforced on raw string only (Story 41.1 design gap). [`src/db/migrations/0030_uneven_beyonder.sql`]
- `bySource` counts vs insert count mismatch when `userId` is undefined — pre-existing: `newJobs` is populated but the insert loop is skipped when `userId` is undefined, so `bySource` shows non-zero counts even when nothing was written. [`discovery-service.ts`]

## Deferred from: code review of 40-5-ux-relevance-column-drawer-layout-and-discover-button-guard (2026-05-29, updated 2026-05-30)

- `NaN` relevanceScore renders as "NaN" in the table cell and corrupts the sort comparator — `v != null` passes for `NaN`; `NaN ?? -Infinity` does not coerce (nullish coalescing only catches null/undefined); root cause is in the embedding service layer, not this UI story. [`PipelineTable.tsx` lines 125, 129-133]
- AC3 ascending sort places `null`-score rows first — `-Infinity` substitution in `sortingFn` puts nulls at the top on ascending sort; spec requires nulls-last on both directions; accepted trade-off per story dev notes (primary use case is descending). [`PipelineTable.tsx` lines 129-133]

## Deferred from: code review of 40-3a-embedding-service-in-process-via-xenova-transformers (2026-05-29)

- `embed()` accepts empty/whitespace-only text without guard — produces a meaningless 384-d vector that would silently corrupt relevance scores; caller (story 40.4) should validate before calling. [`embedding-service.ts:13`]
- `JSON.parse(cached.embedding)` in `getOrComputeResumeEmbedding` is unguarded — a malformed row (truncated write, manual edit) will throw an uncaught exception; could add a try/catch fallback to recompute on parse failure. [`resume-embedding-cache.ts:12`]
- Integration test `embed (real model)` loads the full ONNX model (~25 MB) on every test run with no skip guard — consider a `SKIP_SLOW_TESTS` env var or separating into a dedicated integration test suite. [`embedding-service.test.ts:35`]

## Deferred from: code review of 40-2-data-model-relevance-score-column-and-resume-embedding-cache (2026-05-28)

- `api-admin.test.ts` jobs/messages DDL drops FK constraint on `user_id` (replaced with `DEFAULT 1`) — SQLite does not enforce FKs without `PRAGMA foreign_keys = ON`; this is an intentional test simplification; pre-existing pattern in other test files. [`src/server/routes/api-admin.test.ts:100`]
- SQLite FK constraints not enforced by default; `user_embeddings.user_id` FK referencing `users.id` is informational only — pre-existing project-wide pattern; no `PRAGMA foreign_keys = ON` is set anywhere in the codebase. Orphaned embeddings can exist if a user is deleted.
- No Zod/schema validation applied to the outbound `GET /api/jobs` response body; `jobSchema` defines the contract but is not used at the serialization boundary — pre-existing architectural pattern across all API routes; `relevanceScore` presence depends on Drizzle column inference rather than runtime enforcement.

## Deferred from: code review of 39-2-analysis-use-pre-stored-description-skip-scraper (2026-05-26)

- Whitespace-only `jobDescription` bypasses scraper and is passed to Anthropic as-is — unreachable from normal insert path (39.1 trims whitespace to NULL) but no defense-in-depth `.trim()` in service. [`analysis-service.ts:95`]
- Empty string `''` vs `NULL` semantic ambiguity — `''` stored in DB causes scraper to run (different from `null`); unreachable from normal app flow. [`analysis-service.ts:95`]
- `description || null` write-back coerces explicit empty string to `null` — pre-existing behavior, unreachable from normal flow. [`analysis-service.ts`]
- No observability/logging when scraper is skipped due to pre-stored description — no `onProgress` call on bypass path; pre-existing logging pattern not extended. [`analysis-service.ts`]
- No AC3 regression test (null description → scraper runs) — covered indirectly by existing tests that exercise the scraper path. [`analysis-service.test.ts`]
- No AC5 test (manual job with no URL and no description) — pre-existing behavior, not changed by this diff. [`analysis-service.test.ts`]
- No test for pre-stored description + Anthropic failure path — failure path preserves `job_description` correctly but is untested. [`analysis-service.test.ts`]
- No test for `job_description = ''` in DB — documents `''` vs `null` split behavior; edge case unreachable from normal insert path. [`analysis-service.test.ts`]
- `anthropicBody` not explicitly null-checked before messages assertion — would give cryptic failure rather than "Anthropic was never called" but fails loudly so acceptable. [`analysis-service.test.ts`]

## Deferred from: code review of 38-3-breadcrumbs-and-expanded-left-nav (2026-05-21)

- Fallback breadcrumb label exposes raw path string for unrecognized routes — `PATH_LABELS[prefix] ?? prefix` silently renders the URL segment as text if a future config route is added without updating the map. [`ConfigBreadcrumb.tsx`]
- Trailing slash `/config/` bypasses breadcrumb null guard — `pathname === '/config'` check does not cover `/config/` variant; TanStack Router normalizes in practice but no code-level safety net. [`ConfigBreadcrumb.tsx`]

## Deferred from: code review of 38-2-card-tooltips-in-config-sections (2026-05-21)

- `<button>` nested inside `<Link>` (`<a>`) — technically invalid HTML (interactive in interactive); spec-mandated pattern with `e.preventDefault(); e.stopPropagation()`, acknowledged in dev notes. All 4 config index files.
- Touch device tooltip dead zone — Radix Tooltip does not open on tap; `stopPropagation` swallows the tap so mobile users get no feedback. Known Radix limitation, out of scope for this story.
- Prompts "Edited" badge color inconsistency — `prompts-index.tsx` uses `bg-zinc-700 text-zinc-300`; `overview.tsx` uses `bg-emerald-900 text-emerald-400` for same semantic state. Pre-existing; 38.2 did not change badge logic.
- 13 identical tooltip-button blocks with no abstraction — `<Tooltip><TooltipTrigger><button>…</button></TooltipTrigger><TooltipContent>` repeated verbatim 13 times across 4 files; extractable to a shared `CardTooltip` component in a future cleanup pass.
- `aria-label="What is this?"` is non-contextual across all 13 buttons — screen readers can't distinguish which card each button belongs to; per-card labels (e.g., `aria-label="About Profile"`) would be a better a11y improvement for a future story.

## Deferred from: code review of 35-5-prompts-section-overview-and-per-flow-subpages (2026-05-18)

- Reset error never shown to user — `resetMutation.isError` has no error display in `PromptSection`; carried verbatim from pre-existing `prompts.tsx`. [`PromptSection.tsx`]
- Concurrent mutation collision traps UI — if reset fails silently, `isBusy` returns to false but user has no visible recovery path or error feedback. [`PromptSection.tsx`]

## Deferred from: code review of 35-3-profile-api-keys-and-inbox-mapping-subpages (2026-05-18)

- No array size cap (`.max()`) on `inboxFolderMappingInputSchema` — unbounded bulk insert in PUT endpoint. [`api-config-inbox-mappings.ts`, `shared/schemas.ts`]
- No max-length validation on `folderPath` — arbitrarily large strings accepted. [`shared/schemas.ts`]
- No `DEFAULT` on `created_at` in SQL migration — low risk since server always supplies value, but no schema-level safety net. [`0028_inbox_folder_mappings.sql`]
- GET response rows not runtime-validated against `inboxFolderMappingSchema` client-side — pre-existing pattern across other routes. [`api-config-inbox-mappings.ts`, `useInboxMappingsQuery.ts`]
- `key={i}` on folder mapping table rows — controlled inputs make this benign in practice; cleanup when table grows. [`profile-inbox-mapping.tsx`]

## Deferred from: code review of 34-1-indeed-in-app-browser-auth (2026-05-13)

- Old WS `onclose` fires after rapid reconnect — pre-existing bug in `useLinkedinBrowserSession`, carried forward to `useIndeedBrowserSession`; old socket's `onclose` can overwrite new session's loading status with error. [`useIndeedBrowserSession.ts`]
- `WsData` interface duplicated — service-level `WsData` (userId, sessionId) diverges from index.ts's extended version (adds `service` field); pre-existing from LinkedIn service pattern. [`indeed-browser-service.ts`, `index.ts`]
- `handleSave` loses `captured` confirmation if client WS closed mid-save — DB write succeeds but `ws.send()` throws; pre-existing pattern in LinkedIn service. [`indeed-browser-service.ts`]
- Canvas has no accessible label — `<canvas>` in `IndeedBrowserModal` captures input events but has no aria-label; pre-existing in `LinkedInBrowserModal`. [`IndeedBrowserModal.tsx`]
- Browser session hook and service are near-duplicates of LinkedIn equivalents — no shared abstraction; technical debt. [`useIndeedBrowserSession.ts`, `indeed-browser-service.ts`]

## Deferred from: code review of 33-1-indeed-session-cookie-storage (2026-05-13)

- Unbounded session file size — no size cap on PUT /indeed body or client FileReader; matches LinkedIn pattern. [`api-onboarding.ts`, `config.tsx`]
- `userId === undefined` skips indeed secret lookup but searches run without session — pre-existing pattern mirrored from LinkedIn. [`discovery-service.ts:41`]
- File-dialog click races with FileReader.onload — button re-enables before async read completes; allows a second concurrent mutation. Rare, mostly harmless. [`config.tsx`]
- `withStorageState` temp-file prefix hardcoded "linkedin-session-*" for all sources including Indeed — cosmetic confusion in /tmp. Pre-existing. [`scrape.js`]
- `save-session:indeed_nl` script has no explicit output path — falls back to save-session.js default. Pre-existing. [`scraper/package.json`]
- `save-session.js` FIREFOX_COOKIES path hardcoded to author's snap Firefox path — fails on other machines. Pre-existing. [`save-session.js`]

## Deferred from: code review of 31-5-switch-arc-scraper-to-firefox (2026-05-12)

- Non-async callback in `scrapeWithRetry` returns a promise — pre-existing pattern identical to old `withPage` usage; `scrapeWithRetry` must await the callback return. [`arc.js:4`]
- Retry count reduction (story 31.4) + 2-instance Firefox pool leaves no headroom for pool-contention failures; a single pool-acquisition failure surfaces as a permanent scrape failure. Cross-story design concern from stories 31.3 and 31.4.
- No Firefox-specific launch failure handling in `withFirefoxPage` — Firefox cold-start / crash errors are not typed distinctly from other errors, so `scrapeWithRetry` cannot selectively retry them. Pre-existing.
- `getFirefoxPage` called before `initPool` completes — empty `firefoxBrowsers` array causes `Math.random() * 0 = 0`, indexing `undefined`, crashing with TypeError. Pre-existing (same risk existed for LinkedIn/Indeed on Firefox path). [`pool.js:getFirefoxPage`]
- `waitForSelector('.job-card')` throws on zero results or CAPTCHA page — no distinction between "no jobs found" and "page failed to load". Pre-existing. [`arc.js:8`]
- `getAttribute('href')` constructs double-domain URL if arc.dev ever returns an absolute href instead of a root-relative path. Pre-existing. [`arc.js`]

## Deferred from: code review of 31-2-parameterize-firefox-pool-locale-and-timezone (2026-05-12)

- `fetchIndeedNlJobDetails` passes `retries=0` to `scrapeWithRetry` — suppresses all retry protection; any single transient failure propagates immediately. Pre-existing before this story; the diff preserved but did not introduce it. [`indeed_nl.js:84`]
- `contextOverrides` spread in `getFirefoxPage` cannot un-set a key once a default exists — a caller passing `{ locale: undefined }` would still carry the key; opting out of locale defaults requires object reconstruction. Pre-existing API design gap; no current caller needs this. [`pool.js:55`]

## Deferred from: code review of 32-1-apply-webhook-runs-input-tokens-migration-and-harden-startup-runner (2026-05-08)

- FK enforcement edge case when adding `user_id` repair column — if users table is absent and FK enforcement is toggled on externally, ALTER TABLE REFERENCES could fail. SQLite FK enforcement is off by default; theoretical only. [`migrate.ts:49`]
- Concurrent startup race on `ALTER TABLE` — two processes starting simultaneously could both attempt ALTER TABLE, causing "duplicate column name" error. Single-process architecture makes this very unlikely. [`migrate.ts:44-52`]
- No automated test covering repair path — existing tests create the table with all columns already present, so `repairWebhookRunsSchema()` never fires during tests. Manual verification only; acknowledged in story notes.
- No automated idempotency test for `repairWebhookRunsSchema()` — pre-existing pattern copied from `repairSchema()`, same gap exists there.
- No assertion on `user_id` value after `recordRun()` insert — tests don't verify multi-tenancy correctness of the column value. Pre-existing test gap.
- `process.env` not cleaned in `afterEach` — inline `delete process.env.ANTHROPIC_API_KEY` leaks if assertion throws before cleanup line. Pre-existing test hygiene issue in `api-webhooks.test.ts`.
- No `users` row in test DB — `webhook_runs` FK on `user_id REFERENCES users(id)` is unenforced (SQLite FK off by default), but latent hole if enforcement is toggled. Pre-existing.

## Deferred from: code review of 30-2-ui-in-app-linkedin-browser-modal-and-connectionscard-update (2026-05-08)

- Sync DB query in `getSessionUserId` blocks Bun event loop — `db.select().get()` is synchronous and runs on every WebSocket upgrade request in the `fetch` hot path; stalls event loop under concurrent upgrades. Story 30.1 server-side scope. [`index.ts:getSessionUserId`]
- `getSessionUserId` returns impersonated userId with no admin check — any session whose `data` contains `{ impersonating: N }` is treated as user N with no verification the caller is an admin; could allow a corrupted session to access another user's LinkedIn browser session. Story 30.1 server-side scope; impersonation auth pattern pre-existing. [`index.ts:getSessionUserId`]
- `createImageBitmap` decode errors silently swallowed — `.catch(() => {})` leaves no trace when a frame fails to decode; canvas stays frozen on the last valid frame with no debug signal. Minor debugging concern; not production-impactful. [`LinkedInBrowserModal.tsx`]
- Canvas briefly blank during first frame decode — `status='active'` is set on frame receipt but `createImageBitmap` is async; a mousedown in this sub-frame window sends coordinates to a blank canvas. Sub-frame timing edge case; minor UX only. [`LinkedInBrowserModal.tsx`]

## Deferred from: code review of 30-1-server-linkedin-browser-session-api (2026-05-07)

- `handleClose` does not close the browser session on WS disconnect — browser runs unattended for up to 5 minutes if the client navigates away; only the 5-minute timeout provides cleanup. Intentional per the timeout model; close-on-disconnect was not specified. [`linkedin-browser-service.ts:122–127`]
- `attachWebSocket` old WS ref not closed/notified when a second WS connects to the same session — dropped without a close frame. Reconnect scenario is an edge case not covered by spec. [`linkedin-browser-service.ts:93`]
- `keydown` messages pass arbitrary key strings to `page.keyboard.press` with no allowlist — authenticated user can inject arbitrary key combos into their own session. Self-harm only (auth-gated). [`linkedin-browser-service.ts:114`]
- `getSessionUserId` first-match cookie regex — if a `Cookie` header contains multiple `session=` values (e.g., crafted request), the first match wins and may not be the real session. Requires client header manipulation to exploit; low practical risk. [`src/index.ts:128`]

## Deferred from: code review of 29-4-ui-config-connections-linkedin-upload-and-status (2026-05-07)

- Client-side file size not bounded — `FileReader.readAsText()` reads the full file into memory with no `selectedFile.size` guard; LinkedIn storageState files are tiny in practice but there is no upper bound enforced. Add a size check if large-file uploads cause issues. [`config.tsx`, `handleUpload`]
- No JSON/structural validation of uploaded content before sending — content is read as text and sent directly; server only checks `z.string().min(1)`, not valid JSON or Playwright storageState shape. Failure surfaces at scraper runtime rather than upload time. Address with a `JSON.parse` check at upload time or server-side Zod refinement in a future hardening pass. [`config.tsx`, `api-onboarding.ts`]
- Component unmount between FileReader and `uploadMutation.mutate` — if user navigates away after clicking Upload but before `reader.onload` fires, the callback executes after unmount. React 18+ does not crash on this; low practical impact. [`config.tsx`, `handleUpload`]
- Status query loading/error state not surfaced in UI — `isConnected` defaults to `false` while `useOnboardingStatusQuery` is loading or has errored; user briefly sees "Not connected" before data arrives, and permanently sees "Not connected" on query failure with no error indicator. Beyond spec AC requirements. [`config.tsx`, `ConnectionsCard`]

## Deferred from: code review of 29-3-api-and-discovery-linkedin-session-storage-and-temp-file (2026-05-07)

- Process crash between `writeFileSync` and `try` block entry leaves cleartext LinkedIn session temp file on disk — OS-level failure scenario; tmpdir is cleaned on reboot; low practical risk for Linode deployment.
- SQL template literals in test fixtures embed `VALID_LINKEDIN_CIPHERTEXT` directly into SQL strings — controlled ciphertext format (hex/base64 without single quotes) makes injection impractical; spec-specified pattern; use parameterized queries in a future test quality pass.
- Callers that only inspect `inserted`/`bySource` silently miss LinkedIn skip — Epic 29.4 will wire `errors` into the UI feedback channel, making this visible to users.
- No test for temp file cleanup when `Promise.all` throws — `try/finally` semantics guarantee cleanup regardless of throw path; spec does not require this test.
- Unknown scraper source maps to raw string in DB `source` column — pre-existing from story 13.3; not introduced by this change.

## Deferred from: code review of 29-1-linkedin-discovery-graceful-skip-stopgap (2026-05-07)

- `errors` field not consumed by `api-webhooks.ts` caller — by design for stopgap scope; 29.4 will wire errors into the UI pipeline feedback channel.
- `api-webhooks.test.ts` mock return type missing `errors` field — type drift outside 2-file story scope; TypeScript would catch this at compile time.
- `inserted: 0` when `userId` is undefined — pre-existing behavior; not introduced by this change.
- AC 3 (scraper not called when LinkedIn skipped) not explicitly asserted via fetch call count — implicitly verified by `inserted: 0` and zero network errors in the skip path.
- Positive AC 3 (scraper IS called when auth present) not verified via fetch call count — implicitly covered by `errors.toHaveLength(0)` and insert assertions.
- Stale test name `'happy path: inserts new jobs from all 6 searches'` (only 1 search config exists in beforeAll) — pre-existing before this story.

## Deferred from: code review of 28-3-migrate-docker-volume-to-new-name (2026-05-07)

- Step 4 verify uses only `ls -la`, no checksum to confirm data integrity — adding `md5sum/sha256sum` would be stronger but the spec explicitly specifies `ls -la`.
- No minimum Docker/Compose version stated in runbook — V1/V2 CLI differences could cause operator confusion; pre-existing documentation gap.
- hitlobster_data pre-existing with wrong permissions could block app writes — pre-existing operational concern not introduced by the volume rename.
- docker-compose.yml healthcheck hits root `/` not a dedicated `/health` endpoint — static SPA is served regardless of DB/API health; pre-existing issue, out of scope for this story.

## Deferred from: code review of 27-2-nginx-reverse-proxy-and-deployment-runbook (2026-05-06)

- DOMAIN placeholder in nginx.conf crashes nginx on first boot if not replaced — by design; runbook Step 4 explicitly calls it a required manual step.
- Nginx starts before TLS certs exist → restart loop — operator error scenario; runbook Step 4 prevents it with "do not start docker compose yet" instruction.
- `server_name _` catch-all in nginx.conf — deliberately chosen per dev notes; specific domain hardening is post-story scope.
- `/etc/letsencrypt` symlink resolution after cert renewal — Docker may not follow updated symlinks; subsumed by the cert renewal lifecycle gap (P1).
- `nginx:alpine` floating tag — image pinning recommended for production stability; out of scope for initial deployment story.
- No volume backup guidance — `docker compose down -v` destroys SQLite data permanently; backup strategy is out of scope for this story.
- X-Real-IP/X-Forwarded-For trust model — nginx config is correct (uses $remote_addr); app-layer trust model concern.
- ADMIN_PASSWORD rotation enforcement — no complexity requirement or rotation mechanism; app-level concern; runbook warning is appropriate.
- ENCRYPTION_KEY startup validation — app should validate ENCRYPTION_KEY is set before starting; app-level concern, pre-existing.

## Deferred from: code review of 27-1-dockerfile-and-docker-compose-configuration (2026-05-06)

- `seedAdmin` runs before `REQUIRED_ENV_VARS` validation in `src/index.ts` — pre-existing ordering; DB state is mutated before env check fires.
- `DB_PATH` fallback in `client.ts` is CWD-relative (`./data/jobs.db`) while `DATA_DIR` in `api-jobs.ts` is `import.meta`-relative — inconsistent resolution strategy, harmless in Docker but confusing in dev.
- Scraper `sessions/` files use `process.cwd()`-relative paths (e.g., `indeed.js`) — not covered by any volume mount, so sessions are lost on container restart.
- Duplicate SMTP block in `.env.example` — `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` appear twice; second block shadows first in most dotenv parsers.
- No healthcheck in Dockerfile or Compose — container appears healthy during crash loops; operator visibility limited without `docker compose ps` showing actual health.
- `argon2.hash` can throw an unhandled rejection if `ADMIN_PASSWORD` is invalid, crashing the process before env validation in `seedAdmin` (`src/index.ts:35`).
- `ADMIN_PASSWORD` persists in container env indefinitely — no enforcement of "remove or rotate after setup" comment; intentional design per spec for MVP scope.

## Deferred from: code review of 24-1-crypto-module-mailer-module-and-auth-db-schema (2026-04-27)

- ✅ **RESOLVED in 24.2** — Email normalization: `.toLowerCase().trim()` applied in registration and login handlers before all DB inserts and lookups.
- ✅ **RESOLVED in 24.2** — Invite key race condition: check-and-mark inside `db.transaction()` in the registration handler.
- ✅ **RESOLVED in 24.2** — Missing DB indexes on `sessions(user_id)`, `sessions(expires_at)`, `users(activation_token)`, `users(reset_token)` — added via migration `0020_auth_indexes.sql`.

- GCM auth tag mismatch propagates as uncaught exception — `decipher.final()` throws if ciphertext is tampered; correct GCM behaviour but callers must wrap in try/catch. Deferred to Epic 25 onboarding routes where `decrypt()` is first called.
- `activationToken` and `resetToken` stored as plaintext in `users` table — DB compromise exposes all pending tokens. Design decision accepted for MVP (~10 users). Indexes added in 24.2 for efficient lookups.
- `invite_keys` has no expiry column — invite keys are valid indefinitely; a leaked key is permanently usable. Design decision for epic 24 scope.
- `user_secrets` and `sessions` FK references use `ON DELETE no action` — deleting a user leaves orphaned secrets and sessions. Cascading delete strategy deferred to user deletion flow.
- SMTP TLS options not configured in `mailer.ts` — no `secure` or `requireTLS` flag; port 587 STARTTLS behaviour is implicitly assumed. Should be addressed in deployment configuration (epic 27).
- `sessions.data` has no size cap — no constraint prevents unbounded JSON blobs in session rows. Data is `null` in all 24.2 routes; remains deferred.

## Deferred from: code review of 1-1-project-scaffold-and-dev-prod-scripts (2026-03-28)

- `tsconfig.node.json` not referenced in main `tsconfig.json` via a `references` field. IDEs that only load the root `tsconfig.json` may show type errors on `vite.config.ts` and `drizzle.config.ts`. Not a build or runtime issue — the split config is functional. Consider adding `"references": [{ "path": "./tsconfig.node.json" }]` and marking `tsconfig.node.json` with `"composite": true` in a future cleanup pass.

## Deferred from: code review of 1-2-database-schema-shared-types-and-boot-migrations (2026-03-28)

- `migrationsFolder` uses a CWD-relative path `'./src/db/migrations'` — breaks if process is not started from project root. Contrast with `src/index.ts` which already uses `import.meta.dir` for the dist path. Consider switching to `join(import.meta.dir, '../migrations')` in a future refactor. (By spec design for this story.)
- `runMigrations()` has no try/catch — a migration failure throws a raw unformatted exception that crashes the process. Consider wrapping in a try/catch with a structured error message before calling `process.exit(1)`. (By spec design for this story.)
- `DB_PATH` env var is used without validation — an invalid or malicious path is silently accepted. Will be addressed in Story 1.3 env validation.
- `recommendation` DB column is unconstrained `text` — the `['apply', 'investigate', 'skip']` enum is only enforced by Zod. Direct DB writes can store arbitrary values. SQLite has no native enum; could add a CHECK constraint in a future migration if stricter enforcement is needed.
- `company`/`jobTitle` in `jobInputSchema` accept empty strings (`z.string()` with no `.min(1)`). A blank-name row can be inserted and becomes a permanent block on future inserts with the same empty key. Add `.min(1)` if ingest issues arise.
- `company`/`jobTitle` uniqueness index is case-sensitive — `"Google"` and `"google"` are distinct rows. Normalization (lowercasing or collation) could be added in a future migration if duplicate detection issues arise.
- `db` SQLite singleton is never explicitly closed — on unclean process exit (SIGTERM, crash) the WAL file may not be fully flushed. Consider adding `process.on('exit', ...)` cleanup in a future story.
- Date fields (`dateScraped`, `coverLetterSentAt`, `dateApplied`) stored as raw `text` with no format enforcement beyond Zod `z.string()`. Non-ISO-8601 values can be inserted via direct DB access and will corrupt date-sorting/filtering. Add a Zod `.datetime()` or `.regex()` refinement in a future story if data integrity issues arise.
- `fitScore` has no DB-level CHECK constraint — values outside `[0, 100]` can be stored via direct DB writes. Consider adding `CHECK(fit_score BETWEEN 0 AND 100)` in a future migration.

## Deferred from: code review of 1-3-app-shell-environment-config-and-react-entry (2026-03-28)

- No `<React.Suspense>` boundary at app root (`src/client/main.tsx`) — if any future route uses `useSuspenseQuery` (TanStack Query v5 pattern), it will throw an unhandled suspension with no fallback UI. Add a Suspense boundary wrapping `RouterProvider` when adding data-fetching routes in Epic 3.
- `PORT` env var is validated for presence but not numeric validity — a non-numeric `PORT=abc` passes the env guard and causes `Number("abc")` → `NaN` at server startup, resulting in an unstructured uncaught exception rather than the clean env validation error. Pre-existing from Story 1.1; address in a future hardening pass.
- `migrate.ts` uses a CWD-relative `migrationsFolder: './src/db/migrations'` path — same issue as logged from Story 1.2 review. Pre-existing; not introduced by this story.

## Deferred from: code review of 2-1-api-ingest-endpoint-with-transactional-upsert (2026-03-29)

- TOCTOU: `existingKeys` pre-query in `api-ingest.ts` runs outside the transaction. A concurrent second request between the read and the transaction commit could make the add/update counts inaccurate. Non-issue for single-user localhost tool with no concurrent requests expected.
- `parsed.error.message` in Zod validation failures returns a JSON-stringified string (e.g., `"[{\"code\":\"invalid_type\"..."]`), not a clean human-readable message. Functional but ugly. Consider `parsed.error.issues.map(i => i.message).join(', ')` in a future polish pass.
- `company` and `jobTitle` accept empty strings — no `.min(1)` validation in `jobInputSchema`. Empty-key rows can be inserted and block future inserts with the same blank key. Pre-existing note from Story 1.2 review; add `.min(1)` if data quality issues arise from Sheets data.
- No payload size limit on `ingestPayloadSchema` — no `.max()` on the array. A very large batch could hold the SQLite write lock for an extended period. Non-issue for expected Sheets data volumes (~200 rows).
- `dateScraped` (and other date fields) accept any string format; no ISO-8601 validation. Pre-existing from Story 1.2 review.

## Deferred from: code review of 2-3-api-sync-endpoint-and-sync-button-ui (2026-03-30)

- TOCTOU: `ingestJobs` pre-query snapshot runs outside the transaction — concurrent requests could cause count inaccuracy. Same pattern as Story 2.1 finding; single-user localhost tool so non-issue in practice.
- `body.error` undefined guard in `useSyncMutation.ts` — if server returns non-standard error shape, UI renders "undefined. No data was modified." Architecture guarantees `{ error: string }` shape; revisit if error contract loosens.
- `role="alert"` may not announce dynamically-inserted content in all screen reader/browser combinations — revisit if accessibility requirements harden for this tool.
- `\x00` null-byte separator collision: if company/jobTitle contains a null byte, distinct rows could hash to same key. DB unique index still enforces correctness; only counts would be wrong. Exotic input, not expected from Sheets data.
- Empty `rows[]` still runs full table scan pre-query in `ingestJobs`; add an early-return guard. Negligible at expected data volumes (~200 rows).
- `api-sync.test.ts` `afterEach` resets `mockIngestJobs` to real implementation backed by shared `:memory:` DB; DB state is not cleared between test files. Pre-existing test architecture pattern.

## Deferred from: code review of 2-2-google-sheets-oauth-client-and-column-mapping (2026-03-29)

- `parseInt` float truncation: `parseInt('82.5')` silently returns 82; spec mandates using `parseInt` so this is by design. If spreadsheet sources emit floats, add a `Number()` + `isFinite()` guard in a future pass.
- No OAuth token caching — `getAccessToken()` fetches a fresh token on every sync call; tokens are valid for ~3600s and are reusable. Add token caching (e.g., in-memory singleton with expiry check) when sync call frequency warrants it.
- No `fetch` timeout via `AbortController` on either the token or Sheets HTTP call; stalled Google API calls hang indefinitely. Add a timeout signal when adding general request hardening across the server.
- `res.json()` throws unhandled `SyntaxError` if Google returns a valid HTTP 2xx with a non-JSON body (e.g., proxy interstitial). Error propagates but is opaque. Wrap in try/catch with a descriptive error in a future hardening pass.
- Whitespace-only cell values (e.g., `"   "`) bypass the `val !== ''` empty-string guard in `mapRow`; could produce a record with a blank-looking but non-empty `company` or `jobTitle`. Add `.trim()` check if data-quality issues arise.
- `global.fetch` overwritten in `beforeEach` but never restored in `afterEach` in both test files. Low severity for co-located suites; add `afterAll(() => { global.fetch = originalFetch })` if test isolation issues arise.
- Duplicate spreadsheet column names: `headers.indexOf()` silently uses the first match, ignoring subsequent columns with the same name. Non-issue for expected well-formed spreadsheets.
- `headers.indexOf(col)` linear scan for each of ~11 fields per data row (O(n×m)); replace with a header-index map built once per `fetchJobsFromSheets()` call if large-sheet performance becomes an issue.

## Deferred from: code review of 3-2-pipeline-table-with-fit-score-badge-and-action-chip (2026-04-01)

- `cursor-pointer` on table rows without keyboard handler, `role`, or `tabIndex` — Story 4.1 scope per spec dev notes; wire `onClick` and ARIA attributes when the row-click drawer is implemented.
- `CHIP_STYLES[recommendation]` returns `undefined` for unexpected values — TypeScript prevents this at compile time; root cause is lack of runtime API response validation (pre-existing). Add a fallback (`?? ''`) when adding Zod parsing to the jobs API response.
- `PipelineTable` renders a header-only table if passed an empty `jobs` array — current route guards against this; add a no-results row when the component is reused in filtered/search contexts (future story).
- Loading/error state collapsing in `PipelineRoute` — loading case is intentional (router loader ensures cache per story 3.1); error case falls back to empty-state placeholder with no message. Address with proper error boundary when story 3.4 adds skeleton/error states.

## Deferred from: code review of 3-3-column-visibility-toggle-and-localstorage-persistence (2026-04-02)

- `loadVisibility` has no guard for non-browser environments (SSR, edge runtimes) — SPA pattern, non-issue in current stack; add `if (typeof localStorage === 'undefined') return {}` guard if env ever changes [PipelineTable.tsx:24]
- Stale/orphaned column IDs in persisted VisibilityState survive schema changes silently — frozen IDs make this unlikely; add key validation/filtering if column IDs change in a future story [PipelineTable.tsx:27]
- All column headers sortable including Action chip — no `enableSorting: false` on non-semantic columns; add per-column `enableSorting` when sorting UX is refined [PipelineTable.tsx:133]
- No `aria-sort` attribute on sortable column headers — add `aria-sort` when accessibility pass is done for the pipeline table [PipelineTable.tsx:130-137]
- Truncated cell values (`max-w-[200px] truncate`) lack `title` attribute — full content inaccessible on hover; add `title={v}` in next accessibility pass [PipelineTable.tsx:55-87]
- `OPTIONAL_COLUMNS` manifest in ColumnVisibilityToggle duplicates column IDs from PipelineTable — minor tech debt; consider exporting column IDs from a shared constant if columns expand [ColumnVisibilityToggle.tsx:11]
- Empty string cell values treated identically to null (em-dash) — `v ?` check fails for `''`; add `v != null && v !== ''` guard if Sheets data produces empty-string vs null distinction matters [PipelineTable.tsx:55-87]

## Deferred from: code review of 3-4-view-switching-loading-and-empty-states (2026-04-02)

- Query fetch error silently maps to EmptyState — `isError` not destructured in `PipelineRoute`; a failed jobs fetch shows "No jobs yet" with no error message. Explicitly out of scope per story spec. Address with proper error boundary in a future story.
- No loading indicator during post-sync refetch — after sync success and `invalidateQueries`, `isPending` stays false while jobs refetches; no skeleton is shown during the background fetch. Out of scope per story AC.
- Sync mutation instances not shared across navigation — each mount of `PipelineRoute` creates a new `useSyncMutation()` instance; if the component remounts mid-request the new instance has fresh `isPending: false`, re-enabling the button while a request is still in-flight. Single-user localhost tool; address with a shared mutation key or global state if concurrency becomes an issue.
- `data === undefined` falls through to EmptyState — conflates error, uninitialized, and legitimately-empty states. Explicitly out of scope per story spec; address alongside error boundary work.
- SkeletonCard column headers hardcoded — `['Company', 'Job Title', 'Score', 'Action', 'Reqs Met', 'Reqs Missed', 'Notes']` duplicates `PipelineTable` column definitions with no shared source of truth; will silently drift if columns change. Low risk while column set is stable.
- `bg-muted` CSS variable in `skeleton.tsx` (shadcn-generated) — verify `--muted` is defined in the project's global stylesheet and resolves to a visible color in the dark zinc theme; if not, the skeleton renders transparent with no pulse animation.

## Deferred from: code review of 4-1-job-detail-drawer-shell-and-row-click (2026-04-02)

- AC5 timing: `setSelectedJobId(null)` fires immediately in `onOpenChange`, clearing `bg-zinc-800` row highlight while the 300ms Sheet close animation is still playing. Minor visual edge case; fix requires delaying state reset or using animation completion callback.
- Template-literal className for conditional row styling in PipelineTable — `className={...}` uses string interpolation instead of `cn()` utility; no behavioral impact. Consistent with shadcn convention to address in a future cleanup pass.
- `w-[480px] max-w-none` on SheetContent overflows viewports narrower than 480px — spec-specified width; mobile responsiveness explicitly out of scope for this story.
- `onRowClick` and `selectedJobId` props are required on PipelineTable — standalone use (tests, Storybook) must provide stubs. Spec decision; existing tests were updated.

## Deferred from: code review of 4-2-ai-analysis-display-in-drawer (2026-04-02)

_(No deferred findings — all dismissed findings were false positives or covered by spec intent.)_

## Deferred from: code review of 4-3-applied-toggle-and-status-override-with-persistence (2026-04-03)

- UTC date stored for `dateApplied` may mismatch user's local date — `new Date().toISOString().split('T')[0]` yields UTC date; users west of UTC near midnight get tomorrow's date. Requires product decision on timezone strategy.
- No try/catch around DB update/re-select in PATCH handler — a DB error (lock, disk full) throws an unstructured 500. Pre-existing pattern across all DB calls; address in a future hardening pass.
- Invalid `dateApplied` format causes `Intl.DateTimeFormat` to throw a RangeError — guard belongs at ingest time (Story 1.2 deferred item); consider adding `.regex(/^\d{4}-\d{2}-\d{2}$/)` to `dateApplied` in the ingest schema.
- `dateApplied` format inconsistency if Epic 2 ingest stored full ISO timestamps — server PATCH generates YYYY-MM-DD, but existing values may be full ISO strings; the `T00:00:00` suffix appended in `AppliedToggle` would create an invalid date. Verify via data audit.

## Deferred from: code review of 4-4-status-timeline (2026-04-03)

- FK `ON DELETE NO ACTION` on `status_events.job_id` — orphans event rows if a job row is ever deleted. No job deletion feature exists in current scope; add `ON DELETE CASCADE` in a future migration if job pruning is introduced [`schema.ts`, `0001_goofy_pestilence.sql`]
- Very large numeric IDs (20+ digits) pass the `/^\d+$/` regex guard but exceed `Number.MAX_SAFE_INTEGER`, producing an imprecise float for the DB query. Results in a 404 in practice but the validation contract is silently broken. Pre-existing pattern across all `/:id` handlers; add a `Number.isSafeInteger(rawId)` check in a future hardening pass [`api-jobs.ts`]

## Deferred from: code review of 5-1-tracker-table-with-applied-jobs (2026-04-04)

- `open=true` + `job=null` if selected job is deleted mid-session: `selectedJobId !== null` but `jobs.find()` returns null, leaving JobDrawer open with no data. Design decision — story notes document this pattern as acceptable (same as PipelineRoute; job deletion not a user action in Tracker view) [`tracker.tsx:19`]
- Raw enum values (e.g. `phone_screen`) rendered in Status column without display mapping. Pre-existing concern across all status-displaying views; not in scope for this story [`TrackerTable.tsx:63`]

## Deferred from: code review of 5-2-visual-row-aging (2026-04-04)

- Tooltip `animate-in`/`animate-out` classes on shadcn `TooltipContent` do not respect `prefers-reduced-motion` — tooltip entrance/exit animation plays regardless of motion preference. `tooltip.tsx` is shadcn-generated and must not be hand-edited per story spec. Address in a future accessibility hardening pass with a custom wrapper or global CSS override.
- `aria-describedby` injected by Radix `TooltipTrigger asChild` onto `<tr>` (ARIA role `row`) — the `row` role doesn't officially accept `aria-describedby`; some assistive technologies may not surface the tooltip relationship. This is the specified approach from the story; address in a future accessibility audit [`AgingRow.tsx:29`].
- `computeDaysAgo` midnight boundary: if the user's wall-clock time is within hours of local midnight of `dateApplied`, the day count can be off by one in rare cases. Established local-time pattern (`T00:00:00`) from Story 5.1; accepted trade-off.
- Tooltip portal in scrollable container: if the Tracker table's scroll container gains `overflow: hidden`, the Radix tooltip portal (appends to `document.body`) may be clipped or mispositioned. Radix handles this via its portal mechanism; low risk at current layout [`AgingRow.tsx:28`].

## Deferred from: code review of 6-1-imap-polling-service (2026-04-05)

- `setInterval` async callback — unhandled rejection risk if future code throws outside `pollOnce`'s try/catch; currently safe because `pollOnce` never re-throws, but Story 6.2 adding logic inside the try block increases the exposure surface [`imap-poller.ts:22-24`]
- `setInterval` handle not stored — no graceful shutdown on SIGTERM, no cleanup mechanism for tests that successfully start the poller; must be addressed if process lifecycle management is added [`imap-poller.ts:22`]
- `startImapPoller` not idempotent — called multiple times (e.g., hot-reload) registers overlapping polling intervals with no way to cancel previous ones; non-issue for current single-startup pattern [`imap-poller.ts:11`]
- `ImapCredentials` interface not exported — Story 6.2 callers will need to type their arguments against this interface; export it when extending `pollOnce` [`imap-poller.ts:5`]

## Deferred from: code review of 6-2-fuzzy-email-to-job-matching-and-status-update.md (2026-04-05)

- No initial poll on startup — `startImapPoller` calls `setInterval` but never calls `pollOnce` immediately; first execution is delayed by the full interval (default 5 minutes). Design preference; address if fast-startup detection is needed.
- Concurrent poll overlap — `setInterval` fires on a fixed clock regardless of whether the previous async `pollOnce` invocation has completed; a slow IMAP fetch can cause overlapping poll runs and duplicate DB writes. Personal dashboard single-user tool; add a concurrency guard (e.g., an `isPolling` flag) if poll duration approaches the interval.
- `IMAP_POLL_INTERVAL_MS=0` produces a busy-loop — `parseInt('0')` is not `NaN`, so no minimum-value clamp is applied; `setInterval(fn, 0)` fires as fast as the event loop allows. Unrealistic misconfiguration; add `Math.max(30000, POLL_INTERVAL_MS)` if misconfiguration becomes a concern.
- Unsanitized `err.message` logging — `console.error('[imap] Poll error:', err.message)` passes the library error message raw; some IMAP servers/libraries embed credentials or auth tokens in auth-failure messages, potentially violating the security invariant. Library behavior outside direct control; consider logging only a fixed prefix if IMAP auth error shapes are audited.

## Deferred from: code review of 4-5-unified-status-dropdown-with-applied (2026-04-05)

- Port 993 hardcoded in `pollOnce` — no `IMAP_PORT` env var for non-standard or test IMAP servers; code change required for local mock IMAP testing [`imap-poller.ts:118`]
- `uidsResult === false` guard is dead code — `imapflow`'s `client.search()` returns `number[]`, never `false`; the guard is a no-op and could mislead future readers about the API contract [`imap-poller.ts:134`]
- UTC midnight anchor for `dateApplied` (`job.dateApplied + 'T00:00:00Z'`) may misalign with email `Date:` header timestamps near timezone boundaries, potentially consuming part of the ±3-day window for users in UTC+12 or UTC-12 [`imap-poller.ts:66`]
- `normalizeText` expands abbreviations (`sr`→`senior`, `eng`→`engineer`) across the full combined email body, not just the job title tokens; boilerplate phrases containing those words in unrelated context inflate false-positive title-match scores [`imap-poller.ts:30`]

## Deferred from: code review of 6-3-email-events-visible-in-drawer (2026-04-05)

- No `aria-label` on `<Mail>` icon in `StatusTimeline` — screen readers get no indication that an event was email-sourced. Add `aria-label="Via email"` (or equivalent) in a future accessibility hardening pass. Consistent with Epic 5 deferred a11y items (A1, A2) [`StatusTimeline.tsx`].
- `status_events.source` column has no SQLite CHECK constraint — values beyond `'manual'`/`'email'` can be written via direct DB access; Zod enum in `statusEventSchema` only enforces at schema layer, not at the `GET /api/jobs/:id/events` return path (raw Drizzle rows are returned without parsing). Add `CHECK(source IN ('manual','email'))` in a future migration [`schema.ts`, `0002_unknown_slipstream.sql`].
- `useJobEvents` swallows non-ok API responses silently — returns `[]` on any `!res.ok`, causing `StatusTimeline` to render "No status history yet." even when events exist but the fetch failed (network blip, 500). No error state is surfaced to the user. Add an error state when reworking hook error handling [`useJobEvents.ts`].
- `new Date(event.timestamp)` on a malformed or unparseable timestamp string produces `"Invalid Date"` rendered inline — no guard in `StatusTimeline` or Zod `.datetime()` validation at API boundary. Add a timestamp format guard or Zod `.datetime()` refinement to `statusEventSchema` in a future hardening pass [`StatusTimeline.tsx`].
- `STATUS_LABELS` in `StatusTimeline` has no formatting for statuses outside its map — the `?? event.status` fallback renders raw DB strings verbatim (e.g., `'offer_accepted'` in snake_case). More likely to surface now that the email pipeline is active. Add display-name mapping for all known statuses or a generic humanizer [`StatusTimeline.tsx`].

## Deferred from: code review of 7-1-cover-letter-generation-trigger (2026-04-06)

- No auth on `POST /:id/generate-cover-letter` — pre-existing pattern across all API routes; any unauthenticated network caller can trigger n8n webhook calls and write to `cover_letters`. Address when adding auth layer to the app.
- `onSuccess` in `useGenerateCoverLetter` only invalidates `['jobs']` — Story 7.2 will likely add a `['coverLetters', jobId]` query; proactively invalidate it in `onSuccess` when that query is introduced [`useGenerateCoverLetter.ts`].
- No server-side rate-limiting / idempotency guard on cover letter generation — `isPending` prevents double-submit from the same session, but concurrent requests from separate tabs or clients will each trigger a new n8n call and insert a new row. Address with a per-job mutex or cooldown if misuse becomes a concern.
- `N8N_WEBHOOK_URL` not logged on successful calls or on failures for observability — the spec notes "URL is safe to log"; add structured server-side logging when a logging layer is introduced [`cover-letter-service.ts`].

## Deferred from: code review of 7-2-n8n-webhook-callback-and-cover-letter-storage (2026-04-06)

- `orderBy(desc(coverLetters.createdAt))` sorts lexicographically on a TEXT column (`api-jobs.ts`). ISO-UTC strings sort correctly and the generate endpoint consistently writes `new Date().toISOString()`, but format inconsistency would silently return the wrong "most recent" letter. Pre-existing schema constraint from Story 7.1; not actionable without a schema migration.
- `new Date(coverLetter.createdAt).toLocaleDateString()` renders "Invalid Date" if `createdAt` is a malformed string (`JobDrawer.tsx`). `createdAt` is stored as raw TEXT with no Zod `.datetime()` refinement in `coverLetterSchema`. Consistent with the pre-existing unvalidated date field pattern across the codebase (logged in Story 1.2 deferred); address in a future schema-hardening pass.

## Deferred from: code review of 7-3-cover-letter-display-and-table-row-indicator (2026-04-07)

- No `aria-label` or `title` on `CoverLetterChip` — the "CL Sent" chip uses a two-letter abbreviation with no accessible label. Screen readers and unfamiliar users get no disclosure that "CL" means "Cover Letter". Consistent with pre-existing a11y debt on ActionChip and other pipeline cell components; address in a future accessibility hardening pass [`CoverLetterChip.tsx`].

## Deferred from: code review of 8-1-pipeline-table-date-scraped-and-status-columns (2026-04-07)

- `dateScraped` column uses `v.slice(0, 10)` on a `z.string().nullable()` field with no ISO 8601 format enforcement — malformed strings silently display garbage date portions. Spec-mandated approach; pre-existing schema looseness logged from Story 1.2 and 2.1 reviews. Add Zod `.datetime()` or `.regex()` refinement to `dateScraped` in a future schema-hardening pass [`PipelineTable.tsx:94`]
- New columns (`cover_letter`, `date_scraped`, `status`) default hidden for users with existing localStorage VisibilityState — keys missing from stored state cause columns to be hidden until manually re-enabled. Consistent pre-existing behavior for all prior column additions. Add a migration or default-visibility fallback if UX issues arise [`PipelineTable.tsx`, `ColumnVisibilityToggle.tsx`]
- `status` column renders raw DB strings verbatim without display-name mapping — values like `phone_screen` shown as-is. Pre-existing concern noted in Story 5.1 review; add a display-name map or humanizer when a status formatting pass is done [`PipelineTable.tsx:109`]
- Whitespace-only `coverLetterSentAt` value would pass `if (!sentAt)` truthy check and display "CL Sent" badge for semantically-empty data — very unlikely from actual data source; pre-existing pattern [`CoverLetterChip.tsx:6`]

## Deferred from: code review of 8-2-archive-jobs (2026-04-07)

- `useEffect` uses inline-computed filtered array (`activeJobs`/`archivedJobs`) as a dependency, causing the effect to run on every render cycle. Not a correctness bug but a code quality concern; useMemo would be cleaner. [archived.tsx, tracker.tsx, index.tsx]
- No success feedback when a job disappears after archive/unarchive — job silently vanishes with no toast or notification. UX enhancement; address when adding a notification layer. [JobDrawer.tsx]
- `ArchivedRoute` shows "No archived jobs." during initial data load — `useJobsQuery` defaults to `[]`, so the empty state briefly renders on cold cache. Route loader mitigates in practice; add a skeleton for consistency when doing a loading-state pass. [archived.tsx]
- Ingest preservation test queries by company name only (`WHERE company = 'Acme'`); should use the composite unique key `(company, job_title)` for robustness. Per-test DB isolation makes this safe currently. [api-ingest.test.ts:333]
- Mutation error is silently lost when the drawer auto-closes via optimistic update before the PATCH response arrives. Pre-existing limitation of the optimistic-update pattern across all mutations; address when adding a global error/notification layer. [useJobMutation.ts]

## Deferred from: code review of 3-1-jobs-api-and-tanstack-query-hook (2026-04-01)

- Router loader (`src/client/lib/router.ts`) has no `errorComponent` — silent failure on load error — story 3-4 scope
- No `LIMIT` clause on `GET /api/jobs` (`src/server/routes/api-jobs.ts`) — full table scan — MVP design decision, revisit at scale
- No timeout / AbortController on `fetchJobs` (`src/client/hooks/useJobsQuery.ts`) — design decision
- `staleTime: 0` causes redundant re-fetch on every navigation to `/` — future optimization
- `api-sync.test.ts` error-handling tests (propagates OAuth error, propagates DB write error) failing on HEAD — Hono sub-apps tested in isolation don't inherit parent app's `onError` — pre-existing issue from story 2-3, not introduced by story 3-1

## Deferred from: code review of bulk-archive-jobs (2026-04-08)

- Indeterminate checkbox state in PipelineTable header only fires on mount — when selection goes from none to partial, the `indeterminate` DOM property is not updated. Requires a sub-component with `useEffect` to fix correctly. Minor visual concern; actual selection behavior is unaffected. [PipelineTable.tsx, `selectionColumn` header]
- `setRowSelection({})` clears selection synchronously before the async archive request completes — if mutation fails, the user cannot see which rows were originally selected for a retry. Consistent with existing single-job archive UX (drawer closes on click). Address when adding a notification layer for mutation errors.
- `ids.includes(j.id)` in `useBulkArchiveMutation` optimistic update is O(n×m) — acceptable at job-hunt scale but would benefit from a `Set` lookup if list grows. [useBulkArchiveMutation.ts]
- No per-request authorization on `POST /api/jobs/bulk-archive` — pre-existing pattern across all endpoints; single-user localhost tool. Address if multi-user deployment is ever considered.

## Deferred from: code review of 9-1-messages-view (2026-04-09)

- **Alert auto-dismiss race** [`Layout.tsx`] — Independent `useEffect` timers for 6 mutations (sync, discovery, analysis × success/error) are not coordinated; a success from one mutation can fire `setActiveAlert(null)` 4s later, prematurely dismissing an alert from a second mutation that succeeded shortly after. Low probability in practice.
- **email-fetch-service full UID table scan** [`email-fetch-service.ts:9-11`] — All existing message UIDs are loaded into memory before the IMAP fetch loop. Unbounded allocation; acceptable at personal job-hunt scale but would need server-side filtering (WHERE uid IN ...) if the messages table grows large.
- **MessagesTable columns array re-created each render** [`MessagesTable.tsx:44`] — The `columns` array is defined inside the component function without `useMemo`. TanStack Table re-initializes on every render. Wrap in `useMemo` if the table grows large or re-render frequency increases.
- **MessagesTable distinctCompanies/filteredTitles recomputed per cell render** [`MessagesTable.tsx:42,126`] — Company list and job title list are re-derived from the `jobs` prop on every render pass. Memoize with `useMemo` at scale.
- **useGenerateResume no success feedback** [`useGenerateResume.ts`] — Resume generation (out-of-spec addition from this story) gives no toast or UI state change on success — button returns to idle state silently. Add an `onSuccess` callback or toast notification.
- **Company dropdown → jobTitle PATCH race** [`MessagesTable.tsx:101-103`] — Changing company fires a PATCH for `{ company, jobTitle: null }` while a prior jobTitle PATCH may still be in-flight. No request cancellation; the later response wins, but if network is slow the company-change patch could overwrite a concurrent jobTitle save. Add a mutation key or abort prior request.

## Deferred from: code review of 10-1-webhook-history-tab (2026-04-10)

- **Unbounded `webhook_runs` table growth** [`api-webhook-runs.ts`] — `GET /api/webhook-runs` does a full table scan with no LIMIT; after months of use with cover letter/resume/discovery/analysis runs this becomes a large payload on every 15s poll. Add `.limit(500)` or pagination when history volume becomes a concern.
- **`fireWebhook` leaks raw infrastructure error details to client** [`api-webhooks.ts`] — `err.message` from network/TLS errors forwarded verbatim to browser; can expose hostname or IP. Sanitize to a generic message in a future hardening pass.
- **No CSRF protection on POST webhook endpoints** [`api-webhooks.ts`] — pre-existing API-wide concern; any page in the same browser can trigger Discovery/Analysis webhook calls. Address when adding auth layer.
- **`runAt` stored as text with no DB-level format enforcement** [`api-webhook-runs.ts`] — ordering relies on ISO 8601 convention from `recordRun`; a non-ISO write would silently corrupt sort order. Add a CHECK constraint or Zod `.datetime()` refinement in a future hardening pass.
- **AbortSignal TimeoutError not distinguished in error message** [`api-webhooks.ts`] — a 60s timeout surfaces as a generic network error message. Add `err.name === 'TimeoutError'` check for clearer user-facing messaging.
- **No AbortController cleanup in `useWebhookMutation`** [`useWebhookMutation.ts`] — component unmount during in-flight fetch may produce a stale state update. Add cleanup signal when doing a general mutation hardening pass.
- **No `staleTime` on `useWebhookRunsQuery`** [`useWebhookRunsQuery.ts`] — every navigation to `/history` triggers an immediate refetch even if data is fresh. Add `staleTime: 10_000` alongside `refetchInterval`.
- **Empty-string company/jobTitle fuzzy matching** [`api-jobs.ts`] — messages with empty `company`/`jobTitle` can match all jobs with the same empty values; data quality edge case. Add a non-empty guard if it surfaces in practice.
- **No server-side concurrency guard on webhook routes** [`api-webhooks.ts`] — concurrent POSTs to `/discovery` or `/analysis` fire duplicate downstream n8n workflow executions with no de-duplication or 409 response.

## Deferred from: Status timeline email subject/sender display (2026-04-11)

- **`StatusEvent` schema allows `emailSubject`/`emailSender` on manual events with no enforcement** [`schemas.ts`] — `z.string().optional()` adds no `source === 'email'` conditional constraint. A discriminated union or `.superRefine()` would make the invariant machine-checked. Low risk: server only sets these fields when constructing email events.
- **Negative ID collision for synthesized email events** [`api-jobs.ts:83`] — `id: -m.id` is a hack to avoid PK collisions; React uses this as a `key`. If a message row is ever re-ingested with a new ID the key changes silently. Consider a string key like `email-{m.id}` in a future refactor.
- **Full table scan on `messages` for lower() case-insensitive match** [`api-jobs.ts:72-80`] — `lower(company)` and `lower(jobTitle)` predicates bypass column indices. Add expression indices if messages table grows large.
- **No client-side validation of `GET /:id/events` response against `statusEventSchema`** — raw JSON is cast to `StatusEvent[]` without Zod parsing. Pre-existing pattern across all API calls.
- **ID validation copy-pasted across five route handlers in `api-jobs.ts`** — Extract into a shared helper in a future refactor.

## Deferred from: fit score bucket refactor (2026-04-11)

- `fitScore` has no range guard before bucketing — negative or >100 values produce arbitrary string keys that are silently inserted into the bucket map as extra properties, producing unexpected chart entries. Pre-existing: no DB-level CHECK constraint on `fit_score` (logged in Story 1.2 review). Add a `Math.max(0, Math.min(100, score))` clamp or a DB CHECK constraint if data quality issues arise.

## Deferred from: code review of 11-1-dashboard-view (2026-04-11)

- Synchronous `.all()` DB calls in `api-stats.ts` — pre-existing project-wide Bun/SQLite pattern; all routes use sync API by design.
- Full table scans (five queries) per stats request — acceptable for single-user job-hunt tool; optimize with aggregating SQL if data volume grows.
- `responseRate` counts any non-null `statusOverride` as a response — matches spec definition exactly; semantic meaning is intentional.
- `useStatsQuery` casts `res.json()` without Zod validation — pre-existing pattern across all project hooks; add schema validation in a future hardening pass.
- `30d` period uses fixed `2_592_000_000` ms rather than calendar month — matches spec-defined cutoff arithmetic; DST/month-length edge cases accepted.
- `parseWorkflow` falls through for unrecognized webhook run names — by design per spec; unknown names grouped as-is on chart.
- `api-stats.ts` route handler lacks try/catch — global `errorHandler` middleware handles unhandled errors; consistent with all other routes.
- `dateScraped`/`dateApplied` null rows silently excluded from period-filtered queries — expected: jobs without a scrape/apply date don't belong in a date-filtered view.
- Period selector state not synced to URL — design choice; single-user local tool, bookmarking/sharing not a requirement.
- No `staleTime` on `useStatsQuery` — pre-existing pattern; refetch-on-focus is acceptable for this dashboard.

## Deferred from: Company typeahead implementation (2026-04-10)

- **CompanyTypeahead missing stale company** [`MessagesTable.tsx`] — `distinctCompanies` is derived from `jobs` only. If a message has a company value that no longer has a corresponding job (deleted job, or externally set), that company does not appear in the typeahead options. The current value still displays correctly, but the user cannot re-select it — only clear it. Consider deriving options from `union(jobs.company, messages.company)`.
- **`e.stopPropagation()` on company/type/jobTitle cell wrappers** [`MessagesTable.tsx`] — Pre-existing pattern from original Select cells. There is no row-level `onClick` handler, so these `stopPropagation` calls are no-ops. Remove in a future cleanup pass.

## Deferred from: Dashboard archived stat card (2026-04-11)

- **No test coverage for `archived.total` in `api-stats.test.ts`** — The stats route test file was not updated. Consider adding: (1) a test asserting `archived.total` is present and correct, (2) a test verifying archived count is period-independent (unchanged when period filter is active).
- **`grid-cols-5` has no responsive breakpoint** [`dashboard.tsx`] — Five equal-width cards will collapse at narrow viewports. Consider adding `sm:grid-cols-3 md:grid-cols-5` or similar responsive qualifiers.
- **Archived and Applied can overlap** [`api-stats.ts`] — A job can be both `applied=true` and `archived=true`, so `archived.total` and `applications.total` are not mutually exclusive. The current UI implies they represent separate pipeline stages. Worth clarifying in data model docs or enforcing mutual exclusion.
- **Count fields use `z.number()` without `.int().nonnegative()`** [`schemas.ts`] — `pipeline.total`, `applications.total`, `emails.total`, `archived.total` all accept floats and negatives at the schema layer. Consider tightening to `z.number().int().nonnegative()`.

## Deferred from: code review of 11-2-dashboard-global-filters (2026-04-12)

- **Period date columns inconsistent across metrics** [`api-stats.ts`] — `dateScraped` used for viewJobs cutoff, `dateApplied` for appliedJobs cutoff, `receivedAt` for emails. Pre-existing design; a job scraped long ago but applied recently can appear in applications but not in the scraped count for the same period window.
- **No Zod/schema validation on showArchived/showUnapplied params** [`api-stats.ts`] — `period` is validated against `STATS_PERIODS`; the new boolean params use loose `=== 'true'` string coercion. Inconsistent with project validation approach; no runtime risk but future maintainers may add invalid param handling unevenly.
- **No test explicitly asserts scraped.total excludes unapplied jobs when showUnapplied=false** [`api-stats.test.ts`] — AC7 covers the Scrapes stat card, but the filter test group only checks `pipeline.total`. Minor coverage gap; the code is correct (same baseWhere applies) but the omission is a documentation gap.
- **Null dateScraped jobs counted in scrapedTotal (period=all) but silently skipped in perDay** [`api-stats.ts`] — When no date cutoff is applied, jobs with null `dateScraped` pass the baseWhere filter and land in viewJobs (adding to scrapedTotal) but are skipped in the dailyMap loop, causing the perDay chart total to undercount vs scrapedTotal. Pre-existing behavior.

## Deferred from: spec-dashboard-applied-filter-selector (2026-04-12)

- **`AppliedFilter` type declared in two files with no shared import** [`api-stats.ts`, `useStatsQuery.ts`] — Server and client both define their own `AppliedFilter = 'applied' | 'unapplied' | 'all'` union. If they diverge, the contract breaks silently. Consider adding `AppliedFilter` to `@shared/schemas` in a future cleanup pass.
- **No test for bogus `appliedFilter` query param** [`api-stats.test.ts`] — Server silently defaults bogus values to `'applied'`, which is correct, but there's no explicit test asserting this behaviour. Low risk; low priority.
- **`matchingJobKeys` null-key collision** [`api-stats.ts`] — If a job has `company=null` or `jobTitle=null`, the `\x00`-separated key becomes `"null\x00..."`, which could false-match an email for a company literally named `"null"`. Pre-existing from story 11-2.
- **`dateApplied` NULL excluded by period filter** [`api-stats.ts`] — Jobs with `applied=true` but `dateApplied=null` are silently excluded from period-filtered application stats because `gte(jobs.dateApplied, dateCutoff)` rejects nulls. Pre-existing behaviour.
- **Inconsistent period cutoff columns across metrics** [`api-stats.ts`] — Pipeline uses `dateScraped`, applications use `dateApplied`, emails use `receivedAt`. Pre-existing design; a job scraped long ago but applied recently can appear in applications but not scraped count for the same period window.

## Deferred from: code review of 12-1-profile-view (2026-04-13)

- **Loader `fetchProfile` error surfaces as raw error boundary crash** [`src/client/lib/router.ts`] — No `errorComponent` configured on `profileRoute` (or any route). `fetchProfile` throwing (network, Zod parse failure) crashes the subtree. Pre-existing systemic pattern across all routes.
- **Empty string stored via direct API shows blank instead of `—`** [`src/client/routes/profile.tsx`] — `{data?.name ?? '—'}` only guards null/undefined; `""` renders blank. The UI converts empty to null on save, but direct API callers (curl, n8n) can store empty strings. Low priority for single-user localhost app.
- **`archivedTotal` always 0 when `archivedFilter=active`** [`src/server/routes/api-stats.ts`] — `viewJobs` is pre-filtered to exclude archived, so `viewJobs.filter(j => j.archived).length` is always 0 in the default view. Dashboard "Archives" KPI is misleading at default filter. Pre-existing.
- **`sheets-sync` new contact field header name assumptions** [`src/server/services/sheets-sync.ts`] — `get('contact_name')`, `get('contact_email')`, `get('contact_phone')` return null if the Google Sheet columns don't use those exact header names. Silent data gap with no warning.

## Deferred from: code review of 13-1-remove-google-sheets-integration (2026-04-14)

- **`ingestJobs()` not awaited in `api-ingest.ts`** [`job-hunt-dashboard/src/server/routes/api-ingest.ts`] — `const result = ingestJobs(parsed.data)` has no `await`. If `ingestJobs` is ever made async, `c.json(result)` would silently serialize a Promise object instead of the resolved value. Pre-existing.
- **`discoveryMutation.error` / `analysisMutation.error` accessed without null guard in `Layout.tsx`** — `.error.message` accessed inside `isError` effect. TanStack Query types `error` as `Error | null` even when `isError` is true; a reset race could cause a null dereference. Pre-existing.
- **`useEffect` on `.isError` boolean doesn't re-fire on repeated mutation errors in `Layout.tsx`** — If a webhook mutation errors twice consecutively, `isError` stays `true` (no false→true transition), so the second error never shows an alert. Pre-existing systemic pattern.

## Deferred from: code review of 13-2-schema-analysis-status-and-external-job-id (2026-04-14)

- **`externalJobId: z.string().nullable()` accepts empty string** — Enhancement to add `.min(1)` when non-null. Out of scope for this story's spec. Address when Discovery contract is firmed up. (`src/shared/schemas.ts:25`)
- **`fitScore`, `recommendation`, `roleFit`, etc. still accepted in `jobInputSchema` but silently discarded on re-ingest conflict** — Pre-existing design; `jobInputSchema` predates the analysis ownership split. Scope removal of analysis-owned fields from the ingest schema in a future story once Discovery/Analysis API contracts are defined.
- **Unique conflict target is `(company, job_title)` — `externalJobId` not used for deduplication** — Pre-existing architecture decision. If two rows exist for the same external job with different titles, they can't be merged via the upsert path. Revisit when deduplication strategy is defined.
- **Existing rows get `NULL` for `analysis_status` and `external_job_id` after migration** — Operational concern: at first deploy, all historical rows will have `NULL` analysis status. The Analysis service must treat `NULL` as "not applicable" (manually-ingested) rather than "pending", or it will enqueue all historical rows simultaneously. Document this in the Analysis service contract.

## Deferred from: code review of 13-3-discovery-service-scraper-to-db (2026-04-14)

- **`inserted` count reports `newJobs.length` not actual DB writes** — `onConflictDoNothing` silently suppresses rows that pass `externalJobId` dedup but collide on the `(company, job_title)` unique constraint. Count could overstate actual inserts. Spec says `onConflictDoNothing` is defensive-only and dedup should prevent conflicts; acceptable until conflicts are observed. (`discovery-service.ts`)
- **No test for network-level fetch error (TypeError vs non-ok Response)** — Tests only mock `new Response(null, { status: 500 })`; a real `fetch` throwing `TypeError` or `DOMException` follows a different code path that isn't exercised. Low value given observable behavior is the same (throws). (`discovery-service.test.ts`)
- **`AbortSignal.timeout` per-request, no outer handler deadline** — Each of 6 parallel scraper requests has a 60s timeout, but the route handler has no overall deadline. Worst-case wall time is ~60s. No spec requirement for an outer timeout; acceptable for low-frequency Discovery runs. (`api-webhooks.ts`)

## Deferred from: code review of 13-4-analysis-service-db-scraper-anthropic (2026-04-15)

- `analysis-service.ts`: Jobs stuck in `analyzing` state if process crashes mid-loop. `analysisStatus = 'analyzing'` is set before any async call (spec-prescribed). A separate cleanup job that resets old `analyzing` rows back to `pending` (e.g., older than 10 min) would provide crash recovery.
- `analysis-service.ts`: No overall deadline on `runAnalysis` loop. Per-request `AbortSignal` timeouts are spec-prescribed (60s scraper, 120s Anthropic). Worst-case 30 min per invocation; an outer concurrency limit or aggregate deadline would prevent HTTP handler stalls.
- `analysis-service.ts`: `AnalysisResult` fields accepted without runtime Zod validation. String `score` → maps to null; `recommended_action` accepts arbitrary strings beyond `apply|investigate|skip`. Consider a Zod schema parse pass before DB writes in a future hardening story.
- `api-webhooks.ts`: Error message from `runAnalysis` forwarded verbatim in 502 body. Pre-existing pattern across all routes; sanitize or wrap in a future security hardening pass.
- `api-webhooks.ts` / `discovery-service.ts`: `recordRun` called synchronously (fire-and-forget). If it were async and threw, the error would be silently swallowed. Pre-existing pattern; add try/catch in a future cleanup pass.
- `analysis-service.test.ts`: Test env var cleanup (`delete process.env.ANTHROPIC_API_KEY`) is inline in test body, not in `afterEach`. If an assertion throws, cleanup is skipped and later tests may see contaminated env state.
- `analysis-service.ts`: `recommended_action` stored without enum validation. Invalid values (e.g., `"maybe"`) pass through to the DB and may break UI rendering. Addressable with Zod validation on `AnalysisResult` (see point 3 above).

## Deferred from: code review of 13-5-cover-letter-direct-anthropic-and-docx (2026-04-15)

- `build-docx.ts`: `crc32()` rebuilds its 256-entry lookup table on every invocation. Not a correctness issue but wastes ~256 iterations per `buildDocx` call. Extract table construction to module-level constant in a future cleanup pass.

## Deferred from: code review of 14-1-embed-scraper-as-child-process (2026-04-16)

- `restartDelay = 1_000` resets on every `startChild()` call, immediately after spawn, regardless of whether the process has proven stable. Rapid crash loops always restart with a 1s delay; the exponential backoff doesn't accumulate correctly across consecutive crashes. The spec's Implementation Notes §2 explicitly acknowledges this and calls the simple version acceptable. Fix: move the reset into the `exit` handler behind a `> 10s alive` grace-period check.

## Deferred from: code review of 13-6-resume-direct-anthropic-and-playwright-pdf (2026-04-15)

- `api-jobs.ts`: Profile fetched twice — service reads profile for the prompt, route reads it again for the filename. Spec-intended pattern; SQLite local cost is negligible. Eliminate double-read in a future cleanup pass.
- `resume-service.ts` / `cover-letter-service.ts`: Prompt injection via job description and profile data — `jobDescription` and all profile fields are concatenated raw into Anthropic prompts. Inherent to LLM architecture with external data; acceptable for a personal single-user app. Sanitize or use structured prompts in a future hardening pass.
- `generate-pdf.ts`: `waitUntil: 'networkidle'` hangable on slow external resources — spec-mandated; current HTML template uses `system-ui` (no external resources). Add an explicit timeout if the template ever references external assets.
- `api-jobs.ts` / `build-docx.ts`: DOCX XSS/XML injection — `escXml()` only escapes `& < >`; control characters and invalid XML sequences are not sanitized. Pre-existing from story 13-5.
- `resume-service.ts` / `cover-letter-service.ts`: Anthropic error response body silently discarded — non-ok responses throw `Anthropic error {status}` without reading the body (which contains structured error details). Error status is captured via `recordRun`; add body logging in a future debugging pass.

## Deferred from: code review of 16-1-jobs-matches-page-split (2026-04-17)

- `analysis-service.ts` lines 52–62: Concurrent `runAnalysis()` invocations (e.g., two rapid webhook triggers) can SELECT the same pending jobs before either marks them `analyzing`, resulting in duplicate Anthropic calls and conflicting DB writes. Fix requires atomic SELECT+UPDATE or a per-call advisory lock.
- `analysis-service.ts` line ~132: Greedy regex `/\{[\s\S]*\}/` used as fallback JSON extraction when direct `JSON.parse` fails. When Anthropic returns multiple JSON-like blocks in its response (e.g. an explanation with an embedded JSON example followed by the actual result), the greedy match merges them into an unparseable string. Fix requires a last-`}` search, a JSON-stream parser, or a stricter prompt contract guaranteeing bare JSON output.

## Deferred from: code review of 15-1-prompt-templates (2026-04-16)

- **Analysis flow ignores stored `systemPrompt`** [`analysis-service.ts:107-119`] — `loadEffectivePrompt('analysis')` returns whatever is in the DB (including a custom non-null `systemPrompt`), but `analysis-service.ts` never passes a `system` field to Anthropic. Any custom system prompt saved for the analysis flow is silently dropped. Only reachable via direct PUT — the UI shows no system-prompt field for analysis since the default is null.
- **Stale draft state on concurrent external update** [`prompts.tsx:36-38`] — `draftSystem`/`draftUser` are initialised in `handleEdit` only; if the backing React Query cache refreshes while the user is mid-edit, the draft is not re-synced. Single-user app; low probability in practice.
- **`cover-letter-service.ts` jobDetails uses single-line format** [`cover-letter-service.ts:30-34`] — Fields are space-concatenated with no newlines (`Role: Company: Foo Title: Bar ...`); `resume-service.ts` uses `\n` separators. Minor LLM-parsing inconsistency introduced by spec; address in a future prompt quality pass.
- **Prompt injection via job description and profile fields** — Raw `jobDescription`, `summary`, `experience` etc. are string-concatenated directly into Anthropic prompts with no injection guard. Pre-existing architecture characteristic shared across all three services; acceptable for single-user personal tool.
- **`stripCodeFences` incomplete coverage** [`resume-service.ts`] — Only strips a single top-level fence; prose before the fence, uppercase ` ```HTML `, or multiple code blocks are passed through unchanged. System prompt instructs model to return raw HTML; this is a defensive fallback only.
- **No SQLite `CHECK` constraint on `prompts.flow`** [`schema.ts:92`] — `flow TEXT PRIMARY KEY` accepts arbitrary strings; app-layer `PROMPT_FLOWS.includes()` guard is the only enforcement. Add `CHECK(flow IN ('analysis','cover_letter','resume'))` in a future migration if belt-and-suspenders DB integrity is desired.
- **UI system-prompt visibility based on current value, not flow type** [`prompts.tsx:92`] — `{prompt.systemPrompt !== null && ...}` shows the system-prompt field only when the current stored value is non-null. If `analysis` somehow gets a non-null DB value via direct API, the UI renders an uneffective textarea with no warning.
- **`MOCK_JOB` incomplete in service tests** [`cover-letter-service.test.ts:28-40`, `resume-service.test.ts:37-46`] — `resumeGeneratedAt` and `latestStatus` fields are missing from the typed `Job` mock objects. Covered by `as` cast so TypeScript won't flag the drift as the type evolves.

## Deferred from: code review of 13-7-resume-pdf-persistence-and-drawer-preview (2026-04-15)

- `api-jobs.ts`: `Content-Disposition` filename not RFC 6266 compliant — `;` and `0x7F` pass through sanitizer. Pre-existing pattern throughout file.
- `JobDrawer.tsx`: iframe renders blank if PDF is absent after a swallowed write error — deliberate design per spec (failure is non-fatal).
- `JobDrawer.tsx`: iframe + `<a download>` both fire `GET /:id/resume` on same render, doubling disk reads. Low impact.
- `useGenerateResume.ts`: No user feedback (toast/error) on mutation success/failure. Pre-existing behavior, out of story scope.
- `useGenerateResume.ts`: Object URL 40 s timeout + nav-away leak. Explicit design rationale in code comment.
- `api-jobs.ts`: `process.cwd()` path resolution unreliable in non-standard deploy configs (systemd, Docker WORKDIR). Intentional per spec; add `DATA_DIR` env var in future hardening pass.
- `api-jobs.ts`: Profile row re-queried on every `GET /:id/resume` request for filename only. Cosmetic perf concern.
- `api-jobs.ts`: `resumeGeneratedAt` durability — no fsync before DB update; drawer could show stale state after a process crash. Inherent OS page-cache limitation.
- `api-jobs.ts`: Orphaned PDF on disk when a job is deleted and re-ingested with a new id. No delete feature exists yet.
- `schema.ts`: `analysisStatus` stored as raw TEXT with no SQLite CHECK constraint — values from the analysis service bypass Zod validation. Pre-existing from earlier story.
- `schema.ts`: `uniqueIndex` on `(company, job_title)` not updated to include `externalJobId` as the canonical deduplication key. Pre-existing; `externalJobId` is nullable.
- `_journal.json`: idx 11 (`0011_wise_doctor_doom`) was added to the journal as part of this story commit — cross-story dependency, informational.

## Deferred from: code review of 17-1-config-view-and-nav-reorganization (2026-04-18)

- `router.ts`: `configRoute` loader uses `Promise.all` with no error boundary — if any prefetch throws, the Config page goes blank with no recovery UI. Pre-existing pattern; other routes also lack `errorComponent`.
- `config.tsx` `SearchConfigCard`: delete button not disabled while `deleteMutation.isPending` — concurrent rapid clicks can fire multiple DELETE requests. Story 18-1 scope.
- `config.tsx` `SearchConfigCard`: no error state rendered on failed add or delete mutations — user sees nothing on 400/404. Story 18-1 scope.
- `hooks/useSearchConfigsQuery.ts`: `fetchSearchConfigs` uses raw `as SearchConfig[]` cast instead of Zod `.parse()` — malformed API response silently becomes wrong type. Story 18-1 scope.
- `config.tsx` `SearchConfigCard` delete button: missing `aria-label` — renders only `✕` with no accessible name. Story 18-1 scope.

## Deferred from: code review of 19-1-automation-progress-streaming (2026-04-19)

- `runDiscovery` silently discards per-source fetch errors — `.catch()` returns `{source, results:[]}` with no progress message or counter; user sees "Inserting 0 jobs…" or nothing with no indication a scraper call failed [`discovery-service.ts`]
- No client-side stream timeout — `isPending` can hang indefinitely if the server becomes unresponsive after sending HTTP 200 headers; no AbortSignal timeout or Promise.race escape [`useWebhookStream.ts`]
- `recordRun` throw inside stream callback — if `recordRun` throws (e.g. DB not initialized), the stream callback exits; client hits "Stream ended unexpectedly" with no useful message [`api-webhooks.ts`]

## Deferred from: code review of edit-existing-searches (2026-04-18)

- `api-search-configs.ts` `GET /`: handler is synchronous (`.all()` without `async/await`). Works with better-sqlite3 but will silently break if migrated to an async Turso/libsql driver. Make the handler `async` and `await` the query.
- `SearchConfigCard`: no optimistic update — each save/delete triggers a full refetch, causing a brief table flicker. Acceptable for a local single-user tool but worth addressing if latency becomes noticeable.
- Race condition: if `PUT /:id` is in-flight and another tab deletes the same row, the PUT returns 404 and the client shows "Save failed: Not found" with no context. Acceptable for single-user local app.

## Deferred from: code review of 20-1-pipeline-run-metrics (2026-04-20)

- Pricing constants hardcoded with no runtime binding to the model actually called — `api-jobs.ts` uses Sonnet 4.6 prices, `api-webhooks.ts` uses Opus 4.7 prices; if the underlying service changes models the cost figures will be silently wrong.
- `durationMs` timing inconsistent — success path measures after DB insert (inflating duration by ~1ms), error path measures before; negligible in practice.
- Token test "failed jobs contribute 0" is insertion-order-dependent — mock call count ties to job processing order; low risk with SQLite's stable ordering.
- `recordRun` is fire-and-forget with internal try/catch — a DB failure silently drops the metrics row; pre-existing pattern.
- `durationMs` schema column is nullable (`integer('duration_ms')`) but AC1 requires non-null for every run — all call sites populate it, so gap is schema-only.
- Cell renderers in `history.tsx` mix plain string and JSX return types — cosmetic inconsistency with pre-existing columns.
- ANTHROPIC_API_KEY not-configured error matched by exact string literal in `api-jobs.ts` — brittle if message ever changes; pre-existing pattern.

## Deferred from: code review of 21-1-dashboard-redesign (2026-04-20)

- `LabelInsideRight` displays raw unformatted float values for cost breakdown bar labels in Q04 — spec does not require formatted labels in bar charts; visual polish only.
- Double iteration over `runRows` in `api-stats.ts` Automation section (separate loops for `autoDailyMap` and `costMap`) — minor performance, not a correctness issue; could be merged into one pass.

## Source Breakdown chart hidden when perDay is empty
The Source Breakdown ChartCard in the Jobs quadrant is wrapped in `if (data.jobs.perDay.length > 0)` (same guard as the perDay area chart above it). If `bySource` has data but `perDay` is empty, the breakdown chart is incorrectly hidden. The Status and Cost Breakdown charts don't have this guard. Consider rendering Source Breakdown independently of the perDay guard.


## Deferred from: code review of 23-1-cover-letter-pdf-generation (2026-04-21)

- Concurrent cover letter generation for the same job races on `${rawId}.pdf.tmp` — two simultaneous POST `/:id/generate-cover-letter` requests write to the same fixed temp path; second `renameSync` wins, DB gets two rows but one PDF. Pre-existing pattern shared with resume generation [`api-jobs.ts`].
- `inserted` query matches by `createdAt: now` timestamp — two concurrent generations completing within the same millisecond could match the wrong row or null. Pre-existing pattern across all generation routes [`api-jobs.ts`].

## Deferred from: pagination added to Jobs/Matches/Applications/Logs views (2026-04-24)

- **Shift-select breaks across page boundaries** [`PipelineTable.tsx`] — `lastSelectedIndexRef` stores a row index relative to the current page only. Shift-clicking from page 1 into page 2 maps the old index onto new-page rows, silently selecting incorrect jobs. Fix requires clearing `lastSelectedIndexRef` on page navigation or scoping shift-select to single-page ranges.
- **Page index not reset when data changes** [`PipelineTable.tsx`, `TrackerTable.tsx`] — If the job list shrinks (e.g. after a bulk archive empties the current page), the TanStack Table internal page index is not reset. The user lands on an empty page and must manually navigate back. Add a `useEffect` that calls `table.setPageIndex(0)` when the data length changes.
- **Arrow button `←`/`→` missing `aria-label`** [`PipelineTable.tsx`, `TrackerTable.tsx`, `history.tsx`] — Screen readers announce bare Unicode arrows with no page-navigation semantics. Pre-existing in `MessagesTable.tsx`. Add `aria-label="Previous page"` / `aria-label="Next page"` in a future accessibility pass.

## Deferred from: PipelineTable truncation for Company/Job Title/Location (2026-04-24)

- **Hardcoded `max-w-[Xpx]` values don't scale with column density** [`PipelineTable.tsx`] — When only a few columns are visible (e.g., Archive with 7 fixed columns), available width per column is much larger than the 200–280 px caps. Widths are appropriate for a dense 10-column layout but may truncate unnecessarily when columns are sparse. Consider `max-w-full` with a percentage-based cap, or remove caps entirely on layouts with few columns.
- **`title` tooltip missing on Notes (`roleFit`) cell** [`PipelineTable.tsx`] — The existing Notes column uses the same `max-w-[200px] truncate block` pattern but lacks a `title` attribute, unlike Company/Job Title/Location which had it added in this change. Add `title={v}` to the Notes cell for consistency.

## Deferred from: code review of 22-1-add-job-by-url (2026-04-21)

- `detectSource` in `api-jobs.ts` maps all `*.indeed.com` subdomains (ca, uk, de, etc.) to the `indeed` scraper. Country-specific Indeed domains have different page structures; the wrong scraper will silently return null fields → 422 → manual form. Acceptable for now given graceful-degradation path, but should add supported-domain list if coverage expands.
- `POST /scrape/job-details` in `scraper/src/routes/scrape.js` does not catch errors thrown by `fetchers[source](url)` — scrapeWithRetry exhausting all retries propagates as an unhandled exception, returning a generic Fastify 500 with no structured error. Pre-existing pattern in scraper codebase.
- `AUTH_DIR`/`AUTH_PATH` in `scraper/src/scrapers/linkedin.js` — `fetchLinkedInJobDetails` inherits the same module-level path resolution. If `AUTH_DIR` env var is missing, the path resolves unexpectedly. Pre-existing issue in the scraper.
- `page.evaluate` in scrapers (linkedin.js, indeed.js, indeed_nl.js) uses `innerText` (layout-dependent, returns empty string for hidden elements) rather than `textContent`. Pre-existing pattern throughout scraper codebase.

## Deferred from: skip archived jobs in analysis flow (2026-04-24)

- **Race: archive between query and analysis start** — A job could be archived by the user between the `pendingJobs` SELECT and the `db.update({ analysisStatus: 'analyzing' })` mark. The job would be analyzed even though the user archived it in that window. Pre-existing; not introduced by this change.
- **Race: concurrent archive during in-flight analysis** — If a user archives a job while it is in `analyzing` state, the final `db.update({ analysisStatus: 'done', ... })` write still succeeds unconditionally. The job stays archived (the write doesn't clear `archived`), but tokens were still spent. Pre-existing.

## Deferred from: code review of 24-2-auth-api-routes-registration-activation-login-logout-and-password-reset (2026-04-28)

- Timing oracle: `eq(users.activationToken, token)` and `eq(users.resetToken, token)` use SQL equality, not constant-time comparison. 256-bit token space makes practical exploitation infeasible; deferred indefinitely.
- reset-request repeated admin calls cycle reset tokens with no idempotency guard — admin can invalidate previously-delivered reset links. Admin-only endpoint; low practical risk.
- sendMail creates a new nodemailer transport per invocation — no SMTP connection pooling or startup TLS verification. Low call volume at MVP scale; address in deployment hardening pass (epic 27).
- No rate limiting on /register, /login, /activate, /reset — brute-force protection requires infrastructure-level rate limiting. Address when adding auth middleware layer in future stories.
- Token expiry uses ISO-8601 string comparison (`gte(col, now)`) — correct only when all timestamps use `toISOString()`. Theoretical fragility; all app timestamps currently use `toISOString()`.
- inviteKeys table has no expiry column — invite keys valid indefinitely; a leaked key is permanently usable. Enhancement; consider adding `expires_at` and `created_at` in a future invite management story.
- users table has no updatedAt / last-login audit columns — no forensic trail for credential changes. Enhancement; out of scope for story 24.2.
- userSecrets table has no ON DELETE CASCADE — orphaned secrets rows if a user is deleted. Table unused in story 24.2 routes; address when user deletion flow is implemented.
- Activation/reset tokens in URL query params — appear in server logs and browser history. Standard MVP pattern; mitigated by short TTLs (48h activation, 1h reset).
- Register invite-key race condition in multi-worker deployment — `isNull(usedAt)` check not atomic with `usedAt` update under multi-threaded workers. Benign on single-threaded Bun; UNIQUE constraint on `invite_keys.key` provides the real atomic guard. Revisit if app is clustered.
- reset-request: resetToken write (`db.update(users)`) and session delete (`db.delete(sessions)`) are not in a single transaction. No actual race window in single-threaded Bun with synchronous DB calls; wrap in transaction in a future hardening pass.
- No session count cap per user — each login and activation appends a session row with no cap or GC job. MVP scale (~10 users) makes this a non-issue; add session cleanup job before production scale.

## Deferred from: code review of 18-1-search-config-ui (2026-04-27)

- **No authentication on `/api/search-configs` endpoints** — Pre-existing single-user localhost design; Epic 24 tracks auth layer. Not introduced by this story.
- **GET returns disabled rows with no UI toggle** — `enabled` column reserved for future use per dev notes; all current rows are enabled by default. No action needed until a toggle UI is introduced.
- **No max-length constraints on `query` or `location` fields** — Low risk for single-user tool; harden with `.max()` constraints before multi-user launch.
- **`Promise.all` over scraper calls — one failure aborts entire discovery run** — Pre-existing behavior from before this story; `Promise.allSettled` would be safer but is not a regression here.
- **No uniqueness constraint on `(source, query, location)`** — Rapid double-click or concurrent sessions can insert duplicate configs. Minor for single-user; add a UNIQUE index if duplicate scraper calls become a problem.
- **Migration seed data hard-codes personal search terms** — Required by AC-2 for behavior-unchanged first boot. Will need a strategy when multi-user is introduced (each user should get their own defaults, not shared seeds).
- **Edit button clickable while `addMutation.isPending`** — Low UX impact; concurrent add + edit state is possible but resolves cleanly via invalidation.
- **Error messages (save/delete) may be off-screen when table is long** — UX polish; move error rendering to a fixed-position toast or above the table header in a future accessibility pass.

## Deferred from: code review of 24-4-auth-ui-landing-page-registration-check-email-and-login (2026-04-29)

- `apiFetch` drops CSRF header when `csrf_token` cookie is absent — server correctly rejects; task spec says "add header if cookie exists"; intentional behavior. No action unless CSRF silent-skip causes user confusion in practice.
- `useSessionQuery` hook exported but never called — `fetchSession` is used directly by the router; dead export, not a bug. Remove or use when components need to read session state reactively.
- `GET /session` executes two separate DB queries (session lookup, then user lookup) — minor TOCTOU; race resolves safely to 401; consider collapsing into a single JOIN when doing an auth-route hardening pass.
- Network-outage redirect loop — `protectedRoute` error redirects to `/login`; `loginRoute` `beforeLoad` `fetch` may also fail on the same outage, surfacing an error screen instead of the login form. Address when adding robust error boundaries to auth routes.
- CSRF timing-safe comparison missing in `auth-middleware.ts` — plain string equality is used for CSRF token comparison; vulnerable to timing oracle; `timingSafeEqual` from `node:crypto` would close this. Pre-existing from story 24.3; `auth-middleware.ts` is out of scope until a dedicated security hardening pass.
- `APP_URL` undefined → broken activation/reset email links — `process.env.APP_URL` has no startup validation; missing value produces relative-path links that don't work in email clients. Pre-existing across all auth handlers; address in Epic 27 deployment configuration.
- Invite key field shows raw server error string — AC10 doesn't specify text for invite key errors; the email-field error is localized to "Email already in use — sign in instead" but the invite-key error displays the raw server message. UX improvement only; address in a future polish pass.

## Deferred from: code review of 24-3-per-user-data-isolation-migration-auth-middleware-and-query-scoping (2026-04-29)

- **`webhookRuns` table has no `userId` column** — all users see shared pipeline run history in the stats view; webhook_runs user_id scoping was explicitly excluded from story 24.3 scope per spec. Address in a future story within Epic 24 or 26.
- **`profile` table is not multi-tenant** — `analysis-service` fetches a single shared profile row (`limit(1)`) for all users' job analyses. Profile isolation is deferred to Epic 25 onboarding stories where per-user profile setup will be implemented.

## Deferred from: code review of 25-2-onboarding-ui-4-step-setup-flow (2026-04-30)

- **CSRF token absent mid-flow causes confusing 403** — `apiFetch` silently skips the `x-csrf-token` header when the CSRF cookie is absent; the server rejects the PUT with 403 and it surfaces to the user as a generic test failure message. Pre-existing `apiFetch`/`authMiddleware` behavior; not introduced by this story.
- **Session expiry during connection test treated as "server unreachable"** — A 401 from `apiFetch` on `PUT /api/onboarding/anthropic` or `PUT /api/onboarding/imap` falls into the catch handler and shows "Could not reach the server" rather than redirecting to `/login`. Pre-existing pattern across all mutating routes in the codebase.
- **Previously saved Anthropic key not pre-populated on re-entry** — If a user saves a key, logs out, and logs back in (with `onboardingComplete: false` for any reason), the API key input renders empty even though the key exists on the server. The user must re-enter a valid key to proceed. Out of scope for this story's spec.

## Deferred from: code review of 25-1-onboarding-api-status-anthropic-api-key-and-imap-setup (2026-04-30)

- **Dangling `setTimeout` after IMAP `connect()` resolves** — `timeoutPromise` timer is never cleared when `connect()` wins the race; fires 10s later and rejects a settled promise. Spec-prescribed pattern from dev notes; low practical impact, keeps event loop alive briefly longer than needed. [`api-onboarding.ts`]
- **IMAP TCP connection left open after timeout race** — When the 10s timeout fires while `connect()` is still in-flight, `Promise.race` returns early but the `connect()` promise keeps running in the background; ImapFlow may open a connection with no one to close it. Fix uncertain (ImapFlow has no `destroy()` API); practical impact low (connections time out on their own). [`api-onboarding.ts`]
- **`hasImap` omits `imap_port` from presence check** — `imap_port` is always stored by `PUT /imap` but not checked in `GET /status`; a manually-injected row missing `imap_port` reports `hasImap: true`. `POST /sync` defaults to 993 when absent, so no crash. [`api-onboarding.ts:20`]
- **IMAP `onConflictDoUpdate` loop not wrapped in a transaction** — Four separate upserts for imap_host/port/user/pass run sequentially; a process crash mid-loop leaves partial credentials. Common pattern in codebase; rare failure path. [`api-onboarding.ts:135-142`]
- **SSRF via user-supplied IMAP `host` field** — Any non-empty string passes Zod validation and triggers a TCP connect; authenticated users can probe internal IPs/hostnames. Trusted-user design decision; same pattern as `email-fetch-service.ts`. [`api-onboarding.ts:95`]
- **Raw `fetchAndStoreEmails` error message exposed in 502 response** — `err instanceof Error ? err.message : 'Email sync failed'` sends internal library error details to the client. Pre-existing pattern from prior story. [`api-messages.ts:62`]
- **`console.error` call not asserted in AC #12 test** — Test verifies the 500 response but does not spy on `console.error` to confirm logging. Test coverage gap only; code is correct. [`api-messages.test.ts`]
- **No Anthropic API key format validation before outbound call** — Any non-empty string triggers a live fetch to `api.anthropic.com`; spec design choice with no format-validation requirement. [`api-onboarding.ts:38`]

## Deferred from: code review of 26-2-admin-ui-user-table-inline-actions-and-impersonation-banner (2026-05-01)

- Session race after impersonation — brief window where banner isn't visible before session query settles post-navigate; acceptable UX transient [`useImpersonateMutation.ts:12-13`]
- All switches disabled while one `patchMutation` is in-flight — single shared mutation instance disables every row; UX annoyance; Switch correctly prevents double-submit [`admin-users.tsx`]
- Deactivating impersonated user leaves banner stale for up to 5 min — target's sessions deleted but admin's session isn't re-validated; `useSessionQuery` staleTime is 5 min [`useSessionQuery.ts:14`]
- Impersonating deleted user causes silent banner disappear — server silently drops `impersonating` field when target not found; session `data` not cleaned up [`api-auth.ts:246-249`]
- Reset PW always shows "Reset email sent" for non-existent email — intentional server-side enumeration prevention; admin always sees success toast [`api-auth.ts:310`]
- Route loader throws raw TanStack Router error boundary — pre-existing pattern across all routes; no `errorComponent` configured [`router.ts:179`]
- `dialog.tsx` Tailwind CSS variable classes — `bg-background`, `ring-offset-background` etc. require CSS variable definitions in project global CSS; verify when other shadcn components are confirmed working [`dialog.tsx`]
- Exit mutation doesn't invalidate `['admin-users']` query — user table may be slightly stale after returning from impersonation [`useImpersonateExitMutation.ts:11`]

## Deferred from: code review of 26-1-admin-api-user-list-update-password-reset-and-impersonation (2026-04-30)

- **Stale impersonation session references deleted or deactivated user** — `auth-middleware.ts` sets `effectiveUserId` from `session.data.impersonating` without re-validating that the target user still exists and is active. A stale impersonation session (target deleted or deactivated after impersonation started) scopes all subsequent requests to a nonexistent or suspended user, producing silent empty responses. Requires design decision: invalidate impersonation, fall back to real userId, or return 401. [`src/server/middleware/auth-middleware.ts`]
- **PATCH deactivation does not clear impersonation sessions targeting the deactivated user** — `db.delete(sessions).where(eq(sessions.userId, id))` removes sessions the target user owns, but not sessions belonging to admins that have `data.impersonating = id`. An admin mid-impersonation of a user who then gets deactivated continues operating as that user until they exit manually. [`src/server/routes/api-admin.ts:62`]
- **`auth-middleware` uses `db.select()` without column restriction on sessions table** — Pre-existing pattern; not introduced by this story. `sessions.data` is required for impersonation parsing so the full select is functionally correct. Address in a future security hardening pass. [`src/server/middleware/auth-middleware.ts`]

## Deferred from: code review of admin-delete-user (2026-05-05)

- **Invite key becomes reusable after user delete** — nulling `usedByUserId` makes `status: 'unused'` since the field is the sole status discriminant; the `usedAt` value is preserved. Spec explicitly mandates this for audit trail; registration flow may accept the nulled key. Consider also nulling `usedAt` or adding a separate `invalidated` flag if key recycling is undesired. [`api-admin.ts`]
- **Stale impersonation session when impersonation target is deleted** — if admin A is impersonating user B and admin C deletes user B, admin A's session retains `{ impersonating: B }`. Auth middleware will silently return empty data for user B until admin A exits impersonation. Pre-existing design gap in the impersonation architecture. [`auth-middleware.ts`]
- **statusEvents deletion uses in-app job ID fetch** — `tx.select({ id: jobs.id }).from(jobs)...all().map()` fetches job IDs into application memory before deleting statusEvents. For users with very large job counts this round-trips unnecessarily; a SQL subquery would be more efficient. Optimization only; not a correctness issue. [`api-admin.ts`]

## Deferred from: code review of 26-3-admin-invite-key-management (2026-05-05)

- `copiedKeyId` not cleared when key is revoked — cosmetic race: copied checkmark state persists up to 1500ms after row disappears; auto-increment prevents id reuse so no real UI corruption [`admin-users.tsx`]
- Double-click "Generate Key" may fire two POST requests before `isPending` re-renders — `disabled={isPending}` is the standard pattern; React 18 automatic batching mitigates most scenarios [`admin-users.tsx`]
- Stale session role check in `beforeLoad` — pre-existing pattern, `queryClient.getQueryData(['session'])` reads cached value; server middleware is the authoritative guard [`router.ts`]
- Dialog state cleared before query refetch completes — cosmetic ~200ms flicker where revoked key remains visible after dialog closes; inherent to refetch-on-invalidation pattern [`admin-users.tsx`]
- CSRF expiry causes generic error toast with no session-expiry hint — pre-existing `apiFetch` behavior across all mutations; user gets no "please refresh" guidance
- No `staleTime` on `useInviteKeysQuery` — causes unnecessary background refetches on window focus; `staleTime: 30_000` would match other queries in the app [`useInviteKeysQuery.ts`]
- No test covers route loader failure path for `fetchInviteKeys` — if invite-keys fetch throws inside `Promise.all`, only manual testing catches it [`api-admin.test.ts`]
- AC11: New key appears after refetch latency, not immediately on POST response — optimistic prepend not implemented; refetch-on-invalidation is acceptable for an admin UI
- AC5: Generate Key button `size="sm"` + explicit `h-7 px-3 text-xs` class overrides may conflict in shadcn depending on `cn()` merge order — verify visually at runtime [`admin-users.tsx`]
- `insertInviteKey` test helper produces 15-char key for `id ≥ 10000` — `padStart(4, '0')` overflows; unrealistic in test setup but worth noting if large id fixtures are ever added [`api-admin.test.ts`]

## Deferred from: code review of 31-3-firefox-browser-pool-2-instances (2026-05-12)

- **`getFirefoxPage` crashes if called before `initPool`** — Pre-existing; old single-instance code threw identically (`null.newContext()`). Guard with an early throw or startup ordering guarantee. [`pool.js`]
- **Partial Firefox pool init leaves Chromium browser processes leaked** — Theoretical; `Promise.all` over both pools means a single Firefox launch failure abandons already-launched Chromium instances with no cleanup. Pre-existing design gap (no try/catch around `initPool`). [`pool.js:initPool`]
- **`storageStatePath` concurrent write race across 2 Firefox instances** — Theoretical given LinkedIn PQueue (concurrency:1, 7s interval) which serializes all LinkedIn callers. Would become real if concurrency ever increases. [`pool.js:getFirefoxPage`]
- **Unbounded context accumulation per browser instance** — Pre-existing; each `getFirefoxPage` call creates a new context with no cap or eviction. Mirrors Chromium pool behavior. [`pool.js`]
- **`destroyPool` lacks robustness on crashed or double-called** — Pre-existing pattern in Chromium pool; empty `firefoxBrowsers` spreads safely (no-op), but a crashed browser instance in the array may throw on `b.close()`. [`pool.js:destroyPool`]
- **`initPool` double-initialization leaks browser processes** — Pre-existing; no guard against re-entrant calls. Leaked processes from prior run never get closed. [`pool.js:initPool`]
- **`USER_AGENTS` array not applied to Firefox contexts** — Pre-existing; `getFirefoxPage` sets no `userAgent`, so Firefox contexts use Playwright's default UA. Untouched by this story. [`pool.js:getFirefoxPage`]
- **Firefox launched without `--no-sandbox` / sandbox hardening flags** — Pre-existing; Chromium uses `['--no-sandbox', '--disable-dev-shm-usage']` but Firefox has no equivalent. May matter in containerized environments. [`pool.js:initPool`]
- **`FIREFOX_POOL_SIZE` not env-configurable** — Out of scope for this story; hardcoded constant requires a code change to resize the pool. [`pool.js`]
- **`storageState` persistence not atomic in `withFirefoxPage`** — Pre-existing in base.js; if `fn(page)` throws mid-session, mutated cookies are discarded and the retry restarts from stale state. [`base.js:withFirefoxPage`]

## Deferred from: code review of 36-1-arc-listing-description-scraper (2026-05-12)

- **Empty string returned when Arc SPA skeleton renders before hydration** — `waitForSelector` succeeds on an empty container before React populates `innerText`; `?? ''` returns silently, analysis proceeds with no description. Fix would be a `waitForFunction` checking `innerText.length > 0`. Pre-existing pattern across all scrapers. [`arc.js:fetchArcListing`]
- **Retry after `waitForSelector` timeout holds Firefox pool slot for up to 100 s** — `scrapeWithRetry` retries the full `withFirefoxPage` lambda; with `retries=1` and combined 50 s timeout per attempt, the arc queue (concurrency 1) can be blocked for ~100 s on a failed scrape. Cleanup is handled correctly via `finally`. Pre-existing design trade-off. [`arc.js:fetchArcListing`, `base.js:scrapeWithRetry`]

## Indeed scraper — all card selectors miss → silent company=null drop (2026-05-13)
If none of `.job_seen_beacon`, `td.resultContent` match, card=null → company=null → job silently dropped by discovery-service filter. Pre-existing behavior; the two-way fallback is already an improvement. Future work: add a warning log when card is null so it's visible in server logs.

## Deferred from: code review of 35-1-config-layout-shell-router-restructure-overview (2026-05-18)
- **Stub section routes have no loaders** — `/config/profile`, `/config/job-sources`, `/config/prompts`, `/config/logs` are scaffolding stubs; loaders will be added story-by-story as sections are implemented (35.2–35.6). [`router.ts`]
- **No redirect from removed `/logs` → `/config/logs`** — URL reorganization is intentional; any existing bookmarks to `/logs` will 404. No redirect specified in story scope. [`router.ts`]
- **Tile status badges flash "Incomplete" on stale-cache re-fetch** — `staleTime: 0` on `useOnboardingStatusQuery` causes a background re-fetch on every mount; before it resolves, tiles briefly show "Incomplete". Pre-existing hook behavior. [`overview.tsx`, `useOnboardingStatusQuery.ts`]
- **`res.json()` cast is unsound** — `res.json() as Promise<OnboardingStatusResponse>` provides no runtime type safety; malformed API responses pass through silently. Pre-existing pattern throughout the codebase. [`useOnboardingStatusQuery.ts`]
- **`profile.name` whitespace-only treated as configured** — `!!profile?.name` is truthy for `" "`; no `.trim()` guard. Extremely edge case; form validation on profile save should prevent whitespace-only names. [`overview.tsx`]

## Deferred from: code review of 35-2-profile-section-overview-and-resume-subpage (2026-05-18)

- **No unsaved-changes guard when navigating away mid-edit** — `ProfileResumeRoute` holds `isEditing` + `draft` in local state with no `beforeUnload` or router navigation guard; unsaved edits are silently lost when the user clicks the sidebar or top nav. Pre-existing pattern from `profile.tsx`. [`profile-resume.tsx`]

## Deferred from: code review of 35-4-job-sources-section-overview-auth-setup-and-searches (2026-05-18)

- **Second session can start if modal closes while session is running** — button is only gated on `modalOpen`; if user dismisses modal via ESC/backdrop while session is active, button re-enables and `startSession()` can be called again. Pre-existing from `ConnectionsCard`. [`job-sources-auth-setup.tsx:29-31, 49`]
- **`handleModalClose` doesn't call `sendCancel`** — closing the modal via the X or ESC leaves the underlying browser session running on the server. Pre-existing from `ConnectionsCard`. [`job-sources-auth-setup.tsx:36-38`]
- **`source` state diverges from `addableSources`** — select rendered value is corrected on screen but internal `source` state is not synced; submit fires with the initialised `'linkedin'` value if it's not in `addableSources`. Pre-existing from `SearchConfigCard`. [`job-sources-searches.tsx:32, 103`]
- **`deleteMutation.reset()` not called before new deletes** — if a delete fails, the error banner persists for subsequent delete attempts. Pre-existing from `SearchConfigCard`. [`job-sources-searches.tsx`]
- **Edit select allows submitting original source even when disabled** — rows created with a now-disabled source show it as selectable in inline edit with "(disabled)" label; saving will likely fail server-side. Pre-existing from `SearchConfigCard`. [`job-sources-searches.tsx:180`]
- **`[...configs].sort()` creates new array every render** — breaks row memoisation for large config lists; sort comparator also type-assumes string for all columns. Pre-existing from `SearchConfigCard`. [`job-sources-searches.tsx:88-91`]
- **`Promise.all` in route loaders swallows individual query errors** — a single failing query aborts the entire loader; project-wide pattern across all config routes. [`router.ts:212-215, 229-232`]
- **Raw `<table>` wraps ShadCN `TableHeader`/`TableBody` without `<Table>` root** — missing the ShadCN `Table` scroll container; can cause layout issues on narrow viewports. Pre-existing from `SearchConfigCard`. [`job-sources-searches.tsx:153`]

## Deferred from: code review of 35-6-logs-section-config-logs (2026-05-18)

- **`parseName` silently produces empty Detail for unrecognized workflow names** — any workflow type not prefixed with "Cover Letter - " or "Resume - " renders a dash in the Detail column with no indication of data loss. Pre-existing from `history.tsx`. [`logs.tsx:26-29`]
- **`sourceBreakdown` values assumed to be numbers without validation** — `Object.entries(breakdown).filter(([, count]) => count >= 1)` silently coerces non-numeric values. Pre-existing from `history.tsx`. [`logs.tsx:59`]
- **`queryKey: ['webhook-runs']` duplicated in loader and hook** — if the key is renamed in the hook, the loader silently pre-fetches into a different cache bucket. Systemic project pattern. [`router.ts:271`, `useWebhookRunsQuery.ts:7`]
- **`onSortingChange` calls `table.setPageIndex(0)` before `setSorting`** — may trigger two renders in edge cases. Pre-existing from `history.tsx`. [`logs.tsx:130-133`]
- **`getFilteredRowModel()` used for total row count when no filter configured** — semantically impure; `getRowCount()` would be correct. Pre-existing from `history.tsx`. [`logs.tsx:136`]
- **Raw `<table>` wraps shadcn `TableHeader`/`TableBody` without `<Table>` root** — missing the shadcn scroll container; consistent with `job-sources-searches.tsx` pattern. Pre-existing from `history.tsx`. [`logs.tsx:160`]
- **Invalid `runAt` string renders "Invalid Date"** — no `isNaN` guard on `new Date(info.getValue()).toLocaleString()`. Pre-existing from `history.tsx`. [`logs.tsx:35`]
- **Route loader throw renders blank screen** — `configLogsRoute` loader has no `.catch()` and no `errorComponent`; `isError` branch in component never reached if loader throws. Systemic pattern. [`router.ts:268-272`]
- **Double fetch on navigation — no `staleTime` on `ensureQueryData`** — every navigation triggers a loader fetch + component mount refetch. Systemic across all config route loaders. [`router.ts:271`]

## Deferred from: code review of 38-1-rename-config-section-labels (2026-05-21)

- **Dashboard WORKFLOW_KEYS use old terminology** — `'Analysis'`, `'Cover Letter'`, `'Resume'` column headers and chart labels in `dashboard.tsx` are data-coupled to server-stored workflow names; renaming requires a coordinated server+client+DB change. [`dashboard.tsx`]
- **Pipeline alert labels hardcode `'Analysis'`** — "Analysis complete" / "Analysis failed" toasts in `index.tsx` still use the pre-rename term; vocabulary gap with the now-renamed config UI. [`index.tsx`]

## Deferred from: code review of 40-1-spike-validate-xenova-transformers-under-bun (2026-05-27)

- `onnxruntime-web@1.14.0` is a transitive dep of `@xenova/transformers@2.17.2`; this vintage has known CVEs in the ONNX runtime C++ layer. Not addressable without a newer `@xenova/transformers` release that bumps its ort dependency. Revisit when implementing story 40.3A. [`job-hunt-dashboard/bun.lock`]
- Docker image strategy for `@xenova/transformers` not yet defined — model cache path, image sizing, and `.dockerignore` handling for the `spike/` directory should all be addressed when implementing story 40.3A. [`job-hunt-dashboard/Dockerfile`]

## Deferred from: code review of 39-1-add-job-form-and-api-accept-optional-job-description (2026-05-26)

- **No maxLength on description field** — `z.string().min(1).optional()` has no upper bound; unbounded text can be stored in the `jobDescription` TEXT column. No spec requirement for a limit; worth adding a reasonable cap (e.g. 50,000 chars) before shipping. [`api-jobs.ts:191`, `AddJobDrawer.tsx`]
- **`analysisStatus: 'pending'` on description-only jobs with no scraper trigger** — jobs created with description but no URL are set to `pending` but the current analysis service has no path to progress them without a URL. Story 39.2 will fix this by using the pre-stored description and skipping the scraper. [`api-jobs.ts`]
- **Duplicate check won't catch description-only dupes** — deduplication keys on `sourceUrl`; two identical manual pastes with no URL produce two separate rows silently. Pre-existing limitation. [`api-jobs.ts`]
- **`company`/`jobTitle` not trimmed in duplicate-check WHERE clause** — leading/trailing whitespace produces a miss against an existing row. Pre-existing from original manual-add implementation. [`api-jobs.ts`]


## Deferred from: code review of 40-4-discovery-pipeline-integration-score-jobs-at-insert-time (2026-05-29)

- **`onConflictDoNothing` + novel `externalJobId` → scoring UPDATE targets non-existent row** — if a job has a new `externalJobId` but conflicts on `(company, jobTitle, userId)`, the insert is skipped but the job is in `newJobs`; the scoring `UPDATE WHERE externalJobId = job.id` silently matches zero rows. Pre-existing dedup logic edge case. [`discovery-service.ts`]
- **`NaN` from zero-vector embedding could be written to `relevance_score`** — if `cosineSimilarity` returns `NaN` (degenerate embedding, no zero-guard), it is stored directly; per-job catch only fires on thrown errors. Embedding service responsibility. [`discovery-service.ts`]
- **Whitespace-only job title silently passed to `embed()`** — `ScraperResult.title: string` with a whitespace-only value is truthy, passes the `newJobs` filter, and gets embedded. Scraper output normalization concern. [`discovery-service.ts`]
- **`db.select().from(profile)...get()` is synchronous** — correct for Bun SQLite but breaks silently if driver is ever swapped to async (e.g. libsql/turso). [`discovery-service.ts`]
- **`VALID_LINKEDIN_CIPHERTEXT` inserted via template literal SQL in test setup** — pre-existing pattern; a quote in the ciphertext would produce malformed SQL. [`discovery-service.test.ts`]
