---
baseline_commit: 68568847d93e50295c64cc64e0f8a622b80c42db
---

# Story 46.4: Wire Cover Letter & Resume Into the Registry

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user generating documents,
I want each cover-letter and resume generation tracked as its own busy run on the activity registry,
so that several concurrent generations each appear in the Activity dropdown and clear independently.

## Acceptance Criteria

1. **Cover-letter run registered before work starts** — In `POST /api/jobs/:id/generate-cover-letter` (`api-jobs.ts`), a `cover_letter` run is registered on the shared `activityRegistry` with `progress: { company: job.company, role: job.jobTitle }` **before** `generateCoverLetter(...)` is awaited. Registration happens **after** the existing id-validation (400) / job-not-found (404) / no-`jobDescription` (400) guards — those still return with **no** run registered. The existing response shape (`{ coverLetter: inserted }`), `recordRun(...)` calls, PDF persistence, DB transaction, and all status codes are otherwise **unchanged**.

2. **Resume run registered before work starts** — In `POST /api/jobs/:id/generate-resume`, a `resume` run is registered with `progress: { company: job.company, role: job.jobTitle }` **before** `generateResume(...)` is awaited, again **after** the same three guards. The existing `Response(pdfBuffer, …)` (PDF download), `recordRun(...)` calls, profile lookup, and status codes are **unchanged**.

3. **Success → finalize done** — When a generation reaches its existing success `recordRun({ …, success: true, … })` path, the corresponding registry run is finalized via `finalize(id, 'done')`.

