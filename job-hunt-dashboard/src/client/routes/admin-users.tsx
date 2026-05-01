import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
    try {
      await patchMutation.mutateAsync({ id: user.id, data: { isActive: !user.isActive } })
    } catch {
      toast.error('Failed to update user')
    }
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
    try {
      await impersonateMutation.mutateAsync(dialog.user.id)
      setDialog(null)
      navigate({ to: '/' })
    } catch {
      toast.error('Failed to start impersonation')
    }
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
      <Dialog open={dialog?.type === 'reset-pw'} onOpenChange={(v) => { if (!v) { setDialog(null); setResetPending(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
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
            <DialogDescription>
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
