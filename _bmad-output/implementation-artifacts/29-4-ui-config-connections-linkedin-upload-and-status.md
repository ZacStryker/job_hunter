# Story 29.4: UI — Config > Connections: LinkedIn Upload & Status

Status: done

## Story

As a user,
I want a Config > Connections section where I can upload my `linkedin.json` and see whether it's connected,
so that I can authenticate LinkedIn without touching the server directly.

## Acceptance Criteria

1. **Given** I navigate to Config > Connections, **When** the section renders, **Then** I see a "LinkedIn" row with a file upload button and a connection status indicator; **And** if `hasLinkedinAuth: true` (from `GET /api/onboarding/status`): status reads "Connected" (emerald-500); **And** if `hasLinkedinAuth: false`: status reads "Not connected" (zinc-500).

2. **Given** I select a `linkedin.json` file via the file upload, **When** I click "Upload", **Then** the file content is read client-side and sent via `PUT /api/onboarding/linkedin`; **And** on success: status indicator updates to "Connected"; a success toast confirms upload; **And** on failure: an `<Alert variant="destructive">` shows the error message from the API.

3. **Given** the upload is in progress, **When** `PUT /api/onboarding/linkedin` is pending, **Then** the Upload button shows a spinner and is disabled.

4. **Given** a "How to generate linkedin.json" section exists below the upload control, **When** the user expands it, **Then** they see the command `node scripts/generate-linkedin-auth.js` and a brief explanation that it opens a browser to log in to LinkedIn and saves the session file locally.

5. **Given** `scripts/generate-linkedin-auth.js` exists in the project root (`job-hunt-dashboard/`), **When** run with `node scripts/generate-linkedin-auth.js`, **Then** it launches a Chromium browser via Playwright, waits for the user to log in to LinkedIn, and writes `linkedin.json` to the current directory.

## Tasks / Subtasks

- [x] Create `job-hunt-dashboard/src/client/hooks/useLinkedinAuthMutation.ts` (AC: 2, 3)
  - [x] `useMutation` that calls `PUT /api/onboarding/linkedin` with `{ content: string }` body
  - [x] On success: invalidate the `['onboarding-status']` query key so status re-fetches
  - [x] On error: throw `Error(body.error)` for the component to catch via `isError`/`error`

- [x] Create `job-hunt-dashboard/src/client/hooks/useOnboardingStatusQuery.ts` (AC: 1)
  - [x] `useQuery` with key `['onboarding-status']`, fetching `GET /api/onboarding/status`
  - [x] Returns `OnboardingStatusResponse` from `@shared/schemas`
  - [x] Use `staleTime: 0` (status should reflect live uploads)

- [x] Add `ConnectionsCard` component to `job-hunt-dashboard/src/client/routes/config.tsx` (AC: 1–4)
  - [x] Add `ConnectionsCard` function component above `ConfigRoute`
  - [x] Display LinkedIn row: file input + Upload button + status indicator
  - [x] Status indicator: "Connected" (emerald-500) or "Not connected" (zinc-500) based on `hasLinkedinAuth`
  - [x] File input: `<input type="file" accept=".json">` — hidden, triggered by a Button click
  - [x] Read file via `FileReader.readAsText()` → call `uploadMutation.mutate(content)`
  - [x] Upload button: disabled + spinner when `uploadMutation.isPending`; disabled when no file selected
  - [x] On upload error: show `<Alert variant="destructive">` with `uploadMutation.error.message`
  - [x] On upload success: call `toast.success('LinkedIn session uploaded')` from `sonner`
  - [x] Expandable "How to generate linkedin.json" section (use `<details>`/`<summary>` or `useState` show/hide)
  - [x] Register `<ConnectionsCard />` in `ConfigRoute` render, above `<SearchConfigCard />`

- [x] Create `job-hunt-dashboard/scripts/generate-linkedin-auth.js` (AC: 5)
  - [x] CommonJS script (no `type: "module"` in package.json)
  - [x] `const { chromium } = require('playwright')` — playwright is in dependencies
  - [x] Launch Chromium with `headless: false` so user sees the browser
  - [x] Navigate to `https://www.linkedin.com/login`
  - [x] Wait for user to complete login: detect navigation away from login page or wait for user to press Enter in terminal
  - [x] Save storage state: `await context.storageState({ path: 'linkedin.json' })`
  - [x] Print completion message and close browser
  - [x] Create `job-hunt-dashboard/scripts/` directory (it does not exist yet)

