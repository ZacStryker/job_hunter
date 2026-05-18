import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { InboxFolderMapping } from '@shared/schemas'

export async function fetchInboxMappings(): Promise<InboxFolderMapping[]> {
  const res = await apiFetch('/api/config/inbox-mappings')
  if (!res.ok) throw new Error('Failed to fetch inbox mappings')
  return res.json()
}

export function useInboxMappingsQuery() {
  return useQuery({ queryKey: ['inbox-mappings'], queryFn: fetchInboxMappings })
}
