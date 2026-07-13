---
project_name: 'hitlobster'
user_name: 'Stryker'
date: '2026-07-13'
status: 'complete'
verified_against_commit: 'ce803e3'
verified_by: 'scripts/verify-context.sh (39 checks, all passing) + bun test baseline re-measured'
rule_count: 27
optimized_for_llm: true
design: 'Owns rules and rationale. Borrows facts by reference. See Maintenance.'
---

# Project Context for AI Agents

**How to read this file.** It states *rules* and *why they exist* — things the code cannot
say about itself. It deliberately does **not** restate facts the code already owns
(versions, paths, values); those are cited by anchor so you can read them at the source.

Every rule carries an anchor (`file:line`) and a tag:
- `[P]` **Prescriptive** — a constraint on code you write. Violating it breaks something.
- `[D]` **Disambiguation** — a fact you will otherwise get wrong. Not inferable quickly.
- `[!]` **Defect** — currently true, should not be. Remove this line when fixed.

**If a rule contradicts the code, the code is right and this file is stale.** Fix the file.
Do not "correct" the code to match a rule here. A previous version of this document
inverted a production bind address and an agent acted on it.

---

## Invariants

These are load-bearing across nearly every task.

- `[P]` **This is a multi-tenant application.** Every user-facing table carries `user_id`.
  Any query that reads or writes user data must scope on it. — `src/db/schema.ts`
- `[P]` **`userId` and `sessionUserId` are not the same thing.** Auth middleware sets both:
  `userId` is impersonation-aware (what an admin is *acting as*); `sessionUserId` is the
  real logged-in account. **Scope data queries on `userId`. Make privilege decisions on
  `sessionUserId`.** (Because inverting these either blinds an impersonating admin or
  escalates an impersonated session to admin.) — `src/server/middleware/auth-middleware.ts`,
  `src/server/middleware/admin-middleware.ts:8`
- `[P]` **Production binds `0.0.0.0` and speaks plain HTTP.** nginx terminates TLS.
  Never add TLS to the app; never bind localhost in production. — `src/index.ts:186`
- `[P]` **Runtime is Bun, not Node.** In `src/`. Reach for Bun APIs and `bun` commands,
  never npm/node idioms. (The single most common agent error in this repo.)
- `[P]` **`src/shared/schemas.ts` is the only source of cross-boundary types.**
  Never redefine `Job`, `IngestPayload`, etc. inline or import them from elsewhere.
- `[P]` **Mutating requests require CSRF.** Client code must go through `apiFetch`
  (`src/client/lib/api.ts`), never bare `fetch()`, or the request 403s.

---

## Rules by Surface

### Main app — `src/`

- `[P]` **Data ownership governs every write.** Columns are scraper-owned, analysis-owned,
  or user-owned. The ingest upsert must never overwrite user-owned columns. The current
  `onConflictDoUpdate.set` block is the contract — read it before adding a column.
  — `src/server/services/ingest-service.ts`
- `[P]` **The `jobs` uniqueness key is `(company, jobTitle, userId)`** — all three.
  Omitting `userId` collides jobs across tenants. — `src/db/schema.ts`
- `[P]` **`messages` uniqueness is `(uid, userId)` and `(messageId, userId)`** — never the
  column alone. Two tenants legitimately share an IMAP UID or a Message-ID. Because the
  fetch services use an untargeted `.onConflictDoNothing()`, a global unique index does not
  raise — it *silently drops* the second tenant's mail. — `src/db/schema.ts`
- `[P]` **`PATCH /api/jobs/:id` has an allowlist.** Read it; don't widen it casually.
  — `src/server/routes/api-jobs.ts`
- `[P]` **SQLite is single-writer.** One file, one volume, and the Bun app is the sole
  writer. The scraper returns data over HTTP; it never touches the database. WAL and
  `busy_timeout` are set at connection init; both are no-ops on `:memory:`. — `src/db/client.ts`
- `[P]` **API responses are bare data. Errors are `{ error: string }` + status.**
  No envelope, no `{ message }`. A single `onError` handler catches thrown errors.
  **Unexpected errors return a generic 500** — never `err.message`, which leaks paths and
  SQL. Throw `HTTPException` when the client should see the message.
  — `src/server/middleware/error-handler.ts`
