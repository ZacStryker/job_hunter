import { useMutation, useQueryClient } from '@tanstack/react-query'
import { promptSchema } from '@shared/schemas'
import type { PromptInput, PromptFlow } from '@shared/schemas'
import { apiFetch } from '../lib/api'

export function usePromptMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ flow, input }: { flow: PromptFlow; input: PromptInput }) => {
      const res = await apiFetch(`/api/prompts/${flow}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error: string }
        throw new Error(err.error ?? 'Failed to save prompt')
      }
      return promptSchema.parse(await res.json())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
  })
}
