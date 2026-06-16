import { useMutation } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import type { GmailLabelMappingInput } from '@shared/schemas'

export function useGmailMappingsMutation() {
  return useMutation({
    mutationFn: async (rows: GmailLabelMappingInput) => {
      const res = await apiFetch('/api/config/gmail-mappings', {
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
      queryClient.invalidateQueries({ queryKey: ['gmail-mappings'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
