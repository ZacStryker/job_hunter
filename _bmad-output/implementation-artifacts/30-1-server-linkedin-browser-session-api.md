# Story 30.1: Server — LinkedIn Browser Session API

Status: done

## Story

As the server,
I want to spawn, stream, and manage a per-user Playwright browser session over WebSocket,
so that users can log into LinkedIn from within the app without any local software.

## Acceptance Criteria

1. **Given** an authenticated user calls `POST /api/onboarding/linkedin/browser`, **When** the server receives the request, **Then** a headless Playwright Chromium browser launches with a 960×1200 viewport and navigates to `https://www.linkedin.com/login`; **And** a unique `sessionId` is generated and the session stored in-memory, keyed to the authenticated `userId`; **And** any existing active session for this user is closed and cleaned up first; **And** a 5-minute auto-close timeout is set for the new session; **And** response is `200 { sessionId: string }`.

2. **Given** a client connects to `WS /api/onboarding/linkedin/browser/:sessionId/ws`, **When** the `sessionId` exists and belongs to the authenticated user, **Then** the server immediately sends the current page screenshot as a binary PNG frame; **And** continues pushing screenshot frames at up to 5fps (200ms interval) while the session is active; **And** if the `sessionId` does not belong to the authenticated user, the WS upgrade is rejected with HTTP 403.

3. **Given** the client sends `{ type: 'click', x: number, y: number }` over the WebSocket (coordinates in 960×1200 viewport space), **When** the server receives the message, **Then** `page.mouse.click(x, y)` is called in Playwright.

4. **Given** the client sends `{ type: 'keydown', key: string }` over the WebSocket, **When** the server receives the message, **Then** `page.keyboard.press(key)` is called in Playwright.

5. **Given** a page navigation event fires after any user action, **When** the resulting URL does not contain `/login` or `/checkpoint`, **Then** the server calls `context.storageState()`, encrypts the result via `encrypt()`, and upserts it in `user_secrets` with `key_name: 'linkedin_storage_state'`; **And** sends `{ type: 'captured' }` over the WebSocket; **And** closes the browser and removes the session from memory.

6. **Given** a session has been active for 5 minutes without a `captured` event, **When** the timeout fires, **Then** the browser is closed and the session removed from memory; **And** any connected WebSocket client receives `{ type: 'timeout' }` before the connection closes.

7. **Given** the client sends `{ type: 'cancel' }` over the WebSocket, or calls `DELETE /api/onboarding/linkedin/browser/:sessionId`, **When** the server receives the request, **Then** the browser is closed, session removed, and WebSocket connection closed cleanly.

8. **Given** any unhandled error occurs during Playwright operations, **When** the error is caught, **Then** `browser.close()` is always called in a `finally` block and the session is removed from memory.

## Tasks / Subtasks

- [x] Create `src/server/services/linkedin-browser-service.ts` (AC: 1–8)
  - [x] Define `WsData` interface (exported): `{ userId: number, sessionId: string }`
  - [x] Define `LinkedInSession` interface: `{ userId, browser, context, page, ws, timeout, screenshotInterval }`
  - [x] Module-level `Map<string, LinkedInSession>` named `sessions`
  - [x] `createSession(userId)` — close existing user session, launch Chromium headless 960×1200, navigate to LinkedIn login, set 5min timeout, store in Map, register `framenavigated` listener
  - [x] `checkUrl(sessionId, url)` — if not login/checkpoint: `context.storageState()` → `encrypt(JSON.stringify(...))` → upsert `user_secrets`, send `{ type: 'captured' }`, call `closeSession`
  - [x] `closeSession(sessionId, reason?)` — clearTimeout + clearInterval, send `{ type: 'timeout' }` if reason=timeout, delete from Map, `browser.close()` in try/finally
  - [x] `attachWebSocket(ws)` — set `session.ws`, start screenshot interval (200ms), send initial screenshot
  - [x] `handleMessage(ws, message)` — parse JSON, handle click/keydown/cancel
  - [x] `handleClose(ws)` — clear screenshotInterval, set `session.ws = null`
  - [x] `cancelSession(sessionId)` — close session, return boolean
  - [x] Export `getSession(sessionId)` for use in route and index.ts
  - [x] Export `closeAllSessions()` for SIGTERM/SIGINT cleanup

