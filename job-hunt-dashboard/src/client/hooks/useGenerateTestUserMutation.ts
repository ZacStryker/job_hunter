import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { AdminUser } from '@shared/schemas'

export function useGenerateTestUserMutation() {
  const queryClient = useQueryClient()
  return useMutation<AdminUser, Error>({
    mutationFn: async () => {
      const res = await apiFetch('/api/admin/users/test-user', { method: 'POST' })
      if (!res.ok) throw new Error(`Generate test user failed: ${res.status}`)
      return res.json() as Promise<AdminUser>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}
