import { useQuery } from '@tanstack/react-query'
import { searchConfigSchema } from '@shared/schemas'
import type { SearchConfig } from '@shared/schemas'

export async function fetchSearchConfigs(): Promise<SearchConfig[]> {
  const res = await fetch('/api/search-configs')
  if (!res.ok) throw new Error('Failed to fetch search configs')
  const items = await res.json() as unknown[]
  return items.flatMap((item) => {
    const result = searchConfigSchema.safeParse(item)
    return result.success ? [result.data] : []
  })
}

export function useSearchConfigsQuery() {
  return useQuery({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs })
}
