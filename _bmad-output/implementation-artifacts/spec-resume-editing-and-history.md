---
title: 'Resume structured editing + version history (G3)'
type: 'feature'
created: '2026-07-13'
status: 'done'
baseline_commit: '0bfae24'
reviewed: '2026-07-13 — adversarial review, 14 findings, all applied. See Review Findings Applied.'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-cover-letter-editing-and-history.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The resume has the same one-shot problem the cover letter had before G2 — its only verb
is *reroll* — but for a strictly worse reason. The cover letter's fix was mostly **exposure**:
`cover_letters` had been append-only since birth, so every draft ever generated was already in the
database and G2/G6 merely made it reachable. **The resume has no history to expose.** `generateResume`
validates the LLM's JSON against `resumeDataSchema`, injects it into the template, renders a PDF, and
**returns only the PDF** (`resume-service.ts:145-149`). The structured JSON — the only editable
representation of the resume that ever exists — is discarded microseconds after it is created. There
is no `resumes` table. All that survives a generation is `DATA_DIR/resumes/{jobId}.pdf` and a
`jobs.resume_generated_at` timestamp.

So an overclaimed bullet in a resume cannot be fixed, cannot be diffed, and cannot be reverted — and
unlike the cover letter, **the data to fix it was never kept.**

**Approach:** Persist what generation already computes. Add an append-only `resumes` table holding the
validated `ResumeData` JSON, and stop throwing it away. That single change is what makes the resume
editable *and* gives it a version history on the same code path — exactly as it did for the cover
letter, except here we must *create* the history rather than reveal it. Then reuse the G2 machinery:
the `/documents/:jobId/:docType` route shell (already built generically for this), the
`writeCoverLetterVersion` write pattern, the version dropdown, restore-by-insert.

The editor itself is where the resume **diverges** from the cover letter and cannot copy it. A cover
letter is prose: one `<textarea>`. A resume is a **structured document** — nine scalar fields plus four
arrays, one of which holds objects that each hold an array of strings. The editor is a **structured
form**, not a text box.

**Why editing and history are one spec and must not be split.** They are the same line of code. The
`resumes` table is the edit's write target *and* the history's read source; there is no version of
this feature where you add one without the other. Splitting them would mean building the table, the
migration, and the service rewrite to persist JSON that nothing reads — pure cost, zero user-visible
change. And an edit without a history would violate the UX spec's rule that *"all writes are
immediately reversible"* (`ux-consistency-patterns.md:71`). As with G2: editing is safe **because**
the history is there.

## Boundaries & Constraints

**Always:**
- Multi-tenant. Every query scopes on `userId`; privilege decisions on `sessionUserId`.
- Client mutations go through `apiFetch` (`src/client/lib/api.ts`), never bare `fetch()` — CSRF, or it 403s.
- Cross-boundary types only in `src/shared/schemas.ts`. API responses are bare data; errors are `{ error }` + status.
- **`resumes` is append-only.** Edit and restore both **INSERT**. Nothing in this change may `UPDATE` or `DELETE` a `resumes` row. (User deletion is the sole exception — see the cascade rule below.)
- **The resume has NO cache-buster today. This spec must ADD one.** Verified: `JobDrawer.tsx:551` (Download href) and `:589` (preview iframe) both point at a bare `/api/jobs/${job.id}/resume`, and `GET /:id/resume` (`api-jobs.ts:529-534`) returns the PDF with **no `Cache-Control`, no `ETag`, no `Last-Modified`**. The cover letter got `?t=${coverLetterSentAt}` explicitly; the resume never did. So bumping `resumeGeneratedAt` **does nothing on its own** — nothing reads it into a URL. Every consumer of the resume PDF must append `?t=${job.resumeGeneratedAt}`, and every write that changes the PDF must bump that column **in the same transaction as the INSERT**. Both halves, or the user saves an edit and is served the **stale PDF** — the exact "my edit vanished" failure this feature exists to prevent.
- **Serialize the JSON into the `<script>` tag with `<`, `>`, and `&` replaced by their JSON unicode escapes** — see the escaping block in Design Notes for the exact, unambiguous code. `resume-service.ts:139` currently does a bare `JSON.stringify` into a `<script id="resume-data">` tag, and `JSON.stringify` does **not** escape `<`. The moment a *user* can type into these fields, `</script>` in any string field breaks out of the tag. This is a **new** vector this feature opens, and it must close it.
- **Bound every string and every array in `resumeDataSchema`.** It currently has **no `.max()` anywhere** — every field is a bare `z.string()`, every array a bare `z.array()`. The cover letter's PUT capped content at 20,000 chars; the resume PUT would accept a 10 MB `summary`, which is then handed to a **Playwright chromium launch** whose pagination engine measures overflow in a loop under a **15-second timeout**. Unbounded input turns Save into a self-inflicted DoS. Limits apply to the **generate path too** — an LLM emitting a monster is equally unwelcome.
- **Reject blank identity fields.** `z.string()` accepts `""`, so as written a user can empty `first_name`, `last_name`, `title_01`, `title_02` and every bullet's *text* (`.min(1)` bounds array **length**, not content) and Save a valid-per-schema **blank resume**. The cover letter spec rejected whitespace-only content — *"a blank letter is not a letter."* Same rule here.
- **Restore must re-validate the stored row before rendering it.** Rows are validated against `resumeDataSchema` *as it existed when written* — and this spec tightens that schema. A legacy row may no longer conform. Parse on the way out; fail loudly rather than feeding non-conforming JSON to the template.
- **`resumes` must be added to BOTH admin cascade-delete transactions** (`api-admin.ts:121,153`), before the `jobs` delete, exactly as `coverLetters` is. Miss this and deleting a user leaves rows pointing at a dead `user_id`.
- **Re-validate against `resumeDataSchema` on every edit**, including the `title_02` "no `and` / `&`" rule (`resume-service.ts:130-132`). That rule is a *template rendering* constraint, not an LLM-output constraint — it binds the user's typing exactly as it binds the model's.
- Bun, not Node. Relative imports carry no file extension.

