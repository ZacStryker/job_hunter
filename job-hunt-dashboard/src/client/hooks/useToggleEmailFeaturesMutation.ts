import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export function useToggleEmailFeaturesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ enabled }: { enabled: boolean }): Promise<void> => {
      const res = await apiFetch('/api/admin/feature-settings/emailFeatures', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error?: string }
          if (body.error) message = body.error
        } catch { /* ignore */ }
        throw new Error(message)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-settings'] })
    },
  })
}
