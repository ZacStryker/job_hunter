import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { GmailLabelMapping } from '@shared/schemas'

export async function fetchGmailMappings(): Promise<GmailLabelMapping[]> {
  const res = await apiFetch('/api/config/gmail-mappings')
  if (!res.ok) throw new Error('Failed to fetch Gmail mappings')
  return res.json()
}

export function useGmailMappingsQuery() {
  return useQuery({ queryKey: ['gmail-mappings'], queryFn: fetchGmailMappings })
}
