# Epic 1: Working Application Foundation

User can clone the repo, run `bun start`, and see a live (empty) dashboard with migrations applied — the full stack is wired and running.

## Story 1.1: Project Scaffold & Dev/Prod Scripts

As a developer,
I want a correctly scaffolded project with all dependencies installed and dev/prod scripts working,
So that I have a solid foundation to build the full application on.

**Acceptance Criteria:**

**Given** a developer clones the repo and runs `bun install`
**When** they run `bun run dev`
**Then** Vite dev server starts on `:5173` and Hono API starts on `:3001` concurrently
**And** changes to server files hot-reload Hono; changes to client files hot-reload Vite

**Given** the project is scaffolded
**When** `bun run build` is executed
**Then** Vite outputs a production bundle to `dist/` without errors

**Given** a production build exists
**When** `bun start` is executed
**Then** a single Hono process starts on `:3000` serving both `dist/` and `/api/*` routes
**And** the server binds to `127.0.0.1` only — not `0.0.0.0`

**Given** the project structure
**When** a developer inspects the codebase
**Then** the directory structure matches: `src/client/`, `src/server/`, `src/shared/`, `src/db/` with TypeScript strict mode enabled, path aliases for `src/shared/` configured in `tsconfig.json`, and `components.json` (shadcn) committed

## Story 1.2: Database Schema, Shared Types & Boot Migrations

As a developer,
I want the SQLite schema defined, Zod shared types established, and migrations running on boot,
So that every subsequent story has a stable, typed data contract to build against.

**Acceptance Criteria:**

**Given** `src/db/schema.ts` is defined
**When** a developer inspects it
**Then** the `jobs` table contains:
  - **Scraper-owned columns** (written by Discovery service, never overwritten by Analysis or user actions): `external_job_id` (text, not null), `title` (text, not null), `company` (text, not null), `source` (text, not null — 'linkedin' | 'indeed'), `location` (text, nullable), `source_url` (text, not null), `date_scraped` (text, not null, ISO 8601)
  - **Analysis-owned columns** (written by Analysis service, never overwritten by user actions): `analysis_status` (text, not null, default 'pending' — 'pending' | 'done' | 'failed'), `job_description` (text, nullable), `fit_score` (integer, nullable), `recommendation` (text, nullable — 'skip' | 'investigate' | 'apply'), `role_fit` (text, nullable), `requirements_met` (text, nullable), `requirements_missed` (text, nullable), `red_flags` (text, nullable)
  - **User-owned columns** (never overwritten by Discovery or Analysis): `applied` (integer, default 0), `status` (text, nullable), `status_override` (text, nullable), `cover_letter_sent_at` (text, nullable), `date_applied` (text, nullable)
  - `id` (integer, autoincrement primary key)
**And** a unique index on `external_job_id` is defined — this is the deduplication key for the Discovery service
**And** column names use `snake_case`; `drizzle.config.ts` sets `casing: 'camelCase'` for automatic snake_case → camelCase mapping on all query results

**Given** `src/shared/schemas.ts` is defined
**When** a developer imports from it
**Then** `jobSchema`, `discoveryResultSchema`, `analysisResultSchema` (Zod) and their inferred TypeScript types (`Job`, `DiscoveryResult`, `AnalysisResult`) are all exported and usable in both `src/server/` and `src/client/`
**And** `discoveryResultSchema` is `{ added: number }` — Discovery only inserts, never updates
**And** `analysisResultSchema` is `{ analyzed: number, failed: number }`

**Given** `src/db/migrate.ts` exists and is called from `src/index.ts`
**When** `bun start` is run on a clean install
**Then** terminal prints migration success and `data/jobs.db` is created at the path specified by `DB_PATH`
**And** running `bun start` again on an existing DB completes without error (idempotent)

## Story 1.3: App Shell, Environment Config & React Entry

As a user,
I want the app to start cleanly with a basic shell visible at `localhost:3000` and to fail fast with a clear message if my `.env` is misconfigured,
So that setup errors are immediately obvious and the interface is ready for daily use.

**Acceptance Criteria:**

**Given** `.env.example` is committed to the repo
**When** a developer inspects it
**Then** all required environment variables are documented: `PORT`, `DB_PATH`, `SCRAPER_URL`, `SCRAPER_TOKEN`, `ANTHROPIC_API_KEY`
**And** post-MVP variables (`IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASS`) are present but commented out with setup instructions

**Given** a required env var is missing from `.env`
**When** `bun start` is run
**Then** the app exits immediately with `console.error` listing all missing keys — no silent defaults, no partial startup

**Given** all env vars are present and `bun start` succeeds
**When** the user opens `localhost:3000`
**Then** the React SPA renders with a header bar (`h-14`) containing the app name (left), two view tabs — Pipeline and Tracker (center), and action button placeholders (right)
**And** TanStack Router is configured with routes `/` (Pipeline) and `/tracker`; TanStack `QueryClientProvider` wraps the router at the app root
**And** the Pipeline route (`/`) renders an empty table card with the message "No jobs yet. Hit Discover to find new jobs."

**Given** the app is running in dev mode (`bun run dev`)
**When** `localhost:5173` is opened
**Then** the same React SPA renders correctly with hot reload active

---
