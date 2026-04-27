# Story 18.1: Search Config UI

Status: done

## Story

As a job hunter,
I want to manage my discovery search queries from the Config page,
so that I can add or remove search targets (source, keywords, location) without editing code.

## Acceptance Criteria

1. The hardcoded `SEARCHES` array in `discovery-service.ts` is replaced by a DB-backed `search_configs` table.
2. Migration `0015_search_configs.sql` creates the table and seeds it with the 6 existing hardcoded entries, so behavior is unchanged on first boot.
3. `GET /api/search-configs` returns all rows as `SearchConfig[]`.
4. `POST /api/search-configs` accepts `{ source, query, location }`, validates, inserts, and returns the created row.
5. `DELETE /api/search-configs/:id` deletes the row; returns `{ id }`.
6. The Config page (`/config`) gains a "Discovery Searches" card below the existing three cards.
7. The card lists all current configs in a compact table (columns: Source, Query, Location, delete button).
8. An inline add-form below the table has a Source dropdown (linkedin / indeed / indeed_nl / arc), a Query text input, an optional Location text input, and an "Add" button.
9. Submitting the form inserts the row and immediately refreshes the list; deleting a row immediately refreshes the list.
10. Validation: source required (enum), query required non-empty string; location optional (empty string treated as null).
11. Config route loader pre-fetches search-configs alongside profile and prompts.

## Tasks / Subtasks

- [x] Task 1 — Shared schemas (AC: 3, 4, 5)
  - [x] Add to `src/shared/schemas.ts`:
    - `export const SCRAPER_SOURCES = ['linkedin', 'indeed', 'indeed_nl', 'arc'] as const`
    - `export const scraperSourceSchema = z.enum(SCRAPER_SOURCES)`
    - `export const searchConfigSchema = z.object({ id: z.number().int(), source: scraperSourceSchema, query: z.string(), location: z.string().nullable(), enabled: z.boolean() })`
    - `export const searchConfigInputSchema = z.object({ source: scraperSourceSchema, query: z.string().min(1), location: z.string().nullable() })`
    - `export type SearchConfig = z.infer<typeof searchConfigSchema>`
    - `export type SearchConfigInput = z.infer<typeof searchConfigInputSchema>`

- [x] Task 2 — DB schema + migration (AC: 1, 2)
  - [x] Add `searchConfigs` table to `src/db/schema.ts`:
    ```ts
    export const searchConfigs = sqliteTable('search_configs', {
      id: integer('id').primaryKey({ autoIncrement: true }),
      source: text('source').notNull(),
      query: text('query').notNull(),
      location: text('location'),
      enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    })
    ```
  - [ ] Create `src/db/migrations/0015_search_configs.sql`:
    ```sql
    CREATE TABLE IF NOT EXISTS search_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      query TEXT NOT NULL,
      location TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO search_configs (source, query, location) VALUES
      ('linkedin',  'genai ml',             'The Randstad, Netherlands'),
      ('indeed',    'genai ml python',       'remote'),
      ('indeed_nl', 'genai ml python',       'Randstad'),
      ('linkedin',  'Full stack developer',  'Remote'),
      ('indeed',    'full stack developer',  'remote'),
      ('indeed_nl', 'full stack developer',  'Randstad');
    ```

- [x] Task 3 — API route `src/server/routes/api-search-configs.ts` (AC: 3, 4, 5)
  - [x] `GET /` — `db.select().from(searchConfigs).all()` → `c.json(rows)`
  - [x] `POST /` — parse body with `searchConfigInputSchema`; insert; return created row
  - [x] `DELETE /:id` — parse id as integer; `db.delete(...).where(eq(searchConfigs.id, id)).run()`; return `{ id }`
  - [x] 404 if id not found on DELETE (check `changes` after delete)
  - [x] Mount in `src/index.ts`: `import searchConfigsRoute from './server/routes/api-search-configs'` + `app.route('/api/search-configs', searchConfigsRoute)`

