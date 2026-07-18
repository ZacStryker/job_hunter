---
title: 'Wire JSearch into discovery (searchConfigs → jobs → analysis)'
type: 'feature'
created: '2026-07-18'
status: 'done'
baseline_commit: '4160cf3'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-jsearch-job-search-provider.md'
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `JobSearchProvider` + JSearch implementation shipped and was coverage-validated (US/CA/NL/DE/FR strong; UK/IE/AU dead upstream; salary sparse), but nothing calls `getJobSearchProvider()`. It is dead code — no way to run a JSearch search, and results never reach the `jobs` table or the pipeline.

**Approach:** Wire JSearch in as a new **discovery source** inside `runDiscovery`. A `search_configs` row with `source:'jsearch'` triggers a provider call instead of a scraper HTTP round-trip; the returned `JobInput[]` flows through the same dedup (`externalJobId`) → insert (`analysisStatus:'pending'`) → relevance-embed → `onJobsInserted` path the scrapers use. Geo uses new `country`/`city` columns on `search_configs`, because JSearch v2 needs structured ISO alpha-2 `country` + optional `city`, not the scrapers' free-text `location`. No new route, page, or trigger — the existing "Discovery Searches" config and "Discover" button gain JSearch.

## Boundaries & Constraints

**Always:**
- JSearch runs through `runDiscovery` as `source:'jsearch'`, reusing the existing dedup/insert/embed/stream machinery. Do NOT fork a second discovery path.
- Call the provider via `getJobSearchProvider('jsearch')`; it already returns canonical `JobInput[]`. Do NOT re-`fetch` RapidAPI or re-normalize.
- JSearch requires **no `SCRAPER_URL`**. A jsearch-only user must run discovery on an instance with no scraper.
- Missing `JSEARCH_API_KEY` (provider throws `JobSearchNotConfiguredError`) is a **per-source error pushed to `errors[]`**, like "LinkedIn not connected" — never a thrown run-killer; co-configured scrapers still complete.
- `country`/`city` are used only by `jsearch`; scraper sources keep reading `location`.
- Drop records with empty `company`/`jobTitle` before upsert (`jobs` uniqueness is `(company, jobTitle, userId)` — reuse the existing `!r.company || !r.title` filter).
- Preserve tenant isolation — every read/write scoped on `userId`.

**Ask First:**
- Renaming `SCRAPER_SOURCES`/`scraperSourceSchema` (referenced across schema, admin, DB_SOURCE, UI). Adding `'jsearch'` to it is in scope; renaming is a separate refactor — just comment that the name is now a slight misnomer.
- Auto-triggering analysis on JSearch inserts (out of scope — inserts stay `pending`, analyzed by the existing separate flow).

**Never:**
- No new API route, client route/page, or "search" surface. No SerpApi work. No per-user JSearch key / encryption.
- Do not build a country allow-list, but do not advertise UK/IE/AU coverage the spike disproved — an empty result set is a normal outcome, not an error.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| jsearch happy path | enabled `{source:'jsearch', query, country:'nl', city:'Amsterdam'}`, key set | `provider.search()`; new jobs inserted `source:'jsearch'`, `pending`, `externalJobId=job_id`; `onJobsInserted` streamed; relevance embedded |
| No scraper, jsearch only | `SCRAPER_URL` unset, one enabled jsearch config | Runs and inserts; no throw, no 503 |
| Mixed sources | jsearch + linkedin; `SCRAPER_URL` unset | jsearch inserts; linkedin pushes error to `errors[]`; run does not abort |
| Key missing | jsearch config, `JSEARCH_API_KEY` unset | `JobSearchNotConfiguredError` caught → per-source error; other sources unaffected |
| Empty / dedup | provider returns `[]`, or a `job_id` already exists for the user | No rows, not an error / skipped by `existingIds`+`seen`, no re-insert or re-embed |
| Junk / blacklist | normalized `company:''`/`jobTitle:''`, or blacklisted employer | Filtered out before insert |
| Config validation | `POST/PUT /api/search-configs` `{source:'jsearch'}` with no `country` | 400 — `country` required for jsearch (refine does not forbid `country` on other sources) |
| Tenant isolation | user B triggers discovery | Only B's configs run, only B's jobs written; A untouched |

</frozen-after-approval>

## Code Map