- `[D]` **Anthropic is called with raw `fetch`.** There is no `@anthropic-ai/sdk`
  dependency and one must not be added. — `src/server/services/analysis-service.ts`
- `[P]` **API keys are per-user (BYO), read encrypted from `user_secrets`.**
  Never `process.env.ANTHROPIC_API_KEY`. — `src/server/lib/crypto.ts`
- `[D]` **Embeddings run locally** via `@xenova/transformers`. Do not migrate to
  `@huggingface/transformers`. The model is **baked into `hitlobster-deps` at build time**
  into `$EMBEDDING_CACHE_DIR`; production sets `allowRemoteModels = false`, so a hub fetch
  raises instead of silently downloading. **`EMBEDDING_CACHE_DIR` is therefore required when
  `NODE_ENV=production`** and the module throws at import without it. `@xenova` v2 ignores
  `TRANSFORMERS_CACHE` — set `env.cacheDir` in code, before the first `pipeline()` call.
  — `src/server/services/embedding-service.ts`, `Dockerfile.deps`
- `[P]` **No `tailwind.config.js`, no `postcss.config.js`.** Tailwind 4 is CSS-first.
- `[P]` **Relative imports carry no file extension.**

### Scraper sub-app — `scraper/`

- `[P]` **Never import across the `src/` ↔ `scraper/` boundary.** Different runtime
  (Bun vs Node), different module system, different Zod major. The app talks to the
  scraper over localhost HTTP at `process.env.SCRAPER_URL`.
  — `src/server/services/scraper-process.ts`
- `[D]` **`bun install` is used here too**, despite the `package-lock.json`.
  Nothing runs `npm ci`. — `Dockerfile.deps`
- `[P]` **The Firefox pool is a hard ceiling of 2**, enforced in memory. Features that
  assume scraping parallelism will silently queue. — `scraper/src/browser/pool.js`
- `[P]` **Browser auth sessions are process-local and ephemeral.** Restarting the app or
  scraper destroys every live LinkedIn/Indeed session.

### Deployment

- `[P]` **`hitlobster-deps:latest` is built locally, never pulled.** Run
  `bash scripts/build-deps.sh` before the first `docker compose build`, and whenever
  dependencies or the Playwright version change. It bakes system packages, production
  `node_modules`, and all browser installs.
- `[P]` **Never `bun install` to fix a missing dependency at runtime** — rebuild the deps
  image. `argon2` (native) and `@xenova/transformers` (WASM) will not resolve otherwise.
- `[P]` **Required env: `PORT`, `DB_PATH`, `ENCRYPTION_KEY`, `APP_URL`.** The app exits at
  boot if any is absent. `ENCRYPTION_KEY` must match `/^[0-9a-fA-F]{64}$/`. — `src/index.ts`
- `[P]` **WebSocket paths need their own nginx location.** `location /` does not upgrade.
  A regex block matching `/api/onboarding/(linkedin|indeed)/browser/:id/ws` carries
  `proxy_http_version 1.1`, `Upgrade`, `Connection "upgrade"`, and a 3600s read timeout.
  Any new WS route must be added to that regex, or it silently falls through to
  `location /` and fails the handshake. — `nginx/nginx.conf`

---

## The Three Playwright-Shaped Packages

The single most confusing thing in this repo. There is no code fix; you must simply know it.

| Import | Browser | Headless | Used by |
|---|---|---|---|
| `patchright` | Chromium | **`false`** | `indeed-browser-service.ts` — stealth auth |
| `playwright` | Firefox | `true` | `linkedin-browser-service.ts`, `scraper/src/browser/pool.js` |
| `playwright` | Chromium | default | `generate-pdf.ts` |

`patchright` floats at `*` on purpose — it tracks upstream stealth patches.
`indeed-browser-service` is the **only** headful browser and the sole reason `Xvfb :99`
runs in `entrypoint.sh`. Do not "optimize" it to `headless: true`; that defeats the
anti-detection stack. Anything touching Playwright, Xvfb, or the embedding model
**hangs rather than fails** — a hung test is a broken test, not a slow one.

