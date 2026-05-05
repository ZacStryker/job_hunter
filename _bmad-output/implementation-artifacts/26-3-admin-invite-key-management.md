# Story 26.3: Admin Invite Key Management

Status: done

## Story

As an admin,
I want to generate, view, and revoke invite keys from within the admin panel,
So that I can control who can register and share credentials with invited users without direct database access.

## Acceptance Criteria

1. **Given** a valid admin session
   **When** `GET /api/admin/invite-keys` is called
   **Then** response is `200 [ { id, key, status, usedByEmail, usedAt } ]`
   **And** `status` is `'unused'` if `used_by_user_id` is null, otherwise `'used'`
   **And** `usedByEmail` is the email of the user who consumed the key, or `null`
   **And** `usedAt` is an ISO 8601 string or `null`

2. **Given** a valid admin session
   **When** `POST /api/admin/invite-keys` is called with no body
   **Then** a new key is generated as 12 uppercase alphanumeric characters formatted `XXXX-XXXX-XXXX` using server-side `crypto.randomBytes`
   **And** the key is inserted into `invite_keys` with `used_by_user_id = null`, `used_at = null`
   **And** response is `201 { id, key, status: 'unused', usedByEmail: null, usedAt: null }`

3. **Given** a valid admin session and an unused key
   **When** `DELETE /api/admin/invite-keys/:id` is called
   **Then** the key row is deleted; response is `204`

4. **Given** the target key has already been used (`used_by_user_id` is not null)
   **When** `DELETE /api/admin/invite-keys/:id` is called
   **Then** response is `409 { error: "Cannot revoke a used invite key" }`

5. **Given** I am logged in as admin and navigate to `/admin/users`
   **When** the page loads
   **Then** below the user table I see an "Invite Keys" card section (`rounded-lg border border-zinc-800 bg-zinc-900`) with a "Generate Key" button (`bg-blue-600`) in the card header

6. **Given** invite keys exist
   **When** the Invite Keys section loads
   **Then** I see a compact table with columns: Key (font-mono), Status (badge: "Unused" zinc-700 / "Used" zinc-600), Used By (email or —), Used At (ISO date or —), Actions

7. **Given** a key has status "Unused"
   **When** I view its row
   **Then** I see a clipboard icon button that copies the key value to clipboard on click
   **And** after copying, the icon briefly transitions to a check state for 1.5 seconds
   **And** I see a "Revoke" text button (`text-red-400 hover:text-red-300`)

8. **Given** I click "Revoke"
   **When** the confirmation Dialog opens
   **Then** the dialog body reads: "This invite key will be permanently deleted and cannot be used to register."
   **And** clicking "Confirm" calls `DELETE /api/admin/invite-keys/:id`; the row disappears; a toast shows "Invite key revoked"
   **And** clicking "Cancel" closes the dialog with no action taken

9. **Given** a key has status "Used"
   **When** I view its row
   **Then** no Copy or Revoke actions are shown — used keys are permanent historical records

10. **Given** no invite keys exist
    **When** the section renders
    **Then** empty state text reads: "No invite keys. Click Generate Key to invite a new user."

11. **Given** I click "Generate Key"
    **When** the `POST /api/admin/invite-keys` request succeeds
    **Then** the new key row appears at the top of the list with status "Unused", a clipboard copy button, and a "Revoke" action
    **And** a toast shows "Invite key generated"

12. **Given** a non-admin session
    **When** any `/api/admin/invite-keys` route is accessed
    **Then** response is `403 { error: "Forbidden" }` — admin middleware enforces this (no new code needed)

## Tasks / Subtasks

### 1. Add `InviteKey` type to `src/shared/schemas.ts` (AC: #1, #2, #6)

- [x] Append after `SessionResponse`:
  ```ts
  export type InviteKey = {
    id: number
    key: string
    status: 'unused' | 'used'
    usedByEmail: string | null
    usedAt: string | null
  }
  ```

