import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

export const errorHandler: ErrorHandler = (err, c) => {
  // Deliberate 4xx carry a message written for the client; unexpected errors do not,
  // and err.message may hold filesystem paths, SQL, or upstream API detail.
  if (err instanceof HTTPException) {
    // `new HTTPException(404)` carries an empty message; never ship `{ error: '' }`.
    return c.json({ error: err.message || `HTTP ${err.status}` }, err.status)
  }
  console.error('[error]', err)
  return c.json({ error: 'Internal Server Error' }, 500)
}
