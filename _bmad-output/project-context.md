---
project_name: 'bmad'
user_name: 'Stryker'
date: '2026-03-30'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 52
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Runtime:** Bun 1.3.x (also used as test runner via `bun:test`)
- **API:** Hono ^4.0.0
- **Frontend:** React ^19.0.0, Vite ^8.0.0
- **DB:** Drizzle ORM ^0.44.0 + bun:sqlite (built-in, no extra driver)
- **Client libs:** TanStack Query ^5.0.0, TanStack Router ^1.0.0, TanStack Table ^8.0.0
- **UI:** shadcn/ui, Tailwind ^4.2.2 (via `@tailwindcss/vite` plugin — no PostCSS config)
- **Validation:** Zod ^3.0.0
- **TypeScript:** ^5.0.0, strict mode enabled (`noUnusedLocals`, `noUnusedParameters`)
- **Path aliases:** `@shared/*` → `src/shared/*` | `@/*` → `src/client/*` (configured in both `vite.config.ts` and `tsconfig.json`)
- **Browser target:** Firefox latest only

## Critical Implementation Rules

### Language-Specific Rules

- TypeScript strict mode is on — all unused locals/params are compile errors; do not suppress with `_` prefixes unless genuinely intentional
- `moduleResolution: "bundler"` — use `.ts`/`.tsx` extensions in imports where needed; no `.js` extension aliasing
- All cross-boundary types must be imported from `src/shared/schemas.ts` — never redefined inline or imported from anywhere else
- Zod schemas: named `camelCaseSchema` suffix (e.g., `jobSchema`, `ingestPayloadSchema`); types inferred via `z.infer<typeof ...>`
- Dates: ISO 8601 strings everywhere — never Unix timestamps, never `Date` objects in API responses or DB storage
- **Date-only strings (e.g., `dateApplied`):** always append `T00:00:00Z` (UTC) when converting to a `Date` for arithmetic — NEVER use `T00:00:00` without the `Z` suffix; the missing `Z` creates local-timezone-dependent date shifts that corrupt date comparison logic (this bug has appeared in 4 stories: 4.3, 5.1, 5.2, 6.2)
- Booleans in API JSON: `true`/`false`; Drizzle handles SQLite 0/1 mapping automatically
- Nulls: explicit `null` for missing optional fields in API responses — never `undefined`
- Collections: always arrays — never objects keyed by ID in API responses
- `console.error` for server-side errors; `console.log` for errors is forbidden

### Framework-Specific Rules

**Hono (API)**
- Bind to `127.0.0.1` only — never `0.0.0.0`
- API response shape: direct data on success — no envelope wrapper (`{ success: true, data: ... }` is forbidden)
- Error responses: `{ error: string }` + HTTP status only — never `{ message: string }` or `{ error: { message } }`
- Single `errorHandler` middleware in `src/server/middleware/error-handler.ts` catches all thrown errors — do not return error shapes inline except for validation (400s)
- Routes registered on sub-`Hono` instances exported as default, mounted in `src/index.ts`

**Drizzle ORM**
- Drizzle config uses `casing: 'camelCase'` — query results are camelCase automatically; never add per-column `.as()` aliases
- Compound upsert target: `[jobs.company, jobs.jobTitle]` — always use this pair, never just one
- User-owned columns (`applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`) must NEVER appear in any `onConflictDoUpdate.set` block
- `db.transaction((tx) => { ... })` for all multi-row writes; `.run()` on each statement inside transaction
- DB singleton is `src/db/client.ts` — import `db` from there; never instantiate a second Drizzle instance in production code

**TanStack Query**
- Query key shapes: `['jobs']` for the list, `['jobs', id]` (number) for a single job — no other shapes permitted
- After `POST /api/ingest`: call `queryClient.invalidateQueries({ queryKey: ['jobs'] })` — do not manually set cache
- After `PATCH /api/jobs/:id`: optimistic update on `['jobs']` cache before request; rollback on error
- `queryClient` singleton from `src/client/lib/query-client.ts` — never instantiate a second one
- Use TanStack Query `isPending`/`isError`/`isSuccess` directly — no custom loading state wrappers

**TanStack Router**
- Two routes only: `/` (Pipeline) and `/tracker` (Tracker); drawer is a UI overlay, not a route
- Route loaders use `queryClient.ensureQueryData` to prefetch — drawer must open with data already cached (no loading state in drawer)
- Router type augmentation (`declare module '@tanstack/react-router'`) is required in `src/client/lib/router.ts`

**TanStack Table**
- Column visibility state synced to `localStorage` key `"job-hunt-column-visibility"` — key is frozen; changing it loses user preferences

