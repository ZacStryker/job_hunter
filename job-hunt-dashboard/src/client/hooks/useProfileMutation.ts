import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileSchema } from '@shared/schemas'
import type { ProfileInput } from '@shared/schemas'
import { apiFetch } from '../lib/api'

export function useProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProfileInput) => {
      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? 'Failed to save profile')
      }
      return profileSchema.parse(await res.json())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
