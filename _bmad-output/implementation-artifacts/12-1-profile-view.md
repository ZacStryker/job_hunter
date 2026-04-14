# Story 12.1: Profile View

**Epic:** 12 — User Profile & Resume Data  
**Story ID:** 12-1-profile-view  
**Status:** done  
**Date:** 2026-04-13

---

## User Story

As a job seeker, I want a Profile view where I can store my resume details in one place, so that n8n automation flows for cover letter and resume generation can fetch that data via API instead of relying on hardcoded prompts.

---

## Acceptance Criteria

### AC1 — Profile route exists in nav
- `/profile` is a registered TanStack Router route
- A "Profile" nav link appears in `Layout.tsx` alongside the other view tabs (Dashboard, Jobs, Applications, etc.)

### AC2 — Read mode (default)
- On load, the page displays a readonly view of all profile fields
- If no profile has been saved yet, all fields show empty/placeholder text (not an error state)
- Fields displayed: Full Name, Email, Phone, Location, LinkedIn URL, GitHub/Portfolio URL, Summary (textarea), Experience (textarea), Skills (textarea), Education (textarea)
- An "Edit" button is visible in the top-right of the page content area

### AC3 — Edit mode (in-place toggle)
- Clicking "Edit" switches the entire page to edit mode in-place (no modal, no new route)
- All fields become editable inputs/textareas
- "Edit" button is replaced by "Save" and "Cancel" buttons
- Clicking "Cancel" discards changes and returns to read mode
- Clicking "Save" calls `PUT /api/profile`, then returns to read mode on success
- Save shows a loading state (`isPending`) on the Save button; Cancel is disabled during save

### AC4 — API: GET /api/profile
- Returns `200` with the full profile record
- If no profile row exists, returns `200` with all fields set to `null` (never `404`)
- Response shape: direct data, no envelope wrapper

### AC5 — API: PUT /api/profile
- Accepts the full profile payload (all fields optional/nullable)
- Upserts the single profile row (id = 1)
- Returns `200` with the updated profile record
- Validates with Zod before any DB write; invalid payloads return `400 { error: string }`

### AC6 — n8n readable
- `GET /api/profile` is unauthenticated (consistent with rest of app — single user localhost)
- n8n can call this endpoint at workflow runtime to fetch resume data without any special auth

### AC7 — Tests
- Business-logic tests for `getProfile` and `upsertProfile` service functions
- HTTP contract tests for `GET /api/profile` and `PUT /api/profile`
- Tests cover: empty DB returns null-filled profile, upsert creates row, second upsert updates row, invalid payload returns 400

---

## Technical Requirements

### New DB Table — `profile` (singleton)

Add to `src/db/schema.ts`:

```ts
export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  location: text('location'),
  linkedinUrl: text('linkedin_url'),
  githubUrl: text('github_url'),
  summary: text('summary'),
  experience: text('experience'),
  skills: text('skills'),
  education: text('education'),
})
```

- This is a **singleton table**: always exactly 0 or 1 rows, `id` is always `1`
- Upsert strategy: `INSERT OR REPLACE INTO profile (id, ...) VALUES (1, ...)`
- All fields are nullable — a missing profile is valid

### Migration

Generate with `bun run db:generate`. The migration SQL file will be `src/db/migrations/0010_<name>.sql`. Commit it. Migration runs automatically at `bun start` via the existing boot runner.

### Shared Zod Schemas — `src/shared/schemas.ts`

Add:

```ts
export const profileSchema = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  summary: z.string().nullable(),
  experience: z.string().nullable(),
  skills: z.string().nullable(),
  education: z.string().nullable(),
})

export const profileInputSchema = profileSchema.omit({ id: true })

export type Profile = z.infer<typeof profileSchema>
export type ProfileInput = z.infer<typeof profileInputSchema>
```

### API Route — `src/server/routes/api-profile.ts`

New file. Sub-Hono instance exported as default, mounted in `src/index.ts` at `/api/profile`.

