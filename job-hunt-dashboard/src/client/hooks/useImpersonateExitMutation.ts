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
