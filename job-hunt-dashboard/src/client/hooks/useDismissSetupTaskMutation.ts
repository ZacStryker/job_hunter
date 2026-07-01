import { useMutation } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import type { SetupTaskId } from '@shared/schemas'

export function useDismissSetupTaskMutation() {
  return useMutation({
    mutationFn: async (taskId: SetupTaskId) => {
      const res = await apiFetch('/api/setup-status/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Failed to dismiss')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-status'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
