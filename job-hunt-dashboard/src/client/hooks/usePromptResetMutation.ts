import { useMutation, useQueryClient } from '@tanstack/react-query'
import { promptSchema } from '@shared/schemas'
import type { PromptFlow } from '@shared/schemas'
import { apiFetch } from '../lib/api'

export function usePromptResetMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (flow: PromptFlow) => {
      const res = await apiFetch(`/api/prompts/${flow}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error: string }
        throw new Error(err.error ?? 'Failed to reset prompt')
      }
      return promptSchema.parse(await res.json())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
  })
}
