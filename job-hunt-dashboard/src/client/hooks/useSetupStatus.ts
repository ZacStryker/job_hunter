import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { setupStatusSchema, type SetupStatus, type SetupTask } from '@shared/schemas'
import { queryClient } from '@/lib/query-client'
import { subscribeActivityStream } from '@/lib/activity-stream'

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await fetch('/api/setup-status')
  if (!res.ok) throw new Error('Failed to load setup status')
  return setupStatusSchema.parse(await res.json())
}

export function parseSetupStatus(data: string): SetupStatus | null {
  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    return null
  }
  const result = setupStatusSchema.safeParse(json)
  return result.success ? result.data : null
}

export function computeBadge(status: SetupStatus | undefined): 'none' | 'dot' | 'alert' {
  if (!status) return 'none'
  if (status.ready) return 'none'
  if (
    status.tasks.some((t) => t.state === 'broken') ||
    status.tasks.some((t) => t.tier === 'required' && t.state !== 'complete')
  ) {
    return 'alert'
  }
  return 'dot'
}

export function useSetupStatus(): { tasks: SetupTask[]; ready: boolean; badge: 'none' | 'dot' | 'alert' } {
  const { data } = useQuery<SetupStatus>({
    queryKey: ['setup-status'],
    queryFn: fetchSetupStatus,
    staleTime: 0,
  })

  useEffect(() => {
    return subscribeActivityStream('setup-status', (ev) => {
      const parsed = parseSetupStatus(ev.data)
      if (parsed) queryClient.setQueryData(['setup-status'], parsed)
    })
  }, [])

  return {
    tasks: data?.tasks ?? [],
    ready: data?.ready ?? false,
    badge: computeBadge(data),
  }
}
