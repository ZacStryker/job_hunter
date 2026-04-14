import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useGenerateResume(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<void, Error>({
    mutationFn: async () => {
      if (!jobId) throw new Error('No job selected')
      const res = await fetch(`/api/jobs/${jobId}/generate-resume`, { method: 'POST' })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error: string }
          if (body.error) message = body.error
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
