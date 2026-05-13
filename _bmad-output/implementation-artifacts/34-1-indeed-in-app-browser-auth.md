# Story 34.1: Indeed In-App Browser Authentication

Status: done

## Story

As a user,
I want to connect Indeed from Config > Connections by signing in through an in-app browser,
so that I don't need to run any local scripts or upload session files.

## Acceptance Criteria

1. Given a user clicks "Connect Indeed" in Config > Connections, when the button is clicked, then a modal opens showing a live Firefox browser navigated to `https://www.indeed.com`, and the server has started an Indeed browser session via `POST /api/onboarding/indeed/browser`.

2. Given the browser modal is open and the user has solved any Cloudflare challenge on indeed.com, when the user clicks "Save Session", then the client sends `{ type: 'save' }` over the WebSocket, the server captures `context.storageState()`, encrypts it, and upserts it into `user_secrets` under `keyName: 'indeed_storage_state'` for the current user — then sends `{ type: 'captured' }` back over the WebSocket.

3. Given the server sends `{ type: 'captured' }`, when the client receives it, then the modal closes, `toast.success('Indeed connected')` is shown, and `queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })` is called — updating the Indeed row to "Connected" (emerald).

4. Given an Indeed browser session exists and the user clicks the X on the modal or the session times out after 5 minutes, when the session ends, then the Playwright browser is closed and the session is removed from the in-memory map — same as LinkedIn.

5. Given an Indeed browser session, when `DELETE /api/onboarding/indeed/browser/:id` is called by the session owner, then the session is cancelled and `{ ok: true }` is returned. If the session doesn't exist or belongs to a different user, `404` is returned.

6. Given `index.ts` now handles two browser session services, when a WebSocket message arrives, then it is dispatched to the correct service (LinkedIn or Indeed) based on a `service` field added to `WsData`.

7. Given the UI connection to Indeed has been replaced by the in-app browser, when Config > Connections renders, then the "Upload session" button and hidden file input for Indeed are removed; the Indeed row shows a "Connect Indeed" button that opens the modal — matching the LinkedIn row's UX pattern exactly.

## Tasks / Subtasks

- [x] Task 1 — Server: Indeed browser service (AC: 2, 4, 5)
  - [x] Create `src/server/services/indeed-browser-service.ts` — copy of `linkedin-browser-service.ts` with these changes:
    - Navigate to `https://www.indeed.com` (not LinkedIn login)
    - `keyName` → `'indeed_storage_state'` (not `'linkedin_storage_state'`)
    - `checkUrl` replaced with `handleSave` — capture is triggered by explicit `save` message, not URL navigation
    - In `handleMessage`: add handling for `msg.type === 'save'` → call `handleSave(ws.data.sessionId)`
    - Remove `framenavigated` listener (not needed — no URL-based capture trigger)
    - All exported function names: `createSession`, `cancelSession`, `getSession`, `attachWebSocket`, `handleMessage`, `handleClose`, `closeAllSessions` (identical names — matches LinkedIn pattern)

- [x] Task 2 — Server: Indeed browser route (AC: 1, 5)
  - [x] Create `src/server/routes/api-indeed-browser.ts` — exact copy of `api-linkedin-browser.ts` but imports from `'../services/indeed-browser-service'`

- [x] Task 3 — Server: Wire up in index.ts (AC: 1, 6)
  - [x] Import `indeedBrowserRoute` and `* as indeedBrowserService` from the new files
  - [x] Mount route: `app.route('/api/onboarding/indeed/browser', indeedBrowserRoute)` (within auth middleware block)
  - [x] Update `WsData` type: add `service: 'linkedin' | 'indeed'` field — defined locally in `index.ts`
  - [x] Add indeed WS URL pattern: `/^\/api\/onboarding\/indeed\/browser\/([^/]+)\/ws$/` alongside the LinkedIn pattern; set `data: { userId, sessionId, service: 'indeed' }`
  - [x] Update LinkedIn WS upgrade block to also set `service: 'linkedin'` in data
  - [x] Update WebSocket handlers to dispatch by `ws.data.service`
  - [x] Add `indeedBrowserService.closeAllSessions()` to the graceful shutdown signal handlers alongside LinkedIn

