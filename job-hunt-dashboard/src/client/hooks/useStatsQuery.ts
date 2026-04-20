import { useQuery } from '@tanstack/react-query'
import type { Stats, StatsPeriod } from '@shared/schemas'

export type ArchivedFilter = 'active' | 'archived' | 'all'

export function useStatsQuery(period: StatsPeriod, archivedFilter: ArchivedFilter) {
  return useQuery<Stats>({
    queryKey: ['stats', period, archivedFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ period })
      if (archivedFilter !== 'active') params.set('archivedFilter', archivedFilter)
      const res = await fetch(`/api/stats?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<Stats>
    },
  })
}
