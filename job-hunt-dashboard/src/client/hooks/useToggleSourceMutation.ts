import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { ScraperSource, SourceSetting } from '@shared/schemas'

export function useToggleSourceMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ source, enabled }: { source: ScraperSource; enabled: boolean }): Promise<SourceSetting> => {
      const res = await apiFetch(`/api/admin/source-settings/${source}`, {
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
      return res.json() as Promise<SourceSetting>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['source-settings'] })
    },
  })
}