### Review Findings

- [x] [Review][Patch] `reader.onerror` not handled — FileReader failure gives no user feedback [`config.tsx`, `handleUpload`]
- [x] [Review][Patch] `generate-linkedin-auth.js` stdin missing `process.stdin.resume()` and resolves on any data, not just Enter (violates AC 5) [`generate-linkedin-auth.js:12-14`]
- [x] [Review][Patch] `linkedin.json` not gitignored — session file at risk of accidental commit [`.gitignore`]
- [x] [Review][Patch] `res.json()` in error path can throw on non-JSON response body (e.g. 502 HTML from proxy) [`useLinkedinAuthMutation.ts:14-16`]
- [x] [Review][Patch] `generate-linkedin-auth.js` missing try/finally — browser process leaked if page.goto or storageState throws [`generate-linkedin-auth.js`]
- [x] [Review][Patch] Help text says "project root" — ambiguous; should specify `job-hunt-dashboard/` directory [`config.tsx`, how-to section]
- [x] [Review][Defer] Client-side file size not bounded — large uploads can exhaust browser memory [`config.tsx`] — deferred, pre-existing
- [x] [Review][Defer] No JSON/structural content validation before sending — corrupted storageState accepted silently [`config.tsx`, `api-onboarding.ts`] — deferred, pre-existing
- [x] [Review][Defer] Component unmount between FileReader and mutate — theoretical React state update, React 18+ handles gracefully [`config.tsx`] — deferred, pre-existing
- [x] [Review][Defer] Status query loading/error state not surfaced — defaults to "Not connected" on query error with no indicator [`config.tsx`] — deferred, beyond AC requirements

## Dev Notes

### Architecture Invariants

**Secret handling:** The UI only calls `PUT /api/onboarding/linkedin` with the file content as `{ content: string }`. No decryption ever happens on the client. The server does all crypto (Story 29.3 implemented the route).

**User isolation:** `userId` comes from the session cookie — the server handles it. Client doesn't pass userId.

**API contract (from Story 29.3):** `PUT /api/onboarding/linkedin` expects `Content-Type: application/json` body `{ content: "<file content as string>" }`. Response is `200 { ok: true }` on success, `400 { error: string }` for validation errors.

**`GET /api/onboarding/status` response (from Story 29.3):**
```ts
{ hasAnthropicKey: boolean, hasImap: boolean, hasLinkedinAuth: boolean, onboardingComplete: boolean }
```
Type is `OnboardingStatusResponse` from `src/shared/schemas.ts:255`.

### Existing Pattern: How to Call `PUT /api/onboarding/linkedin`

The `apiFetch` from `@/lib/api` automatically injects the CSRF token for PUT requests — always use it instead of `fetch` directly:

```ts
import { apiFetch } from '../lib/api'

const res = await apiFetch('/api/onboarding/linkedin', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content }),
})
```

### Hook: `useLinkedinAuthMutation.ts` — Exact Pattern

Follow `useWebhookMutation.ts` pattern:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

export function useLinkedinAuthMutation() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (content: string) => {
      const res = await apiFetch('/api/onboarding/linkedin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? `Upload failed: HTTP ${res.status}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
    },
  })
}
```

### Hook: `useOnboardingStatusQuery.ts` — Pattern

```ts
import { useQuery } from '@tanstack/react-query'
import type { OnboardingStatusResponse } from '@shared/schemas'

