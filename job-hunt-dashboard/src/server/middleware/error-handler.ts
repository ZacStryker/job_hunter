import type { ErrorHandler } from 'hono'

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('[error]', err)
  return c.json({ error: err.message }, 500)
}
