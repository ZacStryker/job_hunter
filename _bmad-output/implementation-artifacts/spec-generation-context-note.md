---
title: 'Generation context note — "Anything else I should know?"'
type: 'feature'
created: '2026-07-13'
status: 'done'
baseline_commit: '815f1d3'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Document generation is one-shot. The model has the job description and the candidate
profile, but nothing else — so a referral name, an anecdote from a recruiter call, or "lead with the
payments migration, not the ML work" cannot reach it. The user's only response to a draft missing
that context is to regenerate and hope.

**Approach:** A per-job, user-owned note — *"Anything else I should know?"* — persisted on `jobs` and
**appended to the existing `jobDetails` string** that already interpolates into the `{{JOB_DETAILS}}`
placeholder. Both cover letter and resume generation pick it up with **no new prompt placeholder and
no new table**. One note per job, shared by both documents (a referral is a referral regardless of
which artifact is being written).

## Boundaries & Constraints

**Always:**
- Multi-tenant. Every query scopes on `userId`; privilege decisions on `sessionUserId`.
- Client mutations go through the existing `useJobMutation` → `apiFetch` (CSRF, or it 403s).
- Cross-boundary types only in `src/shared/schemas.ts`.
- **A new `jobs` column must be added in LOCKSTEP to all 10 hand-rolled test DDLs** *and* to
  `JOBS_NULLABLE_COLUMNS` in `migrate.ts`. See Design Notes — this is the highest-risk task here.
- Bun, not Node. Relative imports carry no file extension.

**Ask First:**
- If `bun run db:generate` emits a migration touching **any table other than `jobs`** — stop, do not
  apply it.
- If satisfying the note appears to require a new prompt placeholder — stop (see **Never**).

**Never:**
- **Do NOT add `generationContext` to the ingest `onConflictDoUpdate.set` block**
  (`ingest-service.ts`). That block is scraper-owned; adding it there would clobber the user's note
  on every re-scrape.
- **Do NOT invent a `{{USER_CONTEXT}}` placeholder.** Users can override prompts in the `prompts`
  table; a new placeholder would silently vanish from any custom prompt, dropping the note with no
  error. Append to `jobDetails` instead.
- Do NOT add `generationContext` to `jobInputSchema` — that is the ingest/scraper input shape, and
  this field is user-owned.
- No new npm dependencies. No toasts (`sonner` at `JobDrawer.tsx:17` is drift — do not extend it).
- Out of scope, already deferred (`deferred-work.md`, 2026-07-13): cover-letter editing, version
  history, the `/documents/:jobId/:docType` editor route, resume editing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save note | `PATCH /api/jobs/:id` `{ generationContext: "Sarah Chen referred me." }`, job owned by caller | `200`; `jobs.generation_context` updated | N/A |
