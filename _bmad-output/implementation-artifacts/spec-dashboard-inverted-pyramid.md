---
title: 'Dashboard Redesign — Inverted Pyramid Layout'
type: 'feature'
created: '2026-06-20'
status: 'done'
baseline_commit: '2fe90a7797bc89fde953dc389183dd287e0bf80f'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The current dashboard renders siloed volume metrics per pipeline stage — it answers "how many?" not "how is my job search going?" There is no conversion funnel, no value story, no next-action signal, and no connection between stages.

**Approach:** Replace the 4-quadrant grid with an inverted-pyramid layout — Tier 0 (hero sentence + next-action card), Tier 1 (funnel + value panel + stat cards), Tier 2 (collapsible drill-in details). Drop the `messages` table from stats aggregation entirely; use `statusOverride` and `statusEvents` instead. The brainstorming doc `_bmad-output/brainstorming/brainstorming-session-2026-06-18-dashboard.md` is the design authority for KPI selection, tier placement, and gating rules.

## Boundaries & Constraints

**Always:**
- Keep `parseWorkflow`, `getPeriodCutoffs`, `buildBaseWhere` helpers in `api-stats.ts` unchanged
- Keep all dashboard utility functions: `FilteredTooltip`, `LabelInsideTop`, `LabelInsideCostTop`, `AXIS_PROPS`, `formatPerDayDate`, `NoData`, `StatCard`, `ChartCard`, `formatTokens`
- Only touch `statsSchema` and `Stats` in `schemas.ts` — all other exports byte-for-byte unchanged
- `statusEvents` has no `userId` — always join through `jobs` to scope by user
- Date-only strings (`dateApplied`, `dateScraped`): append `T00:00:00Z` when converting to `Date` for arithmetic
- `costUsd` is `number | null` in Drizzle — use `?? 0` directly, no `parseFloat`
- `bun:test` only; `DB_PATH = ':memory:'` at top of test files before any production imports
- Time-saved is always all-time (no period filter) — it is a cumulative investment metric

**Ask First:**
- If period filter should also scope `nextAction` counts (stale apps, waiting matches) or if those should always be all-time

**Never:**
- Use `messages` table in `api-stats.ts` — being deprecated for standard users
- Create helper component files outside `dashboard.tsx`
- Add new Recharts dependencies
- Modify any route file other than `api-stats.ts`

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| No jobs scraped | `funnel.scraped === 0` | Single centered empty-state card: "No jobs scraped yet — start a Discovery run to populate your dashboard." | N/A |
| Offer exists | `funnel.offer > 0` | Banner above Tier 0: "You have an offer! Update the status in your tracker." | N/A |
| No status data | `funnel.hasStatusData === false` | Funnel late stages (Response/Interview/Offer), fit-vs-outcome, apply→response, source effectiveness, stage-aging all show: "Set application statuses to unlock conversion insights." | N/A |
| Never applied | `statCards.daysSinceLastApplication === null` | Days-since-app card shows "Never" in zinc/gray | N/A |
| Stage-aging < 3 data points | Stage has fewer than 3 jobs with that transition in `statusEvents` | Exclude stage from `stageAging` array | N/A |
| Stale apps | Applied job has no `statusEvents` row with `timestamp > now − 14 days` | Counted in `nextAction.staleApplications` | N/A |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/shared/schemas.ts:135–192` — `statsSchema` + `Stats` type to replace
- `job-hunt-dashboard/src/server/routes/api-stats.ts` — full handler rewrite; drop `messages` import; keep `parseWorkflow`, `getPeriodCutoffs`, `buildBaseWhere`
- `job-hunt-dashboard/src/server/routes/api-stats.test.ts` — replace all assertions for new shape
- `job-hunt-dashboard/src/client/hooks/useStatsQuery.ts` — update `queryKey` only
- `job-hunt-dashboard/src/client/routes/dashboard.tsx` — full redesign: inverted pyramid 3 tiers
- `job-hunt-dashboard/src/db/schema.ts` — read-only reference: `statusEvents` shape (no userId), `coverLetters` (has userId), `webhookRuns`

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/schemas.ts` — Replace `statsSchema` + `Stats` with new shape (see Design Notes); all other exports unchanged
- [x] `src/server/routes/api-stats.ts` — Rewrite handler: drop `messages`; compute funnel (via `statusOverride`), time-saved (coverLetters + job fields), stage-aging (`statusEvents`), nextAction, sparklines, hero sentence; return new shape
- [x] `src/server/routes/api-stats.test.ts` — Replace all tests for new shape; cover funnel gating (`hasStatusData`), time-saved formula, stale-app detection, stage-aging ≥3 rule
- [x] `src/client/hooks/useStatsQuery.ts` — Change `queryKey` to `['stats', 'v2', period, archivedFilter]`
- [x] `src/client/routes/dashboard.tsx` — Full redesign: Tier 0 (hero sentence with color-coded border + next-action card), Tier 1 (full-width funnel bar + value panel + 3 stat cards with sparklines), Tier 2 (`<details>` with 6 subsections); preserve all existing utility functions

