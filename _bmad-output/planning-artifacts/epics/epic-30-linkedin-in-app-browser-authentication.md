# Epic 30: LinkedIn In-App Browser Authentication

Users can connect their LinkedIn account entirely within the browser — no local Node.js, no script downloads, no server SSH required. Clicking "Connect LinkedIn" in Config > Connections opens a modal with a live remote browser running on the server. The user logs in to LinkedIn normally; the server detects login completion, captures the session state, encrypts it, and stores it in `user_secrets`. The file upload approach from Epic 29.4 is removed entirely.

**FRs covered:** FR1–FR10 (net-new — replaces Epic 29.4 file-upload flow)
**NFRs addressed:** NFR1 (user session isolation), NFR2 (process cleanup), NFR3 (screenshot rate limit)
**Architecture:** New `linkedin-browser-service.ts` (in-memory session Map, Playwright lifecycle); new WS + REST routes; WebSocket screenshot streaming at ≤5fps; 960×1200 viewport with client-side coordinate mapping; `encrypt()` / `user_secrets` upsert pattern from Epic 29.3
**UX:** Config > Connections card (Epic 17/29.4) — replace file upload with "Connect LinkedIn" button; new `LinkedInBrowserModal` component with canvas screenshot display

---

## Story 30.1: Server — LinkedIn Browser Session API

As the server,
I want to spawn, stream, and manage a per-user Playwright browser session over WebSocket,
so that users can log into LinkedIn from within the app without any local software.

**Acceptance Criteria:**

**Given** an authenticated user calls `POST /api/onboarding/linkedin/browser`
**When** the server receives the request
**Then** a headless Playwright Chromium browser launches with a 960×1200 viewport and navigates to `https://www.linkedin.com/login`
**And** a unique `sessionId` is generated and the session stored in-memory, keyed to the authenticated `userId`
**And** any existing active session for this user is closed and cleaned up first
**And** a 5-minute auto-close timeout is set for the new session
**And** response is `200 { sessionId: string }`

**Given** a client connects to `WS /api/onboarding/linkedin/browser/:sessionId`
**When** the `sessionId` exists and belongs to the authenticated user
**Then** the server immediately sends the current page screenshot as a binary PNG frame
**And** continues pushing screenshot frames at up to 5fps while the session is active
**And** if the `sessionId` does not belong to the authenticated user, the connection is rejected with WS close code 1008

**Given** the client sends `{ type: 'click', x: number, y: number }` over the WebSocket (coordinates in 960×1200 viewport space)
**When** the server receives the message
**Then** `page.mouse.click(x, y)` is called in Playwright

**Given** the client sends `{ type: 'keydown', key: string }` over the WebSocket
**When** the server receives the message
**Then** `page.keyboard.press(key)` is called in Playwright

**Given** a page navigation event fires after any user action
**When** the resulting URL does not contain `/login` or `/checkpoint`
**Then** the server calls `context.storageState()`, encrypts the result via `encrypt()`, and upserts it in `user_secrets` with `key_name: 'linkedin_storage_state'`
**And** sends `{ type: 'captured' }` over the WebSocket
**And** closes the browser and removes the session from memory

**Given** a session has been active for 5 minutes without a `captured` event
**When** the timeout fires
**Then** the browser is closed and the session removed from memory
**And** any connected WebSocket client receives `{ type: 'timeout' }` before the connection closes

**Given** the client sends `{ type: 'cancel' }` over the WebSocket, or calls `DELETE /api/onboarding/linkedin/browser/:sessionId`
**When** the server receives the request
**Then** the browser is closed, session removed, and WebSocket connection closed cleanly

**Given** any unhandled error occurs during Playwright operations
**When** the error is caught
**Then** `browser.close()` is always called in a `finally` block and the session is removed from memory

> **Dev notes:**
> - New service: `src/server/services/linkedin-browser-service.ts` — module-level `Map<string, LinkedInSession>`. `LinkedInSession` interface: `{ userId: number, browser: Browser, context: BrowserContext, page: Page, ws: ServerWebSocket | null, timeout: ReturnType<typeof setTimeout> }`
> - New routes: `src/server/routes/api-linkedin-browser.ts` — `POST /`, `DELETE /:sessionId`, WebSocket upgrade at `/:sessionId/ws`. Register on the Hono app in `src/server/index.ts`.
> - WebSocket pattern: use Bun's native `server.upgrade(req)` approach consistent with the Hono/Bun setup; check existing WS usage in the codebase for the exact pattern.
> - URL detection: `page.on('framenavigated', frame => { if (frame === page.mainFrame()) checkUrl(frame.url()) })`
> - Screenshot loop: `setInterval(() => page.screenshot({ type: 'png' }).then(buf => ws.send(buf)), 200)` — store the interval ID on the session and `clearInterval` on close.
> - Follow `encrypt()` / `user_secrets` upsert pattern from `api-onboarding.ts` exactly (key_name: `'linkedin_storage_state'`).
> - Playwright is already installed as a scraper dependency — import from the same location used by `discovery-service.ts`.

