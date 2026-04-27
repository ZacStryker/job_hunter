# Epic 26: Admin User Management

Admin can view all users, toggle active status, send password reset emails with session invalidation, edit user profiles in a drawer, and impersonate any user with a persistent amber banner and one-click exit.

**FRs covered:** FR-A6, FR-A7, FR-A8, FR-A9, FR-A10, FR-A12
**UX:** UX-AUTH10 (admin user table), UX-AUTH11 (ImpersonationBanner), UX-AUTH12 (confirmation dialogs)
**Architecture:** Admin API routes (GET /api/admin/users, PATCH /api/admin/users/:id, POST /api/admin/impersonate/:id, POST /api/admin/impersonate/exit), admin middleware (already applied in Epic 24)

## Story 26.1: Admin API — User List, Update, Password Reset & Impersonation

As an admin,
I want API endpoints to view all users, update accounts, trigger password resets, and impersonate users for debugging,
So that I can handle all support tasks without direct database access.

**Acceptance Criteria:**

**Given** a valid admin session
**When** `GET /api/admin/users` is called
**Then** response is `200 [ { id, email, name, role, isActive, createdAt, lastLoginAt } ]` for all registered users
**And** `password_hash` and any encrypted secrets are NEVER included in the response

**Given** a valid admin session
**When** `PATCH /api/admin/users/:id` is called with `{ name?, email?, role?, isActive? }`
**Then** specified fields are updated; response is `200` with the updated user object

**Given** `isActive` is set to `false` in the PATCH body
**When** the update succeeds
**Then** all existing sessions for that user are deleted immediately — they are logged out

**Given** an email already taken by another account
**When** `PATCH /api/admin/users/:id` is called with that email
**Then** response is `409 { error: "Email already in use" }`

**Given** a valid admin session
**When** `POST /api/admin/impersonate/:id` is called with a target user's id
**Then** the admin's session is updated to include `impersonating: targetUserId`
**And** all subsequent `/api/*` calls use `targetUserId` as the effective userId for data scoping
**And** response is `200 { impersonating: { id, email, name } }`

**Given** an active impersonation session
**When** `POST /api/admin/impersonate/exit` is called
**Then** `impersonating` is cleared from the session; the admin's own userId is restored
**And** response is `200`

**Given** a non-admin session
**When** any `/api/admin/*` route is accessed
**Then** response is `403 { error: "Forbidden" }` — admin middleware enforces this

## Story 26.2: Admin UI — User Table, Inline Actions & Impersonation Banner

As an admin,
I want a user management view in the app where I can see all users, toggle their status, reset passwords, edit profiles, and impersonate for debugging,
So that I can handle all support tasks without leaving the app.

**Acceptance Criteria:**

**Given** I am logged in as an admin and navigate to `/admin/users`
**When** the page loads
**Then** I see a full-width `rounded-lg border border-zinc-800 bg-zinc-900` card table with columns: Name, Email, Account Type, Active (Switch), Last Login, Actions (Edit / Reset PW / Impersonate)
**And** the admin view renders within the existing authenticated app shell (same header + nav); no separate admin shell

**Given** I toggle the Active Switch for a user
**When** the PATCH request succeeds
**Then** the switch flips inline — no confirmation dialog required; the change persists on refresh

**Given** I toggle Active to off for a user
**When** the PATCH succeeds
**Then** that user is immediately logged out (all their sessions deleted server-side)

**Given** I click "Reset PW" for a user
**When** the confirmation Dialog opens
**Then** the dialog body reads: "This will send a password reset email to [email] and invalidate their current session."
**And** clicking "Confirm" sends the request and shows a toast: "Reset email sent"
**And** clicking "Cancel" closes the dialog with no action taken

**Given** I click "Edit" for a user
**When** the right drawer opens (consistent with `JobDrawer` width and pattern)
**Then** I see editable fields for Name, Email, and Account Type

**Given** I save valid edits in the drawer
**When** the PATCH request succeeds
**Then** the drawer closes; the table row updates inline without a full page reload; a toast shows "User updated"

**Given** I save with a duplicate email in the drawer
**When** the API returns `409`
**Then** an inline error appears in the drawer: "Email already in use" — drawer stays open