- [x] Task 4 — Client: Indeed browser session hook (AC: 1, 2, 3, 4)
  - [x] Create `src/client/hooks/useIndeedBrowserSession.ts` — copy of `useLinkedinBrowserSession.ts` with these URL changes:
    - `POST /api/onboarding/linkedin/browser` → `POST /api/onboarding/indeed/browser`
    - WS URL: `/api/onboarding/indeed/browser/${sessionId}/ws`
  - [x] Add a `saveSession` function that sends `ws.send(JSON.stringify({ type: 'save' }))` — exported in the return value alongside `sendClick`, `sendKey`, `sendCancel`
  - [x] Export type `IndeedBrowserSession` (same shape as `LinkedInBrowserSession` but with `saveSession: () => void` added)

- [x] Task 5 — Client: Indeed browser modal (AC: 2, 3, 4, 7)
  - [x] Create `src/client/components/indeed/IndeedBrowserModal.tsx` — copy of `LinkedInBrowserModal.tsx` with:
    - Title: "Connect to Indeed"
    - Add instruction text below the title (before the canvas): `<p className="text-sm text-zinc-400 px-4 pb-2">Solve the Cloudflare challenge, then click Save Session.</p>`
    - Accept `saveSession: () => void` prop; add "Save Session" Button below the canvas when `status === 'active'`
    - Import from `@/hooks/useIndeedBrowserSession` for the `SessionStatus` and `FrameCallback` types
  - [x] Include `sendClick` and `sendKey` props for click/keyboard forwarding (per Dev Notes)

- [x] Task 6 — Client: Update ConnectionsCard (AC: 7)
  - [x] In `src/client/routes/config.tsx`, in `ConnectionsCard`:
    - Import `useIndeedBrowserSession` from `@/hooks/useIndeedBrowserSession`
    - Import `IndeedBrowserModal` from `@/components/indeed/IndeedBrowserModal`
    - Add `const { status: indeedSessionStatus, error: indeedError, startSession: startIndeedSession, saveSession, sendClick: sendIndeedClick, sendKey: sendIndeedKey, sendCancel: sendIndeedCancel, onFrameRef: indeedOnFrameRef } = useIndeedBrowserSession()`
    - Add `const [indeedModalOpen, setIndeedModalOpen] = useState(false)`
    - Add `useEffect` for `indeedSessionStatus === 'captured'` → close modal, toast, invalidate (same pattern as LinkedIn useEffect)
    - Removed `indeedUploadMutation`, `handleIndeedUpload`, `indeedFileRef`, `<input type="file">`. Replaced "Upload session" `<Button>` with "Connect Indeed" `<Button>`
    - Add `<IndeedBrowserModal>` below `<LinkedInBrowserModal>`, passing all props
    - Keep `isIndeedConnected = status?.hasIndeedAuth ?? false` and the Connected/Not connected chip unchanged

- [x] Task 7 — Tests: Indeed browser route tests (AC: 1, 5)
  - [x] Create `src/server/routes/api-indeed-browser.test.ts` — copy of `api-linkedin-browser.test.ts` with:
    - Mock `playwright` with `firefox` key (not `chromium`): `mock.module('playwright', () => ({ firefox: { launch: mock(async () => mockBrowser) } }))`
    - Import `app` from `./api-indeed-browser`
    - Test `POST /` → 200 with sessionId
    - Test `DELETE /:id` → 200 ok for owner, 404 for different user, 404 for nonexistent

## Dev Notes

### Pattern Reference

This story directly mirrors Epic 30 (LinkedIn In-App Browser). Key reference files:
- `src/server/services/linkedin-browser-service.ts` — full server service to copy and adapt
- `src/server/routes/api-linkedin-browser.ts` — route to copy
- `src/client/hooks/useLinkedinBrowserSession.ts` — hook to copy and extend
- `src/client/components/linkedin/LinkedInBrowserModal.tsx` — modal to copy and adapt
- `src/index.ts` lines 24–26 (imports), 95 (route mount), 113–118 (shutdown), 148–176 (WS wiring) — all need extending

