# Story 30.2: UI — In-App LinkedIn Browser Modal & ConnectionsCard Update

Status: done

## Story

As a user,
I want to connect LinkedIn by clicking a button that opens a live browser inside the app,
so that I can log in without any local tools or file management.

## Acceptance Criteria

1. **Given** I navigate to Config > Connections, **When** the section renders, **Then** I see the "LinkedIn" row with a "Connect LinkedIn" button and the Connected/Not connected status indicator; **And** there is no file input, Upload button, FileReader logic, or "How to generate linkedin.json" section.

2. **Given** I click "Connect LinkedIn", **When** `POST /api/onboarding/linkedin/browser` is called, **Then** a modal opens immediately showing "Opening LinkedIn..." with a loading spinner while the browser starts; **And** the "Connect LinkedIn" button is disabled while the modal is open.

3. **Given** the WebSocket connects and the first screenshot frame arrives, **When** the binary PNG frame is received, **Then** the loading spinner is replaced by a `<canvas>` element displaying the current browser screenshot, scaled to fit the modal (480px wide × 600px tall).

4. **Given** I click anywhere within the browser canvas, **When** the click event fires on the canvas, **Then** the coordinates are translated from canvas display space to 960×1200 viewport space: `x = clickX / canvasWidth * 960`, `y = clickY / canvasHeight * 1200`; **And** `{ type: 'click', x, y }` is sent over the WebSocket.

5. **Given** I type while the modal is open, **When** a `keydown` event fires on the focused canvas, **Then** `{ type: 'keydown', key: e.key }` is sent over the WebSocket.

6. **Given** the server sends `{ type: 'captured' }` over the WebSocket, **When** the UI receives the message, **Then** the modal closes; **And** `toast.success('LinkedIn connected')` is shown; **And** the `['onboarding-status']` query is invalidated so the status indicator updates to "Connected".

7. **Given** the server sends `{ type: 'timeout' }` over the WebSocket, **When** the UI receives the message, **Then** the modal closes; **And** an `<Alert variant="destructive">` or error toast shows "Session timed out — please try again".

8. **Given** the modal is open and I click the X button or press Escape, **When** the close action fires, **Then** `{ type: 'cancel' }` is sent over the WebSocket and the modal closes.

9. **Given** `POST /api/onboarding/linkedin/browser` returns a non-ok response, **When** the error occurs, **Then** the modal does not open and an `<Alert variant="destructive">` displays the error in ConnectionsCard.

10. **Given** story 30.2 is complete, **Then** `job-hunt-dashboard/scripts/generate-linkedin-auth.js` is deleted; **And** `job-hunt-dashboard/src/client/hooks/useLinkedinAuthMutation.ts` is deleted.

## Tasks / Subtasks

- [x] Add `ws: true` to Vite proxy config (AC: 3)
  - [x] In `vite.config.ts`, add `ws: true` to the `/api` proxy entry so WebSocket connections are forwarded to `:3001` in dev

- [x] Create `src/client/hooks/useLinkedinBrowserSession.ts` (AC: 2–9)
  - [x] Define `type SessionStatus = 'idle' | 'loading' | 'active' | 'captured' | 'timeout' | 'error'`
  - [x] Define hook return type: `{ status: SessionStatus, error: string | null, startSession: () => void, sendClick: (x: number, y: number) => void, sendKey: (key: string) => void, sendCancel: () => void }`
  - [x] `startSession()`: call `POST /api/onboarding/linkedin/browser` via `apiFetch`, set status to `'loading'`; on response get `sessionId`, construct WS URL, open WebSocket; on POST error set status `'error'` with message
  - [x] WS URL construction: `const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'`; URL = `` `${proto}//${window.location.host}/api/onboarding/linkedin/browser/${sessionId}/ws` ``
  - [x] On WS `message` (binary frame): set status to `'active'`, store frame in a ref or callback for canvas rendering
  - [x] On WS `message` (JSON string): parse `{ type }`, handle `'captured'` → set status `'captured'`, handle `'timeout'` → set status `'timeout'`, handle `'error'` → set status `'error'` with message
  - [x] On WS `error` / `close` unexpectedly: if not already captured/timeout, set status `'error'` with message
  - [x] `sendClick(x, y)`: `ws.send(JSON.stringify({ type: 'click', x, y }))` — only if `ws.readyState === WebSocket.OPEN`
  - [x] `sendKey(key)`: `ws.send(JSON.stringify({ type: 'keydown', key }))` — only if open
  - [x] `sendCancel()`: send `{ type: 'cancel' }`, close WS, set status `'idle'`
  - [x] `useEffect` cleanup: on unmount, if WS open send cancel and close (prevent browser leak on component unmount)
  - [x] Expose `onFrame` callback ref so the modal canvas can subscribe to raw PNG frames

