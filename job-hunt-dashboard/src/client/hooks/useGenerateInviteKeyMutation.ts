import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { InviteKey } from '@shared/schemas'

export function useGenerateInviteKeyMutation() {
  const queryClient = useQueryClient()
  return useMutation<InviteKey, Error>({
    mutationFn: async () => {
      const res = await apiFetch('/api/admin/invite-keys', { method: 'POST' })
      if (!res.ok) throw new Error(`Generate key failed: ${res.status}`)
      return res.json() as Promise<InviteKey>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-invite-keys'] })
    },
  })
}
