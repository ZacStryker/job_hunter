# Story 35.3: Profile > API Keys & Inbox Mapping Subpages

Status: done

## Story

As a user managing integrations,
I want dedicated subpages for my Anthropic API key and IMAP inbox settings,
so that I can view, update, and test these credentials independently of the onboarding flow.

## Acceptance Criteria

1. **Given** the user navigates to `/config/profile/api-keys`, **When** the page loads, **Then** a form renders with: a masked input for the Anthropic API key, a "Test" button, and a "Save" button. If `hasAnthropicKey` is true, a "Configured" status chip is shown.

2. **Given** the user enters a valid Anthropic API key and clicks Test, **When** the test request completes, **Then** a success indicator is shown ("✓ Connected") and the Save button is enabled.

3. **Given** the user enters an invalid key and clicks Test, **When** the test request fails, **Then** a failure indicator is shown with the error message and Save remains disabled until a passing test.

4. **Given** the user clicks Save with a valid, tested key, **When** `PUT /api/onboarding/anthropic` succeeds, **Then** the key is saved, `['onboarding-status']` is invalidated, and a "API key saved" toast is shown.

5. **Given** the user navigates to `/config/profile/inbox-mapping`, **When** the page loads, **Then** two sections render: (1) IMAP Connection form (host, port, user, password) with Test and Save actions; (2) Folder Mapping table.

6. **Given** the IMAP credentials are already saved (`hasImap: true`), **When** the inbox-mapping page loads, **Then** the connection section shows a "Connected" status chip.

7. **Given** the user clicks Test on the IMAP form with valid credentials, **When** `PUT /api/onboarding/imap` is called, **Then** a success indicator shown on pass; error message on failure. On a passing test, a Save button is enabled.

8. **Given** the user clicks Save on the IMAP form after a passing test, **When** `PUT /api/onboarding/imap` succeeds, **Then** `['onboarding-status']` is invalidated and a "IMAP settings saved" toast is shown.

9. **Given** the Folder Mapping table section is rendered, **When** no mappings exist, **Then** an empty state with an "Add mapping" button is shown.

10. **Given** the user adds/edits/deletes a folder mapping row and saves, **When** the mutation succeeds (`PUT /api/config/inbox-mappings`), **Then** the updated mappings are persisted, the table reflects the saved state, and `['inbox-mappings']` is invalidated.

11. **Given** story 35.2 left API Keys and Inbox Mapping tiles as non-clickable `<div>` placeholders in `profile-index.tsx`, **When** this story is complete, **Then** those tiles are replaced with real `<Link>` components to the new routes.

## Tasks / Subtasks

- [x] Task 1 — DB migration and Drizzle schema (AC: 10)
  - [x] Create `src/db/migrations/0028_inbox_folder_mappings.sql` with `CREATE TABLE IF NOT EXISTS inbox_folder_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), folder_path TEXT NOT NULL, job_status TEXT NOT NULL, created_at TEXT NOT NULL)`; add index `CREATE INDEX IF NOT EXISTS inbox_folder_mappings_user_id_idx ON inbox_folder_mappings(user_id)`
  - [x] Add `inboxFolderMappings` table to `src/db/schema.ts` following the same pattern as `searchConfigs` (userId FK, index)
  - [x] Run `bun run db:generate` to confirm schema is consistent (optional; migration file is authoritative)

- [x] Task 2 — Shared schemas (AC: type safety across all layers)
  - [x] In `src/shared/schemas.ts`, add `inboxFolderMappingSchema`, `inboxFolderMappingInputSchema`, and exported types `InboxFolderMapping`, `InboxFolderMappingInput`
  - [x] `jobStatus` field uses `z.enum(MESSAGE_TYPES)` — reuses the already-defined `MESSAGE_TYPES` constant