**Ask First:**
- If `bun run db:generate` emits a migration touching **any table other than `resumes`** — stop, do not apply it.
- If tightening `resumeDataSchema` (bounds, non-blank) makes an *existing* generate call start failing — stop and report. That means real LLM output exceeds the chosen limits and the limits need widening, not the rule dropping.
- If the structured form appears to need a new dependency — stop. It does not.

**Never:**
- **No Anthropic call on any path in this spec.** Edit and restore are renders, not generations. If a task seems to need the model, it is out of scope (that is G5).
- **No backfill, and no attempt to reconstruct JSON from an existing PDF.** It is not recoverable.
- **No per-version PDF files.** One file per job (`DATA_DIR/resumes/{jobId}.pdf`), always the current render. The DB row *is* the version.
- **No new npm dependencies.** No `dnd-kit`, no form library, no rich-text editor, no JSON editor. Plain inputs, plain `<textarea>`s, plain buttons.
- **No reordering.** The agreed cut is text + add/remove (see Resolved Decisions). No drag-and-drop, and **no up/down buttons either**. Array items keep their order; add appends.
- **No raw-JSON text box.** The form edits typed fields. Exposing `ResumeData` as JSON in a `<textarea>` is a worse failure mode than the one this feature fixes.
- **Never add `allow-same-origin` to the preview iframe.** With `allow-scripts` it is equivalent to no sandbox at all.
- **No toasts. No confirmation dialogs** (`ux-consistency-patterns.md:71`). **No colour** on new affordances — reserved for score badges. Zinc ghosts only.
- **Zero new rows and zero new buttons in the Documents-tab Resume column.** `[Edit]` joins the *existing* header row beside Download; the version control *replaces* the date. Net new pixels: zero. Settled by G2 — do not relitigate.
- **Do not touch the six template variants.** `resume-service.ts:135` hardcodes `resume_template(1).html`. Template *selection* is not in this spec.
- Out of scope, still deferred (`deferred-work.md`): provenance highlighting (**G4**), regenerate-with-instruction (**G5**), the `prompts` user-scoping defect.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate persists | `POST /api/jobs/:id/generate-resume` | Unchanged externally, **plus** a `resumes` row, `source: 'generated'`, holding the validated JSON | existing |
| **Regenerate is non-destructive** | Job already has a resume; user clicks Regenerate | INSERTs a **new** `'generated'` version. The **prior** version is still listed and still restorable — rerolling a good resume no longer loses it | existing |
| Save an edit | `PUT /api/jobs/:id/resume` `{ data }`, job owned by caller | `200`; **new** `resumes` row, `source: 'edited'`; PDF re-rendered; `resumeGeneratedAt` bumped **in the same transaction** | N/A |
| Save is non-destructive | A prior version exists | Prior row still present and still restorable **after** the save | N/A |
| **The edit is actually visible** | User saves, then downloads / views the preview | The PDF served is the **new** one. Both URLs carry `?t=${job.resumeGeneratedAt}`, and the client invalidates `['jobs']` so the changed timestamp reaches the href | N/A |
| Add an array item | User adds a project / an experience entry / a bullet / a skill group | Appended to the end of that array. **No reordering control exists** | N/A |
| Remove an array item | User removes a project, a skill group, an education entry | Removed. These arrays may go to **empty** — the schema permits it | N/A |
| Remove the last `experience` or last `bullet` | User tries to empty a `.min(1)` array | Rejected. Enforced **on the server**, not merely disabled in the form | `{ error }` + 400 |
| **Blank identity field** | User empties `first_name` / `title_01` / a bullet's text and saves | Rejected. A blank resume is not a resume | `{ error }` + 400 |
| **Oversized payload** | 10 MB `summary`; 5,000 `experience` entries | Rejected by the schema's bounds **before** any Playwright launch | `{ error }` + 400 |
| Invalid shape | `data` fails `resumeDataSchema` | Rejected — field-level errors returned so the form can point at the offending field | `{ error }` + 400 |
| `title_02` contains `and` / `&` | User types "Design and Research" | Rejected — it breaks template rendering | `{ error }` + 400 |
| `</script>` in any field | User pastes it into `summary` | Renders as **literal text** in the PDF and the preview. No tag break, no script execution | N/A |
| Read current | `GET /api/jobs/:id/resume-data` | The most recent row's JSON; newest by `createdAt DESC, id DESC` | N/A |
| **Template for the preview** | Editor opens | `GET /api/resume-template` returns the **same file on disk** the server renders from. Authenticated, cacheable | `{ error }` + 500 if unreadable |
| **Never generated at all** | `jobs.resumeGeneratedAt` is **null** and zero `resumes` rows | Editor shows *"Generate a resume first."* — the cover letter's empty state | N/A |
| **Generated BEFORE this feature** | `resumeGeneratedAt` is **set** but zero `resumes` rows | Editor shows *"This resume was generated before editing existed — regenerate it to make it editable."* **Not** a broken editor, **not** an empty form, **not** a silent 404. The existing PDF and Download keep working. **This is the state that distinguishes legacy from never-generated: the timestamp, not the row count** | N/A |
| List versions | `GET /api/jobs/:id/resume/versions` | `[{ id, source, createdAt }]`, **newest first**, tie-broken by `id DESC` | N/A |
| List versions, none exist | Job owned by caller, never generated | `200` with `[]` — **not** a 404 | N/A |
| Restore | `POST /api/jobs/:id/resume/versions/:versionId/restore` | **Copies** that row's JSON into a **new** row; PDF re-rendered; `resumeGeneratedAt` bumped. Original row untouched | N/A |
| **Restore a row that no longer validates** | Legacy row predates the tightened schema | `422` with a clear message. Do **not** render non-conforming JSON | `{ error }` + 422 |
| Restore a foreign version | `:versionId` belongs to another user, **or to another job** | `404` — must check **both** `userId` **and** `jobId` | `{ error }` + 404 |
| Cross-tenant edit / list / restore | User B hits user A's job on any route | `404`; A's rows **unchanged**, A's PDF **unrewritten** | `{ error }` + 404 |
| PUT on a never-generated job | No `resumes` row exists | `404`. `PUT` **edits**; it does not create | `{ error }` + 404 |
| Editor on an unknown / foreign job | `:jobId` not owned by caller | Not-found state; no data leak. Ownership check **precedes** the docType check | `{ error }` + 404 |
| One version only | Generated once, never edited | The version control renders **exactly the plain date it renders today** — no chevron, no menu | N/A |
| Unsaved edits, user leaves | Form is dirty, user clicks Back / Discard | Two-step **inline** Discard (`Discard changes?` in place). **No modal** | N/A |
| Live preview | User edits any field | Preview re-renders **client-side** from the real template. No render round-trip, no Playwright. (The template itself is fetched **once**, then cached) | N/A |
| **Preview of a 2-page resume** | Content overflows one page | Both pages are reachable — the preview **scrolls**. It is not clipped to one page, and it is not silently truncated | N/A |
| **Preview fits its pane** | Editor open at any window width | The 794×1123px page is **scaled to fit** the preview pane. The user sees a whole page, not its top-left corner | N/A |
| PDF render fails on save | Playwright throws, or the rename fails | `500`, and **no row is committed** and **no bump happens** — the user retries against unchanged state | `{ error }` + 500 |

