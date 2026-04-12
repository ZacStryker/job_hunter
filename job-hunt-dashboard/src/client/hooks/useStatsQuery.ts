import { useQuery } from '@tanstack/react-query'
import type { Stats, StatsPeriod } from '@shared/schemas'

export type AppliedFilter  = 'applied'  | 'unapplied' | 'all'
export type ArchivedFilter = 'active'   | 'archived'  | 'all'

export function useStatsQuery(period: StatsPeriod, archivedFilter: ArchivedFilter, appliedFilter: AppliedFilter) {
  return useQuery<Stats>({
    queryKey: ['stats', period, archivedFilter, appliedFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ period })
      if (archivedFilter !== 'active') params.set('archivedFilter', archivedFilter)
      if (appliedFilter !== 'applied') params.set('appliedFilter', appliedFilter)
      const res = await fetch(`/api/stats?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<Stats>
    },
  })
}