- `src/server/services/job-search/index.ts` -- `getJobSearchProvider('jsearch')`; exports `JobSearchNotConfiguredError`, `JobSearchQuery`.
- `src/server/services/discovery-service.ts` -- **primary edit.** `SCRAPER_URL` throw (~48); `processSearch` scraper branch (~176-288); dedup filter (~250); insert (~263-281); relevance-embed (~294-329).
- `src/server/routes/api-webhooks.ts:22-23` -- `POST /discovery` 503 gate on `SCRAPER_URL`.
- `src/shared/schemas.ts:308-330` -- `SCRAPER_SOURCES`, `searchConfig(Input)Schema`.
- `src/db/schema.ts:135-144` -- `search_configs` table.
- `src/server/routes/api-search-configs.ts:28,49` -- POST/PUT persistence.
- `src/client/routes/config/sources-searches.tsx` -- add-form + inline edit row.
- `src/client/hooks/useSearchConfigMutations.ts`, `useSearchConfigsQuery.ts` -- payload types (schema-driven).
- `src/server/routes/api-admin.ts:299-320` -- reference: admin toggle already accepts any `scraperSourceSchema`, so jsearch becomes toggleable automatically.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/schemas.ts` -- add `'jsearch'` to `SCRAPER_SOURCES` (comment: name now a slight misnomer); add nullable `country`/`city` to `searchConfigSchema` + `searchConfigInputSchema`; `.superRefine` requiring non-empty `country` when `source==='jsearch'` (do not forbid it on other sources).
- [x] `src/db/schema.ts` -- add nullable `country`, `city` text columns to `searchConfigs`.
- [x] Migration -- run `bun run db:generate` (produces `0043_*.sql`); verify it only ADDs the two columns. Do NOT hand-write.
- [x] `src/server/routes/api-search-configs.ts` -- persist `country`/`city` in POST insert and PUT update.
- [x] `src/server/services/discovery-service.ts` -- (a) replace the top-level `SCRAPER_URL` throw with a soft split: proceed if any active search is jsearch; push a per-source error for scraper searches when `SCRAPER_URL` is absent instead of throwing. (b) In `processSearch`, branch on `source==='jsearch'`: call `getJobSearchProvider('jsearch').search({query, country: country ?? undefined, city: city ?? undefined})`, catch provider errors into `errors[]`, map `JobInput[]` to the internal dedup record `{id: externalJobId, title: jobTitle, company, location, url: sourceUrl, salary}`, run through the SAME dedup/insert/`onJobsInserted` path, and include `salary` in the jsearch insert. (c) Confirm the relevance-embed pass covers jsearch inserts unchanged.
- [x] `src/server/routes/api-webhooks.ts` -- relax `POST /discovery` 503: fail only when neither `SCRAPER_URL` nor `JSEARCH_API_KEY` is available.
- [x] `src/client/routes/config/sources-searches.tsx` -- when source is jsearch, show `Country` (required) + `City` (optional) and hide `Location`; wire both into add + edit. Scraper sources keep `Location` unchanged. Reuse existing `inputCls`/layout — no new visual language.
- [x] `src/client/hooks/useSearchConfigMutations.ts`, `useSearchConfigsQuery.ts` -- thread `country`/`city` through payloads.
- [x] Tests -- `discovery-service.test.ts`: jsearch inserts without `SCRAPER_URL`; not-configured → per-source error not throw; mixed run inserts jsearch while a scraper errors; dedup skips an existing `externalJobId`. `api-search-configs.test.ts`: `country`/`city` persist; jsearch-without-country → 400. Tenant isolation: B's discovery never touches A's rows/configs.

**Acceptance Criteria:**
- Given an enabled jsearch config and `JSEARCH_API_KEY` set, when `POST /api/webhooks/discovery` runs, then results are inserted as `jobs` `source:'jsearch'`, `pending`, correct `externalJobId`, and streamed via `onJobsInserted`.
- Given `SCRAPER_URL` unset but a jsearch config exists, when discovery runs, then it completes and inserts with no 503 and no thrown error.
- Given `JSEARCH_API_KEY` unset, when a jsearch config runs, then the run reports a per-source error and co-configured scrapers are unaffected.
- Given user B triggers discovery, then A's `search_configs` and `jobs` are untouched (proven, not assumed).

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. Empty until the first bad_spec loopback. -->

## Design Notes

**Soft-failing the scraper requirement.** Today `runDiscovery` throws `SCRAPER_URL not configured` up front and `POST /discovery` 503s on the same check. Make both conditional: the scraper is required only for scraper sources. Partition `activeSearches` into scraper vs jsearch; if scraper searches exist without `SCRAPER_URL`, push errors for them (mirroring the existing "skipped source" per-source-error behavior) rather than aborting; always run jsearch. Mixed-run partial-success semantics stay identical.

**Provider output is already canonical.** `search()` returns `JobInput[]` normalized to `jobInputSchema` (source, null analysis fields, salary, externalJobId). The insert path stamps a run-shared `dateScraped` + `pending` + `userId`. For jsearch, map `JobInput` down to the internal dedup record and let the existing insert stamp shared fields — but also carry `salary` (scrapers don't set it; jsearch does). Do not double-normalize.

**`country`/`city` scope.** Only jsearch reads them. The refine *requires* `country` for jsearch but does not *forbid* it elsewhere, so a stray value on a scraper row is stored and ignored — exactly how `location` is treated by sources that don't use it. `jsearch` gets no default `sourceSettings` row, so it stays disabled until an admin enables it, like every source; adding it to the enum makes it appear in both the admin toggle and (once enabled) the config dropdown with no route change.

## Verification

**Commands:**
- `bun run typecheck` -- no new errors vs baseline.
- `bun test src/server/services/discovery-service.test.ts src/server/routes/api-search-configs.test.ts` -- new + existing pass.
- `bun test` -- no regression beyond the known standing failures.

**Manual (`job-hunt-dashboard:verify` skill):** with `JSEARCH_API_KEY` set and no `SCRAPER_URL`, add a jsearch search (query + country `nl`), enable the source in admin, hit Discover, confirm jobs appear in the drawer as `source:'jsearch'` and analyze cleanly. Confirm the built client bundle never contains `JSEARCH_API_KEY`.

## Suggested Review Order

**The pipeline seam (design intent)**

- Entry point: the jsearch branch — provider call, then the SAME dedup/insert path as scrapers.
  [`discovery-service.ts:224`](../../job-hunt-dashboard/src/server/services/discovery-service.ts#L224)

- Shared `filterNew`/`insertNewJobs` — one dedup+insert both paths share, so they cannot drift; salary carried.
  [`discovery-service.ts:179`](../../job-hunt-dashboard/src/server/services/discovery-service.ts#L179)

- Soft scraper split — scraper sources per-source-error when `SCRAPER_URL` is absent instead of aborting.
  [`discovery-service.ts:255`](../../job-hunt-dashboard/src/server/services/discovery-service.ts#L255)

**The gate (the risk)**

- 503 only when neither scraper nor JSearch is available — a jsearch-only instance must pass.
  [`api-webhooks.ts:23`](../../job-hunt-dashboard/src/server/routes/api-webhooks.ts#L23)

**Data model**

- `'jsearch'` added to the source enum + the source-conditional `country` refine.
  [`schemas.ts:311`](../../job-hunt-dashboard/src/shared/schemas.ts#L311)

- `country`/`city` columns (jsearch-only geo).
  [`schema.ts:140`](../../job-hunt-dashboard/src/db/schema.ts#L140)

- Additive migration — two `ADD` statements only.
  [`0043_complex_nemesis.sql:1`](../../job-hunt-dashboard/src/db/migrations/0043_complex_nemesis.sql#L1)

**Persistence + UI binding**

- POST/PUT thread `country`/`city` (coalesced to null).
  [`api-search-configs.ts:29`](../../job-hunt-dashboard/src/server/routes/api-search-configs.ts#L29)

- `effectiveSource`-driven geo fields: Country/City for jsearch, Location otherwise.
  [`sources-searches.tsx:152`](../../job-hunt-dashboard/src/client/routes/config/sources-searches.tsx#L152)

**Supporting (tests)**

- jsearch-only run, not-configured → per-source error, mixed run, dedup, tenant isolation.
  [`discovery-service.test.ts`](../../job-hunt-dashboard/src/server/services/discovery-service.test.ts)

- country/city persistence + jsearch-without-country → 400.
  [`api-search-configs.test.ts`](../../job-hunt-dashboard/src/server/routes/api-search-configs.test.ts)

- 503-when-neither + proceeds-with-key-only.
  [`api-webhooks.test.ts`](../../job-hunt-dashboard/src/server/routes/api-webhooks.test.ts)