export function useOnboardingStatusQuery() {
  return useQuery<OnboardingStatusResponse>({
    queryKey: ['onboarding-status'],
    queryFn: async () => {
      const res = await fetch('/api/onboarding/status')
      if (!res.ok) throw new Error('Failed to load onboarding status')
      return res.json() as Promise<OnboardingStatusResponse>
    },
    staleTime: 0,
  })
}
```

Note: `apiFetch` is not needed here because `GET` doesn't need a CSRF token.

### Config View: Where to Add ConnectionsCard

`job-hunt-dashboard/src/client/routes/config.tsx` — add `ConnectionsCard` as a new function component in this file. Pattern matches existing `SearchConfigCard`, `ProfilePreviewCard`, etc. Register in `ConfigRoute`:

```tsx
export function ConfigRoute() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-100">Config</h1>
      <ConnectionsCard />        {/* NEW — add before SearchConfigCard */}
      <SearchConfigCard />
      <div className="grid grid-cols-2 gap-6">
        <ProfilePreviewCard />
        <PromptsPreviewCard />
      </div>
      <LogsPreviewCard />
    </div>
  )
}
```

### ConnectionsCard — Full Component Sketch

```tsx
function ConnectionsCard() {
  const { data: status } = useOnboardingStatusQuery()
  const uploadMutation = useLinkedinAuthMutation()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showHowTo, setShowHowTo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isConnected = status?.hasLinkedinAuth ?? false

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null)
    uploadMutation.reset()
  }

  function handleUpload() {
    if (!selectedFile) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      uploadMutation.mutate(content, {
        onSuccess: () => {
          toast.success('LinkedIn session uploaded')
          setSelectedFile(null)
          if (fileInputRef.current) fileInputRef.current.value = ''
        },
      })
    }
    reader.readAsText(selectedFile)
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <h2 className="text-base font-semibold text-zinc-100 mb-3">Connections</h2>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-300">LinkedIn</span>
          <span className={`text-xs ${isConnected ? 'text-emerald-500' : 'text-zinc-500'}`}>
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? selectedFile.name : 'Choose file'}
          </Button>
          <Button
            size="sm"
            disabled={!selectedFile || uploadMutation.isPending}
            onClick={handleUpload}
          >
            {uploadMutation.isPending ? '...' : 'Upload'}
          </Button>
        </div>
      </div>

      {uploadMutation.isError && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{uploadMutation.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="mt-3">
        <button
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          onClick={() => setShowHowTo(h => !h)}
        >
          {showHowTo ? '▾' : '▸'} How to generate linkedin.json
        </button>
        {showHowTo && (
          <div className="mt-2 text-xs text-zinc-400 bg-zinc-900 rounded p-3">
            <p className="mb-2">Run this command in the project root to open a browser and log in to LinkedIn. The session file will be saved as <code>linkedin.json</code>.</p>
            <code className="text-zinc-200">node scripts/generate-linkedin-auth.js</code>
          </div>
        )}
      </div>
    </div>
  )
}
```

### Spinner for Upload Button

The `Button` component from shadcn/ui doesn't have a built-in spinner. Use the existing pattern: show `'...'` text while pending (same approach as other forms in this codebase). Alternatively, use `Loader2` from `lucide-react` (already a dependency):

```tsx
import { Loader2 } from 'lucide-react'
// ...
{uploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Upload'}
```

### `generate-linkedin-auth.js` — Exact Implementation

```js
const { chromium } = require('playwright')
const path = require('path')

;(async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('https://www.linkedin.com/login')
  console.log('Log in to LinkedIn in the browser window. Press Enter here when done...')

  await new Promise(resolve => process.stdin.once('data', resolve))

  const outputPath = path.join(process.cwd(), 'linkedin.json')
  await context.storageState({ path: outputPath })
  console.log(`Session saved to ${outputPath}`)

  await browser.close()
  process.exit(0)
})()
```

Place at: `job-hunt-dashboard/scripts/generate-linkedin-auth.js`

### Required Imports in `config.tsx`

Add these to the existing imports at the top of `config.tsx`:
```tsx
import { useRef } from 'react'  // already has useState — add useRef
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useLinkedinAuthMutation } from '@/hooks/useLinkedinAuthMutation'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
```

`useState` is already imported in `config.tsx`. Add `useRef` to the existing React import.

### File Upload Pattern: Why FileReader Not FormData

The API endpoint (`PUT /api/onboarding/linkedin`) expects JSON body `{ content: string }` — not a multipart form upload. The file content must be read as text client-side and sent as JSON. Use `FileReader.readAsText()`:

```ts
const reader = new FileReader()
reader.onload = (e) => {
  const content = e.target?.result as string
  uploadMutation.mutate(content)
}
reader.readAsText(file)
```

### Files to Create/Modify

- **Create** `job-hunt-dashboard/src/client/hooks/useLinkedinAuthMutation.ts`
- **Create** `job-hunt-dashboard/src/client/hooks/useOnboardingStatusQuery.ts`
- **Modify** `job-hunt-dashboard/src/client/routes/config.tsx` — add `ConnectionsCard` + imports + update `ConfigRoute`
- **Create** `job-hunt-dashboard/scripts/generate-linkedin-auth.js` (create `scripts/` directory first)

**No schema changes** — `OnboardingStatusResponse` already has `hasLinkedinAuth` (done in Story 29.3).
**No API changes** — `PUT /api/onboarding/linkedin` and `GET /api/onboarding/status` already implemented (Story 29.3).
**No migration** — no DB changes.

### TanStack Query Key Note

The `['onboarding-status']` query key is new (not previously used in the client). The `router.ts` fetches `/api/onboarding/status` directly via `fetch()` in `beforeLoad`, not via TanStack Query — that's a separate flow (route guard). The `useOnboardingStatusQuery` hook establishes the live query for the Config view.

### Testing

No unit tests required for pure UI components per project conventions. The API is already tested (Story 29.3 tests cover the endpoint). The mutation hook is thin enough that no separate test is needed.

Manual test steps:
1. Start `bun run dev`; navigate to Config
2. Verify "Connections" card renders at top of Config page
3. With no LinkedIn auth: status shows "Not connected" (zinc-500)
4. Select a `.json` file; click Upload; verify "Connected" status + success toast
5. Verify Upload button is disabled/shows spinner during upload
6. Simulate API error (e.g., upload non-JSON): verify destructive Alert appears
7. Run `node scripts/generate-linkedin-auth.js` from `job-hunt-dashboard/`; verify browser opens and `linkedin.json` is created

### Previous Story Learnings (29.3)

- **`decrypt()` goes in service, `encrypt()` goes in route** — client doesn't touch crypto at all
- **`console.error` rule:** Don't `console.error` for user config states; do log genuine server failures
- **Catch blocks:** TypeScript strict mode — use `catch { }` for empty catches (no typed parameter needed)
- **The `errors` array from `runDiscovery`** now surfaces LinkedIn skip reasons — 29.4's UI doesn't need to wire these directly (they flow through the existing pipeline progress UI from Epic 19)

### References

- `src/client/routes/config.tsx` — existing Config route (modify this file)
- `src/client/routes/onboarding.tsx` — IMAP section (lines 64–87) for mutation + Alert pattern
- `src/client/components/onboarding/ConnectionTestButton.tsx` — referenced in epic as visual pattern (review for status indicator styling)
- `src/client/hooks/useWebhookMutation.ts` — mutation hook pattern to follow exactly
- `src/client/lib/api.ts` — `apiFetch` (always use for PUT, POST, PATCH, DELETE)
- `src/shared/schemas.ts:255` — `OnboardingStatusResponse` type
- `job-hunt-dashboard/scraper/src/scrapers/linkedin.js` — shows how Playwright handles LinkedIn auth for reference
- Epic 29: `_bmad-output/planning-artifacts/epics/epic-29-per-user-linkedin-authentication.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation, no debugging required.

