# Story 1.1: Project Scaffold & Dev/Prod Scripts

Status: done

## Story

As a developer,
I want a correctly scaffolded project with all dependencies installed and dev/prod scripts working,
so that I have a solid foundation to build the full application on.

## Acceptance Criteria

1. **Given** a developer clones the repo and runs `bun install` **When** they run `bun run dev` **Then** Vite dev server starts on `:5173` and Hono API starts on `:3001` concurrently **And** changes to server files hot-reload Hono; changes to client files hot-reload Vite
2. **Given** the project is scaffolded **When** `bun run build` is executed **Then** Vite outputs a production bundle to `dist/` without errors
3. **Given** a production build exists **When** `bun start` is executed **Then** a single Hono process starts on `:3000` serving both `dist/` and `/api/*` routes **And** the server binds to `127.0.0.1` only — not `0.0.0.0`
4. **Given** the project structure **When** a developer inspects the codebase **Then** the directory structure matches `src/client/`, `src/server/`, `src/shared/`, `src/db/` with TypeScript strict mode enabled, path aliases for `src/shared/` configured in `tsconfig.json`, and `components.json` (shadcn) committed

## Tasks / Subtasks

- [x] Task 1: Bootstrap project via create-hono and install all dependencies (AC: 1, 2, 3)
  - [x] Run `bun create hono@latest job-hunt-dashboard --template bun`
  - [x] Add runtime dependencies: `react react-dom hono drizzle-orm @tanstack/react-table @tanstack/react-query @tanstack/react-router`
  - [x] Add dev dependencies: `vite @vitejs/plugin-react @hono/vite-dev-server drizzle-kit typescript zod concurrently`
  - [x] Run `bunx shadcn@latest init` to generate `components.json` and install shadcn/ui
- [x] Task 2: Configure all config files (AC: 2, 3, 4)
  - [x] Write `vite.config.ts` with `@vitejs/plugin-react` and proxy `/api/*` → `http://localhost:3001`
  - [x] Write `tsconfig.json` with strict mode and `@shared/*` path alias pointing to `src/shared/`
  - [x] Write `drizzle.config.ts` with `casing: 'camelCase'` (content is minimal; DB credentials not needed until Story 1.2)
  - [x] Confirm `components.json` is committed (do not gitignore it)
  - [x] Write `.gitignore` excluding `.env`, `data/`, `dist/`, `node_modules/`, `bun.lockb` is committed
- [x] Task 3: Write `package.json` scripts (AC: 1, 2, 3)
  - [x] `"dev"` — runs Vite + Hono API concurrently via `concurrently`
  - [x] `"dev:client"` — runs `vite`
  - [x] `"dev:api"` — runs `PORT=3001 bun run --hot src/index.ts`
  - [x] `"build"` — runs `vite build`
  - [x] `"start"` — runs `bun run src/index.ts`
  - [x] `"db:migrate"` — runs `bun run src/db/migrate.ts` (stub script, actual implementation in Story 1.2)
  - [x] `"db:generate"` — runs `drizzle-kit generate`
- [x] Task 4: Create minimal Hono entry `src/index.ts` (AC: 3)
  - [x] Create Hono app instance
  - [x] Serve `dist/` static bundle in production (use `serveStatic` from `hono/bun`)
  - [x] Bind to `127.0.0.1` via `Bun.serve({ hostname: '127.0.0.1', port: Number(process.env.PORT ?? 3000) })`
  - [x] Leave a clear TODO comment for boot migrations and API routes (Stories 1.2 and 1.3)
- [x] Task 5: Create minimal React entry (AC: 2, 4)
  - [x] Write `index.html` at project root referencing `src/client/main.tsx`
  - [x] Write `src/client/main.tsx` — renders `<div>Job Hunt Dashboard — scaffold ok</div>` wrapped in `<React.StrictMode>` (placeholder; replaced in Story 1.3)
  - [x] Write `src/client/index.css` — Tailwind base directives (shadcn requires this)
- [x] Task 6: Create directory skeleton (AC: 4)
  - [x] Create all required empty directories with `.gitkeep` files: `src/client/components/pipeline/`, `src/client/components/tracker/`, `src/client/components/detail/`, `src/client/components/shared/`, `src/client/components/ui/`, `src/client/routes/`, `src/client/hooks/`, `src/client/lib/`, `src/server/routes/`, `src/server/services/`, `src/server/middleware/`, `src/shared/`, `src/db/migrations/`, `data/`
