import { Hono } from 'hono'
import { z } from 'zod'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { getCookie } from 'hono/cookie'
import { randomBytes } from 'node:crypto'
import { db } from '../../db/client'
import { users, sessions, inviteKeys, jobs, coverLetters, statusEvents, messages, searchConfigs, userSecrets, sourceSettings } from '../../db/schema'
import { scraperSourceSchema } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

function generateInviteKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = randomBytes(12)
  const raw = Array.from(bytes).map(b => chars[b % chars.length]).join('')
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

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

app.delete('/users/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  if (id === c.get('sessionUserId')) {
    return c.json({ error: 'Cannot delete your own account' }, 403)
  }

  const target = db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).get()
  if (!target) return c.json({ error: 'User not found' }, 404)

  if (target.role === 'admin') {
    const adminCount = db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).all().length
    if (adminCount === 1) return c.json({ error: 'Cannot delete the last admin' }, 409)
  }

  db.transaction((tx) => {
    tx.delete(sessions).where(eq(sessions.userId, id)).run()
    tx.delete(userSecrets).where(eq(userSecrets.userId, id)).run()
    tx.delete(messages).where(eq(messages.userId, id)).run()
    tx.delete(searchConfigs).where(eq(searchConfigs.userId, id)).run()
    tx.delete(coverLetters).where(eq(coverLetters.userId, id)).run()
    const jobIds = tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.userId, id)).all().map(r => r.id)
    if (jobIds.length > 0) {
      tx.delete(statusEvents).where(inArray(statusEvents.jobId, jobIds)).run()
    }
    tx.delete(jobs).where(eq(jobs.userId, id)).run()
    tx.update(inviteKeys).set({ usedByUserId: null }).where(eq(inviteKeys.usedByUserId, id)).run()
    tx.delete(users).where(eq(users.id, id)).run()
  })

  return c.body(null, 204)
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
    id: users.id, email: users.email, name: users.name, role: users.role,
  }).from(users).where(eq(users.id, targetId)).get()
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.role === 'admin') return c.json({ error: 'Cannot impersonate an admin user' }, 403)

  db.update(sessions)
    .set({ data: JSON.stringify({ impersonating: targetId }) })
    .where(eq(sessions.id, sessionId))
    .run()

  return c.json({ impersonating: target })
})

app.get('/invite-keys', (c) => {
  const rows = db
    .select({
      id: inviteKeys.id,
      key: inviteKeys.key,
      usedByUserId: inviteKeys.usedByUserId,
      usedAt: inviteKeys.usedAt,
      usedByEmail: users.email,
    })
    .from(inviteKeys)
    .leftJoin(users, eq(inviteKeys.usedByUserId, users.id))
    .orderBy(desc(inviteKeys.id))
    .all()

  const result = rows.map(r => ({
    id: r.id,
    key: r.key,
    status: r.usedByUserId === null ? 'unused' : 'used' as const,
    usedByEmail: r.usedByEmail ?? null,
    usedAt: r.usedAt,
  }))
  return c.json(result)
})

app.post('/invite-keys', (c) => {
  const key = generateInviteKey()
  try {
    const inserted = db
      .insert(inviteKeys)
      .values({ key })
      .returning({ id: inviteKeys.id, key: inviteKeys.key })
      .get()
    return c.json(
      { id: inserted.id, key: inserted.key, status: 'unused', usedByEmail: null, usedAt: null },
      201,
    )
  } catch {
    return c.json({ error: 'Failed to generate invite key' }, 500)
  }
})

app.delete('/invite-keys/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const outcome = { notFound: false, alreadyUsed: false }
  db.transaction((tx) => {
    const row = tx
      .select({ usedByUserId: inviteKeys.usedByUserId })
      .from(inviteKeys)
      .where(eq(inviteKeys.id, id))
      .get()
    if (!row) { outcome.notFound = true; return }
    if (row.usedByUserId !== null) { outcome.alreadyUsed = true; return }
    tx.delete(inviteKeys).where(eq(inviteKeys.id, id)).run()
  })

  if (outcome.notFound) return c.json({ error: 'Invite key not found' }, 404)
  if (outcome.alreadyUsed) return c.json({ error: 'Cannot revoke a used invite key' }, 409)
  return c.body(null, 204)
})

const toggleSourceSchema = z.object({ enabled: z.boolean() })

app.get('/source-settings', (c) => {
  const rows = db.select().from(sourceSettings).all()
  return c.json(rows)
})

app.patch('/source-settings/:source', async (c) => {
  const sourceParam = c.req.param('source')
  const parsed = scraperSourceSchema.safeParse(sourceParam)
  if (!parsed.success) return c.json({ error: 'Invalid source' }, 400)

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const bodyParsed = toggleSourceSchema.safeParse(body)
  if (!bodyParsed.success) return c.json({ error: bodyParsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const { enabled } = bodyParsed.data
  const result = db
    .insert(sourceSettings)
    .values({ source: parsed.data, enabled })
    .onConflictDoUpdate({ target: sourceSettings.source, set: { enabled } })
    .returning()
    .get()

  if (!result) return c.json({ error: 'Not found' }, 404)
  return c.json(result)
})

export default app