- [x] Task 3 — API route for inbox-mappings (AC: 10)
  - [x] Create `src/server/routes/api-config-inbox-mappings.ts` — `GET /` returns all mappings for userId; `PUT /` full-replaces all mappings for userId (delete-all-then-insert in a transaction)
  - [x] Mount in `src/index.ts`: add `import inboxMappingsRoute from './server/routes/api-config-inbox-mappings'` and `app.route('/api/config/inbox-mappings', inboxMappingsRoute)` — place near other config routes

- [x] Task 4 — Client hooks (AC: 10)
  - [x] Create `src/client/hooks/useInboxMappingsQuery.ts` — query key `['inbox-mappings']`, fetches `GET /api/config/inbox-mappings`; export both `useInboxMappingsQuery` and `fetchInboxMappings`
  - [x] Create `src/client/hooks/useInboxMappingsMutation.ts` — `PUT /api/config/inbox-mappings` body is `InboxFolderMappingInput[]`; on success: `queryClient.invalidateQueries({ queryKey: ['inbox-mappings'] })`

- [x] Task 5 — API Keys page (AC: 1, 2, 3, 4)
  - [x] Create `src/client/routes/config/profile-api-keys.tsx` exporting `ProfileApiKeysRoute`
  - [x] State: `apiKey` (string), `apiKeyTestState` (`'idle' | 'loading' | 'pass' | 'fail'`), `apiKeyTestMsg` (string)
  - [x] Show "Configured" chip (emerald style) if `status?.hasAnthropicKey`; otherwise "Incomplete" chip
  - [x] Key input: `type="password"`, placeholder `"sk-ant-..."`, reset test state on change (same as onboarding.tsx)
  - [x] Test button: reuse `ConnectionTestButton` from `@/components/onboarding/ConnectionTestButton`; disabled when key is empty or test is loading; calls `PUT /api/onboarding/anthropic` via `apiFetch` — same logic as `handleTestAnthropicKey` in `onboarding.tsx`
  - [x] On test pass: show `<Alert>Connection successful</Alert>`; on fail: show `<Alert variant="destructive">{apiKeyTestMsg}</Alert>`
  - [x] Save button: disabled unless `apiKeyTestState === 'pass'`; on click: calls `PUT /api/onboarding/anthropic` (same API call — it tests AND saves simultaneously), then `queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })`, then `toast.success('API key saved')`, then reset `apiKey` state and `apiKeyTestState` to `'idle'`
  - [x] Data from `useOnboardingStatusQuery()` — do NOT add loading/error guards; loader pre-populates cache

- [x] Task 6 — Inbox Mapping page (AC: 5, 6, 7, 8, 9, 10)
  - [x] Create `src/client/routes/config/profile-inbox-mapping.tsx` exporting `ProfileInboxMappingRoute`
  - [x] Section 1 — IMAP Connection:
    - [x] State: `imapHost`, `imapPort` (993), `imapUser`, `imapPass`, `imapTestState`, `imapTestMsg` — identical to onboarding.tsx IMAP section
    - [x] Show "Connected" chip if `status?.hasImap`; otherwise "Not connected" chip
    - [x] Form fields: IMAP Host, Port (number), Username/Email, Password — same as onboarding.tsx step 2
    - [x] `ConnectionTestButton` calls `PUT /api/onboarding/imap` via `apiFetch` — same logic as `handleTestImap` in `onboarding.tsx`
    - [x] On test pass: `<Alert>Connection successful</Alert>`; on fail: `<Alert variant="destructive">{imapTestMsg}</Alert>`
    - [x] Save button: disabled unless `imapTestState === 'pass'`; on click: calls `PUT /api/onboarding/imap` again (same request), then `queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })`, then `toast.success('IMAP settings saved')`, then reset state
  - [x] Section 2 — Folder Mapping table:
    - [x] Use `useInboxMappingsQuery` and `useInboxMappingsMutation` hooks
    - [x] Local state: `rows` (array mirroring server data); `editingIndex` (number | null); `editDraft` (`{ folderPath, jobStatus }`)
    - [x] Table: "Folder Path" and "Job Status" columns + action column (Edit / Delete / Save / Cancel)
    - [x] Inline edit: click Edit → that row enters edit mode; inputs replace text; Save submits full `rows` array with updated row to mutation; Cancel restores
    - [x] Delete: remove row from local `rows` state and immediately call mutation with updated rows
    - [x] Add mapping: append new empty row in edit mode; if user cancels, remove it; if user saves, commit
    - [x] Job status dropdown: use a `<select>` (or shadcn Select) with `MESSAGE_TYPES` values as options
    - [x] Empty state (no mappings): message "No folder mappings configured." + "Add mapping" button
    - [x] Data from `useInboxMappingsQuery()` — do NOT add loading/error guards; loader pre-populates cache

