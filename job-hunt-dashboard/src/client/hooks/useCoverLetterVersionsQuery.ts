import { useQuery } from '@tanstack/react-query'
import type { CoverLetterVersion } from '@shared/schemas'

export async function fetchCoverLetterVersions(jobId: number): Promise<CoverLetterVersion[]> {
  const res = await fetch(`/api/jobs/${jobId}/cover-letter/versions`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { versions: CoverLetterVersion[] }
  return body.versions
}

export function useCoverLetterVersionsQuery(jobId: number, enabled = true) {
  return useQuery({
    queryKey: ['jobs', jobId, 'cover-letter', 'versions'],
    queryFn: () => fetchCoverLetterVersions(jobId),
    enabled,
  })
}
