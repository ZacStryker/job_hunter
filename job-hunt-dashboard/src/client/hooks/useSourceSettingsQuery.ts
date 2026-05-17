import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { sourceSettingSchema } from '@shared/schemas'
import type { SourceSetting } from '@shared/schemas'

export async function fetchSourceSettings(): Promise<SourceSetting[]> {
  const res = await fetch('/api/source-settings')
  if (!res.ok) throw new Error(`Failed to fetch source settings: ${res.status}`)
  const raw = await res.json()
  const parsed = z.array(sourceSettingSchema).safeParse(raw)
  if (!parsed.success) throw new Error('Invalid source settings response')
  return parsed.data
}

export function useSourceSettingsQuery() {
  return useQuery({ queryKey: ['source-settings'], queryFn: fetchSourceSettings })
}
