---
title: 'Always-filled job analysis with four-field expectation/requirement schema'
type: 'feature'
created: '2026-06-17'
status: 'done'
baseline_commit: '9d6fa90'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The analysis prompt branches on score (<50 returns null assessment fields) and exposes four fields (role_fit, red_flags, requirements_met, requirements_missed) that conflate "does the job fit me" with "do I fit the job". The UI shows them as plain prose with no per-item match signal.

**Approach:** Make the model always score 1–99 and always return a fully-filled JSON. Replace the four fields with `job_reqs_met` / `job_reqs_missed` (job vs. candidate expectations) and `candidate_reqs_met` / `candidate_reqs_missed` (candidate vs. job requirements). Each field is one comma-separated shorthand string where every bullet is prefixed with a match marker (`+` full, `~` partial, `-` missing) the UI renders as ✓/○/✕. Carry the change through prompt → DB (data-preserving migration) → service → shared schema → UI → tour demo → tests.

## Boundaries & Constraints

**Always:**
- Keep the analysis prompt cache structure intact: stable prefix (intro + `{{CANDIDATE_PROFILE_JSON}}` + preferences + scoring + output schema) stays first and byte-identical across jobs; the volatile `JOB LISTING:\n{{JOB_LISTING_JSON}}` section stays last. Do not move or alter the `JOB LISTING:` marker — `ANALYSIS_JOB_LISTING_MARKER` is the cache breakpoint.
- The DB migration runs against a live hosted multi-user SQLite DB: add the new columns, UPDATE to copy existing data across, then drop the old columns — no data loss. Column data mapping: `requirements_met→job_reqs_met`, `requirements_missed→job_reqs_missed`, `role_fit→candidate_reqs_met`, `red_flags→candidate_reqs_missed`.
- Rename the fields **everywhere** they appear, not only the files listed in intent: also `src/shared/schemas.ts`, `src/client/utils/jobMatchesKeyword.ts`, `src/client/components/pipeline/PipelineTable.tsx`.
- The prompt must instruct the model to prefix every bullet in all four fields with one of `+`, `~`, `-`.

**Ask First:** none anticipated.

**Never:**
- Do not keep `role_fit` / `red_flags` as renamed survivors — they are dropped with no separate replacement (their *data* is copied into candidate_reqs_* per the mapping, but the concepts are gone).
- Do not change the cache-breakpoint logic in analysis-service `buildAnalysisContent`.
- Do not change unrelated prompt flows (cover_letter, resume).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Marker-prefixed bullet | `"+5+ yrs TS"` | Renders green ✓ + text "5+ yrs TS" (marker stripped) | N/A |
| Partial marker | `"~Go (Rust transferable)"` | Renders orange ○ + text "Go (Rust transferable)" | N/A |
| Missing marker | `"-No Kubernetes exp"` | Renders red ✕ + text "No Kubernetes exp" | N/A |
| Backfilled marker-less bullet in a *_met field | `"5 yrs Python"` (no leading +/~/-) | Default green ✓ + full text | N/A |
| Backfilled marker-less bullet in a *_missed field | `"No AWS"` | Default red ✕ + full text | N/A |
| Empty / null field | `null` or `""` | Render nothing (existing guard preserved) | N/A |
| Whitespace / empty segments after split | `"+a, , +b"` | Drop empties, render only "a" and "b" | N/A |

</frozen-after-approval>

## Code Map

