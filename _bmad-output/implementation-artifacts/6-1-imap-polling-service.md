# Story 6.1: IMAP Polling Service

Status: ready-for-dev

## Story

As a user,
I want the dashboard to automatically poll my email inbox for job-related messages,
So that application status updates arrive without me having to manually check email.

## Acceptance Criteria

1. **Given** `IMAP_HOST`, `IMAP_USER`, and `IMAP_PASS` are set in `.env`
   **When** `bun start` runs
   **Then** the IMAP polling service starts alongside the Hono server and polls on a configured interval
   **And** IMAP credentials are never logged or included in any API response

2. **Given** IMAP credentials are missing from `.env`
   **When** `bun start` runs
   **Then** the IMAP service does not start; the rest of the app functions normally; a warning is logged to `console.warn`

3. **Given** the IMAP connection fails (wrong credentials, unreachable host)
   **When** a poll cycle runs
   **Then** the error is logged with `console.error`; the polling service retries on the next interval — no crash, no process exit

## Tasks / Subtasks

- [ ] Task 1: Install `imapflow` dependency (AC: 1)
  - [ ] Run `/home/zac/.bun/bin/bun add imapflow` from `job-hunt-dashboard/` directory
  - [ ] Verify entry appears in `package.json` dependencies

- [ ] Task 2: Create `src/server/services/imap-poller.ts` (AC: 1–3)
  - [ ] Export `startImapPoller(): void` — checks env vars; warns and returns if any missing; starts `setInterval` loop if present
  - [ ] Export `pollOnce(credentials): Promise<void>` — inner function that creates an `ImapFlow` client, connects, logs out; wraps everything in try/catch → `console.error` on failure, no re-throw
  - [ ] Read poll interval from `IMAP_POLL_INTERVAL_MS` env var (default: `300000` — 5 minutes)
  - [ ] Do NOT log `IMAP_HOST`, `IMAP_USER`, or `IMAP_PASS` anywhere in this file
  - [ ] Configure `ImapFlow` with `logger: false` to suppress its own verbose output
  - [ ] `setInterval` wraps `pollOnce` — poll starts after first interval (not immediately), so server is fully up before first IMAP connect attempt

- [ ] Task 3: Update `src/index.ts` to call `startImapPoller()` (AC: 1–2)
  - [ ] Import `startImapPoller` from `./server/services/imap-poller`
  - [ ] Call `startImapPoller()` AFTER the existing `missingVars` check block (so required Google vars are validated first)
  - [ ] Do NOT add `IMAP_HOST`, `IMAP_USER`, or `IMAP_PASS` to the `REQUIRED_ENV_VARS` array — they are optional

- [ ] Task 4: Update `.env.example` (AC: 1)
  - [ ] Uncomment the three IMAP lines: `IMAP_HOST=imap.gmail.com`, `IMAP_USER=`, `IMAP_PASS=`
  - [ ] Add `IMAP_POLL_INTERVAL_MS=300000` as a new optional line with a comment: `# milliseconds between inbox polls (default: 300000 = 5 minutes)`

- [ ] Task 5: Write unit tests `src/server/services/imap-poller.test.ts` (AC: 1–3)
  - [ ] Mock `imapflow` module so no real IMAP connection occurs
  - [ ] Test: all three env vars set → `startImapPoller` registers interval; `pollOnce` calls `client.connect()` then `client.logout()`
  - [ ] Test: any credential missing → `startImapPoller` calls `console.warn` and does NOT set interval
  - [ ] Test: `pollOnce` catches connection error → calls `console.error` with the error message; does not re-throw
  - [ ] Use `bun:test` imports only: `import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'`

- [ ] Task 6: Verify (AC: all)
  - [ ] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [ ] `/home/zac/.bun/bin/bun test` — all existing tests pass + new `imap-poller.test.ts` tests pass
  - [ ] Manual: start app without IMAP vars → verify `console.warn` appears and app functions normally
  - [ ] Manual: start app with IMAP vars → verify polling interval is registered (check startup log)

## Dev Notes

### Library Choice: `imapflow`

