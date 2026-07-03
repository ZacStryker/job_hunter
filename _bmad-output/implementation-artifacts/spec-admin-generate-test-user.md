---
title: 'Admin "Generate Test User" action'
type: 'feature'
created: '2026-07-01'
status: 'done'
baseline_commit: 'd6771e6ff76e8e88d0bb0fbbc30b619d40d148a8'
context: ['{project-root}/_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Manually provisioning a usable test account requires an invite key, an email-activation round trip, and hand-seeding a Claude API key before analysis/cover-letter/resume flows work — too slow for admins who just need a ready account.

**Approach:** Add an admin-only `POST /users/test-user` that (in one transaction) delete-and-recreates a fixed account `admin@hitlobster.ai` with `role:'test'`, `isActive:true`, no invite key consumed, a password from `TEST_USER_PASSWORD`, and a pre-seeded `anthropic_api_key` secret from `TEST_USER_ANTHROPIC_API_KEY`. Surface it as a confirm-gated "Generate Test User" button on the Admin page.

## Boundaries & Constraints

**Always:**
- Entire create (or delete-then-create) runs inside a single `db.transaction`.
- Reuse the exact argon2 params from `api-auth.ts` (`argon2id`, memoryCost 65536, timeCost 3, parallelism 4).
- Re-invocation is idempotent-by-recreate: if `admin@hitlobster.ai` exists, purge it and all owned rows first (mirror the `DELETE /users/:id` cascade), then insert fresh.
- Seed `anthropic_api_key` via `encrypt(...)` even when `TEST_USER_ANTHROPIC_API_KEY` is unset (store `encrypt('')`), so login/onboarding read as complete.
- New account-type value is the string `'test'`; `AdminUser.role` is already `z.string()` so no shared-type change.

**Ask First:**
- Any change to the fixed email (`admin@hitlobster.ai`) or default password constant.

**Never:**
- Do not grant the test user `admin` role or any admin capability.
- Do not consume, delete, or null invite keys except the existing cascade step that nulls `inviteKeys.usedByUserId` for the deleted user.
- Do not add a UI password field or expose the password/API key in any response.
- Do not pre-create search configs, profile, or any rows a normal fresh registration wouldn't have (besides the seeded secret).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First create | No `admin@hitlobster.ai` row; `TEST_USER_ANTHROPIC_API_KEY` set | 201, returns created user (safe fields); active `role:'test'` user + one `anthropic_api_key` secret; no invite key consumed | N/A |
| Recreate | `admin@hitlobster.ai` already exists with data | Old user + owned rows (sessions, userSecrets, messages, searchConfigs, coverLetters, jobs+statusEvents) deleted, `inviteKeys.usedByUserId` nulled, then fresh user created; 201 | N/A |
| Missing API key env | `TEST_USER_ANTHROPIC_API_KEY` unset | User still created; secret stored as `encrypt('')` | N/A |
| Non-admin caller | Session user role ≠ `admin` (incl. `test`) | 403 `{ error }`, no user created | Blocked by `adminMiddleware` at mount |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/server/routes/api-admin.ts` -- add `POST /users/test-user`; import `argon2`, `encrypt`; reuse cascade from `DELETE /users/:id` (lines 112–125) and secret-insert shape from onboarding.
- `job-hunt-dashboard/src/server/routes/api-auth.ts` -- reference only: argon2 params (45–50) and register field set (75–78).
- `job-hunt-dashboard/src/server/routes/api-onboarding.ts:83` -- reference: `encrypt` + `userSecrets` insert pattern.
- `job-hunt-dashboard/src/db/schema.ts:129` -- update `role` comment to include `'test'`.
- `job-hunt-dashboard/src/client/hooks/useGenerateTestUserMutation.ts` -- new hook (mirror `useGenerateInviteKeyMutation.ts`); invalidate `['admin-users']`.
- `job-hunt-dashboard/src/client/routes/admin-users.tsx` -- add "Users" section header with "Generate Test User" button + confirm dialog + sonner toasts.
- `job-hunt-dashboard/src/server/routes/api-admin.test.ts` -- add `describe('POST /api/admin/users/test-user')`.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- change `role` comment to `// 'standard' | 'admin' | 'test'`.
- [x] `src/server/routes/api-admin.ts` -- add `POST /users/test-user`: in one `db.transaction`, look up existing `admin@hitlobster.ai`; if present run the full `DELETE /users/:id` cascade against its id; hash `process.env.TEST_USER_PASSWORD ?? 'test-user-1234'` with the shared argon2 params (hash computed before the transaction); insert user `{ email:'admin@hitlobster.ai', passwordHash, role:'test', isActive:true, createdAt:now }`; read back its id; insert `userSecrets { userId, keyName:'anthropic_api_key', ciphertext: encrypt(process.env.TEST_USER_ANTHROPIC_API_KEY ?? ''), updatedAt:now }`. Return the created user with the same safe field set as `GET /users`, status 201.
- [x] `src/client/hooks/useGenerateTestUserMutation.ts` -- `POST /api/admin/users/test-user`, throw on non-ok, invalidate `['admin-users']` on success.
- [x] `src/client/routes/admin-users.tsx` -- wrap the users table in a section with a header bar containing a "Generate Test User" button styled like "Generate Key"; clicking opens a confirm dialog (warns it deletes & recreates `admin@hitlobster.ai`); on confirm call the hook, toast success/error, close dialog.
- [x] `src/server/routes/api-admin.test.ts` -- add `user_secrets` cleanup already exists; add tests per AC below (set `TEST_USER_ANTHROPIC_API_KEY` before importing, or via `process.env` in-test).

**Acceptance Criteria:**
- Given no existing test user and `TEST_USER_ANTHROPIC_API_KEY` set, when `POST /users/test-user`, then response is 201 with an `email:'admin@hitlobster.ai'`, `role:'test'`, `isActive:true` user, exactly one `anthropic_api_key` row exists for it, and no `invite_keys` row is marked used.
- Given the seed env var, when created, then the stored `anthropic_api_key` ciphertext decrypts to that env value.
- Given the test user already exists (with a session, a job, a secret), when `POST /users/test-user` is called again, then the prior rows are gone, a brand-new user id/secret exist, and the call returns 201 (not a conflict error).
- Given the admin gate is mounted and the caller is a non-admin (`standard` or `test`) user, when `POST /users/test-user`, then response is 403 and no `admin@hitlobster.ai` user is created.

## Design Notes

Route placement: `POST /users/test-user` cannot collide with `PATCH`/`DELETE /users/:id` (different methods, no `POST /users/:id`), but define it alongside the other `/users` routes for clarity.

Delete cascade to mirror verbatim (from `DELETE /users/:id`): sessions, userSecrets, messages, searchConfigs, coverLetters, then jobs' statusEvents (via collected jobIds) and jobs, then null `inviteKeys.usedByUserId`, then the users row — all keyed on the resolved existing id.

Admin-gate test: `adminMiddleware` lives at the mount (`index.ts:99`), not inside `adminRoute`, so `makeAdminApp` bypasses it. For the 403 AC, build a wrapper that mounts `adminMiddleware` before `adminRoute` with a non-admin user seeded in the DB and `sessionUserId` set to it.

## Verification

**Commands:**
- `bun test src/server/routes/api-admin.test.ts` -- expected: all tests pass incl. new `test-user` block.
- `bunx tsc --noEmit` -- expected: no type errors.

Document new env vars in `.env.example`: `TEST_USER_PASSWORD` (optional, defaults to `test-user-1234`) and `TEST_USER_ANTHROPIC_API_KEY` (Claude key seeded into the test account).

## Suggested Review Order

**Endpoint (design core)**

- Entry point: delete-and-recreate in one transaction; hash + encrypt computed before the tx.
  [`api-admin.ts:134`](../../job-hunt-dashboard/src/server/routes/api-admin.ts#L134)

- New `'test'` account-type value the endpoint writes.
  [`schema.ts:129`](../../job-hunt-dashboard/src/db/schema.ts#L129)

**Client wiring**

- Mutation hook: POSTs the endpoint, invalidates `['admin-users']`.
  [`useGenerateTestUserMutation.ts:1`](../../job-hunt-dashboard/src/client/hooks/useGenerateTestUserMutation.ts#L1)

- Confirm handler: awaits mutation, toasts, closes dialog.
  [`admin-users.tsx:122`](../../job-hunt-dashboard/src/client/routes/admin-users.tsx#L122)

- Button in the new Users section header.
  [`admin-users.tsx:185`](../../job-hunt-dashboard/src/client/routes/admin-users.tsx#L185)

- Confirm dialog warning about delete-and-recreate.
  [`admin-users.tsx:503`](../../job-hunt-dashboard/src/client/routes/admin-users.tsx#L503)

**Tests & config**

- Route tests: create, decrypt-seed, recreate, admin-gate 403.
  [`api-admin.test.ts:705`](../../job-hunt-dashboard/src/server/routes/api-admin.test.ts#L705)

- New env vars documented.
  [`.env.example:37`](../../job-hunt-dashboard/.env.example#L37)