### 2. Add invite-key routes to `src/server/routes/api-admin.ts` (AC: #1–#4)

- [x] Add imports at the top of the file:
  ```ts
  import { randomBytes } from 'node:crypto'
  import { desc, leftJoin } from 'drizzle-orm'
  import { inviteKeys } from '../../db/schema'
  ```
  Note: `users`, `sessions`, `eq`, `asc` already imported. Add only `desc` from drizzle-orm and `inviteKeys` from schema. Check if `leftJoin` needs explicit import — in Drizzle ORM it is called as a method on the query builder, NOT imported directly. Remove `leftJoin` from the import line. The method is `.leftJoin()` on the query builder chain.

  Corrected imports to add:
  ```ts
  import { randomBytes } from 'node:crypto'
  import { desc } from 'drizzle-orm'
  import { inviteKeys } from '../../db/schema'
  ```

- [x] Add the key generator function (after existing imports, before first route):
  ```ts
  function generateInviteKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const bytes = randomBytes(12)
    const raw = Array.from(bytes).map(b => chars[b % chars.length]).join('')
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
  }
  ```

- [x] Add `GET /invite-keys` route — returns list ordered newest first, joined with users to get email:
  ```ts
  app.get('/invite-keys', (c) => {
    const rows = db
      .select({
        id: inviteKeys.id,
        key: inviteKeys.key,
        usedByUserId: inviteKeys.usedByUserId,
        usedAt: inviteKeys.usedAt,
        usedByEmail: users.email,
      })
      .from(inviteKeys)
      .leftJoin(users, eq(inviteKeys.usedByUserId, users.id))
      .orderBy(desc(inviteKeys.id))
      .all()

    const result = rows.map(r => ({
      id: r.id,
      key: r.key,
      status: r.usedByUserId === null ? 'unused' : 'used' as const,
      usedByEmail: r.usedByEmail ?? null,
      usedAt: r.usedAt,
    }))
    return c.json(result)
  })
  ```

- [x] Add `POST /invite-keys` route — generates and inserts a new key:
  ```ts
  app.post('/invite-keys', (c) => {
    const key = generateInviteKey()
    const inserted = db
      .insert(inviteKeys)
      .values({ key })
      .returning({ id: inviteKeys.id, key: inviteKeys.key })
      .get()
    return c.json(
      { id: inserted.id, key: inserted.key, status: 'unused', usedByEmail: null, usedAt: null },
      201,
    )
  })
  ```

- [x] Add `DELETE /invite-keys/:id` route — rejects used keys, deletes unused:
  ```ts
  app.delete('/invite-keys/:id', (c) => {
    const id = parseInt(c.req.param('id'), 10)
    if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

    const row = db
      .select({ usedByUserId: inviteKeys.usedByUserId })
      .from(inviteKeys)
      .where(eq(inviteKeys.id, id))
      .get()
    if (!row) return c.json({ error: 'Invite key not found' }, 404)
    if (row.usedByUserId !== null) {
      return c.json({ error: 'Cannot revoke a used invite key' }, 409)
    }

    db.delete(inviteKeys).where(eq(inviteKeys.id, id)).run()
    return c.body(null, 204)
  })
  ```
  Note: Place these routes AFTER the impersonate routes to preserve existing route order.

### 3. Update `src/server/routes/api-admin.test.ts` — add invite_keys DDL and tests (AC: #1–#4)

- [x] In `beforeAll`, add `invite_keys` DDL after the sessions table:
  ```ts
  prodSqlite.run(`
    CREATE TABLE IF NOT EXISTS invite_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      used_by_user_id INTEGER REFERENCES users(id),
      used_at TEXT
    )
  `)
  ```

- [x] In `beforeEach`, add cleanup BEFORE `DELETE FROM users` (FK order matters):
  ```ts
  prodSqlite.run('DELETE FROM invite_keys')
  ```
  Note: `invite_keys.used_by_user_id` references `users.id`. Delete invite_keys before users, or users before invite_keys (SQLite does not enforce FK constraints by default unless `PRAGMA foreign_keys = ON`). Safe to add before users delete.

