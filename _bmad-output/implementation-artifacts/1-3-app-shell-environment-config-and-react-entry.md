# Story 1.3: App Shell, Environment Config & React Entry

Status: done

## Story

As a user,
I want the app to start cleanly with a basic shell visible at `localhost:3000` and to fail fast with a clear message if my `.env` is misconfigured,
so that setup errors are immediately obvious and the interface is ready for daily use.

## Acceptance Criteria

1. **Given** `.env.example` is committed to the repo **When** a developer inspects it **Then** all required environment variables are documented: `PORT`, `DB_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID` **And** post-MVP variables (`N8N_WEBHOOK_SECRET`, `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`) are present but commented out with setup instructions

2. **Given** a required env var is missing from `.env` **When** `bun start` is run **Then** the app exits immediately with `console.error` listing all missing keys — no silent defaults, no partial startup

3. **Given** all env vars are present and `bun start` succeeds **When** the user opens `localhost:3000` **Then** the React SPA renders with a header bar (`h-14`) containing the app name (left), two view tabs — Pipeline and Tracker (center), and a Sync button placeholder (right) **And** TanStack Router is configured with routes `/` (Pipeline) and `/tracker`; TanStack `QueryClientProvider` wraps the router at the app root **And** the Pipeline route (`/`) renders an empty table card with the message "No jobs yet. Hit Sync to pull from Google Sheets."

4. **Given** the app is running in dev mode (`bun run dev`) **When** `localhost:5173` is opened **Then** the same React SPA renders correctly with hot reload active

## Tasks / Subtasks

- [x] Task 1: Create `.env.example` with all required and post-MVP vars (AC: 1)
  - [x] Add all 6 required vars: `PORT`, `DB_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID`
  - [x] Add post-MVP vars commented out with setup instructions: `N8N_WEBHOOK_SECRET`, `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`
  - [x] Use sensible defaults for PORT/DB_PATH, empty values for secrets

- [x] Task 2: Add fail-fast env validation to `src/index.ts` (AC: 2)
  - [x] Replace `// TODO Story 1.3: env validation here` with validation function
  - [x] Validate all 6 required vars — fail with `console.error` listing ALL missing keys, then `process.exit(1)`
  - [x] No silent defaults — every required var must be explicitly set in `.env`
  - [x] Keep `// TODO Epic 2+: mount API routes here` comment intact

- [x] Task 3: Set up CSS foundation in `src/client/index.css` (AC: 3, 4)
  - [x] Add Tailwind directives (`@tailwind base/components/utilities`)
  - [x] Override shadcn CSS variables with dark mode zinc palette (zinc-950 background, zinc-900 surface, etc.)
  - [x] Set `font-family: Inter, system-ui, -apple-system, sans-serif` on body
  - [x] Install shadcn Button if not present: `bunx shadcn@latest add button`

- [x] Task 4: Create TanStack Query client singleton at `src/client/lib/query-client.ts` (AC: 3, 4)
  - [x] Export `queryClient` singleton with `staleTime: 0, retry: 1`
  - [x] No other imports from project files (prevent circular deps)

- [x] Task 5: Create TanStack Router configuration at `src/client/lib/router.ts` (AC: 3, 4)
  - [x] Define `rootRoute` (component: Layout), `indexRoute` (`/`), `trackerRoute` (`/tracker`)
  - [x] Export `router` instance from `createRouter({ routeTree })`
  - [x] Add `declare module '@tanstack/react-router'` type registration block
  - [x] Route loaders are empty for now — data-fetching loaders added in Epic 3

- [x] Task 6: Create app shell Layout at `src/client/components/shared/Layout.tsx` (AC: 3)
  - [x] Header `h-14 bg-zinc-900 border-b border-zinc-800` with three sections: app name (left), nav tabs (center), Sync placeholder (right)
  - [x] Use TanStack Router `<Link>` with `activeProps`/`inactiveProps` for Pipeline/Tracker tabs
  - [x] Sync Button is disabled placeholder (`variant="outline" size="sm" disabled`)
  - [x] Render `<Outlet />` in `<main className="h-[calc(100vh-56px)] overflow-auto">`

- [x] Task 7: Create Pipeline route at `src/client/routes/index.tsx` (AC: 3)
  - [x] Table card: `rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden`
  - [x] Centered empty state: "No jobs yet. Hit Sync to pull from Google Sheets." + disabled Button
  - [x] No data fetching — just the empty state UI (TanStack Table wired in Story 3.2)

