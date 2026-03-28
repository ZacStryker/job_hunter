---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-03-27'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
workflowType: 'architecture'
project_name: 'Job Hunt Dashboard'
user_name: 'Stryker'
date: '2026-03-26'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (24 total):**
- Data Ingestion & Sync (FR1–FR6): Manual Sheets OAuth sync, POST /ingest upsert with mutable field protection, compound key matching, atomic failure handling, sync result feedback
- Pipeline View (FR7–FR12): Dense tabular view, fit score color badge, action chip, view switching, column visibility toggle with localStorage persistence
- Tracker View (FR13–FR15): Applied jobs with visual row aging as passive time-since-application signal
- Job Detail & Decision (FR16–FR21): Slide-over drawer with full AI analysis, applied toggle, status override, status timeline
- Application Setup (FR22–FR24): Boot migrations, .env config, single `bun start` command
- Post-MVP: IMAP email polling with fuzzy job matching (FR25–FR27, FR32), cover letter generation pipeline via n8n (FR28–FR31, FR33)

**Non-Functional Requirements:**
- Reliability: idempotent boot migrations, atomic sync (failed sync must not partially write user-owned fields)
- Performance: 500-record table render without lag; drawer open is instant (data pre-loaded); sync of 200 rows under 10 seconds
- Security: localhost-only binding, credentials in .env only, never logged or API-exposed
- Integration: single Sheets column mapping layer, OAuth token refresh handling, post-MVP n8n shared secret auth

**Scale & Complexity:**

- Primary domain: Fullstack SPA + local API (React + Vite + Hono on Bun)
- Complexity level: Low — single user, single tenant, ~500 records, no real-time, no auth/sessions
- Estimated architectural components: API server, SPA client, SQLite persistence layer, Sheets OAuth integration, post-MVP IMAP + webhook receivers

### Technical Constraints & Dependencies

- **Runtime:** Bun (not Node.js) — affects package compatibility and script runner
- **Framework:** Hono (serves both static bundle and API routes in one process)
- **Persistence:** SQLite via Drizzle ORM — file-based, no server to manage
- **UI:** React + Vite, TanStack Table, shadcn/ui — component library provides baseline accessibility
- **Browser target:** Firefox latest only — no polyfills, no cross-browser concerns
- **External APIs:** Google Sheets API v4 with OAuth 2.0 (read-only access to spreadsheet)
- **Dev/prod split:** `bun run dev` = Vite dev server + Hono API as two processes; `bun start` = single process serving built bundle

### Cross-Cutting Concerns Identified

1. **Data ownership boundary** — The Sheets/SQLite field split is the system's core invariant; every layer touching job records must respect it
2. **Sync atomicity** — A failed or interrupted sync must leave all user-owned fields unmodified; requires transactional write strategy
3. **Type safety across boundaries** — DB schema → API response → client state must share a single source of truth to avoid drift
4. **Error surface** — All integration failures (OAuth, Sheets API, post-MVP n8n) must surface clearly without silent data mutation
5. **Post-MVP extension seams** — Schema and API contract must accommodate IMAP event records and cover letter state without requiring breaking changes

## Starter Template Evaluation

### Primary Technology Domain

Custom fullstack SPA — Hono API + React/Vite frontend on Bun runtime.
Stack is fully specified in the PRD; this step determines the scaffolding approach.

### Starter Options Considered

| Option | Verdict |
|---|---|
| **bhvr** (`bun create bhvr@latest`) | Rejected — monorepo/Turbo structure conflicts with PRD's single-process design |
| **create-hono bun template** | Selected as seed — minimal, official, correct runtime foundation |
| **Manual scaffold from scratch** | Considered — viable but `create-hono` baseline reduces boilerplate |

### Selected Approach: create-hono bun + manual layer

**Rationale:** The PRD specifies a single-process production server (`bun start`) with a split dev mode (Vite dev server + Hono API). This is precisely the `@hono/vite-dev-server` pattern. No starter fully encapsulates it without imposing unwanted structure. The correct approach is a thin official seed with intentional additions.

**Initialization Command:**

