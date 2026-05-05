import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export function useRevokeInviteKeyMutation() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/admin/invite-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Revoke failed: ${res.status}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-invite-keys'] })
    },
  })
}