- [x] Task 8: Create Tracker route placeholder at `src/client/routes/tracker.tsx` (AC: 3)
  - [x] Minimal card placeholder — full implementation in Epic 5

- [x] Task 9: Wire React entry point at `src/client/main.tsx` (AC: 3, 4)
  - [x] `QueryClientProvider` wrapping `RouterProvider` — in that order
  - [x] Import `queryClient` from `./lib/query-client` and `router` from `./lib/router`
  - [x] Import `./index.css` for global Tailwind styles

- [x] Task 10: Verify all ACs pass
  - [x] `tsc --noEmit` — zero TypeScript errors
  - [x] `bun start` without `.env` — exits with `console.error` listing all 6 missing vars
  - [x] `bun start` with all vars — `localhost:3000` renders header + Pipeline empty state
  - [x] `bun run dev` — `localhost:5173` renders same app with hot reload
  - [x] Pipeline and Tracker tabs navigable; active tab shows border indicator

## Dev Notes

### Critical: Replace Story 1.3 TODO in `src/index.ts`

Story 1.2 left this exact comment in `src/index.ts`:
```
// TODO Story 1.3: env validation here
```

**Replace it with the env validation block below.** Do NOT touch anything else in the file.

Current `src/index.ts` structure after Story 1.2:
```ts
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { runMigrations } from './db/migrate'

const app = new Hono()

runMigrations()
// TODO Story 1.3: env validation here         ← REPLACE THIS
// TODO Epic 2+: mount API routes here         ← KEEP THIS

app.use('/*', serveStatic({ root: './dist' }))
app.get('/*', serveStatic({ path: './dist/index.html' }))

export default {
  port: Number(process.env.PORT ?? 3000),
  hostname: '127.0.0.1',
  fetch: app.fetch,
}
```

**Note on ordering:** Migrations run before env validation because `src/db/client.ts` has a `DB_PATH` fallback (`./data/jobs.db`). Env validation catches misconfiguration before any routes attempt to use the Google API credentials.

### Env Validation — Exact Implementation

```ts
// Replace the TODO Story 1.3 comment with:

const REQUIRED_ENV_VARS = [
  'PORT',
  'DB_PATH',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GOOGLE_SPREADSHEET_ID',
] as const

const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key])
if (missingVars.length > 0) {
  console.error(
    `[env] Missing required environment variables:\n${missingVars.map((k) => `  - ${k}`).join('\n')}`
  )
  process.exit(1)
}
```

- **All-or-nothing** — list ALL missing vars before exiting, not just the first
- **`process.exit(1)`** — non-zero exit code signals failure to shell/process managers
- **Deferred from Story 1.2** — `DB_PATH` validation was explicitly flagged as Story 1.3 scope in the deferred-work.md review

### `.env.example` — Exact Format

```
PORT=3000
DB_PATH=./data/jobs.db
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_SPREADSHEET_ID=

# Post-MVP: Email Status Detection (Epic 6)
# N8N_WEBHOOK_SECRET=
# IMAP_HOST=imap.gmail.com
# IMAP_USER=
# IMAP_PASS=
```

Create this at the project root (alongside `package.json`). The actual `.env` file is gitignored; `.env.example` is committed.

### CSS Foundation — `src/client/index.css`

shadcn CSS variables use HSL triplets (no `hsl()` wrapper). Override the defaults with the dark zinc palette:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 240 10% 3.9%;        /* zinc-950 */
    --foreground: 240 5% 96.1%;        /* zinc-100 */
    --card: 240 3.7% 10.9%;            /* zinc-900 */
    --card-foreground: 240 5% 96.1%;
    --popover: 240 3.7% 10.9%;
    --popover-foreground: 240 5% 96.1%;
    --primary: 240 5% 96.1%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;       /* zinc-800 */
    --secondary-foreground: 240 5% 96.1%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;  /* zinc-400 */
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 240 5% 96.1%;
    --destructive: 0 72.2% 50.6%;
    --destructive-foreground: 240 5% 96.1%;
    --border: 240 3.7% 27.5%;          /* zinc-700 */
    --input: 240 3.7% 27.5%;
    --ring: 221 83% 53%;               /* blue-600 */
    --radius: 0.5rem;
  }
}

* {
  @apply border-border;
}