- [x] Add `insertInviteKey` helper function after `insertSession`:
  ```ts
  function insertInviteKey(id: number, opts: { key?: string; usedByUserId?: number | null; usedAt?: string | null } = {}) {
    prodSqlite.run(
      `INSERT INTO invite_keys (id, key, used_by_user_id, used_at) VALUES (?, ?, ?, ?)`,
      [id, opts.key ?? `ABCD-EFGH-${String(id).padStart(4, '0')}`, opts.usedByUserId ?? null, opts.usedAt ?? null]
    )
  }
  ```

- [x] Add test suite for `GET /api/admin/invite-keys`:
  ```ts
  describe('GET /api/admin/invite-keys', () => {
    test('empty table returns []', async () => {
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys')
      expect(res.status).toBe(200)
      const body = await res.json() as unknown[]
      expect(body).toEqual([])
    })

    test('unused key → status unused, usedByEmail null', async () => {
      insertInviteKey(1, { key: 'AAAA-BBBB-CCCC' })
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys')
      expect(res.status).toBe(200)
      const body = await res.json() as Array<Record<string, unknown>>
      expect(body).toHaveLength(1)
      expect(body[0].key).toBe('AAAA-BBBB-CCCC')
      expect(body[0].status).toBe('unused')
      expect(body[0].usedByEmail).toBeNull()
      expect(body[0].usedAt).toBeNull()
    })

    test('used key → status used, usedByEmail populated', async () => {
      insertUser(2, { email: 'user@test.com' })
      insertInviteKey(1, { key: 'AAAA-BBBB-CCCC', usedByUserId: 2, usedAt: '2026-05-01T00:00:00.000Z' })
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys')
      expect(res.status).toBe(200)
      const body = await res.json() as Array<Record<string, unknown>>
      expect(body[0].status).toBe('used')
      expect(body[0].usedByEmail).toBe('user@test.com')
      expect(body[0].usedAt).toBe('2026-05-01T00:00:00.000Z')
    })

    test('keys ordered newest first (desc id)', async () => {
      insertInviteKey(1, { key: 'AAAA-AAAA-0001' })
      insertInviteKey(2, { key: 'BBBB-BBBB-0002' })
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys')
      const body = await res.json() as Array<Record<string, unknown>>
      expect(body[0].id).toBe(2)
      expect(body[1].id).toBe(1)
    })
  })
  ```

- [x] Add test suite for `POST /api/admin/invite-keys`:
  ```ts
  describe('POST /api/admin/invite-keys', () => {
    test('generates key → 201 with XXXX-XXXX-XXXX format', async () => {
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys', { method: 'POST' })
      expect(res.status).toBe(201)
      const body = await res.json() as Record<string, unknown>
      expect(body.id).toBeTypeOf('number')
      expect(typeof body.key).toBe('string')
      expect((body.key as string)).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
      expect(body.status).toBe('unused')
      expect(body.usedByEmail).toBeNull()
      expect(body.usedAt).toBeNull()
    })

    test('key is persisted in DB', async () => {
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys', { method: 'POST' })
      const body = await res.json() as Record<string, unknown>
      const row = prodSqlite.query('SELECT * FROM invite_keys WHERE id = ?').get(body.id) as Record<string, unknown> | null
      expect(row).not.toBeNull()
      expect(row!.key).toBe(body.key)
      expect(row!.used_by_user_id).toBeNull()
    })
  })
  ```

