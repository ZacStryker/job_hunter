# Story 39.1: Add Job Form & API — Accept Optional Job Description

Status: done

## Story

As a user adding a job manually,
I want to optionally paste the job description directly into the Add Job form,
So that I can add jobs from any source (not just scraped platforms) and still get full AI analysis.

## Acceptance Criteria

**Given** the Add Job form is open
**When** the user inspects the form fields
**Then** a "Job Description" textarea is visible below the URL field

**Given** the user has entered Company, Job Title, and a URL (but no description)
**When** the form's submit button is evaluated
**Then** the button is enabled (URL alone satisfies the validation requirement)

**Given** the user has entered Company, Job Title, and a description (but no URL)
**When** the form's submit button is evaluated
**Then** the button is enabled (description alone satisfies the validation requirement)

**Given** the user has entered Company and Job Title but neither a URL nor a description
**When** the form's submit button is evaluated
**Then** the button remains disabled

**Given** the user submits the form with a description provided
**When** the job is created
**Then** `POST /api/jobs` accepts the payload with `description` present and `sourceUrl` absent

**Given** the user submits the form with both URL and description
**When** the job is created
**Then** both are accepted and the description is stored as `jobDescription`

**Given** `POST /api/jobs` receives a payload missing both `sourceUrl` and `description`
**When** the server validates the request
**Then** a `400` response is returned with `{ error: "..." }`

**Given** a job is created with a manually-pasted description
**When** the job record is inserted into the database
**Then** `jobDescription` is populated with the user-provided text and `analysisStatus` is `'pending'`

## Tasks / Subtasks

- [x] Update `manualJobSchema` in `api-jobs.ts` to make `sourceUrl` optional and add optional `description` with `.refine()` constraint
- [x] Update `POST /` handler insert `.values()` block to include `jobDescription`
- [x] Add `description?: string | null` to `AddJobInput` in `useAddJobMutation.ts` and pass it in the request body
- [x] Add `description` state to `AddJobDrawer.tsx`, render textarea, update `isValid`, pass to mutation
- [x] Add 3 test cases to `POST /api/jobs` describe block in `api-jobs.test.ts`

### Review Findings

- [x] [Review][Patch] `sourceUrl: null` from client fails Zod `.optional()` — fixed: added `.nullable()` to schema; added 2 regression tests [`api-jobs.ts:190`, `api-jobs.test.ts`]
- [x] [Review][Patch] `description` state not reset on drawer close/success — fixed: added full state reset in `onSuccess` callback [`AddJobDrawer.tsx:32`]
- [x] [Review][Patch] Whitespace-only description passes `z.string().min(1)` but is trimmed to NULL on insert — fixed: replaced `min(1)` with `.refine(s => s.trim().length > 0)`; added regression test [`api-jobs.ts:191`, `api-jobs.test.ts`]
- [x] [Review][Patch] URL field label still shows `*` — fixed: updated label to "URL (optional if description provided)" [`AddJobDrawer.tsx:75`]
- [x] [Review][Defer] No maxLength on description field — unbounded text stored; no spec requirement for limit — deferred, pre-existing pattern
- [x] [Review][Defer] `analysisStatus: 'pending'` on description-only jobs with no analysis trigger — addressed in story 39.2 — deferred, intentional
- [x] [Review][Defer] Duplicate check won't catch description-only dupes (no `sourceUrl` to key on) — deferred, pre-existing
- [x] [Review][Defer] `company`/`jobTitle` not trimmed in duplicate-check WHERE clause — deferred, pre-existing

## Dev Notes

### Overview: 4 files changed, no DB migration needed

`jobDescription` column already exists in the `jobs` table (TEXT, nullable). No schema change required — this story only wires up the form and API to accept and store user-pasted descriptions at creation time.

---

### 1. `src/server/routes/api-jobs.ts`

**Current `manualJobSchema` (line 186):**
```ts
const manualJobSchema = z.object({
  company: z.string().min(1),
  jobTitle: z.string().min(1),
  location: z.string().optional(),
  sourceUrl: z.string().url(),
})
```

**Replace with:**
```ts
const manualJobSchema = z.object({
  company: z.string().min(1),
  jobTitle: z.string().min(1),
  location: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  description: z.string().min(1).optional(),
}).refine(d => !!(d.sourceUrl || d.description), { message: 'sourceUrl or description is required' })
```

