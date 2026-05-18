import { useMutation } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import type { InboxFolderMappingInput } from '@shared/schemas'

export function useInboxMappingsMutation() {
  return useMutation({
    mutationFn: async (rows: InboxFolderMappingInput) => {
      const res = await apiFetch('/api/config/inbox-mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Failed to save mappings')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-mappings'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