- [x] Add test suite for `DELETE /api/admin/invite-keys/:id`:
  ```ts
  describe('DELETE /api/admin/invite-keys/:id', () => {
    test('unused key → 204, row deleted', async () => {
      insertInviteKey(1)
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys/1', { method: 'DELETE' })
      expect(res.status).toBe(204)
      const row = prodSqlite.query('SELECT * FROM invite_keys WHERE id = 1').get()
      expect(row).toBeNull()
    })

    test('used key → 409', async () => {
      insertUser(2, { email: 'user@test.com' })
      insertInviteKey(1, { usedByUserId: 2, usedAt: '2026-05-01T00:00:00.000Z' })
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys/1', { method: 'DELETE' })
      expect(res.status).toBe(409)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('Cannot revoke a used invite key')
    })

    test('key not found → 404', async () => {
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys/999', { method: 'DELETE' })
      expect(res.status).toBe(404)
    })

    test('invalid id → 400', async () => {
      const app = makeAdminApp()
      const res = await request(app, '/invite-keys/notanid', { method: 'DELETE' })
      expect(res.status).toBe(400)
    })
  })
  ```

### 4. Create `src/client/hooks/useInviteKeysQuery.ts` (AC: #5, #6, #10)

```ts
import { useQuery } from '@tanstack/react-query'
import type { InviteKey } from '@shared/schemas'

export async function fetchInviteKeys(): Promise<InviteKey[]> {
  const res = await fetch('/api/admin/invite-keys')
  if (!res.ok) throw new Error(`Failed to fetch invite keys: ${res.status}`)
  return res.json() as Promise<InviteKey[]>
}

export function useInviteKeysQuery() {
  return useQuery({
    queryKey: ['admin-invite-keys'],
    queryFn: fetchInviteKeys,
  })
}
```
Note: `fetch` (not `apiFetch`) is correct here — this is a GET request, not subject to CSRF.

### 5. Create `src/client/hooks/useGenerateInviteKeyMutation.ts` (AC: #11)

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { InviteKey } from '@shared/schemas'

export function useGenerateInviteKeyMutation() {
  const queryClient = useQueryClient()
  return useMutation<InviteKey, Error>({
    mutationFn: async () => {
      const res = await apiFetch('/api/admin/invite-keys', { method: 'POST' })
      if (!res.ok) throw new Error(`Generate key failed: ${res.status}`)
      return res.json() as Promise<InviteKey>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-invite-keys'] })
    },
  })
}
```
Note: Must use `apiFetch` (not `fetch`) — POST requires CSRF token injection.

### 6. Create `src/client/hooks/useRevokeInviteKeyMutation.ts` (AC: #8)

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export function useRevokeInviteKeyMutation() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/admin/invite-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Revoke failed: ${res.status}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-invite-keys'] })
    },
  })
}
```
Note: DELETE is a mutation — must use `apiFetch` for CSRF.

### 7. Update `src/client/routes/admin-users.tsx` — add Invite Keys section (AC: #5–#11)

- [x] Add imports at the top:
  ```ts
  import { Clipboard, Check } from 'lucide-react'
  import { useInviteKeysQuery } from '@/hooks/useInviteKeysQuery'
  import { useGenerateInviteKeyMutation } from '@/hooks/useGenerateInviteKeyMutation'
  import { useRevokeInviteKeyMutation } from '@/hooks/useRevokeInviteKeyMutation'
  import type { InviteKey } from '@shared/schemas'
  ```

- [x] Extend `DialogState` union type to include revoke-key:
  ```ts
  type DialogState =
    | { type: 'reset-pw'; user: AdminUser }
    | { type: 'impersonate'; user: AdminUser }
    | { type: 'revoke-key'; keyId: number }
    | null
  ```

- [x] Inside `AdminUsersRoute`, add invite key state and hooks after existing state declarations:
  ```ts
  const { data: inviteKeys = [], isLoading: keysLoading } = useInviteKeysQuery()
  const generateMutation = useGenerateInviteKeyMutation()
  const revokeMutation = useRevokeInviteKeyMutation()
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)
  ```

