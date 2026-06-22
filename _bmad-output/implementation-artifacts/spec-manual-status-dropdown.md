---
title: 'Manual status dropdown in the job drawer'
type: 'feature'
created: '2026-06-21'
status: 'done'
baseline_commit: 'd83494212c9c7d0bef8707dc2c45b13e51265000'
context: ['{project-root}/_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The job drawer only has a binary "Mark Applied" toggle, so users cannot record where an application actually stands (screening, interview, offer, rejected). The table, timeline, backend validation, and dashboard funnel were left around an obsolete status vocabulary (`phone_screen`/`technical`/`withdrawn`/`ghosted`), and the funnel compares against capitalized values that nothing ever writes — so manual statuses never register in it.

**Approach:** Replace the drawer toggle with a single `Select` exposing the seven-option set, route every choice through the existing `patchJob` mutation, and realign the table label list, backend `z.enum`, timeline labels, and dashboard funnel constants to one shared lowercase override vocabulary.

## Boundaries & Constraints

**Always:**
- The dropdown options are exactly, in order: No Status, Applied, Screening, Interview, Offer, Rejected, Other.
- Stored `statusOverride` values are lowercase: `screening`, `interview`, `offer`, `rejected`, `other`. `No Status` and `Applied` are display-only (computed from `applied` + null override), never stored as override strings.
- Selection mapping via `patchJob`: No Status → `{ applied: false, statusOverride: null }`; Applied → `{ applied: true, statusOverride: null }`; any response status → `{ applied: true, statusOverride: <lowercase> }`.
- Current selected value is derived identically everywhere: `statusOverride ?? (applied ? Applied : No Status)`.
- The funnel must preserve its nesting `applied ⊇ response ⊇ interview ⊇ offer` (response statuses imply applied).
- Reuse `components/ui/select.tsx`; do not hand-edit generated ui components.

**Ask First:**
- Whether `other` should count toward the funnel's response/interview/offer buckets (spec assumes NO — see Design Notes). Halt only if reconsidering this during build.

**Never:**
- No DB/Drizzle migration (`status_override` is free-text); no data backfill (no rows use the dropped values).
- Do not change the `stageAging` duration logic in `api-stats.ts` (it groups by raw event string, value-agnostic).
- Do not alter email-derived message `type` values (`Submitted`/`Screening`/`Interview`/`Offer`/`Rejected`/`Other`) — those live in the `messages` table and are out of scope.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick "Interview" on a job | drawer open, applied=false, override=null | PATCH `{ applied: true, statusOverride: 'interview' }`; drawer + table show "Interview"; a `manual` status_event row is written | transient toast on PATCH failure; optimistic rollback |
| Pick "No Status" | override='interview' | PATCH `{ applied: false, statusOverride: null }`; table cell renders "—" | toast + rollback |
| Pick "Applied" | override='offer' | PATCH `{ applied: true, statusOverride: null }`; table shows "Applied" | toast + rollback |
| Re-pick same status | override='rejected', pick Rejected again | no new status_event row (handler dedups on unchanged value) | N/A |
| Send unknown override | PATCH body `statusOverride: 'ghosted'` | 400 `{ error }` (value not in enum) | validation 400 |

</frozen-after-approval>

## Code Map

- `src/client/components/detail/JobDrawer.tsx` -- replace the binary "Mark Applied" `<button>` (~lines 160–173) with the status `Select`; keep Archive/Blacklist buttons untouched.
- `src/client/components/pipeline/PipelineTable.tsx` -- `STATUS_OPTIONS` (~lines 71–81) and the read-only status cell label lookup (~lines 289–302); `NO_STATUS`/`APPLIED` sentinels unchanged.
- `src/server/routes/api-jobs.ts` -- `STATUS_OVERRIDE_VALUES` (line 36) feeding the PATCH `z.enum` (line 40); the handler already writes a `manual` status_event on change.
- `src/client/components/detail/StatusTimeline.tsx` -- `STATUS_LABELS` override entries (~lines 9–25).
- `src/server/routes/api-stats.ts` -- funnel constants `RESPONSE_STATUSES`/`INTERVIEW_STATUSES` (lines 39–40), offer check (line 94), fit-responded check (line 118).
- `src/server/routes/api-jobs.test.ts` -- fixtures using `'phone_screen'` (lines ~305, 322, 396, 409).
- `src/server/routes/api-stats.test.ts` -- funnel fixtures using capitalized values (lines ~188–195, 358).

## Tasks & Acceptance

**Execution:**
- [x] `src/server/routes/api-jobs.ts` -- set `STATUS_OVERRIDE_VALUES = ['screening','interview','offer','rejected','other']` so the PATCH enum accepts the new values and rejects the old ones.
- [x] `src/client/components/detail/JobDrawer.tsx` -- replace the toggle button with a `Select` whose value = `job.statusOverride ?? (job.applied ? 'Applied' : '__none__')`; on change apply the mapping above via `patchJob`; disable while `isPatching`.
- [x] `src/client/components/pipeline/PipelineTable.tsx` -- rewrite `STATUS_OPTIONS` to the seven-option set (`NO_STATUS`, `APPLIED`, then lowercase `screening`/`interview`/`offer`/`rejected`/`other`); confirm the status cell label lookup resolves all values.
- [x] `src/client/components/detail/StatusTimeline.tsx` -- replace override entries in `STATUS_LABELS` with the new lowercase keys → labels (Screening, Interview, Offer, Rejected, Other); keep the capitalized email-type entries.
- [x] `src/server/routes/api-stats.ts` -- `RESPONSE_STATUSES = ['screening','interview','offer','rejected']`, `INTERVIEW_STATUSES = ['interview','offer']`, offer check `=== 'offer'`, and replace line 118 `!== 'No Response'` with `RESPONSE_STATUSES.includes(j.statusOverride)`.
- [x] `src/server/routes/api-jobs.test.ts` -- replace `'phone_screen'` fixtures/assertions with a surviving value (`'screening'`); keep the two-event ordering and dedup tests intact.
- [x] `src/server/routes/api-stats.test.ts` -- update funnel fixtures to lowercase (`screening`/`interview`/`offer`) preserving each test's intended response/interview/offer counts.

**Acceptance Criteria:**
- Given an open drawer, when the user selects "Offer", then the job is PATCHed with `{ applied: true, statusOverride: 'offer' }`, the table status cell reads "Offer", and the timeline gains a `manual` "Offer" entry.
- Given a job with `statusOverride='interview'` and `applied=true`, when `/api/stats` is computed, then it counts in `funnel.applied`, `funnel.response`, and `funnel.interview` but not `funnel.offer`.
- Given a PATCH with `statusOverride='withdrawn'`, when validated, then the API responds 400 `{ error }`.
- Given the existing suite, when `bun test` runs, then `api-jobs.test.ts` and `api-stats.test.ts` pass with the new vocabulary.

## Design Notes

`other` is treated as a manual catch-all: it sets `applied: true` (so it appears in the applied bucket and Status History) but is intentionally excluded from `RESPONSE_STATUSES`/`INTERVIEW_STATUSES`, so it does not inflate response/interview/offer outcome metrics. There is no `Submitted`/`No Response` equivalent in the new set — those capitalized sentinels are dropped from the funnel constants.

Selecting a response status sets `applied: true` (not in the original deferred-work note) to keep the funnel's `applied ⊇ response ⊇ interview ⊇ offer` nesting coherent now that manual statuses drive it — otherwise an "Interview" job left un-applied would never count. The `patchJob` optimistic handler already stamps `dateApplied` when `applied` flips true.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun test src/server/routes/api-jobs.test.ts src/server/routes/api-stats.test.ts` -- expected: all pass.
- `cd job-hunt-dashboard && bunx tsc --noEmit` -- expected: no type errors (enum/label types align).

**Manual checks:**
- In the drawer, cycle through all seven options; confirm the table status column and Status History update and survive a page reload.

## Suggested Review Order

**Drawer interaction (entry point)**

- Start here — the `onValueChange` mapping is the whole design: three branches drive `applied`/`statusOverride`.
  [`JobDrawer.tsx:175`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L175)

- The seven-option list the Select renders; sentinels `__none__`/`Applied` stay display-only.
  [`JobDrawer.tsx:22`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L22)

**Backend contract**

- The `z.enum` gate — narrowed to the five lowercase stored values; rejects dropped values with 400.
  [`api-jobs.ts:36`](../../job-hunt-dashboard/src/server/routes/api-jobs.ts#L36)

**Dashboard funnel alignment**

- Funnel constants realigned to lowercase so manual statuses finally register; preserves `response ⊇ interview`.
  [`api-stats.ts:39`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L39)

- Offer count and fit-responded check both keyed off the new vocabulary (line 118 was `!== 'No Response'`).
  [`api-stats.ts:94`](../../job-hunt-dashboard/src/server/routes/api-stats.ts#L94)

**Display label sync**

- Table option list + read-only cell label lookup, kept identical to the drawer set.
  [`PipelineTable.tsx:71`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L71)

- Timeline override labels swapped to the new lowercase keys; capitalized message-type entries untouched.
  [`StatusTimeline.tsx:10`](../../job-hunt-dashboard/src/client/components/detail/StatusTimeline.tsx#L10)

**Tests (supporting)**

- Funnel fixtures rewritten to lowercase, preserving each test's response/interview/offer counts.
  [`api-stats.test.ts:188`](../../job-hunt-dashboard/src/server/routes/api-stats.test.ts#L188)

- Event-ordering/dedup fixtures moved off `phone_screen` to a surviving value.
  [`api-jobs.test.ts:305`](../../job-hunt-dashboard/src/server/routes/api-jobs.test.ts#L305)
