import { useQuery } from '@tanstack/react-query'
import type { SessionResponse } from '@shared/schemas'

export async function fetchSession(): Promise<SessionResponse> {
  const res = await fetch('/auth/session')
  if (res.status === 401 || res.status === 403) throw new Error('Unauthorized')
  if (!res.ok) throw new Error(`Session check failed: ${res.status}`)
  return res.json() as Promise<SessionResponse>
}

export function useSessionQuery() {
  return useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
