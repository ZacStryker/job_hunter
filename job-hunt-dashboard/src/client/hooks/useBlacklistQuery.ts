import { useQuery } from '@tanstack/react-query'
import { blacklistEntrySchema } from '@shared/schemas'
import type { BlacklistEntry } from '@shared/schemas'

export async function fetchBlacklist(): Promise<BlacklistEntry[]> {
  const res = await fetch('/api/blacklist')
  if (!res.ok) throw new Error('Failed to fetch blacklist')
  const raw: unknown = await res.json()
  const items: unknown[] = Array.isArray(raw) ? raw : []
  return items.flatMap((item) => {
    const result = blacklistEntrySchema.safeParse(item)
    return result.success ? [result.data] : []
  })
}

export function useBlacklistQuery() {
  return useQuery({ queryKey: ['blacklist'], queryFn: fetchBlacklist })
}
