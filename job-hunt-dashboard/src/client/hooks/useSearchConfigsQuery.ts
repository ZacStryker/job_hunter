import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { searchConfigSchema } from '@shared/schemas'

export async function fetchSearchConfigs() {
  const res = await fetch('/api/search-configs')
  if (!res.ok) throw new Error('Failed to fetch search configs')
  return z.array(searchConfigSchema).parse(await res.json())
}

export function useSearchConfigsQuery() {
  return useQuery({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs })
}
