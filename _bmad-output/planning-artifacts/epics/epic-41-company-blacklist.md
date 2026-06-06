# Epic 41: Company Blacklist

Users can blacklist companies to prevent future discovery runs from surfacing jobs at those companies, and manage their blacklist from the Config section or directly from the job drawer.

**Source:** User request 2026-06-04
**Priority:** Medium — discovery quality-of-life improvement; no breaking changes to existing schema or API

**Dependency chain:** 41.1 → 41.2, 41.3, 41.4 (41.3 creates shared hooks reused by 41.4)

---

## Story 41.1: DB Schema, Migration & Blacklist API

As a user running discovery,
I want the system to have a company blacklist backed by a DB table and a CRUD API,
So that my blacklist entries are persisted and accessible to both the discovery pipeline and the config UI.

**Acceptance Criteria:**

**Given** `bun start` runs the migration runner
**When** the runner completes
**Then** a `company_blacklist` table exists with columns: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `user_id INTEGER NOT NULL REFERENCES users(id)`, `company_name TEXT NOT NULL` (stored lowercase), `created_at TEXT NOT NULL`
**And** a `UNIQUE(user_id, company_name)` constraint exists on the table

**Given** an authenticated user calls `GET /api/blacklist`
**When** the response is received
**Then** the status is 200 and the body is an array of `BlacklistEntry` objects (`{ id, userId, companyName, createdAt }`) belonging only to that user
**And** an empty array is returned (not null) when the user has no entries

**Given** an authenticated user calls `POST /api/blacklist` with body `{ "companyName": "Acme Corp" }`
**When** the request is processed
**Then** the status is 201 and the response body is the created `BlacklistEntry` with `companyName` stored as `"acme corp"` (lowercased)

**Given** an authenticated user calls `POST /api/blacklist` with a company name already in their blacklist
**When** the request is processed
**Then** the status is 409 and the body is `{ "error": "Company already blacklisted" }`

**Given** an authenticated user calls `DELETE /api/blacklist/:id` with an ID that belongs to them
**When** the request is processed
**Then** the status is 204 and the entry is removed from the table

**Given** an authenticated user calls `DELETE /api/blacklist/:id` with an ID belonging to a different user
**When** the request is processed
**Then** the status is 404 and the body is `{ "error": "Not found" }`

**Given** any `/api/blacklist` endpoint is called without a valid session cookie
**When** the request is processed
**Then** the status is 401 (auth middleware rejects before the handler runs)

**Given** business-logic and HTTP contract tests exist
**When** the test suite runs (`bun test`)
**Then** all tests pass; tests cover list/create/delete, duplicate rejection (409), wrong-user delete (404), and unauthenticated access (401)

> **Dev note:**
>
> **Schema** — add to `src/db/schema.ts`:
> ```ts
> export const companyBlacklist = sqliteTable('company_blacklist', {
>   id: integer('id').primaryKey({ autoIncrement: true }),
>   userId: integer('user_id').notNull().references(() => users.id),
>   companyName: text('company_name').notNull(),
>   createdAt: text('created_at').notNull(),
> }, (t) => ({
>   uniq: uniqueIndex('blacklist_user_company_idx').on(t.userId, t.companyName),
> }))
> ```
>
> **Migration** — run `bun run db:generate`; commit the generated `0030_*.sql` file.
>
> **Shared schema** — add to `src/shared/schemas.ts`:
> ```ts
> export const blacklistEntrySchema = z.object({
>   id: z.number(),
>   userId: z.number(),
>   companyName: z.string(),
>   createdAt: z.string(),
> })
> export type BlacklistEntry = z.infer<typeof blacklistEntrySchema>
> ```
>
> **Routes** — create `src/server/routes/api-blacklist.ts`; mount it in `src/index.ts` under auth middleware at `/api/blacklist`.
>
> - `GET /api/blacklist`: query `where(eq(companyBlacklist.userId, userId))`, return array
> - `POST /api/blacklist`: `companyName = body.companyName.trim().toLowerCase()`; check for existing → throw 409; insert with `createdAt = new Date().toISOString()`; return 201 with entry
> - `DELETE /api/blacklist/:id`: select entry → if not found or `entry.userId !== userId` → 404; else delete → 204
>
> Duplicate detection: use an explicit pre-check select (rather than catching the unique constraint error) to keep the error shape consistent with the rest of the API.