**Current `POST /` handler destructure + insert (lines 200-216):**
```ts
const { company, jobTitle, location, sourceUrl } = parsed.data
...
db.insert(jobs).values({
  company, jobTitle,
  location: locationValue,
  sourceUrl,
  source: 'Manual',
  analysisStatus: 'pending',
  dateScraped,
  userId,
}).run()
```

**Replace destructure and insert with:**
```ts
const { company, jobTitle, location, sourceUrl, description } = parsed.data
...
db.insert(jobs).values({
  company, jobTitle,
  location: locationValue,
  sourceUrl: sourceUrl ?? null,
  jobDescription: description?.trim() || null,
  source: 'Manual',
  analysisStatus: 'pending',
  dateScraped,
  userId,
}).run()
```

**Note:** `sourceUrl` must be `?? null` (not `|| null`) because an empty string from `?.trim()` is falsy but `undefined` is already handled by optional — use nullish coalescing.

**Error shape:** The `.refine()` failure returns a Zod error. The existing handler already does `parsed.error.issues[0]?.message ?? 'Invalid body'` so the refine message surfaces correctly.

---

### 2. `src/client/hooks/useAddJobMutation.ts`

**Current `AddJobInput`:**
```ts
interface AddJobInput {
  company: string
  jobTitle: string
  location: string | null
  sourceUrl: string
}
```

**Replace with:**
```ts
interface AddJobInput {
  company: string
  jobTitle: string
  location: string | null
  sourceUrl: string | null
  description: string | null
}
```

The `mutationFn` body already passes `JSON.stringify(data)` — no other changes needed. Both `sourceUrl` and `description` are serialized as-is (null values serialize to JSON null, which the server ignores for optional fields).

---

### 3. `src/client/components/pipeline/AddJobDrawer.tsx`

**Current component state and validation:**
```tsx
const [company, setCompany] = useState('')
const [jobTitle, setJobTitle] = useState('')
const [location, setLocation] = useState('')
const [url, setUrl] = useState('')
const mutation = useAddJobMutation()

const isValid = company.trim().length > 0 && jobTitle.trim().length > 0 && url.trim().length > 0
```

**Add description state, update isValid:**
```tsx
const [description, setDescription] = useState('')

const isValid = company.trim().length > 0 && jobTitle.trim().length > 0 && (url.trim().length > 0 || description.trim().length > 0)
```

**Current `handleSubmit` call:**
```tsx
mutation.mutate(
  {
    company: company.trim(),
    jobTitle: jobTitle.trim(),
    location: location.trim() || null,
    sourceUrl: url.trim(),
  },
  ...
)
```

**Replace with:**
```tsx
mutation.mutate(
  {
    company: company.trim(),
    jobTitle: jobTitle.trim(),
    location: location.trim() || null,
    sourceUrl: url.trim() || null,
    description: description.trim() || null,
  },
  ...
)
```

**Add textarea after the URL `<label>` block (before the error paragraph):**
```tsx
<label className="flex flex-col gap-1 text-sm">
  <span className="text-zinc-400">Job Description (optional if URL provided)</span>
  <textarea
    className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm resize-none"
    rows={6}
    value={description}
    onChange={e => setDescription(e.target.value)}
    placeholder="Paste the job description here…"
  />
</label>
```

**Label placement:** URL field label is around line 73–80; insert the description textarea label immediately after the closing `</label>` of the URL field and before `{mutation.isError && ...}`.

**Style note:** Use `resize-none` to prevent the textarea from stretching outside the sheet. `rows={6}` gives a comfortable paste area without overflowing the sheet height on typical viewport sizes.

---

### 4. `src/server/routes/api-jobs.test.ts`

Add 3 new tests inside the existing `describe('POST /api/jobs', () => { ... })` block (after the last existing test at line ~598):

```ts
test('creates job with description only (no sourceUrl) → 201 with jobDescription set', async () => {
  const res = await jobsApp.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company: 'DescOnly', jobTitle: 'Engineer', description: 'We are looking for…' }),
  })
  expect(res.status).toBe(201)
  const data = await res.json() as { job: Record<string, unknown> }
  expect(data).toHaveProperty('job')
  expect(data.job.jobDescription).toBe('We are looking for…')
  expect(data.job.sourceUrl).toBeNull()
  expect(data.job.analysisStatus).toBe('pending')
})

test('returns 400 when neither sourceUrl nor description provided', async () => {
  const res = await jobsApp.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company: 'Neither', jobTitle: 'Dev' }),
  })
  expect(res.status).toBe(400)
  const data = await res.json() as Record<string, unknown>
  expect(data).toHaveProperty('error')
  expect(data).not.toHaveProperty('message')
})

test('creates job with both sourceUrl and description → 201 with both stored', async () => {
  const res = await jobsApp.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company: 'Both', jobTitle: 'Dev', sourceUrl: 'https://example.com/job/99', description: 'Role requires 5 years of experience.' }),
  })
  expect(res.status).toBe(201)
  const data = await res.json() as { job: Record<string, unknown> }
  expect(data.job.sourceUrl).toBe('https://example.com/job/99')
  expect(data.job.jobDescription).toBe('Role requires 5 years of experience.')
})
```

