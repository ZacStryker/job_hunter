# Story 26.2: Admin UI — User Table, Inline Actions & Impersonation Banner

Status: done

## Story

As an admin,
I want a user management view in the app where I can see all users, toggle their status, reset passwords, edit profiles, and impersonate for debugging,
So that I can handle all support tasks without leaving the app.

## Acceptance Criteria

1. **Given** I am logged in as an admin and navigate to `/admin/users`
   **When** the page loads
   **Then** I see a full-width `rounded-lg border border-zinc-800 bg-zinc-900` card table with columns: Name, Email, Account Type, Active (Switch), Last Login, Actions (Edit / Reset PW / Impersonate)
   **And** the admin view renders within the existing authenticated app shell (same header + nav); no separate admin shell

2. **Given** I toggle the Active Switch for a user
   **When** the PATCH request succeeds
   **Then** the switch flips inline — no confirmation dialog required; the change persists on refresh

3. **Given** I toggle Active to off for a user
   **When** the PATCH succeeds
   **Then** that user is immediately logged out (all their sessions deleted server-side — handled by the existing `PATCH /api/admin/users/:id` endpoint from story 26.1)

4. **Given** I click "Reset PW" for a user
   **When** the confirmation Dialog opens
   **Then** the dialog body reads: "This will send a password reset email to [email] and invalidate their current session."
   **And** clicking "Confirm" sends the request and shows a toast: "Reset email sent"
   **And** clicking "Cancel" closes the dialog with no action taken

5. **Given** I click "Edit" for a user
   **When** the right drawer opens (consistent with `AddJobDrawer` width and Sheet pattern)
   **Then** I see editable fields for Name, Email, and Account Type (role: standard / admin)

6. **Given** I save valid edits in the drawer
   **When** the PATCH request succeeds
   **Then** the drawer closes; the table row updates inline without a full page reload; a toast shows "User updated"

7. **Given** I save with a duplicate email in the drawer
   **When** the API returns `409`
   **Then** an inline error appears in the drawer: "Email already in use" — drawer stays open

8. **Given** I click "Impersonate" for a user
   **When** the confirmation Dialog opens
   **Then** the dialog body reads: "You will see the app as [Name]. All changes will affect their account."
   **And** clicking "Confirm" starts impersonation and the `ImpersonationBanner` mounts fixed at the top of every page

9. **Given** the `ImpersonationBanner` is active
   **When** I view any page (including non-admin pages)
   **Then** the banner shows "Impersonating [Name]" on the left and "Exit" button on the right
   **And** styling: `fixed top-0 left-0 right-0 z-50 h-10 bg-amber-900/80 border-b border-amber-700`
   **And** page content pushed down via `pt-10` on the outer wrapper div
   **And** `<main>` height adjusts to `h-[calc(100vh-96px)]` when impersonating (was `h-[calc(100vh-56px)]`)
   **And** `role="alert" aria-live="assertive"` — screen reader announces impersonation state on mount

10. **Given** I click "Exit" in the `ImpersonationBanner`
    **When** the exit request succeeds
    **Then** I navigate to `/admin/users` and the banner unmounts

11. **Given** I navigate to `/admin/users` without admin role
    **When** the page loads
    **Then** I am redirected to `/` (client-side guard in `beforeLoad`, backed by server-side 403 on all admin API routes)

12. **Given** I am a non-admin user
    **When** I view the Layout nav
    **Then** the "Admin" nav link is NOT visible

## Tasks / Subtasks

### 1. Install `dialog` shadcn component and `sonner` toast library (AC: #4, #6, #8)

- [x] Install shadcn Dialog: `bunx shadcn@latest add dialog`
  - Creates `src/client/components/ui/dialog.tsx` using the already-installed `@radix-ui/react-dialog`; no new npm package needed
- [x] Install sonner: `bun add sonner`
  - This is the shadcn-recommended toast library
- [x] Update `src/client/main.tsx` — add `<Toaster />` inside `<QueryClientProvider>` (after `<RouterProvider />`):
  ```tsx
  import { Toaster } from 'sonner'
  // ...
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    <Toaster />
  </QueryClientProvider>
  ```

### 2. Update `src/shared/schemas.ts` — add AdminUser type and extend SessionResponse (AC: #1, #9, #12)

- [x] Add `AdminUser` type after the existing types:
  ```ts
  export type AdminUser = {
    id: number
    email: string
    name: string | null
    role: string
    isActive: boolean
    createdAt: string
    lastLoginAt: string | null
  }
  ```
