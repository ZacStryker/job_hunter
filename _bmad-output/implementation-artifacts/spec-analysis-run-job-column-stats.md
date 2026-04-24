---
title: 'Analysis run job column stats'
type: 'feature'
created: '2026-04-23'
status: 'done'
baseline_commit: '32425fa19ac9a958336543bd36cc5198df102990'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The "Job" column in the logs/history table is blank (`—`) for Analysis runs, wasting the space that could surface useful run-level metrics.

**Approach:** Add `matchedCount` and `archivedCount` columns to `webhook_runs`, populate them from `runAnalysis`, and render "X analyzed, Y matched, Z archived" in the Job column for Analysis rows.

## Boundaries & Constraints

**Always:**
- "analyzed" = `itemCount` (already stored); "matched" = analyzed − archived; "archived" = jobs auto-archived by the `skip` recommendation during that run.
- New DB columns are nullable so existing rows and non-Analysis runs are unaffected.
- Display string is only rendered when `name === 'Analysis'` and `itemCount` is non-null.

**Ask First:** None.

**Never:**
- Do not rename or change the semantics of the existing `itemCount` field.
- Do not add a separate "Analyzed" column to the table — the stats belong in the existing Job column.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Successful Analysis run | `name='Analysis'`, `itemCount=8`, `matchedCount=5`, `archivedCount=3` | Job column: "8 analyzed, 5 matched, 3 archived" | N/A |
| Analysis run with no jobs | `name='Analysis'`, `itemCount=0`, `matchedCount=0`, `archivedCount=0` | Job column: "0 analyzed, 0 matched, 0 archived" | N/A |
| Failed Analysis run | `name='Analysis'`, `success=false`, `itemCount=null` | Job column: `—` (existing behavior) | N/A |
| Non-Analysis run (Cover Letter / Resume / Discovery) | `matchedCount=null`, `archivedCount=null` | Job column unchanged — shows job name or `—` | N/A |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` -- `webhookRuns` table definition; add `matchedCount`, `archivedCount` columns
- `src/db/migrations/0017_analysis_run_counts.sql` -- new migration for two nullable integer columns
- `src/db/migrations/meta/_journal.json` -- migration journal (must append new entry)
- `src/server/services/analysis-service.ts` -- `runAnalysis`; track and return `matched`, `archived`
- `src/server/routes/api-webhooks.ts` -- `recordRun` call for analysis; pass `matchedCount`, `archivedCount`
- `src/server/routes/api-webhook-runs.ts` -- `recordRun` function signature; `webhookRuns` insert
- `src/shared/schemas.ts` -- `webhookRunSchema`; add nullable int fields
- `src/client/routes/history.tsx` -- Job column cell renderer for Analysis rows

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- add `matchedCount: integer('matched_count')` and `archivedCount: integer('archived_count')` to the `webhookRuns` table definition
- [x] `src/db/migrations/0017_analysis_run_counts.sql` -- create with `ALTER TABLE webhook_runs ADD COLUMN matched_count INTEGER; ALTER TABLE webhook_runs ADD COLUMN archived_count INTEGER;`
- [x] `src/db/migrations/meta/_journal.json` -- append entry `{ idx: 17, version: "6", when: <epoch>, tag: "0017_analysis_run_counts", breakpoints: true }`
- [x] `src/server/services/analysis-service.ts` -- add `archived` counter (increment when `result.recommended_action === 'skip'`); return `{ processed, failed, matched: processed - archived, archived, inputTokens, outputTokens }` from `runAnalysis`
- [x] `src/server/routes/api-webhooks.ts` -- destructure `matched`, `archived` from `runAnalysis` result; pass `matchedCount: matched, archivedCount: archived` to `recordRun`
- [x] `src/server/routes/api-webhook-runs.ts` -- add `matchedCount` and `archivedCount` to `recordRun` params and `db.insert` values
- [x] `src/shared/schemas.ts` -- add `matchedCount: z.number().int().nullable()` and `archivedCount: z.number().int().nullable()` to `webhookRunSchema`
- [x] `src/client/routes/history.tsx` -- in the Job column cell, when `row.name === 'Analysis'` and `row.itemCount !== null`, render `"${row.itemCount} analyzed, ${row.matchedCount ?? 0} matched, ${row.archivedCount ?? 0} archived"` instead of the parsed `job` string

**Acceptance Criteria:**
- Given a completed Analysis run with 8 processed jobs (5 matched, 3 skipped), when viewing the Logs table, then the Job column shows "8 analyzed, 5 matched, 3 archived".
- Given a failed Analysis run (`success=false`), when viewing the Logs table, then the Job column shows `—`.
- Given a Cover Letter or Resume run, when viewing the Logs table, then the Job column is unchanged (shows the job name as before).
- Given historical rows with `matched_count = NULL`, when viewing the Logs table, then the Job column shows `—` (itemCount is null for old rows too, so the null-guard covers this).

## Design Notes

`matched` is derived (`processed − archived`) rather than tracked independently to keep the return value consistent and avoid double-counting. Storing it explicitly in the DB avoids recomputing on read, but it is always consistent with `itemCount − archivedCount`.

## Verification

**Commands:**
- `cd job-hunt-dashboard && npx tsc --noEmit` -- expected: no new type errors

## Suggested Review Order

**DB & Migration**

- New nullable columns added to `webhookRuns` table definition
  [`schema.ts:66`](../../job-hunt-dashboard/src/db/schema.ts#L66)

- Migration SQL adding the two columns
  [`0017_analysis_run_counts.sql:1`](../../job-hunt-dashboard/src/db/migrations/0017_analysis_run_counts.sql#L1)

**Service Logic**

- `archivedInRun` counter incremented on `skip`; `matched` derived as `processed − archived`
  [`analysis-service.ts:62`](../../job-hunt-dashboard/src/server/services/analysis-service.ts#L62)

**API Plumbing**

- `matched`/`archived` destructured from `runAnalysis` and forwarded to `recordRun`
  [`api-webhooks.ts:37`](../../job-hunt-dashboard/src/server/routes/api-webhooks.ts#L37)

- `recordRun` signature and insert include `matchedCount`/`archivedCount`
  [`api-webhook-runs.ts:8`](../../job-hunt-dashboard/src/server/routes/api-webhook-runs.ts#L8)

**Types & UI**

- `webhookRunSchema` extended with nullable int fields
  [`schemas.ts:93`](../../job-hunt-dashboard/src/shared/schemas.ts#L93)

- Job column renders stats string for Analysis rows with non-null `itemCount`
  [`history.tsx:49`](../../job-hunt-dashboard/src/client/routes/history.tsx#L49)