Install: `/home/zac/.bun/bin/bun add imapflow`

`imapflow` is the current standard for IMAP in Node.js/Bun environments. Key constructor options for this project:

```ts
import { ImapFlow } from 'imapflow'

const client = new ImapFlow({
  host: credentials.host,
  port: 993,       // standard IMAP over TLS
  secure: true,    // TLS from the start (not STARTTLS)
  auth: {
    user: credentials.user,
    pass: credentials.pass,
  },
  logger: false,   // suppress imapflow's own verbose logging — we handle errors ourselves
})
```

Always call `await client.logout()` in the `finally` block to close the connection cleanly, even on error paths. If `connect()` itself throws, `logout()` may also throw — wrap in try/catch.

### Complete `imap-poller.ts` Implementation Reference

```ts
import { ImapFlow } from 'imapflow'

const POLL_INTERVAL_MS = parseInt(process.env.IMAP_POLL_INTERVAL_MS ?? '300000', 10)

interface ImapCredentials {
  host: string
  user: string
  pass: string
}

export function startImapPoller(): void {
  const { IMAP_HOST, IMAP_USER, IMAP_PASS } = process.env

  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
    console.warn('[imap] IMAP credentials not configured — email polling disabled')
    return
  }

  const credentials: ImapCredentials = { host: IMAP_HOST, user: IMAP_USER, pass: IMAP_PASS }
  console.log(`[imap] Email polling enabled (interval: ${POLL_INTERVAL_MS}ms)`)

  setInterval(async () => {
    await pollOnce(credentials)
  }, POLL_INTERVAL_MS)
}

export async function pollOnce(credentials: ImapCredentials): Promise<void> {
  const client = new ImapFlow({
    host: credentials.host,
    port: 993,
    secure: true,
    auth: { user: credentials.user, pass: credentials.pass },
    logger: false,
  })

  try {
    await client.connect()
    // Story 6.2 will add inbox fetch and matching logic here
    await client.logout()
  } catch (err) {
    console.error('[imap] Poll error:', err instanceof Error ? err.message : String(err))
    // No re-throw — service retries on next interval
  }
}
```

**Why `pollOnce` is exported:** Enables direct unit testing without the `setInterval` timer mechanism. Story 6.2 will also call `pollOnce` internals to add matching logic.

**Why `setInterval` not immediate:** Server startup completes first. An immediate first poll (via calling `pollOnce()` before `setInterval`) would run synchronously with app boot — deferring avoids any startup-time connection errors from affecting the process before it's ready to serve requests.

### `src/index.ts` Integration

Add after the `missingVars` block and before route registration:

```ts
import { startImapPoller } from './server/services/imap-poller'

// ... (existing code) ...

if (missingVars.length > 0) {
  console.error(...)
  process.exit(1)
}

startImapPoller()  // ← add here; optional — does not affect required vars

app.route('/api/ingest', ingestRoute)
// ...
```

### `.env.example` Changes

Uncomment and add the IMAP block (currently commented at bottom of file):

```
# Post-MVP: Email Status Detection (Epic 6)
IMAP_HOST=imap.gmail.com
IMAP_USER=
IMAP_PASS=
IMAP_POLL_INTERVAL_MS=300000  # milliseconds between inbox polls (default: 300000 = 5 minutes)
```

**Do NOT** add `IMAP_HOST`/`IMAP_USER`/`IMAP_PASS` to the `REQUIRED_ENV_VARS` array in `index.ts` — the app must start normally without them.

### Testing Pattern

`imapflow` must be mocked — no real IMAP connection in tests:

```ts
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'

// Mock imapflow before importing the module under test
const mockConnect = mock(async () => {})
const mockLogout = mock(async () => {})
mock.module('imapflow', () => ({
  ImapFlow: mock(function () {
    return { connect: mockConnect, logout: mockLogout }
  }),
}))

// Import AFTER mocking
const { pollOnce, startImapPoller } = await import('./imap-poller')

describe('pollOnce', () => {
  test('connects and logs out on success', async () => {
    await pollOnce({ host: 'imap.example.com', user: 'u', pass: 'p' })
    expect(mockConnect).toHaveBeenCalled()
    expect(mockLogout).toHaveBeenCalled()
  })

  test('catches connection error without re-throwing', async () => {
    mockConnect.mockImplementationOnce(async () => { throw new Error('ECONNREFUSED') })
    // Should not throw:
    await expect(pollOnce({ host: 'bad', user: 'u', pass: 'p' })).resolves.toBeUndefined()
  })
})

describe('startImapPoller', () => {
  const origEnv = { ...process.env }
  afterEach(() => { Object.assign(process.env, origEnv) })

  test('warns and skips when credentials missing', () => {
    delete process.env.IMAP_HOST
    delete process.env.IMAP_USER
    delete process.env.IMAP_PASS
    // Should call console.warn, not throw, not register interval
    startImapPoller()
    // Assert console.warn called (spy on it if needed)
  })
})
```

**Note on `mock.module` in Bun:** Module mocking in `bun:test` uses `mock.module(path, factory)`. Use the bare package name `'imapflow'` (same string as in import). This must be called before the module under test is imported — use dynamic `await import(...)` after `mock.module(...)`.

### Security Invariants (Critical)

- **Never log credentials:** `IMAP_HOST` (server hostname) is safe to log; `IMAP_USER` and `IMAP_PASS` must never appear in any log output, error message, or API response
- Pattern from `oauth-client.ts`: credentials flow in as parameters, never logged, error messages contain no auth data
- `ImapFlow` `logger: false` prevents the library from emitting auth tokens in debug logs

### Architecture Compliance

- New service file: `src/server/services/imap-poller.ts` — matches `kebab-case.ts` naming convention for server/utility files
- Test file co-located: `src/server/services/imap-poller.test.ts` — next to the service (not in `__tests__/`)
- `bun:test` only — never import from `vitest` or `jest`
- No new API routes — this is a background service, purely server-side
- No new TanStack Query keys, no client-side changes
- No new DB writes in this story — that's Story 6.2

### What Story 6.2 Will Build On

Story 6.2 adds the matching logic inside `pollOnce`. The `// Story 6.2 will add inbox fetch and matching logic here` comment marks the exact extension point. Story 6.2 will also need:
- A `source` column added to `status_events` table via new Drizzle migration
- `statusEventSchema` extended with `source: z.enum(['manual', 'email'])`
- Fuzzy matching logic added to `pollOnce`

### File Structure After This Story

```
src/
  server/
    services/
      imap-poller.ts          ← NEW
      imap-poller.test.ts     ← NEW
      oauth-client.ts         (unchanged)
      sheets-sync.ts          (unchanged)
  index.ts                    ← MODIFIED (import + call startImapPoller)
.env.example                  ← MODIFIED (uncomment IMAP vars, add POLL_INTERVAL)
```

### Previous Story Learnings (from Story 5.2)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **TypeScript strict mode** — `noUnusedLocals`/`noUnusedParameters` are compile errors; every variable and parameter must be used
- **`bun x` for package installs** — use `/home/zac/.bun/bin/bun add <package>` not `npm install`
- **`bun:test` imports** — `describe`, `test`, `expect`, `mock`, `beforeEach`, `afterEach` all from `'bun:test'` only
- **Test file co-location** — place `imap-poller.test.ts` beside `imap-poller.ts`, not in a separate directory

### References

- Epic 6 story requirements: `_bmad-output/planning-artifacts/epics/epic-6-post-mvp-email-status-detection.md`
- Architecture post-MVP extension points: `_bmad-output/planning-artifacts/architecture-distillate.md` ("Post-MVP Extension Points" section)
- Entry point to modify: `job-hunt-dashboard/src/index.ts`
- Env vars reference: `job-hunt-dashboard/.env.example`
- Project rules: `_bmad-output/project-context.md`
- Service naming pattern: `job-hunt-dashboard/src/server/services/oauth-client.ts`

## Dev Agent Record

### Agent Model Used

(to be filled in)

### Completion Notes List

(to be filled in)

### File List

(to be filled in)

## Change Log

- 2026-04-05: Story created by SM agent (create-story workflow)