- [x] Add handler functions after existing handlers:
  ```ts
  function handleCopyKey(id: number, key: string) {
    navigator.clipboard.writeText(key).then(() => {
      setCopiedKeyId(id)
      setTimeout(() => setCopiedKeyId(null), 1500)
    })
  }

  async function handleGenerateKey() {
    try {
      await generateMutation.mutateAsync()
      toast('Invite key generated')
    } catch {
      toast.error('Failed to generate invite key')
    }
  }

  async function handleRevokeKey() {
    if (!dialog || dialog.type !== 'revoke-key') return
    try {
      await revokeMutation.mutateAsync(dialog.keyId)
      setDialog(null)
      toast('Invite key revoked')
    } catch {
      toast.error('Failed to revoke invite key')
    }
  }
  ```

- [x] Add Invite Keys card section in the JSX, below the user table `</div>` and before the dialog components:
  ```tsx
  {/* Invite Keys section */}
  <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
      <h2 className="text-sm font-medium text-zinc-100">Invite Keys</h2>
      <Button
        className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-7 px-3"
        size="sm"
        onClick={handleGenerateKey}
        disabled={generateMutation.isPending}
      >
        {generateMutation.isPending ? 'Generating…' : 'Generate Key'}
      </Button>
    </div>

    {keysLoading ? (
      <div className="px-4 py-6 text-zinc-400 text-sm">Loading…</div>
    ) : inviteKeys.length === 0 ? (
      <div className="px-4 py-6 text-center text-zinc-500 text-sm">
        No invite keys. Click Generate Key to invite a new user.
      </div>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
            <th className="text-left px-4 py-3 font-medium">Key</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Used By</th>
            <th className="text-left px-4 py-3 font-medium">Used At</th>
            <th className="text-left px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {inviteKeys.map((ik: InviteKey) => (
            <tr key={ik.id} className="border-b border-zinc-800/50">
              <td className="px-4 py-3 font-mono text-zinc-100 text-xs">{ik.key}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  ik.status === 'unused'
                    ? 'bg-zinc-700 text-zinc-300'
                    : 'bg-zinc-600 text-zinc-400'
                }`}>
                  {ik.status === 'unused' ? 'Unused' : 'Used'}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-400 text-xs">{ik.usedByEmail ?? '—'}</td>
              <td className="px-4 py-3 text-zinc-400 text-xs">
                {ik.usedAt ? new Date(ik.usedAt).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3">
                {ik.status === 'unused' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyKey(ik.id, ik.key)}
                      className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
                      aria-label={`Copy invite key ${ik.key}`}
                    >
                      {copiedKeyId === ik.id
                        ? <Check size={14} className="text-green-400" />
                        : <Clipboard size={14} />
                      }
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialog({ type: 'revoke-key', keyId: ik.id })}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
  ```

- [x] Add Revoke Key confirmation dialog alongside existing dialogs (before the closing `</div>` of the route):
  ```tsx
  {/* Revoke Key dialog */}
  <Dialog open={dialog?.type === 'revoke-key'} onOpenChange={(v) => { if (!v) setDialog(null) }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Revoke Invite Key</DialogTitle>
        <DialogDescription>
          This invite key will be permanently deleted and cannot be used to register.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
        <Button
          onClick={handleRevokeKey}
          disabled={revokeMutation.isPending}
          className="bg-red-700 hover:bg-red-600 text-white border-0"
        >
          {revokeMutation.isPending ? 'Revoking…' : 'Confirm'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  ```

### 8. Update `src/client/lib/router.ts` — add invite keys prefetch to admin route loader (AC: #5)

- [x] Import `fetchInviteKeys` alongside `fetchAdminUsers`:
  ```ts
  import { fetchAdminUsers } from '../hooks/useAdminUsersQuery'
  import { fetchInviteKeys } from '../hooks/useInviteKeysQuery'
  ```

- [x] Update `adminUsersRoute` loader to prefetch both queries:
  ```ts
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['admin-users'], queryFn: fetchAdminUsers }),
    queryClient.ensureQueryData({ queryKey: ['admin-invite-keys'], queryFn: fetchInviteKeys }),
  ]),
  ```

### 9. Update `_bmad-output/implementation-artifacts/sprint-status.yaml`

- [x] Change `26-3-admin-invite-key-management` from `backlog` to `ready-for-dev`
- [x] Update `last_updated` to `2026-05-05`

### Review Findings

**Decision Needed**

- [x] [Review][Decision] Route loader failure causes full-page error — fixed: wrapped `fetchInviteKeys` in `.catch(() => [])` so invite-keys failure degrades gracefully without taking down the user table [`router.ts`]
- [x] [Review][Decision] `usedAt` column renders `toLocaleDateString()` instead of ISO 8601 — fixed: now displays `ik.usedAt.slice(0, 10)` (e.g., `"2026-05-01"`) [`admin-users.tsx`]

**Patches**

- [x] [Review][Patch] TOCTOU race in DELETE — fixed: SELECT and DELETE now wrapped in `db.transaction()` [`api-admin.ts`]
- [x] [Review][Patch] `handleRevokeKey` discards server error message — fixed: `catch (e) { toast.error(e instanceof Error ? e.message : '...') }` [`admin-users.tsx`]
- [x] [Review][Patch] `POST /invite-keys` has no try/catch around the DB insert — fixed: wrapped in try/catch returning `{ error: 'Failed to generate invite key' }` 500 [`api-admin.ts`]

**Deferred**

- [x] [Review][Defer] `copiedKeyId` not cleared when key is revoked — cosmetic race: copied state persists for up to 1500 ms after row disappears; auto-increment prevents id reuse so no real UI corruption [`admin-users.tsx`] — deferred, cosmetic only
- [x] [Review][Defer] Double-click "Generate Key" may fire two POST requests before `isPending` re-renders — `disabled={isPending}` is the standard pattern; React 18 automatic batching mitigates most scenarios [`admin-users.tsx`] — deferred, standard pattern applied
- [x] [Review][Defer] Stale session role check in `beforeLoad` — pre-existing pattern; server middleware is the authoritative guard [`router.ts`] — deferred, pre-existing
- [x] [Review][Defer] Dialog state cleared before query refetch completes — cosmetic ~200 ms flicker where revoked key remains visible; inherent to refetch-on-invalidation pattern [`admin-users.tsx`] — deferred, cosmetic
- [x] [Review][Defer] CSRF expiry causes generic error toast with no session-expiry hint — pre-existing apiFetch pattern across all mutations — deferred, pre-existing
- [x] [Review][Defer] No `staleTime` on `useInviteKeysQuery` — causes unnecessary background refetches on window focus; `staleTime: 30_000` would match other queries [`useInviteKeysQuery.ts`] — deferred, optimization
- [x] [Review][Defer] No test covers route loader failure path for `fetchInviteKeys` — coverage gap [`api-admin.test.ts`] — deferred, coverage gap
- [x] [Review][Defer] AC11 new key appears after refetch latency, not immediately on POST response — optimistic prepend not implemented; refetch pattern is acceptable for admin UI — deferred, acceptable for scope
- [x] [Review][Defer] AC5 Generate Key button `size="sm"` + explicit class overrides may conflict in shadcn depending on `cn()` merge order — verify at runtime [`admin-users.tsx`] — deferred, visual only
- [x] [Review][Defer] `insertInviteKey` test helper produces 15-char key for `id ≥ 10000` — `padStart(4, '0')` overflows; unrealistic in test setup [`api-admin.test.ts`] — deferred, unrealistic scenario

## Dev Notes

### Critical: All Mutations Must Use `apiFetch`

All POST and DELETE requests from client hooks MUST use `apiFetch` (from `src/client/lib/api.ts`) to inject the CSRF token. Using `fetch()` directly for these will fail CSRF validation. GET requests use `fetch()` normally (no CSRF needed).

### Critical: `inviteKeys` Table Already Exists

The `invite_keys` table was created in migration `0019_auth_schema.sql`. No new migration needed. The Drizzle schema object `inviteKeys` is already exported from `src/db/schema.ts`. Import it directly — do not redefine.

### Critical: LEFT JOIN Syntax in Drizzle

The `leftJoin` is a method on the Drizzle query builder chain, NOT an import from `drizzle-orm`. Correct usage:
```ts
db.select({ ... }).from(inviteKeys).leftJoin(users, eq(inviteKeys.usedByUserId, users.id))
```
Do NOT try to import `leftJoin` from drizzle-orm as a function.

### Critical: 204 Response in Hono

Use `c.body(null, 204)` to return 204 No Content. Do not use `c.json(null, 204)` (it will serialize `null` as a body). The DELETE route must return `c.body(null, 204)`.

### Critical: `POST /api/admin/invite-keys` Route Order

Hono matches routes in registration order. The new `/invite-keys` routes must be placed AFTER the existing `/impersonate/exit` and `/impersonate/:id` routes to avoid any path conflicts (none exist in this case, but maintain the established ordering discipline).

### Critical: `INSERT ... RETURNING` Syntax in Drizzle

Drizzle's `insert(...).values(...).returning({ ... }).get()` is valid for SQLite (bun:sqlite) with Drizzle ORM. The `.get()` at the end retrieves the single returned row. Do NOT use `.all()` — there is only one inserted row. If Drizzle's `.returning()` is unavailable (check Drizzle version ≥0.44.0 — confirmed in project), alternatively:
```ts
db.insert(inviteKeys).values({ key }).run()
const inserted = db.select({ id: inviteKeys.id, key: inviteKeys.key })
  .from(inviteKeys).where(eq(inviteKeys.key, key)).get()!
