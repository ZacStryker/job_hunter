import { useEffect, useState } from 'react'
import { activityRunSchema, type ActivityRun } from '@shared/schemas'
import { subscribeActivityStream } from '@/lib/activity-stream'

export function parseRuns(data: string): ActivityRun[] | null {
  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    return null
  }
  const result = activityRunSchema.array().safeParse(json)
  return result.success ? result.data : null
}

export function computeIsActive(runs: ActivityRun[]): boolean {
  return runs.some((r) => r.state === 'running')
}

export function useActivityStream(): { runs: ActivityRun[]; isActive: boolean } {
  const [runs, setRuns] = useState<ActivityRun[]>([])

  useEffect(() => {
    const handle = (ev: MessageEvent) => {
      const parsed = parseRuns(ev.data)
      if (parsed) setRuns(parsed)
    }

    const unsubscribeSnapshot = subscribeActivityStream('snapshot', handle)
    const unsubscribeUpdate = subscribeActivityStream('update', handle)

    return () => {
      unsubscribeSnapshot()
      unsubscribeUpdate()
    }
  }, [])

  return { runs, isActive: computeIsActive(runs) }
}