- [x] Task 7: Create `.env.example` stub (AC: 4)
  - [x] Add all required env vars: `PORT`, `DB_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID`
  - [x] Add post-MVP vars commented out: `N8N_WEBHOOK_SECRET`, `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`
  - [x] Full env validation (fail-fast on missing vars) is NOT in this story — that's Story 1.3
- [x] Task 8: Verify all AC pass
  - [x] `bun install` succeeds
  - [x] `bun run dev` starts both processes without errors
  - [x] `bun run build` outputs `dist/` without TypeScript or Vite errors
  - [x] `bun start` (after build) serves on `127.0.0.1:3000`
  - [x] Directory structure matches architecture spec

### Review Follow-ups (AI)

- [x] [Review][Patch] Path aliases `@/*` and `@shared/*` not registered in vite.config.ts resolve.alias [vite.config.ts; tsconfig.json; components.json]
- [x] [Review][Patch] `PORT` env var silently produces NaN on non-numeric input, binding to port 0 [src/index.ts:15]
- [x] [Review][Patch] `ReactDOM.createRoot` non-null assertion on `#root` element will throw if element is absent [src/client/main.tsx:5]
- [x] [Review][Patch] `serveStatic` uses CWD-relative paths — breaks when process is not started from project root [src/index.ts:11-12]
- [x] [Review][Patch] `data/` gitignored entirely — `.gitkeep` won't be committed, directory absent on fresh clone [.gitignore; data/.gitkeep]
- [x] [Review][Patch] Vite proxy target uses `localhost` instead of `127.0.0.1` — fails on IPv6-default systems [vite.config.ts:9]
- [x] [Review][Defer] `tsconfig.node.json` not referenced in main `tsconfig.json` — IDE tooling only, no build/runtime impact [tsconfig.json] — deferred, pre-existing

## Dev Notes

### Critical Architecture Constraints

**Server MUST bind to `127.0.0.1` — NOT `0.0.0.0`**
```ts
// src/index.ts — correct pattern
export default {
  port: Number(process.env.PORT ?? 3000),
  hostname: '127.0.0.1',
  fetch: app.fetch,
}
```
Do not use `app.listen(3000)` — use `Bun.serve` export pattern for correct hostname binding.

**Technology versions (from architecture spec):**
- Bun 1.3.x (runtime)
- Hono 4.x
- React 19.x
- Vite 8.x
- TanStack Table v8 (`@tanstack/react-table`)
- TanStack Query v5 (`@tanstack/react-query`)
- TanStack Router v1 (`@tanstack/react-router`)
- drizzle-orm with `bun:sqlite` (built-in driver — do NOT install `better-sqlite3`)
- TypeScript strict mode

**Dev mode — two processes, not one:**
The dev setup is two concurrent processes proxied together, NOT `@hono/vite-dev-server` running Hono inside Vite:
1. `vite` on `:5173` — serves React SPA with HMR
2. `bun run --hot src/index.ts` on `:3001` — Hono API with hot reload

`vite.config.ts` proxies `/api/*` from Vite to the Hono process:
```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
```

**drizzle.config.ts must include `casing: 'camelCase'`** — this is required for all future stories. Without it, query results return `snake_case` keys which break the `Job` type contract:
```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  casing: 'camelCase',
  dbCredentials: { url: process.env.DB_PATH ?? './data/jobs.db' },
})
```

**TypeScript path alias** — `tsconfig.json` must configure `@shared/*` → `src/shared/*` so both `src/server/` and `src/client/` can import from `src/shared/schemas.ts` via `import { Job } from '@shared/schemas'`:
```json
{
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@shared/*": ["./src/shared/*"]
    }
  }
}
```

**shadcn init** — run `bunx shadcn@latest init` interactively. Choose:
- Style: Default
- Base color: Zinc (the UX spec uses zinc-950 bg, zinc-900 surface)
- CSS variables: Yes
- Tailwind CSS: Yes

The `components.json` and `src/client/index.css` are generated by shadcn init. Commit both.

### Project Structure Notes

The complete directory structure from the architecture doc (create ALL of these in this story):

