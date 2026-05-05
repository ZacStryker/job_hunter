---
title: 'Admin Delete User'
type: 'feature'
created: '2026-05-05'
status: 'done'
baseline_commit: '9941643ae9118e473691cd4579771efea54f5460'
context: ['_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The admin user list has no delete action, forcing testers to use a new email address every time they want to re-test the registration flow from scratch.

**Approach:** Add `DELETE /api/admin/users/:id` with a transaction that purges all user-owned data, then add a confirmation-gated Delete button to the admin user table row actions.

## Boundaries & Constraints

**Always:**
- Delete runs in a single db.transaction: sessions → userSecrets → messages → searchConfigs → coverLetters → statusEvents (via jobs) → jobs → null inviteKeys.usedByUserId → delete user
- Guard: cannot delete self (return 403)
- Guard: cannot delete the last admin (return 409)
- Invalidate all sessions for deleted user before removing the user record
- Response on success: 204 No Content (no body)
- UI requires an explicit confirmation step before the delete fires

**Ask First:**
- (none — scope is narrow and unambiguous)

**Never:**
- Do not add CASCADE ON DELETE to the schema/migrations — manual ordering in the transaction is sufficient and avoids migration churn
- Do not reuse or modify the PATCH handler — DELETE is a separate endpoint
- Do not delete `inviteKeys` rows — only null out `usedByUserId` to preserve the audit trail
- Do not add a delete action to UserEditDrawer — row actions menu only

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Admin deletes an inactive standard user | 204; all related rows purged; UI row disappears | — |
| Self-delete attempt | Admin sends DELETE for their own userId | 403 `{ error: 'Cannot delete your own account' }` | — |
| Last admin delete | Only one admin user; admin tries to delete them | 409 `{ error: 'Cannot delete the last admin' }` | — |
| User not found | DELETE for non-existent userId | 404 `{ error: 'User not found' }` | — |
| Non-admin caller | Standard user calls DELETE endpoint | 403 from existing admin middleware | — |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/server/routes/api-admin.ts` — add DELETE /api/admin/users/:id handler; existing self/last-admin guards are at lines 52–62 for reference
- `job-hunt-dashboard/src/db/schema.ts` — table references: jobs(36), coverLetters(46), statusEvents(55), messages(102), searchConfigs(113), inviteKeys(146), userSecrets(151), sessions(161)
- `job-hunt-dashboard/src/client/routes/admin-users.tsx` — row actions menu at lines 157–184; add Delete button here
- `job-hunt-dashboard/src/client/hooks/useAdminUsers*.ts` — add useDeleteAdminUserMutation hook (pattern-match existing mutation hooks)
- `job-hunt-dashboard/src/server/routes/api-admin.test.ts` — add DELETE endpoint tests

## Tasks & Acceptance

**Execution:**
- [x] `job-hunt-dashboard/src/server/routes/api-admin.ts` -- Add `DELETE /api/admin/users/:id` handler: validate id, guard self-delete (403) and last-admin (409), run transaction deleting in order: sessions → userSecrets → messages → searchConfigs → coverLetters → statusEvents (subquery on jobs.userId) → jobs → null inviteKeys.usedByUserId → users; return 204
- [x] `job-hunt-dashboard/src/client/hooks/useDeleteAdminUserMutation.ts` -- New mutation hook: calls `DELETE /api/admin/users/:id`, on success invalidates `['admin', 'users']` query key
- [x] `job-hunt-dashboard/src/client/routes/admin-users.tsx` -- Add Delete row action: confirmation AlertDialog before firing mutation; remove row optimistically on success; disable action while mutation isPending
- [x] `job-hunt-dashboard/src/server/routes/api-admin.test.ts` -- Add tests for the DELETE endpoint covering all I/O matrix rows (happy path, self-delete, last-admin, not-found, non-admin)

**Acceptance Criteria:**
- Given an admin is logged in, when they click Delete on a non-self user and confirm, then the user row disappears from the table and a 204 is returned from the API
- Given the target user is the caller's own account, when DELETE is called, then the API returns 403
- Given the target user is the only admin, when DELETE is called, then the API returns 409
- Given a non-existent user id, when DELETE is called, then the API returns 404
- Given a user with jobs, cover letters, messages, sessions, and search configs, when DELETE succeeds, then all related rows across all tables are removed from the database

## Spec Change Log

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun test src/server/routes/api-admin.test.ts` -- expected: all DELETE tests pass, 0 failures
- `cd job-hunt-dashboard && bun run build` -- expected: build succeeds, no TypeScript errors

**Manual checks (if no CLI):**
- Log in as admin, navigate to /admin/users, delete a test user — confirm row removed, no console errors, no orphan rows in any related table

## Suggested Review Order

**API — cascade delete handler**

- Entry point: DELETE handler signature, self-delete guard, last-admin guard
  [`api-admin.ts:95`](../../job-hunt-dashboard/src/server/routes/api-admin.ts#L95)

- Transaction body: deletion order across 8 tables + inviteKeys null
  [`api-admin.ts:111`](../../job-hunt-dashboard/src/server/routes/api-admin.ts#L111)

**UI — confirmation flow**

- Delete button in row actions; `disabled` while mutation in-flight
  [`admin-users.tsx:199`](../../job-hunt-dashboard/src/client/routes/admin-users.tsx#L199)

- Confirmation dialog with destructive button pattern
  [`admin-users.tsx:364`](../../job-hunt-dashboard/src/client/routes/admin-users.tsx#L364)

- `handleDeleteUser` handler: fire mutation, close dialog, toast
  [`admin-users.tsx:120`](../../job-hunt-dashboard/src/client/routes/admin-users.tsx#L120)

**Client mutation hook**

- `useDeleteAdminUserMutation`: DELETE call, error extraction, cache invalidation
  [`useDeleteAdminUserMutation.ts:1`](../../job-hunt-dashboard/src/client/hooks/useDeleteAdminUserMutation.ts#L1)

**Tests**

- Five DELETE test cases: happy path with full cascade assertion, self-delete, last-admin, not-found, inviteKey preservation
  [`api-admin.test.ts:574`](../../job-hunt-dashboard/src/server/routes/api-admin.test.ts#L574)