---

## Story 41.2: Discovery Service — Blacklist Filtering

As a user running a discovery job,
I want newly scraped results to be filtered against my company blacklist before they are inserted,
So that jobs from companies I've ruled out never appear in my pipeline.

**Acceptance Criteria:**

**Given** a user has "acme corp" in their company blacklist
**When** a discovery run for that user completes and the scraper returned a job with `company: "Acme Corp"`
**Then** that job is NOT inserted into the `jobs` table

**Given** a user has "acme corp" in their company blacklist
**When** a discovery run for that user completes and the scraper returned a job with `company: "ACME CORP"` (different case)
**Then** that job is NOT inserted (matching is case-insensitive)

**Given** a user has "acme corp" in their company blacklist
**When** a discovery run for that user completes and the scraper returned a job with `company: "Acme Corporation"` (different string)
**Then** that job IS inserted (matching is exact after normalization, not substring)

**Given** a discovery run is triggered without a `userId` (system/admin context)
**When** the run completes
**Then** no blacklist filtering is applied (blacklist is per-user only)

**Given** a user with an empty blacklist runs discovery
**When** the run completes
**Then** all deduped results are inserted as normal (no regression)

**Given** the discovery service's progress logging
**When** companies are filtered by the blacklist
**Then** the count logged for "new jobs" reflects post-blacklist-filter totals (not pre-filter)

> **Dev note:**
>
> In `src/server/services/discovery-service.ts`, add a blacklist load immediately after the `existingIds` set is built (around line 213):
>
> ```ts
> const blacklistedNames = userId !== undefined
>   ? new Set(
>       db.select({ companyName: companyBlacklist.companyName })
>         .from(companyBlacklist)
>         .where(eq(companyBlacklist.userId, userId))
>         .all()
>         .map((r) => r.companyName) // already lowercase from Story 41.1 insert logic
>     )
>   : new Set<string>()
> ```
>
> Then add to the `newJobs` filter condition:
> ```ts
> if (blacklistedNames.size > 0 && blacklistedNames.has(r.company.toLowerCase())) return false
> ```
>
> Import `companyBlacklist` from `../../db/schema`.
>
> **Tests** — add cases to `discovery-service.test.ts`:
> - Insert a blacklist entry for the test user, then run discovery with a mock scraper response containing that company name → assert `inserted === 0`
> - Verify case-insensitive: store `"acme corp"`, scraper returns `company: "ACME CORP"` → not inserted
> - Verify non-substring: store `"acme corp"`, scraper returns `company: "Acme Corporation"` → inserted

---

## Story 41.3: Config UI — `/config/job-sources/blacklist` Page

As a user managing my job search configuration,
I want a Blacklist page under Config > Job Sources where I can view, add, and remove blacklisted companies,
So that I can manage my blacklist without having to open a specific job's drawer.

**Acceptance Criteria:**

**Given** the user is on the `/config/job-sources` overview page
**When** they look at the card grid
**Then** a "Blacklist" card tile is present and links to `/config/job-sources/blacklist`

**Given** the user navigates to `/config/job-sources/blacklist`
**When** the page loads
**Then** the page heading is "Blacklist", the breadcrumb reads "Job Sources > Blacklist", and the list of blacklisted companies is shown (one row per entry)

**Given** the user has at least one blacklisted company
**When** the list renders
**Then** each row shows the `companyName` and a "Remove" button

**Given** the user clicks "Remove" on a blacklisted company entry
**When** the `DELETE /api/blacklist/:id` mutation resolves successfully
**Then** that entry disappears from the list and a success toast is shown

**Given** the user has no blacklisted companies
**When** the page loads
**Then** an empty state message "No companies blacklisted yet" is shown beneath the add form

**Given** the user types a company name into the add form input and clicks "Add"
**When** the `POST /api/blacklist` mutation resolves successfully
**Then** the input is cleared, the new entry appears in the list, and a success toast is shown