- `src/server/services/prompt-defaults.ts` -- analysis `userMessage` template; rewrite output schema to always-filled four-field shape with marker instructions. Keep `ANALYSIS_JOB_LISTING_MARKER` and prefix/listing split.
- `src/db/schema.ts` -- jobs table (~L20–23): drop the four old `text()` columns, add `jobReqsMet`/`jobReqsMissed`/`candidateReqsMet`/`candidateReqsMissed`.
- `src/db/migrations/` -- new generated migration, hand-edited to add+copy+drop (data-preserving).
- `src/db/migrate.ts` -- `JOBS_NULLABLE_COLUMNS` drift guard; add the four new columns so a drifted live DB self-heals.
- `src/server/services/analysis-service.ts` -- `AnalysisResult` interface (~L36–39, snake_case to match model JSON) + insert/update mapping (~L235–238, camelCase drizzle keys).
- `src/shared/schemas.ts` -- `jobInputSchema` (~L10–13): rename the four `z.string().nullable()` fields; `jobSchema` extends it so `Job` type follows.
- `src/client/components/detail/JobDrawer.tsx` (~L264–269) -- 2×2 grid, four labelled `AssessmentSection`s reading the new fields.
- `src/client/components/detail/AssessmentSection.tsx` -- split comma-separated string, strip+map +/~/- markers to ✓/○/✕, marker-less fallback per field polarity.
- `src/client/utils/jobMatchesKeyword.ts` (~L15–18) -- update search haystack field names.
- `src/client/components/pipeline/PipelineTable.tsx` (~L218) -- "Notes" column currently reads `roleFit`; point it at `candidateReqsMet` (role_fit's data destination).
- `src/client/routes/tour.tsx` (~L519–561) -- marketing demo drawer + demo job data; restructure to the new four fields with marker examples.
- Tests: `analysis-service.test.ts`, `api-jobs.test.ts`, `api-admin.test.ts`, `api-cover-letter.test.ts`, `api-resume.test.ts`, `api-stats.test.ts`, `api-ingest.test.ts`, `discovery-service.test.ts`, `user-embeddings.test.ts`, plus any other hit by grep (`cover-letter-service.test.ts`, `resume-e2e.test.ts`, `resume-service.test.ts`).

## Tasks & Acceptance

**Execution:**
- [x] `src/server/services/prompt-defaults.ts` -- Remove the score-<50 / score-≥50 branch. Single always-filled JSON schema: `score` (1–99), the four new fields, `salary`, `benefits`, `contact_name`, `contact_email`, `contact_phone`, `recommended_action`. Add short instructions defining each field's meaning, the comma-separated-shorthand format, and the `+`/`~`/`-` marker convention. Keep stable-prefix-then-`JOB LISTING:` ordering byte-identical across jobs.
- [x] `src/db/schema.ts` -- Replace the four old columns with `jobReqsMet`, `jobReqsMissed`, `candidateReqsMet`, `candidateReqsMissed` (all `text()`).
- [x] `src/db/migrations/<new>.sql` -- `bun run db:generate`, then hand-edit so order is: ADD four new columns → `UPDATE jobs SET ...` copying old→new per mapping → DROP the four old columns. Apply with `bun run db:migrate`.
- [x] `src/db/migrate.ts` -- Add the four new columns to `JOBS_NULLABLE_COLUMNS` for drift self-heal.
- [x] `src/server/services/analysis-service.ts` -- Update `AnalysisResult` to the four new snake_case fields; update the drizzle `.set({...})` mapping to camelCase keys. Drop `roleFit`/`redFlags`/`requirementsMet`/`requirementsMissed`.
- [x] `src/shared/schemas.ts` -- Rename the four fields in `jobInputSchema`.
- [x] `src/client/components/detail/AssessmentSection.tsx` -- Accept comma-separated string; split/trim, drop empties; per bullet read leading +/~/- → ✓ (emerald) / ○ (amber) / ✕ (red), strip marker from text. Marker-less fallback via a prop (e.g. `defaultMet: boolean`): green for *_met fields, red for *_missed. Preserve null/empty guard.
- [x] `src/client/components/detail/JobDrawer.tsx` -- Keep `grid grid-cols-2`. Four `AssessmentSection`s: "Job Meets Expectations"→`jobReqsMet`, "Job Falls Short"→`jobReqsMissed`, "Requirements Met"→`candidateReqsMet`, "Requirements Missed"→`candidateReqsMissed`, passing the met/missed fallback flag.
- [x] `src/client/utils/jobMatchesKeyword.ts` -- Swap the four field names in the haystack.
- [x] `src/client/components/pipeline/PipelineTable.tsx` -- Point the "Notes" accessor at `candidateReqsMet`.
- [x] `src/client/routes/tour.tsx` -- Update demo job data + drawer to render the four new categories with `+`/`~`/`-` marker examples.
- [x] Test files -- Grep for all old names (snake_case and camelCase) and update to new names/shape; assert always-filled output and marker handling where relevant.

**Acceptance Criteria:**
- Given an analysis run, when the model returns JSON, then all four assessment fields are populated for every job regardless of score, and each is persisted to its new column.
- Given an existing job analyzed before this change, when the migration runs, then its old field values appear under the mapped new columns (`requirements_met`→`job_reqs_met`, `requirements_missed`→`job_reqs_missed`, `role_fit`→`candidate_reqs_met`, `red_flags`→`candidate_reqs_missed`) with zero data loss.
- Given a field string with mixed/absent markers, when the drawer renders, then each bullet shows the correct ✓/○/✕ icon (with polarity-based fallback for marker-less bullets) and no marker character in the text.
- Given the full suite, when `bun test` and the type-check run, then both pass.

## Design Notes

Marker mapping in `AssessmentSection`: `+`→emerald ✓, `~`→amber ○, `-`→red ✕. Example field value: `"+5+ yrs TypeScript, ~Go (Rust transferable), -No Kubernetes exp"`. Note bullets may legitimately contain `+` mid-text (e.g. "5+ yrs") — only the *first* character is the marker; strip exactly one leading marker char, not all.

The `AnalysisResult` interface stays snake_case (it mirrors the raw model JSON); only the DB/drizzle layer and TS-facing schema use camelCase.

## Verification

**Commands:**
- `bun run db:generate && bun run db:migrate` -- expected: migration applies, jobs table has the four new columns and none of the old four; existing rows retain mapped data.
- `bun test` -- expected: full suite green.
- `bunx tsc --noEmit` (or the project's type-check script) -- expected: no type errors.

**Manual checks:**
- Open a job drawer: four labelled sections render bulleted ✓/○/✕ lists; empty fields render nothing.
- Tour page demo drawer reflects the new four-field structure.

## Suggested Review Order

**Prompt contract (start here)**

- Always-filled schema + four fields + `+`/`~`/`-` marker convention; defines the whole change.
  [`prompt-defaults.ts:31`](../../job-hunt-dashboard/src/server/services/prompt-defaults.ts#L31)

**Schema & data migration (highest risk — live DB)**

- New columns replace the four old ones.
  [`schema.ts:20`](../../job-hunt-dashboard/src/db/schema.ts#L20)
- Data-preserving migration: add → copy (old→new mapping) → drop.
  [`0035_analysis_req_fields.sql:1`](../../job-hunt-dashboard/src/db/migrations/0035_analysis_req_fields.sql#L1)
- Drift self-heal adds the new columns if a DB missed the migration.
  [`migrate.ts:21`](../../job-hunt-dashboard/src/db/migrate.ts#L21)

**Service mapping**

- `AnalysisResult` (snake_case, mirrors model JSON) and the drizzle insert mapping.
  [`analysis-service.ts:34`](../../job-hunt-dashboard/src/server/services/analysis-service.ts#L34)
  [`analysis-service.ts:235`](../../job-hunt-dashboard/src/server/services/analysis-service.ts#L235)
- Shared `Job` type follows the rename.
  [`schemas.ts:10`](../../job-hunt-dashboard/src/shared/schemas.ts#L10)

**UI rendering**

- Marker → ✓/○/✕ parse, marker stripping, polarity fallback for backfilled bullets.
  [`AssessmentSection.tsx:17`](../../job-hunt-dashboard/src/client/components/detail/AssessmentSection.tsx#L17)
- 2×2 grid binds the four fields with met/missed fallback flags.
  [`JobDrawer.tsx:265`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L265)
- Notes column repointed; strips markers for the compact cell.
  [`PipelineTable.tsx:218`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L218)
- Keyword search haystack updated.
  [`jobMatchesKeyword.ts:15`](../../job-hunt-dashboard/src/client/utils/jobMatchesKeyword.ts#L15)

**Marketing demo & tests (peripherals)**

- Tour demo restructured to the four fields with marker examples.
  [`tour.tsx:89`](../../job-hunt-dashboard/src/client/routes/tour.tsx#L89)
- Service test: always-filled mock + new-column assertions.
  [`analysis-service.test.ts:76`](../../job-hunt-dashboard/src/server/services/analysis-service.test.ts#L76)
