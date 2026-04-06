import { useQuery } from '@tanstack/react-query'
import type { CoverLetter } from '@shared/schemas'

// ['coverLetter', id] is the approved query key shape for this entity (extension beyond the
// ['jobs']/['jobs', id] shapes defined in architecture; cover letters are a distinct entity)
export function useCoverLetterQuery(jobId: number, enabled: boolean) {
  return useQuery<CoverLetter | null>({
    queryKey: ['coverLetter', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/cover-letter`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Failed to fetch cover letter: ${res.status}`)
      const data = await res.json() as { coverLetter: CoverLetter }
      return data.coverLetter
    },
    enabled,
    staleTime: Infinity, // only invalidated explicitly after generation
  })
}
