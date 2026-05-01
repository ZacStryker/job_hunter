# Story 25.2: Onboarding UI — 4-Step Setup Flow

Status: done

## Story

As a newly activated user,
I want a guided 4-step onboarding flow that walks me through Anthropic API key setup and optional IMAP configuration,
so that I reach a fully functional personal dashboard in under 5 minutes.

## Acceptance Criteria

1. **Given** `GET /api/onboarding/status` returns `onboardingComplete: true`
   **When** I navigate to `/onboarding`
   **Then** I am redirected to `/` immediately

2. **Given** I land on `/onboarding` with incomplete onboarding
   **When** the page loads
   **Then** I see the `StepIndicator` with 4 dots: Step 1 active (blue-500), Steps 2–4 pending (zinc-700)
   **And** the `StepIndicator` has `role="list"` and `aria-label="Onboarding progress: step 1 of 4"`; each dot is `role="listitem"` with `sr-only` text describing its status

3. **Given** I am on Step 1 (Welcome)
   **When** I click "Get Started"
   **Then** Step 1 dot turns emerald-500; Step 2 becomes active (blue-500); focus moves programmatically to the Step 2 `<h2>` heading

4. **Given** I am on Step 2 (Anthropic API Key) and I paste a key and click "Test Connection"
   **When** the `ConnectionTestButton` is loading
   **Then** the button shows a spinner and "Testing…" and is disabled for up to 10 seconds

5. **Given** the API key test succeeds
   **When** `ConnectionTestButton` reaches pass state
   **Then** the button shows "✓ Connected" (emerald-600 border + emerald-400 text), an `<Alert>` below reads "Connection successful"; Continue button activates
   **And** an `aria-live="polite"` region announces "Connection successful" to screen readers

6. **Given** the API key test fails
   **When** `ConnectionTestButton` reaches fail state
   **Then** the button shows "✗ Failed" (red-700 border + red-400 text), an `<Alert variant="destructive">` shows the specific error message; Continue remains disabled
   **And** an `aria-live="polite"` region announces the failure message to screen readers

7. **Given** I edit the API key field after any test result (pass or fail)
   **When** the field value changes
   **Then** `ConnectionTestButton` resets to idle state and Continue deactivates

8. **Given** I am on Step 3 (IMAP Setup)
   **When** the step renders
   **Then** "Skip for now" and "Test Connection" are equal-weight primary-style buttons; "Back" is secondary
   **And** hint text is shown: "Use imap.gmail.com port 993 for Gmail"

9. **Given** I click "Skip for now" on Step 3
   **When** the action fires
   **Then** I advance to Step 4 without saving IMAP credentials

10. **Given** the IMAP test succeeds on Step 3
    **When** `ConnectionTestButton` reaches pass state
    **Then** Continue activates; "Skip for now" remains visible as a valid equal-weight alternative

11. **Given** I reach Step 4 (Done)
    **When** the step renders
    **Then** I see "Your account is ready" and a "Go to Dashboard" primary button
    **And** clicking "Go to Dashboard" navigates to `/` and onboarding is never shown again

## Tasks / Subtasks

### 1. Add `OnboardingStatusResponse` to `src/shared/schemas.ts` (AC: #1)

- [x] Append at the end of the file:
  ```ts
  export type OnboardingStatusResponse = {
    hasAnthropicKey: boolean
    hasImap: boolean
    onboardingComplete: boolean
  }
  ```
  No Zod schema needed — this is a read-only response type, not a validated input.

### 2. Create `src/client/components/onboarding/StepIndicator.tsx` (AC: #2, #3)

- [x] Props: `{ currentStep: number; totalSteps: number }`
  - `currentStep` is 0-indexed; dot at index `i` is:
    - `i < currentStep` → emerald-500 (completed)
    - `i === currentStep` → blue-500 (active)
    - `i > currentStep` → zinc-700 (pending)
