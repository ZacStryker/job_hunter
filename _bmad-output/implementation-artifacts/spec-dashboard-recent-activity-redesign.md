---
title: 'Dashboard recent-activity redesign'
type: 'refactor'
created: '2026-06-22'
status: 'done'
baseline_commit: '7a24c1843a95945406997e67db442e4fbbe72ff6'
context: ['{project-root}/_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The dashboard leads with a conversion funnel that reads as a loss visualization — it makes the user feel their effort was wasted. The page is also overloaded with derived metrics (value, fit-vs-outcome, sparklines, automation, nudges) that bury the signal.

**Approach:** Rebuild the dashboard around a neutral "recent activity" narrative: a full-width activity feed on top, a Jobs-by-Fit-Score + Time-Saved-by-Workflow pair, then the existing 90-day heatmap. Trim `/api/stats` (only consumed by the dashboard) to exactly the four data shapes the new page needs plus a `totalJobs` empty-state gate.

## Boundaries & Constraints

**Always:**
- Follow `project-context.md`: ISO 8601 strings everywhere; bare `YYYY-MM-DD` normalized with a `T00:00:00Z` suffix; explicit `null` for missing optional fields; arrays never objects-keyed-by-id; direct-data response (no envelope); cross-boundary types only from `src/shared/schemas.ts`.
- Keep the existing period (`24h/7d/30d/all`) + archived (`active/archived/all`) filter bar and the loading / error / empty states.
- Keep `timeSavedByWorkflow` using the current all-time formula and row order (Discovery, Analysis, Cover Letter, Resume).
- Period cutoff for the feed applies to each event's own timestamp; archived filter applies to the event's owning job.

**Never:**
- No funnel, Value Delivered, Fit-vs-Outcome, Match-Quality / Cost-per-App / Days-Since-App cards, cumulative time saved, source effectiveness, stage aging, automation, hero sentence, next-action nudges, sparklines, or drill-in accordion.
- No scrape or "new match" events in the feed. No celebratory tone.
- Do not change DB schema, the `jobs` query-key shapes, or any route other than `/api/stats`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty DB | no jobs for user | `totalJobs: 0`, all arrays empty; page shows empty state | N/A |
| Fit bucketing | jobs with fitScore 0,19,20,80,100, and null | counts in 0-20,0-20,20-40,80-100,80-100; null excluded; 100 clamps into 80-100 | N/A |
| Feed scope (active) | archived job has a recent status event | event excluded under `active`, included under `all`/`archived` | N/A |
| Feed period | event 2d ago on a job scraped 60d ago | appears in `7d` feed (period scopes event timestamp, not job) | N/A |
| Bare date event | `dateApplied = '2026-06-01'` | feed timestamp `'2026-06-01T00:00:00Z'` | N/A |
| Feed cap | 60 qualifying events | newest-first, payload capped at 50 | N/A |

</frozen-after-approval>

## Code Map

- `src/server/routes/api-stats.ts` -- rewrite handler: drop funnel/value/fit-vs-outcome/statCards/sparklines/detail/automation/hero/nextAction; emit `totalJobs`, `recentActivity`, `jobsByFitScore`, `timeSavedByWorkflow`, `activityHeatmap`. Remove now-dead helpers (`median`, `parseWorkflow`, response/interview status sets) and unused imports (`webhookRuns`).
- `src/shared/schemas.ts` -- replace `statsSchema` body with the new shape; `Stats` type re-inferred.
- `src/client/routes/dashboard.tsx` -- rewrite page: keep filter bar + loading/error/empty; render `RecentActivityFeed` (hero), `JobsByFitScore` + `TimeSavedByWorkflow` side-by-side, `ActivityHeatmap`. Delete dropped components.
- `src/client/hooks/useStatsQuery.ts` -- bump query key `v2`→`v3` (shape changed); no other change.
- `src/server/routes/api-stats.test.ts` -- rewrite for the new shape.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/schemas.ts` -- replace `statsSchema` with `{ totalJobs: number; recentActivity: {type, timestamp, jobTitle, company, status: string|null}[]; jobsByFitScore: {fitRange, count}[]; timeSavedByWorkflow: {workflow, hours}[]; activityHeatmap: {date, count}[] }`.
- [x] `src/server/routes/api-stats.ts` -- compute the five fields. `recentActivity`: union of `applied` (jobs.applied+dateApplied), `status_change` (statusEvents.status/timestamp), `resume` (resumeGeneratedAt), `cover_letter` (coverLetters.createdAt); normalize bare dates to ISO; archive-scope by owning job; period-scope by event timestamp; sort newest-first; cap 50. `jobsByFitScore`: period+archive-scoped jobs, 5 buckets, `idx = min(max(floor(score/20),0),4)`, null fitScore excluded. `timeSavedByWorkflow`: unchanged formula/order. `activityHeatmap`: unchanged. `totalJobs`: count of all user jobs (unscoped gate).
- [x] `src/client/routes/dashboard.tsx` -- rebuild layout top→bottom; empty gate on `totalJobs === 0`; feed shows first 10 with a "Show more" toggle; neutral row labels derived from `type` (`Applied to {jobTitle}` / `Status → {status}` / `Resume generated` / `Cover letter generated`) + company + short date.
- [x] `src/client/hooks/useStatsQuery.ts` -- bump query key to `v3`.
- [x] `src/server/routes/api-stats.test.ts` -- rewrite per Acceptance + I/O matrix.

**Acceptance Criteria:**
- Given a GET to `/api/stats`, when the response is parsed, then top-level keys are exactly `totalJobs`, `recentActivity`, `jobsByFitScore`, `timeSavedByWorkflow`, `activityHeatmap` and none of the old keys (`funnel`, `value`, `heroSentence`, `automation`, `detail`, `sparklines`, etc.) are present.
- Given jobs with status events and generated artifacts, when the feed is built, then events carry the right `type`, include `status` only for `status_change` (else `null`), are sorted newest-first, and honor archive + period scoping.
- Given the time-saved formula, when computed, then values match the pre-existing Discovery/Analysis/Cover Letter/Resume all-time formula exactly.

## Verification

**Commands:**
- `bun test src/server/routes/api-stats.test.ts` -- expected: all pass
- `bunx tsc --noEmit` (or project typecheck script) -- expected: no errors
- `bun run build` -- expected: succeeds

## Suggested Review Order

**The new contract (start here)**

- Entry point: the trimmed response — exactly five fields, no envelope.
  [`api-stats.ts:133`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L133)

- The Zod shape that pins the contract for both layers.
  [`schemas.ts:138`](../../job-hunt-dashboard/src/shared/schemas.ts#L138)

**Server computation**

- Feed: union of 4 event types, archive-scoped by owning job, period-scoped by event timestamp, newest-first, capped 50.
  [`api-stats.ts:82`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L82)

- Bare `YYYY-MM-DD` → `…T00:00:00Z` normalization (project-context date rule).
  [`api-stats.ts:26`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L26)

- Fit-score bucketing with clamp `min(max(floor(score/20),0),4)`, null excluded.
  [`api-stats.ts:70`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L70)

**UI binding**

- Page rebuilt top→bottom: feed → fit/time-saved pair → heatmap; empty gate on `totalJobs`.
  [`dashboard.tsx:259`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L259)

- Neutral row labels derived from event `type` (no celebration).
  [`dashboard.tsx:96`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L96)

- First-10 + "Show more" toggle.
  [`dashboard.tsx:105`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L105)

**Peripherals**

- Query-key bump `v2`→`v3` (incompatible cached shape).
  [`useStatsQuery.ts:8`](../../job-hunt-dashboard/src/client/hooks/useStatsQuery.ts#L8)

- Tests rewritten for the new shape (key presence/absence, bucketing, feed scoping, time-saved formula).
  [`api-stats.test.ts:132`](../../job-hunt-dashboard/src/server/routes/api-stats.test.ts#L132)
