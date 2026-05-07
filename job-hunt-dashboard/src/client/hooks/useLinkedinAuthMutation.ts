import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

export function useLinkedinAuthMutation() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (content: string) => {
      const res = await apiFetch('/api/onboarding/linkedin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        let message = `Upload failed: HTTP ${res.status}`
        try {
          const body = await res.json() as { error?: string }
          if (body.error) message = body.error
        } catch { }
        throw new Error(message)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
    },
  })
}
