import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export function useDeleteAdminUserMutation() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Delete failed: ${res.status}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}
