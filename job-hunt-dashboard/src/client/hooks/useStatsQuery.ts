import { useQuery } from '@tanstack/react-query'
import type { Stats, StatsPeriod } from '@shared/schemas'

export type ArchivedFilter = 'active' | 'archived' | 'all'
export type AppliedFilter = 'unapplied' | 'applied' | 'all'

export function useStatsQuery(period: StatsPeriod, archivedFilter: ArchivedFilter, appliedFilter: AppliedFilter) {
  return useQuery<Stats>({
    queryKey: ['stats', 'v3', period, archivedFilter, appliedFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ period })
      if (archivedFilter !== 'active') params.set('archivedFilter', archivedFilter)
      if (appliedFilter !== 'all') params.set('appliedFilter', appliedFilter)
      const res = await fetch(`/api/stats?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<Stats>
    },
  })
}
