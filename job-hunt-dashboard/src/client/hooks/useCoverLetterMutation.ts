import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CoverLetter } from '@shared/schemas'
import { apiFetch } from '../lib/api'

// Saving an edit INSERTs a new version server-side; it never mutates the old one.
export function useCoverLetterMutation(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<CoverLetter, Error, { content: string }>({
    mutationFn: async ({ content }) => {
      const res = await apiFetch(`/api/jobs/${jobId}/cover-letter`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
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
      // ['jobs'] matters as much as the other two: the drawer's preview iframe and Download link
      // cache-bust on job.coverLetterSentAt, which the server just bumped. Without this the user
      // saves an edit and is shown the stale PDF.
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'cover-letter'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'cover-letter', 'versions'] })
    },
  })
}
