---
title: 'JSearch (RapidAPI) job search provider'
type: 'feature'
created: '2026-07-17'
status: 'done'
baseline_commit: '866f05d1d60ac8f282fb7bd9182f2ed6d38fa95c'
context:
  - '{project-root}/_bmad-output/brainstorming/brainstorming-session-2026-07-16-0332.md'
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** HITLOBSTER has no managed job-discovery feed. The 2026-07-16 go/no-go killed Scrapfly scraping (cost scales per-user, ~120× dearer, N brittle parsers) and conditionally approved JSearch/Google-for-Jobs: one query returns many boards, ~$0.0015/search, zero maintenance. Nothing is built yet.

**Approach:** Add a server-side `JobSearchProvider` abstraction (brainstorming commit #1 — the anti-lock-in seam) with a JSearch implementation that queries RapidAPI and normalizes results into the canonical `jobInputSchema` shape. SerpApi Google Jobs is documented as a drop-in fallback but not implemented. Ship with a runnable free-tier coverage-spike script (brainstorming condition #1) so quality can be validated before paying.

## Boundaries & Constraints

**Always:**
- One shared HITLOBSTER key read from `process.env.JSEARCH_API_KEY` (entity pays for all users — NOT a per-user `user_secrets` BYO key). Server-side only; the key must never reach the client bundle.
- Call RapidAPI with raw `fetch` (Bun runtime) — no SDK, mirroring the Anthropic convention in `analysis-service.ts`.
- Normalize every result into `jobInputSchema` from `src/shared/schemas.ts` (the only source of cross-boundary types). `source: 'jsearch'`, analysis fields `null`, `analysisStatus: 'pending'`.
- Missing key throws a typed `JobSearchNotConfiguredError` at call time (feature is optional; app still boots — mirrors the Gmail/Anthropic "503 if absent" pattern). Do NOT add `JSEARCH_API_KEY` to `REQUIRED_ENV_VARS`.

**Ask First:**
- Wiring the provider into any API route, the `jobs` table / ingest, or UI (explicitly deferred — this scope is the provider + spike only).
- Adding `'jsearch'` to the `SCRAPER_SOURCES` enum (not needed here; `jobInputSchema.source` is a free string).

**Never:**
- No per-user key storage, no encryption plumbing, no onboarding UI.
- No DB writes, no persistence, no route handler, no React component.
- Do not implement the SerpApi provider — document the seam only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | `JSEARCH_API_KEY` set; query "react dev, Amsterdam" | `fetch` to `jsearch.p.rapidapi.com/search` with key+host headers; returns `jobInputSchema[]`, `source:'jsearch'`, `externalJobId` = JSearch `job_id` | N/A |
| Salary sparse | Result has null `job_min_salary`/`job_max_salary` | `salary: null` | N/A |
| Location parts | `job_city`/`job_state`/`job_country` partially null | `location` joins present parts (e.g. "Amsterdam, NL"); all null → `null` | N/A |
| Key missing | `JSEARCH_API_KEY` unset | Throws `JobSearchNotConfiguredError` before any fetch | Typed error |
| RapidAPI non-2xx | 429 / 403 / 5xx from RapidAPI | Throws `Error` with status; no partial results | Include status, not body |
| Empty results | RapidAPI 200, `data: []` | Returns `[]` | N/A |

</frozen-after-approval>

## Code Map

- `src/shared/schemas.ts` -- canonical `jobInputSchema` (normalization target); do not redefine `Job` inline.
- `src/server/services/analysis-service.ts:76` -- reference: raw-`fetch` external API + "not configured" error pattern to mirror.
- `src/server/services/discovery-service.ts` -- reference: how normalized records are shaped (`source`, null analysis fields).
- `spike/test-xenova-bun.ts` -- existing spike; run convention (`bun run spike/<file>.ts`).
- `.env.example:11` -- where service keys are documented.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/services/job-search/provider.ts` -- define `JobSearchQuery` (`query`, optional `page`, `numPages`, `location`, `remoteOnly`, `datePosted`), the `JobSearchProvider` interface (`search(q): Promise<JobInput[]>`), and `JobSearchNotConfiguredError` -- the vendor-neutral seam.
- [x] `src/server/services/job-search/jsearch-provider.ts` -- implement `JobSearchProvider`: read `process.env.JSEARCH_API_KEY` (throw `JobSearchNotConfiguredError` if absent), `fetch` the JSearch `/search` endpoint with `X-RapidAPI-Key` + `X-RapidAPI-Host` headers, map each `data[]` item into `jobInputSchema` shape via a pure `normalize()` helper -- primary provider.
- [x] `src/server/services/job-search/index.ts` -- `getJobSearchProvider()` returns the JSearch provider; document SerpApi Google Jobs as the drop-in fallback (comment + throw "not implemented" if a `serpapi` selector is ever passed) -- selection seam.
- [x] `src/server/services/job-search/jsearch-provider.test.ts` -- unit-test the I/O matrix with mocked `fetch`: header/URL construction, normalization (incl. salary sparsity + partial location), not-configured throw, non-2xx throw, empty results.
- [x] `spike/jsearch-coverage.ts` -- runnable script: 15–20 real HITLOBSTER-style queries against the free tier, print per-query result count, apply-link presence, salary-fill rate, geo coverage -- validation before paying.
- [x] `.env.example` -- add documented `JSEARCH_API_KEY=` entry (optional; provider throws if unset).

**Acceptance Criteria:**
- Given a mocked RapidAPI 200 response, when `search()` runs, then every returned record parses cleanly against `jobInputSchema` (no extra/missing fields).
- Given `JSEARCH_API_KEY` is unset, when `search()` is called, then `JobSearchNotConfiguredError` is thrown and no network call is made.
- Given the client bundle, when built, then `JSEARCH_API_KEY` and the provider modules never appear in it (server-only).

## Design Notes

JSearch response is `{ status, data: [...] }`. Per-item mapping into `jobInputSchema`:
`employer_name→company`, `job_title→jobTitle`, `job_description→jobDescription`,
`job_apply_link→sourceUrl`, `job_id→externalJobId`, `source:'jsearch'`,
`dateScraped: new Date().toISOString()`, `location`: join non-null of `[job_city, job_state, job_country]`,
`salary`: format from `job_min_salary`/`job_max_salary`/`job_salary_period` else `null`.
All analysis-owned fields (`fitScore`, `recommendation`, `jobReqs*`, `candidateReqs*`, `benefits`, `contact*`) → `null`; `analysisStatus:'pending'`.
Keep `normalize()` a pure exported function so the test asserts it without the network.

## Verification

**Commands:**
- `bun run typecheck` -- expected: no new errors vs. baseline.
- `bun test src/server/services/job-search` -- expected: all new tests pass.
- `JSEARCH_API_KEY=<key> bun run spike/jsearch-coverage.ts` -- expected (manual, real key): prints coverage table; results parse as jobs with valid apply links.

**Manual checks:**
- `grep JSEARCH_API_KEY dist/` after `bun run build` returns nothing (server-only key not leaked to client).

## Suggested Review Order

**The seam (design intent)**

- Vendor-neutral interface + typed query and "not configured" error — the whole point of the abstraction.
  [`provider.ts:23`](../../job-hunt-dashboard/src/server/services/job-search/provider.ts#L23)

- Provider selection; SerpApi documented as the drop-in fallback, not implemented.
  [`index.ts:17`](../../job-hunt-dashboard/src/server/services/job-search/index.ts#L17)

**JSearch call + normalization (the risk)**

- The RapidAPI request: shared-key header auth, body-free error on non-2xx.
  [`jsearch-provider.ts:85`](../../job-hunt-dashboard/src/server/services/job-search/jsearch-provider.ts#L85)

- Pure map from JSearch item → canonical `jobInputSchema` (analysis fields null).
  [`jsearch-provider.ts:45`](../../job-hunt-dashboard/src/server/services/job-search/jsearch-provider.ts#L45)

**Supporting**

- Unit tests: mocked-fetch I/O matrix + schema validation of output.
  [`jsearch-provider.test.ts:66`](../../job-hunt-dashboard/src/server/services/job-search/jsearch-provider.test.ts#L66)

- Free-tier coverage spike (validate before paying).
  [`jsearch-coverage.ts:1`](../../job-hunt-dashboard/spike/jsearch-coverage.ts#L1)

- Documented optional env key.
  [`.env.example:15`](../../job-hunt-dashboard/.env.example#L15)