- [x] Render:
  ```tsx
  <ol
    role="list"
    aria-label={`Onboarding progress: step ${currentStep + 1} of ${totalSteps}`}
    className="flex gap-2"
  >
    {Array.from({ length: totalSteps }, (_, i) => {
      const color = i < currentStep ? 'bg-emerald-500' : i === currentStep ? 'bg-blue-500' : 'bg-zinc-700'
      const label = i < currentStep ? `Step ${i + 1}: complete` : i === currentStep ? `Step ${i + 1}: current` : `Step ${i + 1}: upcoming`
      return (
        <li key={i} role="listitem" className={`w-3 h-3 rounded-full ${color}`}>
          <span className="sr-only">{label}</span>
        </li>
      )
    })}
  </ol>
  ```
- [x] No state, no side effects — pure presentation component.

### 3. Create `src/client/components/onboarding/ConnectionTestButton.tsx` (AC: #4, #5, #6)

- [x] Props: `{ state: 'idle' | 'loading' | 'pass' | 'fail'; onTest: () => void; disabled?: boolean }`
- [x] Render based on state:
  ```tsx
  if (state === 'idle') return <Button onClick={onTest} disabled={disabled}>Test Connection</Button>
  if (state === 'loading') return <Button disabled><Spinner />Testing…</Button>
  if (state === 'pass') return <Button variant="outline" className="border-emerald-600 text-emerald-400" disabled>✓ Connected</Button>
  if (state === 'fail') return <Button variant="outline" className="border-red-700 text-red-400" disabled>✗ Failed</Button>
  ```
- [x] For the spinner in loading state, use a simple inline SVG `animate-spin` element:
  ```tsx
  <svg className="w-4 h-4 animate-spin mr-2" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
  </svg>
  ```
- [x] This is a pure presentation component — no API calls. The parent drives `state` transitions and passes `onTest`.

### 4. Create `src/client/routes/onboarding.tsx` (AC: #2–#11)

Full implementation of the 4-step flow.

- [x] **Imports:**
  ```ts
  import { useState, useRef, useEffect } from 'react'
  import { useNavigate } from '@tanstack/react-router'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Alert, AlertDescription } from '@/components/ui/alert'
  import { StepIndicator } from '@/components/onboarding/StepIndicator'
  import { ConnectionTestButton } from '@/components/onboarding/ConnectionTestButton'
  import { apiFetch } from '@/lib/api'
  ```

- [x] **State:**
  ```ts
  const navigate = useNavigate()
  const [step, setStep] = useState(0) // 0=Welcome 1=Anthropic 2=IMAP 3=Done
  // Anthropic key step
  const [apiKey, setApiKey] = useState('')
  const [apiKeyTestState, setApiKeyTestState] = useState<'idle' | 'loading' | 'pass' | 'fail'>('idle')
  const [apiKeyTestMsg, setApiKeyTestMsg] = useState('')
  // IMAP step
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [imapUser, setImapUser] = useState('')
  const [imapPass, setImapPass] = useState('')
  const [imapTestState, setImapTestState] = useState<'idle' | 'loading' | 'pass' | 'fail'>('idle')
  const [imapTestMsg, setImapTestMsg] = useState('')
  // Shared aria-live
  const [liveMsg, setLiveMsg] = useState('')
  ```

- [x] **Focus refs and effect:**
  ```ts
  const step1Ref = useRef<HTMLHeadingElement>(null)
  const step2Ref = useRef<HTMLHeadingElement>(null)
  const step3Ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (step === 1) step1Ref.current?.focus()
    else if (step === 2) step2Ref.current?.focus()
    else if (step === 3) step3Ref.current?.focus()
  }, [step])
  ```
  Step 0 (Welcome) is the initial render — no focus on mount.