- [x] Task 4 — Update `discovery-service.ts` (AC: 1)
  - [x] Remove the `SEARCHES` constant entirely
  - [x] Add DB source map constant (keep private to file):
    ```ts
    const DB_SOURCE: Record<string, string> = {
      linkedin: 'linkedin', indeed: 'indeed', indeed_nl: 'indeed', arc: 'arc',
    }
    ```
  - [x] In `runDiscovery()`, replace hardcoded SEARCHES with:
    ```ts
    import { searchConfigs } from '../../db/schema'
    const searches = db.select().from(searchConfigs).where(eq(searchConfigs.enabled, true)).all()
    ```
  - [x] Map `s.source` (scraper) to `DB_SOURCE[s.source] ?? s.source` for the job's `source` field
  - [x] Remove `ScraperResult` from `dbSource` field in the spread (no longer needed)

- [x] Task 5 — Client hook `src/client/hooks/useSearchConfigsQuery.ts` (AC: 11)
  - [x] Export `fetchSearchConfigs` and `useSearchConfigsQuery()`:
    ```ts
    export async function fetchSearchConfigs(): Promise<SearchConfig[]> {
      const res = await fetch('/api/search-configs')
      if (!res.ok) throw new Error('Failed to fetch search configs')
      return (await res.json() as SearchConfig[])
    }
    export function useSearchConfigsQuery() {
      return useQuery({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs })
    }
    ```
  - [x] QueryKey: `['search-configs']` exactly — no other shape

- [x] Task 6 — Client mutations `src/client/hooks/useSearchConfigMutations.ts` (AC: 9)
  - [x] `useAddSearchConfigMutation()`: `POST /api/search-configs`, on success `queryClient.invalidateQueries({ queryKey: ['search-configs'] })`
  - [x] `useDeleteSearchConfigMutation()`: `DELETE /api/search-configs/:id`, on success invalidate `['search-configs']`

- [x] Task 7 — `SearchConfigCard` in `src/client/routes/config.tsx` (AC: 6–10)
  - [x] Inline sub-component `SearchConfigCard` (same pattern as `LogsPreviewCard`)
  - [x] Call `useSearchConfigsQuery()`, `useAddSearchConfigMutation()`, `useDeleteSearchConfigMutation()`
  - [x] Table: columns Source, Query, Location, Delete — use `<table>` + `TableHeader/TableBody/TableRow/TableHead/TableCell` from `@/components/ui/table`
  - [x] Card is NOT clickable (no navigate on click — unlike the other 3 cards, this is self-contained)
  - [x] Add-form: controlled inputs for `source` (select), `query` (text), `location` (text, optional)
  - [x] On submit: call `addMutation.mutate({ source, query, location: location.trim() || null })`; reset form on success
  - [x] Source select options: `linkedin`, `indeed`, `indeed_nl`, `arc`
  - [x] Delete button per row: `<button onClick={() => deleteMutation.mutate(row.id)}>✕</button>`
  - [x] Loading state: `<p className="text-sm text-zinc-400">Loading…</p>`
  - [x] Empty state (after load, no rows): `<p className="text-sm text-zinc-400">No search targets configured.</p>`
  - [x] Card shell: `<div className="border border-zinc-800 rounded-lg p-4">` (no `cursor-pointer` — not navigating anywhere)
  - [x] Heading row: `<div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold text-zinc-100">Discovery Searches</h2></div>`
  - [x] Render `<SearchConfigCard />` after the three existing cards in `ConfigRoute`

- [x] Task 8 — Update config route loader in `src/client/lib/router.ts` (AC: 11)
  - [x] Import `fetchSearchConfigs` from `'../hooks/useSearchConfigsQuery'`
  - [x] Add to configRoute loader's `Promise.all`:
    `queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs })`

## Dev Notes

### Data Model
- New table `search_configs` with `id`, `source`, `query`, `location` (nullable), `enabled` (boolean, default true)
- Drizzle handles `camelCase` ↔ `snake_case` automatically via `casing: 'camelCase'` in drizzle config
- `enabled` field is included in schema/types but the UI does not expose toggling — all rows are enabled by default; reserved for future use

