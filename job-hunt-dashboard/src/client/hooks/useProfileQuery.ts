import { useQuery } from '@tanstack/react-query'
import { profileDataSchema } from '@shared/schemas'
import type { ProfileData } from '@shared/schemas'

export async function fetchProfile(): Promise<ProfileData> {
  const res = await fetch('/api/profile')
  if (!res.ok) throw new Error('Failed to fetch profile')
  const data = await res.json()
  return profileDataSchema.parse(data)
}

export function useProfileQuery() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })
}
