import { useQuery } from '@tanstack/react-query'
import type { OnboardingStatusResponse } from '@shared/schemas'

export async function fetchOnboardingStatus(): Promise<OnboardingStatusResponse> {
  const res = await fetch('/api/onboarding/status')
  if (!res.ok) throw new Error('Failed to load onboarding status')
  return res.json() as Promise<OnboardingStatusResponse>
}

export function useOnboardingStatusQuery() {
  return useQuery<OnboardingStatusResponse>({
    queryKey: ['onboarding-status'],
    queryFn: fetchOnboardingStatus,
    staleTime: 0,
  })
}
