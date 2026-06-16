import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '../../db/client'
import { sessions } from '../../db/schema'
import type { AppEnv } from '../types'

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Google's top-level OAuth redirect lands here; if the session cookie is gone
  // (expired during consent, or dropped), redirect gracefully instead of a raw 401.
  const unauthorized = c.req.path === '/api/onboarding/gmail/callback'
    ? c.redirect('/config/profile/inbox-mapping?gmail=error')
    : c.json({ error: 'Unauthorized' }, 401)

  const sessionId = getCookie(c, 'session')
  if (!sessionId) return unauthorized

  const now = new Date().toISOString()
  const session = db.select().from(sessions)
    .where(and(eq(sessions.id, sessionId), gte(sessions.expiresAt, now)))
    .get()
  if (!session) return unauthorized

  const method = c.req.method
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    const csrfCookie = getCookie(c, 'csrf_token')
    const csrfHeader = c.req.header('x-csrf-token')
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return c.json({ error: 'CSRF token invalid' }, 403)
    }
  }

  let effectiveUserId = session.userId
  if (session.data) {
    try {
      const data = JSON.parse(session.data) as { impersonating?: number }
      if (Number.isInteger(data.impersonating) && data.impersonating > 0) effectiveUserId = data.impersonating
    } catch (e) {
      console.error('[auth] Failed to parse session.data:', e)
    }
  }
  c.set('userId', effectiveUserId)
  c.set('sessionUserId', session.userId)
  await next()
}
