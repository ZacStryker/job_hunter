---
title: 'Cover letter editing + version history (G2 + G6)'
type: 'feature'
created: '2026-07-13'
status: 'ready-for-dev'
baseline_commit: '7e510e0'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Generating a cover letter is one-shot and its only verb is *reroll*. A draft with one
wrong sentence — an overclaimed bullet, a misspelled hiring manager, the wrong emphasis — cannot be
fixed. The user regenerates and hopes. Meanwhile `cover_letters` has been **append-only since it was
created**: every draft ever generated is still in the database, and none of it is reachable from the
UI. The history already exists. It is simply invisible.

**Approach:** Give the existing checkpoint a verb other than reroll. A two-pane editor route
(`/documents/:jobId/:docType`) — textarea left, live preview right — writes edits back as a **new
append-only row** tagged `source: 'edited'`, re-renders the PDF, and exposes the row history as a
version dropdown that can restore any prior draft. **No Anthropic call: this is a render, not a
generation.** The fast path (one click, PDF appears) is untouched.

**Why G2 and G6 are one spec and must not be split.** G2's `PUT` writes `source: 'edited'` — the
column G6 adds — so G2 alone cannot label its own output. And G2 without G6 gives the user an edit
they can neither see nor revert, violating the UX spec's own rule that *"all writes are immediately
reversible"* (`ux-consistency-patterns.md:71`). Editing is only safe **because** the history is
browsable. One spec, both goals.

## Boundaries & Constraints

**Always:**
- Multi-tenant. Every query scopes on `userId`; privilege decisions on `sessionUserId`.
- Client mutations go through `apiFetch` (`src/client/lib/api.ts`), never bare `fetch()` — CSRF, or it 403s.
- Cross-boundary types only in `src/shared/schemas.ts`. API responses are bare data; errors are `{ error }` + status.
- **`cover_letters` stays append-only.** Edit and restore both **INSERT**. Nothing in this change may `UPDATE` or `DELETE` a `cover_letters` row.
- **Every write that changes the PDF must bump `jobs.coverLetterSentAt`.** It is the cache-buster in both the preview `<iframe src>` and the Download href (`?t=${job.coverLetterSentAt}`, `JobDrawer.tsx:473,511`). Skip the bump and the user saves an edit and is served the **stale PDF**. This is not bookkeeping.
- **The `source` column must be added in LOCKSTEP to all 5 hand-rolled `cover_letters` test DDLs.** See Design Notes — this is the highest-risk task here and has bitten this repo three times.
- Bun, not Node. Relative imports carry no file extension.

**Ask First:**
- If `bun run db:generate` emits a migration touching **any table other than `cover_letters`** — stop, do not apply it.
- If the live preview appears to need a server round-trip or Playwright — stop. It does not (see Design Notes).