| Note is the **only** field | Body carries no other allowlisted key | `200` — must **not** fall into the existing `hasFields` guard | N/A |
| Clear note | `{ generationContext: null }` or `''` | Stored as `null` | N/A |
| Cross-tenant write | User B PATCHes user A's job | `404 { error: 'Not found' }`; A's row **unchanged** | `{ error }` + 404 |
| Oversized note | `> 5000` chars | Rejected by the Zod allowlist | `{ error }` + 400 |
| Generate **with** note | `job.generationContext` non-empty | Note appended to `jobDetails` → reaches `{{JOB_DETAILS}}` in **both** cover-letter and resume prompts | N/A |
| Generate **without** note | `null` or `''` | `jobDetails` is **byte-identical to today** (no trailing label, no empty section) | N/A |
| Re-scrape | Ingest upsert hits an existing job that has a note | `generation_context` **preserved** | N/A |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` -- `jobs` table; add to the **User-owned** block (~:31-40), beside `coverLetterSentAt`
- `src/db/migrations/` -- drizzle output; `bun run db:generate` produces `0040_*.sql` + journal entry
- `src/db/migrate.ts` -- `JOBS_NULLABLE_COLUMNS` (~:7-24), the startup drift-repair list
- `src/shared/schemas.ts` -- `jobSchema` (~:29-43). **Not** `jobInputSchema`
- `src/server/routes/api-jobs.ts` -- `jobPatchSchema` allowlist (:39-44); the `hasFields` guard and
  `updateFields` builder in the PATCH handler (~:283-300)
- `src/server/services/cover-letter-service.ts` -- `jobDetails` (:109-113) → `{{JOB_DETAILS}}` (:116)
- `src/server/services/resume-service.ts` -- `jobDetails` (:78-81) → `{{JOB_DETAILS}}` (:84)
- `src/server/services/ingest-service.ts` -- upsert `set` block. **Read-only reference; do not edit**
- `src/client/components/detail/JobDrawer.tsx` -- Documents tab (:368); the grid opens at :369.
  Reuse the draft/save/error pattern at :114-134 and the existing `useJobMutation`
- **10 test files with a hand-rolled `jobs` DDL:** `api-jobs.test.ts`, `api-ingest.test.ts`,
  `api-resume.test.ts`, `api-cover-letter.test.ts`, `api-stats.test.ts`, `api-admin.test.ts`,
  `analysis-service.test.ts`, `discovery-service.test.ts`, `user-embeddings.test.ts`, `migrate.test.ts`

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- add `generationContext: text('generation_context')` to the User-owned block -- nullable, no default; user-owned like `statusOverride`
- [x] `src/db/migrations/` -- run `bun run db:generate` -- produces the `ALTER TABLE jobs ADD COLUMN` migration; verify it touches **only** `jobs`
- [x] `src/db/migrate.ts` -- add `['generation_context', 'TEXT']` to `JOBS_NULLABLE_COLUMNS` -- self-repair for drifted DBs, matching every other nullable `jobs` column
- [x] **All 10 test files above** -- add `generation_context TEXT,` to each hand-rolled `CREATE TABLE IF NOT EXISTS jobs` -- **lockstep, single commit.** One divergent DDL breaks *other* files (see Design Notes)
- [x] `src/shared/schemas.ts` -- add `generationContext: z.string().nullable()` to `jobSchema` -- client reads it off the `Job` type
- [x] `src/server/routes/api-jobs.ts` -- add `generationContext: z.string().max(5000).nullable().optional()` to `jobPatchSchema`; add it to the `hasFields` guard **and** the `updateFields` builder -- all three, or a note-only PATCH 400s
- [x] `src/server/services/cover-letter-service.ts` -- append the note to `jobDetails` when non-empty -- reaches `{{JOB_DETAILS}}` unchanged
- [x] `src/server/services/resume-service.ts` -- same append, newline-delimited to match its format
- [x] `src/client/hooks/useJobMutation.ts` -- add `generationContext?: string \| null` to the hook-local `JobPatch` type -- **found during implementation:** the hook declares its own patch shape, so the allowlist alone is not enough; its `{ ...j, ...patch }` spread then gives the note an optimistic update for free
- [x] `src/client/components/detail/JobDrawer.tsx` -- collapsed disclosure row **above** the grid (:369), spanning both columns
- [x] Tests -- note-only PATCH succeeds; cross-tenant PATCH 404s and leaves A's row intact; note reaches `jobDetails` in both services; absent note leaves `jobDetails` byte-identical; ingest upsert preserves the note

**Acceptance Criteria:**
- Given a job with a saved note, when the user regenerates the cover letter, then the note text is present in the Anthropic request body's `{{JOB_DETAILS}}` substitution.
- Given a job with **no** note, when either document is generated, then the outgoing `jobDetails` string is byte-identical to the pre-change output.
- Given a job with a note, when the scraper re-ingests that job, then `generation_context` is unchanged.
- Given user A's job carries a note, when user B PATCHes `generationContext` on that job id, then the response is 404 and A's note is unchanged.
- Given the Documents tab with an empty note, when it renders, then the disclosure is collapsed and the A4 previews sit exactly where they do today.
- Given `bun run typecheck`, when run, then it exits green.

## Design Notes

**The DDL lockstep trap — read before touching `schema.ts`.** One `bun test` process shares one
in-memory DB. Every test file's `CREATE TABLE IF NOT EXISTS jobs` therefore **no-ops if another file
got there first** — the first file to run defines `jobs` for the whole suite. Drizzle's
`db.select().from(jobs)` enumerates every column in `schema.ts` by name, so if the winning DDL lacks
`generation_context`, *every* query against `jobs` across *all* files fails with `no such column`.
This has already cost this repo **33 failures in one hit** (`deferred-work.md`, 2026-07-12). All 10
DDLs change together or none do. Tests pass in isolation and fail together — do not trust a
single-file run.

**The `jobDetails` append.** Label the note so the model knows whose voice it is, and emit **nothing
at all** when it is empty (an empty labelled section invites the model to acknowledge it):

```ts
// cover-letter-service.ts — space-delimited, matching its existing single-line format
const jobDetails =
  'Role: Company: ' + job.company + ' Title: ' + job.jobTitle +
  ' Location: ' + (job.location ?? '') + ' Description: ' + (job.jobDescription ?? '') +
  (job.generationContext?.trim()
    ? ' Additional context from the candidate: ' + job.generationContext.trim()
    : '')
