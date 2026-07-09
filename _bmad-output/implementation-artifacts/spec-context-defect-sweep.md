---
title: 'Close six context-verified defects and reconcile the verification harness'
type: 'bugfix'
created: '2026-07-09'
status: 'done'
baseline_commit: '91eb972258c83fe662585ddca3464bd7629a70b9'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/job-hunt-dashboard/scripts/verify-context.sh'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Six defects are live, three of them production-only: WebSocket onboarding cannot handshake behind nginx, SQLite runs without WAL or `busy_timeout` under multi-tenant load, and the embedding model is pulled from the HuggingFace hub at runtime. Separately, `messages.uid` and `messages.messageId` are globally unique rather than unique-per-user, so a second tenant's email is **silently dropped** by `.onConflictDoNothing()` — no error, and the caller still counts it as added.

**Approach:** Fix all six defects plus error-handler hardening on one branch. Because four of these fixes invalidate assertions in `scripts/verify-context.sh` and rules in `project-context.md`, reconcile the harness and the context file in the same commit — otherwise the fixes silently rot the only mechanism that detects rot.

## Boundaries & Constraints

**Always:**
- Runtime is Bun in `src/`. Bun APIs and `bun` commands only.
- API error responses keep the `{ error: string }` shape with an HTTP status. No envelope.
- Scope data queries on `userId`; make privilege decisions on `sessionUserId`.
- New migration continues at `0039`; its `meta/_journal.json` entry must be added in the same change.
- `bash scripts/verify-context.sh` must exit 0 with zero `DRIFT` lines when this work is done.

**Ask First:**
- Changing `.onConflictDoNothing()` in `email-fetch-service.ts` / `gmail-fetch-service.ts` to a targeted conflict clause.
- Adding any dependency.
- Altering the *meaning* of a `[P]` rule (as opposed to its anchor or a `[!]`/`[D]` rule).

**Never:**
- No `@anthropic-ai/sdk`, no `better-sqlite3`, no `@huggingface/transformers`.
- Never bind localhost or terminate TLS in the app.
- Never set `env.allowRemoteModels = false` outside production — `embedding-service.test.ts` loads the real model and would hang, not fail.
- Do not touch `scraper/`. Do not add `tailwind.config.js` or `postcss.config.js`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| WS handshake behind nginx | `GET /api/onboarding/linkedin/browser/:id/ws` with `Upgrade: websocket` | `101 Switching Protocols`; connection survives past 120s idle | Closes only when app closes |
| SSE unaffected | `GET /api/activity/stream` | Still streams; `Connection ''`, no upgrade | N/A |
| Cross-tenant IMAP UID | user A holds `(uid='INBOX:1', user_id=1)`; user B inserts `(uid='INBOX:1', user_id=2)` | **Both rows exist** | N/A |
| Cross-tenant Message-ID | A holds `(message_id='<x@y>', user_id=1)`; B inserts same `message_id`, `user_id=2` | **Both rows exist** | N/A |
| Same-tenant duplicate uid | user 1 inserts `uid='INBOX:1'` twice | Second insert no-ops; one row | `onConflictDoNothing` |
| Unexpected throw | Route throws `Error('ENOENT /data/jobs.db')` | `500 { error: 'Internal Server Error' }` | Full error logged server-side only |
| Deliberate 4xx | Route throws `HTTPException(400, { message: 'Bad input' })` | `400 { error: 'Bad input' }` | Message passed through intact |
| Cold prod container, no egress | First `embed()` call | Resolves to 384-dim vector from baked cache | No network request attempted |

</frozen-after-approval>

## Code Map