**React**
- Server state lives in TanStack Query only — never duplicate in `useState` or other local state
- UI state (`useState`): active view, drawer open/closed, selected job ID — kept in nearest component, no global store
- Never call `fetch('/api/...')` directly in components — use hooks from `src/client/hooks/`
- shadcn/ui components in `src/client/components/ui/` are generated — do not hand-edit

### Testing Rules

- Test runner: `bun:test` — use `describe`, `test`, `expect`, `beforeAll`, `beforeEach` from `bun:test`; never import from `vitest` or `jest`
- Test files co-located next to the file under test (e.g., `api-ingest.test.ts` beside `api-ingest.ts`) — no `__tests__/` directories
- DB isolation: set `process.env.DB_PATH = ':memory:'` at the top of every test file that touches the DB, BEFORE any production module imports
- Schema DDL in tests: create the table manually via raw SQL in `beforeAll` — do not run the migration runner in tests
- `beforeEach`: clear all rows with `DELETE FROM jobs` (or equivalent) to ensure test isolation
- Two test layers per route: **business-logic tests** (call the service function directly with a test DB instance) and **HTTP contract tests** (call `app.request(...)` against the real production handler)
- HTTP contract tests use `app.request('/', { method, headers, body })` — no HTTP server needed
- Key separator for composite keys: `\x00` (null byte) not `::` — prevents false collisions when company/jobTitle contain `:`
- Always assert both the response shape AND the correct HTTP status code in contract tests
- Assert error responses have `error` key and do NOT have `message` key

### Code Quality & Style Rules

**Naming Conventions**
- React components: `PascalCase.tsx`
- Server/utility/service files: `kebab-case.ts`
- Hooks: `camelCase` prefixed with `use` (e.g., `useWebhookMutation.ts`)
- Drizzle table objects: `camelCase` (e.g., `jobs`)
- DB columns: `snake_case`; API JSON fields: `camelCase` — Drizzle's `casing: 'camelCase'` handles the translation
- Route params: `:id` only — never `:jobId` or `:job_id`

**File Organization**
- Component folders by domain: `components/pipeline/`, `components/tracker/`, `components/detail/`, `components/shared/`
- Hooks in `src/client/hooks/` — one hook per file
- Only `src/shared/schemas.ts` defines shared types — no inline type redefinitions

**Code Style**
- No comments unless logic is non-obvious — do not add JSDoc, docstrings, or explanatory comments to straightforward code
- No error handling for impossible scenarios — trust internal framework guarantees
- No feature flags, backwards-compat shims, or speculative abstractions
- No helpers/utilities for one-time operations

### Development Workflow Rules

- **Dev:** `bun run dev` — runs Vite on `:5173` + Hono API on `:3001` concurrently; Vite proxies `/api/*` to `:3001`
- **Prod:** `bun run build` → Vite outputs to `dist/`; `bun start` → runs migrations then serves on `:3000`
- **Migrations:** `drizzle-kit generate` to create SQL files; migration runner executes automatically at `bun start` boot — always idempotent
- **DB path:** controlled by `DB_PATH` env var; `data/` directory is gitignored
- **Required env vars:** `PORT`, `DB_PATH` — app exits at startup if any are missing
- **`.env.example`** committed with all keys documented; `.env` gitignored — never commit credentials
- **New migrations:** generate with `bun run db:generate`; commit the SQL file to the repo

### Critical Don't-Miss Rules

**Data Ownership (highest priority invariant)**
- Every job column is either scraper-owned or user-owned — this governs ALL upsert and PATCH logic
- Scraper-owned: `company`, `jobTitle`, `fitScore`, `recommendation`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription`, `sourceUrl`, `dateScraped`
- User-owned (never overwrite on ingest): `applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`
- `PATCH /api/jobs/:id` allowlist: user-owned fields only (`applied`, `status`, `statusOverride`)

**API & Type Safety**
- Never import `Job`, `JobInput`, `IngestPayload`, or `SyncResult` from anywhere except `src/shared/schemas.ts`
- Never use `queryClient.setQueryData` without a documented invalidation strategy
- Error shape must be `{ error: string }` — never `{ message }`, never `{ error: { message } }`, never an envelope

**UI Error Handling**
- Job update (PATCH) errors: transient toast only (low stakes)
- Drawer: no loading state — data must be pre-cached via route loader before drawer opens

**Security**
- Credentials in `.env` only — never logged, never in API responses, never committed

**Post-MVP Features (now implemented — do not treat as deferred)**
- `status_events` table: live with `source` column (`'manual'` | `'email'`); `StatusTimeline` renders events with email indicator
- Email sync: on-demand only via `POST /api/messages/sync`; credentials stored per-user in `user_secrets` (set via onboarding UI); no background poller — `imap-poller.ts` was removed in Epics 9-12
- n8n webhook, cover letter storage: Epic 7 — not yet implemented

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review when epics complete for outdated rules

Last Updated: 2026-03-30
