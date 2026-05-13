import { Hono } from 'hono'
import { createSession, cancelSession, getSession } from '../services/indeed-browser-service'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.post('/', async (c) => {
  const userId = c.get('userId')
  const sessionId = await createSession(userId)
  return c.json({ sessionId })
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const sessionId = c.req.param('id')
  const session = getSession(sessionId)
  if (!session || session.userId !== userId) {
    return c.json({ error: 'Session not found' }, 404)
  }
  await cancelSession(sessionId)
  return c.json({ ok: true })
})

export default app
