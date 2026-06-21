import { useQuery } from '@tanstack/react-query'
import { featureSettingsSchema } from '@shared/schemas'
import type { FeatureSettings } from '@shared/schemas'

export async function fetchFeatureSettings(): Promise<FeatureSettings> {
  const res = await fetch('/api/feature-settings')
  if (!res.ok) throw new Error(`Failed to fetch feature settings: ${res.status}`)
  const raw = await res.json()
  const parsed = featureSettingsSchema.safeParse(raw)
  if (!parsed.success) throw new Error('Invalid feature settings response')
  return parsed.data
}

export function useFeatureSettingsQuery() {
  return useQuery({ queryKey: ['feature-settings'], queryFn: fetchFeatureSettings })
}
