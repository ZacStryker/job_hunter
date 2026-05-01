import { Hono } from 'hono'
import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import { getCookie } from 'hono/cookie'
import { db } from '../../db/client'
import { users, sessions } from '../../db/schema'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.get('/users', (c) => {
  const allUsers = db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    isActive: users.isActive,
    createdAt: users.createdAt,
    lastLoginAt: users.lastLoginAt,
  }).from(users).orderBy(asc(users.id)).all()
  return c.json(allUsers)
})

const patchUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['standard', 'admin']).optional(),
  isActive: z.boolean().optional(),
})

app.patch('/users/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = patchUserSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const updates = parsed.data
  if (Object.keys(updates).length === 0) return c.json({ error: 'No fields to update' }, 400)

  if (updates.isActive === false && id === c.get('sessionUserId')) {
    return c.json({ error: 'Cannot deactivate your own account' }, 400)
  }

  const target = db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).get()
  if (!target) return c.json({ error: 'User not found' }, 404)

  if (updates.role === 'standard' && target.role === 'admin') {
    const adminCount = db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).all().length
    if (adminCount === 1) return c.json({ error: 'Cannot remove the last admin' }, 400)
  }

  const updateSet: Record<string, unknown> = {}

  if (updates.name !== undefined) updateSet.name = updates.name
  if (updates.role !== undefined) updateSet.role = updates.role
  if (updates.isActive !== undefined) updateSet.isActive = updates.isActive

  if (updates.email !== undefined) {
    const emailNorm = updates.email.toLowerCase().trim()
    const conflict = db.select({ id: users.id }).from(users)
      .where(eq(users.email, emailNorm)).get()
    if (conflict && conflict.id !== id) return c.json({ error: 'Email already in use' }, 409)
    updateSet.email = emailNorm
  }

  db.transaction((tx) => {
    tx.update(users).set(updateSet).where(eq(users.id, id)).run()
    if (updates.isActive === false) {
      tx.delete(sessions).where(eq(sessions.userId, id)).run()
    }
  })

  const updated = db.select({
    id: users.id, email: users.email, name: users.name,
    role: users.role, isActive: users.isActive,
    createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
  }).from(users).where(eq(users.id, id)).get()

  if (!updated) return c.json({ error: 'User not found' }, 404)
  return c.json(updated)
})

// Exit FIRST — prevents "exit" from being captured as :id
app.post('/impersonate/exit', (c) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: 'No session' }, 401)
  db.update(sessions).set({ data: null }).where(eq(sessions.id, sessionId)).run()
  return c.json({})
})

app.post('/impersonate/:id', (c) => {
  const targetId = parseInt(c.req.param('id'), 10)
  if (isNaN(targetId)) return c.json({ error: 'Invalid id' }, 400)

  if (targetId === c.get('sessionUserId')) return c.json({ error: 'Cannot impersonate yourself' }, 400)

  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: 'No session' }, 401)

  const session = db.select({ data: sessions.data }).from(sessions).where(eq(sessions.id, sessionId)).get()
  if (session?.data) {
    try {
      const existing = JSON.parse(session.data) as { impersonating?: number }
      if (Number.isInteger(existing.impersonating) && existing.impersonating > 0) {
        return c.json({ error: 'Already impersonating a user — exit first' }, 409)
      }
    } catch {}
  }

  const target = db.select({
    id: users.id, email: users.email, name: users.name,
  }).from(users).where(eq(users.id, targetId)).get()
  if (!target) return c.json({ error: 'User not found' }, 404)

  db.update(sessions)
    .set({ data: JSON.stringify({ impersonating: targetId }) })
    .where(eq(sessions.id, sessionId))
    .run()

  return c.json({ impersonating: target })
})

export default app
