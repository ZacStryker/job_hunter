---
type: bmad-distillate
sources:
  - "_bmad-output/planning-artifacts/architecture.md"
downstream_consumer: general
created: "2026-03-30"
token_estimate: 1850
parts: 1
---

## Project Context
- Job Hunt Dashboard: single-user localhost personal tool; fullstack SPA + local API; ~500 job records, no auth/sessions, no real-time, no CI/CD, no cloud
- Stack fully specified in PRD (non-negotiable): Bun 1.3.x runtime, Hono 4.x API, React 19.x + Vite 8.x SPA, Drizzle ORM + bun:sqlite, TanStack Query v5 + Router v1 + Table v8, shadcn/ui, Tailwind; browser target: Firefox latest only
- 24 MVP functional requirements (FR1–FR24); post-MVP FR25–FR33 (IMAP email polling, n8n cover letter pipeline) explicitly deferred
- Scale: low complexity; 500-record table must render without lag; drawer open must be instant (data pre-loaded); sync of 200 Sheets rows under 10 seconds

## Core Architectural Invariants
- Data ownership boundary: every job column annotated Sheets-owned vs user-owned; this annotation governs upsert exclusions and PATCH allowlist — first-class invariant, not ad-hoc
- Sync atomicity: SQLite transaction wraps all upsert rows in a batch; any row failure rolls back entire batch; user-owned fields (`applied`, `status`, `status_override`, `cover_letter_sent_at`) excluded from ON CONFLICT UPDATE clause
- Shared Zod schema: `src/shared/schemas.ts` is single source of truth for job record shape; imported by both server (runtime validation) and client (compile-time types); never redefine inline
- Type safety: DB schema → API response → client state must share types from `shared/schemas.ts`; no drift
- Error surface: all integration failures (OAuth, Sheets API, post-MVP n8n) must surface clearly; no silent data mutation; no stack traces in API responses

## Scaffold & Initialization
- Rejected: bhvr (monorepo/Turbo conflicts with single-process PRD design); Rejected: manual scaffold from scratch (viable but unnecessary boilerplate)
- Selected: `create-hono bun` template as thin seed + intentional additions (rationale: matches single-process prod + split dev pattern exactly via `@hono/vite-dev-server`)
- Init commands: `bun create hono@latest job-hunt-dashboard --template bun` → `bun add react react-dom hono drizzle-orm @tanstack/react-table @tanstack/react-query @tanstack/react-router` → `bun add -D vite @vitejs/plugin-react @hono/vite-dev-server drizzle-kit typescript zod` → `bunx shadcn@latest init`

## Data Architecture
- DB: SQLite via `bun:sqlite` (built-in driver), managed by Drizzle ORM; file at `./data/jobs.db`; path configurable via `DB_PATH` env var; `data/` gitignored
- Drizzle config must include `casing: 'camelCase'` — all query results return camelCase automatically; no per-column aliases needed
- Compound key: `uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle)` required in `db/schema.ts`; ON CONFLICT target in upsert
- Migrations: Drizzle Kit generates SQL; files committed to repo; runner called at `bun start` boot; idempotent
- Zod validation at `/api/ingest` boundary only (server-side, before any DB write); no Zod in React components
- Dates: ISO 8601 strings everywhere (API responses and DB storage); never Unix timestamps; never transform to Date objects before storing
- Booleans: `true`/`false` in JSON; Drizzle maps SQLite 0/1 automatically
- Nulls: explicit `null` for missing optional fields; never `undefined` in API responses
- Arrays: always arrays for collections; never objects keyed by ID