- [x] Create `src/server/routes/api-linkedin-browser.ts` (AC: 1, 7)
  - [x] `POST /` — get userId from ctx, call `createSession(userId)`, return `{ sessionId }`
  - [x] `DELETE /:sessionId` — verify session exists and belongs to userId, call `cancelSession`, return `{ ok: true }`; 404 if session not found or not owned by user

- [x] Modify `src/index.ts` — add WS support and register route (AC: 2)
  - [x] Import `linkedInBrowserRoute` from `./server/routes/api-linkedin-browser`
  - [x] Import `* as linkedInBrowserService` and `WsData` from `./server/services/linkedin-browser-service`
  - [x] Import `sessions` from `./db/schema` (DB sessions table, not the in-memory Map)
  - [x] Import `and, eq, gte` from `drizzle-orm` (for manual session auth in WS upgrade)
  - [x] Register: `app.route('/api/onboarding/linkedin/browser', linkedInBrowserRoute)` — BEFORE `app.route('/api/onboarding', onboardingRoute)` to avoid potential routing conflicts
  - [x] Add inline `getSessionUserId(req)` helper: parse `session` cookie, query DB sessions table (respecting impersonation from `session.data`), return userId or null — mirrors auth-middleware logic
  - [x] Change export from `fetch: app.fetch` to a custom `fetch(req, server)` function that: intercepts paths matching `/api/onboarding/linkedin/browser/:sessionId/ws`, validates auth, checks session ownership, calls `server.upgrade(req, { data: { userId, sessionId } })`, returns `undefined` on success or `new Response('...', { status: N })` on failure; all other requests fall through to `app.fetch(req, server)`
  - [x] Add `websocket` object to export: `{ open(ws) { void linkedInBrowserService.attachWebSocket(ws) }, message(ws, msg) { void linkedInBrowserService.handleMessage(ws, msg) }, close(ws) { void linkedInBrowserService.handleClose(ws) } }`
  - [x] Update SIGTERM/SIGINT handlers to call `linkedInBrowserService.closeAllSessions()`

- [x] Add HTTP contract tests `src/server/routes/api-linkedin-browser.test.ts` (AC: 1, 7)
  - [x] Mock Playwright (`chromium.launch`) at top of file before any production imports
  - [x] `POST /` with valid auth → 200 `{ sessionId: string }`
  - [x] `DELETE /:sessionId` with valid session → 200 `{ ok: true }`
  - [x] `DELETE /:sessionId` where session belongs to different user → 404

## Dev Notes

### Critical: Bun WebSocket Pattern (No Existing Examples in Codebase)

This story introduces the first WebSocket usage in the project. Bun's native WS requires modifying the server export in `src/index.ts`.

**Current export structure:**
```ts
export default {
  port,
  hostname: ...,
  fetch: app.fetch,   // ← must become a custom function
  idleTimeout: 120,
}
```