- `nginx/nginx.conf` -- `location /` lacks upgrade headers; regex location must precede it
- `src/db/client.ts` -- bare `new Database(...)`; PRAGMA insertion point
- `src/db/schema.ts` -- `messages.uid` / `messages.messageId` carry column-level `.unique()`
- `src/db/migrations/0039_per_user_unique_messages.sql` -- **new**; drops `messages_uid_unique` + `messages_message_id_unique`
- `src/db/migrations/meta/_journal.json` -- last entry is idx 38
- `src/db/migrations/0022_per_user_unique_jobs.sql` -- precedent: identical global→compound rewrite for `jobs`
- `src/server/services/embedding-service.ts` -- `pipeline()` at line 8; no `env` config. `TRANSFORMERS_CACHE` is **not** read by `@xenova` v2 — `env.cacheDir` must be set in code
- `Dockerfile.deps` -- base image for `Dockerfile` stage 2; where the model gets baked
- `src/server/middleware/error-handler.ts` -- returns raw `err.message` on 500. `HTTPException` is thrown **nowhere** today (0 occurrences)
- `src/server/routes/api-messages.test.ts` -- hand-rolled DDL declares `uid TEXT NOT NULL UNIQUE`; must track the schema change
- `src/server/services/tenant-isolation.test.ts` -- **new**
- `scripts/verify-context.sh` -- lines 42, 68, 72, 73 all assert state this work changes
- `_bmad-output/project-context.md` -- `[!]` nginx rule (103–107), `[D]` embedding rule (74–76), `[P]` error rule (67–69), Verification section (131–133), frontmatter counts

## Tasks & Acceptance

**Execution:**
- [x] `nginx/nginx.conf` -- add `location ~ ^/api/onboarding/(linkedin|indeed)/browser/[^/]+/ws$` with `proxy_http_version 1.1`, `Upgrade $http_upgrade`, `Connection "upgrade"`, `proxy_read_timeout 3600s`, `proxy_buffering off` -- regex locations win over the `location /` prefix, so ordering is safe but keep it above for readability
- [x] `src/db/client.ts` -- run `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000` immediately after construction -- WAL is a silent no-op on `:memory:`, so tests are unaffected
- [x] `src/db/schema.ts` -- drop `.unique()` from `uid` and `messageId`; add `uniqueIndex('messages_uid_user_id_idx').on(table.uid, table.userId)` and `uniqueIndex('messages_message_id_user_id_idx').on(table.messageId, table.userId)`
- [x] `src/db/migrations/0039_per_user_unique_messages.sql` + `meta/_journal.json` -- drop both old indexes, create both compound ones -- global→compound is a *relaxation*, so no existing row can conflict; no data cleanup needed
- [x] `src/server/services/embedding-service.ts` -- set `env.cacheDir` from `EMBEDDING_CACHE_DIR`; set `env.allowRemoteModels = false` **only** when `NODE_ENV === 'production'`
- [x] `Dockerfile.deps` -- set `ENV EMBEDDING_CACHE_DIR=/app/.cache/transformers` and warm the cache with a `bun -e` call to `pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2')` -- `Dockerfile` stage 2 inherits this layer
- [x] `src/server/middleware/error-handler.ts` -- pass `HTTPException` through as `c.json({ error: err.message }, err.status)`; all other errors log fully and return `{ error: 'Internal Server Error' }` with 500
- [x] `package.json` -- add `"test": "bun test"` and `"typecheck": "bunx tsc --noEmit"`
- [x] `src/server/services/tenant-isolation.test.ts` -- **new**; cover the four tenant rows in the I/O Matrix plus a query-scoping assertion (see Design Notes)
- [x] `src/server/routes/api-messages.test.ts` -- update inline DDL to compound unique indexes so the suite matches production schema
- [x] `scripts/verify-context.sh` -- retire both `Defects` checks; invert `still no test script` into `check "test script exists"`; tighten the error-shape check to assert the sanitized literal; add checks for compound-unique and baked model cache
- [x] `_bmad-output/project-context.md` -- delete the `[!]` nginx rule; correct the `[D]` embedding rule; correct the `[P]` error rule; update the Verification section; refresh `rule_count` / `verified_against_commit` / `verified_by`