4. **Failure → finalize failed (every terminal path after registration)** — When a generation fails on **any** path that returns after the run was registered, the corresponding registry run is finalized via `finalize(id, 'failed')`. This includes BOTH the existing failure `recordRun({ …, success: false, … })` paths AND the two failure returns that do **not** call `recordRun`: the `503 'not configured'` early return (service throws `'ANTHROPIC_API_KEY not configured'`) and the cover-letter `500 'Failed to store cover letter'` DB-transaction-failure return. No registered run may be left in `running` state when the handler returns. *(This goes one step beyond the literal epic AC wording — which maps finalize to the `recordRun` calls — because two real, common return paths bypass `recordRun`; leaving them unfinalized would leak a phantom forever-"running" row into every user's Activity dropdown. Preventing that leak is mandatory, per the epic's "appear and clear independently" goal and 46.3's no-leaked-runs invariant.)*

5. **Concurrent generations are independent** — When the same user fires two cover-letter generations for different job ids at once, the registry holds two distinct `cover_letter` runs, each carrying its own `{ company, role }`, each finalizing independently (one failing does not finalize the other). The same holds for two resumes, or a cover-letter and a resume in flight together.

6. **Single terminal path per run** — Every registered run is finalized exactly once (the registry's `finalize` is idempotent, but each run reaches a terminal `finalize` on exactly one logical path). Registry pruning after the retention window is the registry's own concern, not this story's.

## Tasks / Subtasks

- [x] **Task 1 — Wire the cover-letter handler (`app.post('/:id/generate-cover-letter', …)`, `api-jobs.ts:339-414`)** (AC: 1, 3, 4, 6)
  - [x] Add `import { activityRegistry } from '../services/activity-registry'` to the existing imports in `src/server/routes/api-jobs.ts` (alongside `recordRun` from `./api-webhook-runs`). Use the **relative** path — server code does not use `@shared`/alias imports.
  - [x] Leave the three guards untouched (invalid id → 400, `!job` → 404, `!job.jobDescription` → 400). **No run is registered when any of these returns** — they sit above the registration point.
  - [x] Register the run immediately **before** `const startMs = Date.now()` / the `try { coverLetterResult = await generateCoverLetter(...) }`:
        `const runId = activityRegistry.register({ userId, type: 'cover_letter', progress: { company: job.company, role: job.jobTitle } })`.
  - [x] **Guarantee finalize on every return path** using the `try/finally` pattern below (recommended — see Dev Notes "Why try/finally"). Wrap the existing body (from `generateCoverLetter` through the success `return c.json({ coverLetter: inserted })`) so a single `finally` finalizes once:
        ```ts
        const runId = activityRegistry.register({ userId, type: 'cover_letter', progress: { company: job.company, role: job.jobTitle } })
        let outcome: 'done' | 'failed' = 'failed'
        try {
          // ── existing handler body, unchanged ──
          // ... generateCoverLetter try/catch (503 / recordRun-false+502) ...
          // ... PDF write try/catch (recordRun-false+502) ...
          // ... DB transaction try/catch (500) ...
          // ... rename, select inserted, success recordRun(...) ...
          outcome = 'done'                 // set ONLY on the success path, right before the success return
          return c.json({ coverLetter: inserted })
        } finally {
          activityRegistry.finalize(runId, outcome)
        }
        ```
        `outcome` starts `'failed'`; every early `return` (503, both 502s, the 500) leaves it `'failed'`; only the success path flips it to `'done'`. The existing inner `try/catch` blocks and their `return c.json(...)` statements are **kept verbatim** — you are only adding the outer `try { … } finally { … }` and the `outcome` flag.
  - [x] Do **not** change: the `recordRun(...)` argument objects, the cost math (`SONNET_4_6_*`), the PDF temp-write/rename, the `coverLetters` insert + `jobs.coverLetterSentAt` update transaction, or any status code / error shape.

- [x] **Task 2 — Wire the resume handler (`app.post('/:id/generate-resume', …)`, `api-jobs.ts:416-478`)** (AC: 2, 3, 4, 6)
  - [x] Same three guards stay untouched and above the registration point.
  - [x] Register before `const resumeStartMs = Date.now()` / the `try { resumeResult = await generateResume(...) }`:
        `const runId = activityRegistry.register({ userId, type: 'resume', progress: { company: job.company, role: job.jobTitle } })`.
  - [x] Apply the same outer `try { … } finally { activityRegistry.finalize(runId, outcome) }` wrap; set `outcome = 'done'` right before the success `return new Response(pdfBuffer, { headers: { … } })`. Resume's failure returns after registration are: the `503 'not configured'` (no `recordRun`) and the `recordRun-false + 502` path. The PDF-persist `catch` (`api-jobs.ts:465-468`) is **non-fatal** — it `console.error`s and falls through to the success `recordRun`/`Response`, so it correctly finalizes `done` (do not change that behavior).
  - [x] Do **not** change: the `generateResume` call, profile lookup (`parseProfileData`), `fileName` sanitization, the `Content-Type: application/pdf` / `Content-Disposition` headers, the cost math, or `recordRun(...)` args.

- [x] **Task 3 — Add co-located contract tests for the two generate handlers (`src/server/routes/api-jobs.test.ts`)** (AC: 1–6)
  - [x] **Mock the two doc-generation services** — they are NOT currently mocked, and the real ones require an Anthropic key + network. Add, **above** the existing `const { default: jobsRoute } = await import('./api-jobs')` line (mock.module must be hoisted before the module-under-test is imported):
        ```ts
        import { mock, spyOn } from 'bun:test'
        let coverLetterImpl: () => Promise<{ content: string; pdf: Buffer; inputTokens: number; outputTokens: number }>
        let resumeImpl: () => Promise<{ pdf: Buffer; inputTokens: number; outputTokens: number }>
        mock.module('../services/cover-letter-service', () => ({ generateCoverLetter: () => coverLetterImpl() }))
        mock.module('../services/resume-service', () => ({ generateResume: () => resumeImpl() }))
        ```
        Set `coverLetterImpl` / `resumeImpl` per-test (success returns a tiny real `Buffer` for the pdf, e.g. `Buffer.from('%PDF-1.4 test')`; failure throws). `mock.module` is file-global — confirm the existing describe blocks (PATCH, GET, POST `/api/jobs`, scrape-url, bulk-archive) stay green; none call the generate endpoints, so the mocks are inert for them.
  - [x] **Create the extra tables the success paths touch** in `beforeAll`, alongside the existing `jobs` / `status_events` / `messages` DDL. The cover-letter success path inserts into `cover_letters` and the success `recordRun` writes `webhook_runs`; the resume success path selects `profile` and writes `webhook_runs`:
        ```sql
        CREATE TABLE IF NOT EXISTS cover_letters (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, profile_data TEXT);
        CREATE TABLE IF NOT EXISTS webhook_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, run_at TEXT NOT NULL, success INTEGER NOT NULL, item_count INTEGER, error_message TEXT, duration_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL, matched_count INTEGER, archived_count INTEGER, source_breakdown TEXT, user_id INTEGER NOT NULL DEFAULT 1);
        ```
        (Mirror the `webhook_runs` DDL already in `api-webhooks.test.ts:24-42`.) Add `DELETE FROM cover_letters` / `webhook_runs` to the existing `beforeEach` cleanup so runs don't leak between tests.
  - [x] `import { activityRegistry } from '../services/activity-registry'` and use `spyOn(activityRegistry, 'register' | 'finalize')` to assert wiring. Restore in `afterEach` (the file already has `afterEach` — add `mock.restore()` there, and confirm it doesn't disturb the file-global `mock.module` service mocks; re-assert spies are fresh each test).
  - [x] **Register payload (AC1, AC2):** seed a job (company `'Acme'`, jobTitle `'Engineer'`, with a non-null `jobDescription`); fire each endpoint; assert `register` was called once with `{ type: 'cover_letter' /* or 'resume' */, progress: { company: 'Acme', role: 'Engineer' } }` **and** `userId: 1` (the harness's `c.set('userId', 1)` middleware makes `userId` assertable here — unlike 46.3's webhook harness; close that gap by asserting it).
  - [x] **Success → finalize done (AC3):** `coverLetterImpl`/`resumeImpl` resolve with a fake pdf Buffer; assert the endpoint returns 200 (cover letter → `{ coverLetter }` json; resume → `application/pdf` Response) **and** `finalize` was called with `(<id>, 'done')` exactly once. *(Reaching `done` requires the full success path to succeed — cover-letter needs the `cover_letters` table; resume needs the `profile` table; both write a PDF to `data/` (gitignored). If those tables/dirs are missing the handler returns 500/throws and `finally` finalizes `'failed'` — so a passing `done` assertion proves the path is genuinely wired.)*
  - [x] **Service throws (non-config) → finalize failed (AC4):** `coverLetterImpl = async () => { throw new Error('LLM exploded') }`; assert 502, the existing `recordRun(success:false)` row in `webhook_runs`, **and** `finalize(<id>, 'failed')`. Same for resume.
  - [x] **`ANTHROPIC_API_KEY not configured` → 503 still finalizes failed (AC4, the leak guard):** `coverLetterImpl = async () => { throw new Error('ANTHROPIC_API_KEY not configured') }`; assert 503, **no** `webhook_runs` row written (this path skips `recordRun`), **and** `finalize(<id>, 'failed')` — i.e. the run does not leak. Same for resume. **This is the highest-value test in the story** — it locks the behavior the literal AC wording misses.
  - [x] **Concurrent independence (AC5):** seed two jobs (`Acme/Engineer`, `Beta/Designer`); fire both `generate-cover-letter` calls (await `Promise.all`), one resolving success and one throwing; assert `register` called twice with the two distinct `{ company, role }` payloads and `finalize` called for both (`'done'` for one id, `'failed'` for the other) — neither finalize uses the other's id.
  - [x] Keep `bun:test` only (`describe`/`test`/`expect`/`beforeAll`/`beforeEach`/`afterEach`/`mock`/`spyOn`). Reuse the existing in-memory DB harness (`process.env.DB_PATH = ':memory:'` at top, `prodSqlite`, the `jobsApp` wrapper with its `userId:1` middleware) — do not stand up a second app or DB.

- [x] **Task 4 — Validate** (AC: 1–6)
  - [x] `bun test src/server/routes/api-jobs.test.ts` → all green (existing + new). Confirm the existing non-generate describe blocks still pass under the new file-global service mocks.
  - [x] `bunx tsc --noEmit` → no new errors in `api-jobs.ts` / `api-jobs.test.ts`.
  - [x] Run the full suite and record the pass/fail delta vs. baseline in Completion Notes. The repo carries ~40 pre-existing, environment-dependent failures in unrelated files (documented in 46.2/46.3 — `upsert business logic`, `runDiscovery()`, `runAnalysis()`, `POST /api/ingest`, etc.). Do not chase them; only confirm zero **new** failures in `api-jobs.test.ts`.
  - [x] If success-path tests write PDFs under `data/cover-letters/` or `data/resumes/`, optionally clean them in `afterAll` — `data/` is gitignored, so this is hygiene, not a correctness requirement.

## Dev Notes

### Scope & boundaries
- This story wires **only** the two generate handlers in `src/server/routes/api-jobs.ts` (cover letter + resume) into the already-built registry. **No** changes to `generateCoverLetter` / `generateResume` internals or signatures, **no** changes to `api-webhooks.ts` (that was 46.3, `done`), **no** SSE/route changes (46.2, `done`), **no** client/UI (46.5/46.6). Consume the registry's public surface exactly as exported by 46.1 — do not modify the registry.
- The `activityRegistry` singleton you import is the **same instance** the SSE endpoint (`api-activity.ts`, 46.2) subscribes to. Reporting into it here is what makes the live stream show cover-letter/resume progress end-to-end — that wiring is the whole point of this story.
- This is **additive**: both endpoints must behave exactly as before (same JSON / PDF responses, same status codes, same `recordRun` rows, same disk writes), plus the registry now reflects each generation as a busy run that clears on completion.

### Registry public surface (from `src/server/services/activity-registry.ts`, 46.1 — READ-ONLY, do not modify)
- `register({ userId, type, progress }): string` — creates a `running` run, returns its `id`. `userId` is a **number**. For this story `type` is `'cover_letter'` or `'resume'`, and `progress` is the **doc variant** `{ company: string, role: string }` (`activityDocProgressSchema`, `schemas.ts:139-142`). Do **not** use the count variant `{ count, total }` — that's discovery/analysis (46.3).
- `finalize(id, 'done' | 'failed'): void` — sets terminal state, emits, prunes after `RETENTION_MS` (5s). **Idempotent**: no-ops if the run is already finalized or unknown, so calling it on the success path then again is harmless — but you should still reach exactly one logical finalize per run (the `try/finally` guarantees this). No `progress(...)` calls are needed in this story — cover-letter/resume have no intermediate progress to report; they register, run opaquely, and finalize.

### Why `try/finally` (and not finalize-at-each-return) — the core correctness point
The two generate handlers each have **multiple return paths after the run is registered**, and critically, **two of them never call `recordRun`**:

**Cover letter (`api-jobs.ts:339-414`) — return paths after registration:**
| Line | Path | Calls `recordRun`? | Must finalize |
|------|------|--------------------|---------------|
| 365 | `503` — `generateCoverLetter` threw `'ANTHROPIC_API_KEY not configured'` | **No** | `failed` |
| 368 | `502` — `generateCoverLetter` threw (other) → `recordRun(false)` | Yes | `failed` |
| 384 | `502` — PDF write failed → `recordRun(false)` | Yes | `failed` |
| 398 | `500` — `coverLetters` DB transaction failed | **No** | `failed` |
| 413 | `200` — success → `recordRun(true)` | Yes | `done` |

**Resume (`api-jobs.ts:416-478`) — return paths after registration:**
| Line | Path | Calls `recordRun`? | Must finalize |
|------|------|--------------------|---------------|
| 442 | `503` — `generateResume` threw `'ANTHROPIC_API_KEY not configured'` | **No** | `failed` |
| 445 | `502` — `generateResume` threw (other) → `recordRun(false)` | Yes | `failed` |
| 472 | `200` — success → `recordRun(true)` (PDF-persist catch at 465-468 is non-fatal, falls through) | Yes | `done` |

If you finalize **only** where `recordRun` is called (the literal AC reading), the `503` and `500` paths leak a run stuck `running` forever — the registry only prunes **after** a `finalize`, so a never-finalized run is never removed. Every user who hits "generate" without a configured key (the 503 path — common on a fresh/misconfigured install) would accumulate a phantom "Generating cover letter — …" row that never clears, across all their tabs, until the server restarts. The `try { … } finally { finalize(runId, outcome) }` pattern collapses all five/three paths to a **single guaranteed finalize**, defaulting to `'failed'` and flipping to `'done'` only on the success return. This is the robust, leak-proof shape and directly satisfies AC4 + AC6. (It also covers a throw between `register` and the body, which 46.3's review flagged as a deferred hardening gap — here we close it.)

Do **not** instead sprinkle `finalize` before each `return` — it's error-prone (the two no-`recordRun` returns are exactly the ones easy to forget) and risks a double-finalize bug on refactor. One `finally`, one `outcome` flag.

### Read-before-write: the file this story touches
- **`src/server/routes/api-jobs.ts` (UPDATE)** — the only production file changed. Read both handlers in full (`:339-414` cover letter, `:416-478` resume). Current state recap:
  - Both: validate `:id` (`/^\d+$/` then `> 0`) → 400; fetch `job` scoped to `userId` → 404; require `job.jobDescription` → 400. Then a `try` awaiting the service; a `catch` that special-cases `'ANTHROPIC_API_KEY not configured'` → 503 (no `recordRun`) and otherwise `recordRun(success:false)` → 502. Cover letter then does cost math, PDF temp-write+rename (catch → `recordRun(false)` → 502), a `db.transaction` inserting `coverLetters` + setting `jobs.coverLetterSentAt` (catch → 500, **no** `recordRun`), re-selects the inserted row, `recordRun(success:true)`, returns `{ coverLetter: inserted }`. Resume does cost math, profile lookup for the filename, a **non-fatal** PDF-persist try/catch, `recordRun(success:true)`, returns the PDF as a `Response`.
  - **What you change:** one import; per handler — `register` after the guards/before the await, wrap the body in `try/finally` with an `outcome` flag, finalize once in `finally`. **What you must preserve:** every existing `return`, status code, error shape, `recordRun` arg object, the cost math, the PDF disk I/O, and the `coverLetters` transaction.
- **`src/server/services/cover-letter-service.ts` (READ-ONLY):** `generateCoverLetter(job: Job, userId?: number): Promise<{ content, pdf: Buffer, inputTokens, outputTokens }>` (`:90`). Throws `'ANTHROPIC_API_KEY not configured'` when unconfigured — the source of the 503 path.
- **`src/server/services/resume-service.ts` (READ-ONLY):** `generateResume(job: Job, userId?: number): Promise<{ pdf: Buffer, inputTokens, outputTokens }>` (`:59`). Same `'ANTHROPIC_API_KEY not configured'` throw.

### Critical project rules (from `_bmad-output/project-context.md`)
- **`userId` is a `number`**, read only from `c.get('userId')` (already done at the top of both handlers — reuse that local `userId`). The registry keys on it. Never read it from body/query.
- **No envelope / error-shape changes:** author no new responses. Every error keeps its existing `c.json({ error: string }, status)` form. Do not introduce `{ message }`.
- **Shared types** come only from `src/shared/schemas.ts` — the doc-progress shape is `activityDocProgressSchema` (`{ company, role }`), consumed transitively via the registry's typed `register`. Do not redefine it inline.
- **`console.error`** for server errors (already used; leave as-is). `console.log` for errors is forbidden.
- **No speculative abstractions, no comments unless non-obvious, no helpers for one-time ops.** Do not extract a "registry-wiring" helper; the wiring is `register` + the `try/finally` inline per handler.
- **No error handling for impossible scenarios** — `register` always returns an id; `finalize` no-ops safely on unknown/finalized ids, so you need no guards around the `finally` finalize.

### Previous-story intelligence (46.3 — `done`)
- 46.3 wired discovery/analysis the same way and is the closest template. It used `register` before the await and `finalize` on a try-tail + catch. **This story's handlers are riskier** because they have more return paths and two that skip `recordRun` — hence the `try/finally` upgrade over 46.3's two-point finalize.
- 46.3's code review **deferred** a "no `try/finally` guaranteeing finalize on pre-`try` throw / teardown" hardening item (low risk there given a single try/catch). Here that hardening is **adopted, not deferred** — the `try/finally` is the prescribed shape.
- 46.3's review **deferred** "unasserted `userId` forwarding to `register`" because the webhook test harness has no auth middleware. **This story's `api-jobs.test.ts` harness DOES set `userId:1`** (`jobsApp` middleware) — so assert `userId: 1` in the register-payload test and close that gap.

### Testing standards (from project-context.md#Testing Rules + the existing harness)
- Runner is `bun:test` — `describe`/`test`/`expect`/`beforeAll`/`beforeEach`/`afterEach`/`mock`/`spyOn`. Never vitest/jest.
- **Extend the existing `src/server/routes/api-jobs.test.ts`** (co-located, `process.env.DB_PATH = ':memory:'` at top, `jobsApp` wrapping `api-jobs` with a `c.set('userId', 1)` middleware, raw-SQL DDL in `beforeAll`, `DELETE` cleanup in `beforeEach`). Add two new `describe` blocks (`POST /api/jobs/:id/generate-cover-letter`, `POST /api/jobs/:id/generate-resume`). Don't create a parallel file.
- **The two services MUST be mocked** via `mock.module(...)` hoisted **above** the existing `await import('./api-jobs')` — without this the real Anthropic-backed services run. This is the single biggest test-setup change (the file has no service mocks today).
- **Extra tables for success paths:** add `cover_letters`, `profile`, `webhook_runs` DDL to `beforeAll` (see Task 3). Failure/503/concurrency tests don't strictly need `cover_letters`/`profile` (those paths return before touching them), but `webhook_runs` is hit by the non-503 `recordRun(false)` failure path — create it.
- HTTP contract tests use `jobsApp.request('/<id>/generate-cover-letter', { method: 'POST' })` against the real handler — no HTTP server. Assert BOTH the registry calls (via `spyOn`) AND the existing response/status (regression guard).
- Assert error responses keep the `error` key and no `message` key.

### Project Structure Notes
- **Edited (production):** `src/server/routes/api-jobs.ts` — one import + `register`/`try/finally`/`finalize` wiring in two handlers. No other production file changes (registry, services, schemas, `index.ts`, `api-webhooks.ts` all untouched).
- **Edited (test):** `src/server/routes/api-jobs.test.ts` — add service `mock.module`s, extra-table DDL, two `describe` blocks with `spyOn` registry assertions.
- No new files, no new dependencies, no new migrations. Routes keep their mounts; `POST /api/jobs/:id/generate-cover-letter` and `/generate-resume` are unchanged in `src/index.ts`.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-46-activity-dropdown.md#Story 46.4] — full AC text; "register with company/role before the await, finalize done|failed, concurrent runs independent" contract and the architecture note that all wiring happens at the route-handler layer (no service internals change).
- [Source: _bmad-output/implementation-artifacts/46-3-wire-discovery-analysis-into-the-registry.md] — sibling pattern (register-before-await, finalize on terminal paths); the deferred `try/finally` and unasserted-`userId` items this story closes.
- [Source: _bmad-output/implementation-artifacts/46-1-in-progress-run-registry-and-shared-activity-types.md] — registry public surface, `userId: number`, `RETENTION_MS` pruning, relative-import convention.
- [Source: _bmad-output/implementation-artifacts/46-2-user-scoped-sse-stream-endpoint.md] — the SSE consumer subscribing to the same `activityRegistry` singleton; the full-suite ~40-fail baseline to compare against.
- [Source: job-hunt-dashboard/src/server/routes/api-jobs.ts:339-414] — cover-letter handler: guards, `generateCoverLetter` try/catch (503 / 502), PDF write, `coverLetters` transaction (500), success `recordRun` + `{ coverLetter }`.
- [Source: job-hunt-dashboard/src/server/routes/api-jobs.ts:416-478] — resume handler: guards, `generateResume` try/catch (503 / 502), non-fatal PDF-persist catch, success `recordRun` + PDF `Response`.
- [Source: job-hunt-dashboard/src/server/services/activity-registry.ts:28-66,84] — `register`/`finalize` signatures, idempotent no-op guards, exported `activityRegistry` singleton.
- [Source: job-hunt-dashboard/src/shared/schemas.ts:139-155] — `activityDocProgressSchema` (`{ company, role }`), `activityRunTypeSchema`, `ActivityProgress`, `ActivityRun`.
- [Source: job-hunt-dashboard/src/server/services/cover-letter-service.ts:90, resume-service.ts:59] — service signatures and the `'ANTHROPIC_API_KEY not configured'` throw driving the 503 path.
- [Source: job-hunt-dashboard/src/server/routes/api-jobs.test.ts:1-90] — existing harness (`jobsApp` with `userId:1` middleware, in-memory DB, `beforeAll` DDL, `beforeEach` DELETE) to extend; note it has NO service mocks and creates only `jobs`/`status_events`/`messages` tables.
- [Source: job-hunt-dashboard/src/server/routes/api-webhooks.test.ts:24-42] — the `webhook_runs` DDL to mirror; the `mock.module` + `spyOn(activityRegistry, …)` pattern proven in 46.3.
- [Source: _bmad-output/project-context.md#Testing Rules, #Framework-Specific Rules] — `bun:test` only, co-located tests, `{ error }` shape, `console.error`, no speculative abstractions.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / bmad-dev-story)

### Debug Log References

None — no HALT conditions or blocking failures encountered.

### Completion Notes List

- **Both handlers wired identically with the `try/finally` + `outcome` flag pattern** (Task 1, Task 2). `activityRegistry.register({ userId, type, progress: { company, role } })` is called immediately after the three guards (invalid-id 400 / not-found 404 / no-description 400) and before the service `await`; the entire existing handler body is wrapped so a single `finally` calls `finalize(runId, outcome)` exactly once. `outcome` defaults to `'failed'` and flips to `'done'` only on the success return. This collapses all five cover-letter return paths (503, two 502s, 500, 200) and all three resume return paths (503, 502, 200) to one guaranteed finalize — closing the phantom-"running" leak on the two no-`recordRun` paths (cover-letter 503/500, resume 503) that the literal AC wording would miss (AC4, AC6).
- **Additive only** — no `recordRun` arg objects, cost math, PDF disk I/O, `coverLetters` transaction, response shapes, or status codes changed. Verified by the existing inner try/catch blocks and their `return c.json(...)` statements being preserved verbatim.
- **Tests (Task 3):** added `mock.module` stubs for `cover-letter-service`/`resume-service` hoisted above the `await import('./api-jobs')`, driven per-test via module-level `coverLetterImpl`/`resumeImpl`. Added `cover_letters`, `profile`, `webhook_runs` DDL to `beforeAll` and their `DELETE` to `beforeEach`; added a top-level `afterEach(() => mock.restore())`. 11 new tests across two `describe` blocks cover: register payload incl. `userId: 1` (closing 46.3's deferred unasserted-userId gap), success→`done`, service-throw→502+`failed`, **503 leak-guard (no `webhook_runs` row, still finalizes `failed`)**, guards-register-nothing, and concurrent independence (two distinct payloads, two distinct finalize ids, `{done, failed}` states).
- **Validation (Task 4):**
  - `bun test src/server/routes/api-jobs.test.ts`: **55 pass / 9 fail**. All 11 new tests pass. The 9 failures are **pre-existing** — confirmed by running the committed HEAD versions of both files (**44 pass / 9 fail**); they stem from the committed `dateArchived` writes in unrelated PATCH-archived / bulk-archive / POST `/api/jobs` blocks hitting a `date_archived` column absent from the test's `jobs` DDL. Not in scope for this story; left untouched.
  - `bunx tsc --noEmit`: the only two errors in api-jobs files (`new Response(pdfBuffer)` Buffer→BodyInit on unchanged code; `c.set('userId', 1)` overload on the untyped test-harness Hono app) are **pre-existing at HEAD** (verified identical against committed versions, only line-shifted). **Zero new tsc errors.**
  - Full suite: **445 pass / 40 fail** — matches the documented ~40 pre-existing env-dependent baseline from 46.2/46.3 (`upsert business logic`, `runDiscovery()`, `runAnalysis()`, `POST /api/ingest`, plus this file's 9). **Zero new failures.**

### File List

- `job-hunt-dashboard/src/server/routes/api-jobs.ts` (modified) — registry import; `register`/`try/finally`/`finalize` wiring in the cover-letter and resume handlers.
- `job-hunt-dashboard/src/server/routes/api-jobs.test.ts` (modified) — service `mock.module`s, `activityRegistry` import, `cover_letters`/`profile`/`webhook_runs` DDL, `afterEach` mock.restore, two new `describe` blocks (11 tests).

## Change Log

| Date       | Change                                                                                          |
|------------|-------------------------------------------------------------------------------------------------|
| 2026-06-25 | Wired cover-letter & resume handlers into `activityRegistry` (register before await, finalize once via try/finally); added 11 contract tests. Status → review. |

### Review Findings

_Code review 2026-06-25 (adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 6 ACs assessed MET. Verified empirically: `bun test src/server/routes/api-jobs.test.ts` → 55 pass / 9 fail, all 11 new generate-handler tests pass, the 9 failures all pre-existing (PATCH-archive / POST `/api/jobs` / bulk-archive `date_archived` gap), none in the new describe blocks._

- [x] [Review][Patch] No dedicated test for the cover-letter `500 'Failed to store cover letter'` DB-transaction leak path [job-hunt-dashboard/src/server/routes/api-jobs.test.ts] — AC4 explicitly names this as one of the two no-`recordRun` leak paths that must finalize `'failed'`, but only the 503 path got dedicated tests (both handlers). The 500 path is structurally covered by the shared `finally` yet never directly asserted. **APPLIED:** added `'DB store failure: 500 still finalizes failed with no recordRun row (AC4 leak guard)'` test — drops `cover_letters` to force the transaction to throw, asserts `500` + `error` shape + 0 `webhook_runs` rows + `finalize(runId, 'failed')` once, restores the table in `finally`. Suite: 56 pass / 9 fail (was 55/9; the 9 remain pre-existing, none in the generate blocks). No new tsc errors.
- [x] [Review][Defer] Success `outcome = 'done'` set after the success `recordRun(...)` [job-hunt-dashboard/src/server/routes/api-jobs.ts:415-417,481-483] — if `recordRun` throws on the success path, `finally` finalizes `'failed'` despite work being committed. Deferred, follows spec's explicit placement; `'failed'` defensible when request 500s.
- [x] [Review][Defer] Same-job concurrent generations share identical tmp/final PDF paths from `rawId` [job-hunt-dashboard/src/server/routes/api-jobs.ts:380-381,471-474] — rename can interleave/clobber. Deferred, pre-existing disk-I/O concern outside this story's registry invariant (AC5 holds).
