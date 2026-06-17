import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

export function useGenerateResume(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<void, Error>({
    mutationFn: async () => {
      if (!jobId) throw new Error('No job selected')
      const res = await apiFetch(`/api/jobs/${jobId}/generate-resume`, { method: 'POST' })
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
      // Don't auto-download — generation persists the PDF server-side and sets
      // resumeGeneratedAt. The user clicks Download (GET /api/jobs/:id/resume)
      // when they want the file, mirroring the cover letter flow.
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