```

`resume-service.ts` takes the same guard but `'\nAdditional context from the candidate: '` —
its `jobDetails` is newline-delimited.

**UI — use the existing slot, add no new rows.** The note spans **both** columns and sits **above**
the grid, so reading order matches the mental model: brief the writer, *then* generate. Collapsed it
is **one subtle row** in the existing `text-xs text-zinc-500 uppercase tracking-wide` label idiom —
**not a card, not a bordered panel**. Expanded it reveals a textarea reusing the Description tab's
draft/save/error pattern (`:114-134`). It must never grow tall enough to push the `aspect-[210/297]`
previews out of view — those previews anchor the layout. Feedback is the inline
`text-xs text-red-400` line (`:412`); **no toast** — the UX spec bans them outright. Colour is
reserved for score badges, so the disclosure is a zinc ghost. No confirmation dialog: the write is
reversible by editing the field back.

## Verification

**Commands:**
- `bun test 2>&1 | tee /tmp/baseline.txt` -- **run BEFORE any edit.** Baseline is RED (~43 failures). Record failing test **names**
- `bun test` -- expected: no *new* failing test names vs. baseline. Diff names, never counts
- `bun run typecheck` -- expected: green (it is green today; keep it)

**Manual checks:**
- Open a job's Documents tab: the disclosure is collapsed, one row, above the grid; both A4 previews sit where they do today.
- Type a note ("Sarah Chen referred me — lead with payments, not ML"), save, reopen the drawer: the note persisted.
- Regenerate the cover letter: the referral name is **woven into the prose**, not appended as a stray line.
- Clear the note, regenerate: output shows no trace of a context section.

## Suggested Review Order

**The prompt seam — start here (this is the whole feature)**

- The note rides the existing `{{JOB_DETAILS}}` string; no new placeholder, so a custom prompt can't drop it.
  [`cover-letter-service.ts:118`](../../job-hunt-dashboard/src/server/services/cover-letter-service.ts#L118)

- Review-found bug: the string form of `replaceAll` expands `$$`/`$&`/`` $` ``/`$'`; a note saying "$5k" corrupted the prompt.
  [`cover-letter-service.ts:122`](../../job-hunt-dashboard/src/server/services/cover-letter-service.ts#L122)

- Same append + same `$`-expansion fix, newline-delimited to match this service's format.
  [`resume-service.ts:86`](../../job-hunt-dashboard/src/server/services/resume-service.ts#L86)

**The write path — three edits, not one**

- The Zod allowlist. Widening it alone is NOT enough — see the next two stops.
  [`api-jobs.ts:44`](../../job-hunt-dashboard/src/server/routes/api-jobs.ts#L44)

- The second field enumeration. Miss it and a note-only PATCH returns `400 No updatable fields provided`.
  [`api-jobs.ts:290`](../../job-hunt-dashboard/src/server/routes/api-jobs.ts#L290)

- Normalizes `''`/whitespace to `null` server-side, so a cleared note can't linger as an empty string.
  [`api-jobs.ts:323`](../../job-hunt-dashboard/src/server/routes/api-jobs.ts#L323)

**Schema and migration**

- User-owned column, deliberately placed in the user-owned block — the ingest `set` block never touches it.
  [`schema.ts:35`](../../job-hunt-dashboard/src/db/schema.ts#L35)

- Added to the startup drift-repair list, like every other nullable `jobs` column.
  [`migrate.ts:25`](../../job-hunt-dashboard/src/db/migrate.ts#L25)

- The generated migration: a single `ALTER TABLE jobs`, nothing else.
  [`0040_previous_swarm.sql`](../../job-hunt-dashboard/src/db/migrations/0040_previous_swarm.sql)

**UI — the design rules live or die here**

- Review-found: Generate now flushes an unsaved note first, or "brief the writer, then generate" silently didn't.
  [`JobDrawer.tsx:167`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L167)

- The disclosure: one row, above the grid, spanning both columns. No card, no border, no new button.
  [`JobDrawer.tsx:424`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L424)

- Both Generate buttons route through the flush; the columns themselves are otherwise untouched.
  [`JobDrawer.tsx:482`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L482)

**Types and tests (peripheral)**

- Cross-boundary type; `jobInputSchema` (ingest input) deliberately left alone.
  [`schemas.ts:35`](../../job-hunt-dashboard/src/shared/schemas.ts#L35)

- The hook declares its own patch shape — the allowlist alone would not have compiled.
  [`useJobMutation.ts:10`](../../job-hunt-dashboard/src/client/hooks/useJobMutation.ts#L10)

- Tenant isolation proven: seeded as user 2, acted as user 1, asserted A's note survives.
  [`api-jobs.test.ts:387`](../../job-hunt-dashboard/src/server/routes/api-jobs.test.ts#L387)

- The `$`-pattern regression test, and the note surviving quotes/newlines through JSON.
  [`cover-letter-service.test.ts:155`](../../job-hunt-dashboard/src/server/services/cover-letter-service.test.ts#L155)

- `generation_context TEXT` added to all 10 hand-rolled `jobs` DDLs in lockstep — the suite's known landmine.
  [`migrate.test.ts:44`](../../job-hunt-dashboard/src/db/migrate.test.ts#L44)