**Acceptance Criteria:**
- Given `funnel.scraped === 0`, when dashboard loads, then only the empty-state card renders
- Given `funnel.offer > 0`, when dashboard renders, then offer banner appears above Tier 0
- Given `funnel.hasStatusData === false`, when Tier 1 renders, then gated metrics show the unlock nudge message; gated Tier 2 subsections also show it
- Given applied jobs with `statusOverride` set, when `/api/stats` is called, then `funnel.hasStatusData === true` and late funnel counts reflect `statusOverride` values
- Given the time-saved model, when stats compute, then `value.timeSavedHours = (scraped×3 + analyzed×4 + coverLetterRows×4.75 + resumeGenerated×14.25) / 60`
- Given a job applied >14 days ago with no `statusEvents` in that window, when stats compute, then it is counted in `nextAction.staleApplications`
- Given hero sentence prefix "Active search", when Tier 0 renders, then the sentence box has a green border; "Moderate activity" → amber; "Search paused" → zinc
- Given period filter changes, when query fires, then the v2 cache key causes a fresh fetch

## Design Notes

### New `statsSchema`

```typescript
export const statsSchema = z.object({
  heroSentence: z.string(),
  nextAction: z.object({
    applyMatchesWaiting: z.number(),  // recommendation='apply', not applied, not archived
    staleApplications: z.number(),    // applied, no statusEvents in 14d
  }),
  funnel: z.object({
    scraped: z.number(),
    matched: z.number(),        // recommendation = 'apply' | 'investigate'
    applied: z.number(),
    response: z.number(),       // statusOverride in ['Submitted','Screening','Interview','Offer','Rejected'] (gated)
    interview: z.number(),      // statusOverride in ['Interview','Offer'] (gated)
    offer: z.number(),          // statusOverride = 'Offer' (gated)
    hasStatusData: z.boolean(), // true when any applied job has non-null statusOverride
  }),
  value: z.object({
    timeSavedHours: z.number(),
    totalCostUsd: z.number(),
    costPerApplication: z.number(),
  }),
  fitVsOutcome: z.object({
    hasData: z.boolean(),
    buckets: z.array(z.object({ fitRange: z.string(), applied: z.number(), responded: z.number() })),
  }),
  statCards: z.object({
    daysSinceLastApplication: z.number().nullable(),
    matchQualityRate: z.number(),  // % of scraped that became apply-grade (0–100)
  }),
  sparklines: z.object({
    matchQuality: z.array(z.object({ date: z.string(), rate: z.number() })),
    costPerApp: z.array(z.object({ date: z.string(), costPerApp: z.number() })),
  }),
  detail: z.object({
    applyResponseRate: z.object({ hasData: z.boolean(), applied: z.number(), responded: z.number() }),
    sourceEffectiveness: z.array(z.object({ source: z.string(), scraped: z.number(), applied: z.number(), responded: z.number() })),
    stageAging: z.array(z.object({ stage: z.string(), medianDays: z.number() })),
    activityHeatmap: z.array(z.object({ date: z.string(), count: z.number() })),
    cumulativeTimeSaved: z.array(z.object({ date: z.string(), totalHours: z.number() })),
    timeSavedByWorkflow: z.array(z.object({ workflow: z.string(), hours: z.number() })),
  }),
  automation: z.object({
    totalRuns: z.number(),
    totalTokens: z.number(),
    perDay: z.array(z.object({ date: z.string(), Discovery: z.number(), Analysis: z.number(), 'Cover Letter': z.number(), Resume: z.number() })),
    costByWorkflow: z.array(z.object({ workflow: z.string(), cost: z.number() })),
  }),
})
export type Stats = z.infer<typeof statsSchema>
```

