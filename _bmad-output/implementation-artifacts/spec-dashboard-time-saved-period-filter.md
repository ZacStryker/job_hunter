---
title: 'Dashboard Time Saved by Workflow is period-dynamic, archive-agnostic'
type: 'bugfix'
created: '2026-06-23'
status: 'done'
context: ['{project-root}/_bmad-output/project-context.md']
baseline_commit: 'c8545226d7e1512d357250427224930513bd0a08'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On the Dashboard, the "Time Saved by Workflow" chart is computed all-time and ignores the period (`24h`/`7d`/`30d`/`all`) filter bar, so it never moves when the user changes the date range — unlike "Jobs by Fit Score". Time-saved is a cumulative-effort metric, so it should track the date range but stay indifferent to whether jobs are Active/Archived.

**Approach:** Make the server-side `timeSavedByWorkflow` computation scope each workflow's item count by the period cutoff only (archive-agnostic), using each workflow's natural date column. No client changes are needed; the chart already reads from the single `useStatsQuery(period, archivedFilter)` result.

## Boundaries & Constraints

**Always:** Scope by the period cutoff only — Time Saved is **archive-agnostic** (Active/Archived/All produce identical values). Map each workflow to its own date column: Discovery → `dateScraped`, Analysis → `dateAnalyzed`, Resume → `resumeGeneratedAt`, Cover Letter → `coverLetters.createdAt` (counted per row, no job-archive linkage). Use the same date-only `dateCutoff` (not `datetimeCutoff`) used for fit-score buckets so day-granularity matches. Preserve the existing `NET_MIN` formula, the four workflow labels, and their array order.

**Ask First:** Changing the NET-minutes model, the workflow→date-column mapping, or making Time Saved respond to the archive filter.

**Never:** Touch the client (`dashboard.tsx` already reactive). Change the response shape or top-level keys. Alter `totalJobs` (stays unscoped), the heatmap (stays last-90-days), or the recent-activity feed (stays archive-scoped). Add an envelope or change error shapes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Period filter | `?period=24h` with 1 job scraped today, 1 scraped 60d ago | Discovery counts only the today job | N/A |
| Per-column scoping | Job scraped 60d ago but analyzed today, `?period=24h` | Discovery excludes it, Analysis includes it | N/A |
| Archive-agnostic | Archived job with all four workflows in period | Counted identically under `active`, `archived`, and `all` | N/A |
| All time | `?period=all` | All items counted (prior all-time output) | N/A |
| Null date column | Job with `dateAnalyzed = null` | Excluded from Analysis count | N/A |

</frozen-after-approval>

## Code Map

- `src/server/routes/api-stats.ts` -- `inPeriod` predicate (line ~57) + `timeSavedByWorkflow` block (lines ~75-85) counting over `allUserJobs`/`coverLetterRows`, period-only; `feedJobs` (line ~58) keeps the archive predicate for the recent-activity feed only.
- `src/server/routes/api-stats.test.ts` -- `describe('GET /api/stats - timeSavedByWorkflow')` (line ~284): period/per-column/null tests plus the archive-agnostic test.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/routes/api-stats.ts` -- Add an `inPeriod(date)` predicate (`date !== null && (dateCutoff === null || date >= dateCutoff)`). Replace the all-time `discoveryCount`/`analyzedCount`/`resumeCount`/`coverLetterCount` with period-only, archive-agnostic counts over `allUserJobs`/`coverLetterRows`: Discovery = `inPeriod(dateScraped)`, Analysis = `inPeriod(dateAnalyzed)`, Resume = `inPeriod(resumeGeneratedAt)`, Cover Letter = cover-letter rows with `inPeriod(createdAt)`. Keep the archive predicate only for the recent-activity `feedJobs`. Keep `NET_MIN`, labels, and order unchanged.
- [x] `src/server/routes/api-stats.test.ts` -- Cover the I/O matrix: period scoping per workflow column, null-date exclusion, and archive-agnostic (Active == Archived == All). Keep the `formula and order unchanged` test passing under default.

**Acceptance Criteria:**
- Given jobs/cover letters dated across periods, when `/api/stats?period=24h` is requested, then each workflow's hours reflect only items whose relevant date falls within 24h, scaled by `NET_MIN`.
- Given an archived job with workflows in period, when the archive filter is toggled Active/Archived/All, then its Time Saved contribution is identical for all three.
- Given `?period=all`, then values equal the prior all-time output (no regression).

## Spec Change Log

- **Human renegotiation (post-implementation):** Original frozen intent scoped Time Saved by *both* period and archive filter. User clarified Time Saved is a cumulative-effort metric that must be **archive-agnostic** — dynamic to the date filter only. Amended: counts now run over `allUserJobs`/`coverLetterRows` (period-only) instead of an archive-scoped set; Cover Letter dropped its job-archive linkage; the archive predicate survives only for the recent-activity `feedJobs`. Avoided known-bad state: Time Saved silently changing when the user toggles Active/Archived. KEEP: per-workflow date-column mapping, date-only `dateCutoff` comparison, `inPeriod` predicate, NET_MIN/labels/order.

## Design Notes

Use the date-only `dateCutoff` for string comparison: a date-only column like `'2026-06-01'` and an ISO-datetime column like `'2026-06-03T12:00:00Z'` both compare correctly against `'2026-06-01'`, whereas the full `datetimeCutoff` would wrongly exclude same-day date-only values. Time Saved deliberately diverges from `jobsByFitScore` here: fit-score is archive-scoped (`viewJobs`), Time Saved is not.

## Verification

**Commands:**
- `bun test src/server/routes/api-stats.test.ts` -- expected: all pass, including new period/archive scoping cases.

**Manual checks:**
- Run `bun run dev`, open Dashboard, toggle 24h/7d/30d/All and Active/Archived/All; confirm "Time Saved by Workflow" bars change in step with "Jobs by Fit Score".

## Suggested Review Order

**Scoping primitive (entry point)**

- Period predicate — the single filter Time Saved now uses; archive predicate stays on `feedJobs` only.
  [`api-stats.ts:57`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L57)

**Time-saved recomputation**

- Per-workflow counts over `allUserJobs`/`coverLetterRows`, period-only and archive-agnostic.
  [`api-stats.ts:75`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L75)

**Tests**

- Period/per-column/null cases plus archive-agnostic (Active == Archived == All).
  [`api-stats.test.ts:284`](../../job-hunt-dashboard/src/server/routes/api-stats.test.ts#L284)