```bash
bun create hono@latest job-hunt-dashboard --template bun
cd job-hunt-dashboard
bun add react react-dom hono drizzle-orm @tanstack/react-table
bun add -D vite @vitejs/plugin-react @hono/vite-dev-server drizzle-kit typescript
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript + Bun 1.3.x — Bun as runtime, bundler, and test runner. No Node.js compatibility shims needed.

**API Framework:**
Hono 4.x — serves API routes under `/api/*` and static bundle in production; `@hono/vite-dev-server` bridges Vite and Hono in development.

**Frontend Tooling:**
Vite 8.x + React 19.x — SPA with client-side routing. Production build output served by Hono as static assets.

**Persistence:**
drizzle-orm with `bun:sqlite` (built-in SQLite driver) — Drizzle Kit for migrations, run on boot.

**UI Components:**
shadcn/ui added post-scaffold via `bunx shadcn@latest init` — components copied into `src/components/ui/`.

**Table:**
TanStack Table v8 — headless, integrated with shadcn for column visibility and row interaction.

**Code Organization:**
```
src/
  client/          # React SPA entry + components
  server/          # Hono routes + middleware
  shared/          # Shared types (DB schema → API response → client)
  db/              # Drizzle schema + migrations
```

**Development Experience:**
- `bun run dev` — concurrent Vite dev server + Hono API (hot reload on both)
- `bun run build` — Vite builds SPA bundle into `dist/`
- `bun start` — single Hono process serving `dist/` + API on one port
- `bun run db:migrate` — Drizzle migrations (also runs on `bun start`)

**Note:** Project initialization using this scaffold should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Data ownership boundary enforcement in upsert logic
- Sync atomicity (SQLite transaction wrapping all upsert writes)
- Shared Zod schema as canonical type source across all layers

**Important Decisions (Shape Architecture):**
- TanStack Query for server state management
- TanStack Router for client-side routing
- Direct data + HTTP status API convention
- DB_PATH-configurable SQLite location

**Deferred Decisions (Post-MVP):**
- IMAP polling interval and connection management strategy
- n8n webhook shared-secret middleware
- Cover letter storage schema extension

### Data Architecture

- **Database:** SQLite via `bun:sqlite` (built-in driver), managed by Drizzle ORM
- **File location:** `./data/jobs.db` — path configurable via `DB_PATH` in `.env`; `data/` directory gitignored
- **Schema ownership split:** Drizzle schema columns annotated as Sheets-owned vs. user-owned; upsert logic reads this distinction, not ad-hoc conditionals
- **Migrations:** Drizzle Kit — migration files committed to repo; runner called at `bun start` boot; idempotent by design
- **Validation:** Zod schema in `src/shared/schemas.ts` — parses `/ingest` payload, infers TypeScript types used across server and client; single source of truth for the job record shape
- **Upsert strategy:** SQLite transaction wrapping all rows in a sync batch — if any row fails validation or write, entire batch rolls back; user-owned fields (`applied`, `status`, `status_override`, `cover_letter_sent_at`) excluded from ON CONFLICT UPDATE clause

### Authentication & Security

- **App auth:** None — single user, localhost only
- **Google Sheets OAuth:** OAuth 2.0 tokens stored in `.env` only (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`); token refresh handled in the Sheets sync service; expired token produces clear error, no silent failure
- **API binding:** Hono server binds to `127.0.0.1` only — not `0.0.0.0`; not network-accessible
- **Credentials:** Never logged, never included in API responses, never committed

### API & Communication Patterns

- **Style:** REST — resource-oriented routes under `/api/*`
- **Response shape:** Direct data on success (e.g., `{ jobs: Job[] }`, `{ added: number, updated: number }`); on error, HTTP status code + `{ error: string }` body
- **Error middleware:** Single Hono error handler — catches thrown errors, maps to appropriate HTTP status, returns `{ error: message }`; no stack traces in response body
- **Key routes:**
  - `GET /api/jobs` — returns all job records (full payload, loaded once on mount)
  - `POST /api/ingest` — accepts `Job[]`, runs transactional upsert, returns sync result
  - `POST /api/sync` — triggers Sheets OAuth fetch → maps columns → calls ingest logic; returns sync result or error
  - `PATCH /api/jobs/:id` — updates user-owned fields only (`applied`, `status`, `status_override`)
- **Static serving:** Hono serves `dist/` in production; `@hono/vite-dev-server` proxies to Vite in dev

### Frontend Architecture

- **Server state:** TanStack Query v5 — `useQuery` for jobs list (loaded once, cached); `useMutation` for sync trigger and job updates; cache invalidated on successful sync/update
- **Route loader integration:** TanStack Router route loaders prefetch jobs via TanStack Query's `queryClient.ensureQueryData` — drawer opens with data already in cache
- **UI state:** Plain React `useState` — active view (pipeline/tracker), drawer open/closed, selected job ID
- **Routing:** TanStack Router v1 — two primary routes: `/` (Pipeline view), `/tracker` (Tracker view); drawer is a UI overlay, not a route
- **Column visibility:** TanStack Table v8 column visibility state — persisted to `localStorage` via a `useEffect` sync; restored on mount
- **Visual aging:** Pure client-side computed style — `daysSinceApplied` calculated from `date_applied` field; mapped to CSS opacity/color classes; no backend involvement
- **Shared types:** `src/shared/schemas.ts` exports Zod schemas + inferred types; imported by both `src/server/` and `src/client/`

### Infrastructure & Deployment

- **Runtime:** Bun 1.3.x — single binary, no Node.js required
- **Production:** `bun start` — single process, single port; Hono serves API + static bundle
- **Development:** `bun run dev` — concurrent processes via `bun run --bun concurrently`; Vite dev server on :5173, Hono API on :3001; `@hono/vite-dev-server` proxies `/api/*` from Vite to Hono
- **Config:** All configuration via `.env`; `.env.example` committed with all required keys documented; app fails fast with clear error on missing required env vars
- **No CI/CD, no containerization, no cloud deployment** — localhost personal tool

### Decision Impact Analysis

**Implementation Sequence:**
1. Scaffold + wiring (create-hono seed → add React/Vite/Drizzle/TanStack stack)
2. DB schema + Zod shared schemas + boot migration runner
3. `/api/ingest` endpoint with transactional upsert
4. Sheets OAuth sync service + `/api/sync` endpoint
5. TanStack Router setup + jobs query + Pipeline table (TanStack Table + shadcn)
6. Tracker view + visual aging computation
7. Detail drawer + `PATCH /api/jobs/:id` for user-owned field writes

**Cross-Component Dependencies:**
- Zod schema in `shared/` must be defined before any server handler or client component that consumes job data
- Boot migration must run before any API route that touches the DB
- TanStack Query `queryClient` must be provisioned at app root before Router loaders can use `ensureQueryData`
- Column visibility localStorage key must be stable — changing it post-ship loses user preferences

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

8 areas where AI agents could make inconsistent choices without explicit rules.

### Naming Patterns

**Database Naming Conventions:**
- Table names: plural `snake_case` — `jobs`, `status_events` (post-MVP)
- Column names: `snake_case` — `fit_score`, `date_applied`, `status_override`, `cover_letter_sent_at`
- Primary key: `id` (integer, autoincrement)
- Compound key columns: `company`, `job_title` (match Sheets column names exactly)

**API Naming Conventions:**
- Routes: plural, kebab-case — `/api/jobs`, `/api/jobs/:id`
- Route parameters: `:id` (never `:jobId` or `:job_id`)
- JSON response fields: `camelCase` — Drizzle column mapping handles `snake_case` → `camelCase` translation at DB boundary
- Query params: `camelCase` if needed

**Code Naming Conventions:**
- React components: `PascalCase.tsx` — `PipelineTable.tsx`, `JobDrawer.tsx`, `FitScoreBadge.tsx`
- Server/utility files: `kebab-case.ts` — `sheets-sync.ts`, `ingest-handler.ts`, `db-migrate.ts`
- Hooks: `camelCase` prefixed with `use` — `useJobsQuery.ts`, `useSyncMutation.ts`
- Zod schemas: `camelCase` suffixed with `Schema` — `jobSchema`, `ingestPayloadSchema`
- Drizzle table objects: `camelCase` — `jobs` (the Drizzle table reference)

### Structure Patterns

**Project Organization (by feature):**
```
src/
  client/
    components/
      pipeline/        # PipelineTable, FitScoreBadge, ActionChip, ColumnVisibilityToggle
      tracker/         # TrackerTable, AgingRow
      detail/          # JobDrawer, StatusTimeline, AppliedToggle, StatusOverride
      shared/          # Layout, SyncButton, ErrorBanner, LoadingSpinner
    routes/            # TanStack Router route components (index.tsx, tracker.tsx)
    hooks/             # useJobsQuery.ts, useSyncMutation.ts, useJobMutation.ts
    lib/               # queryClient.ts, router.ts, utils.ts
  server/
    routes/            # api-jobs.ts, api-sync.ts, api-ingest.ts
    services/          # sheets-sync.ts, oauth-client.ts
    middleware/        # error-handler.ts
  shared/
    schemas.ts         # Zod schemas + inferred TypeScript types (imported by both server and client)
  db/
    schema.ts          # Drizzle table definitions
    migrate.ts         # Boot migration runner
    migrations/        # Drizzle Kit generated SQL files
```

**Test File Placement:**
- Co-located: `ingest-handler.test.ts` next to `ingest-handler.ts`
- No separate `__tests__/` directory

### Format Patterns

**API Response Formats:**
- Success: direct data — `{ jobs: Job[] }`, `{ added: number, updated: number }`, `{ job: Job }`
- Error: `{ error: string }` with appropriate HTTP status code
- No envelope wrapper (`{ success: true, data: ... }` is forbidden)

**Data Exchange Formats:**
- Dates: ISO 8601 strings in all API responses and DB storage — `"2026-03-27T10:00:00.000Z"`; never Unix timestamps
- Booleans: `true`/`false` in JSON; Drizzle maps SQLite `0`/`1` automatically
- Nulls: explicit `null` for missing optional fields; never `undefined` in API responses
- Arrays: always arrays for collections, never objects keyed by ID (client uses TanStack Table, not a normalized store)

### Communication Patterns

**TanStack Query Key Conventions (strictly enforced):**
- Jobs list: `['jobs']`
- Single job: `['jobs', id]` where `id` is a number
- No other key shapes permitted — agents must not invent `['jobs', 'list']` or `{ entity: 'jobs' }`

**Cache Update Strategy:**
- After `PATCH /api/jobs/:id` (applied toggle, status override): **optimistic update** — update `['jobs']` cache directly before request settles; rollback on error
- After `POST /api/sync`: **invalidate `['jobs']`** — re-fetch full list; sync may add/update many records

**State Management Patterns:**
- Server state (jobs data, sync status): TanStack Query only — never duplicated in React state
- UI state (active view, drawer open/closed, selected job ID): React `useState` in nearest relevant component or passed via props — no global store
- Persistent UI state (column visibility): TanStack Table column visibility state synced to `localStorage` key `"job-hunt-column-visibility"` — this key is frozen

### Process Patterns

**Error Handling:**
- Server: all errors thrown in handlers are caught by Hono error middleware → `{ error: message }` + HTTP status; never leak stack traces
- Client sync errors: displayed as persistent inline `ErrorBanner` above the table (not toast) — sync failure needs to stay visible
- Client job update errors (PATCH): displayed as transient toast — low stakes, dismissible
- Missing/invalid env vars: app exits at startup with `console.error` listing the missing keys; no silent defaults

**Loading State Patterns:**
- Use TanStack Query's `isPending`, `isError`, `isSuccess` directly — no custom loading state wrappers
- Initial jobs load: full-table skeleton or spinner in place of table
- Sync in progress: `SyncButton` shows spinner and is disabled; no full-page overlay
- Drawer open: data is already in cache — no loading state needed in drawer

**Validation Timing:**
- Zod validation runs at the `/api/ingest` boundary only — server-side, before any DB write
- No Zod validation inside React components — trust the API response shape matches `shared/schemas.ts`
- Drizzle insert types provide compile-time safety; Zod provides runtime safety at the external boundary

### Enforcement Guidelines

**All AI Agents MUST:**
- Import types from `src/shared/schemas.ts` — never redefine job shape locally
- Use `['jobs']` or `['jobs', id]` as TanStack Query keys — no variations
- Return `{ error: string }` (not `{ message: string }` or `{ error: { message } }`) from all error responses
- Store dates as ISO strings — never transform to Date objects before storing in DB or sending in API response
- Use `snake_case` for all Drizzle column definitions; use `camelCase` for all API JSON fields

**Anti-Patterns (forbidden):**
- ❌ `queryClient.setQueryData` without a corresponding invalidation strategy documented
- ❌ Defining job field types inline in a component — always import from `shared/schemas.ts`
- ❌ `fetch('/api/jobs')` directly in a component — always use a hook from `src/client/hooks/`
- ❌ `console.log` for errors — use `console.error` on server; surface to UI via TanStack Query error state on client
- ❌ Binding Hono server to `0.0.0.0` — always `127.0.0.1`

## Project Structure & Boundaries

### Complete Project Directory Structure

```
job-hunt-dashboard/
├── .env                              # Local config — gitignored
├── .env.example                      # Committed — documents all required vars
├── .gitignore                        # Excludes: .env, data/, dist/, node_modules/
├── package.json                      # Scripts: dev, build, start, db:migrate, db:generate
├── tsconfig.json                     # Strict mode, paths for src/shared alias
├── vite.config.ts                    # @vitejs/plugin-react + @hono/vite-dev-server
├── drizzle.config.ts                 # Points to src/db/schema.ts + data/jobs.db
├── bun.lockb
├── components.json                   # shadcn/ui config
├── data/                             # gitignored — SQLite DB lives here
│   └── jobs.db
├── dist/                             # gitignored — Vite production build output
├── src/
│   ├── index.ts                      # Hono app entry: boot migrations → bind routes → serve dist/
│   ├── shared/
│   │   └── schemas.ts                # Zod schemas + inferred TS types (Job, IngestPayload, SyncResult)
│   ├── db/
│   │   ├── client.ts                 # Drizzle client singleton (reads DB_PATH from env)
│   │   ├── schema.ts                 # Drizzle table: jobs (annotated: Sheets-owned vs user-owned)
│   │   ├── migrate.ts                # Boot migration runner — called from src/index.ts on startup
│   │   └── migrations/               # Drizzle Kit generated SQL — committed to repo
│   │       └── 0001_initial.sql
│   ├── server/
│   │   ├── routes/
│   │   │   ├── api-jobs.ts           # GET /api/jobs, PATCH /api/jobs/:id
│   │   │   ├── api-ingest.ts         # POST /api/ingest — Zod parse → transactional upsert
│   │   │   └── api-sync.ts           # POST /api/sync — triggers sheets-sync → calls ingest logic
│   │   ├── services/
│   │   │   ├── sheets-sync.ts        # Google Sheets API v4 fetch + column-to-schema mapping
│   │   │   └── oauth-client.ts       # OAuth 2.0 token refresh; throws on expiry with clear message
│   │   └── middleware/
│   │       └── error-handler.ts      # Global Hono error middleware → { error: string } + HTTP status
│   └── client/
│       ├── main.tsx                  # React entry: QueryClientProvider → RouterProvider
│       ├── index.css                 # Tailwind base + shadcn CSS variables
│       ├── lib/
│       │   ├── query-client.ts       # TanStack Query queryClient singleton
│       │   └── router.ts             # TanStack Router: routes /, /tracker; loaders call ensureQueryData
│       ├── hooks/
│       │   ├── useJobsQuery.ts       # useQuery(['jobs']) → GET /api/jobs
│       │   ├── useSyncMutation.ts    # useMutation → POST /api/sync; onSuccess: invalidate ['jobs']
│       │   └── useJobMutation.ts     # useMutation → PATCH /api/jobs/:id; optimistic update on ['jobs']
│       ├── routes/
│       │   ├── index.tsx             # Pipeline view route component (/)
│       │   └── tracker.tsx           # Tracker view route component (/tracker)
│       └── components/
│           ├── ui/                   # shadcn/ui generated — do not hand-edit
│           │   ├── button.tsx
│           │   ├── badge.tsx
│           │   ├── sheet.tsx         # Used for JobDrawer slide-over
│           │   ├── toast.tsx
│           │   └── ...
│           ├── pipeline/
│           │   ├── PipelineTable.tsx          # TanStack Table — fit score + action columns
│           │   ├── FitScoreBadge.tsx          # Color badge: <60 red, 60-79 yellow, ≥80 green
│           │   ├── ActionChip.tsx             # skip / investigate / apply chip
│           │   └── ColumnVisibilityToggle.tsx # Show/hide optional columns; syncs to localStorage
│           ├── tracker/
│           │   ├── TrackerTable.tsx           # TanStack Table — status + applied date columns
│           │   └── AgingRow.tsx               # Row wrapper: computes opacity from daysSinceApplied
│           ├── detail/
│           │   ├── JobDrawer.tsx              # shadcn Sheet overlay — full record view
│           │   ├── FitBreakdown.tsx           # Reqs met/missed list + Claude explanation text
│           │   ├── AppliedToggle.tsx          # Toggle applied → useJobMutation
│           │   ├── StatusOverride.tsx         # Select override status → useJobMutation
│           │   └── StatusTimeline.tsx         # Chronological status events (post-MVP placeholder)
│           └── shared/
│               ├── Layout.tsx                 # App shell: header, Pipeline/Tracker nav tabs
│               ├── SyncButton.tsx             # Sync trigger + spinner (disabled during sync) + result text
│               └── ErrorBanner.tsx            # Persistent error display for sync failures
```

### Architectural Boundaries

**External API Boundary — `/api/ingest`:**
- Single entry point for all Sheets-sourced data
- Zod validates `IngestPayload` schema before any DB operation
- Everything upstream of this boundary is untrusted; everything downstream is typed
- Only file that knows Sheets column names: `server/services/sheets-sync.ts`

**Data Ownership Boundary — `db/schema.ts` + `api-ingest.ts`:**
- Drizzle schema columns annotated with ownership: Sheets-owned vs user-owned
- Upsert in `api-ingest.ts` uses SQLite `ON CONFLICT DO UPDATE SET` excluding user-owned columns
- `PATCH /api/jobs/:id` in `api-jobs.ts` accepts only user-owned fields (`applied`, `status`, `status_override`)

**Client/Server Boundary — `src/shared/schemas.ts`:**
- All types shared across the boundary live here — no inline type definitions on either side
- Server imports for Zod runtime validation; client imports for TypeScript compile-time safety
- The `Job` type is the contract — both sides must satisfy it

**Google Sheets Integration Boundary — `server/services/sheets-sync.ts`:**
- Only file that imports or knows about the Sheets API response shape
- Outputs a `Job[]` conforming to `IngestPayload` schema — no Sheets types leak further

### Requirements to Structure Mapping

**Data Ingestion & Sync (FR1–FR6):**
- `server/routes/api-ingest.ts` — FR2 (POST endpoint), FR3 (mutable field protection), FR4 (compound key)
- `server/routes/api-sync.ts` — FR1 (manual sync trigger), FR5 (result feedback), FR6 (failure handling)
- `server/services/sheets-sync.ts` — FR1 (Sheets OAuth fetch + column mapping)
- `server/services/oauth-client.ts` — FR6 (OAuth expiry detection)
- `client/components/shared/SyncButton.tsx` — FR1, FR5 (UI trigger + feedback)
- `client/components/shared/ErrorBanner.tsx` — FR6 (error display)

**Pipeline View (FR7–FR12):**
- `client/routes/index.tsx` — FR7, FR10 (Pipeline view container + view switching)
- `client/components/pipeline/PipelineTable.tsx` — FR7 (table), FR11 (column toggle)
- `client/components/pipeline/FitScoreBadge.tsx` — FR8 (color-coded score)
- `client/components/pipeline/ActionChip.tsx` — FR9 (action recommendation)
- `client/components/pipeline/ColumnVisibilityToggle.tsx` — FR11, FR12 (toggle + localStorage persist)

**Tracker View (FR13–FR15):**
- `client/routes/tracker.tsx` — FR13 (Tracker view container)
- `client/components/tracker/TrackerTable.tsx` — FR13 (status + applied date columns)
- `client/components/tracker/AgingRow.tsx` — FR14, FR15 (visual decay from daysSinceApplied)

**Job Detail & Decision (FR16–FR21):**
- `client/components/detail/JobDrawer.tsx` — FR16 (drawer open on row click), FR18 (job description + source URL)
- `client/components/detail/FitBreakdown.tsx` — FR17 (score breakdown + explanation)
- `client/components/detail/AppliedToggle.tsx` — FR19 (applied toggle → SQLite)
- `client/components/detail/StatusOverride.tsx` — FR20 (status override → SQLite)
- `client/components/detail/StatusTimeline.tsx` — FR21 (status timeline — post-MVP)

**Application Setup (FR22–FR24):**
- `src/db/migrate.ts` — FR22 (boot migrations)
- `.env.example` — FR23 (env var documentation)
- `src/index.ts` + `package.json` scripts — FR24 (single `bun start` command)

**Post-MVP (FR25–FR33):** Not yet in structure — IMAP service and cover letter schema extensions to be added when epics are planned.

### Integration Points

**Internal Data Flow:**
```
Google Sheets API
      ↓ OAuth fetch (sheets-sync.ts)
      ↓ column mapping → Job[]
POST /api/sync → api-sync.ts
      ↓ calls ingest logic
POST /api/ingest → api-ingest.ts
      ↓ Zod parse → SQLite transaction
      ↓ ON CONFLICT upsert (user-owned fields protected)
      jobs table (SQLite)
      ↑ GET /api/jobs → api-jobs.ts
      ↑ camelCase mapping
TanStack Query ['jobs'] cache
      ↑ useJobsQuery hook
Pipeline/Tracker components
      ↓ row click → JobDrawer
      ↓ AppliedToggle / StatusOverride → useJobMutation
      ↓ PATCH /api/jobs/:id → optimistic cache update
      jobs table (SQLite)
```

**External Integrations:**
- Google Sheets API v4: read-only via OAuth 2.0; token refresh in `oauth-client.ts`; failure surfaces to `ErrorBanner`
- Post-MVP: n8n webhook receiver (new Hono route); IMAP polling (new background service in `server/services/`)

### Development Workflow Integration

**Development:**
- `bun run dev` — `concurrently` runs Vite on :5173 + Hono API on :3001; `@hono/vite-dev-server` proxies `/api/*` to :3001
- Migrations run manually via `bun run db:migrate` in dev
- `bun run db:generate` — Drizzle Kit generates new migration SQL from schema changes

**Production:**
- `bun run build` — Vite outputs to `dist/`
- `bun start` — `src/index.ts` runs migrations then starts Hono on :3000; serves `dist/` as static + `/api/*` routes

**Environment Variables (`.env.example`):**
```
PORT=3000
DB_PATH=./data/jobs.db
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_SPREADSHEET_ID=
# Post-MVP
# N8N_WEBHOOK_SECRET=
# IMAP_HOST=
# IMAP_USER=
# IMAP_PASS=
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices are mutually compatible — Bun + Hono + Drizzle + bun:sqlite is an officially supported combination; TanStack Router v1 and TanStack Query v5 are designed for integration via queryClient loaders; shadcn/ui + Vite + Tailwind is a standard configuration. No contradictory decisions were found.

**Pattern Consistency:**
Naming conventions are consistent: snake_case DB columns → camelCase API via Drizzle casing config → camelCase throughout client. TanStack Query key shapes are locked. File naming follows defined conventions across all layers.

**Structure Alignment:**
Feature-based component organization aligns with TanStack Router's route-centric model. Shared schemas in `src/shared/` properly serve both server (runtime Zod validation) and client (compile-time TypeScript). Boundary definitions are clean and non-overlapping.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
All 24 MVP functional requirements are mapped to specific files in the project structure. Post-MVP requirements (FR25–FR33) are deferred with noted extension points in schema and API contract.

**Non-Functional Requirements Coverage:**
- Performance: TanStack Query cache + route loader preloading satisfies instant drawer open; TanStack Table handles 500 records without virtualization at this scale
- Reliability: SQLite transactional upsert satisfies atomic sync requirement; idempotent Drizzle Kit migrations satisfy boot reliability
- Security: Hono binds to 127.0.0.1; all credentials in .env; error middleware strips stack traces from responses
- Integration: Single Sheets column mapping layer in `sheets-sync.ts`; OAuth refresh in `oauth-client.ts`

### Gap Analysis & Resolutions

**Gap 1 — Drizzle camelCase Mapping (Important):**
Resolved: Use global `casing: 'camelCase'` in `drizzle.config.ts`. No per-column aliases needed. All Drizzle query results return camelCase keys automatically. Add to `drizzle.config.ts`:
```ts
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  casing: 'camelCase',
  dbCredentials: { url: process.env.DB_PATH ?? './data/jobs.db' }
})
```

**Gap 2 — Visual Aging Thresholds (Important):**
Resolved: Define in `AgingRow.tsx` as a pure function of `daysSinceApplied`:
- 0–7 days: opacity 1.0 (full)
- 8–14 days: opacity 0.75
- 15–21 days: opacity 0.55
- 22+ days: opacity 0.35
- Hover tooltip always renders "Applied N days ago" regardless of opacity level

**Gap 3 — Compound Key Unique Constraint (Important):**
Resolved: `db/schema.ts` must define `uniqueIndex('company_job_title_idx').on(table.company, table.jobTitle)`. The `ON CONFLICT DO UPDATE` in `api-ingest.ts` targets this index. Without it, Drizzle upsert has no conflict target.

**Gap 4 — Router/QueryClient Import Order (Minor):**
Resolved: `router.ts` imports `queryClient` from `query-client.ts`. `main.tsx` imports `router` and `queryClient` separately. No circular dependency — both are singletons initialized independently.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (low — single user, ~500 records)
- [x] Technical constraints identified (Bun, localhost, Firefox-only)
- [x] Cross-cutting concerns mapped (data ownership, sync atomicity, type safety, error surface, post-MVP seams)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (Bun 1.3, Hono 4, Drizzle, React 19, Vite 8, TanStack v5/v1/v8)
- [x] Integration patterns defined (OAuth, Sheets API, post-MVP n8n)
- [x] Performance considerations addressed (cache strategy, preloading, table rendering)

**✅ Implementation Patterns**
- [x] Naming conventions established (DB snake_case, API/client camelCase, file naming)
- [x] Structure patterns defined (feature-based components, co-located tests)
- [x] Communication patterns specified (TanStack Query keys, cache invalidation vs optimistic update)
- [x] Process patterns documented (error propagation, loading states, validation boundary)

**✅ Project Structure**
- [x] Complete directory structure defined with all files
- [x] Component boundaries established with FR mappings
- [x] Integration points mapped (data flow diagram)
- [x] Requirements-to-structure mapping complete (FR1–FR24)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — stack is fully specified, all MVP FRs are covered, patterns are explicit enough to prevent agent conflicts, all validation gaps resolved.

**Key Strengths:**
- Data ownership boundary is a first-class architectural concept, not an afterthought
- Zod schemas in `shared/` eliminate type drift across all layers
- TanStack ecosystem cohesion (Query + Router + Table) reduces cross-library friction
- Single-process production model is simple, reliable, and matches the localhost use case exactly

**Areas for Future Enhancement:**
- Post-MVP IMAP service will need a background polling strategy (setInterval vs Bun's native scheduler)
- Cover letter generation via n8n will introduce a new async callback pattern (webhook → Hono → push to client) that may benefit from SSE

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented — technology versions, naming conventions, and query key shapes are non-negotiable
- The data ownership boundary is the system's core invariant — enforce it at both the upsert layer and the PATCH endpoint
- Import all job types from `src/shared/schemas.ts` — never define them locally
- Refer to this document for all architectural questions before making independent decisions

**First Implementation Story:**
```bash
bun create hono@latest job-hunt-dashboard --template bun
cd job-hunt-dashboard
bun add react react-dom hono drizzle-orm @tanstack/react-table @tanstack/react-query @tanstack/react-router
bun add -D vite @vitejs/plugin-react @hono/vite-dev-server drizzle-kit typescript zod
bunx shadcn@latest init
```