- [x] Create `src/client/components/linkedin/LinkedInBrowserModal.tsx` (AC: 2–9)
  - [x] Use shadcn `<Dialog open={isOpen} onOpenChange={handleOpenChange}>` — import from `@/components/ui/dialog`
  - [x] `handleOpenChange(open)`: when open=false (Escape or X), call `sendCancel()` then close
  - [x] Loading state (status === 'loading'): show centered `<Loader2 className="h-8 w-8 animate-spin text-zinc-400" />` and "Opening LinkedIn..." text
  - [x] Active state (status === 'active'): show `<canvas ref={canvasRef} width={480} height={600} tabIndex={0} style={{ width: 480, height: 600 }} />`
  - [x] Canvas `onMouseDown`: compute `x = e.nativeEvent.offsetX / canvasEl.clientWidth * 960`, `y = e.nativeEvent.offsetY / canvasEl.clientHeight * 1200`, call `sendClick(x, y)`; call `canvasEl.focus()` to ensure keydown events are captured
  - [x] Canvas `onKeyDown`: call `sendKey(e.key)`, call `e.preventDefault()` to prevent browser shortcuts
  - [x] Drawing frames: expose a `useImperativeHandle`-style callback or use `useEffect` with `onFrame` ref — when a binary frame arrives, `createImageBitmap(new Blob([frame], { type: 'image/png' })).then(bitmap => ctx.drawImage(bitmap, 0, 0, 480, 600))`
  - [x] Dialog title: "Connect to LinkedIn" (satisfies `DialogTitle` accessibility requirement)
  - [x] Dialog dimensions: set `DialogContent` `className` to force 480px width (e.g., `"max-w-[500px] p-0 overflow-hidden"`)
  - [x] Do NOT render a close X that bypasses `sendCancel` — shadcn Dialog's default X must call `sendCancel` via `onOpenChange`

- [x] Modify `src/client/routes/config.tsx` — update `ConnectionsCard` (AC: 1, 2, 6, 7, 9)
  - [x] Remove: `useLinkedinAuthMutation` import
  - [x] Remove: `selectedFile`, `showHowTo`, `fileInputRef` state
  - [x] Remove: `handleFileChange`, `handleUpload` functions
  - [x] Remove: `<input type="file" ...>`, Choose file `<Button>`, Upload `<Button>`
  - [x] Remove: `uploadMutation.isError` error display block
  - [x] Remove: "How to generate linkedin.json" collapsible section (entire `<div className="mt-3">` block)
  - [x] Add: `useLinkedinBrowserSession` hook — import from `@/hooks/useLinkedinBrowserSession`
  - [x] Add: `LinkedInBrowserModal` import from `@/components/linkedin/LinkedInBrowserModal`
  - [x] Add: `useQueryClient` from `@tanstack/react-query`
  - [x] Add: `const [modalOpen, setModalOpen] = useState(false)` for modal visibility
  - [x] `startSession()` wrapper: call hook's `startSession()`, set `modalOpen(true)`
  - [x] On `status === 'captured'`: close modal, call `toast.success('LinkedIn connected')`, invalidate `['onboarding-status']`
  - [x] On `status === 'timeout'`: close modal, show `<Alert variant="destructive">` with "Session timed out — please try again"
  - [x] On `status === 'error'` (POST failed): show `<Alert variant="destructive">` with error message; do NOT open modal
  - [x] "Connect LinkedIn" `<Button size="sm" disabled={modalOpen} onClick={startSession}>Connect LinkedIn</Button>`
  - [x] Keep `useOnboardingStatusQuery` and status indicator (`isConnected` / Connected/Not connected) unchanged
  - [x] Render `<LinkedInBrowserModal open={modalOpen} onClose={() => setModalOpen(false)} {...sessionProps} />`

- [x] Delete files (AC: 10)
  - [x] Delete `job-hunt-dashboard/scripts/generate-linkedin-auth.js`
  - [x] Delete `job-hunt-dashboard/src/client/hooks/useLinkedinAuthMutation.ts`

### Review Findings