- [x] Task 7 — Router updates (AC: 1, 5, 11)
  - [x] In `src/client/lib/router.ts`, add imports: `ProfileApiKeysRoute` from `'../routes/config/profile-api-keys'` and `ProfileInboxMappingRoute` from `'../routes/config/profile-inbox-mapping'`
  - [x] Add import: `fetchInboxMappings` from `'../hooks/useInboxMappingsQuery'`
  - [x] Add `configProfileApiKeysRoute`: `createRoute({ getParentRoute: () => configLayoutRoute, path: '/config/profile/api-keys', component: ProfileApiKeysRoute, loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }) })`
  - [x] Add `configProfileInboxMappingRoute`: `createRoute({ getParentRoute: () => configLayoutRoute, path: '/config/profile/inbox-mapping', component: ProfileInboxMappingRoute, loader: () => Promise.all([queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }), queryClient.ensureQueryData({ queryKey: ['inbox-mappings'], queryFn: fetchInboxMappings })]) })`
  - [x] Add both to `configLayoutRoute.addChildren([..., configProfileApiKeysRoute, configProfileInboxMappingRoute, ...])`

- [x] Task 8 — Update profile-index.tsx (AC: 11)
  - [x] Replace the two placeholder `<div className="... opacity-50 cursor-not-allowed">` tiles with `<Link to="/config/profile/api-keys">` and `<Link to="/config/profile/inbox-mapping">` using the same tile styling as the Resume tile (hover effect, no opacity dampening)

- [x] Task 9 — Verify build passes (AC: all)
  - [x] Run `bun run build` (or `tsc --noEmit`) to confirm zero TypeScript errors

## Dev Notes

### API Keys Page — Key Design Decisions

**This is a settings page, not onboarding.** No "Continue" / "Skip" / "Back" buttons. Just test + save.

The `PUT /api/onboarding/anthropic` endpoint both tests AND saves the key on success (it calls the Anthropic API, then encrypts and upserts). So the "Test" button and "Save" button both call the same endpoint. The pattern:
- Test: call the endpoint; if pass → enable Save; if fail → show error
- Save: call the same endpoint again; on success → invalidate + toast

This double-call is intentional — saves the key with a fresh validation.

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConnectionTestButton } from '@/components/onboarding/ConnectionTestButton'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { queryClient } from '@/lib/query-client'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'