```
job-hunt-dashboard/
├── .env.example              ← committed; real .env gitignored
├── .gitignore
├── package.json
├── tsconfig.json             ← strict mode + @shared path alias
├── vite.config.ts            ← react plugin + /api proxy to :3001
├── drizzle.config.ts         ← casing: camelCase
├── components.json           ← shadcn config — committed
├── index.html                ← Vite entry
├── data/                     ← gitignored (SQLite lives here)
├── dist/                     ← gitignored (Vite build output)
└── src/
    ├── index.ts              ← Hono entry: serve dist/ + TODO for migrations/routes
    ├── shared/
    │   └── schemas.ts        ← STUB only: export {} (implemented in Story 1.2)
    ├── db/
    │   ├── schema.ts         ← STUB (implemented in Story 1.2)
    │   ├── client.ts         ← STUB (implemented in Story 1.2)
    │   ├── migrate.ts        ← STUB (implemented in Story 1.2)
    │   └── migrations/       ← empty dir, gitkeep
    ├── server/
    │   ├── routes/           ← empty dir, gitkeep
    │   ├── services/         ← empty dir, gitkeep
    │   └── middleware/       ← empty dir, gitkeep
    └── client/
        ├── main.tsx          ← minimal React entry (replaced in Story 1.3)
        ├── index.css         ← Tailwind base + shadcn CSS vars (from shadcn init)
        ├── lib/              ← empty dir, gitkeep
        ├── hooks/            ← empty dir, gitkeep
        ├── routes/           ← empty dir, gitkeep
        └── components/
            ├── ui/           ← shadcn generated (do not hand-edit)
            ├── pipeline/     ← empty dir, gitkeep
            ├── tracker/      ← empty dir, gitkeep
            ├── detail/       ← empty dir, gitkeep
            └── shared/       ← empty dir, gitkeep
```

**Stub files — important:** Create minimal, non-crashing stubs for `src/shared/schemas.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts` so the TypeScript compiler doesn't error on missing imports. These are replaced with full implementations in Story 1.2.

### What is NOT in Scope for This Story

- DB schema, Zod types, migrations → Story 1.2
- Env validation (fail-fast on missing vars) → Story 1.3
- App shell (header, nav tabs, route structure) → Story 1.3
- TanStack Router / Query setup in main.tsx → Story 1.3
- Any shadcn component beyond what `init` generates → Story 3+
- Any API routes → Epic 2+

### Package.json Scripts Reference

```json
{
  "scripts": {
    "dev": "bun run --bun concurrently \"bun run dev:client\" \"bun run dev:api\"",
    "dev:client": "vite",
    "dev:api": "PORT=3001 bun run --hot src/index.ts",
    "build": "vite build",
    "start": "bun run src/index.ts",
    "db:migrate": "bun run src/db/migrate.ts",
    "db:generate": "drizzle-kit generate"
  }
}
```

### Serving Static Files in Production (src/index.ts)

Hono with Bun serves static files via `serveStatic`. Minimal production-ready entry:
```ts
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'

const app = new Hono()

// TODO Story 1.2: boot migrations here
// TODO Story 1.3: env validation here
// TODO Epic 2+: mount API routes here

// Serve SPA bundle in production
app.use('/*', serveStatic({ root: './dist' }))
app.get('/*', serveStatic({ path: './dist/index.html' }))

export default {
  port: Number(process.env.PORT ?? 3000),
  hostname: '127.0.0.1',
  fetch: app.fetch,
}
```

### Anti-Patterns to Avoid

- ❌ `hostname: '0.0.0.0'` — always `127.0.0.1`
- ❌ Installing `better-sqlite3` or `sqlite3` npm packages — use `bun:sqlite` (built-in)
- ❌ Hand-editing files in `src/client/components/ui/` — shadcn-generated, updated via CLI only
- ❌ Putting actual credentials in `.env.example` — placeholder text only
- ❌ Using `@hono/vite-dev-server` as a Vite plugin (instead of proxy) — the architecture specifies two separate processes

### References

