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

    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedEmail) {
      setEmailError('Email is required')
      return
    }

    if (trimmedName === (user.name ?? '') && trimmedEmail === user.email.toLowerCase() && role === user.role) return

    try {
      await mutation.mutateAsync({
        id: user.id,
        data: {
          name: trimmedName || undefined,
          email: trimmedEmail,
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
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm disabled:opacity-50"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Display name"
              disabled={mutation.isPending}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Email</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm disabled:opacity-50"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError(null) }}
              placeholder="user@example.com"
              disabled={mutation.isPending}
            />
            {emailError && (
              <p role="alert" className="text-xs text-red-400 mt-1">{emailError}</p>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Account Type</span>
            <select
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm disabled:opacity-50"
              value={role}
              onChange={e => setRole(e.target.value)}
              disabled={mutation.isPending}
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