**Required export structure:**
```ts
import type { Server, ServerWebSocket } from 'bun'
import * as linkedInBrowserService from './server/services/linkedin-browser-service'
import type { WsData } from './server/services/linkedin-browser-service'

export default {
  port,
  hostname: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
  fetch(req: Request, server: Server) {
    const url = new URL(req.url)
    const wsMatch = url.pathname.match(
      /^\/api\/onboarding\/linkedin\/browser\/([^/]+)\/ws$/
    )
    if (wsMatch) {
      const sessionId = wsMatch[1]
      const userId = getSessionUserId(req)
      if (!userId) return new Response('Unauthorized', { status: 401 })
      const session = linkedInBrowserService.getSession(sessionId)
      if (!session || session.userId !== userId) {
        return new Response('Forbidden', { status: 403 })
      }
      const upgraded = server.upgrade<WsData>(req, { data: { userId, sessionId } })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 500 })
    }
    return app.fetch(req, server)
  },
  websocket: {
    open(ws: ServerWebSocket<WsData>) {
      void linkedInBrowserService.attachWebSocket(ws)
    },
    message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
      void linkedInBrowserService.handleMessage(ws, message)
    },
    close(ws: ServerWebSocket<WsData>) {
      void linkedInBrowserService.handleClose(ws)
    },
  },
  idleTimeout: 120,
}
```

**Why**: Hono's `app.fetch` is a standard Request→Response function. Bun's WS upgrade needs `server.upgrade(req)` and returns `undefined` (not a Response). We must intercept WS paths before Hono.

### Session Auth in WS Upgrade Handler

The Hono `authMiddleware` does not run on WS upgrade requests because we bypass Hono for those paths. You must replicate auth logic manually in the `getSessionUserId` helper. Mirror `auth-middleware.ts` exactly:

```ts
import { getCookie } from 'hono/cookie'  // ← NOT available here; parse cookie header manually
import { sessions } from './db/schema'   // DB sessions table
import { and, eq, gte } from 'drizzle-orm'

function getSessionUserId(req: Request): number | null {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/)
  if (!match) return null
  const sessionId = decodeURIComponent(match[1])
  const now = new Date().toISOString()
  const session = db.select().from(sessions)
    .where(and(eq(sessions.id, sessionId), gte(sessions.expiresAt, now)))
    .get()
  if (!session) return null
  // Respect impersonation (same as auth-middleware.ts)
  if (session.data) {
    try {
      const data = JSON.parse(session.data) as { impersonating?: number }
      if (Number.isInteger(data.impersonating) && data.impersonating > 0) {
        return data.impersonating
      }
    } catch { /* ignored */ }
  }
  return session.userId
}
```

Import `sessions` from `'./db/schema'` (the DB table, not the linkedin-browser-service Map). `db` is already imported in `src/index.ts`. Add `and, eq, gte` to the existing drizzle-orm import.

### CSRF: Not Required for WS Upgrades

WS upgrade is a GET request. `authMiddleware` only checks CSRF on POST/PUT/PATCH/DELETE. No CSRF token needed for WS connections — the session cookie provides authentication.

### Playwright Import

`playwright` is in `job-hunt-dashboard/package.json` dependencies (`"playwright": "^1.59.1"`). Import directly:

```ts
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
```

**Docker note**: The Dockerfile was updated to install playwright browsers for the scraper. The main app's playwright also needs its browsers installed. In the Dockerfile (or a `postinstall` script), ensure `bunx playwright install chromium` runs for the main app's playwright version. Flag this for review at PR time — it may require a Dockerfile change.

### `linkedin-browser-service.ts` — Full Implementation Pattern