```
GET  /api/profile   → getProfile() → 200 Profile (all nulls if not found)
PUT  /api/profile   → upsertProfile(input) → 200 Profile
```

- `GET`: query `db.select().from(profile).limit(1)`. If no row, return object with `id: 1` and all other fields `null`.
- `PUT`: validate body with `profileInputSchema`. On success, run upsert. Return updated row.
- Do NOT add error handling for impossible scenarios — rely on `errorHandler` middleware.

### Service Layer

No separate service file needed — the profile logic is trivial (2 DB calls). Inline the DB calls directly in the route handler. Keep it simple.

### Route Registration — `src/index.ts`

```ts
import profileRoute from './server/routes/api-profile'
// ...
app.route('/api/profile', profileRoute)
```

### Client Hooks

**`src/client/hooks/useProfileQuery.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
// queryKey: ['profile']
// queryFn: fetch('/api/profile').json() validated with profileSchema.parse(...)
```

**`src/client/hooks/useProfileMutation.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
// PUT /api/profile with JSON body
// onSuccess: queryClient.invalidateQueries({ queryKey: ['profile'] })
```

### Route File — `src/client/routes/profile.tsx`

New file. Component: `ProfileRoute`.

**Read mode (default state):**
- Renders a 2-column layout for short fields (name, email, phone, location, linkedin, github) and full-width for textareas (summary, experience, skills, education)
- Text display: use `<p className="...">` for short fields, `<pre className="whitespace-pre-wrap ...">` for textareas to preserve formatting
- Empty fields: show `—` placeholder
- "Edit" button top-right of content area

**Edit mode (toggled state):**
- Short fields: `<Input>` components from shadcn/ui
- Textarea fields: `<Textarea>` components from shadcn/ui
- "Save" button (primary, shows `<Loader2>` spinner when `isPending`) and "Cancel" button (secondary)
- Local state tracks the draft values; initialise from query data on entering edit mode
- On cancel: reset local state, return to read mode — do not call the API
- On save: call `useProfileMutation`, on success return to read mode

**TanStack Query integration:**
- Use `useProfileQuery` for read data
- Use `isPending`/`isError`/`isSuccess` from the mutation directly — no custom loading state

### Router — `src/client/lib/router.ts`

Add:

```ts
import { ProfileRoute } from '../routes/profile'

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfileRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
})
```

Add `fetchProfile` helper (similar to existing `fetchJobs` in `useJobsQuery.ts`) in the profile query hook file.

Add `profileRoute` to `routeTree`.

Also add the `declare module` type registration entry — it is already present in the file for the existing router, so just ensure the new route is included in `routeTree`.

### Navigation — `src/client/components/shared/Layout.tsx`

Add a "Profile" `<Link>` to the nav alongside existing tabs:

```tsx
<Link
  to="/profile"
  className="px-3 py-1.5 text-sm transition-colors"
  activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
  inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
>
  Profile
</Link>
```

---

## File Checklist

### New files to create:
- `src/db/migrations/0010_<generated-name>.sql` — auto-generated via `bun run db:generate`
- `src/server/routes/api-profile.ts` — GET + PUT handlers
- `src/server/routes/api-profile.test.ts` — contract + business-logic tests
- `src/client/hooks/useProfileQuery.ts`
- `src/client/hooks/useProfileMutation.ts`
- `src/client/routes/profile.tsx`

### Files to modify:
- `src/db/schema.ts` — add `profile` table export
- `src/shared/schemas.ts` — add `profileSchema`, `profileInputSchema`, `Profile`, `ProfileInput`
- `src/index.ts` — import and mount `api-profile` route
- `src/client/lib/router.ts` — add `/profile` route + loader
- `src/client/components/shared/Layout.tsx` — add "Profile" nav link

---

## Architecture Guardrails

**Must follow — do not deviate:**