### WsData Type Change in index.ts

The current `WsData` is `{ userId: number; sessionId: string }` exported from `linkedin-browser-service.ts`. Adding `service` to it requires either:
1. Defining `WsData` locally in `index.ts` as `{ userId: number; sessionId: string; service: 'linkedin' | 'indeed' }` and removing the import of `WsData` from `linkedin-browser-service.ts`, or
2. Exporting an extended type from a shared location

Option 1 is simpler — define it locally in `index.ts` and remove `import type { WsData } from './server/services/linkedin-browser-service'`.

The `linkedin-browser-service.ts` and `indeed-browser-service.ts` both export `WsData` for their own internal use — they can define their own local type without the `service` field since they don't need it.

### Capture Trigger: Explicit Save Button

LinkedIn uses URL-based capture detection (navigated to `/feed` = logged in). Indeed does not require login — the goal is to capture Cloudflare-cleared cookies. Cloudflare keeps the URL identical during the challenge, so URL-based detection is not reliable.

**Design: explicit save button.** The user solves the Cloudflare challenge in the modal, sees indeed.com render normally, then clicks "Save Session". The client sends `{ type: 'save' }` over the WebSocket. The server's `handleMessage` catches this and calls a `handleSave` function that:
1. Removes the session from the map (prevents double-save)
2. Clears the timeout
3. Clears the screenshot interval
4. Calls `session.context.storageState()`
5. Encrypts and upserts to `user_secrets`
6. Sends `{ type: 'captured' }` back
7. Closes the browser

```typescript
async function handleSave(sessionId: string, ws: ServerWebSocket<WsData>): Promise<void> {
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
```

### Mouse/Keyboard Forwarding in Modal

The LinkedIn modal forwards mouse clicks and keypresses into the remote browser (useful for typing username/password). For Indeed, the user needs to solve a Cloudflare challenge which may involve clicking a checkbox or CAPTCHA. **Include click and key forwarding** — add `sendClick` and `sendKey` props to `IndeedBrowserModal` and wire them up the same way as `LinkedInBrowserModal`. The `saveSession` prop is the new addition.

### File Structure

New files:
- `src/server/services/indeed-browser-service.ts`
- `src/server/routes/api-indeed-browser.ts`
- `src/server/routes/api-indeed-browser.test.ts`
- `src/client/hooks/useIndeedBrowserSession.ts`
- `src/client/components/indeed/IndeedBrowserModal.tsx`

Modified files:
- `src/index.ts`
- `src/client/routes/config.tsx`

### Test Mock: `firefox` Not `chromium`

The `linkedin-browser-service.ts` test mocks `playwright` with `{ chromium: ... }` — this is a pre-existing bug (the service uses `firefox`, not chromium; the mock works coincidentally or is not testing the Playwright layer at all). For `api-indeed-browser.test.ts`, mock with `firefox` explicitly:
```typescript
mock.module('playwright', () => ({
  firefox: { launch: mock(async () => mockBrowser) },
}))
```
This will properly cover the `firefox.launch()` call in `indeed-browser-service.ts`.

### Session Timeout

5 minutes (same as LinkedIn): `setTimeout(() => { void closeSession(sessionId, 'timeout') }, 5 * 60 * 1000)`

### No Migration Needed

`indeed_storage_state` key already stored in `user_secrets` by story 33.1. `GET /api/onboarding/status` already returns `hasIndeedAuth`. No schema or API changes beyond the new browser session endpoints.

### Shutdown Handlers Pattern

In `index.ts`, graceful shutdown currently does:
```typescript
linkedInBrowserService.closeAllSessions().finally(() => process.exit(0))
```
Update to close both:
```typescript
Promise.all([
  linkedInBrowserService.closeAllSessions(),
  indeedBrowserService.closeAllSessions(),
]).finally(() => process.exit(0))
```
Apply to both `SIGTERM` and `SIGINT` handlers.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward; all tests passed first run.