```ts
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { ServerWebSocket } from 'bun'
import { eq, and } from 'drizzle-orm'
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
  // Close any existing session for this user
  for (const [id, s] of sessions) {
    if (s.userId === userId) {
      await closeSession(id)
      break
    }
  }

  const sessionId = crypto.randomUUID()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 960, height: 1200 } })
  const page = await context.newPage()

  const timeout = setTimeout(() => { void closeSession(sessionId, 'timeout') }, 5 * 60 * 1000)

  sessions.set(sessionId, { userId, browser, context, page, ws: null, timeout, screenshotInterval: null })

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) void checkUrl(sessionId, frame.url())
  })

  await page.goto('https://www.linkedin.com/login')

  return sessionId
}

async function checkUrl(sessionId: string, url: string): Promise<void> {
  if (url.includes('/login') || url.includes('/checkpoint')) return
  const session = sessions.get(sessionId)
  if (!session) return
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
  } finally {
    await closeSession(sessionId)
  }
}

async function closeSession(sessionId: string, reason?: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  clearTimeout(session.timeout)
  if (session.screenshotInterval) clearInterval(session.screenshotInterval)
  sessions.delete(sessionId)
  if (reason === 'timeout') session.ws?.send(JSON.stringify({ type: 'timeout' }))
  try { await session.browser.close() } catch { /* ignored */ }
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
  try {
    const buf = await session.page.screenshot({ type: 'png' })
    ws.send(buf)
  } catch { /* page may not be ready yet */ }
  session.screenshotInterval = setInterval(() => {
    session.page.screenshot({ type: 'png' })
      .then((buf) => { if (session.ws?.readyState === 1) session.ws.send(buf) })
      .catch(() => { /* page closed */ })
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
  } catch { /* Playwright op failed — page may be navigating */ }
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
```

### `api-linkedin-browser.ts` — Route File

```ts
import { Hono } from 'hono'
import { createSession, cancelSession, getSession } from '../services/linkedin-browser-service'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.post('/', async (c) => {
  const userId = c.get('userId')
  const sessionId = await createSession(userId)
  return c.json({ sessionId })
})

app.delete('/:sessionId', async (c) => {
  const userId = c.get('userId')
  const sessionId = c.req.param('sessionId')
  const session = getSession(sessionId)
  if (!session || session.userId !== userId) {
    return c.json({ error: 'Session not found' }, 404)
  }
  await cancelSession(sessionId)
  return c.json({ ok: true })
})

export default app
```

### Route Registration Order in `src/index.ts`

Register `linkedInBrowserRoute` at `/api/onboarding/linkedin/browser` BEFORE registering `onboardingRoute` at `/api/onboarding` to avoid any routing ambiguity:

```ts
import linkedInBrowserRoute from './server/routes/api-linkedin-browser'

// Register before onboardingRoute:
app.route('/api/onboarding/linkedin/browser', linkedInBrowserRoute)
app.route('/api/onboarding', onboardingRoute)
```

### `encrypt()` / `user_secrets` Upsert — Exact Pattern

Follow `api-onboarding.ts:86–106` (`PUT /linkedin`) exactly:
```ts
const ciphertext = encrypt(JSON.stringify(storageState))
const now = new Date().toISOString()
db.insert(userSecrets)
  .values({ userId: session.userId, keyName: 'linkedin_storage_state', ciphertext, updatedAt: now })
  .onConflictDoUpdate({
    target: [userSecrets.userId, userSecrets.keyName],
    set: { ciphertext, updatedAt: now },
  })
  .run()
```

`key_name` must be `'linkedin_storage_state'` — same key used by `discovery-service.ts` (`decrypt()` reads from this key).

### Architecture Invariants

- **Secret handling**: `encrypt()` in service is correct. `decrypt()` is never called in this story.
- **User isolation**: `userId` from `ctx.get('userId')` for HTTP routes; from session cookie parse for WS upgrade. Never from request body/params.
- **Error response shape**: `{ error: string }` — never `{ message }`.
- **`console.error`**: Only for genuine server failures (e.g., `storageState()` throwing). NOT for expected states like session not found.

### Testing Pattern

```ts
// api-linkedin-browser.test.ts — mock Playwright FIRST before any app imports
import { mock } from 'bun:test'

const mockPage = {
  goto: mock(async () => {}),
  on: mock(() => {}),
  screenshot: mock(async () => new Uint8Array([1, 2, 3])),
  mouse: { click: mock(async () => {}) },
  keyboard: { press: mock(async () => {}) },
}
const mockContext = {
  newPage: mock(async () => mockPage),
  storageState: mock(async () => ({ cookies: [], origins: [] })),
}
const mockBrowser = {
  newContext: mock(async () => mockContext),
  close: mock(async () => {}),
}
mock.module('playwright', () => ({
  chromium: { launch: mock(async () => mockBrowser) },
}))

// Now import app
process.env.DB_PATH = ':memory:'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
// ... rest of test setup
```