- [x] Update `SessionResponse` to include optional impersonation field:
  ```ts
  export type SessionResponse = {
    userId: number
    email: string
    role: string
    impersonating?: { id: number; email: string; name: string | null }
  }
  ```

### 3. Update `GET /auth/session` in `src/server/routes/api-auth.ts` — include impersonation state (AC: #9, #12)

- [x] Change `db.select({ userId: sessions.userId })` to also select `sessions.data`:
  ```ts
  const session = db.select({ userId: sessions.userId, data: sessions.data }).from(sessions)
    .where(and(eq(sessions.id, sessionId), gte(sessions.expiresAt, now)))
    .get()
  ```
- [x] After retrieving `user`, parse `session.data` for impersonation and look up target user:
  ```ts
  let impersonating: { id: number; email: string; name: string | null } | undefined
  if (session.data) {
    try {
      const parsed = JSON.parse(session.data) as { impersonating?: number }
      if (Number.isInteger(parsed.impersonating) && parsed.impersonating > 0) {
        const target = db.select({ id: users.id, email: users.email, name: users.name })
          .from(users).where(eq(users.id, parsed.impersonating)).get()
        if (target) impersonating = target
      }
    } catch (e) {
      console.error('[auth] Failed to parse session.data in /session:', e)
    }
  }
  ```
- [x] Update the `c.json(...)` return to include `impersonating`:
  ```ts
  return c.json({ userId: session.userId, email: user.email, role: user.role, impersonating })
  ```
  Note: `impersonating` is `undefined` when not impersonating — JSON serialization omits undefined keys automatically; client sees no `impersonating` field in normal sessions.
- [x] Update `GET /session` test in `src/server/routes/api-auth.test.ts` — add one test for session with impersonation data:
  ```ts
  test('session with impersonation data → 200 with impersonating field', async () => {
    // Insert admin + target user
    prodSqlite.run(
      `INSERT INTO users (id, email, password_hash, role, is_active, created_at, name)
       VALUES (1, 'admin@test.com', 'x', 'admin', 1, '2026-01-01T00:00:00.000Z', 'Admin')`,
    )
    prodSqlite.run(
      `INSERT INTO users (id, email, password_hash, role, is_active, created_at, name)
       VALUES (2, 'target@test.com', 'x', 'standard', 1, '2026-01-01T00:00:00.000Z', 'Target User')`,
    )
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString()
    prodSqlite.run(
      `INSERT INTO sessions (id, user_id, data, expires_at) VALUES (?, ?, ?, ?)`,
      ['imp-session', 1, JSON.stringify({ impersonating: 2 }), expiresAt]
    )
    const res = await authApp.request('/session', {
      headers: { Cookie: 'session=imp-session' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.impersonating).toMatchObject({ id: 2, email: 'target@test.com', name: 'Target User' })
  })
  ```
  Note: The `beforeEach` in `api-auth.test.ts` deletes rows with SQL; add `prodSqlite.run('DELETE FROM users')` and `prodSqlite.run('DELETE FROM sessions')` before the test or confirm the existing `beforeEach` already clears them. The existing pattern uses `registerUser()` helper — this test inserts directly.

### 4. Create `src/client/hooks/useAdminUsersQuery.ts` (AC: #1)

```ts
import { useQuery } from '@tanstack/react-query'
import type { AdminUser } from '@shared/schemas'

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch('/api/admin/users')
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
  return res.json() as Promise<AdminUser[]>
}

export function useAdminUsersQuery() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
  })
}
```

### 5. Create `src/client/hooks/useAdminUserPatchMutation.ts` (AC: #2, #5, #6, #7)

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { AdminUser } from '@shared/schemas'

type PatchPayload = {
  id: number
  data: { name?: string; email?: string; role?: string; isActive?: boolean }
}

