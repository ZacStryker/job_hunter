# Deferred Work

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