## API Design
- Style: REST under `/api/*`; response shape: direct data on success (no envelope wrapper — `{ success: true, data: ... }` forbidden); errors: `{ error: string }` + HTTP status
- Routes: `GET /api/jobs` (full payload, all records, loaded once on mount); `POST /api/ingest` (accepts `Job[]`, transactional upsert, returns `{ added, updated }`); `POST /api/sync` (triggers Sheets OAuth fetch → column mapping → ingest logic); `PATCH /api/jobs/:id` (user-owned fields only: `applied`, `status`, `status_override`)
- Route param: `:id` (never `:jobId` or `:job_id`); JSON fields: camelCase; DB columns: snake_case (Drizzle handles translation)
- Error middleware: single Hono handler catches all thrown errors → `{ error: message }` + HTTP status; no stack traces
- Hono binds to `127.0.0.1` only (never `0.0.0.0`)

## Authentication & Security
- App auth: none (single user, localhost)
- Google Sheets OAuth 2.0: tokens in `.env` only (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID`); token refresh in `oauth-client.ts`; expired token → clear error, no silent failure
- Credentials: never logged, never in API responses, never committed
- Missing/invalid env vars: app exits at startup with `console.error` listing missing keys; no silent defaults

## Frontend Architecture
- Server state: TanStack Query v5 only — never duplicate in React state; `useQuery(['jobs'])` loads once, cached; `useMutation` for sync and job updates
- Route loaders: TanStack Router loaders prefetch via `queryClient.ensureQueryData` — drawer opens with data already in cache (no loading state in drawer)
- UI state: React `useState` in nearest component — active view, drawer open/closed, selected job ID; no global store
- Routing: TanStack Router v1; two routes: `/` (Pipeline), `/tracker` (Tracker); drawer is UI overlay, not a route
- Column visibility: TanStack Table v8 state synced to `localStorage` key `"job-hunt-column-visibility"` (frozen — changing loses user preferences)
- Visual aging (AgingRow): pure client-side; `daysSinceApplied` from `date_applied`; thresholds: 0–7 days opacity 1.0; 8–14 → 0.75; 15–21 → 0.55; 22+ → 0.35; hover tooltip always shows "Applied N days ago"
- FitScoreBadge colors: <60 red; 60–79 yellow; ≥80 green

## TanStack Query Conventions (strictly enforced)
- Jobs list key: `['jobs']`; single job key: `['jobs', id]` where id is number; no other shapes permitted
- After `PATCH /api/jobs/:id`: optimistic update on `['jobs']` cache before request settles; rollback on error
- After `POST /api/sync`: invalidate `['jobs']` → re-fetch full list
- `queryClient` provisioned at app root before Router loaders can use `ensureQueryData`

## Project Structure
```
src/
  index.ts                  # Hono entry: boot migrations → routes → serve dist/
  shared/schemas.ts          # Zod schemas + inferred types (Job, IngestPayload, SyncResult)
  db/
    client.ts               # Drizzle singleton (reads DB_PATH)
    schema.ts               # Drizzle tables; columns annotated Sheets-owned vs user-owned
    migrate.ts              # Boot migration runner
    migrations/0001_initial.sql
  server/
    routes/api-jobs.ts      # GET /api/jobs, PATCH /api/jobs/:id
    routes/api-ingest.ts    # POST /api/ingest
    routes/api-sync.ts      # POST /api/sync
    services/sheets-sync.ts # ONLY file knowing Sheets column names; outputs Job[]
    services/oauth-client.ts
    middleware/error-handler.ts
  client/
    main.tsx                # QueryClientProvider → RouterProvider
    lib/query-client.ts     # queryClient singleton
    lib/router.ts           # routes + loaders
    hooks/useJobsQuery.ts
    hooks/useSyncMutation.ts
    hooks/useJobMutation.ts
    routes/index.tsx        # Pipeline view
    routes/tracker.tsx      # Tracker view
    components/ui/          # shadcn/ui generated — do not hand-edit
    components/pipeline/    # PipelineTable, FitScoreBadge, ActionChip, ColumnVisibilityToggle
    components/tracker/     # TrackerTable, AgingRow
    components/detail/      # JobDrawer, FitBreakdown, AppliedToggle, StatusOverride, StatusTimeline
    components/shared/      # Layout, SyncButton, ErrorBanner
```
- Test files co-located (e.g., `api-ingest.test.ts` next to `api-ingest.ts`); no `__tests__/` directory
- shadcn/ui components in `components/ui/` — do not hand-edit

## Naming Conventions
- DB columns: `snake_case`; API JSON fields: `camelCase` (Drizzle casing config handles translation)
- Table names: plural snake_case (`jobs`, `status_events`); PK: `id` (integer autoincrement)
- Compound key columns: `company`, `job_title` (match Sheets column names exactly)
- React components: `PascalCase.tsx`; server/utility files: `kebab-case.ts`; hooks: `camelCase` prefixed `use`
- Zod schemas: camelCase suffixed `Schema` (`jobSchema`, `ingestPayloadSchema`); Drizzle table objects: camelCase

## Error Handling & Loading Patterns
- Sync errors: persistent inline `ErrorBanner` above table (not toast — must stay visible)
- Job update (PATCH) errors: transient toast (low stakes)
- Server errors: Hono middleware → `{ error: message }` + HTTP status; never `{ message: string }` or `{ error: { message } }`
- Loading states: use TanStack Query `isPending`/`isError`/`isSuccess` directly; no custom wrappers
- Initial jobs load: full-table skeleton or spinner; sync in progress: SyncButton shows spinner + disabled; drawer: no loading state (data pre-cached)
- `console.error` on server; surface via TanStack Query error state on client; `console.log` for errors is forbidden

## Development & Production Workflow
- Dev: `bun run dev` — `concurrently` runs Vite on :5173 + Hono API on :3001; `@hono/vite-dev-server` proxies `/api/*` to :3001
- Prod: `bun run build` → Vite outputs to `dist/`; `bun start` → runs migrations then Hono on :3000 serving `dist/` + API
- Env vars: `PORT`, `DB_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID`; post-MVP: `N8N_WEBHOOK_SECRET`, `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`
- `.env.example` committed with all required keys documented; `.env` gitignored

## Implementation Sequence
1. Scaffold + wiring (create-hono seed → add full stack)
2. DB schema + Zod shared schemas + boot migration runner
3. `POST /api/ingest` with transactional upsert
4. Sheets OAuth sync service + `POST /api/sync`
5. TanStack Router + jobs query + Pipeline table
6. Tracker view + visual aging
7. Detail drawer + `PATCH /api/jobs/:id`
- Zod schema in `shared/` must exist before any handler or component consuming job data
- Boot migration must run before any route touching DB

## Boundary Definitions
- `/api/ingest` boundary: single entry for all Sheets-sourced data; upstream untrusted; downstream typed; only `sheets-sync.ts` knows Sheets column names
- Data ownership boundary: `db/schema.ts` annotations + `api-ingest.ts` ON CONFLICT exclusions + `api-jobs.ts` PATCH allowlist
- Client/server boundary: `src/shared/schemas.ts` — all cross-boundary types live here; `Job` type is the contract
- Sheets integration boundary: `sheets-sync.ts` — outputs `Job[]` conforming to `IngestPayload`; no Sheets types leak further

## Post-MVP Extension Points
- IMAP polling service: new background service in `server/services/`; polling strategy (setInterval vs Bun native scheduler) deferred
- n8n webhook receiver: new Hono route; shared-secret middleware deferred; async callback pattern (webhook → Hono → push to client) may benefit from SSE
- Cover letter storage: schema extension deferred; must not require breaking changes to existing schema/API
- `status_events` table: post-MVP placeholder (StatusTimeline component exists but is non-functional at MVP)

## Anti-Patterns (forbidden)
- Import job types from anywhere except `src/shared/schemas.ts`
- TanStack Query keys other than `['jobs']` or `['jobs', id]`
- Error response shape other than `{ error: string }`
- `fetch('/api/jobs')` directly in components — use hooks from `src/client/hooks/`
- Binding Hono to `0.0.0.0`
- `console.log` for errors
- `queryClient.setQueryData` without documented invalidation strategy
- Envelope wrapper in API responses (`{ success: true, data: ... }`)