**Given** the user tries to add a company that is already blacklisted
**When** the API returns 409
**Then** an error toast "Company already blacklisted" is shown and the input is NOT cleared

**Given** any mutation (add or remove) is in-flight
**When** the relevant button is in its pending state
**Then** the button is disabled to prevent double-submission

> **Dev note:**
>
> **New files:**
> - `src/client/hooks/useBlacklistQuery.ts` — `useQuery({ queryKey: ['blacklist'], queryFn: () => fetch('/api/blacklist').then(r => r.json()) })` returning `BlacklistEntry[]`
> - `src/client/hooks/useBlacklistMutations.ts` — exports `useAddToBlacklist()` and `useRemoveFromBlacklist()`; both call `queryClient.invalidateQueries({ queryKey: ['blacklist'] })` on success
> - `src/client/routes/config/job-sources-blacklist.tsx` — `ConfigJobSourcesBlacklistRoute`
>
> **Register route** in `src/client/lib/router.ts` — add `/config/job-sources/blacklist` as a child of the `_config` layout route (same pattern as `job-sources-searches`).
>
> **Update `job-sources-index.tsx`** — add a third card tile for Blacklist (no status badge — it is optional, not a prerequisite):
> ```tsx
> <Link to="/config/job-sources/blacklist" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
>   <span className="text-sm font-medium text-zinc-200">Blacklist</span>
> </Link>
> ```
>
> **Add form** — `<form onSubmit={...}>` with a controlled `<Input>` and a `<Button type="submit">`. Trim the value before submitting. Disable the submit button when `isPending` or the input is empty.
>
> **Toasts** — use the same toast mechanism used elsewhere in the project.
>
> **Breadcrumb** — use `<ConfigBreadcrumb>` with `[{ label: 'Job Sources', to: '/config/job-sources' }, { label: 'Blacklist' }]` (same pattern as other config subpages).

---

## Story 41.4: Job Drawer — Blacklist Toggle Button

As a user reviewing a job in the drawer,
I want to add or remove the job's company from my blacklist directly from the drawer,
So that I can blacklist a company in the moment I decide it's not worth my time without navigating to Config.

**Acceptance Criteria:**

**Given** the job drawer is open for a job whose company is NOT in the user's blacklist
**When** the drawer renders
**Then** a button labelled "Add Company to Blacklist" is visible in the drawer's action area

**Given** the job drawer is open for a job whose company IS in the user's blacklist
**When** the drawer renders
**Then** the button label is "Remove from Blacklist" instead

**Given** the user clicks "Add Company to Blacklist"
**When** the `POST /api/blacklist` mutation resolves successfully
**Then** the button label changes to "Remove from Blacklist" and a success toast "Added [company name] to blacklist" is shown

**Given** the user clicks "Remove from Blacklist"
**When** the `DELETE /api/blacklist/:id` mutation resolves successfully
**Then** the button label changes to "Add Company to Blacklist" and a success toast "[company name] removed from blacklist" is shown

**Given** either mutation is in-flight
**When** the button is in its pending state
**Then** the button is disabled

**Given** the route loader pre-fetches jobs data before the drawer opens
**When** the drawer renders
**Then** the blacklist query is also pre-cached so the button renders in its correct state without a loading spinner

> **Dev note:**
>
> In `JobDrawer.tsx`:
> - Import `useBlacklistQuery` and `useBlacklistMutations` (created in Story 41.3)
> - `const { data: blacklist = [] } = useBlacklistQuery()`
> - `const isBlacklisted = blacklist.some(e => e.companyName === job.company.toLowerCase())`
> - `const entry = blacklist.find(e => e.companyName === job.company.toLowerCase())`
> - For the remove action, pass `entry!.id` to `useRemoveFromBlacklist`
>
> Place the button in the drawer's existing action row (near the archive/external-link buttons at the top of the drawer).
>
> Toast messages use the original-case company name (`job.company`), not the stored lowercase value.
>
> **Loader** — in `src/client/lib/router.ts`, add `queryClient.ensureQueryData({ queryKey: ['blacklist'], queryFn: ... })` to the route loader that also pre-fetches `['jobs']`, so blacklist data is in cache before the drawer can be opened.
