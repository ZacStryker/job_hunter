import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ResumeData, ResumeVersion } from '@shared/schemas'
import { apiFetch } from '../lib/api'

// Saving an edit INSERTs a new version server-side; it never mutates the old one.
export function useResumeMutation(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<ResumeVersion, Error, { data: ResumeData }>({
    mutationFn: async ({ data }) => {
      const res = await apiFetch(`/api/jobs/${jobId}/resume`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
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
      const body = await res.json() as { resume: ResumeVersion }
      return body.resume
    },
    onSuccess: () => {
      // ['jobs'] matters as much as the other two: the drawer's preview iframe and Download link
      // cache-bust on job.resumeGeneratedAt, which the server just bumped. Without this the user
      // saves an edit and is shown the stale PDF — the exact failure this feature exists to prevent.
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'resume-data'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'resume', 'versions'] })
    },
  })
}