---

## Verification — when you may believe a green checkmark

- **There is no CI and no linter.** Nothing runs automatically. Ever.
- `bun run test` — covers `src/` **only**. `scraper/` has zero test files. A change there is
  verified by hand or not at all.
- `bun run typecheck` (`bunx tsc --noEmit`) — the **only** type gate, and a separate step.
  `bun test` transpiles without type-checking, so a test file with wrong types runs and passes.
  It is **green**; keep it that way. Judge a change by the *delta*, not the absolute count.
- `[!]` **`bun test` is red: 9 tests fail on a clean checkout** (673 pass, measured on `main`
  at `ce803e3`; a flaky resume-E2E test can make it 10). A green run is not the bar; "no new
  failures versus the merge base" is. Capture the baseline before you start, and diff failing
  *names*, not counts. The 9 standing failures, so you can tell yours from these:
  - `PUT /api/onboarding/linkedin` — all five (`valid content → 200`, `missing content field
    → 400`, `empty content → 400`, `invalid JSON body → 400`, `second PUT upserts`)
  - `GET /api/onboarding/gmail/labels > connected but refresh token revoked … → 502`
  - `POST /api/messages/sync (Gmail) > revoked/expired token → 502`
  - `startScraperProcess > defaults AUTH_DIR to <scraper_dir>/auth when not set`
  - `GET /:id/cover-letter > returns 200 with most recent cover letter`
  This count is **not** asserted by `verify-context.sh` — checking it costs a full suite run,
  and the suite can hang (see the Playwright/Xvfb note above), so the script stays fast and
  this line stays faith-maintained. It read `43` for months while the real number was `9`;
  re-measure it when you touch it.
- **Tenant isolation must be proven, not assumed.** A passing query proves nothing. Seed as
  user A, act as user B, assert A's rows are invisible.
  — `src/server/services/tenant-isolation.test.ts`
- Test conventions: `process.env.DB_PATH = ':memory:'` on **line 1, before any import**
  (the db singleton binds its connection at import time). `mock.module()` calls must precede
  a dynamic `await import()` of the module under test (bun:test hoisting).
- `[D]` **One `bun test` process shares one in-memory database across every test file.**
  The db singleton is imported once. Each file's `CREATE TABLE IF NOT EXISTS` therefore
  **no-ops if another file got there first** — the first file to run defines the schema for
  the whole suite. A DDL that diverges from `schema.ts` (a missing `DEFAULT`, a stale
  `UNIQUE`) breaks *other* files, and only in the full run. Tests pass in isolation and fail
  together. Keep every hand-rolled DDL identical to production.

---

## Stack Identity

Durable identity only. **For versions, read `package.json` and `scraper/package.json`** —
this file will not restate them.

Bun (runtime, package manager, test runner) · Hono · Drizzle over `bun:sqlite`
(`drizzle-orm/bun-sqlite`, never `better-sqlite3`) · React · TanStack Query/Router/Table ·
Tailwind 4 via `@tailwindcss/vite` · shadcn/ui + Radix · Zod ^3 in `src/`, **Zod ^4 in
`scraper/`** — never share schemas or assert on Zod error shapes across that boundary.
argon2id for passwords · AES-256-GCM for user secrets · Docker Compose + nginx + Let's Encrypt.

---

## Maintenance

This file rots silently because its only reader — an AI agent — is told to trust it and
cannot detect that it is wrong, while the only human who *could* detect it has no reason
to open it. The previous version inverted a production bind address and went unnoticed
for three months across ~24 epics.

Two mechanisms, both attached to things that already happen:

1. **`bash scripts/verify-context.sh`** — greps that assert each `[P]` and `[!]` rule still
   matches the code. A rule that cannot be made into a check is a rule maintained by faith.
2. **Epic close.** The retrospective asks: *did this epic invalidate any rule here?*
   Fix or delete it in the same commit.

**Before adding a rule, ask: could an agent discover this by reading the code?**
If yes, do not write it. The code will always be more current than your sentence about it.
