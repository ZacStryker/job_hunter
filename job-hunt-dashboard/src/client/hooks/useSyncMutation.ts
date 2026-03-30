import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SyncResult } from '../../shared/schemas'

export function useSyncMutation() {
  const queryClient = useQueryClient()
  return useMutation<SyncResult, Error>({
    mutationFn: async () => {
      const res = await fetch('/api/sync', { method: 'POST' })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error: string }
          if (body.error) message = body.error
        } catch {
          // non-JSON body (e.g. HTML error page from a proxy)
        }
        throw new Error(message)
      }
      return res.json() as Promise<SyncResult>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