</frozen-after-approval>

## Code Map

**Verified against `8516f90`. Line numbers are load-bearing — the previous draft of this spec got three of them wrong and the review caught it.**

- `src/db/schema.ts` -- `jobs.resumeGeneratedAt` (:41) — nullable, and **not currently used as a cache-buster by anything** (see the JobDrawer entry). `coverLetters` (:47-55) is the shape to copy. **NEW** `resumes` table: `id`, `jobId`, `userId`, `data` (TEXT, the JSON), `createdAt`, `source` (`'generated' | 'edited'`, `.notNull().default('generated')`), + `resumes_user_id_idx`
- `src/db/migrations/` -- `bun run db:generate` produces `0042_*.sql` (journal's last is `0041_silky_golden_guardian` — verified) + journal entry; must touch **only** `resumes`
- `src/db/migrate.ts` -- `COVER_LETTERS_COLUMNS` + its guarded repair loop (:38-41) is the pattern. A new table needs no ALTER repair on a clean run, **but this project has a history of migration drift** — that guarded loop exists because `repairCoverLettersSchema` once tried to ALTER a table that did not exist. Add a `CREATE TABLE IF NOT EXISTS resumes` to the repair path, identical to `schema.ts`, so a drifted DB does not 500 every resume route with `no such table`
- **Test files needing the new `resumes` DDL — this list is exhaustive, not "at minimum":** `api-resume.test.ts` and `api-jobs.test.ts` (both exercise resume routes; `POST /:id/generate-resume` lives in `api-jobs.ts` and will now INSERT) and `api-admin.test.ts` (cascade delete). **Read the DDL lockstep note before writing one.**
- `src/shared/schemas.ts` -- `resumeDataSchema` (:401-422). **Currently has no `.max()` on any field and no non-blank rule on any string.** Both must be added (see Boundaries). Add `resumeVersionSchema` (`id`, `source`, `createdAt`), mirroring `coverLetterVersionSchema`
- `src/shared/resume-html.ts` -- **NEW.** `buildResumeHtml(data: ResumeData, templateHtml: string): string` — the template-injection currently inline at `resume-service.ts:135-143`, extracted, **with the escaping fix**. Pure; takes the template as a **parameter** so server and client can each supply the same bytes. (Mirrors `src/shared/cover-letter-html.ts`.)
- `src/server/services/resume-service.ts` -- `generateResume` (:59) must **return the validated `parsed.data`** alongside the PDF; today it returns only `{ pdf, inputTokens, outputTokens }` (:145-149). **Change `userId?: number` to a required `userId: number`** — a `resumes` row cannot be written without it, and typecheck should enforce that forever. (Verified: the sole server call site, `api-jobs.ts:454`, already passes it.) Import the extracted builder. Export `renderResumePdf(data)` — the shared render half for edit + restore. **The LLM path is otherwise behaviourally unchanged.**
- `src/server/services/generate-pdf.ts` -- `generatePdf(html)`. **Read this before touching the preview.** It does `setContent(html, { waitUntil: 'networkidle' })` and then **blocks on `window.__paginationComplete === true` with a 15s timeout**. The PDF *cannot* render unless the template's script runs. Read-only reference
- `src/server/routes/api-jobs.ts` -- `writeCoverLetterVersion` (:577) is the **exact** pattern to mirror: per-**write** UUID tmp path, `.returning()` inside the transaction, bump-in-transaction, `unlink` the tmp on every failure path, **500 on a failed rename**. Write a `writeResumeVersion` in its image. `POST /:id/generate-resume` (:429) must route through it and **inherits the tmp-path race fix** (it still uses a per-*job* `${rawId}.pdf.tmp` at :477). `GET /:id/resume` (:502-535) serves the PDF and sets **only** `Content-Type` + `Content-Disposition` — no cache validators at all. Add: `GET /:id/resume-data`, `PUT /:id/resume`, `GET /:id/resume/versions`, `POST /:id/resume/versions/:versionId/restore`, and **`GET /api/resume-template`**
- `src/server/routes/api-admin.ts` -- `tx.delete(coverLetters)` at **:121 and :153**. Add the `resumes` delete to **both**, before the `jobs` delete
- `resume_templates/resume_template(1).html` -- 639 lines. **Read-only.** The facts that drive this spec's design: it is **self-rendering** (inline `<script>` at :376-380 parses `#resume-data` at :355 and builds the DOM); it runs a real **pagination engine** (`paginate()` :552, `buildTwoPage1/2`, `finish(pageCount)` :607) emitting **one or two stacked `.page` divs**; `.page` is **fixed at 794×1123px** (:17-18, :34-43); it **gates pagination on `document.fonts.ready`** (:617-618); and it loads **Rajdhani/Barlow from `fonts.googleapis.com`** (:7-9). It is **NOT reachable from the client** — it lives outside `public/`, `vite.config.ts` sets no `publicDir`, and only `/api` and `/auth` are proxied. Hence `GET /api/resume-template`
- `src/client/routes/documents.tsx` -- the generic shell, built for this. The ownership guard (:78-86) stays; the `docType !== 'cover-letter'` bail (:88-96) is what this spec deletes and replaces. The cover letter's preview uses `sandbox=""` (:184) — **the resume must not**
- `src/client/components/detail/JobDrawer.tsx` -- Resume column (:543-597). `:549` is a **plain date `<p>`**, not a cache-buster. `:551` (Download href) and `:589` (preview iframe `src`) are bare URLs that **must gain `?t=${job.resumeGeneratedAt}`**. Header row (:546-556) takes `[Edit]`; the date at `:549` becomes the version control
- `src/client/components/config/PromptSection.tsx` -- the draft/dirty/Save/Cancel/inline-error pattern (:27-136). **Reuse, do not reinvent**
- `src/client/components/detail/CoverLetterVersions.tsx` -- the version dropdown. Generalize or clone; **do not fork the UX**

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/schemas.ts` -- bound `resumeDataSchema`: `.max()` on **every** string and **every** array; `.trim().min(1)` on `first_name`, `last_name`, `title_01`, `title_02`, `summary`, each `experience[].company`, `experience[].role`, and each `bullets[]` string. Leave `website`, `linkedin`, `location`, `projects[].url` free to be empty. **This binds the generate path too — intentionally.** Add `resumeVersionSchema`
- [x] `src/db/schema.ts` -- add the `resumes` table + `resumes_user_id_idx`
- [x] `src/db/migrations/` -- `bun run db:generate` -- verify the emitted SQL touches **only** `resumes`
- [x] `src/db/migrate.ts` -- add a `CREATE TABLE IF NOT EXISTS resumes` to the repair path, identical to `schema.ts`
- [x] **`api-resume.test.ts`, `api-jobs.test.ts`, `api-admin.test.ts`** -- add an **identical** hand-rolled `resumes` DDL, column for column, matching `schema.ts`. **Lockstep, single commit.** One divergent copy breaks *other* files, and only in the full run
- [x] `src/shared/resume-html.ts` -- **NEW.** Extract the template injection; apply the escaping block from Design Notes **verbatim**; unit-test that a `</script>` payload survives as literal text
- [x] `src/server/services/resume-service.ts` -- return `parsed.data`; make `userId` **required**; import the extracted builder; add exported `renderResumePdf(data)`
- [x] `src/server/routes/api-jobs.ts` -- `GET /api/resume-template` — read the same file from disk the renderer uses, return it as `text/html` with `Cache-Control: private, max-age=3600`. Authenticated like every other `/api` route
- [x] `src/server/routes/api-jobs.ts` -- `writeResumeVersion(jobId, userId, data, source)` mirroring `writeCoverLetterVersion` (:577): per-**write** UUID tmp, `.returning()` in-transaction, bump `resumeGeneratedAt` in the **same** transaction, unlink tmp on every failure, **500 on failed rename**
- [x] `src/server/routes/api-jobs.ts` -- `POST /:id/generate-resume` (:429) routes through `writeResumeVersion` with `source: 'generated'`, replacing its hand-rolled write block. **Regenerate appends a version; it does not overwrite one**
- [x] `src/server/routes/api-jobs.ts` -- `GET /:id/resume-data`; `PUT /:id/resume` (validate via the tightened `resumeDataSchema` **incl. the `title_02` rule**, INSERT `source: 'edited'`, **404 if no row exists**); `GET /:id/resume/versions` (`[]`, not 404); `POST /:id/resume/versions/:versionId/restore` (scoped on **both** `userId` and `jobId`; **re-validate the stored row, 422 if it no longer conforms**)
- [x] `src/server/routes/api-admin.ts` -- delete `resumes` in **both** cascade transactions (:121, :153), before `jobs`
- [x] `src/client/components/detail/JobDrawer.tsx` -- **append `?t=${job.resumeGeneratedAt}` to the Download href (:551) and the preview iframe src (:589).** This is the cache-buster the resume has never had. Then: `[Edit]` ghost in the **existing** header row; the date at `:549` becomes `v2 · Jul 13 ▾`. **With one version: no chevron, no menu, plain date**
- [x] `src/client/routes/documents.tsx` -- replace the `not editable yet` bail with the resume editor: structured form left, live preview right. Text inputs for scalars, `<textarea>` for `summary` and each bullet, `+`/`×` on array items, **no reorder control**. Distinguish **never-generated** (`resumeGeneratedAt` null) from **legacy** (`resumeGeneratedAt` set, zero rows) — different copy for each
- [x] `src/client/routes/documents.tsx` -- the preview: `<iframe srcdoc={buildResumeHtml(draft, template)} sandbox="allow-scripts">`. **No `allow-same-origin`.** Scale the fixed 794px page to the pane width (`transform: scale()` on a wrapper, or an equivalent), and let the pane **scroll** so page 2 of a two-page resume is reachable
- [x] `src/client/hooks/` -- `useResumeTemplateQuery` (long `staleTime` — the template does not change at runtime), `useResumeDataQuery`, `useResumeMutation`, `useResumeVersionsQuery`, `useResumeRestoreMutation`. Mutations via `apiFetch`; **invalidate `['jobs']`** so the bumped `resumeGeneratedAt` reaches the `?t=` hrefs
- [x] Tests -- tenant isolation on all routes (**proven, not assumed**: seed as user 2, act as user 1, expect 404 *and* untouched rows); PUT inserts rather than mutates and leaves the prior version restorable; restore of a foreign-user *and* wrong-job `versionId` 404s; PUT on a never-generated job 404s; `title_02` with `and` 400s; emptied `experience` **and** an entry with zero `bullets` both 400 **at the route, not just in the form**; a blank `first_name` 400s; an oversized `summary` 400s **without launching Playwright**; a `</script>` payload renders as literal text; versions returns `[]` not 404; generate leaves a `resumes` row behind; **a second Regenerate leaves the first version still present and still restorable**; **`resumeGeneratedAt` actually moves on every PDF-changing write**

**Acceptance Criteria:**
- Given a resume generated **after** this ships, when the user edits a bullet and saves, then a **new** `resumes` row exists with `source: 'edited'`, the prior row is **still present**, and the downloaded PDF reflects the edit.
- Given a saved edit, when the user views the drawer preview or clicks Download **without a hard refresh**, then they get the **new** PDF — the `?t=` cache-buster moved and the browser could not serve a stale render.
- Given an edited resume, when the user restores v1, then a **new** row is inserted carrying v1's JSON, **no row is deleted**, and the PDF reverts.
- Given a resume the user is happy with, when they click **Regenerate** and dislike the result, then the previous resume is **still in the version list and still restorable** — Regenerate is no longer a one-way door.
- Given a tailored resume, when the user removes an irrelevant project and adds a bullet to their current role, then both changes persist to the PDF, and the prior version remains restorable.
- Given a `PUT` that empties `experience`, blanks `first_name`, or carries a 10 MB `summary`, when it reaches the route — **bypassing the form entirely** — then it is rejected with a 400, **no Playwright process is launched**, and nothing is written.
- Given a resume generated **before** this ships (PDF on disk, zero `resumes` rows), when the user opens the editor, then they get the *"regenerate to make it editable"* state — distinct from the *"generate a resume first"* state a never-generated job gets — and the existing PDF and its Download link **still work**.
- Given any resume field containing `</script>`, when the resume is saved, then the text appears **literally** in the PDF and the preview, and no script executes.
- Given the editor is open on a two-page resume, when the user looks at the preview, then they see a **whole page scaled to the pane**, and page 2 is reachable by scrolling — not a clipped top-left corner, and not a silently truncated document.
- Given a job with exactly one version, when the Documents tab renders, then the Resume header shows the **plain date it shows today** — no chevron, no dropdown, no new pixels.
- Given user A's job, when user B calls any of the new routes on it, then every response is **404** and A's rows and PDF are unchanged.
- Given the editor with unsaved changes, when the user clicks Discard, then it turns into `Discard changes?` **in place** — no modal appears anywhere in this feature.
- Given the editor is open and the template already fetched, when the user edits any field, then the preview updates **without any further network request**.
- Given `bun test`, when run, then no *new* failing test names vs. the **8-failure** baseline.
- Given `bun run typecheck`, when run, then it exits green.

## Design Notes

**The asymmetry with the cover letter — internalize this before you start.** G2/G6 was an *exposure*
feature: the history already existed and was merely unreachable, so the moment the UI shipped, every
user's entire back-catalogue of drafts was there. **G3 is a persistence feature.** On the day it
ships, **every existing resume has zero versions and is not editable**, and no amount of cleverness
changes that — the JSON was discarded, and a PDF cannot be reversed into structured data. The
migration adds an **empty** table. This is not a bug to be worked around; it is the shape of the
feature, and it must be *designed for* rather than discovered by a user staring at an empty form.
Anyone who proposes "backfilling by parsing the PDF" has misunderstood the problem and will produce
garbage data.

**Legacy and never-generated are different states, and only one column tells them apart.** Both have
**zero `resumes` rows**, so a row count cannot distinguish them. The discriminator is
`jobs.resumeGeneratedAt`: **null** means the user never generated a resume → *"Generate a resume
first."* **Set** means they generated one before this feature existed → *"regenerate it to make it
editable."* Get this wrong and every legacy user is told they have no resume while looking at a
preview of one.

**The escaping fix — this is the exact code, do not paraphrase it.** `resume-service.ts:139` injects
`JSON.stringify(parsed.data, null, 2)` straight into a `<script id="resume-data">` tag, and
`JSON.stringify` does **not** escape `<`. Today the only thing writing those fields is Claude, so
nobody has noticed. The instant a user can type into `summary`, `</script><script>…` closes the data
tag and opens a live one — **in the Playwright render context that produces the PDF**, where there is
no sandbox at all. In `src/shared/resume-html.ts`:

```ts
// Replace <, >, & with their JSON unicode escapes: backslash-u-0-0-3-c, -3-e, -0-2-6.
// Still valid JSON, byte-identical after JSON.parse, and inert inside a <script> tag.
const json = JSON.stringify(data, null, 2)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
```

If the string literals above do not each contain a **single backslash followed by `u003c` / `u003e` /
`u0026`**, the fix is wrong and does nothing — an earlier draft of this spec was itself corrupted into
saying "escape `<` as `<`", which is a tautology. Test it with a real `</script><script>alert(1)</script>`
payload and assert the text survives literally in the rendered output.

**Escaping is the ONLY real control. The sandbox is not a backstop for the PDF.** `sandbox="allow-scripts"`
without `allow-same-origin` gives the preview iframe an opaque origin, so injected script cannot touch
the app's origin, cookies, or storage — worth having. But it **still executes**, and with no CSP it can
still reach the network. And the **PDF path has no sandbox whatsoever**: Playwright runs whatever is in
that document with full privileges. So the sandbox hardens the preview and does **nothing** for the
render. Do not let it become an excuse to treat the escaping as optional.

**The preview must execute scripts — `sandbox=""` would render a blank page.** The cover letter's
preview uses `sandbox=""` (`documents.tsx:184`) because its HTML is inert. The resume template is not:
`generatePdf` literally **blocks on `window.__paginationComplete === true`**, so the document cannot
render without its script. Use `sandbox="allow-scripts"` and **never** add `allow-same-origin` — the
two together are equivalent to no sandbox at all.

**The template is not reachable from the client, so we serve it.** `resume_templates/` sits outside
`public/`, `vite.config.ts` sets no `publicDir`, and only `/api` and `/auth` are proxied — there is **no
URL** that returns that file today. Add `GET /api/resume-template`, reading the **same path on disk**
the renderer reads. That keeps the file on disk as the **single source of truth**: the server renders
from it, the client previews from it, and they cannot drift. (A Vite `?raw` import was considered and
rejected: it would put a build-time copy in the bundle while the server kept reading disk at runtime —
two sources, and precisely the drift that extracting `buildResumeHtml` is supposed to make impossible.)
The client fetches it **once** with a long `staleTime`; typing costs zero further requests.

**"Pixel-faithful by construction" is true only because both sides gate on fonts — and it has a
failure mode.** The template pulls Rajdhani/Barlow from `fonts.googleapis.com` (:7-9) and gates
`paginate()` on `document.fonts.ready` (:617-618), so **page-break positions are computed from
live-fetched font metrics**. `generatePdf` additionally waits for `networkidle`. The good news: both
the PDF and the preview measure with the real typefaces, so they agree. The bad news, which must be on
the record: **every Save makes a third-party network call**, and on an offline box or during a Google
Fonts outage both renders fall back to different metrics and **pagination can differ between the
preview and the PDF**. Self-hosting the three fonts would retire this whole class of problem and is the
obvious follow-up — it is **not** in this spec, but do not write "pixel-faithful, guaranteed" in a
comment as if the network were not involved.

**The preview needs scaling and scrolling — the cover letter's iframe treatment does NOT transfer.**
`.page` is **fixed at 794×1123px** (:17-18). The cover letter's preview works in an `aspect-[210/297]`
box unscaled because its HTML is fluid; the resume's page is rigid. Drop it into a ~340px drawer column
or a ~500px editor pane as-is and the user sees the **top-left corner at 100% zoom**. Scale the page to
the pane (a `transform: scale()` wrapper is enough — no dependency). And the pagination engine emits
**one or two** stacked pages, so the pane must **scroll**: a two-page resume must not lose page 2 below
the fold. Note the drawer's *existing* preview is a PDF in the browser's native viewer, which paginates
for free — the srcdoc preview will not match it unless this is handled deliberately.

**The editor is a structured form, and that is the whole difficulty.** The cover letter is a string; its
editor is a `<textarea>` and the entire client story is "bind a draft, diff it, POST it." A resume is
`ResumeData`: nine scalars plus `skill_groups[{label, skills[]}]`, `education[{school, degree, year}]`,
`projects[{name, desc, stack, url}]`, and `experience[{company, location, dates, role, bullets[]}]`.
There is no `<textarea>` that edits that safely. Do **not** solve it by exposing raw JSON in a text box:
one stray comma and the resume fails to parse, which is a *worse* failure than the one this feature
fixes, and it asks a job-seeker to hand-edit JSON. Build real fields: text inputs for scalars, a
`<textarea>` for `summary` and for each bullet, `+`/`×` add/remove on array items. **Reordering is out of
scope** — not drag-and-drop, and not up/down buttons either.

**Validation is a server rule, not a form rule.** `skill_groups`, `education`, and `projects` may
legitimately go **empty** — that is the point of the add/remove cut, since tailoring means dropping the
irrelevant project. `experience` and each entry's `bullets` may **not** (`.min(1)`). Disable the last
`×` in the form as a courtesy, but **enforce every rule on the server anyway** — bounds, non-blank,
`.min(1)`, `title_02`. The form is not the security boundary, and a drifted client or a hand-rolled
`PUT` must not be able to write a blank, unbounded, or job-less resume. The bounds in particular are
what stand between a paste and a 15-second Playwright hang.

**Persisting on generate is what makes the history real — and it fixes a live bug for free.** The
generate route's write block (`api-jobs.ts:474-480`) still uses a per-*job* tmp path (`${rawId}.pdf.tmp`)
and bumps outside a transaction. `deferred-work.md` records this as an open race carried over from the
G2 review, which fixed it only for cover letters. Routing generate through `writeResumeVersion` retires
it for resumes as a side effect. Do not leave generate writing its own PDF by hand while the edit route
uses the safe helper — one write path, or the race returns the first time someone double-clicks Generate.

**Restore restores the data, not the rendering — and it moves the clock.** The **data** is restored
verbatim. The *rendering* is always today's template and today's fonts, so a restored PDF is not
byte-identical to the original. Same decision as G2. Note also that restore **bumps `resumeGeneratedAt`
to now**, so a resume whose content is three-week-old v1 will read as "generated today" to anything
displaying that column. Inside the drawer the version control replaces the date, hiding this; **if any
list or tracker view surfaces a resume date, check it.**

**The DDL lockstep trap — read before touching `schema.ts`.** One `bun test` process shares one
in-memory DB. Every test file's `CREATE TABLE IF NOT EXISTS` **no-ops if another file got there first**,
so the first file to run defines the table for the whole suite, and drizzle enumerates every column in
`schema.ts` by name — a winning DDL missing a column fails *every* query against that table in *every*
file. This cost this repo 33 failures in one hit (`deferred-work.md`, 2026-07-12) and a full day again
on 2026-07-13, when five `cover_letters` DDLs had drifted **four** different ways. `resumes` is a **new**
table — the one moment you can get this right for free. The three files are named in the Code Map; the
list is exhaustive, not a floor. **Tests pass in isolation and fail together — a single-file run proves
nothing.**

**UI — this is settled, not open.** G2 fought out where `[Edit]` and the version control go and the
answer holds unchanged: `[Edit]` is a `text-xs text-zinc-500` ghost in the **existing** Resume header row
beside Download (`JobDrawer.tsx:546-556`); the version control **replaces** the date at `:549` rather than
sitting beside it (`v2 · Jul 13 ▾`); with one version there is **no chevron and no menu**. Net new pixels:
zero. Exactly one primary button per column survives — Generate/Regenerate. Reuse
`CoverLetterVersions.tsx` rather than forking a second version-dropdown UX.

## Resolved Decisions

- **Structural editing scope: text + add/remove.** (2026-07-13.) The user edits every field's text, **and**
  may add and remove items in `skill_groups` (and its `skills`), `education`, `projects`, `experience` (and
  its `bullets`). Text-only was rejected: a resume tailored to a specific job must be able to *drop an
  irrelevant project*, and that is not a text edit. **Reordering is explicitly NOT in this cut.**
- **Regenerate is non-destructive.** (2026-07-13.) `POST /:id/generate-resume` INSERTs a new `'generated'`
  version rather than overwriting. The pre-regeneration resume stays in the version list and stays
  restorable. A deliberate behaviour change to an existing button: today Regenerate is a one-way door and a
  user who rerolls a good resume loses it. After this spec, **reroll is safe** — the same argument that
  makes editing safe, applied to the button that already existed.
- **The client gets the template from `GET /api/resume-template`.** (2026-07-13.) Chosen over a Vite `?raw`
  bundle import specifically to keep the file on disk as the single source of truth, preserving the
  "server and client cannot drift" invariant that justifies extracting `buildResumeHtml` at all.

## Review Findings Applied

Adversarial review, 2026-07-13, against `8516f90`. Fourteen findings; all applied. The three that changed
the design rather than the wording:

1. **The resume had no cache-buster at all.** The first draft asserted `resumeGeneratedAt` *was* one,
   citing `JobDrawer.tsx:549,551,589`. Verified false — those URLs are bare, and `GET /:id/resume` sends no
   cache validators. The spec now **adds** the `?t=` mechanism rather than assuming it. Left unfixed, the
   feature's core promise ("your edit is what you download") would have quietly failed.
2. **The client could not obtain the template**, so the preview as first specced was unimplementable.
   Resolved by serving it (see Resolved Decisions).
3. **The preview would have rendered as a clipped corner.** `.page` is fixed at 794×1123px, and the
   pagination engine emits up to two stacked pages. The cover letter's unscaled `aspect-[210/297]` iframe
   does not transfer; scaling and scrolling are now explicit requirements.

Also applied: the `<` escaping instruction had been corrupted into a tautology and is now given as
literal code; `api-jobs.test.ts` was missing from the DDL file list (in a spec whose own headline warning
is about exactly that); `resumeDataSchema` had no bounds and no non-blank rules, making Save a DoS vector
and a blank resume valid; restore did not re-validate legacy rows; `generateResume`'s `userId` was optional
though a `resumes` row cannot be written without it; legacy and never-generated resumes were conflated
despite being distinguishable only by `resumeGeneratedAt`; the Google Fonts runtime dependency of every
render was unmentioned; the sandbox was oversold as a backstop it cannot be for the PDF path; and
`migrate.ts` drift protection was waved off in a repo with a documented history of it.