```
Prefer the `.returning()` approach as it avoids the second SELECT.

### Critical: TypeScript Strict Mode — `InviteKey` Type Annotation in JSX

The `inviteKeys.map((ik: InviteKey) => ...)` annotation is required to avoid TypeScript inference issues when `inviteKeys` defaults to an empty `InviteKey[]`. Without it, TypeScript may infer `ik` as `never[]` in some edge cases. The `import type { InviteKey }` import already handles the type availability.

### Key Generation — Modulo Bias Is Acceptable

The `b % chars.length` approach (where `chars.length = 36`) has minor modulo bias (characters A–D appear with probability 8/256 vs 7/256). This is intentional and acceptable for invite keys per the spec's use of `crypto.randomBytes`. Do not add rejection sampling — it would overcomplicate for no security benefit at this scale.

### Clipboard API — Browser Compatibility

`navigator.clipboard.writeText()` is available in modern Firefox (the only browser target). No polyfill needed. The `.then()` callback only transitions the icon on success — if clipboard access is denied, the icon stays as-is (no error feedback required per the AC).

### Invite Keys Section Position

The Invite Keys card must be below the user table (physically below in JSX, separated by `mt-6`). Both live in the same route component (`AdminUsersRoute`) — no new route, no new page.

### `copiedKeyId` State Reset

The `setTimeout(() => setCopiedKeyId(null), 1500)` call creates a closure over `setCopiedKeyId`. If the user navigates away before 1500ms, React will log a "setState on unmounted component" warning. This is a pre-existing pattern acceptable at this scale — do not add `useEffect` cleanup unless a lint warning appears.

### No Unused Variables

TypeScript strict mode enforces `noUnusedLocals`. The `InviteKey` import must actually be used in the JSX type annotation on `inviteKeys.map()`. If TypeScript infers the type automatically and the annotation causes a warning, remove it — trust Drizzle/React inference.

### Test File: `beforeEach` Cleanup Order

SQLite (without `PRAGMA foreign_keys = ON`) does not enforce FK constraints. However, delete `invite_keys` before `users` in `beforeEach` to maintain safe ordering in case FK enforcement is ever enabled:
```ts
beforeEach(() => {
  prodSqlite.run('DELETE FROM invite_keys')
  prodSqlite.run('DELETE FROM sessions')
  prodSqlite.run('DELETE FROM users')
})
```

### File Structure

**New files:**
```
job-hunt-dashboard/src/client/hooks/useInviteKeysQuery.ts
job-hunt-dashboard/src/client/hooks/useGenerateInviteKeyMutation.ts
job-hunt-dashboard/src/client/hooks/useRevokeInviteKeyMutation.ts
```

**Modified files:**
```
job-hunt-dashboard/src/shared/schemas.ts                   ← add InviteKey type
job-hunt-dashboard/src/server/routes/api-admin.ts          ← add 3 invite-key routes + generateInviteKey fn
job-hunt-dashboard/src/server/routes/api-admin.test.ts     ← add DDL + 3 new describe blocks
job-hunt-dashboard/src/client/routes/admin-users.tsx       ← add invite keys section + dialog
job-hunt-dashboard/src/client/lib/router.ts                ← update admin loader
_bmad-output/implementation-artifacts/sprint-status.yaml   ← update status
```

### References

- Epic 26 spec (story 26.3 ACs): `_bmad-output/planning-artifacts/epics/epic-26-admin-user-management.md#story-263`
- UX spec (confirm dialogs, invite key field styling): `_bmad-output/planning-artifacts/ux-design-specification/auth-onboarding-admin-ux.md`
- Story 26.2 implementation (existing admin-users.tsx, dialog patterns, apiFetch usage): `_bmad-output/implementation-artifacts/26-2-admin-ui-user-table-inline-actions-and-impersonation-banner.md`
- Existing admin API routes: `src/server/routes/api-admin.ts`
- Existing admin test patterns: `src/server/routes/api-admin.test.ts`
- `inviteKeys` Drizzle table: `src/db/schema.ts:143`
- Migration that created `invite_keys`: `src/db/migrations/0019_auth_schema.sql`
- `apiFetch` (CSRF helper): `src/client/lib/api.ts`
- `fetchAdminUsers` (loader pattern to replicate): `src/client/hooks/useAdminUsersQuery.ts`
- Project context rules: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without debugging issues.

