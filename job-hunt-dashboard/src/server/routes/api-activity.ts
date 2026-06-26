import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { activityRegistry, type ActivityListener } from '../services/activity-registry'
import type { AppEnv } from '../types'

export const KEEPALIVE_MS = 15_000

const app = new Hono<AppEnv>()

app.get('/stream', (c) => {
  const userId = c.get('userId')
  return streamSSE(c, async (stream) => {
    let chain: Promise<unknown> = Promise.resolve()
    const enqueue = (msg: { event: string; data: string }) => {
      if (stream.aborted) return
      chain = chain.then(() => stream.writeSSE(msg)).catch(() => {})
    }

    enqueue({ event: 'snapshot', data: JSON.stringify(activityRegistry.snapshot(userId)) })

    const listener: ActivityListener = (runs) =>
      enqueue({ event: 'update', data: JSON.stringify(runs) })
    activityRegistry.subscribe(userId, listener)

    const heartbeat = setInterval(() => {
      if (!stream.aborted) stream.write(': keepalive\n\n').catch(() => {})
    }, KEEPALIVE_MS)

    await new Promise<void>((resolve) => stream.onAbort(resolve))

    clearInterval(heartbeat)
    activityRegistry.unsubscribe(userId, listener)
  })
})

export default app