**Never:**
- **No Anthropic call on any path in this spec.** Edit and restore are renders. If a task seems to need the model, it is out of scope.
- **No per-version PDF files.** The PDF is one file per *job* (`DATA_DIR/cover-letters/{jobId}.pdf`) and is always the *current* one. Versions live in the DB. Do not invent `{jobId}-{versionId}.pdf`.
- **No new npm dependencies.** No `dnd-kit`, no diff library, no rich-text editor. A plain `<textarea>`.
- **No toasts** (`sonner` at `JobDrawer.tsx:17` is drift — do not extend it). **No confirmation dialogs** (`ux-consistency-patterns.md:71`). **No colour** on new affordances — it is reserved for score badges. Zinc ghosts only.
- **Zero new rows and zero new buttons in the Documents-tab columns.** `[Edit]` joins the *existing* header row beside Download; the version control *replaces* the date. Net new pixels: zero. See Design Notes.
- Out of scope, still deferred (`deferred-work.md`): resume editing (**G3** — needs a `resumes` table first), provenance highlighting (**G4**), regenerate-with-instruction (**G5**), and the `prompts` user-scoping defect.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save an edit | `PUT /api/jobs/:id/cover-letter` `{ content }`, job owned by caller | `200`; **new** `cover_letters` row, `source: 'edited'`; PDF re-rendered; `coverLetterSentAt` bumped | N/A |
| Save is non-destructive | A prior version exists | Prior row still present and still restorable **after** the save | N/A |
| Empty / whitespace content | `{ content: '   ' }` | Rejected — a blank letter is not a letter | `{ error }` + 400 |
| Oversized content | `> 20000` chars | Rejected by the Zod schema | `{ error }` + 400 |
| List versions | `GET /api/jobs/:id/cover-letter/versions` | `[{ id, source, createdAt }]`, **newest first**, tie-broken by `id DESC` | N/A |
| List versions, none exist | Job owned by caller, never generated | `200` with `[]` — **not** a 404 | N/A |
| Restore | `POST /api/jobs/:id/cover-letter/versions/:versionId/restore` | **Copies** that row's content into a **new** row; PDF re-rendered; `coverLetterSentAt` bumped. Original row untouched | N/A |
| Restore a foreign version | `:versionId` belongs to another user, or to another job | `404` — must check **both** `userId` **and** `jobId` | `{ error }` + 404 |
| Cross-tenant edit | User B `PUT`s user A's job | `404`; A's rows **unchanged**, A's PDF **unrewritten** | `{ error }` + 404 |
| Cross-tenant list / restore | User B hits A's versions or restore | `404`; A's rows unchanged | `{ error }` + 404 |
| Editor on a never-generated job | User navigates to `/documents/:jobId/cover-letter` with no letter | Explicit empty state — *"Generate a cover letter first."* Not a broken editor, not a silent 404 | N/A |
| Editor on an unknown / foreign job | `:jobId` not owned by caller | Not-found state; no data leak | `{ error }` + 404 |
| `:docType` is `resume` | `/documents/:jobId/resume` | Explicit *"not yet editable"* state — the shell is built generically for G3, but resume editing is **not** in this spec | N/A |
| One version only | Job generated once, never edited | The version control **renders exactly the plain date it renders today** — no chevron, no menu | N/A |
| Unsaved edits, user leaves | Draft is dirty, user clicks Back / Discard | Two-step **inline** Discard (`Discard changes?` in place). **No modal** | N/A |
| Live preview | User types in the textarea | Preview re-renders **client-side**, no server call, no Playwright | N/A |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` -- `coverLetters` (:47-55); add `source: text('source').notNull().default('generated')`
- `src/db/migrations/` -- `bun run db:generate` produces `0041_*.sql` + journal entry; must touch **only** `cover_letters`
- `src/db/migrate.ts` -- has `JOBS_NULLABLE_COLUMNS` (:7) and `WEBHOOK_RUNS_COLUMNS` (:29) but **no `cover_letters` list**. Add `COVER_LETTERS_COLUMNS` + its repair loop, mirroring :43-57
- **5 test files with a hand-rolled `cover_letters` DDL:** `api-cover-letter.test.ts` (:79), `api-jobs.test.ts`, `api-resume.test.ts`, `api-stats.test.ts`, `api-admin.test.ts`
- `src/shared/schemas.ts` -- `coverLetterSchema` gains `source`; add `coverLetterVersionSchema`
- `src/shared/cover-letter-html.ts` -- **NEW.** Extract `buildCoverLetterHtml` + `escHtml` (`cover-letter-service.ts:57-88`) here verbatim. Pure. **One copy, rendered by both client and server, so they cannot drift**
- `src/server/services/cover-letter-service.ts` -- import the extracted builder; **generation logic otherwise untouched**. Export a `renderCoverLetterPdf(content, userId)` that loads the profile, builds the HTML, and calls `generatePdf` — the shared render half for edit + restore
- `src/server/services/generate-pdf.ts` -- `generatePdf(html)` (:3). Pure, call directly. **Read-only reference**
- `src/server/routes/api-jobs.ts` -- the write-and-render block at :383-413 (tmp-write → transaction → rename) is the pattern the new routes reuse. Existing `GET /:id/cover-letter` at :537. Add the three new routes
- `src/client/lib/router.ts` -- routes are **centrally declared**, not file-based. Add `documentsRoute` under `protectedRoute` (:403) with `path: '/documents/$jobId/$docType'`
- `src/client/routes/documents.tsx` -- **NEW.** Route component, exporting `DocumentsRoute` like every sibling
- `src/client/components/config/PromptSection.tsx` -- the draft/dirty/Save/Cancel/error pattern (:27-136). **Reuse, do not reinvent**
- `src/client/components/detail/JobDrawer.tsx` -- Documents tab (:411). Header row (:467-481) takes `[Edit]`; the date at :471 becomes the version control; the `aspect-[210/297]` preview at :510-519 is the visual idiom the editor's preview pane must match

## Tasks & Acceptance

**Execution:**
- [ ] `src/server/routes/api-cover-letter.test.ts` -- **fix the already-red test first** (see Design Notes). It is red *only in the full run*, on the exact read path G6 extends. Do not build on a red test
- [ ] `src/db/schema.ts` -- add `source` to `coverLetters` -- `notNull().default('generated')`, so every existing row reads back as `'generated'` with no backfill
- [ ] `src/db/migrations/` -- `bun run db:generate` -- verify the emitted SQL touches **only** `cover_letters`
- [ ] `src/db/migrate.ts` -- add `COVER_LETTERS_COLUMNS = [['source', "TEXT NOT NULL DEFAULT 'generated'"]]` and its repair loop, mirroring the two existing lists
- [ ] **All 5 test files above** -- add `source TEXT NOT NULL DEFAULT 'generated'` to each hand-rolled `CREATE TABLE IF NOT EXISTS cover_letters` -- **lockstep, single commit.** One divergent DDL breaks *other* files
- [ ] `src/shared/cover-letter-html.ts` -- extract `buildCoverLetterHtml` + `escHtml` verbatim; export both
- [ ] `src/server/services/cover-letter-service.ts` -- import the extracted builder; add exported `renderCoverLetterPdf(content, userId)` -- generation path must be **behaviourally unchanged**
- [ ] `src/shared/schemas.ts` -- `source: z.enum(['generated', 'edited'])` on `coverLetterSchema`; new `coverLetterVersionSchema` (`id`, `source`, `createdAt`)
- [ ] `src/server/routes/api-jobs.ts` -- `PUT /:id/cover-letter` -- validate content (non-blank, ≤20000); INSERT `source: 'edited'`; re-render; bump `coverLetterSentAt`. Reuse the tmp-write → transaction → rename pattern at :383-413
- [ ] `src/server/routes/api-jobs.ts` -- `GET /:id/cover-letter/versions` -- newest first, `createdAt DESC, id DESC`; `[]` when none
- [ ] `src/server/routes/api-jobs.ts` -- `POST /:id/cover-letter/versions/:versionId/restore` -- scope the version lookup on **both** `userId` and `jobId`; INSERT a copy; re-render; bump. Never destructive
- [ ] `src/client/lib/router.ts` -- declare `/documents/$jobId/$docType` under `protectedRoute`
- [ ] `src/client/routes/documents.tsx` -- two-pane shell; `<textarea>` left, `<iframe srcdoc>` live preview right; two-step inline Discard; Back reopens the drawer on the Documents tab
- [ ] `src/client/hooks/` -- `useCoverLetterMutation`, `useCoverLetterVersionsQuery`, `useCoverLetterRestoreMutation`, all via `apiFetch`; invalidate `['jobs']` so `coverLetterSentAt` (the cache-buster) refreshes
- [ ] `src/client/components/detail/JobDrawer.tsx` -- `[Edit]` ghost in the existing header row; the date becomes `v3 · Jul 13 ▾`. **With one version: no chevron, no menu, plain date**
- [ ] Tests -- tenant isolation on all three routes (proven, not assumed); PUT inserts rather than mutates and leaves the prior version restorable; restore of a foreign/other-job `versionId` 404s; blank content 400s; versions returns `[]` not 404

**Acceptance Criteria:**
- Given a generated cover letter, when the user edits the prose and saves, then a **new** `cover_letters` row exists with `source: 'edited'`, the prior row is **still present**, and the downloaded PDF reflects the edit.
- Given an edited letter, when the user opens the version dropdown and restores v1, then a **new** row is inserted carrying v1's content, no row is deleted, and the PDF reverts.
- Given a job with exactly one version, when the Documents tab renders, then the header shows the **plain date it shows today** — no chevron, no dropdown, no new pixels.
- Given user A's job with a cover letter, when user B calls `PUT`, `GET .../versions`, or restore on it, then every response is **404** and A's rows and PDF are unchanged.
- Given the editor with unsaved changes, when the user clicks Discard, then it turns into `Discard changes?` **in place** — no modal appears anywhere in this feature.
- Given the editor is open, when the user types, then the preview pane updates **without any network request**.
- Given `bun test`, when run, then no *new* failing test names vs. baseline — **and `GET /:id/cover-letter > returns 200 with most recent cover letter` now passes**, taking the baseline from 9 failures to 8.
- Given `bun run typecheck`, when run, then it exits green.

## Design Notes

**Fix the red test before you build on it.** `GET /:id/cover-letter > returns 200 with most recent
cover letter` (`api-cover-letter.test.ts:193`) is **red on a clean checkout** — but it passes 14/14
when that file is run alone. It is cross-file pollution: one `bun test` process shares one in-memory
DB, the test does `SELECT id FROM jobs LIMIT 1`, and by the time it runs another file has already
seeded `jobs` — so it grabs a **stale job id** whose cover letters were written by an earlier test
with a *newer* `created_at` than the `2026-04-01`/`2026-04-02` rows it just inserted. The assertion
then reads someone else's letter. Fix it by selecting the id it actually inserted
(`last_insert_rowid()`), not `LIMIT 1`. This is the read path G6 extends — leaving it red means the
one test guarding "most recent wins" is not guarding anything.

**The DDL lockstep trap — read before touching `schema.ts`.** One `bun test` process shares one
in-memory DB. Every test file's `CREATE TABLE IF NOT EXISTS cover_letters` **no-ops if another file
got there first** — the first file to run defines the table for the whole suite. Drizzle's
`db.select().from(coverLetters)` enumerates every column in `schema.ts` by name, so if the winning
DDL lacks `source`, *every* query against `cover_letters` across *all* files fails with
`no such column`. This has already cost this repo **33 failures in one hit** (`deferred-work.md`,
2026-07-12), and `deferred-work.md` names it "the third story threatened by the same root cause."
All 5 DDLs change together or none do. **Tests pass in isolation and fail together — a single-file
run proves nothing.**

**The PDF is per-job, not per-version.** `api-jobs.ts:384` writes
`DATA_DIR/cover-letters/{jobId}.pdf` — one file, overwritten on every generate. Keep it that way.
The DB row *is* the version; the PDF is merely the current render. Restore re-renders over the same
path. Do not build a per-version PDF store: it would multiply disk usage, and nothing reads it.

**`coverLetterSentAt` is the cache-buster, not a timestamp.** Both the preview iframe (`:511`) and
the Download link (`:473`) append `?t=${job.coverLetterSentAt}`. If a save re-renders the PDF but
does not bump that column, the browser serves the **cached previous PDF** and the user concludes the
edit was lost. Every PDF-changing route bumps it, inside the same transaction as the INSERT.

**Restoring v1 does not reproduce v1's PDF byte-for-byte — and that is correct.**
`buildCoverLetterHtml` stamps `new Date()` at render time (`cover-letter-service.ts:64`). The letter
is dated **when it is rendered**, not when it was drafted. A restored letter therefore carries
today's date. This is the desired behaviour — you are sending it today — but it must be a *decision*
on the record, or a future reader will "fix" it into a stored date. The **prose** is restored
verbatim; only the date line moves.

**The live preview needs no server and no Playwright.** `buildCoverLetterHtml` returns a complete,
self-contained HTML document with an inline `<style>` block and no external assets. Once it lives in
`src/shared/`, the client can call it with the draft text and the profile it *already has*
(`useProfileQuery`) and drop the result straight into `<iframe srcdoc={html}>`. That is pixel-faithful
to the PDF because it is **the same function**. Playwright (`generatePdf`) runs **only on Save**.
This is precisely why the builder must be *extracted* rather than *reimplemented* — two copies of
that `<style>` block would drift within a month, and the preview would start lying.

**UI — every one of these controls has an existing slot.** The Documents column is ~340px and is
clean because it is spare. Naively appending an Edit button and a version dropdown turns it into a
control panel. Instead:

1. **`[Edit]` goes in the existing header row, beside Download**, as a `text-xs text-zinc-500
   hover:text-zinc-200` ghost (`JobDrawer.tsx:472-478` is the idiom). It is *secondary*. **Exactly one
   primary button per column survives**: Generate/Regenerate.
2. **The version control replaces the date; it does not sit beside it.** `:471` already renders
   `toLocaleDateString()` — a de-facto version stamp. It becomes `v3 · Jul 13 ▾`: same size, same
   colour, now a trigger. **Net new pixels: zero.**
3. **A control with nothing to say does not render.** Generalized from *"absent fields are simply
   absent — no 'N/A' placeholder"* (`ux-consistency-patterns.md:22`). With one version there is **no
   chevron and no menu** — the column renders exactly what it renders today.
4. **The editor is a focused mode, not a new visual language.** Same zinc surfaces, same type scale;
   the preview pane keeps the identical `border border-zinc-800 rounded` + `aspect-[210/297]`
   treatment (`:512`), so it reads as *the same object* the drawer just showed. Continuity, not novelty.
5. **The one genuinely irreversible act is discarding *unsaved* edits** — which is why the
   "no confirmations" rule does not cover it. Resolve it without a modal: **Discard** is a two-step
   inline control that turns into `Discard changes?` in place. **Save is safe by construction** — it
   inserts a new version and the old one stays restorable — so nothing else needs guarding.
6. **Reuse the Tooltip-wrapped `<span>` disabled idiom** (`:492-504`) rather than inventing one.
7. **Do not add a second progress concept.** The `activityRegistry` and the button's `Generating…`
   already cover generation. A render is fast; a disabled Save reading `Saving…` is enough.
8. **Back from the editor reopens the drawer on the Documents tab** for that job. Do not dump the
   user on the pipeline with the drawer closed.

## Verification

**Commands:**
- `bun test 2>&1 | tee /tmp/baseline.txt` -- **run BEFORE any edit.** Baseline is RED: **9 failures / 673 pass** at `7e510e0`. Record failing test **names**
- `bun test` -- expected: no *new* failing names, **and one fewer failure** (the cover-letter read test, fixed by this work). Diff names, never counts
- `bun run typecheck` -- expected: green (it is green today; keep it)

**Tenant isolation — proven, not assumed** (follow `src/server/services/tenant-isolation.test.ts`):
seed a job + cover letter as user A; as user B attempt the `PUT`, the versions `GET`, and the
restore. All three must **404**, A's rows must be unchanged, and A's PDF must not have been rewritten.
Separately: restore a `versionId` that exists but belongs to a **different job of the same user** — it
must also 404, or one job's history leaks into another's.

**Manual checks** (`bun run dev`):
- Generate a cover letter → open the editor → confirm the preview matches the PDF the drawer just showed.
- Type into the textarea → the preview updates with **no network request** in devtools.
- Save → the drawer's preview and the downloaded PDF **both** reflect the edit (this is the `coverLetterSentAt` cache-buster working; if either is stale, the bump is missing).
- Open the version dropdown → restore v1 → the PDF reverts, and **v2 is still in the list**.
- A job generated exactly once → the header shows a **plain date**, no chevron.
- Make an edit, click Discard → it becomes `Discard changes?` **in place**. No modal.
