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
