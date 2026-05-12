import { firefox } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { ServerWebSocket } from 'bun'
import { db } from '../../db/client'
import { userSecrets } from '../../db/schema'
import { encrypt } from '../lib/crypto'

export interface WsData {
  userId: number
  sessionId: string
}

interface LinkedInSession {
  userId: number
  browser: Browser
  context: BrowserContext
  page: Page
  ws: ServerWebSocket<WsData> | null
  timeout: ReturnType<typeof setTimeout>
  screenshotInterval: ReturnType<typeof setInterval> | null
}

const sessions = new Map<string, LinkedInSession>()

export async function createSession(userId: number): Promise<string> {
  for (const [id, s] of sessions) {
    if (s.userId === userId) {
      await closeSession(id)
      break
    }
  }

  const sessionId = crypto.randomUUID()
  const browser = await firefox.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    })
    const page = await context.newPage()

    const timeout = setTimeout(() => { void closeSession(sessionId, 'timeout') }, 5 * 60 * 1000)

    sessions.set(sessionId, { userId, browser, context, page, ws: null, timeout, screenshotInterval: null })

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) void checkUrl(sessionId, frame.url())
    })

    await page.goto('https://www.linkedin.com/login')

    return sessionId
  } catch (err) {
    const session = sessions.get(sessionId)
    if (session) { clearTimeout(session.timeout); sessions.delete(sessionId) }
    try { await browser.close() } catch { }
    throw err
  }
}

async function checkUrl(sessionId: string, url: string): Promise<void> {
  if (!url.includes('/feed') && !url.includes('/in/')) return
  const session = sessions.get(sessionId)
  if (!session) return
  sessions.delete(sessionId)
  clearTimeout(session.timeout)
  if (session.screenshotInterval) clearInterval(session.screenshotInterval)
  try {
    const storageState = await session.context.storageState()
    const ciphertext = encrypt(JSON.stringify(storageState))
    const now = new Date().toISOString()
    db.insert(userSecrets)
      .values({ userId: session.userId, keyName: 'linkedin_storage_state', ciphertext, updatedAt: now })
      .onConflictDoUpdate({
        target: [userSecrets.userId, userSecrets.keyName],
        set: { ciphertext, updatedAt: now },
      })
      .run()
    session.ws?.send(JSON.stringify({ type: 'captured' }))
  } catch (err) {
    console.error('[linkedin-browser] Failed to capture session:', err)
    session.ws?.send(JSON.stringify({ type: 'error' }))
  } finally {
    try { await session.browser.close() } catch { }
    if (session.ws && session.ws.readyState === 1) session.ws.close()
  }
}

async function closeSession(sessionId: string, reason?: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  clearTimeout(session.timeout)
  if (session.screenshotInterval) clearInterval(session.screenshotInterval)
  sessions.delete(sessionId)
  if (reason === 'timeout') session.ws?.send(JSON.stringify({ type: 'timeout' }))
  try { await session.browser.close() } catch { }
  if (session.ws && session.ws.readyState === 1) session.ws.close()
}

export function getSession(sessionId: string): LinkedInSession | undefined {
  return sessions.get(sessionId)
}

export async function attachWebSocket(ws: ServerWebSocket<WsData>): Promise<void> {
  const { sessionId } = ws.data
  const session = sessions.get(sessionId)
  if (!session) { ws.close(1008, 'Session not found'); return }
  session.ws = ws
  if (session.screenshotInterval) { clearInterval(session.screenshotInterval); session.screenshotInterval = null }
  try {
    const buf = await session.page.screenshot({ type: 'png' })
    ws.send(buf)
  } catch { }
  session.screenshotInterval = setInterval(() => {
    session.page.screenshot({ type: 'png' })
      .then((buf) => { if (session.ws?.readyState === 1) session.ws.send(buf) })
      .catch(() => { })
  }, 200)
}

export async function handleMessage(ws: ServerWebSocket<WsData>, message: string | Buffer): Promise<void> {
  const session = sessions.get(ws.data.sessionId)
  if (!session) return
  let msg: { type: string; x?: number; y?: number; key?: string }
  try { msg = JSON.parse(typeof message === 'string' ? message : message.toString()) }
  catch { return }
  try {
    if (msg.type === 'click' && msg.x !== undefined && msg.y !== undefined) {
      await session.page.mouse.click(msg.x, msg.y)
    } else if (msg.type === 'keydown' && msg.key) {
      await session.page.keyboard.press(msg.key)
    } else if (msg.type === 'cancel') {
      await closeSession(ws.data.sessionId)
    }
  } catch { }
}

export function handleClose(ws: ServerWebSocket<WsData>): void {
  const session = sessions.get(ws.data.sessionId)
  if (!session) return
  if (session.screenshotInterval) { clearInterval(session.screenshotInterval); session.screenshotInterval = null }
  session.ws = null
}

export async function cancelSession(sessionId: string): Promise<boolean> {
  if (!sessions.has(sessionId)) return false
  await closeSession(sessionId)
  return true
}

export async function closeAllSessions(): Promise<void> {
  await Promise.all([...sessions.keys()].map((id) => closeSession(id)))
}