body {
  @apply bg-background text-foreground;
  font-family: Inter, system-ui, -apple-system, sans-serif;
}
```

**The entire app is always dark** — no `dark:` prefix variants, no `.dark` class toggle. Light mode is not supported. The palette defined in `:root` is permanent.

**Semantic score colors** — applied as direct Tailwind classes in components (Stories 3.x), not as CSS variables:
- Score ≥80: `border-emerald-600 text-emerald-400`
- Score 60–79: `border-amber-500 text-amber-400`
- Score <60: `border-red-700 text-red-500`

### TanStack Query Client — `src/client/lib/query-client.ts`

```ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 1,
    },
  },
})
```

- **Singleton** — imported by `main.tsx` and `router.ts`; no circular deps since this file imports nothing from the project
- **`staleTime: 0`** — always re-fetch after window focus; appropriate for a sync-driven data model where data freshness matters

### TanStack Router Config — `src/client/lib/router.ts`

```ts
import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { Layout } from '../components/shared/Layout'
import { PipelineRoute } from '../routes/index'
import { TrackerRoute } from '../routes/tracker'

const rootRoute = createRootRoute({
  component: Layout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PipelineRoute,
})

const trackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tracker',
  component: TrackerRoute,
})

const routeTree = rootRoute.addChildren([indexRoute, trackerRoute])

export const router = createRouter({ routeTree })

// Required for TypeScript inference throughout the app
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

- **Route loaders are empty** — `loader: () => queryClient.ensureQueryData(jobsQueryOptions)` added in Epic 3 when the jobs API and `useJobsQuery` hook exist
- **Drawer is not a route** — it is a UI overlay managed with `useState` in the table component (Story 4.1)
- **`declare module` block is required** — enables type-safe `<Link to="...">` and `useNavigate` throughout the app

### React Entry Point — `src/client/main.tsx`

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { queryClient } from './lib/query-client'
import { router } from './lib/router'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
```

- **`QueryClientProvider` wraps `RouterProvider`** — per architecture spec; ensures route loaders can call `queryClient.ensureQueryData` in Epic 3
- **`./index.css` imported here** — Tailwind base styles applied globally before any component renders
- If `src/client/main.tsx` exists as a stub from Story 1.1, **replace it entirely**

### App Shell Layout — `src/client/components/shared/Layout.tsx`

```tsx
import { Outlet, Link } from '@tanstack/react-router'
import { Button } from '../ui/button'

export function Layout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4">
        {/* App name — left */}
        <span className="font-semibold text-zinc-100 shrink-0">Job Hunt</span>

        {/* View tabs — center */}
        <nav className="flex-1 flex justify-center gap-1">
          <Link
            to="/"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Pipeline
          </Link>
          <Link
            to="/tracker"
            className="px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'text-zinc-100 border-b-2 border-zinc-100' }}
            inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
          >
            Tracker
          </Link>
        </nav>

        {/* Sync button placeholder — right (wired in Story 2.3) */}
        <Button variant="outline" size="sm" disabled className="shrink-0">
          Sync
        </Button>
      </header>

      <main className="h-[calc(100vh-56px)] overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

**TanStack Router `<Link>` `activeProps`/`inactiveProps`** — these are TanStack Router v1 features that apply additional props when the link matches the current route. No manual `pathname` comparison needed. The `activeProps` and `inactiveProps` merge with the base `className`.

**`<Outlet />`** — renders the matched child route (PipelineRoute or TrackerRoute) inside the main area.

**Sync Button** — disabled placeholder only. The real `SyncButton` component with `useSyncMutation`, spinner, and inline result feedback is built in Story 2.3. Do not add mutation logic here.

### Pipeline Route — `src/client/routes/index.tsx`