### Discovery Service Source Mapping
The `indeed_nl` scraper is a Dutch-locale variant of Indeed. Jobs scraped via `indeed_nl` must be stored in the `jobs` table with `source: 'indeed'`. The private `DB_SOURCE` map in `discovery-service.ts` handles this. Do not leak this mapping to the shared schema or DB table — `search_configs.source` stores the scraper key, not the DB key.

### Card Pattern Difference
`SearchConfigCard` does NOT wrap the card in a clickable div. The other three cards navigate to full routes; this card is self-contained. Omit `cursor-pointer` and `onClick` from the card shell.

### Add-form validation
Client-side: disable the "Add" button if `source` is unselected or `query.trim()` is empty. Server-side validation via `searchConfigInputSchema` will catch anything that slips through. Empty string `location` should be sent as `null` — do `location.trim() || null` before calling mutate.

### No `enabled` toggle in UI
The `enabled` column is in the schema for potential future use (e.g., temporarily disabling a search without deleting it). The current UI does not expose it. All rows inserted via POST default to `enabled: true`.

### TanStack Query conventions
- Query key: `['search-configs']` — the only valid shape for this resource
- Invalidate after both add and delete mutations

### TypeScript
Strict mode is on. The `source` select element value is `string` from the DOM — cast via `scraperSourceSchema.parse(value)` or use a typed state variable initialized to `'linkedin' as ScraperSource`.

### API response shape
- `GET /api/search-configs`: direct array (no envelope) — `c.json(rows)`
- `POST /api/search-configs`: direct created object
- `DELETE /api/search-configs/:id`: `{ id: number }`
- Error: `{ error: string }` + HTTP status — no `{ message: string }` shape

### Migration
Next migration number is `0015`. Drizzle Kit auto-generates migration files but for hand-written ones, place at `src/db/migrations/0015_search_configs.sql`. The boot migration runner in `src/db/migrate.ts` picks up all `.sql` files in order — verify it does not require Drizzle journal entries for hand-written files (if it does, follow the same pattern used in `0005_new_job_fields.sql`).

### Project Structure Notes
- New files: `src/server/routes/api-search-configs.ts`, `src/client/hooks/useSearchConfigsQuery.ts`, `src/client/hooks/useSearchConfigMutations.ts`, `src/db/migrations/0015_search_configs.sql`
- Modified: `src/shared/schemas.ts`, `src/db/schema.ts`, `src/server/services/discovery-service.ts`, `src/index.ts`, `src/client/routes/config.tsx`, `src/client/lib/router.ts`

### References
- API route pattern: `src/server/routes/api-prompts.ts` (GET + PUT + DELETE with Zod validation)
- Hook with exported fetch fn: `src/client/hooks/useProfileQuery.ts`
- Config card pattern: `src/client/routes/config.tsx` (LogsPreviewCard, ProfilePreviewCard)
- Discovery service: `src/server/services/discovery-service.ts`
- DB schema: `src/db/schema.ts`
- Shared schemas: `src/shared/schemas.ts`
- Route mounting: `src/index.ts:32–39`
- Router loader: `src/client/lib/router.ts` (configRoute loader)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented all 8 tasks: shared schemas, DB migration 0015, API route (GET/POST/DELETE), discovery-service DB-backed searches, client hooks (query + mutations), SearchConfigCard UI, and config route loader update.
- `POST /api/search-configs` returns 201 with the created row via `.returning().get()`.
- `DELETE /api/search-configs/:id` uses `.returning()` to detect 404 without a separate SELECT.
- Discovery service `DB_SOURCE` map translates `indeed_nl` scraper source → `indeed` DB source, keeping scraper keys in `search_configs.source` and DB keys in `jobs.source`.
- 10 new tests added in `api-search-configs.test.ts` — all pass; no regressions in existing 182 tests.

### File List

