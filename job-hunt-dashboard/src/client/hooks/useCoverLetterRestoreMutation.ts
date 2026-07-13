import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CoverLetter } from '@shared/schemas'
import { apiFetch } from '../lib/api'

// Restore copies an old version forward as a NEW version. Nothing is deleted, so this is safe to
// fire without a confirmation dialog — which is why the UX spec's "no confirmations" rule holds.
export function useCoverLetterRestoreMutation(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<CoverLetter, Error, { versionId: number }>({
    mutationFn: async ({ versionId }) => {
      const res = await apiFetch(`/api/jobs/${jobId}/cover-letter/versions/${versionId}/restore`, {
        method: 'POST',
      })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error: string }
          if (body.error) message = body.error
        } catch {
          // non-JSON error body
        }
        throw new Error(message)
      }
      const body = await res.json() as { coverLetter: CoverLetter }
      return body.coverLetter
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'cover-letter'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'cover-letter', 'versions'] })
    },
  })
}