### Completion Notes List

- Created `useLinkedinAuthMutation` hook following the `useWebhookMutation` pattern: `useMutation<void, Error, string>` calling `PUT /api/onboarding/linkedin` with JSON body `{ content }`, invalidates `['onboarding-status']` on success.
- Created `useOnboardingStatusQuery` hook: `useQuery` with `staleTime: 0` against `GET /api/onboarding/status`, returns `OnboardingStatusResponse`.
- Added `ConnectionsCard` function component to `config.tsx` with: hidden file input triggered by a Button, `FileReader.readAsText()` for JSON content, `Loader2` spinner while pending, `<Alert variant="destructive">` on error, `toast.success()` on success, toggle show/hide for the "How to generate" instructions, connected/not-connected status driven by `hasLinkedinAuth`.
- Registered `<ConnectionsCard />` in `ConfigRoute` above `<SearchConfigCard />`.
- Created `scripts/generate-linkedin-auth.js`: CommonJS, launches headless:false Chromium, navigates to LinkedIn login, waits for Enter keypress, saves storage state to `linkedin.json`, closes browser.
- All 337 passing tests continue to pass (2 pre-existing failures unrelated to this story).

### File List

- `job-hunt-dashboard/src/client/hooks/useLinkedinAuthMutation.ts` (created)
- `job-hunt-dashboard/src/client/hooks/useOnboardingStatusQuery.ts` (created)
- `job-hunt-dashboard/src/client/routes/config.tsx` (modified)
- `job-hunt-dashboard/scripts/generate-linkedin-auth.js` (created)

### Change Log

- 2026-05-07: Story 29.4 implemented — LinkedIn upload UI (ConnectionsCard), status hooks, and generate-linkedin-auth.js script