### Completion Notes List

- Added `InviteKey` type to `src/shared/schemas.ts` after `SessionResponse`
- Added `generateInviteKey()` helper and three API routes (`GET`, `POST`, `DELETE /invite-keys`) to `api-admin.ts`; placed after impersonation routes per ordering discipline
- Added `invite_keys` DDL to `beforeAll`, cleanup to `beforeEach`, `insertInviteKey` helper, and 11 new tests (4 GET + 2 POST + 4 DELETE + 1 already-existed access control) in `api-admin.test.ts` — all 35 tests pass
- Created three client hooks: `useInviteKeysQuery` (GET, uses plain `fetch`), `useGenerateInviteKeyMutation` (POST, uses `apiFetch`), `useRevokeInviteKeyMutation` (DELETE, uses `apiFetch`)
- Updated `admin-users.tsx`: added imports, extended `DialogState` union, added invite-key state/hooks, three handlers (`handleCopyKey`, `handleGenerateKey`, `handleRevokeKey`), Invite Keys card section with table, and Revoke Key dialog
- Updated `router.ts` admin route loader to prefetch both `admin-users` and `admin-invite-keys` queries via `Promise.all`
- Full regression suite: 322 tests pass, 0 failures

### File List

- `job-hunt-dashboard/src/shared/schemas.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-admin.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-admin.test.ts` (modified)
- `job-hunt-dashboard/src/client/hooks/useInviteKeysQuery.ts` (new)
- `job-hunt-dashboard/src/client/hooks/useGenerateInviteKeyMutation.ts` (new)
- `job-hunt-dashboard/src/client/hooks/useRevokeInviteKeyMutation.ts` (new)
- `job-hunt-dashboard/src/client/routes/admin-users.tsx` (modified)
- `job-hunt-dashboard/src/client/lib/router.ts` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-05-05: Story created for epic 26.3 — Admin Invite Key Management
- 2026-05-05: Implementation complete — all 9 tasks done, 11 new tests, status set to review
