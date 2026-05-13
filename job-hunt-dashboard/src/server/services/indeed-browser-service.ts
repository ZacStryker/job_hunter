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

interface IndeedSession {
  userId: number
  browser: Browser
  context: BrowserContext
  page: Page
  ws: ServerWebSocket<WsData> | null
  timeout: ReturnType<typeof setTimeout>
  screenshotInterval: ReturnType<typeof setInterval> | null
}

const sessions = new Map<string, IndeedSession>()

export async function createSession(userId: number): Promise<string> {
  for (const [id, s] of sessions) {
    if (s.userId === userId) {
      await closeSession(id)
      break
    }
  }

  const sessionId = crypto.randomUUID()
  const browser = await firefox.launch({ headless: false })
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    })
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })
    const page = await context.newPage()

    const timeout = setTimeout(() => { void closeSession(sessionId, 'timeout') }, 5 * 60 * 1000)

    sessions.set(sessionId, { userId, browser, context, page, ws: null, timeout, screenshotInterval: null })

    await page.goto('https://www.indeed.com', { waitUntil: 'commit' })

    return sessionId
  } catch (err) {
    const session = sessions.get(sessionId)
    if (session) { clearTimeout(session.timeout); sessions.delete(sessionId) }
    try { await browser.close() } catch { }
    throw err
  }
}

async function handleSave(sessionId: string, ws: ServerWebSocket<WsData>): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  sessions.delete(sessionId)
  clearTimeout(session.timeout)
  if (session.screenshotInterval) clearInterval(session.screenshotInterval)
  try {
    const storageState = await session.context.storageState()
    if (storageState.cookies.length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'No cookies captured — please solve the Cloudflare challenge first' }))
      return
    }
    const ciphertext = encrypt(JSON.stringify(storageState))
    const now = new Date().toISOString()
    db.insert(userSecrets)
      .values({ userId: session.userId, keyName: 'indeed_storage_state', ciphertext, updatedAt: now })
      .onConflictDoUpdate({
        target: [userSecrets.userId, userSecrets.keyName],
        set: { ciphertext, updatedAt: now },
      })
      .run()
    ws.send(JSON.stringify({ type: 'captured' }))
  } catch (err) {
    console.error('[indeed-browser] Failed to capture session:', err)
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to save session' }))
  } finally {
    try { await session.browser.close() } catch { }
    if (ws.readyState === 1) ws.close()
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

export function getSession(sessionId: string): IndeedSession | undefined {
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
  } catch (err) { console.error('[indeed-browser] initial screenshot error:', err) }
  session.screenshotInterval = setInterval(() => {
    session.page.screenshot({ type: 'png' })
      .then((buf) => {
        if (session.ws?.readyState === 1) session.ws.send(buf)
      })
      .catch((err) => { console.error('[indeed-browser] interval screenshot error:', err) })
  }, 200)
}

export async function handleMessage(ws: ServerWebSocket<WsData>, message: string | Buffer): Promise<void> {
  const session = sessions.get(ws.data.sessionId)
  if (!session) return
  let msg: { type: string; x?: number; y?: number; key?: string }
  try { msg = JSON.parse(typeof message === 'string' ? message : message.toString()) }
  catch { return }
  try {
    if (msg.type === 'save') {
      await handleSave(ws.data.sessionId, ws)
    } else if (msg.type === 'click' && msg.x !== undefined && msg.y !== undefined) {
      await session.page.mouse.move(msg.x, msg.y)
      await session.page.mouse.click(msg.x, msg.y)
    } else if (msg.type === 'solve-challenge') {
      console.log('[indeed-browser] solve-challenge — page url:', session.page.url())
      const html = await session.page.content()
      console.log('[indeed-browser] main frame HTML (first 3000):', html.slice(0, 3000))
      const canvasCount = await session.page.locator('canvas').count()
      console.log('[indeed-browser] canvas elements in main frame:', canvasCount)
      if (canvasCount > 0) {
        const box = await session.page.locator('canvas').first().boundingBox()
        console.log('[indeed-browser] canvas bounds:', box)
        if (box) {
          await session.page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.5)
          console.log('[indeed-browser] clicked canvas at checkbox position')
        }
      } else {
        await session.page.locator('input[type="checkbox"], [role="checkbox"]').first().click({ timeout: 2000 })
          .catch((err) => { console.log('[indeed-browser] main frame click failed:', err) })
      }
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