**Added during execution (see Spec Change Log):**
- [x] `tsconfig.json` -- raise `target`/`lib` ES2020 → ES2022 -- `replaceAll` (ES2021) is used in `analysis-service.ts` and `cover-letter-service.ts`; the lib was the bug, not the call sites
- [x] 87 pre-existing type errors across ~20 files -- fixed to make the new gate green (human chose "fix all 87")
- [x] `src/server/routes/api-jobs.test.ts`, `api-admin.test.ts`, `api-resume.test.ts` -- align hand-rolled `messages` DDL with production; the `:memory:` DB is shared across the whole `bun test` process, so a divergent DDL breaks *other* files
- [x] `src/client/routes/config.tsx` -- fix broken `/logs`, `/profile`, `/prompts` navigation (real paths are `/config/*`) and map the profile card onto `personal.*` + render `websites`
- [x] `src/client/hooks/useMessageMutation.ts`, `components/messages/MessagesTable.tsx` -- narrow `MessagePatch` to `Message` fields and declare `TContext`

**Acceptance Criteria:**
- Given a fresh production image with egress blocked, when `embed('x')` is first called, then it resolves to a 384-length vector without a network request.
- Given `bun run typecheck`, when run at repo root of `job-hunt-dashboard/`, then it exits 0.
- Given `bash scripts/verify-context.sh`, when run after all tasks, then it exits 0 and prints no `DRIFT` line.
- Given `bun test`, when compared against the merge-base baseline of 43 failures, then no *new* failures are introduced.
- ~~Given `_bmad-output/project-context.md`, when grepped for `[!]`, then only the legend line matches.~~ **Superseded** — one `[!]` is deliberately added for the red test suite. Revised: the nginx `[!]` is gone and every remaining `[!]` is intentional.
- Given nginx is running with the new config, when `nginx -t` is executed, then the configuration test passes.

## Spec Change Log

### 2026-07-09 — Type gate is red on arrival (scope expansion)