- [x] [Review][Decision] **onMouseDown vs onClick for canvas click events** — dismissed: kept onMouseDown for better remote browser control UX — AC 4 specifies "the click event fires on the canvas" (implies `onClick`); implementation uses `onMouseDown` (fires on press, not release). `onMouseDown` is more responsive for remote browser control but semantically deviates from spec. Decide: keep `onMouseDown` or change to `onClick`. [LinkedInBrowserModal.tsx:handleMouseDown]
- [x] [Review][Patch] **Modal persists when POST fails, violating AC 9** — `handleConnect` opens the modal before `startSession` resolves; if POST fails, `sessionStatus` transitions to `'error'` but `modalOpen` remains `true`, showing an empty 600px void instead of the inline Alert. Fix: add `sessionStatus === 'error' && modalOpen` case to the `useEffect` in `ConnectionsCard` to close the modal on error. [config.tsx:useEffect]
- [x] [Review][Patch] **Intentional cancel triggers 'error' state via onclose** — after `sendCancel()` synchronously sets `status='idle'`, the server closes the socket and `ws.onclose` fires; `'idle'` is not in the guard list `('captured' | 'timeout' | 'error')`, so the handler sets `status='error'` and shows a destructive "Connection closed unexpectedly" alert to a user who deliberately cancelled. Fix: add `'idle'` to the guard condition in `ws.onclose`. [useLinkedinBrowserSession.ts:ws.onclose]
- [x] [Review][Patch] **Server WS close after 'captured' may race with React state update** — server sends `{ type: 'captured' }` then immediately closes the socket; if `onclose` fires before React commits the 'captured' state, `prev` in the functional update is still `'active'`, overwriting 'captured' with 'error'. Fix: add a `terminalRef = useRef(false)` set synchronously in the 'captured'/'timeout' message handlers and check it in `onclose` instead of relying on React state. [useLinkedinBrowserSession.ts:ws.onclose]
- [x] [Review][Patch] **No auto-focus on canvas when status becomes 'active'** — canvas has `tabIndex={0}` but `canvas.focus()` is only called inside `handleMouseDown`; keydown events are silently dropped until the user clicks first. Fix: add a `useEffect` in `LinkedInBrowserModal` that calls `canvasRef.current?.focus()` when `status === 'active'`. [LinkedInBrowserModal.tsx]
- [x] [Review][Patch] **NaN/null coordinates sent to Playwright when `canvas.clientWidth` is 0** — `e.nativeEvent.offsetX / canvas.clientWidth * 960` produces `Infinity` or `NaN` if `clientWidth` is 0 (layout not yet settled); `JSON.stringify(NaN)` produces `null`, which passes the server's `!== undefined` guard and reaches `page.mouse.click(null, null)`, throwing in Playwright. Fix: guard `if (!canvas.clientWidth || !canvas.clientHeight) return` at top of `handleMouseDown`. [LinkedInBrowserModal.tsx:handleMouseDown]
- [x] [Review][Patch] **`startSession` re-invocation orphans previous WebSocket** — calling `startSession` while a WebSocket already exists (e.g. retrying after an error when the button is re-enabled) overwrites `wsRef.current` without closing the prior connection; the server-side browser session leaks until its 5-minute timeout fires. Fix: call `cleanup()` at the start of `startSession` if `wsRef.current` is non-null. [useLinkedinBrowserSession.ts:startSession]
- [x] [Review][Defer] **Sync DB query in `getSessionUserId` blocks Bun event loop** — `db.select().get()` is synchronous and runs on every WebSocket upgrade request in the `fetch` hot path; under concurrent upgrades this stalls event loop processing. Deferred: story 30.1 server-side scope. [index.ts:getSessionUserId]
- [x] [Review][Defer] **`getSessionUserId` returns impersonated userId with no admin check** — any session whose `data` contains `{ impersonating: N }` is treated as user N with no verification the caller is an admin; a corrupted or injected session could access another user's LinkedIn browser session. Deferred: story 30.1 server-side scope; impersonation auth pattern is pre-existing. [index.ts:getSessionUserId]
- [x] [Review][Defer] **`createImageBitmap` decode errors silently swallowed** — `.catch(() => {})` leaves no trace when a frame fails to decode; canvas stays frozen on the last valid frame with no log or state change. Deferred: minor debugging aid; not production-impactful. [LinkedInBrowserModal.tsx]
- [x] [Review][Defer] **Canvas briefly blank during first frame decode** — `status='active'` is set on first frame receipt but `createImageBitmap` is async; a mousedown in this sub-frame window sends coordinates to a blank canvas. Deferred: sub-frame timing edge case; minor UX only. [LinkedInBrowserModal.tsx]

## Dev Notes

### Critical: Vite WebSocket Proxy

