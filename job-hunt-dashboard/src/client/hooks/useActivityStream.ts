import { useEffect, useState } from 'react'
import { activityRunSchema, type ActivityRun } from '@shared/schemas'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

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
    let unmounted = false
    let current: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let delay = RECONNECT_BASE_MS

    const handle = (ev: MessageEvent) => {
      const parsed = parseRuns(ev.data)
      if (parsed) setRuns(parsed)
    }

    const connect = () => {
      if (unmounted) return
      const es = new EventSource('/api/activity/stream')
      current = es
      es.addEventListener('snapshot', handle)
      es.addEventListener('update', handle)
      es.onopen = () => {
        delay = RECONNECT_BASE_MS
      }
      es.onerror = () => {
        if (unmounted || es.readyState !== EventSource.CLOSED) return
        es.close()
        reconnectTimer = setTimeout(connect, delay)
        delay = Math.min(delay * 2, RECONNECT_MAX_MS)
      }
    }

    connect()

    return () => {
      unmounted = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      current?.close()
    }
  }, [])

  return { runs, isActive: computeIsActive(runs) }
}