- [x] **`handleTestAnthropicKey`:**
  ```ts
  async function handleTestAnthropicKey() {
    setApiKeyTestState('loading')
    setLiveMsg('')
    try {
      const res = await apiFetch('/api/onboarding/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      if (res.ok) {
        setApiKeyTestState('pass')
        setApiKeyTestMsg('')
        setLiveMsg('Connection successful')
      } else {
        const data = await res.json() as { error: string }
        setApiKeyTestState('fail')
        setApiKeyTestMsg(data.error || 'Test failed')
        setLiveMsg(data.error || 'Test failed')
      }
    } catch {
      setApiKeyTestState('fail')
      setApiKeyTestMsg('Could not reach the server')
      setLiveMsg('Could not reach the server')
    }
  }
  ```

- [x] **`handleTestImap`:**
  ```ts
  async function handleTestImap() {
    setImapTestState('loading')
    setLiveMsg('')
    try {
      const res = await apiFetch('/api/onboarding/imap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: imapHost, port: imapPort, user: imapUser, pass: imapPass }),
      })
      if (res.ok) {
        setImapTestState('pass')
        setImapTestMsg('')
        setLiveMsg('Connection successful')
      } else {
        const data = await res.json() as { error: string }
        setImapTestState('fail')
        setImapTestMsg(data.error || 'Test failed')
        setLiveMsg(data.error || 'Test failed')
      }
    } catch {
      setImapTestState('fail')
      setImapTestMsg('Could not reach the server')
      setLiveMsg('Could not reach the server')
    }
  }
  ```

- [x] **Layout shell:**
  ```tsx
  export function OnboardingRoute() {
    // ... state and handlers above ...
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8">
          <StepIndicator currentStep={step} totalSteps={4} />
          <div aria-live="polite" className="sr-only">{liveMsg}</div>
          {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
          {step === 1 && <StepAnthropicKey ... />}
          {step === 2 && <StepImap ... />}
          {step === 3 && <StepDone onGoToDashboard={() => navigate({ to: '/' })} />}
        </div>
      </div>
    )
  }
  ```
  The 4 step sections can be defined as inline JSX blocks or local sub-components within the same file — keep them co-located in `onboarding.tsx`.

- [x] **Step 0 — Welcome:**
  ```tsx
  <div>
    <h2 className="text-xl font-semibold mt-6">Welcome</h2>
    <p className="text-zinc-400 mt-2">Let's get your account set up. This takes under 5 minutes.</p>
    <Button className="w-full mt-6" onClick={() => setStep(1)}>Get Started</Button>
  </div>
  ```

- [x] **Step 1 — Anthropic API Key:**
  ```tsx
  <div>
    <h2 ref={step1Ref} tabIndex={-1} className="text-xl font-semibold mt-6">Anthropic API Key</h2>
    <p className="text-zinc-400 mt-2 text-sm">
      Enter your Anthropic API key. Find it at{' '}
      <span className="text-zinc-300">console.anthropic.com</span>.
    </p>
    <div className="mt-4">
      <Label htmlFor="apiKey">API Key</Label>
      <Input
        id="apiKey"
        type="password"
        value={apiKey}
        onChange={(e) => { setApiKey(e.target.value); setApiKeyTestState('idle'); setApiKeyTestMsg('') }}
        className="mt-1 font-mono"
        placeholder="sk-ant-..."
      />
    </div>
    <div className="mt-4">
      <ConnectionTestButton
        state={apiKeyTestState}
        onTest={handleTestAnthropicKey}
        disabled={!apiKey.trim() || apiKeyTestState === 'loading'}
      />
    </div>
    {apiKeyTestState === 'pass' && (
      <Alert className="mt-3">
        <AlertDescription>Connection successful</AlertDescription>
      </Alert>
    )}
    {apiKeyTestState === 'fail' && (
      <Alert variant="destructive" className="mt-3">
        <AlertDescription>{apiKeyTestMsg}</AlertDescription>
      </Alert>
    )}
    <Button
      className="w-full mt-6"
      disabled={apiKeyTestState !== 'pass'}
      onClick={() => setStep(2)}
    >
      Continue
    </Button>
  </div>
  ```

