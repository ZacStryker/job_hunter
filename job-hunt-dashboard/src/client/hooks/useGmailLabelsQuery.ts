import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type GmailLabel = { id: string; name: string }

async function fetchGmailLabels(): Promise<GmailLabel[]> {
  const res = await apiFetch('/api/onboarding/gmail/labels')
  if (!res.ok) throw new Error('Failed to fetch Gmail labels')
  return res.json()
}

export function useGmailLabelsQuery(options: { enabled: boolean }) {
  return useQuery({ queryKey: ['gmail-labels'], queryFn: fetchGmailLabels, enabled: options.enabled })
}
