import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { activityRegistry, type ActivityListener, type SetupStatusListener } from '../services/activity-registry'
import { setupHealth } from '../services/setup-health'
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

    const setupListener: SetupStatusListener = (status) =>
      enqueue({ event: 'setup-status', data: JSON.stringify(status) })
    activityRegistry.subscribeSetupStatus(userId, setupListener)
    setupHealth.startForUser(userId)

    const heartbeat = setInterval(() => {
      if (!stream.aborted) stream.write(': keepalive\n\n').catch(() => {})
    }, KEEPALIVE_MS)

    await new Promise<void>((resolve) => stream.onAbort(resolve))

    clearInterval(heartbeat)
    activityRegistry.unsubscribe(userId, listener)
    activityRegistry.unsubscribeSetupStatus(userId, setupListener)
    setupHealth.stopForUser(userId)
  })
})

export default app
