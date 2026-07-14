import { useQuery } from '@tanstack/react-query'
import type { ResumeVersion } from '@shared/schemas'

export async function fetchResumeVersions(jobId: number): Promise<ResumeVersion[]> {
  const res = await fetch(`/api/jobs/${jobId}/resume/versions`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { versions: ResumeVersion[] }
  return body.versions
}

export function useResumeVersionsQuery(jobId: number, enabled = true) {
  return useQuery({
    queryKey: ['jobs', jobId, 'resume', 'versions'],
    queryFn: () => fetchResumeVersions(jobId),
    enabled,
  })
}
