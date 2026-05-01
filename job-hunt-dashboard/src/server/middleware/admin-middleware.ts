import type { MiddlewareHandler } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { users } from '../../db/schema'
import type { AppEnv } from '../types'

export const adminMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = c.get('sessionUserId')
  const user = db.select({ role: users.role }).from(users)
    .where(eq(users.id, userId))
    .get()
  if (!user || user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
  await next()
}
