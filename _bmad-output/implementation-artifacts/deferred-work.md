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

## Deferred from: code review of 3-1-jobs-api-and-tanstack-query-hook (2026-04-01)

- Router loader (`src/client/lib/router.ts`) has no `errorComponent` — silent failure on load error — story 3-4 scope
- No `LIMIT` clause on `GET /api/jobs` (`src/server/routes/api-jobs.ts`) — full table scan — MVP design decision, revisit at scale
- No timeout / AbortController on `fetchJobs` (`src/client/hooks/useJobsQuery.ts`) — design decision
- `staleTime: 0` causes redundant re-fetch on every navigation to `/` — future optimization
- `api-sync.test.ts` error-handling tests (propagates OAuth error, propagates DB write error) failing on HEAD — Hono sub-apps tested in isolation don't inherit parent app's `onError` — pre-existing issue from story 2-3, not introduced by story 3-1
