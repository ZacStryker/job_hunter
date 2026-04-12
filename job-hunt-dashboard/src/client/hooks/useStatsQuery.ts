import { useQuery } from '@tanstack/react-query'
import type { Stats, StatsPeriod } from '@shared/schemas'

export type AppliedFilter = 'applied' | 'unapplied' | 'all'

export function useStatsQuery(period: StatsPeriod, showArchived: boolean, appliedFilter: AppliedFilter) {
  return useQuery<Stats>({
    queryKey: ['stats', period, showArchived, appliedFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ period })
      if (showArchived) params.set('showArchived', 'true')
      if (appliedFilter !== 'applied') params.set('appliedFilter', appliedFilter)
      const res = await fetch(`/api/stats?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<Stats>
    },
  })
}