---

## Story 30.2: UI — In-App LinkedIn Browser Modal & ConnectionsCard Update

As a user,
I want to connect LinkedIn by clicking a button that opens a live browser inside the app,
so that I can log in without any local tools or file management.

**Acceptance Criteria:**

**Given** I navigate to Config > Connections
**When** the section renders
**Then** I see the "LinkedIn" row with a "Connect LinkedIn" button and the Connected/Not connected status indicator
**And** there is no file input, Upload button, FileReader logic, or "How to generate linkedin.json" section

**Given** I click "Connect LinkedIn"
**When** `POST /api/onboarding/linkedin/browser` is called
**Then** a modal opens immediately showing "Opening LinkedIn..." with a loading spinner while the browser starts
**And** the "Connect LinkedIn" button is disabled while the modal is open

**Given** the WebSocket connects and the first screenshot frame arrives
**When** the binary PNG frame is received
**Then** the loading spinner is replaced by a `<canvas>` element displaying the current browser screenshot, scaled to fit the modal (480px wide × 600px tall)

**Given** I click anywhere within the browser canvas
**When** the click event fires on the canvas
**Then** the coordinates are translated from canvas display space to 960×1200 viewport space: `x = clickX / canvasWidth * 960`, `y = clickY / canvasHeight * 1200`
**And** `{ type: 'click', x, y }` is sent over the WebSocket

**Given** I type while the modal is open
**When** a `keydown` event fires on the focused canvas
**Then** `{ type: 'keydown', key: e.key }` is sent over the WebSocket

**Given** the server sends `{ type: 'captured' }` over the WebSocket
**When** the UI receives the message
**Then** the modal closes
**And** `toast.success('LinkedIn connected')` is shown
**And** the `['onboarding-status']` query is invalidated so the status indicator updates to "Connected"

**Given** the server sends `{ type: 'timeout' }` over the WebSocket
**When** the UI receives the message
**Then** the modal closes
**And** an `<Alert variant="destructive">` or error toast shows "Session timed out — please try again"

**Given** the modal is open and I click the X button or press Escape
**When** the close action fires
**Then** `{ type: 'cancel' }` is sent over the WebSocket and the modal closes

**Given** `POST /api/onboarding/linkedin/browser` returns a non-ok response
**When** the error occurs
**Then** the modal does not open and an `<Alert variant="destructive">` displays the error in ConnectionsCard

**Given** story 30.2 is complete
**Then** `job-hunt-dashboard/scripts/generate-linkedin-auth.js` is deleted
**And** `job-hunt-dashboard/src/client/hooks/useLinkedinAuthMutation.ts` is deleted

> **Dev notes:**
> - New hook: `src/client/hooks/useLinkedinBrowserSession.ts` — manages `POST /browser` + WebSocket lifecycle. Exposes `{ status, startSession, sendClick, sendKey, sendCancel }` where `status: 'idle' | 'loading' | 'active' | 'captured' | 'timeout' | 'error'`. Draw frames onto canvas via `createImageBitmap(new Blob([frame], { type: 'image/png' }))`.
> - New component: `src/client/components/linkedin/LinkedInBrowserModal.tsx` — shadcn `<Dialog>` containing the `<canvas tabIndex={0}>`. Handle `onMouseDown` for click coords, `onKeyDown` for key forwarding. Canvas dimensions: 480×600 CSS px. Coordinate mapping: `x = e.nativeEvent.offsetX / canvasEl.clientWidth * 960`.
> - Modify `src/client/routes/config.tsx` — remove file upload elements from `ConnectionsCard`; replace with "Connect LinkedIn" `<Button>` that calls `startSession()` and opens the modal. Keep `useOnboardingStatusQuery` and status indicator unchanged.
> - `PUT /api/onboarding/linkedin` server route stays — remove only the client-side hook (`useLinkedinAuthMutation.ts`), not the server endpoint.
> - Delete `job-hunt-dashboard/scripts/generate-linkedin-auth.js` and `job-hunt-dashboard/src/client/hooks/useLinkedinAuthMutation.ts`.

---