- [x] **Step 2 — IMAP Setup:**
  ```tsx
  <div>
    <h2 ref={step2Ref} tabIndex={-1} className="text-xl font-semibold mt-6">Email Setup</h2>
    <p className="text-zinc-400 mt-1 text-sm">Optional — lets the app detect reply emails.</p>
    <p className="text-xs text-zinc-500 mt-1">Use imap.gmail.com port 993 for Gmail</p>
    <div className="mt-4 flex flex-col gap-3">
      <div>
        <Label htmlFor="imapHost">IMAP Host</Label>
        <Input id="imapHost" value={imapHost}
          onChange={(e) => { setImapHost(e.target.value); setImapTestState('idle'); setImapTestMsg('') }}
          placeholder="imap.gmail.com" />
      </div>
      <div>
        <Label htmlFor="imapPort">Port</Label>
        <Input id="imapPort" type="number" min={1} max={65535} value={imapPort}
          onChange={(e) => { setImapPort(Number(e.target.value)); setImapTestState('idle'); setImapTestMsg('') }} />
      </div>
      <div>
        <Label htmlFor="imapUser">Username / Email</Label>
        <Input id="imapUser" type="email" value={imapUser}
          onChange={(e) => { setImapUser(e.target.value); setImapTestState('idle'); setImapTestMsg('') }} />
      </div>
      <div>
        <Label htmlFor="imapPass">Password / App Password</Label>
        <Input id="imapPass" type="password" value={imapPass}
          onChange={(e) => { setImapPass(e.target.value); setImapTestState('idle'); setImapTestMsg('') }} />
      </div>
    </div>
    <div className="mt-4">
      <ConnectionTestButton
        state={imapTestState}
        onTest={handleTestImap}
        disabled={!imapHost.trim() || !imapUser.trim() || !imapPass.trim() || imapTestState === 'loading'}
      />
    </div>
    {imapTestState === 'pass' && (
      <Alert className="mt-3"><AlertDescription>Connection successful</AlertDescription></Alert>
    )}
    {imapTestState === 'fail' && (
      <Alert variant="destructive" className="mt-3">
        <AlertDescription>{imapTestMsg}</AlertDescription>
      </Alert>
    )}
    <div className="flex gap-3 mt-6">
      <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
      <Button onClick={() => setStep(3)}>Skip for now</Button>
      <Button disabled={imapTestState !== 'pass'} onClick={() => setStep(3)}>Continue</Button>
    </div>
  </div>
  ```
  Note: "Skip for now" and "Continue" both advance to Step 3. Both are primary-style (`<Button>`). "Back" is `variant="outline"` (secondary).

- [x] **Step 3 — Done:**
  ```tsx
  <div className="text-center">
    <h2 ref={step3Ref} tabIndex={-1} className="text-xl font-semibold mt-6">Your account is ready</h2>
    <p className="text-zinc-400 mt-2">You're all set. Head to your dashboard to start tracking jobs.</p>
    <Button className="w-full mt-6" onClick={() => navigate({ to: '/' })}>Go to Dashboard</Button>
  </div>
  ```

### 5. Add `/onboarding` route to `src/client/lib/router.ts` (AC: #1)

- [x] Import at top:
  ```ts
  import { OnboardingRoute } from '../routes/onboarding'
  import type { OnboardingStatusResponse } from '@shared/schemas'
  ```

- [x] Create route (add alongside `loginRoute`, `registerRoute`, `registerPendingRoute`):
  ```ts
  const onboardingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/onboarding',
    component: OnboardingRoute,
    beforeLoad: async () => {
      const res = await fetch('/api/onboarding/status')
      if (res.status === 401) throw redirect({ to: '/login' })
      if (res.ok) {
        const status = await res.json() as OnboardingStatusResponse
        if (status.onboardingComplete) throw redirect({ to: '/' })
      }
    },
  })
  ```

- [x] Add `onboardingRoute` to `routeTree` in the same flat block as `loginRoute`:
  ```ts
  const routeTree = rootRoute.addChildren([
    loginRoute,
    registerRoute,
    registerPendingRoute,
    onboardingRoute,   // ← add here
    protectedRoute.addChildren([...]),
  ])
  ```