### Completion Notes List

- Created `indeed-browser-service.ts` mirroring LinkedIn service; key difference: no `framenavigated` listener, replaced URL-based capture with explicit `handleSave(sessionId, ws)` triggered by `msg.type === 'save'`
- `WsData` defined locally in `index.ts` with `service: 'linkedin' | 'indeed'` field; removed `import type { WsData }` from LinkedIn service
- WebSocket upgrade and dispatch in `index.ts` branched on `ws.data.service`; shutdown handlers updated to `Promise.all([linkedin, indeed].closeAllSessions())`
- `useIndeedBrowserSession` hook adds `saveSession()` that sends `{ type: 'save' }` over WebSocket
- `IndeedBrowserModal` includes instruction text, "Save Session" button, and full click/key forwarding (per Dev Notes)
- `ConnectionsCard` in `config.tsx`: removed `indeedUploadMutation`, `handleIndeedUpload`, `indeedFileRef`; added Indeed browser session hook and modal
- 4 new tests pass; 350 total tests pass with no regressions introduced (9 failures are pre-existing)

### File List

- `src/server/services/indeed-browser-service.ts` (new)
- `src/server/routes/api-indeed-browser.ts` (new)
- `src/server/routes/api-indeed-browser.test.ts` (new)
- `src/client/hooks/useIndeedBrowserSession.ts` (new)
- `src/client/components/indeed/IndeedBrowserModal.tsx` (new)
- `src/index.ts` (modified)
- `src/client/routes/config.tsx` (modified)

### Review Findings

- [x] [Review][Decision] Empty storageState saved without validation — Fixed: validate `cookies.length > 0` in `handleSave`; send error message if empty — User can click "Save Session" before solving the Cloudflare challenge, upsetting potentially valid existing `indeed_storage_state` cookies with an empty set. `handleSave` calls `storageState()` and encrypts whatever is returned with no guard. Options: (a) validate `storageState.cookies.length > 0` and send error if empty; (b) validate for a specific indeed.com cookie presence; (c) leave as-is per spec (user is instructed to solve first). [indeed-browser-service.ts]
- [x] [Review][Defer] Old WS `onclose` can corrupt new session status on rapid reconnect — If `sendCancel()` is called and user immediately clicks Connect Again, the old WebSocket's `onclose` fires asynchronously after `terminalRef.current` was reset to `false`, overwriting the new session's `loading` status with `error`. Pre-existing in `useLinkedinBrowserSession`; carried forward. [useIndeedBrowserSession.ts]
- [x] [Review][Defer] `WsData` interface duplicated across service files — `indeed-browser-service.ts` exports its own `WsData { userId, sessionId }` while `index.ts` defines the wider `WsData { userId, sessionId, service }`. Pre-existing pattern from LinkedIn service. [indeed-browser-service.ts, index.ts]
- [x] [Review][Defer] `handleSave` WS confirmation silently lost if socket closes mid-save — DB write succeeds but `ws.send(captured)` throws if the client has already closed the WS; outer catch in `handleMessage` swallows it. Data integrity preserved; client gets no success confirmation. Pre-existing pattern in LinkedIn service. [indeed-browser-service.ts]
- [x] [Review][Defer] Canvas interactive surface has no accessible label — `<canvas>` in `IndeedBrowserModal` captures keyboard/mouse events but has no `aria-label` or role. Pre-existing in `LinkedInBrowserModal`. [IndeedBrowserModal.tsx]
- [x] [Review][Defer] Browser session hook and service are near-duplicate of LinkedIn equivalents — No shared abstraction. Technical debt that compounds if more scraper sources are added. Architectural, pre-existing pattern. [useIndeedBrowserSession.ts, indeed-browser-service.ts]

## Change Log

- 2026-05-13: Story created — Indeed in-app browser auth replacing file-upload UX from story 33.1
- 2026-05-13: Implementation complete — all 7 tasks done; 5 new files created, 2 modified; 4 new tests pass
- 2026-05-13: Code review complete — 1 decision-needed, 0 patch, 5 deferred, 15 dismissed