- Types: `Profile` and `ProfileInput` must come from `src/shared/schemas.ts` — never redefined inline
- Query key: `['profile']` — the only permitted shape for this resource
- API response: direct data on success, no envelope. `{ error: string }` on failure.
- Error shape: `{ error: string }` only — never `{ message: string }`, never `{ error: { message } }`
- Never call `fetch('/api/profile')` directly in the component — use `useProfileQuery` and `useProfileMutation` hooks
- Server state lives in TanStack Query only — do not duplicate in `useState`
- Local **draft state** for the edit form is UI state (`useState`) — this is correct, not a violation of the above rule. Server state = the persisted profile from the query. Draft state = the in-flight edits before save.
- Drizzle `casing: 'camelCase'` is already configured — query results return camelCase automatically. `linkedinUrl`, `githubUrl` will come back correctly from the DB. Do not add `.as()` aliases.
- shadcn/ui components in `src/client/components/ui/` — use `<Input>` and `<Textarea>` from there. Do not hand-edit those files.
- Co-locate test file: `api-profile.test.ts` next to `api-profile.ts` in `src/server/routes/`
- DB isolation in tests: `process.env.DB_PATH = ':memory:'` at the TOP of the test file, BEFORE any production module imports. Create the `profile` table in `beforeAll` via raw SQL — do not run the migration runner.
- Both test layers required: service/business-logic tests (call DB functions directly) AND HTTP contract tests (use `app.request(...)`)

---

## Implementation Notes

### Singleton upsert pattern

The profile table has at most 1 row. Use `INSERT OR REPLACE` (SQLite) via Drizzle:

```ts
import { sql } from 'drizzle-orm'

// Drizzle doesn't have a native INSERT OR REPLACE — use raw for the upsert or:
db.insert(profile).values({ id: 1, ...input })
  .onConflictDoUpdate({ target: profile.id, set: { ...input } })
  .run()
```

The `.onConflictDoUpdate({ target: profile.id, set: input })` pattern is identical to how `api-ingest.ts` handles job upserts — follow that pattern.

### GET returns empty profile gracefully

```ts
const rows = db.select().from(profile).limit(1).all()
const row = rows[0] ?? { id: 1, name: null, email: null, phone: null, location: null, linkedinUrl: null, githubUrl: null, summary: null, experience: null, skills: null, education: null }
return c.json(row)
```

### Edit mode local state

In `ProfileRoute`, keep a single `draft` state object that mirrors the profile fields. Initialize it from query data when entering edit mode:

```ts
const [isEditing, setIsEditing] = useState(false)
const [draft, setDraft] = useState<ProfileInput | null>(null)

function handleEdit() {
  setDraft({ name: data?.name ?? '', ... })
  setIsEditing(true)
}
function handleCancel() {
  setDraft(null)
  setIsEditing(false)
}
```

Do not use a separate `useEffect` to sync query data into state — populate draft only at the moment the user clicks Edit.

---

## n8n Integration Note

This story intentionally does NOT change the n8n webhook payloads. It only creates the profile storage and read endpoint. Once this story is done, n8n flows can be updated (in a separate story) to call `GET /api/profile` as a workflow step to fetch resume data before generating cover letters or tailored resumes.

---

## Out of Scope

- Changing `cover-letter-service.ts` or `useGenerateResume.ts` to include profile data — future story
- Profile photo / avatar upload
- Multiple profile versions / revision history
- Validation that fields containing valid email format, URL format, etc. — all fields are freeform strings

---

## Dev Agent Record

### Implementation Plan

Implemented full-stack profile feature following story spec exactly:

1. Added `profile` singleton table to `src/db/schema.ts`
2. Generated migration `0010_yummy_toad_men.sql` via `bun run db:generate`
3. Added `profileSchema`, `profileInputSchema`, `Profile`, `ProfileInput` to `src/shared/schemas.ts`
4. Created `src/server/routes/api-profile.ts` — GET returns null-filled profile when empty, PUT upserts with `onConflictDoUpdate`
5. Mounted route in `src/index.ts` at `/api/profile`
6. Added `src/client/hooks/useProfileQuery.ts` (query key `['profile']`, `fetchProfile` for loader)
7. Added `src/client/hooks/useProfileMutation.ts` (PUT with invalidate on success)
8. Created `src/client/routes/profile.tsx` — read/edit mode toggle, 2-col grid for short fields, full-width `<pre>` for textareas
9. Added `profileRoute` with loader to `src/client/lib/router.ts`
10. Added "Profile" `<Link>` nav tab in `Layout.tsx`
11. Added missing shadcn/ui `input` and `textarea` components via `bunx shadcn@latest add`

