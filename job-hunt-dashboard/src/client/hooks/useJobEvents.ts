import { useQuery } from '@tanstack/react-query'
import type { StatusEvent } from '@shared/schemas'

export function useJobEvents(jobId: number | undefined) {
  return useQuery<StatusEvent[]>({
    queryKey: ['jobs', jobId, 'events'],
    queryFn: async () => {
      if (jobId === undefined) return []
      const res = await fetch(`/api/jobs/${jobId}/events`)
      if (!res.ok) return []
      const body = await res.json() as { events: StatusEvent[] }
      return body.events
    },
    enabled: jobId !== undefined,
    staleTime: 0,
  })
}
