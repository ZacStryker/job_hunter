# Review 2 — Edge Case Hunter (diff + project read access)

Run this in a fresh session (ideally a different LLM) with **read access to the project**.
Invoke the `bmad-review-edge-case-hunter` skill. Paste findings back here.

## How to get the diff

From repo root:

```
git --no-pager diff d83494212c9c7d0bef8707dc2c45b13e51265000 -- job-hunt-dashboard/
```

## What to hunt

Walk every branching path and boundary condition introduced or affected by this change.
This is a feature that replaces a binary "Mark Applied" toggle in the job drawer with a
seven-option status `Select` (No Status, Applied, Screening, Interview, Offer, Rejected,
Other), and realigns the table label list, backend `z.enum`, timeline labels, and dashboard
funnel constants to one shared lowercase override vocabulary
(`screening`/`interview`/`offer`/`rejected`/`other`).

Report ONLY unhandled edge cases. Method-driven, exhaustive. Consider at minimum:

- Jobs that already carry a dropped override value (`phone_screen`, `technical`, `withdrawn`,
  `ghosted`) in the DB — how do the table cell, timeline, drawer `Select`, and funnel render
  them now that those keys are gone from the label maps / enum / funnel constants?
- The drawer `Select` value derivation `job.statusOverride ?? (job.applied ? APPLIED : NO_STATUS)`
  when `statusOverride` holds an out-of-set legacy value — does the Radix Select show a blank?
- `other` deliberately sets `applied: true` but is excluded from `RESPONSE_STATUSES`/
  `INTERVIEW_STATUSES`. Trace funnel nesting invariant `applied ⊇ response ⊇ interview ⊇ offer`
  under every option, including `other`.
- The `status_events` row written by the PATCH handler when override changes — dedup on
  unchanged value; transitions between `applied`-toggling options.
- The fit-vs-outcome `responded` bucket change from `!== 'No Response'` to
  `RESPONSE_STATUSES.includes(...)` — any job whose override is now neither null nor in the
  list (e.g. legacy or `other`)?
- `stageAging` (intentionally unchanged, value-agnostic) — confirm it still behaves with the
  new event strings.