- Architecture: Starter Template → `bun create hono@latest --template bun` [Source: architecture.md#Starter Template Evaluation]
- Architecture: Dev/prod scripts [Source: architecture.md#Development Workflow Integration]
- Architecture: Server binding `127.0.0.1` [Source: architecture.md#Authentication & Security]
- Architecture: Drizzle camelCase config [Source: architecture.md#Gap Analysis → Gap 1]
- Architecture: Complete project structure [Source: architecture.md#Complete Project Directory Structure]
- Architecture: TypeScript path alias requirement [Source: architecture.md#Implementation Patterns → Enforcement Guidelines]
- Epics: Story 1.1 AC [Source: epics.md#Story 1.1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `bun create hono@latest` is interactive and cannot be piped non-interactively; project was scaffolded manually instead with equivalent output.
- `bunx shadcn@latest init` is interactive (shadcn v2 uses preset-based prompts); `components.json` and `src/client/index.css` were created manually with correct zinc theme configuration.
- Bun 1.3.x generates `bun.lock` (text) not `bun.lockb` (binary); story spec refers to older bun binary format but the principle (lockfile committed) is satisfied.
- Vite 8.x uses `@tailwindcss/vite` plugin (Tailwind v4 ships as a Vite plugin, no `tailwind.config.js` needed).

### Completion Notes List

- Installed bun 1.3.11 (not pre-installed in environment).
- All runtime and dev deps installed: hono 4.x, react 19.x, vite 8.x, tanstack table/query/router, drizzle-orm, tailwindcss 4.x, shadcn/ui deps (radix-slot, cva, clsx, tailwind-merge, lucide-react).
- `vite.config.ts`: `@tailwindcss/vite` + `@vitejs/plugin-react` plugins; `/api` proxy to `:3001`.
- `tsconfig.json`: strict mode, `@shared/*` path alias.
- `drizzle.config.ts`: sqlite dialect, `casing: 'camelCase'`.
- `src/index.ts`: Hono with `serveStatic`, binds to `hostname: '127.0.0.1'`, port `3000`.
- `src/client/main.tsx`: minimal React entry with scaffold placeholder text.
- `src/client/index.css`: Tailwind v4 base import + zinc CSS variables (light + dark).
- `components.json`: shadcn config with zinc baseColor, cssVariables: true.
- All directory skeleton created with `.gitkeep` files.
- `.env.example` with all required and post-MVP vars.
- AC verification: `bun run build` → `dist/` built in ~84ms; `bun run src/index.ts` → HTTP 200 on `127.0.0.1:3000`; `tsc --noEmit` → no errors.

### File List

- `job-hunt-dashboard/package.json`
- `job-hunt-dashboard/bun.lock`
- `job-hunt-dashboard/tsconfig.json`
- `job-hunt-dashboard/vite.config.ts`
- `job-hunt-dashboard/drizzle.config.ts`
- `job-hunt-dashboard/components.json`
- `job-hunt-dashboard/index.html`
- `job-hunt-dashboard/.gitignore`
- `job-hunt-dashboard/.env.example`
- `job-hunt-dashboard/src/index.ts`
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/db/schema.ts`
- `job-hunt-dashboard/src/db/client.ts`
- `job-hunt-dashboard/src/db/migrate.ts`
- `job-hunt-dashboard/src/db/migrations/.gitkeep`
- `job-hunt-dashboard/src/client/main.tsx`
- `job-hunt-dashboard/src/client/index.css`
- `job-hunt-dashboard/src/client/components/pipeline/.gitkeep`
- `job-hunt-dashboard/src/client/components/tracker/.gitkeep`
- `job-hunt-dashboard/src/client/components/detail/.gitkeep`
- `job-hunt-dashboard/src/client/components/shared/.gitkeep`
- `job-hunt-dashboard/src/client/components/ui/.gitkeep`
- `job-hunt-dashboard/src/client/routes/.gitkeep`
- `job-hunt-dashboard/src/client/hooks/.gitkeep`
- `job-hunt-dashboard/src/client/lib/.gitkeep`
- `job-hunt-dashboard/src/server/routes/.gitkeep`
- `job-hunt-dashboard/src/server/services/.gitkeep`
- `job-hunt-dashboard/src/server/middleware/.gitkeep`
- `job-hunt-dashboard/src/shared/.gitkeep`
- `job-hunt-dashboard/data/.gitkeep`

## Change Log

- 2026-03-28: Initial implementation — project scaffold, all deps, config files, directory skeleton, stub files. All 8 tasks complete. (Agent: claude-sonnet-4-6)
