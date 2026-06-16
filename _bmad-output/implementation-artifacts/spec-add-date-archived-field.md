---
title: 'Add date_archived Field and Default Archive Sort'
type: 'feature'
created: '2026-06-12'
status: 'done'
context: []
baseline_commit: '081301fee47b64450ea683670b1f07b9d4df416d'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Archive view has no record of when a job was archived, and its default sort (fitScore desc) is meaningless in an archive context where recency matters more.

**Approach:** Add a nullable `date_archived` TEXT column to the jobs table (full ISO 8601 datetime string). Populate it at all three archive code paths — bulk-archive endpoint, PATCH endpoint, and analysis-service auto-archive. Clear it on unarchive. Display only the date portion (`slice(0, 10)`) in the UI. Add an `initialSort` prop to `PipelineTable` and pass `date_archived desc` from the Archive route.

## Boundaries & Constraints

**Always:**
- `date_archived` format: full ISO 8601 datetime (`new Date().toISOString()`). Display only the date portion (`slice(0, 10)`) in the UI — lexicographic sort on the full datetime remains correct.
- Set `date_archived` only when `archived` transitions to `true`; clear to `null` when unarchived via PATCH.
- Migration uses the existing `JOBS_NULLABLE_COLUMNS` repair pattern in `migrate.ts` — no new migration files needed.
- The column is defined in `PipelineTable.staticColumns` but not added to any `fixedColumns` list — it remains hidden in all views. Sorting by a hidden column is supported by TanStack Table.

**Ask First:**
- If the user wants `date_archived` as a visible column in the Archive view.

**Never:**
- Change the default sort of Jobs, Matches, or Applications views.
- Expose `dateArchived` in `jobInputSchema` (scraper-facing) — it belongs only in `jobSchema`.

## I/O & Edge-Case Matrix

| Scenario | Action | `archived` | `date_archived` |
|---|---|---|---|
| Bulk archive | POST /bulk-archive | `true` | current UTC datetime |
| Single archive via drawer | PATCH /:id `{ archived: true }` | `true` | current UTC datetime |
| Unarchive via drawer | PATCH /:id `{ archived: false }` | `false` | `null` |
| Analysis auto-archive (skip) | analysis-service sets `archived: true` | `true` | current UTC datetime |
| Already archived (no-op PATCH) | `archived` field not in PATCH body | unchanged | unchanged |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/db/schema.ts` -- add `dateArchived` column to jobs table definition
- `job-hunt-dashboard/src/db/migrate.ts` -- add `date_archived` to `JOBS_NULLABLE_COLUMNS` repair list
- `job-hunt-dashboard/src/shared/schemas.ts` -- add `dateArchived` to `jobSchema` (not `jobInputSchema`)
- `job-hunt-dashboard/src/server/routes/api-jobs.ts` -- set/clear `dateArchived` in bulk-archive and PATCH handler
- `job-hunt-dashboard/src/server/services/analysis-service.ts` -- set `dateArchived` in auto-archive spread
- `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx` -- add hidden `date_archived` column; add `initialSort` prop
- `job-hunt-dashboard/src/client/routes/archived.tsx` -- pass `initialSort={[{ id: 'date_archived', desc: true }]}`

## Tasks & Acceptance

**Execution:**
- [ ] `job-hunt-dashboard/src/db/schema.ts` -- ADD `dateArchived: text('date_archived')` to the `jobs` sqliteTable definition, in the user-owned fields block alongside `dateApplied`.
- [ ] `job-hunt-dashboard/src/db/migrate.ts` -- ADD `['date_archived', 'TEXT']` to the `JOBS_NULLABLE_COLUMNS` array so it is applied as a repair migration on startup.
- [ ] `job-hunt-dashboard/src/shared/schemas.ts` -- ADD `dateArchived: z.string().nullable()` to `jobSchema` (inside the `.extend({...})` block, not in `jobInputSchema`).
- [ ] `job-hunt-dashboard/src/server/routes/api-jobs.ts` -- In `/bulk-archive`: include `dateArchived: new Date().toISOString()` in the `.set({...})` call. In `PATCH /:id`: when `patch.archived === true` set `updateFields.dateArchived = new Date().toISOString()`; when `patch.archived === false` set `updateFields.dateArchived = null`.
- [ ] `job-hunt-dashboard/src/server/services/analysis-service.ts` -- ADD `dateArchived: new Date().toISOString()` to the conditional spread that sets `archived: true` for skipped jobs.
- [ ] `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx` -- ADD a hidden `date_archived` column to `staticColumns` (accessor `dateArchived`, id `date_archived`, header `Date Archived`, cell renders the date string sliced to 10 chars). ADD optional `initialSort?: SortingState` prop; default to `[{ id: 'fitScore', desc: true }]` when not provided.
- [ ] `job-hunt-dashboard/src/client/routes/archived.tsx` -- PASS `initialSort={[{ id: 'date_archived', desc: true }]}` to `<PipelineTable>`.

**Acceptance Criteria:**
- Given a job is bulk-archived, when the DB is inspected, then `date_archived` is set to current UTC ISO datetime.
- Given a job is archived via the drawer (PATCH), when the DB is inspected, then `date_archived` is set to current UTC ISO datetime.
- Given a job is unarchived via the drawer (PATCH `archived: false`), then `date_archived` is `null`.
- Given a job is auto-archived by analysis (skip), then `date_archived` is set to current UTC ISO datetime.
- Given the Archive view is opened, the default sort is by `date_archived` descending (most recently archived first).
- Given the app starts with existing archived jobs (no `date_archived` yet), the startup repair migration adds the column without error.

## Verification

**Commands:**
- `bun x tsc --noEmit` (run from `job-hunt-dashboard/`) -- expected: zero new type errors in changed files

**Manual checks:**
- Archive a job, open Archive view — it appears at the top of the list.
- Restart the server against an existing DB — no migration errors in console.
