import { useQuery } from '@tanstack/react-query'
import type { CoverLetter } from '@shared/schemas'

// Returns null (not an error) when the job has no letter yet — the editor renders an empty state for
// that case rather than treating it as a failure.
export async function fetchCoverLetter(jobId: number): Promise<CoverLetter | null> {
  const res = await fetch(`/api/jobs/${jobId}/cover-letter`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { coverLetter: CoverLetter }
  return body.coverLetter
}

export function useCoverLetterQuery(jobId: number) {
  return useQuery({
    queryKey: ['jobs', jobId, 'cover-letter'],
    queryFn: () => fetchCoverLetter(jobId),
  })
}
