# Story 43.1: Profile Schema, DB Migration & API Layer

Status: done

## Story

As a developer,
I want the new structured `ProfileData` schema defined in `shared/schemas.ts`, persisted via a new `profile_data` JSON column, and exposed through the existing `GET/PUT /api/profile` endpoints,
So that the new UI and updated consumers have a single authoritative type contract to build against.

## Acceptance Criteria

1. **Given** `shared/schemas.ts` is updated **When** the file is compiled **Then** new exported types exist: `ProfileData`, `ProfileDataInput`, `profileDataSchema`, `profileDataInputSchema` with `personal: { fullName, email, phone: null, location: null, summary: null, websites: Array<{label, url}> }` and `experience: { jobs, education, projects, certifications, licences, awards }` arrays per the epic schema. **And** `profileSchema`, `profileInputSchema`, `Profile`, `ProfileInput` (old flat types) remain exported and unchanged.

2. **Given** the Drizzle migration runs on an existing DB **When** applied **Then** `profile_data TEXT` column is added to the `profile` table. **And** existing rows are populated: `personal.fullName` = existing `name` (or `""`), `personal.email` = existing `email` (or `""`), `personal.phone/location/summary` from existing columns. If `linkedin_url` is non-null, website entry `{ label: "LinkedIn", url: linkedin_url }` is added. If `github_url` is non-null, website entry `{ label: "GitHub", url: github_url }` is added. All `experience` arrays default to `[]`. All existing columns remain intact (additive-only).

3. **Given** `GET /api/profile` when user has no profile row **Then** returns `200` with empty-but-valid `ProfileData`: `{ personal: { fullName: "", email: "", phone: null, location: null, summary: null, websites: [] }, experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] } }`.

4. **Given** `GET /api/profile` when user has a profile row with `profile_data` populated **Then** returns `200` with the parsed `ProfileData` JSON from `profile_data` column validating against `profileDataSchema`.

5. **Given** `PUT /api/profile` with valid `ProfileDataInput` body **Then** upserts `profile_data` column with serialised JSON, returns `200` with the updated `ProfileData`. **And** old flat columns (`name`, `email`, etc.) are NOT updated.

6. **Given** `PUT /api/profile` with invalid body (e.g., missing `personal.email`) **Then** returns `400 { error: string }`.

7. **Given** `useProfileQuery.ts` and `useProfileMutation.ts` updated **Then** `useProfileQuery` returns `ProfileData | undefined`; `useProfileMutation` accepts `ProfileDataInput`. Both import from `@shared/schemas`.

## Tasks / Subtasks

