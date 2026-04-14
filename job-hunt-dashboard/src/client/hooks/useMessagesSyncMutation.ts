import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useMessagesSyncMutation() {
  const queryClient = useQueryClient()

  return useMutation<{ added: number }, Error>({
    mutationFn: async () => {
      const res = await fetch('/api/messages/sync', { method: 'POST' })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error?: string }
          if (body.error) message = body.error
        } catch {
          // non-JSON error body
        }
        throw new Error(message)
      }
      return res.json() as Promise<{ added: number }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
  })
}
