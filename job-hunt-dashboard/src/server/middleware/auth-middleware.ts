import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '../../db/client'
import { sessions } from '../../db/schema'
import type { AppEnv } from '../types'

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401)

  const now = new Date().toISOString()
  const session = db.select().from(sessions)
    .where(and(eq(sessions.id, sessionId), gte(sessions.expiresAt, now)))
    .get()
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const method = c.req.method
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    const csrfCookie = getCookie(c, 'csrf_token')
    const csrfHeader = c.req.header('x-csrf-token')
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return c.json({ error: 'CSRF token invalid' }, 403)
    }
  }

  c.set('userId', session.userId)
  await next()
}
