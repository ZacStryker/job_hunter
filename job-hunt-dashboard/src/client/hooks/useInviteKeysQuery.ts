import { useQuery } from '@tanstack/react-query'
import type { InviteKey } from '@shared/schemas'

export async function fetchInviteKeys(): Promise<InviteKey[]> {
  const res = await fetch('/api/admin/invite-keys')
  if (!res.ok) throw new Error(`Failed to fetch invite keys: ${res.status}`)
  return res.json() as Promise<InviteKey[]>
}

export function useInviteKeysQuery() {
  return useQuery({
    queryKey: ['admin-invite-keys'],
    queryFn: fetchInviteKeys,
  })
}