export function ProfileApiKeysRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const [apiKey, setApiKey] = useState('')
  const [testState, setTestState] = useState<'idle' | 'loading' | 'pass' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleTest() {
    setTestState('loading')
    try {
      const res = await apiFetch('/api/onboarding/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      if (res.ok) { setTestState('pass'); setTestMsg('') }
      else { const d = await res.json() as { error: string }; setTestState('fail'); setTestMsg(d.error || 'Test failed') }
    } catch { setTestState('fail'); setTestMsg('Could not reach the server') }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await apiFetch('/api/onboarding/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
        toast.success('API key saved')
        setApiKey(''); setTestState('idle'); setTestMsg('')
      } else {
        const d = await res.json() as { error: string }
        toast.error(d.error || 'Save failed')
      }
    } catch { toast.error('Could not reach the server') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-md">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">API Keys</h1>
        {status?.hasAnthropicKey
          ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
          : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
        }
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        Enter your Anthropic API key. Find it at <span className="text-zinc-300">console.anthropic.com</span>.
      </p>
      <div className="mb-4">
        <Label htmlFor="apiKey">API Key</Label>
        <Input
          id="apiKey"
          type="password"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setTestState('idle'); setTestMsg('') }}
          className="mt-1 font-mono"
          placeholder={status?.hasAnthropicKey ? '••••••••' : 'sk-ant-...'}
        />
      </div>
      <div className="mb-3">
        <ConnectionTestButton state={testState} onTest={handleTest} disabled={!apiKey.trim() || testState === 'loading'} />
      </div>
      {testState === 'pass' && <Alert className="mb-3"><AlertDescription>Connection successful</AlertDescription></Alert>}
      {testState === 'fail' && <Alert variant="destructive" className="mb-3"><AlertDescription>{testMsg}</AlertDescription></Alert>}
      <Button disabled={testState !== 'pass' || saving} onClick={handleSave}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}
```

### Inbox Mapping Page — IMAP Section

Lift state and handlers verbatim from `onboarding.tsx` step 2. The ONLY differences from onboarding:
- No "Skip for now" / "Back" / "Continue" buttons
- Add a "Save" button (enabled after pass); on save: invalidate `['onboarding-status']` + toast
- Show "Connected" chip if `status?.hasImap`

```tsx
// IMAP section structure (within ProfileInboxMappingRoute)
<section className="mb-8">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-medium text-zinc-100">IMAP Connection</h2>
    {status?.hasImap
      ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Connected</span>
      : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Not connected</span>
    }
  </div>
  {/* imapHost, imapPort, imapUser, imapPass fields — copy from onboarding.tsx */}
  <ConnectionTestButton state={imapTestState} onTest={handleTestImap} disabled={/* same as onboarding */} />
  {/* alerts */}
  <Button disabled={imapTestState !== 'pass' || saving} onClick={handleSave}>Save</Button>
</section>
```

### Folder Mapping Table — Inline Edit Pattern

The full-replace API model (`PUT /api/config/inbox-mappings` sends all rows) simplifies individual row operations: any add/edit/delete reconstructs the full array and sends it.

```tsx
// Simplified inline edit pattern
const { data: mappings = [] } = useInboxMappingsQuery()
const mutation = useInboxMappingsMutation()
const [rows, setRows] = useState<{ folderPath: string; jobStatus: MessageType }[]>([])
const [editingIndex, setEditingIndex] = useState<number | null>(null)
const [draft, setDraft] = useState({ folderPath: '', jobStatus: 'Other' as MessageType })

// Sync server data to local rows when data loads (only if not editing)
useEffect(() => {
  if (editingIndex === null) setRows(mappings.map(m => ({ folderPath: m.folderPath, jobStatus: m.jobStatus })))
}, [mappings, editingIndex])

function saveAll(updated: typeof rows) {
  mutation.mutate(updated)
}

function handleEdit(i: number) { setDraft(rows[i]); setEditingIndex(i) }
function handleCancel() { setEditingIndex(null) }
function handleSaveRow(i: number) {
  const updated = rows.map((r, idx) => idx === i ? draft : r)
  setRows(updated); setEditingIndex(null); saveAll(updated)
}
function handleDelete(i: number) {
  const updated = rows.filter((_, idx) => idx !== i)
  setRows(updated); saveAll(updated)
}
function handleAddRow() {
  const updated = [...rows, { folderPath: '', jobStatus: 'Other' as MessageType }]
  setRows(updated); setDraft({ folderPath: '', jobStatus: 'Other' }); setEditingIndex(updated.length - 1)
}
```

Job status dropdown options: `MESSAGE_TYPES` from `@shared/schemas` — `['Submitted', 'Rejected', 'Screening', 'Interview', 'Offer', 'Other']`.

### DB Migration

Next migration number: **0028**.

```sql
-- src/db/migrations/0028_inbox_folder_mappings.sql
CREATE TABLE IF NOT EXISTS inbox_folder_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  folder_path TEXT NOT NULL,
  job_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inbox_folder_mappings_user_id_idx ON inbox_folder_mappings(user_id);