### 6. Update `src/client/routes/login.tsx` (AC: #1)

- [x] Line 29: Remove the `as '/'` cast now that the `/onboarding` route exists in the router tree:
  ```ts
  // Before:
  await navigate({ to: (data.onboardingComplete ? '/' : '/onboarding') as '/' })

  // After:
  await navigate({ to: data.onboardingComplete ? '/' : '/onboarding' })
  ```
  Also remove the now-inaccurate comment on that line.

## Dev Notes

### Route Architecture — Why NOT Under `protectedRoute`

`protectedRoute` wraps everything in `Layout` (the nav shell). Onboarding is a standalone full-screen page like `/login` — no navigation bar. Add it to `rootRoute` directly with its own `beforeLoad` guard, consistent with how `loginRoute` and `registerRoute` work.

The `beforeLoad` fetches `/api/onboarding/status` which is protected by `authMiddleware` (all `/api/*`). A `401` response means no session → redirect to `/login`. A successful response with `onboardingComplete: true` → redirect to `/`. A successful response with `onboardingComplete: false` → render the onboarding page. This is a single-fetch pattern (no TanStack Query, no double fetch).

### CSRF for PUT Calls — Use `apiFetch`, Not `fetch`

`PUT /api/onboarding/anthropic` and `PUT /api/onboarding/imap` are state-changing requests. They require the `x-csrf-token` header. Always use `apiFetch` from `@/lib/api` (not plain `fetch`) for these calls. `apiFetch` reads the CSRF token from the cookie and injects the header automatically. This matches the pattern used in `useJobMutation`, `useMessageMutation`, etc.

### Focus Management

`tabIndex={-1}` on each step's `<h2>` makes it programmatically focusable without placing it in the tab order. The `useEffect` watching `step` calls `.focus()` on the correct ref after React commits the render. Step 0 is the initial render — `useEffect` skips `step === 0` to avoid focusing on mount (the page load itself provides context).

### `ConnectionTestButton` — Presentation Only

This component owns no state and makes no API calls. The parent (`OnboardingRoute`) drives the `state` prop and resets it when the input field changes. This keeps the component a pure visual renderer. Do not move the API call logic into the component.

### Input Change Resets Test State (AC: #7)

When the API key `<Input>` onChange fires, immediately:
```ts
setApiKey(e.target.value)
setApiKeyTestState('idle')
setApiKeyTestMsg('')
```
Same pattern for each IMAP field. This ensures the Continue button deactivates when the user edits after a pass/fail.

### `aria-live` Region

Place **one shared** `aria-live="polite"` region just inside the card, outside the step-conditional blocks so it persists across step transitions:
```tsx
<div aria-live="polite" className="sr-only">{liveMsg}</div>
```
Reset `liveMsg` to `''` at the start of each test call (before the async result arrives) so the same message re-announces if the user retries. Screen readers only announce when the content changes — setting it to empty first ensures re-announcement.

### IMAP Port — Number, Not String

`imapPort` is `useState<number>(993)`. The `<Input type="number">` onChange converts with `Number(e.target.value)`. `JSON.stringify({ ..., port: imapPort })` sends it as a JSON number — the server Zod schema expects a number. Do not send as a string.

### `login.tsx` Cast Removal

The original line has `as '/'` with a comment referencing "Story 24.5". This was a forward reference — `/onboarding` didn't exist in the router tree yet so TypeScript couldn't validate the route path. Once `onboardingRoute` is added to the tree in this story, the cast is unnecessary and must be removed. The comment is also inaccurate (this is Story 25.2, not 24.5).

### `OnboardingStatusResponse` Type

No Zod schema needed. It's a server-response type used in `beforeLoad` and the shared schemas file. Adding it to `shared/schemas.ts` ensures it's available to both the `router.ts` beforeLoad and any future hooks.

### Project Structure Notes