The WS upgrade path (`/:sessionId/ws`) is exercised via `src/index.ts` modifications, not testable via Hono's `app.request()`. Document in test file that WS tests require integration testing.

### TypeScript Strict Mode Notes

- `handleClose` can be synchronous (returns `void`, no async ops). Do not make it `async` unless needed — Bun's WS `close` handler is synchronous.
- Empty catch blocks: use `catch { }` (no typed param) per project convention.
- `ServerWebSocket.readyState === 1` checks for OPEN state before sending.

### Files to Create/Modify

**Create:**
- `job-hunt-dashboard/src/server/services/linkedin-browser-service.ts`
- `job-hunt-dashboard/src/server/routes/api-linkedin-browser.ts`
- `job-hunt-dashboard/src/server/routes/api-linkedin-browser.test.ts`

**Modify:**
- `job-hunt-dashboard/src/index.ts` — custom fetch, websocket object, route registration, SIGTERM/SIGINT cleanup, new imports

**No schema changes. No new DB migration. No shared types changes.**

### Previous Story Intelligence (Epic 29)

- **`encrypt()` upsert pattern**: `api-onboarding.ts:86–106` (`PUT /linkedin`) is the exact pattern — `key_name: 'linkedin_storage_state'`, upsert with `onConflictDoUpdate`.
- **Catch blocks**: `catch { }` (no typed param) per TypeScript strict mode in this project — seen throughout Epic 29 stories.
- **`console.error` rule**: Do NOT use for expected states like "session not found". Only for genuine server failures.
- **`apiFetch` not needed here**: `apiFetch` is a client-side utility. All code in this story is server-side.
- **No CSRF for GET**: `authMiddleware` only checks CSRF on POST/PUT/PATCH/DELETE (line 19 of auth-middleware.ts). WS upgrade is GET — no CSRF needed.

### References

- `src/index.ts` — main entry; modify this file for WS support and route registration
- `src/server/middleware/auth-middleware.ts` — replicate session cookie auth logic for WS upgrade handler
- `src/server/routes/api-onboarding.ts:86–106` — `encrypt()` / `user_secrets` upsert pattern
- `src/server/services/discovery-service.ts` — shows how Playwright data flows into `user_secrets`
- `src/server/lib/crypto.ts` — `encrypt()` export
- `src/db/schema.ts` — `userSecrets`, `sessions` table definitions
- `src/server/types.ts` — `AppEnv` type for Hono
- Epic 30: `_bmad-output/planning-artifacts/epics/epic-30-linkedin-in-app-browser-authentication.md`
- Story 29.3: `_bmad-output/implementation-artifacts/29-3-api-and-discovery-linkedin-session-storage-and-temp-file.md` — encrypt/upsert pattern

### Review Findings