`vite.config.ts` currently does NOT have `ws: true` for the `/api` proxy entry. WebSocket connections from the browser to `/api/...` in dev will fail without this change.

**Required change:**
```ts
proxy: {
  '/api': {
    target: 'http://127.0.0.1:3001',
    timeout: 120000,
    ws: true,          // ← add this
  },
  '/auth': { ... }
}
```

In production (behind Nginx), WebSocket proxying is handled by Nginx's `proxy_pass` with `Upgrade`/`Connection` headers — no code change needed there.

### WebSocket URL Construction

```ts
const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const wsUrl = `${proto}//${window.location.host}/api/onboarding/linkedin/browser/${sessionId}/ws`
const ws = new WebSocket(wsUrl)
ws.binaryType = 'arraybuffer'  // required — frames are binary PNG; default is 'blob'
```

**Why `binaryType = 'arraybuffer'`**: The server sends `Buffer` (Bun). `createImageBitmap` needs either `Blob` or `ArrayBuffer`. Receiving as `arraybuffer` and wrapping in `new Blob([frame], { type: 'image/png' })` is the correct pattern.

### Distinguishing Binary vs JSON Messages

The server sends two types of messages:
- **Binary frames** (screenshot): `event.data` is `ArrayBuffer` — draw to canvas
- **JSON control messages** (`{ type: 'captured' | 'timeout' | 'error' }`): `event.data` is `string`

```ts
ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    // PNG frame — draw to canvas
    onFrame(event.data)
  } else {
    // JSON control message
    try {
      const msg = JSON.parse(event.data as string) as { type: string }
      // handle type
    } catch { }
  }
}
```

### Canvas Frame Drawing Pattern

```ts
function drawFrame(buffer: ArrayBuffer) {
  const canvas = canvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  createImageBitmap(new Blob([buffer], { type: 'image/png' }))
    .then(bitmap => {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()  // free GPU memory
    })
    .catch(() => { /* canvas may have unmounted */ })
}
```

### Coordinate Mapping for Click Events

```ts
function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
  const canvas = canvasRef.current!
  const x = (e.nativeEvent.offsetX / canvas.clientWidth) * 960
  const y = (e.nativeEvent.offsetY / canvas.clientHeight) * 1200
  sendClick(x, y)
  canvas.focus()  // ensure keydown events work
}
```

Use `offsetX`/`offsetY` (relative to the element), not `clientX`/`clientY` (viewport-relative).

### Status State Machine

```
idle → loading (startSession called)
loading → active (first binary frame received)
loading → error (POST failed)
active → captured (server sends { type: 'captured' })
active → timeout (server sends { type: 'timeout' })
active → error (server sends { type: 'error' } or WS closes unexpectedly)
captured/timeout/error → idle (modal closed / user retries)
```

The `useLinkedinBrowserSession` hook manages this state. The modal renders based on status passed in as props.

### apiFetch for POST (CSRF Required)

Use `apiFetch` (not bare `fetch`) for `POST /api/onboarding/linkedin/browser` — it automatically attaches the CSRF token. See `src/client/lib/api.ts`.

```ts
import { apiFetch } from '@/lib/api'

const res = await apiFetch('/api/onboarding/linkedin/browser', { method: 'POST' })
if (!res.ok) {
  const body = await res.json().catch(() => ({})) as { error?: string }
  throw new Error(body.error ?? `HTTP ${res.status}`)
}
const { sessionId } = await res.json() as { sessionId: string }
```

### Dialog Pattern (from `admin-users.tsx`)

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

<Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
  <DialogContent className="max-w-[500px] p-4">
    <DialogHeader>
      <DialogTitle>Connect to LinkedIn</DialogTitle>
    </DialogHeader>
    {/* canvas or spinner */}
  </DialogContent>
</Dialog>
```

`DialogTitle` is required for accessibility — shadcn Dialog shows a console warning without it.

### Query Invalidation on Capture

```ts
const queryClient = useQueryClient()
// when status becomes 'captured':
queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
toast.success('LinkedIn connected')
```

### Error Display in ConnectionsCard

Post-failure error (AC 9): render inline in `ConnectionsCard`, not as a toast. This matches the existing pattern for `uploadMutation.isError`.

Timeout error (AC 7): the epic says `<Alert variant="destructive">` OR error toast. Use `<Alert>` inline for consistency with the POST error display.