**Finding.** Installing `"typecheck": "bunx tsc --noEmit"` (defect #4) revealed 87 pre-existing
errors — identical count at baseline `91eb972`, so the gate had *never* been green. The AC
"typecheck exits 0" was therefore unachievable without unrelated work.

**Amendment.** Human chose *Install gate + fix all 87* over recording a red baseline. All 87 fixed.
Root causes: `lib: ES2020` predating `replaceAll` usage (3); Bun's `typeof fetch` requiring
`preconnect`, which mocks lack (45); bare `new Hono()` losing the `userId` context type (10);
`Number.isInteger()` not narrowing `number | undefined` (4); plus real bugs — see below.

**Known-bad state avoided.** Shipping a permanently-red gate that agents learn to ignore.

**KEEP.** Judge future changes by *delta* against the merge base, not absolute counts. `bun test`
remains red (43 failures, unchanged); only the type gate is green.

### 2026-07-09 — Three real bugs surfaced by the type gate

**Finding.** (1) `config.tsx` navigated to `/logs`, `/profile`, `/prompts` — none exist; the real
paths are `/config/*`, so those cards were dead. (2) The same file read `data?.name`, `.linkedinUrl`,
`.githubUrl` off a `{ personal, experience }` shape, so the profile card rendered blank; `linkedinUrl`
and `githubUrl` exist nowhere in the codebase. (3) `MessagePatch` widened `type` to `string`, so the
optimistic `{ ...m, ...patch }` no longer produced a `Message`.

**Amendment.** Routes corrected. Human chose to map the four real fields and render
`personal.websites` as label → url rather than invent a label-matching heuristic for LinkedIn/GitHub.
`MessagePatch` is now `Partial<Pick<Message, 'type'|'company'|'jobTitle'>>`.

**Known-bad state avoided.** Casting the errors away would have preserved three live UI bugs.

### 2026-07-09 — Shared `:memory:` DB across test files

**Finding.** The new `tenant-isolation.test.ts` DDL omitted `DEFAULT 1` on `user_id`. Because one
`bun test` process shares one in-memory DB and `CREATE TABLE IF NOT EXISTS` no-ops, whichever file
runs first defines the schema for the entire suite. This broke 10 previously-passing tests in
`api-messages` and `api-jobs` — while every file still passed *in isolation*.

**Amendment.** Aligned the `messages` DDL in all four declaring test files with production and added
the compound unique indexes to each. Recorded as a `[D]` rule in `project-context.md`.

**Known-bad state avoided.** A 10-test regression invisible to single-file runs.

**KEEP.** Always diff `bun test` failures against the merge base; never trust a single-file run.

### 2026-07-09 — Adversarial review (no loopback; 8 patches applied)

Three reviewers ran on the diff. **No intent_gap, no bad_spec** — the spec held. Patches applied:

1. `src/db/client.ts` — set `busy_timeout` *before* `journal_mode = WAL`. Switching journal mode
   is the statement that requires no other open connection, so it is precisely the one that needs
   the bounded wait. Original order left it unprotected.
2. `0039_per_user_unique_messages.sql` — `DROP INDEX IF EXISTS`. Two reviewers confirmed the index
   names are correct (created in `0006`/`0007`), but `migrate.ts` exists to repair historical schema
   drift, so a hard-failing `DROP` at boot is not worth the risk.
3. `error-handler.ts` — `new HTTPException(404)` has an empty message; never ship `{ error: '' }`.
4. `nginx/nginx.conf` — add `proxy_send_timeout 3600s`; `proxy_read_timeout` alone does not cover
   the client→upstream direction on a long-lived socket.
5. `embedding-service.ts` — throw at import when `NODE_ENV=production` and `EMBEDDING_CACHE_DIR` is
   unset. Otherwise `allowRemoteModels=false` searches an empty default cacheDir and fails deep
   inside a request instead of at boot.
6. `verify-context.sh` — `refute "still no CI"` now tests `../.github/workflows`, not `../.github`;
   an issue-template directory is not CI and would have tripped the harness falsely.
7. `verify-context.sh` — relaxed the error-shape grep to `c.json({ error:` after (3) changed the
   literal. The two precise checks (`500s are sanitized`, `deliberate 4xx pass through`) carry the
   real assertions.
8. `project-context.md` — `rule_count: 30` → `27` (the 3 legend lines matched the rule pattern);
   noted that the 43-failure baseline is 42 on some runs due to one flaky resume-E2E test.

**Rejected as noise or disproved:** migration index-name mismatch (disproved against `0006`/`0007`
and the `0038` snapshot); "error-handler swallows plain `Error` messages" (that is the intended
behavior change, and the full suite shows no regression); unchecked `v as Message['type']` cast
(the Select options are the union, and Zod validates server-side); missing runtime guard on
`personal.websites` (Zod `.default([])`, and `api-profile.ts` always returns `personal`).

## Design Notes

**Why the error-shape check must be tightened, not left alone.** After sanitizing, `error-handler.ts` still contains the literal `c.json({ error: err.message }` on the `HTTPException` branch — so `verify-context.sh:42` keeps passing while proving nothing about 500s. Re-point it at the sanitized literal:

```bash
check "500s are sanitized"  grep -q "error: 'Internal Server Error'" src/server/middleware/error-handler.ts
```

**The tenant-isolation test must build its own schema.** Existing tests hand-roll DDL, and `api-messages.test.ts` currently encodes the *old* global-unique constraint. A test that inherits that DDL cannot prove the fix. Create the table with the compound indexes, then:

```ts
process.env.DB_PATH = ':memory:'   // line 1, before any import — db singleton binds at import time
// seed as user A, act as user B
prodSqlite.run(`INSERT INTO messages (uid, message_id, ...) VALUES ('INBOX:1', '<x@y>', ..., 1)`)
// user B inserting the same uid + message_id must succeed, not silently no-op
```
Assert both rows exist, then assert a `userId`-scoped select as user B returns exactly B's row.

**`.onConflictDoNothing()` stays untargeted.** It has no `target`, so it already responds to whichever unique index fires. Once the indexes are compound, cross-tenant inserts stop conflicting. No call-site change needed — which is why touching it is gated under *Ask First*.

## Verification

**Commands:**
- `bun run typecheck` -- expected: exit 0
- `bun test src/server/services/tenant-isolation.test.ts` -- expected: all pass
- `bun test` -- expected: no regressions (note: `embedding-service.test.ts` loads the real model, 60s timeout)
- `bash scripts/verify-context.sh` -- expected: exit 0, zero `DRIFT`
- `grep -c '^- `\[!\]`' _bmad-output/project-context.md` -- expected: 0 matches

**Manual checks (if no CLI):**
- `nginx -t` inside the running nginx container (a host-side run fails on the absent Let's Encrypt cert paths).
- After `bash scripts/build-deps.sh`, confirm `/app/.cache/transformers` exists in `hitlobster-deps:latest` and contains the ONNX weights.

## Suggested Review Order

**Start here — the multi-tenancy defect and its proof**

- Compound uniqueness replaces global `.unique()`; the silent-data-loss fix.
  [`schema.ts:104`](../../job-hunt-dashboard/src/db/schema.ts#L104)

- Relaxation, not tightening — no existing row can conflict. `IF EXISTS` guards boot.
  [`0039_per_user_unique_messages.sql:1`](../../job-hunt-dashboard/src/db/migrations/0039_per_user_unique_messages.sql#L1)

- Seed as A, act as B: the two tenants that used to collide now coexist.
  [`tenant-isolation.test.ts:74`](../../job-hunt-dashboard/src/server/services/tenant-isolation.test.ts#L74)

- A's rows invisible to B through the real route, not hand-rolled SQL.
  [`tenant-isolation.test.ts:110`](../../job-hunt-dashboard/src/server/services/tenant-isolation.test.ts#L110)

**Production correctness**

- Regex location wins over `location /`; any new WS route must be added here.
  [`nginx.conf:37`](../../job-hunt-dashboard/nginx/nginx.conf#L37)

- `busy_timeout` first: the WAL switch is what needs the bounded wait.
  [`client.ts:7`](../../job-hunt-dashboard/src/db/client.ts#L7)

- Fail at boot, not deep in a request, when the baked cache is absent.
  [`embedding-service.ts:6`](../../job-hunt-dashboard/src/server/services/embedding-service.ts#L6)

- Bakes the model into the base image; stage 2 inherits this layer.
  [`Dockerfile.deps:19`](../../job-hunt-dashboard/Dockerfile.deps#L19)

**Error hygiene — behavior change, read carefully**

- 500s go generic; only `HTTPException` messages reach the client.
  [`error-handler.ts:2`](../../job-hunt-dashboard/src/server/middleware/error-handler.ts#L2)

**The type gate, and the three bugs it caught**

- `lib: ES2020` predated `replaceAll`; the config was the bug, not the call sites.
  [`tsconfig.json:3`](../../job-hunt-dashboard/tsconfig.json#L3)

- `/logs` never existed — these config cards were dead navigation.
  [`config.tsx:24`](../../job-hunt-dashboard/src/client/routes/config.tsx#L24)

- Card read `data.name` off a `{ personal }` shape; it rendered blank.
  [`config.tsx:95`](../../job-hunt-dashboard/src/client/routes/config.tsx#L95)

- Widened `type` broke the optimistic `{ ...m, ...patch }` spread.
  [`useMessageMutation.ts:7`](../../job-hunt-dashboard/src/client/hooks/useMessageMutation.ts#L7)

- `Number.isInteger()` does not narrow; impersonation semantics unchanged.
  [`auth-middleware.ts:38`](../../job-hunt-dashboard/src/server/middleware/auth-middleware.ts#L38)

- Node `Buffer` is not a `BodyInit`; zero-copy view over the same bytes.
  [`api-jobs.ts:485`](../../job-hunt-dashboard/src/server/routes/api-jobs.ts#L485)

**The harness that keeps this honest**

- The old check passed on a string that no longer described 500 behavior.
  [`verify-context.sh:45`](../../job-hunt-dashboard/scripts/verify-context.sh#L45)

- Nothing ran the type gate before; now both gates are scripts.
  [`package.json:11`](../../job-hunt-dashboard/package.json#L11)

- nginx `[!]` deleted; messages-uniqueness rule added in its place.
  [`project-context.md:63`](../project-context.md#L63)

- The gotcha that cost 10 tests: one in-memory DB shared across every test file.
  [`project-context.md:157`](../project-context.md#L157)