- [x] Task 1: Add new Zod schemas and types to `shared/schemas.ts` (AC: #1)
  - [x] Define `websiteSchema = z.object({ label: z.string(), url: z.string() })`
  - [x] Define `profilePersonalSchema` with fields: `fullName` (string), `email` (string), `phone` (string.nullable()), `location` (string.nullable()), `summary` (string.nullable()), `websites` (array of websiteSchema)
  - [x] Define all experience entry schemas: `jobEntrySchema`, `educationEntrySchema`, `degreeEntrySchema`, `projectEntrySchema`, `certEntrySchema`, `licenceEntrySchema`, `awardEntrySchema`
  - [x] Define `profileExperienceSchema` with arrays: `jobs`, `education`, `projects`, `certifications`, `licences`, `awards`
  - [x] Define `profileDataSchema = z.object({ personal: profilePersonalSchema, experience: profileExperienceSchema })`
  - [x] Define `profileDataInputSchema` (same structure — no `id` field needed since it's a JSON blob)
  - [x] Export `ProfileData = z.infer<typeof profileDataSchema>` and `ProfileDataInput = z.infer<typeof profileDataInputSchema>`
  - [x] Verify `profileSchema`, `profileInputSchema`, `Profile`, `ProfileInput` exports remain intact

- [x] Task 2: Add `profileData` column to Drizzle schema and generate migration (AC: #2)
  - [x] Add `profileData: text('profile_data')` to the `profile` table in `src/db/schema.ts`
  - [x] Run `bun run db:generate` to generate migration SQL file (will be `0032_*.sql`)
  - [x] Edit the generated SQL to add the data-population UPDATE after the ALTER TABLE — see Dev Notes for exact SQL pattern
  - [x] Verify migration is idempotent (ALTER TABLE IF NOT EXISTS column — check if Drizzle generates that or if manual guard needed)

- [x] Task 3: Update `api-profile.ts` to serve new schema (AC: #3, #4, #5, #6)
  - [x] Update GET handler: parse `row.profileData` as JSON; return `EMPTY_PROFILE_DATA` constant if no row or `profile_data` is null
  - [x] Update PUT handler: validate with `profileDataInputSchema`; store `JSON.stringify(parsed.data)` in `profile_data` column; return parsed `ProfileData`
  - [x] Update `EMPTY_PROFILE` constant → `EMPTY_PROFILE_DATA` with new structure
  - [x] Ensure `onConflictDoUpdate` only sets `profileData` (does NOT touch old flat columns)

- [x] Task 4: Update client hooks (AC: #7)
  - [x] Update `useProfileQuery.ts`: import `profileDataSchema`, `ProfileData`; parse with `profileDataSchema.parse(data)` in `fetchProfile`
  - [x] Update `useProfileMutation.ts`: import `profileDataSchema`, `ProfileDataInput`; `mutationFn` accepts `ProfileDataInput`; parse response with `profileDataSchema.parse(...)`

- [x] Task 5: Update `api-profile.test.ts` (AC: #3–#6)
  - [x] Add `profile_data TEXT` column to `CREATE_PROFILE_TABLE` SQL in test
  - [x] Update existing GET empty-profile test to assert new `ProfileData` shape (not old flat fields)
  - [x] Update existing PUT tests to use new `ProfileDataInput` payload shape
  - [x] Add test: GET with `profile_data` populated returns parsed `ProfileData`
  - [x] Add test: PUT with valid `ProfileDataInput` stores JSON in `profile_data`, does not modify old flat columns
  - [x] Add test: PUT with missing `personal.email` returns 400 `{ error }` not `{ message }`
  - [x] Verify all ~402 existing passing tests still pass after changes

## Dev Notes

### Exact New Schema Shape

```typescript
// In shared/schemas.ts — add AFTER existing profileSchema/profileInputSchema block

export const websiteSchema = z.object({ label: z.string(), url: z.string() })

export const jobEntrySchema = z.object({
  title: z.string(),
  company: z.string(),
  startDate: z.string(),                   // YYYY-MM
  endDate: z.string().nullable(),          // YYYY-MM or null
  current: z.boolean().default(false),
  employmentType: z.string().optional(),
  bullets: z.array(z.string()).default([]),
})

export const degreeEntrySchema = z.object({
  degreeType: z.string(),
  degreeSubject: z.string(),
  graduationDate: z.string().nullable(),   // YYYY-MM or null
})

export const educationEntrySchema = z.object({
  name: z.string(),
  school: z.string(),
  current: z.boolean().default(false),
  degrees: z.array(degreeEntrySchema).default([]),
})

export const projectEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
})

export const certEntrySchema = z.object({
  name: z.string(),
  issuer: z.string(),
  year: z.string(),    // YYYY
})

// licenceEntrySchema and awardEntrySchema identical to certEntrySchema
export const licenceEntrySchema = certEntrySchema
export const awardEntrySchema = certEntrySchema

export const profilePersonalSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  summary: z.string().nullable(),
  websites: z.array(websiteSchema).default([]),
})

export const profileExperienceSchema = z.object({
  jobs: z.array(jobEntrySchema).default([]),
  education: z.array(educationEntrySchema).default([]),
  projects: z.array(projectEntrySchema).default([]),
  certifications: z.array(certEntrySchema).default([]),
  licences: z.array(licenceEntrySchema).default([]),
  awards: z.array(awardEntrySchema).default([]),
})

export const profileDataSchema = z.object({
  personal: profilePersonalSchema,
  experience: profileExperienceSchema,
})

export const profileDataInputSchema = profileDataSchema

export type ProfileData = z.infer<typeof profileDataSchema>
export type ProfileDataInput = z.infer<typeof profileDataInputSchema>
```

**IMPORTANT:** Keep `profileSchema`, `profileInputSchema`, `Profile`, `ProfileInput` untouched. All four must remain exported — downstream consumers (analysis-service, cover-letter-service, resume-service) still read old flat columns and are updated in Story 43.5.

### Drizzle Schema Change

Add to the `profile` table definition in `src/db/schema.ts`:

```typescript
profileData: text('profile_data'),   // Add after `education` column
```

Run `bun run db:generate` — this produces `0032_<generated-name>.sql`. The generated SQL will contain only the `ALTER TABLE` statement. You MUST manually append the data-population UPDATE block:

```sql
-- Drizzle-generated ALTER TABLE (keep as-is):
ALTER TABLE `profile` ADD `profile_data` text;

-- Manually append: populate from existing flat columns
UPDATE profile
SET profile_data = json_object(
  'personal', json_object(
    'fullName',  COALESCE(name, ''),
    'email',     COALESCE(email, ''),
    'phone',     phone,
    'location',  location,
    'summary',   summary,
    'websites',  json_array(
      -- LinkedIn entry (only if non-null)
      CASE WHEN linkedin_url IS NOT NULL
           THEN json_object('label', 'LinkedIn', 'url', linkedin_url)
      END,
      -- GitHub entry (only if non-null)
      CASE WHEN github_url IS NOT NULL
           THEN json_object('label', 'GitHub', 'url', github_url)
      END
    )
  ),
  'experience', json_object(
    'jobs',           json_array(),
    'education',      json_array(),
    'projects',       json_array(),
    'certifications', json_array(),
    'licences',       json_array(),
    'awards',         json_array()
  )
)
WHERE profile_data IS NULL;
```

**NOTE on json_array with CASE WHEN nulls:** SQLite's `json_array()` includes `null` elements when CASE WHEN returns null. Use a subquery or filter to avoid null website entries. Simplest correct approach:

```sql
UPDATE profile
SET profile_data = (
  SELECT json_object(
    'personal', json_object(
      'fullName',  COALESCE(p.name, ''),
      'email',     COALESCE(p.email, ''),
      'phone',     p.phone,
      'location',  p.location,
      'summary',   p.summary,
      'websites',  (
        SELECT json_group_array(json_object('label', lbl, 'url', url))
        FROM (
          SELECT 'LinkedIn' AS lbl, p.linkedin_url AS url WHERE p.linkedin_url IS NOT NULL
          UNION ALL
          SELECT 'GitHub'   AS lbl, p.github_url   AS url WHERE p.github_url   IS NOT NULL
        )
      )
    ),
    'experience', json_object(
      'jobs',           json_array(),
      'education',      json_array(),
      'projects',       json_array(),
      'certifications', json_array(),
      'licences',       json_array(),
      'awards',         json_array()
    )
  )
  FROM profile p WHERE p.id = profile.id
)
WHERE profile_data IS NULL;
```

### Updated `api-profile.ts`

The route completely changes semantics — it now serves `ProfileData` instead of the flat profile row.

```typescript
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { profile } from '../../db/schema'
import { profileDataInputSchema } from '../../shared/schemas'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

const EMPTY_PROFILE_DATA = {
  personal: {
    fullName: '',
    email: '',
    phone: null,
    location: null,
    summary: null,
    websites: [],
  },
  experience: {
    jobs: [],
    education: [],
    projects: [],
    certifications: [],
    licences: [],
    awards: [],
  },
}

app.get('/', (c) => {
  const userId = c.get('userId')
  const row = db.select().from(profile).where(eq(profile.userId, userId)).get()
  if (!row?.profileData) return c.json(EMPTY_PROFILE_DATA)
  try {
    return c.json(JSON.parse(row.profileData))
  } catch {
    return c.json(EMPTY_PROFILE_DATA)
  }
})

app.put('/', async (c) => {
  const userId = c.get('userId')
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = profileDataInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }

  db.insert(profile)
    .values({ userId, profileData: JSON.stringify(parsed.data) })
    .onConflictDoUpdate({
      target: profile.userId,
      set: { profileData: JSON.stringify(parsed.data) },
    })
    .run()

  return c.json(parsed.data)
})

export default app
```

**Key points:**
- GET returns `EMPTY_PROFILE_DATA` (not the old flat-field object) when no row or `profile_data` is null
- PUT only sets `profileData` in the upsert — does NOT touch `name`, `email`, `phone`, `location`, `linkedinUrl`, `githubUrl`, `summary`, `experience`, `skills`, `education`
- Response is `parsed.data` (the Zod-parsed object), not a DB row with extra fields
- Uses `.run()` not `.returning().get()` to avoid returning old flat columns

### Updated Hooks

**`useProfileQuery.ts`:**
```typescript
import { useQuery } from '@tanstack/react-query'
import { profileDataSchema } from '@shared/schemas'
import type { ProfileData } from '@shared/schemas'

export async function fetchProfile(): Promise<ProfileData> {
  const res = await fetch('/api/profile')
  if (!res.ok) throw new Error('Failed to fetch profile')
  const data = await res.json()
  return profileDataSchema.parse(data)
}

export function useProfileQuery() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })
}
```

**`useProfileMutation.ts`:**
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileDataSchema } from '@shared/schemas'
import type { ProfileDataInput } from '@shared/schemas'
import { apiFetch } from '../lib/api'

export function useProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProfileDataInput) => {
      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? 'Failed to save profile')
      }
      return profileDataSchema.parse(await res.json())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
```

### Test File Updates (`api-profile.test.ts`)

The existing test file tests the OLD flat profile API. This story changes the API contract completely — the existing tests must be updated to match new behavior. The `CREATE_PROFILE_TABLE` SQL must include `profile_data TEXT`:

```typescript
const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    summary TEXT,
    experience TEXT,
    skills TEXT,
    education TEXT,
    profile_data TEXT,
    UNIQUE(user_id)
  )
`
```

**Key test behavior changes:**
- Empty GET now returns `{ personal: { fullName: "", email: "", ... }, experience: { jobs: [], ... } }` — not `{ id: null, name: null, ... }`
- PUT payload is now `ProfileDataInput` shape, not old flat fields
- PUT response is the `ProfileData` object, not a DB row (no `id` field in response)
- 400 validation test: send `{ personal: { fullName: 'x' } }` (missing `personal.email`) → expect 400 with `error` key

**New tests to add:**
```typescript
describe('GET /api/profile — new schema', () => {
  test('returns EMPTY_PROFILE_DATA when no row exists', async () => {
    const res = await profileApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personal.fullName).toBe('')
    expect(body.personal.email).toBe('')
    expect(body.personal.phone).toBeNull()
    expect(body.personal.websites).toEqual([])
    expect(body.experience.jobs).toEqual([])
  })

  test('returns parsed ProfileData from profile_data column', async () => {
    const profileData = { personal: { fullName: 'Alice', email: 'alice@example.com', phone: null, location: null, summary: null, websites: [] }, experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] } }
    prodSqlite.run(`INSERT INTO profile (user_id, profile_data) VALUES (1, ?)`, [JSON.stringify(profileData)])
    const res = await profileApp.request('/', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personal.fullName).toBe('Alice')
    expect(body.personal.email).toBe('alice@example.com')
  })
})

describe('PUT /api/profile — new schema', () => {
  test('creates row and returns ProfileData', async () => {
    const payload = { personal: { fullName: 'Alice', email: 'alice@example.com', phone: null, location: null, summary: null, websites: [] }, experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] } }
    const res = await profileApp.request('/', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personal.fullName).toBe('Alice')
    expect(body.personal.email).toBe('alice@example.com')
    expect(body.experience.jobs).toEqual([])
  })

  test('does NOT update old flat columns', async () => {
    prodSqlite.run(`INSERT INTO profile (user_id, name, email) VALUES (1, 'OldName', 'old@example.com')`)
    const payload = { personal: { fullName: 'NewName', email: 'new@example.com', phone: null, location: null, summary: null, websites: [] }, experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] } }
    await profileApp.request('/', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const row = prodSqlite.query('SELECT name, email FROM profile WHERE user_id = 1').get() as { name: string; email: string }
    expect(row.name).toBe('OldName')   // flat column NOT overwritten
    expect(row.email).toBe('old@example.com')
  })

  test('returns 400 with error key when personal.email missing', async () => {
    const res = await profileApp.request('/', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personal: { fullName: 'x' }, experience: {} }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('message')
  })
})
```

### Project Structure Notes

**Files to create/modify:**
| File | Action |
|------|--------|
| `job-hunt-dashboard/src/shared/schemas.ts` | Add new schema definitions after existing profileSchema block |
| `job-hunt-dashboard/src/db/schema.ts` | Add `profileData: text('profile_data')` to `profile` table |
| `job-hunt-dashboard/src/db/migrations/0032_*.sql` | Generated by `bun run db:generate`; manually edit to add population UPDATE |
| `job-hunt-dashboard/src/server/routes/api-profile.ts` | Rewrite GET/PUT to serve new schema |
| `job-hunt-dashboard/src/server/routes/api-profile.test.ts` | Update CREATE_PROFILE_TABLE; update/add tests for new API contract |
| `job-hunt-dashboard/src/client/hooks/useProfileQuery.ts` | Update imports and types |
| `job-hunt-dashboard/src/client/hooks/useProfileMutation.ts` | Update imports and types |

**Do NOT modify:**
- `analysis-service.ts`, `cover-letter-service.ts`, `resume-service.ts`, `discovery-service.ts` — these still read old flat columns; updated in Story 43.5
- `profile-resume.tsx` — UI replaced in Story 43.2
- `profileSchema`, `profileInputSchema` in `schemas.ts` — keep intact for backward compat

### Architecture & Anti-Pattern Guardrails

- **SQLite JSON:** `profile_data` is `text` column — always `JSON.stringify()` on write, `JSON.parse()` on read. No Drizzle JSON mode — just raw text.
- **Drizzle `casing: 'camelCase'`:** Column `profile_data` in SQL → `profileData` in TypeScript. Never add `.as('profileData')` alias.
- **Upsert target:** `profile.userId` (single column, unique index `profile_user_id_idx` already exists). Same pattern as before.
- **Error shape invariant:** All error responses must be `{ error: string }`. Never `{ message: string }`.
- **Import path:** Types imported by hooks via `@shared/schemas` alias, not relative paths.
- **No inline type redefinition:** All new types (`ProfileData`, `ProfileDataInput`) must come from `shared/schemas.ts` only.
- **TypeScript strict mode:** No unused vars/params. If `profileInputSchema` import is no longer used in `api-profile.ts` after the update, remove it.
- **Test isolation pattern (exact):** `process.env.DB_PATH = ':memory:'` at file top, before all imports. Table created in `beforeAll` via raw SQL. Rows cleared in `beforeEach` with `DELETE FROM profile`.

### Previous Story Intelligence (from Epic 42)

- Test pattern for accessing raw SQLite: `(prodDb as unknown as { $client: Database }).$client` — use this in test file to get `prodSqlite`.
- `prodSqlite.run()` is the pattern for DDL and raw inserts in tests.
- `bun:test` only — never import from `vitest` or `jest`.
- Test baseline before this story: **402 passing / ~13 failing** (pre-existing failures in `api-onboarding`, `api-messages`, `api-cover-letter`, `discovery-service` — do not investigate, leave as-is).
- TypeScript compile must pass with zero new errors (`bun tsc --noEmit`).
- No `__tests__/` directories — test files co-located with the file under test.

### Verification Steps

1. `bun tsc --noEmit` — zero new TypeScript errors
2. `bun test api-profile.test.ts` — all tests pass (new + updated)
3. `bun test` — 402+ passing; pre-existing failures unchanged; zero new failures
4. Manual: `bun run dev` → `curl -s http://localhost:3001/api/profile` (with session cookie) should return new `ProfileData` shape
5. Manual: migration runs cleanly on existing DB with real data (check `profile_data` populated correctly with LinkedIn/GitHub website entries where applicable)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Multi-file test isolation: Other test files (cover-letter-service, resume-service, analysis-service, etc.) create `profile` table without `profile_data` column. When Bun runs files in shared workers, `CREATE TABLE IF NOT EXISTS` in `beforeAll` is a no-op if another file already created the table. Fixed by adding `ALTER TABLE profile ADD COLUMN profile_data TEXT` in a try/catch after the CREATE TABLE in `beforeAll`.
- Drizzle migration idempotency: `ALTER TABLE ... ADD ... text` (no IF NOT EXISTS support in SQLite). The migration runner uses `pragma user_version` to track which migrations ran, so idempotency is guaranteed by the migration runner itself — no manual guard needed.

### Completion Notes List

- Added full `ProfileData`/`ProfileDataInput` schema to `shared/schemas.ts` after existing `profileSchema` block; old flat types (`profileSchema`, `profileInputSchema`, `Profile`, `ProfileInput`) left completely intact.
- Generated migration `0032_steady_bromley.sql` via `bun run db:generate`; manually appended `UPDATE profile SET profile_data = (...)` block using `json_group_array` subquery pattern to correctly handle NULL LinkedIn/GitHub URLs.
- `api-profile.ts` completely rewritten to serve `ProfileData` shape; only `profileData` is written on upsert — old flat columns untouched.
- Client hooks updated: `useProfileQuery` now returns `ProfileData`, `useProfileMutation` accepts `ProfileDataInput`.
- 9 tests in `api-profile.test.ts` (all new/rewritten): 9/9 pass in isolation and in full suite (403 total passing, 13 pre-existing failures unchanged).

### File List

- job-hunt-dashboard/src/shared/schemas.ts
- job-hunt-dashboard/src/db/schema.ts
- job-hunt-dashboard/src/db/migrations/0032_steady_bromley.sql
- job-hunt-dashboard/src/server/routes/api-profile.ts
- job-hunt-dashboard/src/server/routes/api-profile.test.ts
- job-hunt-dashboard/src/client/hooks/useProfileQuery.ts
- job-hunt-dashboard/src/client/hooks/useProfileMutation.ts

### Review Findings

- [x] [Review][Patch] GET handler returns raw `JSON.parse` output without Zod schema validation before sending to client [`api-profile.ts:34`] — fixed: now uses `profileDataSchema.safeParse()`, falls back to `EMPTY_PROFILE_DATA` on validation failure.
- [x] [Review][Patch] Test `beforeAll` catch block silently swallows all exceptions, not only duplicate-column errors [`api-profile.test.ts:41-43`] — fixed: re-throws unless `String(e).includes('duplicate column')`.
- [x] [Review][Defer] `resume-service.ts` still reads flat profile columns (name, email, phone, etc.) — deferred, planned for Story 43.5
- [x] [Review][Defer] `cover-letter-service.ts` still reads flat profile columns — deferred, planned for Story 43.5
- [x] [Review][Defer] `discovery-service.ts` builds resumeText from flat columns (summary, experience, skills) — deferred, planned for Story 43.5
- [x] [Review][Defer] `analysis-service.ts` reads flat columns for LLM candidate context — deferred, planned for Story 43.5
- [x] [Review][Defer] `api-jobs.ts` PDF/cover-letter Content-Disposition filenames use flat `profileRow.name` — deferred, planned for Story 43.5
- [x] [Review][Defer] `profile-resume.tsx` still imports `ProfileInput` and references flat fields (data.name, data.linkedinUrl, etc.) — deferred, planned for Story 43.2
- [x] [Review][Defer] `profilePersonalSchema` email field uses `z.string()` not `z.string().email()` — deferred, out of scope; schema hardening for future story
- [x] [Review][Defer] `jobEntrySchema.endDate` nullable with no cross-field invariant enforcing `current === true` — deferred, out of scope; schema refinement for future story

### Change Log

- 2026-06-10: Implemented story 43.1 — ProfileData schema, DB migration, API layer rewrite, and client hook updates.
- 2026-06-10: Code review complete — 2 patch findings, 8 deferred.