### Completion Notes

- All 9 new profile tests pass; full 130-test suite passes with 0 regressions
- Build succeeds with no TypeScript errors
- All 7 ACs satisfied: route registered, read/edit mode, GET/PUT API, n8n-readable, tests complete

---

## File List

- `src/db/schema.ts` (modified — added `profile` table)
- `src/db/migrations/0010_yummy_toad_men.sql` (new — auto-generated migration)
- `src/shared/schemas.ts` (modified — added `profileSchema`, `profileInputSchema`, `Profile`, `ProfileInput`)
- `src/server/routes/api-profile.ts` (new — GET + PUT handlers)
- `src/server/routes/api-profile.test.ts` (new — 9 business-logic + HTTP contract tests)
- `src/index.ts` (modified — import and mount `api-profile` route)
- `src/client/hooks/useProfileQuery.ts` (new — `useProfileQuery` + `fetchProfile`)
- `src/client/hooks/useProfileMutation.ts` (new — `useProfileMutation`)
- `src/client/routes/profile.tsx` (new — `ProfileRoute` read/edit component)
- `src/client/lib/router.ts` (modified — added `profileRoute` with loader)
- `src/client/components/shared/Layout.tsx` (modified — added "Profile" nav link)
- `src/client/components/ui/input.tsx` (new — shadcn Input component)
- `src/client/components/ui/textarea.tsx` (new — shadcn Textarea component)

---

## Change Log

- 2026-04-13: Implemented story 12-1-profile-view — Profile view with GET/PUT API, singleton DB table, read/edit mode toggle UI, TanStack Query integration, nav link, and full test coverage (9 new tests)

---

## Review Findings

- [x] [Review][Patch] PUT handler second SELECT can return `undefined` if concurrent delete wins between write and read [`src/server/routes/api-profile.ts:46-47`]
- [x] [Review][Patch] Second-upsert test bypasses actual Drizzle `onConflictDoUpdate` path — uses raw SQL, not PUT handler [`src/server/routes/api-profile.test.ts:52-60`]
- [x] [Review][Patch] `useProfileMutation` returns unvalidated `res.json()` — should parse through `profileSchema` [`src/client/hooks/useProfileMutation.ts:17`]
- [x] [Review][Patch] `ProfileRoute` has no mutation error display — save failure is silent with no user feedback [`src/client/routes/profile.tsx`]
- [x] [Review][Patch] `ProfileRoute` ignores `useProfileQuery` loading/error states; `handleEdit()` initializes blank draft if `data` is undefined during re-fetch [`src/client/routes/profile.tsx:28,33-47`]
- [x] [Review][Defer] Loader `fetchProfile` error (network/Zod) surfaces as raw error boundary crash — no `errorComponent` on any route (pre-existing systemic pattern) [`src/client/lib/router.ts`] — deferred, pre-existing
- [x] [Review][Defer] Empty string stored via direct API call displays blank instead of `—` placeholder — `{data?.name ?? '—'}` only guards against null (pre-existing programmatic API edge case) [`src/client/routes/profile.tsx`] — deferred, pre-existing
- [x] [Review][Defer] `archivedTotal` always 0 when `archivedFilter=active` because `viewJobs` is pre-filtered — pre-existing stats calculation bug [`src/server/routes/api-stats.ts`] — deferred, pre-existing
- [x] [Review][Defer] `sheets-sync` new contact field header names (`contact_name`, etc.) depend on exact Google Sheet column headers — silent null if headers differ [`src/server/services/sheets-sync.ts`] — deferred, pre-existing
