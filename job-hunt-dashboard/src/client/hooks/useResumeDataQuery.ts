import { useQuery } from '@tanstack/react-query'
import type { ResumeData } from '@shared/schemas'

export interface StoredResume {
  id: number
  jobId: number
  source: 'generated' | 'edited'
  createdAt: string
  data: ResumeData
}

// Returns null (not an error) when the job has no resume row yet. That is NOT the same as "no
// resume": a resume generated before this feature existed has a PDF on disk and zero rows, and the
// editor tells those two states apart with jobs.resumeGeneratedAt, not with this.
export async function fetchResumeData(jobId: number): Promise<StoredResume | null> {
  const res = await fetch(`/api/jobs/${jobId}/resume-data`)
  if (res.status === 404) return null
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
  const body = await res.json() as { resume: StoredResume }
  return body.resume
}

export function useResumeDataQuery(jobId: number, enabled = true) {
  return useQuery({
    queryKey: ['jobs', jobId, 'resume-data'],
    queryFn: () => fetchResumeData(jobId),
    enabled,
  })
}
