import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useWebhookMutation(url: string) {
  const queryClient = useQueryClient()

  return useMutation<void, Error>({
    mutationFn: async () => {
      if (!url) throw new Error('Webhook URL not configured')
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error?: string; message?: string }
          if (body.error) message = body.error
          else if (body.message) message = body.message
        } catch {
          // non-JSON body
        }
        throw new Error(message)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
    },
  })
}