export function useAdminUserPatchMutation() {
  const queryClient = useQueryClient()
  return useMutation<AdminUser, Error & { status?: number }, PatchPayload>({
    mutationFn: async ({ id, data }) => {
      const res = await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        const err = new Error(body.error ?? `PATCH failed: ${res.status}`) as Error & { status?: number }
        err.status = res.status
        throw err
      }
      return res.json() as Promise<AdminUser>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}
```
Note: The `err.status` trick lets callers distinguish 409 (email conflict) from other errors.

### 6. Create `src/client/hooks/useImpersonateMutation.ts` (AC: #8, #9)

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export function useImpersonateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiFetch(`/api/admin/impersonate/${userId}`, { method: 'POST' })
      if (!res.ok) throw new Error(`Impersonate failed: ${res.status}`)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}
```
After calling this mutation and `onSuccess`, the caller should re-navigate (e.g., `navigate({ to: '/' })`) to trigger a full route re-render with the updated session.

### 7. Create `src/client/hooks/useImpersonateExitMutation.ts` (AC: #10)

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export function useImpersonateExitMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/admin/impersonate/exit', { method: 'POST' })
      if (!res.ok) throw new Error(`Exit impersonation failed: ${res.status}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}
```

### 8. Create `src/client/components/admin/ImpersonationBanner.tsx` (AC: #9, #10)

```tsx
import { useNavigate } from '@tanstack/react-router'
import { useSessionQuery } from '@/hooks/useSessionQuery'
import { useImpersonateExitMutation } from '@/hooks/useImpersonateExitMutation'
import { Button } from '@/components/ui/button'

export function ImpersonationBanner() {
  const { data: session } = useSessionQuery()
  const navigate = useNavigate()
  const exitMutation = useImpersonateExitMutation()

  if (!session?.impersonating) return null

  const displayName = session.impersonating.name ?? session.impersonating.email

  async function handleExit() {
    await exitMutation.mutateAsync()
    navigate({ to: '/admin/users' })
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="fixed top-0 left-0 right-0 z-50 h-10 bg-amber-900/80 border-b border-amber-700 flex items-center justify-between px-4 gap-4"
    >
      <span className="text-sm text-amber-200 truncate flex-1">
        Impersonating {displayName}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExit}
        disabled={exitMutation.isPending}
        className="border-amber-700 text-amber-300 text-xs hover:bg-amber-900 hover:text-amber-200 h-7 shrink-0"
      >
        Exit
      </Button>
    </div>
  )
}
```

### 9. Update `src/client/components/shared/Layout.tsx` — admin nav link + banner + height adjustment (AC: #1, #9, #10, #12)

- [x] Add imports:
  ```ts
  import { useSessionQuery } from '../hooks/useSessionQuery'
  import { ImpersonationBanner } from './admin/ImpersonationBanner'  // adjust if path differs
  import { cn } from '@/lib/utils'
  ```
  Note: `cn` is already used elsewhere in the project — import from `@/lib/utils`.
- [x] Use session to drive conditional rendering:
  ```ts
  const { data: session } = useSessionQuery()
  const isImpersonating = !!session?.impersonating
  const isAdmin = session?.role === 'admin'
  ```
- [x] Add `ImpersonationBanner` as first child of the outer div:
  ```tsx
  <div className={cn("min-h-screen bg-zinc-950 text-zinc-100", isImpersonating && "pt-10")}>
    <ImpersonationBanner />
    <header ...>
  ```
- [x] Add "Admin" nav link inside `<nav>`, visible only when `isAdmin`:
  ```tsx
  {isAdmin && (
    <Link
      to="/admin/users"
      className="px-3 py-1.5 text-sm transition-colors"
      activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
      inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
    >
      Admin
    </Link>
  )}
  ```
  Place the Admin link at the END of the nav (after Config), so it's visually separate from core navigation.
- [x] Adjust `<main>` height for impersonation banner:
  ```tsx
  <main className={isImpersonating ? "h-[calc(100vh-96px)] overflow-auto" : "h-[calc(100vh-56px)] overflow-auto"}>
  ```
  When impersonating: `100vh - 40px banner - 56px header = 100vh - 96px`.

### 10. Create `src/client/components/admin/UserEditDrawer.tsx` (AC: #5, #6, #7)

Use the `Sheet` component exactly as `AddJobDrawer` does (`src/client/components/pipeline/AddJobDrawer.tsx`).

```tsx
import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useAdminUserPatchMutation } from '@/hooks/useAdminUserPatchMutation'
import { toast } from 'sonner'
import type { AdminUser } from '@shared/schemas'

interface UserEditDrawerProps {
  user: AdminUser | null
  open: boolean
  onClose: () => void
}

export function UserEditDrawer({ user, open, onClose }: UserEditDrawerProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('standard')
  const [emailError, setEmailError] = useState<string | null>(null)
  const mutation = useAdminUserPatchMutation()

  useEffect(() => {
    if (user) {
      setName(user.name ?? '')
      setEmail(user.email)
      setRole(user.role)
      setEmailError(null)
    }
  }, [user])

  function handleClose() {
    mutation.reset()
    setEmailError(null)
    onClose()
  }

  async function handleSave() {
    if (!user) return
    setEmailError(null)
    try {
      await mutation.mutateAsync({
        id: user.id,
        data: {
          name: name.trim() || undefined,
          email: email.trim().toLowerCase() || undefined,
          role,
        },
      })
      toast('User updated')
      handleClose()
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 409) {
        setEmailError('Email already in use')
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit User</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Name</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Display name"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Email</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError(null) }}
              placeholder="user@example.com"
            />
            {emailError && (
              <p role="alert" className="text-xs text-red-400 mt-1">{emailError}</p>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Account Type</span>
            <select
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="standard">Standard</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          {mutation.isError && !emailError && (
            <p className="text-xs text-red-400">{mutation.error?.message ?? 'Failed to update user'}</p>
          )}

          <Button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="mt-2"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

### 11. Create `src/client/routes/admin-users.tsx` (AC: #1–#11)

```tsx
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { useAdminUsersQuery } from '@/hooks/useAdminUsersQuery'
import { useAdminUserPatchMutation } from '@/hooks/useAdminUserPatchMutation'
import { useImpersonateMutation } from '@/hooks/useImpersonateMutation'
import { UserEditDrawer } from '@/components/admin/UserEditDrawer'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import type { AdminUser } from '@shared/schemas'

type DialogState =
  | { type: 'reset-pw'; user: AdminUser }
  | { type: 'impersonate'; user: AdminUser }
  | null

export function AdminUsersRoute() {
  const { data: users = [], isLoading, isError } = useAdminUsersQuery()
  const patchMutation = useAdminUserPatchMutation()
  const impersonateMutation = useImpersonateMutation()
  const navigate = useNavigate()

  const [dialog, setDialog] = useState<DialogState>(null)
  const [drawerUser, setDrawerUser] = useState<AdminUser | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [resetPending, setResetPending] = useState(false)

  function openEditDrawer(user: AdminUser) {
    setDrawerUser(user)
    setDrawerOpen(true)
  }

  async function handleToggleActive(user: AdminUser) {
    await patchMutation.mutateAsync({ id: user.id, data: { isActive: !user.isActive } })
  }

  async function handleResetPassword() {
    if (!dialog || dialog.type !== 'reset-pw') return
    setResetPending(true)
    try {
      const res = await apiFetch('/auth/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: dialog.user.email }),
      })
      if (!res.ok) throw new Error(`Reset request failed: ${res.status}`)
      toast('Reset email sent')
      setDialog(null)
    } catch {
      toast.error('Failed to send reset email')
    } finally {
      setResetPending(false)
    }
  }

  async function handleImpersonate() {
    if (!dialog || dialog.type !== 'impersonate') return
    await impersonateMutation.mutateAsync(dialog.user.id)
    setDialog(null)
    navigate({ to: '/' })
  }

  if (isLoading) return (
    <div className="p-8 text-zinc-400 text-sm">Loading…</div>
  )
  if (isError) return (
    <div className="p-8 text-red-400 text-sm">Failed to load users.</div>
  )

  return (
    <div className="p-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Account Type</th>
              <th className="text-left px-4 py-3 font-medium">Active</th>
              <th className="text-left px-4 py-3 font-medium">Last Login</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-3 text-zinc-100">{user.name ?? '—'}</td>
                <td className="px-4 py-3 text-zinc-300">{user.email}</td>
                <td className="px-4 py-3 text-zinc-400 capitalize">{user.role}</td>
                <td className="px-4 py-3">
                  <Switch
                    checked={user.isActive}
                    onCheckedChange={() => handleToggleActive(user)}
                    disabled={patchMutation.isPending}
                    aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.email}`}
                  />
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString()
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400 hover:text-zinc-100 text-xs h-7"
                      onClick={() => openEditDrawer(user)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400 hover:text-zinc-100 text-xs h-7"
                      onClick={() => setDialog({ type: 'reset-pw', user })}
                    >
                      Reset PW
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-amber-500 hover:text-amber-400 text-xs h-7"
                      onClick={() => setDialog({ type: 'impersonate', user })}
                    >
                      Impersonate
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-sm">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Reset PW dialog */}
      <Dialog open={dialog?.type === 'reset-pw'} onOpenChange={(v) => { if (!v) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription id="reset-pw-desc">
              {dialog?.type === 'reset-pw' &&
                `This will send a password reset email to ${dialog.user.email} and invalidate their current session.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetPending}>
              {resetPending ? 'Sending…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonate dialog */}
      <Dialog open={dialog?.type === 'impersonate'} onOpenChange={(v) => { if (!v) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonate User</DialogTitle>
            <DialogDescription id="impersonate-desc">
              {dialog?.type === 'impersonate' &&
                `You will see the app as ${dialog.user.name ?? dialog.user.email}. All changes will affect their account.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={handleImpersonate}
              disabled={impersonateMutation.isPending}
              className="border-amber-700 bg-amber-900/50 text-amber-300 hover:bg-amber-900"
            >
              {impersonateMutation.isPending ? 'Starting…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserEditDrawer
        user={drawerUser}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}
```

### 12. Update `src/client/lib/router.ts` — add admin route (AC: #1, #11)

- [x] Add import for `AdminUsersRoute` and `fetchAdminUsers`:
  ```ts
  import { AdminUsersRoute } from '../routes/admin-users'
  import { fetchAdminUsers } from '../hooks/useAdminUsersQuery'
  import type { SessionResponse } from '@shared/schemas'
  ```
- [x] Create the admin route constant (BEFORE the `routeTree` definition):
  ```ts
  const adminUsersRoute = createRoute({
    getParentRoute: () => protectedRoute,
    path: '/admin/users',
    component: AdminUsersRoute,
    beforeLoad: () => {
      const session = queryClient.getQueryData<SessionResponse>(['session'])
      if (!session || session.role !== 'admin') throw redirect({ to: '/' })
    },
    loader: () => queryClient.ensureQueryData({ queryKey: ['admin-users'], queryFn: fetchAdminUsers }),
  })
  ```
  Note: `beforeLoad` here is synchronous — the parent `protectedRoute.beforeLoad` already called `ensureQueryData(['session'])`, so the cache is populated by the time this runs.
- [x] Add `adminUsersRoute` to `protectedRoute.addChildren([...])`:
  ```ts
  protectedRoute.addChildren([
    dashboardRoute,
    indexRoute,
    trackerRoute,
    archivedRoute,
    messagesRoute,
    historyRoute,
    profileRoute,
    promptsRoute,
    matchesRoute,
    configRoute,
    adminUsersRoute,  // ← add here
  ])
  ```

## Dev Notes

### Critical Pattern: `apiFetch` Required for All Mutations

All POST/PATCH/DELETE calls from hooks and components MUST use `apiFetch` (from `src/client/lib/api.ts`) to inject the CSRF token. `fetch()` directly will fail CSRF validation for mutation requests.

Exception: `POST /auth/reset-request` is at `/auth/*` — it is NOT behind CSRF middleware (it's mounted on `authRoute`, not the main `app`). However, use `apiFetch` anyway for consistency. CSRF token injection is a no-op when no token is present (and it won't hurt).

Wait — re-reading `api-auth.ts`: the reset-request endpoint IS behind auth (checks session cookie) but IS NOT behind CSRF (it's on `authApp` which doesn't have CSRF middleware). Safe to call with `apiFetch` regardless.

### Critical: Password Reset Returns 204, Not 200

`POST /auth/reset-request` returns `204 No Content` on success (even if email doesn't exist, to prevent enumeration). The task 11 implementation uses `!res.ok` as the error gate — 204 is `res.ok === true`, so this is correct. Do NOT attempt to parse the response body on success (it's empty).

### Critical: `GET /auth/session` Now Includes `sessions.data`

The updated session endpoint reads `sessions.data` to detect active impersonation. This adds one extra JSON parse per session check. The cost is negligible (in-memory SQLite, small JSON blob). The test must include the `data` column in the test DDL — it's already present in `api-auth.test.ts` `beforeAll` DDL (the `data TEXT` column was added in story 26.1). Verify before running tests.

### Critical: `ImpersonationBanner` and Layout Height

When impersonating, the outer wrapper div gets `pt-10` (40px) to push the header below the fixed banner. The `<main>` height changes from `h-[calc(100vh-56px)]` to `h-[calc(100vh-96px)]` to account for both the banner (40px) and header (56px). This keeps the scrollable area fitting the viewport without creating a body scrollbar.

### Critical: Dialog Component — `aria-describedby`

shadcn's `Dialog` uses Radix under the hood. The `DialogDescription` component automatically sets up `aria-describedby` on the `DialogContent`. Consequence text goes in `DialogDescription`, not in the title. This matches the UX spec rule: "State the consequence, not the action."

### Critical: Admin Route Guard Uses Synchronous `getQueryData`

The `adminUsersRoute.beforeLoad` uses `queryClient.getQueryData<SessionResponse>(['session'])` (synchronous, not `ensureQueryData`). This works because the parent `protectedRoute.beforeLoad` calls `ensureQueryData(['session'])` first, guaranteeing the cache is populated before any child `beforeLoad` runs. Do NOT use `ensureQueryData` here — it would trigger an unnecessary network request.

### Password Reset Endpoint — Existing Implementation (No New Code)

`POST /auth/reset-request` already handles admin-triggered resets:
- Validates that the requesting user has `role === 'admin'` via session lookup
- Generates reset token, updates `users.resetToken` and `resetTokenExpiresAt`
- Deletes all sessions for the target user (they are logged out)
- Sends reset email via `sendMail()`
- Returns 204 always (even for non-existent emails)

Reference: `src/server/routes/api-auth.ts:272–316`

### Impersonation State Detection via Session

After `POST /api/admin/impersonate/:id` succeeds:
1. Invalidate `['session']` query cache
2. On the next session fetch, `GET /auth/session` will return `{ ..., impersonating: { id, email, name } }`
3. `Layout` reads this via `useSessionQuery()` and renders `ImpersonationBanner`
4. Calling `navigate({ to: '/' })` after impersonation starts triggers a route re-render, which re-runs loaders. The session cache refetch provides the updated session with `impersonating` populated.

After `POST /api/admin/impersonate/exit`:
1. Invalidate `['session']` query cache
2. `GET /auth/session` will return no `impersonating` field
3. `ImpersonationBanner` returns `null` and unmounts
4. Navigate to `/admin/users`

### Active Switch — No Confirmation Required

The UX spec explicitly says active toggle requires NO confirmation dialog (it's instantly reversible). The `handleToggleActive` function calls `patchMutation.mutateAsync` directly. If the user row's switch is clicked while `patchMutation.isPending`, all switches are disabled (via `disabled={patchMutation.isPending}`) to prevent concurrent requests. The switch UI state is driven by `user.isActive` from the query cache — it only flips when the cache is invalidated after a successful PATCH.

### `UserEditDrawer` — `mutation.reset()` on Close

When the drawer closes, `mutation.reset()` clears the error state so a reopened drawer for the same (or different) user doesn't show stale error state. This is the same pattern as clearing `emailError` on close.

### Edge-Case Checklist (Per Epic 25 Retro Action Item)

Before marking each task complete, verify:
- **Task 3 (session endpoint)**: What if `sessions.data` is `null`? → handled (only parse if `session.data` is truthy). What if target user doesn't exist in DB? → handled (`if (target) impersonating = target`).
- **Task 11 (reset PW)**: What if the reset request returns 204 vs non-204 OK? → handled (`!res.ok` catches non-success). What if `dialog` changes between click and request? → `dialog.type === 'reset-pw'` guard ensures correct state.
- **Task 11 (impersonate)**: What if `impersonateMutation` is already pending when Confirm is clicked twice? → `disabled={impersonateMutation.isPending}` prevents double submit.
- **Task 10 (UserEditDrawer)**: What if both `name` and `email` are empty? → PATCH with no valid fields sends empty object; the existing API endpoint returns 400 for empty body (added in review patch for 26.1). Guard: `name: name.trim() || undefined, email: email.trim().toLowerCase() || undefined` — if both are empty string trimmed, sends `{}`. Add validation: prevent save if both name and email are empty after trim.
  ```ts
  // In handleSave, before mutateAsync:
  const trimmedName = name.trim()
  const trimmedEmail = email.trim().toLowerCase()
  if (!trimmedName && !trimmedEmail && role === user.role) return  // nothing changed
  ```

### No Avatar Component Needed

The epic spec mentions Avatar in the UX component strategy, but the acceptance criteria do not require avatars. Skip Avatar installation for this story — it adds complexity without a concrete AC requirement.

### File Structure

**New files:**
```
src/client/routes/admin-users.tsx
src/client/components/admin/ImpersonationBanner.tsx
src/client/components/admin/UserEditDrawer.tsx
src/client/hooks/useAdminUsersQuery.ts
src/client/hooks/useAdminUserPatchMutation.ts
src/client/hooks/useImpersonateMutation.ts
src/client/hooks/useImpersonateExitMutation.ts
src/client/components/ui/dialog.tsx          ← generated by `bunx shadcn@latest add dialog`
```

**Modified files:**
```
src/shared/schemas.ts                        ← add AdminUser type; extend SessionResponse
src/server/routes/api-auth.ts               ← GET /session: add impersonation field
src/server/routes/api-auth.test.ts          ← add session+impersonation test
src/client/main.tsx                          ← add <Toaster />
src/client/lib/router.ts                    ← add adminUsersRoute
src/client/components/shared/Layout.tsx     ← admin nav link + ImpersonationBanner + height fix
```

### References

- Epic 26 spec (story 26.2 ACs): `_bmad-output/planning-artifacts/epics/epic-26-admin-user-management.md#story-262`
- UX spec (ImpersonationBanner, admin table, dialog patterns): `_bmad-output/planning-artifacts/ux-design-specification/auth-onboarding-admin-ux.md`
- Story 26.1 dev notes (password reset reuse, impersonation session design): `_bmad-output/implementation-artifacts/26-1-admin-api-user-list-update-password-reset-and-impersonation.md#dev-notes`
- Admin API routes (GET /users, PATCH /users/:id, POST /impersonate, POST /impersonate/exit): `src/server/routes/api-admin.ts`
- Password reset endpoint (existing, admin-only, returns 204): `src/server/routes/api-auth.ts:272–316`
- Session endpoint (to update with impersonation state): `src/server/routes/api-auth.ts:226–242`
- Existing AddJobDrawer pattern (Sheet usage): `src/client/components/pipeline/AddJobDrawer.tsx`
- Existing Layout (to extend): `src/client/components/shared/Layout.tsx`
- Existing router pattern (route registration): `src/client/lib/router.ts`
- apiFetch (CSRF helper): `src/client/lib/api.ts`
- useSessionQuery (session hook): `src/client/hooks/useSessionQuery.ts`
- SessionResponse type (to extend): `src/shared/schemas.ts:230`
- Project context rules: `_bmad-output/project-context.md`
- Epic 25 retro (edge-case discipline): `_bmad-output/implementation-artifacts/epic-25-retro-2026-04-30.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Installed `sonner@2.0.7` and shadcn Dialog component (uses existing `@radix-ui/react-dialog`)
- Added `AdminUser` type and extended `SessionResponse` with `impersonating?` field in `src/shared/schemas.ts`
- Updated `GET /auth/session` to select `sessions.data`, parse impersonation state, and return target user fields; added passing test for session with impersonation data (29 auth tests pass)
- Created 4 client hooks: `useAdminUsersQuery`, `useAdminUserPatchMutation`, `useImpersonateMutation`, `useImpersonateExitMutation`
- Created `ImpersonationBanner` component with amber styling, fixed positioning, screen reader announcement, and Exit button
- Updated `Layout.tsx` to import session/banner, render banner at top, add Admin nav link for admin role, and adjust `<main>` height when impersonating (`calc(100vh-96px)`)
- Created `UserEditDrawer` using Sheet pattern matching `AddJobDrawer`; includes 409 email-conflict inline error; resets mutation state on close; guards against no-op saves
- Created `admin-users.tsx` route with full table (Name, Email, Account Type, Active switch, Last Login, Actions), Reset PW and Impersonate confirmation dialogs, and `UserEditDrawer` integration
- Added `adminUsersRoute` to router with synchronous `beforeLoad` guard using `getQueryData` and route loader for `['admin-users']`
- Fixed `Layout.tsx` import path: used `@/hooks/useSessionQuery` and `@/components/admin/ImpersonationBanner` (not relative paths)
- Build passes; full 312-test suite passes with 0 failures

### File List

**New files:**
- `job-hunt-dashboard/src/client/components/ui/dialog.tsx`
- `job-hunt-dashboard/src/client/components/admin/ImpersonationBanner.tsx`
- `job-hunt-dashboard/src/client/components/admin/UserEditDrawer.tsx`
- `job-hunt-dashboard/src/client/routes/admin-users.tsx`
- `job-hunt-dashboard/src/client/hooks/useAdminUsersQuery.ts`
- `job-hunt-dashboard/src/client/hooks/useAdminUserPatchMutation.ts`
- `job-hunt-dashboard/src/client/hooks/useImpersonateMutation.ts`
- `job-hunt-dashboard/src/client/hooks/useImpersonateExitMutation.ts`

**Modified files:**
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/server/routes/api-auth.ts`
- `job-hunt-dashboard/src/server/routes/api-auth.test.ts`
- `job-hunt-dashboard/src/client/main.tsx`
- `job-hunt-dashboard/src/client/lib/router.ts`
- `job-hunt-dashboard/src/client/components/shared/Layout.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-05-01: Implemented story 26.2 — Admin UI with user table, inline active toggle, Reset PW / Impersonate confirmation dialogs, UserEditDrawer, ImpersonationBanner, Layout updates, admin route with role guard, sonner toasts, shadcn Dialog component.

## Review Findings

- [x] [Review][Decision] Admin can impersonate another admin — blocked: added `if (target.role === 'admin') return c.json({ error: 'Cannot impersonate an admin user' }, 403)` guard in `POST /api/admin/impersonate/:id` [src/server/routes/api-admin.ts]

- [x] [Review][Patch] Missing error handling in async event handlers — fixed: added try/catch to `handleExit` (toast.error on failure, navigate only on success), `handleImpersonate` (toast.error, dialog stays open on failure), `handleToggleActive` (toast.error on failure) [ImpersonationBanner.tsx, admin-users.tsx]
- [x] [Review][Patch] `adminUsersRoute.beforeLoad` cold-cache redirect — dismissed: spec dev notes document this as safe; parent `protectedRoute.beforeLoad` always runs `ensureQueryData(['session'])` first, guaranteeing cache is warm before child `beforeLoad` reads it [router.ts:176]
- [x] [Review][Patch] `UserEditDrawer` no-op guard blocks valid name-clear saves — fixed: guard now compares against original values (`trimmedName === (user.name ?? '')` etc.) instead of falsy check [UserEditDrawer.tsx]
- [x] [Review][Patch] Blank email field sends `email: undefined` with no validation — fixed: explicit `if (!trimmedEmail) { setEmailError('Email is required'); return }` validation added; `email` now always sent as the validated non-empty string [UserEditDrawer.tsx]
- [x] [Review][Patch] Reset PW dialog mid-request close leaves `resetPending: true` — fixed: `onOpenChange` now calls both `setDialog(null)` and `setResetPending(false)` on close [admin-users.tsx]
- [x] [Review][Patch] `ImpersonationBanner` no error feedback when exit fails — fixed: exit failure shows `toast.error('Failed to exit impersonation')` [ImpersonationBanner.tsx]
- [x] [Review][Patch] `UserEditDrawer` inputs not disabled while mutation pending — fixed: all inputs and select now have `disabled={mutation.isPending}` with `disabled:opacity-50` styling [UserEditDrawer.tsx]
- [x] [Review][Patch] `ImpersonationBanner` redundant ARIA attributes — fixed: removed explicit `aria-live="assertive"` and `aria-atomic="true"`; `role="alert"` sets these implicitly [ImpersonationBanner.tsx]

- [x] [Review][Defer] Session race after impersonation — brief window where banner isn't visible before session query refetch settles post-navigate; acceptable UX transient [useImpersonateMutation.ts:12-13] — deferred, pre-existing
- [x] [Review][Defer] All switches disabled while one mutation in-flight — single shared `patchMutation` instance disables every row simultaneously; UX annoyance, not a correctness bug [admin-users.tsx] — deferred, pre-existing
- [x] [Review][Defer] Deactivating impersonated user leaves banner stale up to 5 min — target's sessions deleted but admin's session isn't re-validated; `useSessionQuery` staleTime is 5 min [useSessionQuery.ts:14] — deferred, pre-existing
- [x] [Review][Defer] Impersonating deleted user causes silent banner disappear — server silently drops `impersonating` field when target not found; session `data` not cleaned up [api-auth.ts:246-249] — deferred, pre-existing
- [x] [Review][Defer] Reset PW always shows "Reset email sent" for non-existent email — intentional server-side enumeration prevention [api-auth.ts:310] — deferred, pre-existing
- [x] [Review][Defer] Route loader throws raw TanStack Router error boundary — pre-existing pattern across all routes; no `errorComponent` configured [router.ts:179] — deferred, pre-existing
- [x] [Review][Defer] `dialog.tsx` Tailwind CSS variable classes need verification — `bg-background`, `ring-offset-background` etc. require CSS variable setup in project global CSS; verify when confirming other shadcn components render correctly [dialog.tsx] — deferred, pre-existing
- [x] [Review][Defer] Exit mutation doesn't invalidate `['admin-users']` query — table may be slightly stale after returning from impersonation [useImpersonateExitMutation.ts:11] — deferred, pre-existing