```

Drizzle schema addition (in `src/db/schema.ts`):
```typescript
export const inboxFolderMappings = sqliteTable('inbox_folder_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  folderPath: text('folder_path').notNull(),
  jobStatus: text('job_status').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('inbox_folder_mappings_user_id_idx').on(table.userId),
])
```

### Shared Schemas

Add to `src/shared/schemas.ts` (after `MESSAGE_TYPES`):
```typescript
export const inboxFolderMappingSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  folderPath: z.string(),
  jobStatus: z.enum(MESSAGE_TYPES),
  createdAt: z.string(),
})
export const inboxFolderMappingInputSchema = z.array(z.object({
  folderPath: z.string().min(1),
  jobStatus: z.enum(MESSAGE_TYPES),
}))
export type InboxFolderMapping = z.infer<typeof inboxFolderMappingSchema>
export type InboxFolderMappingInput = z.infer<typeof inboxFolderMappingInputSchema>
```

Note: `MessageType` (useful in components) = `typeof MESSAGE_TYPES[number]` — can be derived locally or exported from schemas.

### API Route — Full-Replace Pattern

```typescript
// src/server/routes/api-config-inbox-mappings.ts
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { inboxFolderMappings } from '../../db/schema'
import { inboxFolderMappingInputSchema } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

app.get('/', (c) => {
  const userId = c.get('userId')
  const rows = db.select().from(inboxFolderMappings).where(eq(inboxFolderMappings.userId, userId)).all()
  return c.json(rows)
})

app.put('/', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = inboxFolderMappingInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  const now = new Date().toISOString()
  db.transaction((tx) => {
    tx.delete(inboxFolderMappings).where(eq(inboxFolderMappings.userId, userId)).run()
    for (const row of parsed.data) {
      tx.insert(inboxFolderMappings).values({ userId, folderPath: row.folderPath, jobStatus: row.jobStatus, createdAt: now }).run()
    }
  })
  const result = db.select().from(inboxFolderMappings).where(eq(inboxFolderMappings.userId, userId)).all()
  return c.json(result)
})

export default app
```

### Client Hooks

```typescript
// src/client/hooks/useInboxMappingsQuery.ts
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { InboxFolderMapping } from '@shared/schemas'

export async function fetchInboxMappings(): Promise<InboxFolderMapping[]> {
  const res = await apiFetch('/api/config/inbox-mappings')
  if (!res.ok) throw new Error('Failed to fetch inbox mappings')
  return res.json()
}

export function useInboxMappingsQuery() {
  return useQuery({ queryKey: ['inbox-mappings'], queryFn: fetchInboxMappings })
}
```

```typescript
// src/client/hooks/useInboxMappingsMutation.ts
import { useMutation } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { apiFetch } from '@/lib/api'
import type { InboxFolderMappingInput } from '@shared/schemas'

export function useInboxMappingsMutation() {
  return useMutation({
    mutationFn: async (rows: InboxFolderMappingInput) => {
      const res = await apiFetch('/api/config/inbox-mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) throw new Error('Failed to save mappings')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-mappings'] })
    },
  })
}
```

Note: `InboxFolderMappingInput` is `z.infer<typeof inboxFolderMappingInputSchema>` which is an array type. So `mutationFn` receives the full array.

### Router Additions — Exact Code

```typescript
// Imports to add:
import { ProfileApiKeysRoute } from '../routes/config/profile-api-keys'
import { ProfileInboxMappingRoute } from '../routes/config/profile-inbox-mapping'
import { fetchInboxMappings } from '../hooks/useInboxMappingsQuery'

