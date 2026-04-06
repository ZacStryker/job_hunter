import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CoverLetter } from '@shared/schemas'

export function useGenerateCoverLetter(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<CoverLetter, Error>({
    mutationFn: async () => {
      if (!jobId) throw new Error('No job selected')
      const res = await fetch(`/api/jobs/${jobId}/generate-cover-letter`, { method: 'POST' })
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
      const data = await res.json() as { coverLetter: CoverLetter }
      return data.coverLetter
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