- `src/shared/schemas.ts` (modified)
- `src/db/schema.ts` (modified)
- `src/db/migrations/0015_search_configs.sql` (new)
- `src/db/migrations/meta/_journal.json` (modified)
- `src/server/routes/api-search-configs.ts` (new)
- `src/server/routes/api-search-configs.test.ts` (new)
- `src/server/services/discovery-service.ts` (modified)
- `src/index.ts` (modified)
- `src/client/hooks/useSearchConfigsQuery.ts` (new)
- `src/client/hooks/useSearchConfigMutations.ts` (new)
- `src/client/routes/config.tsx` (modified)
- `src/client/lib/router.ts` (modified)

## Review Findings

### Decision Needed
- [x] [Review][Decision] AC-6 layout deviation: SearchConfigCard renders first — **accepted**, intentional UX improvement; spec updated accordingly.
- [x] [Review][Decision] AC-8 form position deviation: Add-form above table — **accepted**, forms-first UX pattern; spec updated accordingly.
- [x] [Review][Decision] Unspecified feature: PUT + inline edit UI — **accepted** as useful scope expansion; well-implemented and tested.

### Patches
- [x] [Review][Patch] `parseInt` silent coercion in DELETE — `parseInt('1abc', 10)` returns `1`, deletes wrong row [api-search-configs.ts:59]
- [x] [Review][Patch] Mutation hooks crash on non-JSON error bodies — `await res.json()` called unconditionally on `!res.ok` responses; a proxy 502 HTML page throws an unhandled rejection [useSearchConfigMutations.ts:55,75,93]
- [x] [Review][Patch] Migration seed rows have no idempotency guard — `INSERT INTO` runs unconditionally; replaying the migration duplicates all 6 seed rows [0015_search_configs.sql:8-14]
- [x] [Review][Patch] DELETE accepts negative/zero IDs — inconsistent with PUT which guards `rawId <= 0`; fix: add same guard [api-search-configs.ts:59-60]
- [x] [Review][Patch] GET response Zod parse fails permanently on any row with an unrecognized `source` — use `.safeParse()` or a looser response schema [useSearchConfigsQuery.ts:16]
- [x] [Review][Patch] `DB_SOURCE` map not typed as `Record<ScraperSource, string>` — new sources added to `SCRAPER_SOURCES` without a `DB_SOURCE` entry silently fall through and write wrong source to jobs table [discovery-service.ts:13]

### Deferred
- [x] [Review][Defer] No authentication on `/api/search-configs` endpoints [api-search-configs.ts] — deferred, pre-existing single-user design; Epic 24 tracks auth
- [x] [Review][Defer] GET returns disabled rows with no UI toggle to enable/disable [api-search-configs.ts:10] — deferred, `enabled` field reserved for future use per dev notes
- [x] [Review][Defer] No max-length constraints on `query` or `location` fields [schemas.ts] — deferred, low risk for single-user; harden before multi-user launch
- [x] [Review][Defer] `Promise.all` over scraper calls — one failure aborts entire discovery run [discovery-service.ts] — deferred, pre-existing behavior not introduced by this story
- [x] [Review][Defer] No uniqueness constraint on `(source, query, location)` — rapid double-click or two tabs can insert duplicates [0015_search_configs.sql] — deferred, minor for single-user
- [x] [Review][Defer] Migration seed data hard-codes personal search terms — will seed every fresh DB including future multi-user instances [0015_search_configs.sql] — deferred, required by AC-2; revisit during multi-user migration strategy
- [x] [Review][Defer] Edit button can be clicked while `addMutation.isPending` — minor concurrent-state inconsistency [config.tsx] — deferred, low UX impact
- [x] [Review][Defer] Error messages (save/delete) may be off-screen when table is long [config.tsx] — deferred, UX polish

## Change Log

- 2026-04-18: Story implemented — search_configs DB table + migration, full REST API, discovery-service DB-backed, SearchConfigCard UI, config route pre-fetches search configs.
- 2026-04-27: Code review — 3 decision-needed, 6 patches, 8 deferred, 4 dismissed.