// New routes:
const configProfileApiKeysRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile/api-keys',
  component: ProfileApiKeysRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
})

const configProfileInboxMappingRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile/inbox-mapping',
  component: ProfileInboxMappingRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
    queryClient.ensureQueryData({ queryKey: ['inbox-mappings'], queryFn: fetchInboxMappings }),
  ]),
})

// Updated routeTree:
configLayoutRoute.addChildren([
  configOverviewRoute,
  configProfileRoute,
  configProfileResumeRoute,
  configProfileApiKeysRoute,      // ← add
  configProfileInboxMappingRoute, // ← add
  configJobSourcesRoute,
  configPromptsRoute,
  configLogsRoute,
])
```

### profile-index.tsx — Replace Placeholder Tiles

```tsx
// Replace the two <div> placeholder tiles:
<Link to="/config/profile/api-keys" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
  <div className="flex items-center justify-between">
    <span className="text-sm font-medium text-zinc-200">API Keys</span>
    {apiKeysConfigured
      ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
      : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
    }
  </div>
</Link>

<Link to="/config/profile/inbox-mapping" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
  <div className="flex items-center justify-between">
    <span className="text-sm font-medium text-zinc-200">Inbox Mapping</span>
    {inboxConfigured
      ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
      : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
    }
  </div>
</Link>
```

### Project Conventions Checklist

- Use `apiFetch` from `@/lib/api` for all API calls in components (not raw `fetch`)
- Error response shape: `{ error: string }` — check `res.ok` then parse error
- Strict TS: no unused locals; do not use `_` prefix prefixes for intentional no-ops
- All shared types from `src/shared/schemas.ts` only — never redefine inline
- Drizzle `casing: 'camelCase'` — query results auto-camelCased; never add `.as()` aliases
- Route loader data is pre-cached — omit loading/error guards in components for pre-loaded data
- Toast: `import { toast } from 'sonner'`
- `queryClient` singleton: `import { queryClient } from '@/lib/query-client'`
- No comments for obvious code; no docstrings

### File Structure Summary

```
New files:
  src/db/migrations/0028_inbox_folder_mappings.sql
  src/server/routes/api-config-inbox-mappings.ts
  src/client/hooks/useInboxMappingsQuery.ts
  src/client/hooks/useInboxMappingsMutation.ts
  src/client/routes/config/profile-api-keys.tsx
  src/client/routes/config/profile-inbox-mapping.tsx

Modified files:
  src/db/schema.ts                             ← add inboxFolderMappings table
  src/shared/schemas.ts                        ← add inbox mapping schemas + types
  src/index.ts                                 ← mount /api/config/inbox-mappings route
  src/client/lib/router.ts                     ← add 2 new routes + loaders + routeTree
  src/client/routes/config/profile-index.tsx   ← replace placeholder divs with real Links
