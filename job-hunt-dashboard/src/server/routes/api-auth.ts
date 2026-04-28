import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { getCookie, setCookie } from 'hono/cookie'
import argon2 from 'argon2'
import { db } from '../../db/client'
import { users, inviteKeys, sessions } from '../../db/schema'
import { sendMail } from '../lib/mailer'

const app = new Hono()

const registerSchema = z.object({
  inviteKey: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const resetRequestSchema = z.object({ email: z.string().email() })

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

const isSecure = () => (process.env.APP_URL ?? '').startsWith('https://')

app.post('/register', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const { inviteKey, password } = parsed.data
  const email = parsed.data.email.toLowerCase().trim()

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })

  const activationToken = randomBytes(32).toString('hex')
  const now = new Date().toISOString()
  const activationTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  let errorCode: 'INVALID_KEY' | 'EMAIL_EXISTS' | null = null

  try {
    db.transaction((tx) => {
      const key = tx.select().from(inviteKeys)
        .where(and(eq(inviteKeys.key, inviteKey), isNull(inviteKeys.usedAt)))
        .get()
      if (!key) {
        errorCode = 'INVALID_KEY'
        throw new Error('INVALID_KEY')
      }

      const existing = tx.select({ id: users.id }).from(users)
        .where(eq(users.email, email)).get()
      if (existing) {
        errorCode = 'EMAIL_EXISTS'
        throw new Error('EMAIL_EXISTS')
      }

      tx.insert(users).values({
        email, passwordHash, role: 'standard',
        isActive: false, activationToken, activationTokenExpiresAt, createdAt: now,
      }).run()

      const created = tx.select({ id: users.id }).from(users)
        .where(eq(users.email, email)).get()
      if (!created) throw new Error('USER_INSERT_FAILED')

      tx.update(inviteKeys)
        .set({ usedByUserId: created.id, usedAt: now })
        .where(eq(inviteKeys.id, key.id))
        .run()
    })
  } catch {
    if (errorCode === 'INVALID_KEY') return c.json({ error: 'Invite key not recognized or already used' }, 400)
    if (errorCode === 'EMAIL_EXISTS') return c.json({ error: 'Email already registered' }, 400)
    throw new Error('Registration transaction failed')
  }

  const activationUrl = `${process.env.APP_URL}/auth/activate?token=${activationToken}`
  sendMail({
    to: email,
    subject: 'Activate your account',
    html: `<p>Click to activate your account: <a href="${activationUrl}">${activationUrl}</a></p>`,
  }).catch((err: Error) => console.error('[auth] activation email failed:', err))

  return c.json({}, 201)
})

app.get('/activate', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'Activation link invalid or expired' }, 400)

  const now = new Date().toISOString()
  const user = db.select().from(users)
    .where(and(
      eq(users.activationToken, token),
      gte(users.activationTokenExpiresAt, now),
    ))
    .get()
  if (!user) return c.json({ error: 'Activation link invalid or expired' }, 400)

  const sessionId = randomBytes(32).toString('hex')
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  db.transaction((tx) => {
    tx.update(users).set({
      isActive: true,
      activationToken: null,
      activationTokenExpiresAt: null,
    }).where(eq(users.id, user.id)).run()

    tx.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      data: null,
      expiresAt: sessionExpiresAt,
    }).run()
  })

  setCookie(c, 'session', sessionId, {
    httpOnly: true, secure: isSecure(), sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 60 * 60,
  })

  return c.redirect(`${process.env.APP_URL}/onboarding`, 302)
})

app.post('/login', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const email = parsed.data.email.toLowerCase().trim()
  const { password } = parsed.data

  const user = db.select().from(users).where(eq(users.email, email)).get()

  // Always call verify to prevent timing attacks — use a real hash if user not found
  const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXJhbmRvbXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTcg+zi6JSwQjwc38q3o'
  const passwordHash = user?.passwordHash ?? dummyHash
  let valid = false
  try {
    valid = await argon2.verify(passwordHash, password)
  } catch {
    valid = false
  }

  if (!user || !valid) return c.json({ error: 'Invalid email or password' }, 401)
  if (!user.isActive) return c.json({ error: 'Account is disabled' }, 403)

  const sessionId = randomBytes(32).toString('hex')
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  db.insert(sessions).values({
    id: sessionId, userId: user.id, data: null, expiresAt: sessionExpiresAt,
  }).run()

  setCookie(c, 'session', sessionId, {
    httpOnly: true, secure: isSecure(), sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 60 * 60,
  })

  return c.json({ onboardingComplete: false })
})

app.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session')

  if (sessionId) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run()
  }

  setCookie(c, 'session', '', {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  })

  return c.body(null, 204)
})

app.post('/reset-request', async (c) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401)

  const now = new Date().toISOString()
  const session = db.select().from(sessions)
    .where(and(eq(sessions.id, sessionId), gte(sessions.expiresAt, now)))
    .get()
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const requestingUser = db.select({ role: users.role }).from(users)
    .where(eq(users.id, session.userId)).get()
  if (!requestingUser || requestingUser.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = resetRequestSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const email = parsed.data.email.toLowerCase().trim()

  const targetUser = db.select({ id: users.id }).from(users)
    .where(eq(users.email, email)).get()
  if (!targetUser) return c.body(null, 204)

  const resetToken = randomBytes(32).toString('hex')
  const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  db.update(users)
    .set({ resetToken, resetTokenExpiresAt })
    .where(eq(users.id, targetUser.id))
    .run()

  db.delete(sessions).where(eq(sessions.userId, targetUser.id)).run()

  const resetUrl = `${process.env.APP_URL}/reset?token=${resetToken}`
  sendMail({
    to: email,
    subject: 'Password reset',
    html: `<p>Click to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
  }).catch((err: Error) => console.error('[auth] reset email failed:', err))

  return c.body(null, 204)
})

app.post('/reset', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = resetSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const { token, newPassword } = parsed.data
  const now = new Date().toISOString()

  const user = db.select().from(users)
    .where(and(
      eq(users.resetToken, token),
      gte(users.resetTokenExpiresAt, now),
    ))
    .get()
  if (!user) return c.json({ error: 'Reset token invalid or expired' }, 400)

  const passwordHash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })

  db.update(users)
    .set({ passwordHash, resetToken: null, resetTokenExpiresAt: null })
    .where(eq(users.id, user.id))
    .run()

  db.delete(sessions).where(eq(sessions.userId, user.id)).run()

  return c.body(null, 204)
})

export default app
