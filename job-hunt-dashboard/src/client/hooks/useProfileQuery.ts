import { useQuery } from '@tanstack/react-query'
import { profileSchema } from '@shared/schemas'
import type { Profile } from '@shared/schemas'

export async function fetchProfile(): Promise<Profile> {
  const res = await fetch('/api/profile')
  if (!res.ok) throw new Error('Failed to fetch profile')
  const data = await res.json()
  return profileSchema.parse(data)
}

export function useProfileQuery() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })
}