```

### Cross-Story Context

- **Story 35.2** established: `configProfileRoute` (loader: profile + onboarding-status), `configProfileResumeRoute`, profile-index.tsx with 3-tile grid. API Keys and Inbox Mapping tiles were non-clickable `<div>` until now.
- **Story 35.4** adds Job Sources section (auth-setup + searches subpages) — do not implement beyond scope
- The `onboarding.tsx` file remains unchanged — this story lifts UI logic from it but does not modify it

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blockers encountered. Build passed cleanly on first attempt.

### Completion Notes List

- Created DB migration `0028_inbox_folder_mappings.sql` with table and index
- Added `inboxFolderMappings` Drizzle table to schema.ts
- Added `inboxFolderMappingSchema`, `inboxFolderMappingInputSchema`, `InboxFolderMapping`, `InboxFolderMappingInput` to shared/schemas.ts (placed after MESSAGE_TYPES definition to use it)
- Created `api-config-inbox-mappings.ts` Hono route with GET + PUT (full-replace transaction pattern); mounted at `/api/config/inbox-mappings` in index.ts
- Created `useInboxMappingsQuery.ts` and `useInboxMappingsMutation.ts` client hooks
- Created `profile-api-keys.tsx` — test+save pattern using same `PUT /api/onboarding/anthropic` endpoint for both; Configured/Incomplete status chip; loader pre-populates cache via onboarding-status
- Created `profile-inbox-mapping.tsx` — IMAP section (test+save via `PUT /api/onboarding/imap`) + Folder Mapping table with inline edit, delete, add row, job status select, empty state; useEffect syncs server data to local rows when not editing
- Updated router.ts with 2 new routes + loaders + children registration
- Updated profile-index.tsx — replaced 2 `<div opacity-50 cursor-not-allowed>` placeholders with real `<Link>` tiles for api-keys and inbox-mapping

### File List

- `src/db/migrations/0028_inbox_folder_mappings.sql` (new)
- `src/db/schema.ts` (modified)
- `src/shared/schemas.ts` (modified)
- `src/server/routes/api-config-inbox-mappings.ts` (new)
- `src/index.ts` (modified)
- `src/client/hooks/useInboxMappingsQuery.ts` (new)
- `src/client/hooks/useInboxMappingsMutation.ts` (new)
- `src/client/routes/config/profile-api-keys.tsx` (new)
- `src/client/routes/config/profile-inbox-mapping.tsx` (new)
- `src/client/lib/router.ts` (modified)
- `src/client/routes/config/profile-index.tsx` (modified)

### Review Findings

- [x] [Review][Patch] Success alert text is "Connection successful" instead of "✓ Connected" [profile-api-keys.tsx, profile-inbox-mapping.tsx]
- [x] [Review][Patch] handleAddRow fires saveAll immediately with empty folderPath before user types — silent 400 from server [profile-inbox-mapping.tsx]
- [x] [Review][Patch] useInboxMappingsMutation has no onError handler and no toast for row save/delete failures — errors silently dropped [useInboxMappingsMutation.ts, profile-inbox-mapping.tsx]
- [x] [Review][Patch] AC 9: Empty state missing "Add mapping" button in the empty state itself — button is only in section header [profile-inbox-mapping.tsx]
- [x] [Review][Patch] useInboxMappingsMutation throws generic Error instead of parsing server { error: string } response [useInboxMappingsMutation.ts]
- [x] [Review][Patch] DB transaction not wrapped in try/catch — any insert/delete exception returns raw 500 instead of { error: string } [api-config-inbox-mappings.ts]
- [x] [Review][Patch] No UNIQUE constraint on (user_id, folder_path) in migration and schema — duplicate folder paths accepted silently [src/db/migrations/0028_inbox_folder_mappings.sql, src/db/schema.ts]
- [x] [Review][Patch] useEffect overwrites local rows with stale server data after handleSaveRow clears editingIndex before refetch resolves — visible flicker [profile-inbox-mapping.tsx]
- [x] [Review][Defer] No array size cap (.max()) on inboxFolderMappingInputSchema — unbounded bulk insert possible — deferred, pre-existing hardening gap
- [x] [Review][Defer] No max-length validation on folderPath — deferred, pre-existing input sanitization gap
- [x] [Review][Defer] No DEFAULT on created_at in SQL migration — deferred, server always supplies value; low risk
- [x] [Review][Defer] GET response not runtime-validated against schema client-side — deferred, pre-existing pattern across codebase
- [x] [Review][Defer] key={i} on table rows — controlled inputs make this benign in practice — deferred, cleanup

## Change Log

- 2026-05-18: Story created for Epic 35 Profile > API Keys & Inbox Mapping subpages.
- 2026-05-18: Implemented all tasks; story complete and ready for review.