### Key aggregation notes

**`hasStatusData`** = `appliedJobs.some(j => j.statusOverride !== null)`. Gates all ▲ metrics.

**Time-saved counts are all-time** (no period/archivedFilter applied): `allUserJobs` for scraped, `dateAnalyzed IS NOT NULL` for analyzed, `coverLetters` table rows for cover letters, `resumeGeneratedAt IS NOT NULL` for resume.

**Stage-aging**: For each job, sort its `statusEvents` by `timestamp`. For consecutive pairs, compute `(new Date(events[i+1].timestamp) − new Date(events[i].timestamp)) / 86400000` days, keyed on `events[i].status`. Accumulate per stage; include stage in output only if ≥3 durations collected. Take median.

**Sparklines** (last 30 days, daily): compute per-day `matchQualityRate` and `costPerApp` windows — these may be sparse/empty arrays.

**`nextAction.staleApplications`**: applied jobs where `MAX(statusEvents.timestamp WHERE jobId = job.id) < now − 14 days` OR no statusEvents row exists for that jobId (and job has been applied for >14 days).

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun test src/server/routes/api-stats.test.ts` — expected: all pass, no skips
- `cd job-hunt-dashboard && bun run build` — expected: zero TypeScript errors

## Suggested Review Order

**Contract (start here)**

- Entry point — the new Stats shape every other change serves; read top-down.
  [`schemas.ts:135`](../../job-hunt-dashboard/src/shared/schemas.ts#L135)

**Aggregation logic (highest risk)**

- Funnel counts + `hasStatusData` gate flag — the reliability-gating spine.
  [`api-stats.ts:87`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L87)

- NET time-saved model — all-time, four task types; not period-scoped.
  [`api-stats.ts:97`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L97)

- Stale-app detection via statusEvents 14-day window (no-events case included).
  [`api-stats.ts:166`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L166)

- Hero sentence assembled server-side; momentum prefix drives UI border color.
  [`api-stats.ts:185`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L185)

- Stage-aging median with ≥3-data-point floor to avoid misleading medians.
  [`api-stats.ts:210`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L210)

**UI binding**

- Funnel bar — gated late stages render lock + nudge when no status data.
  [`dashboard.tsx:189`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L189)

- Inverted-pyramid composition — Tier 0/1/2 layout and empty/offer states.
  [`dashboard.tsx:421`](../../job-hunt-dashboard/src/client/routes/dashboard.tsx#L421)

**Peripherals**

- Query-key v2 bump busts stale cache from the old shape.
  [`useStatsQuery.ts:8`](../../job-hunt-dashboard/src/client/hooks/useStatsQuery.ts#L8)

- Test suite — 21 cases covering gating, formula, stale, stage-aging.
  [`api-stats.test.ts:101`](../../job-hunt-dashboard/src/server/routes/api-stats.test.ts#L101)