**New files:**
```
src/client/routes/onboarding.tsx
src/client/components/onboarding/StepIndicator.tsx
src/client/components/onboarding/ConnectionTestButton.tsx
```

**Modified files:**
```
src/client/lib/router.ts        ← add onboardingRoute to routeTree
src/client/routes/login.tsx     ← remove 'as '/' cast and stale comment
src/shared/schemas.ts           ← add OnboardingStatusResponse type
```

**No new packages** — Button, Input, Label, Alert are already installed shadcn/ui components; TanStack Router `redirect`/`useNavigate` already used; `apiFetch` already in `@/lib/api`.

### References

- Epic 25 spec (UX-AUTH6–UX-AUTH9 and Story 25.2 ACs): [Source: `_bmad-output/planning-artifacts/epics/epic-25-user-onboarding.md#story-252`]
- Story 25.1 (API endpoints this UI calls — `/api/onboarding/status`, `/api/onboarding/anthropic`, `/api/onboarding/imap`): [Source: `_bmad-output/implementation-artifacts/25-1-onboarding-api-status-anthropic-api-key-and-imap-setup.md`]
- Router route pattern (`beforeLoad` redirect guards): [Source: `src/client/lib/router.ts` — loginRoute and registerRoute]
- `apiFetch` CSRF helper: [Source: `src/client/lib/api.ts`]
- `AuthFormCard` layout pattern: [Source: `src/client/components/auth/AuthFormCard.tsx`]
- `Alert` and `AlertDescription` shadcn/ui components: [Source: `src/client/components/ui/alert.tsx`]
- `login.tsx` stale cast to update: [Source: `src/client/routes/login.tsx:29`]
- Project context rules: [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Implemented the full 4-step onboarding UI flow. Created `StepIndicator` (pure presentational, `ol`/`li` with `role="list"`, ARIA labels, emerald/blue/zinc-700 color states) and `ConnectionTestButton` (pure presentational, 4 states with inline SVG spinner). Created `onboarding.tsx` with all state, focus management via refs, `apiFetch` for CSRF-safe PUT calls, shared `aria-live="polite"` region, and all 4 step sections. Added `onboardingRoute` to `router.ts` under `rootRoute` (not `protectedRoute`) with `beforeLoad` guard that fetches `/api/onboarding/status` and redirects to `/login` on 401 or `/` on `onboardingComplete: true`. Removed stale `as '/'` cast and comment from `login.tsx`. Added `OnboardingStatusResponse` type to `shared/schemas.ts`. Build passes cleanly; all 283 tests pass with no regressions.

### File List

- `src/shared/schemas.ts` (modified — added `OnboardingStatusResponse` type)
- `src/client/components/onboarding/StepIndicator.tsx` (created)
- `src/client/components/onboarding/ConnectionTestButton.tsx` (created)
- `src/client/routes/onboarding.tsx` (created)
- `src/client/lib/router.ts` (modified — added `onboardingRoute`)
- `src/client/routes/login.tsx` (modified — removed stale cast and comment)

## Change Log

- 2026-04-30: Implemented full 4-step onboarding UI — StepIndicator, ConnectionTestButton, OnboardingRoute, router wiring, and login.tsx cast cleanup

### Review Findings

- [x] [Review][Patch] beforeLoad silently swallows non-401, non-ok responses from /api/onboarding/status [src/client/lib/router.ts — onboardingRoute beforeLoad]
- [x] [Review][Patch] imapPort NaN/0 from empty or cleared input bypasses client validation and fails Zod on server [src/client/routes/onboarding.tsx — imapPort disabled check]
- [x] [Review][Defer] CSRF token absent mid-flow causes confusing 403 surfaced as generic test failure — deferred, pre-existing apiFetch/authMiddleware behavior
- [x] [Review][Defer] Session expiry during connection test treated as "server unreachable" instead of redirecting to /login — deferred, pre-existing pattern across all mutating routes
- [x] [Review][Defer] Previously saved Anthropic key not pre-populated in form on re-entry — deferred, out of scope for this story's spec