**Given** I click "Impersonate" for a user
**When** the confirmation Dialog opens
**Then** the dialog body reads: "You will see the app as [Name]. All changes will affect their account."
**And** clicking "Confirm" starts impersonation and the `ImpersonationBanner` mounts fixed at the top of every page

**Given** the `ImpersonationBanner` is active
**When** I view any page (including non-admin pages)
**Then** the banner shows "Impersonating [Name]" on the left and "Exit" button on the right
**And** styling: `fixed top-0 left-0 right-0 z-50 h-10 bg-amber-900/80 border-b border-amber-700`
**And** `<main>` has `pt-10` to prevent content overlap
**And** `role="alert" aria-live="assertive"` — screen reader announces impersonation state on mount

**Given** I click "Exit" in the `ImpersonationBanner`
**When** the exit request succeeds
**Then** I navigate to `/admin/users` and the banner unmounts

**Given** I navigate to `/admin/users` without admin role
**When** the page loads
**Then** I am redirected to `/` (client-side guard, backed by server-side 403 on all admin API routes)

## Story 26.3: Admin Invite Key Management

As an admin,
I want to generate, view, and revoke invite keys from within the admin panel,
So that I can control who can register and share credentials with invited users without direct database access.

**Acceptance Criteria:**

**Given** a valid admin session
**When** `GET /api/admin/invite-keys` is called
**Then** response is `200 [ { id, key, status, usedByEmail, usedAt } ]`
**And** `status` is `'unused'` if `used_by_user_id` is null, otherwise `'used'`
**And** `usedByEmail` is the email of the user who consumed the key, or `null`
**And** `usedAt` is an ISO 8601 string or `null`

**Given** a valid admin session
**When** `POST /api/admin/invite-keys` is called with no body
**Then** a new key is generated as 12 uppercase alphanumeric characters formatted `XXXX-XXXX-XXXX` using server-side `crypto.randomBytes`
**And** the key is inserted into `invite_keys` with `used_by_user_id = null`, `used_at = null`
**And** response is `201 { id, key, status: 'unused', usedByEmail: null, usedAt: null }`

**Given** a valid admin session and an unused key
**When** `DELETE /api/admin/invite-keys/:id` is called
**Then** the key row is deleted; response is `204`

**Given** the target key has already been used (`used_by_user_id` is not null)
**When** `DELETE /api/admin/invite-keys/:id` is called
**Then** response is `409 { error: "Cannot revoke a used invite key" }`

**Given** I am logged in as admin and navigate to `/admin/users`
**When** the page loads
**Then** below the user table I see an "Invite Keys" card section (`rounded-lg border border-zinc-800 bg-zinc-900`) with a "Generate Key" button (`bg-blue-600`) in the card header

**Given** invite keys exist
**When** the Invite Keys section loads
**Then** I see a compact table with columns: Key (font-mono), Status (badge: "Unused" zinc-700 / "Used" zinc-600), Used By (email or —), Used At (ISO date or —), Actions

**Given** a key has status "Unused"
**When** I view its row
**Then** I see a clipboard icon button that copies the key value to clipboard on click
**And** after copying, the icon briefly transitions to a check state for 1.5 seconds
**And** I see a "Revoke" text button (`text-red-400 hover:text-red-300`)

**Given** I click "Revoke"
**When** the confirmation Dialog opens
**Then** the dialog body reads: "This invite key will be permanently deleted and cannot be used to register."
**And** clicking "Confirm" calls `DELETE /api/admin/invite-keys/:id`; the row disappears; a toast shows "Invite key revoked"
**And** clicking "Cancel" closes the dialog with no action taken

**Given** a key has status "Used"
**When** I view its row
**Then** no Copy or Revoke actions are shown — used keys are permanent historical records

**Given** no invite keys exist
**When** the section renders
**Then** empty state text reads: "No invite keys. Click Generate Key to invite a new user."

**Given** I click "Generate Key"
**When** the `POST /api/admin/invite-keys` request succeeds
**Then** the new key row appears at the top of the list with status "Unused", a clipboard copy button, and a "Revoke" action
**And** a toast shows "Invite key generated"

**Given** a non-admin session
**When** any `/api/admin/invite-keys` route is accessed
**Then** response is `403 { error: "Forbidden" }` — admin middleware enforces this

---