```tsx
{(status === 'error' || status === 'timeout') && error && (
  <Alert variant="destructive" className="mt-3">
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

### Files to Delete

Both files must be deleted (not just emptied):
- `job-hunt-dashboard/scripts/generate-linkedin-auth.js`
- `job-hunt-dashboard/src/client/hooks/useLinkedinAuthMutation.ts`

After deleting `useLinkedinAuthMutation.ts`, TypeScript will flag the import in `config.tsx` — that import must also be removed.

### `PUT /api/onboarding/linkedin` Server Route

The **server route** stays — do NOT touch `api-onboarding.ts`. Only the client-side hook `useLinkedinAuthMutation.ts` is deleted. The server route is preserved for potential future use.

### No New Shared Types Needed

`{ sessionId: string }` is used inline in the hook — no need to add it to `src/shared/schemas.ts`. The hook's internal types (`SessionStatus`) stay in the hook file.

### No Tests Required

This is a pure UI story. The server-side logic was tested in story 30.1. No new HTTP contract tests. Manual verification in browser is the expected test approach.

### Project Structure Notes

- New component in `src/client/components/linkedin/` — create the `linkedin/` subdirectory (no existing LinkedIn component directory)
- Hook in `src/client/hooks/useLinkedinBrowserSession.ts` — follows `camelCase` prefix `use` naming convention
- Component file `LinkedInBrowserModal.tsx` — `PascalCase.tsx` naming convention

### References

- `src/client/routes/config.tsx` — file to modify; `ConnectionsCard` function is lines 18–108
- `src/client/hooks/useLinkedinAuthMutation.ts` — delete this file
- `src/client/hooks/useOnboardingStatusQuery.ts` — keep; provides `['onboarding-status']` query key
- `src/client/lib/api.ts` — `apiFetch` with CSRF injection
- `src/client/routes/admin-users.tsx` — shadcn `Dialog` usage pattern (import names, `onOpenChange`)
- `vite.config.ts` — add `ws: true` to `/api` proxy
- `job-hunt-dashboard/scripts/generate-linkedin-auth.js` — delete this file
- Epic 30: `_bmad-output/planning-artifacts/epics/epic-30-linkedin-in-app-browser-authentication.md`
- Story 30.1: `_bmad-output/implementation-artifacts/30-1-server-linkedin-browser-session-api.md` — server API details

### Previous Story Intelligence (Story 30.1)

- **Server is done**: `POST /api/onboarding/linkedin/browser` returns `{ sessionId }`, WS at `/:sessionId/ws`, server sends binary PNG frames at ≤5fps and JSON control messages.
- **WS auth**: handled server-side via session cookie — no special client auth needed, just open the WS URL.
- **Error response shape**: `{ error: string }` — never `{ message }`.
- **`toast` from `sonner`**: used throughout config.tsx (e.g., `toast.success(...)`, `toast.error(...)`).
- **`catch { }`** (no typed param): TypeScript strict mode; used throughout the project.
- **Catch blocks**: use `catch { }` (no typed param) per project convention.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Implemented `useLinkedinBrowserSession` hook with full state machine (idle→loading→active→captured/timeout/error), WS lifecycle management, and cleanup on unmount.
- Created `LinkedInBrowserModal` using shadcn Dialog; canvas renders binary PNG frames via `createImageBitmap`; click coordinates mapped from 480×600 display space to 960×1200 viewport space; keydown events forwarded; Escape/X triggers `sendCancel` via `onOpenChange`.
- Rewrote `ConnectionsCard` in `config.tsx`: removed all file-upload and "How to generate linkedin.json" code; added "Connect LinkedIn" button (disabled while modal open); status updates via `useEffect` watching `sessionStatus`; error/timeout displayed via `<Alert variant="destructive">` inline.
- Added `ws: true` to Vite `/api` proxy for dev WebSocket forwarding.
- Deleted `scripts/generate-linkedin-auth.js` and `src/client/hooks/useLinkedinAuthMutation.ts`.
- No regressions introduced; all 4 pre-existing test failures are unrelated to this story.

### File List

- `job-hunt-dashboard/vite.config.ts` (modified)
- `job-hunt-dashboard/src/client/hooks/useLinkedinBrowserSession.ts` (created)
- `job-hunt-dashboard/src/client/components/linkedin/LinkedInBrowserModal.tsx` (created)
- `job-hunt-dashboard/src/client/routes/config.tsx` (modified)
- `job-hunt-dashboard/scripts/generate-linkedin-auth.js` (deleted)
- `job-hunt-dashboard/src/client/hooks/useLinkedinAuthMutation.ts` (deleted)

## Change Log

- 2026-05-08: Story 30.2 implemented — LinkedIn in-app browser modal UI replacing file-upload flow (claude-sonnet-4-6)
