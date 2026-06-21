import type { MiddlewareHandler } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { featureSettings } from '../../db/schema'
import type { AppEnv } from '../types'

export const emailFeaturesMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const row = db.select({ enabled: featureSettings.enabled }).from(featureSettings)
    .where(eq(featureSettings.feature, 'emailFeatures'))
    .get()
  if (!row || row.enabled !== true) return c.json({ error: 'Email features are disabled' }, 403)
  await next()
}
