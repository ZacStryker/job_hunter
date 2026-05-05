import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Clipboard, Check } from 'lucide-react'
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
import { useInviteKeysQuery } from '@/hooks/useInviteKeysQuery'
import { useGenerateInviteKeyMutation } from '@/hooks/useGenerateInviteKeyMutation'
import { useRevokeInviteKeyMutation } from '@/hooks/useRevokeInviteKeyMutation'
import { useDeleteAdminUserMutation } from '@/hooks/useDeleteAdminUserMutation'
import { UserEditDrawer } from '@/components/admin/UserEditDrawer'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import type { AdminUser, InviteKey } from '@shared/schemas'

type DialogState =
  | { type: 'reset-pw'; user: AdminUser }
  | { type: 'impersonate'; user: AdminUser }
  | { type: 'delete-user'; user: AdminUser }
  | { type: 'revoke-key'; keyId: number }
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

  const { data: inviteKeys = [], isLoading: keysLoading } = useInviteKeysQuery()
  const generateMutation = useGenerateInviteKeyMutation()
  const revokeMutation = useRevokeInviteKeyMutation()
  const deleteMutation = useDeleteAdminUserMutation()
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)

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

  function handleCopyKey(id: number, key: string) {
    navigator.clipboard.writeText(key).then(() => {
      setCopiedKeyId(id)
      setTimeout(() => setCopiedKeyId(null), 1500)
    })
  }

  async function handleGenerateKey() {
    try {
      await generateMutation.mutateAsync()
      toast('Invite key generated')
    } catch {
      toast.error('Failed to generate invite key')
    }
  }

  async function handleRevokeKey() {
    if (!dialog || dialog.type !== 'revoke-key') return
    try {
      await revokeMutation.mutateAsync(dialog.keyId)
      setDialog(null)
      toast('Invite key revoked')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke invite key')
    }
  }

  async function handleDeleteUser() {
    if (!dialog || dialog.type !== 'delete-user') return
    try {
      await deleteMutation.mutateAsync(dialog.user.id)
      setDialog(null)
      toast('User deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete user')
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 text-xs h-7"
                      onClick={() => setDialog({ type: 'delete-user', user })}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
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

      {/* Invite Keys section */}
      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-100">Invite Keys</h2>
          <Button
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-7 px-3"
            size="sm"
            onClick={handleGenerateKey}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? 'Generating…' : 'Generate Key'}
          </Button>
        </div>

        {keysLoading ? (
          <div className="px-4 py-6 text-zinc-400 text-sm">Loading…</div>
        ) : inviteKeys.length === 0 ? (
          <div className="px-4 py-6 text-center text-zinc-500 text-sm">
            No invite keys. Click Generate Key to invite a new user.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
                <th className="text-left px-4 py-3 font-medium">Key</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Used By</th>
                <th className="text-left px-4 py-3 font-medium">Used At</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inviteKeys.map((ik: InviteKey) => (
                <tr key={ik.id} className="border-b border-zinc-800/50">
                  <td className="px-4 py-3 font-mono text-zinc-100 text-xs">{ik.key}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      ik.status === 'unused'
                        ? 'bg-zinc-700 text-zinc-300'
                        : 'bg-zinc-600 text-zinc-400'
                    }`}>
                      {ik.status === 'unused' ? 'Unused' : 'Used'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{ik.usedByEmail ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {ik.usedAt ? ik.usedAt.slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {ik.status === 'unused' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyKey(ik.id, ik.key)}
                          className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
                          aria-label={`Copy invite key ${ik.key}`}
                        >
                          {copiedKeyId === ik.id
                            ? <Check size={14} className="text-green-400" />
                            : <Clipboard size={14} />
                          }
                        </button>
                        <button
                          type="button"
                          onClick={() => setDialog({ type: 'revoke-key', keyId: ik.id })}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

      {/* Revoke Key dialog */}
      <Dialog open={dialog?.type === 'revoke-key'} onOpenChange={(v) => { if (!v) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Invite Key</DialogTitle>
            <DialogDescription>
              This invite key will be permanently deleted and cannot be used to register.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={handleRevokeKey}
              disabled={revokeMutation.isPending}
              className="bg-red-700 hover:bg-red-600 text-white border-0"
            >
              {revokeMutation.isPending ? 'Revoking…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User dialog */}
      <Dialog open={dialog?.type === 'delete-user'} onOpenChange={(v) => { if (!v) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              {dialog?.type === 'delete-user' &&
                `Permanently delete ${dialog.user.name ?? dialog.user.email} and all their data. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={handleDeleteUser}
              disabled={deleteMutation.isPending}
              className="bg-red-700 hover:bg-red-600 text-white border-0"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
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