- [x] [Review][Patch] Invert `checkUrl` URL guard to allowlist — only trigger capture when URL contains `/feed` or `/in/`; current blocklist (`/login`, `/checkpoint`) allows premature capture on intermediate redirect URLs [linkedin-browser-service.ts:52]
- [x] [Review][Patch] Send `{ type: 'error' }` to WS client on capture failure — when `storageState()` or `encrypt()` throws, the `catch` block should send an error frame before `finally` closes the session [linkedin-browser-service.ts:67]
- [x] [Review][Patch] `createSession` no try/finally — browser leaked when Playwright setup fails after `chromium.launch` succeeds (e.g., `context.newPage()` or `page.goto()` throws) [linkedin-browser-service.ts:34–48]
- [x] [Review][Patch] Concurrent `checkUrl` invocations not guarded — multiple `framenavigated` events can each pass the `sessions.get` null check before any call deletes the session, resulting in double `storageState()` saves and double `closeSession` [linkedin-browser-service.ts:51–72]
- [x] [Review][Patch] SIGTERM/SIGINT discard `closeAllSessions()` promise — `void linkedInBrowserService.closeAllSessions()` + immediate `process.exit(0)` kills Chromium child processes before async cleanup resolves [src/index.ts:113,119]
- [x] [Review][Patch] `attachWebSocket` does not clear existing `screenshotInterval` before starting a new one — if called twice on the same session, two intervals run in parallel, doubling screenshot throughput and leaking the first handle [linkedin-browser-service.ts:98]
- [x] [Review][Defer] `handleClose` does not close the browser on WS disconnect — browser runs unattended for up to 5 minutes if the client navigates away; only the timeout cleans it up [linkedin-browser-service.ts:122–127] — deferred, by-design per timeout model
- [x] [Review][Defer] `attachWebSocket` old WS ref not closed/notified when a second WS attaches to the same session — dropped without close frame [linkedin-browser-service.ts:93] — deferred, reconnect scenario edge case
- [x] [Review][Defer] `keydown` passes arbitrary key strings to `page.keyboard.press` without an allowlist — authenticated user can inject arbitrary key combos into their own session [linkedin-browser-service.ts:114] — deferred, self-harm only (auth-gated)
- [x] [Review][Defer] `getSessionUserId` first-match cookie regex — if `Cookie` header contains multiple `session=` values (e.g., crafted request), first match wins and may not be the real session [src/index.ts:128] — deferred, requires client header manipulation

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `server.upgrade<WsData>()` does not accept a generic type arg in Bun's TS types when `Server<WsData>` is already used to type the `server` param — removed the redundant generic from the call site.
- `data.impersonating` narrowed with `Number.isInteger()` guard still resolves as `number | undefined` in strict TS — cast to `number` after guard, matching the same pattern in `auth-middleware.ts`.
- `beforeAll` in test file used `INSERT OR IGNORE` pattern (`onConflictDoNothing()`) to handle shared in-memory DB across test files running in the same Bun process.

### Completion Notes List

- Created `linkedin-browser-service.ts`: full Playwright session lifecycle (create, attach WS, screenshot streaming at 5fps, framenavigated → storage capture → encrypt → upsert, timeout/cancel/close).
- Created `api-linkedin-browser.ts`: `POST /` returns `{ sessionId }`, `DELETE /:id` verifies ownership and cancels; uses `:id` per project route param convention.
- Modified `src/index.ts`: converted `fetch: app.fetch` to custom fetch that intercepts WS upgrade paths before Hono; added `websocket` object; added `getSessionUserId` helper that mirrors `auth-middleware.ts` logic; registered linkedin browser route before onboarding route; SIGTERM/SIGINT call `closeAllSessions()`.
- Created HTTP contract tests: mocked Playwright before any imports, 4 tests covering POST success, DELETE success, DELETE wrong user (404), DELETE non-existent (404). WS upgrade path documented as requiring integration testing.
- Pre-existing TS errors in `auth-middleware.ts`, `api-admin.ts`, `api-auth.ts` are not from this story.
- **Docker note**: `bunx playwright install chromium` may need to run for the main app's playwright in the Dockerfile (separate from the scraper's playwright install). Flagged for PR review.

### File List

- `job-hunt-dashboard/src/server/services/linkedin-browser-service.ts` (created)
- `job-hunt-dashboard/src/server/routes/api-linkedin-browser.ts` (created)
- `job-hunt-dashboard/src/server/routes/api-linkedin-browser.test.ts` (created)
- `job-hunt-dashboard/src/index.ts` (modified)

## Change Log

- 2026-05-07: Implemented story 30.1 — LinkedIn browser session service, HTTP route, Bun WS upgrade handler in index.ts, and HTTP contract tests. All ACs satisfied; 4 tests added, 341 pass in full suite (2 pre-existing failures unrelated to this story).