**Existing test that will break without care:** The test at line ~577 (`'returns 400 for non-URL sourceUrl'`) passes `sourceUrl: 'not-a-url'` with no description. After the schema change, `sourceUrl` is now `z.string().url().optional()` — a non-URL string still fails `z.string().url()` validation, so that test continues to return 400. **No change needed to existing tests.**

Also verify: the existing test at line ~525 (`'creates job with source=Manual…'`) passes `sourceUrl: 'https://example.com/job/1'` with no description — this still passes because `sourceUrl` satisfies the `.refine()` condition. **No change needed.**

---

### Architecture & Pattern Compliance

- **No new migration** — `jobDescription` column already exists (TEXT nullable); analysis-service already writes to it
- **Data ownership:** `jobDescription` is a scraper-owned column (per project-context.md). The user-supplied description at creation time is treated identically — it's stored in the same column, same semantics (the scraper or user populates it; subsequent analysis reads it). This is correct; do NOT add `jobDescription` to the PATCH allowlist.
- **Error shape:** `{ error: string }` only — never `{ message: string }`, never envelope
- **Zod schema naming:** existing schema is `manualJobSchema` — keep the same name
- **Test file pattern:** `process.env.DB_PATH = ':memory:'` is already set at line 1; tables already created in `beforeAll`; rows cleared in `beforeEach` — new tests follow the same pattern (no `beforeAll`/`beforeEach` changes needed)
- **TypeScript strict mode:** `noUnusedLocals`/`noUnusedParameters` are on — ensure `description` is used everywhere it's declared; avoid `_description`
- **`apiFetch` in the hook** — already handles CSRF via the wrapper in `src/client/lib/api.ts`; no change needed

### Story 39.2 Preview (don't implement — context only)

Story 39.2 (next story in this epic) will modify `src/server/services/analysis-service.ts` to skip the scraper when `job.jobDescription` is already populated. This story's work (storing `jobDescription` at creation time) is the prerequisite for that. Do not touch `analysis-service.ts` in this story.

## Project Context Reference

- Stack: Bun 1.3.x, Hono 4.x, React 19.x, Drizzle ORM + bun:sqlite, TanStack Query v5, shadcn/ui, Tailwind — no new dependencies
- Test runner: `bun:test` — never import from `vitest` or `jest`
- Error response shape: `{ error: string }` — never `{ message }`
- TypeScript strict: `noUnusedLocals`/`noUnusedParameters` enforced at compile time
- shadcn/ui components in `components/ui/` — do not hand-edit
- `src/shared/schemas.ts` is the cross-boundary type source — verify `Job` type already has `jobDescription: string | null`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Updated `manualJobSchema` to make `sourceUrl` optional and added optional `description` with `.refine()` ensuring at least one is present; existing non-URL `sourceUrl` test still returns 400 as Zod `.url()` still validates the string when provided.
- Updated `POST /` handler to destructure `description`, pass `sourceUrl: sourceUrl ?? null` and `jobDescription: description?.trim() || null` to the insert.
- Updated `AddJobInput` interface to `sourceUrl: string | null` and added `description: string | null`; `mutationFn` serializes both as-is.
- Added `description` state to `AddJobDrawer`, updated `isValid` to accept URL or description, added textarea with `resize-none` / `rows={6}`, updated `handleSubmit` to pass both fields.
- Added 3 new tests to `POST /api/jobs` describe block: description-only 201, neither-field 400, both-fields 201. All 48 api-jobs tests pass; 9 pre-existing failures in unrelated test files unchanged.

### File List

- job-hunt-dashboard/src/server/routes/api-jobs.ts (modified)
- job-hunt-dashboard/src/client/hooks/useAddJobMutation.ts (modified)
- job-hunt-dashboard/src/client/components/pipeline/AddJobDrawer.tsx (modified)
- job-hunt-dashboard/src/server/routes/api-jobs.test.ts (modified)