```tsx
import { Button } from '../components/ui/button'

export function PipelineRoute() {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-zinc-400">
              No jobs yet. Hit Sync to pull from Google Sheets.
            </p>
            <Button variant="outline" size="sm" disabled>
              Sync
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- **Empty state only** — the full TanStack Table with columns, FitScoreBadge, ActionChip, column visibility toggle is built in Stories 3.1–3.3
- **Card container classes are final** — `rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden` matches UX spec exactly; do not modify
- **No data fetching** — `useJobsQuery` hook built in Story 3.1; skeleton loading state (UX-DR14) added then

### Tracker Route — `src/client/routes/tracker.tsx`

```tsx
export function TrackerRoute() {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-center py-16 px-4">
          <p className="text-sm text-zinc-400">Tracker — coming in Epic 5.</p>
        </div>
      </div>
    </div>
  )
}
```

Minimal placeholder. Full TrackerTable with visual row aging built in Stories 5.1–5.2.

### File Inventory: Create vs Replace vs Skip

Story 1.1 scaffolded via `bun create hono@latest --template bun` then added React/Vite manually. Check actual file state before acting:

| File | Expected State After Story 1.1 | Action |
|------|-------------------------------|--------|
| `src/client/main.tsx` | Stub or template default | **Replace** with exact implementation above |
| `src/client/index.css` | Empty or minimal | **Replace** with dark palette CSS |
| `src/index.ts` | Exists (Story 1.2 modified) | **Modify** — replace TODO comment only |
| `vite.config.ts` | Exists with `@hono/vite-dev-server` | **Skip** — no changes needed |
| `tailwind.config.ts` | Exists from shadcn init | **Skip** unless `content` array is missing `./src/client/**/*.{ts,tsx}` |
| `components.json` | Committed from Story 1.1 | **Skip** — already configured |
| `src/client/components/ui/button.tsx` | May or may not exist | Run `bunx shadcn@latest add button` if missing |
| `.env.example` | Does not exist | **Create** at project root |
| `src/client/lib/query-client.ts` | Does not exist | **Create** |
| `src/client/lib/router.ts` | Does not exist | **Create** |
| `src/client/components/shared/Layout.tsx` | Does not exist | **Create** |
| `src/client/routes/index.tsx` | Does not exist | **Create** |
| `src/client/routes/tracker.tsx` | Does not exist | **Create** |

**Directories** — create if missing: `src/client/lib/`, `src/client/components/shared/`, `src/client/routes/`

### shadcn Button Installation

Story 1.1 committed `components.json`. To add Button:

```bash
bunx shadcn@latest add button
```

This writes `src/client/components/ui/button.tsx`. **Never hand-edit files in `src/client/components/ui/`** — extend via `className` prop only.

If Button already exists from Story 1.1, skip this step.

### Shared Type Imports (Unchanged from Story 1.2)

All type imports continue to use the frozen `@shared/*` alias:
```ts
import { Job } from '@shared/schemas'
```

Story 1.3 does not add new types. The existing `Job`, `JobInput`, `IngestPayload`, `SyncResult` types from `src/shared/schemas.ts` are available but not used yet in these shell components — they become relevant in Epic 3.

### Anti-Patterns to Avoid

- ❌ `process.exit(0)` on env validation failure — use `process.exit(1)` (non-zero = error)
- ❌ Silent defaults for Google credentials — `GOOGLE_CLIENT_ID=''` passes the check; it must be explicitly set to a real value
- ❌ `fetch('/api/jobs')` in any component — data hooks (`useJobsQuery`) come in Epic 3
- ❌ `useState` for Pipeline/Tracker active tab — use TanStack Router `<Link activeProps>` instead
- ❌ `window.location.pathname` for route detection — use TanStack Router APIs
- ❌ Modifying `src/client/components/ui/*.tsx` — shadcn-generated; extend via `className` only
- ❌ Circular imports: route files should NOT import from `router.ts`; `router.ts` imports from route files, not vice versa
- ❌ Adding Zustand, Redux, Jotai, or any global store — TanStack Query owns server state; `useState` owns UI state; nothing else
- ❌ `darkMode: 'media'` in Tailwind config — entire app is always dark; `darkMode: 'class'` or omit (default behavior)
- ❌ `0.0.0.0` binding in `src/index.ts` — server must use `hostname: '127.0.0.1'` (already in place from Story 1.1)

### Project Structure Notes

New files this story adds (relative to project root):

```
.env.example
src/
  index.ts                              (modified — replace TODO comment)
  client/
    main.tsx                            (create/replace)
    index.css                           (create/replace)
    lib/
      query-client.ts                   (create)
      router.ts                         (create)
    components/
      shared/
        Layout.tsx                      (create)
      ui/
        button.tsx                      (create via shadcn CLI)
    routes/
      index.tsx                         (create)
      tracker.tsx                       (create)
```

No changes to: `src/db/`, `src/shared/`, `vite.config.ts`, `drizzle.config.ts`, `tsconfig.json`, `package.json`, `components.json`

### Verification Checklist

- [ ] `tsc --noEmit` — zero errors
- [ ] `bun start` without `.env` — exits non-zero, `console.error` lists all 6 missing var names
- [ ] `bun start` with all 6 vars set — no crash; `localhost:3000` renders app shell
- [ ] Header: app name visible left, Pipeline/Tracker tabs centered, Sync button right
- [ ] Pipeline tab: active border indicator; Tracker tab: muted text
- [ ] Clicking Tracker tab: URL changes to `/tracker`, Tracker content renders
- [ ] Clicking Pipeline tab: URL changes to `/`, empty state renders with card + message
- [ ] `bun run dev` — `localhost:5173` same SPA, edits hot-reload
- [ ] No console errors in browser on any route

### References

- Architecture: frontend folder structure, file naming conventions [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure]
- Architecture: TanStack Query key shapes, cache update strategy, state management [Source: _bmad-output/planning-artifacts/architecture.md#State Management]
- Architecture: enforcement guidelines — import conventions, anti-patterns [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines]
- Architecture: environment configuration, `.env.example` vars [Source: _bmad-output/planning-artifacts/architecture.md#Configuration]
- UX: app shell layout, header structure (h-14, three-section layout) [Source: _bmad-output/planning-artifacts/ux-design-specification.md#App Shell]
- UX: dark mode palette — zinc CSS variable values [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design Tokens]
- UX: navigation — view tabs, active/inactive states [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Navigation Patterns]
- UX: empty state — "No jobs yet" message + Sync Button [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Loading & Empty States]
- UX: typography — Inter font, text-sm table density, font sizes [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Typography System]
- Epics: Story 1.3 acceptance criteria and technical requirements [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3]
- Story 1.2: `src/index.ts` current structure, TODO comments to preserve/replace [Source: _bmad-output/implementation-artifacts/1-2-database-schema-shared-types-and-boot-migrations.md#src/index.ts]
- Story 1.2: DB_PATH env validation deferred to Story 1.3 [Source: _bmad-output/implementation-artifacts/deferred-work.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Tailwind v4 is in use (`@import "tailwindcss"` + `@theme inline` pattern); story spec shows v3 directives. Used v4-compatible CSS with `hsl()` values for CSS vars instead of bare HSL triplets.
- `src/client/lib/utils.ts` created (not in story spec) — required by shadcn `button.tsx` which imports `cn` from `@/lib/utils`. Created with standard `clsx` + `tailwind-merge` implementation.
- `bun` not in PATH for shadcn CLI; used full path `/home/zac/.bun/bin/bun x shadcn@latest add button --yes` with `PATH` export to resolve.

### Completion Notes List

- All 10 tasks completed in single session (2026-03-28).
- `.env.example` updated: 6 required vars with empty values, 4 post-MVP vars commented out.
- Fail-fast env validation added to `src/index.ts` — exits with code 1 listing all missing vars; verified with `bun run src/index.ts` (no .env).
- CSS updated to always-dark zinc palette using Tailwind v4 compatible `hsl()` CSS variable values; `@theme inline` mappings preserved.
- shadcn Button installed via `bunx shadcn@latest add button`; required `utils.ts` helper created.
- TanStack Query client singleton, Router config, Layout, Pipeline route, Tracker route, and main.tsx entry wired up per story spec.
- `tsc --noEmit` passes with zero errors. Vite build succeeds (157 modules, 331KB bundle). Server returns HTTP 200 with all env vars set.

### File List

- `.env.example` (modified)
- `src/index.ts` (modified — env validation block)
- `src/client/index.css` (modified — dark zinc palette)
- `src/client/main.tsx` (modified — full entry point)
- `src/client/lib/query-client.ts` (created)
- `src/client/lib/router.ts` (created)
- `src/client/lib/utils.ts` (created — required by shadcn button)
- `src/client/components/shared/Layout.tsx` (created)
- `src/client/components/ui/button.tsx` (created via shadcn CLI)
- `src/client/routes/index.tsx` (created)
- `src/client/routes/tracker.tsx` (created)

### Review Findings

- [x] [Review][Decision] `.env.example` required vars lack inline documentation — AC1 requires vars to be "documented" and post-MVP vars "commented out with setup instructions." The dev notes specify empty values (`GOOGLE_CLIENT_ID=`) with only a group label for post-MVP vars. The old format used `your-google-client-id` style hints and section headers. Decide: keep current minimal format (matches spec dev notes exactly) or restore descriptive placeholder values and per-section comments to better satisfy AC1's documentation intent.
- [x] [Review][Patch] Non-null assertion on `getElementById` silently discards explicit error message [src/client/main.tsx]
- [x] [Review][Defer] No Suspense boundary at app root [src/client/main.tsx] — deferred, pre-existing
- [x] [Review][Defer] PORT type validity not checked (non-numeric PORT passes env guard) [src/index.ts] — deferred, pre-existing
- [x] [Review][Defer] migrate.ts uses CWD-relative migrations path — deferred, pre-existing

## Change Log

- 2026-03-28: Story 1.3 implemented — app shell, env validation, dark zinc CSS, TanStack Query/Router wiring, Pipeline/Tracker routes. All ACs verified. Status → review.
