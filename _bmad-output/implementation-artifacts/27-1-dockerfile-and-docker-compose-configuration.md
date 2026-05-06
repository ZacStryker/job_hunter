# Story 27.1: Dockerfile & Docker Compose Configuration

Status: done

## Story

As an operator,
I want the app fully containerized with Docker Compose — correct path handling, environment configuration, and a volume-mounted SQLite database —
So that deployment to Linode is a `docker compose up` away.

## Acceptance Criteria

1. **Given** a `Dockerfile` at `job-hunt-dashboard/Dockerfile`
   **When** `docker build` runs from `job-hunt-dashboard/`
   **Then** the image builds successfully using a multi-stage Bun build: first stage installs all deps and runs `bun run build`; second stage copies `dist/`, `src/`, and production `node_modules` only

2. **Given** any server code that references file paths (migrations, static assets)
   **When** those paths are resolved at runtime inside the container
   **Then** they use `import.meta.dir` — not `process.cwd()` or relative strings — so paths resolve correctly regardless of working directory

3. **Given** `job-hunt-dashboard/docker-compose.yml` and a `.env` file present on the host
   **When** `docker compose up -d` runs from `job-hunt-dashboard/`
   **Then** the app container starts, runs boot migrations, and serves on the configured `PORT`
   **And** a named volume mounts the `data/` directory — SQLite data survives container rebuilds and restarts

4. **Given** `NODE_ENV=production` in the container environment
   **When** Hono initializes
   **Then** it binds to `0.0.0.0`; in development (`NODE_ENV` not `production`) it binds to `127.0.0.1`

5. **Given** the container starts on first deploy with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set
   **When** boot runs `seedAdmin()`
   **Then** an admin user is created if no users exist; subsequent restarts skip creation (idempotent — already implemented in `src/index.ts`)

6. **Given** `job-hunt-dashboard/.env.example`
   **When** it is read
   **Then** it documents all required env vars including `ADMIN_EMAIL` and `ADMIN_PASSWORD` (first-deploy only, with clear comment)

## Tasks / Subtasks

### [x] 1. Fix migration path in `src/db/migrate.ts` (AC: #2)

Current code uses a relative CWD path:
```ts
migrate(db, { migrationsFolder: './src/db/migrations' })
```

This works when `bun` is run from the project root, but is fragile. The AC requires `import.meta.dir` for all path resolution.

Change:
```ts
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { join } from 'node:path'   // ← ADD THIS IMPORT
import { db } from './client'

export function runMigrations(): void {
  migrate(db, { migrationsFolder: join(import.meta.dir, 'migrations') })
  console.log('[db] Migrations complete')
}

if (import.meta.main) {
  runMigrations()
}
```

`import.meta.dir` in `src/db/migrate.ts` resolves to the `src/db/` directory, so `join(import.meta.dir, 'migrations')` = `src/db/migrations/` — correct regardless of CWD.

Note: `import.meta.dir` (Bun-native) and `import.meta.dirname` (Node.js compat, also works in Bun 1.1+) are equivalent. Use `import.meta.dir` to stay consistent with `src/index.ts`.

### [x] 2. Fix hostname binding in `src/index.ts` (AC: #4)

Line ~120 currently reads:
```ts
export default {
  port,
  hostname: '127.0.0.1',
  fetch: app.fetch,
  idleTimeout: 120,
}
```

Change to:
```ts
export default {
  port,
  hostname: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
  fetch: app.fetch,
  idleTimeout: 120,
}
```

- Dev: `127.0.0.1` — unchanged, no external exposure
- Docker prod: `0.0.0.0` — required for container networking; Nginx (Story 27.2) will be the external gateway

### [x] 3. Create `job-hunt-dashboard/.dockerignore` (AC: #1)

```
node_modules/
scraper/node_modules/
scraper/sessions/
scraper/auth/
dist/
data/
.env
dev.db
*.log
screenshots/
screenshot.py
screenshot.sh
screenshot.ts
get-refresh-token.ts
```

This keeps the Docker build context small and prevents secrets (`.env`) from being copied into the image.

### [x] 4. Create `job-hunt-dashboard/Dockerfile` (AC: #1, #3)

```dockerfile
# ── Stage 1: builder ────────────────────────────────────────────────
FROM oven/bun:1.3 AS builder
WORKDIR /app

# Install main app deps (layer cached until package files change)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install scraper Node.js deps (separate cache layer)
COPY scraper/package.json scraper/package-lock.json ./scraper/
RUN cd scraper && npm install --omit=dev

# Build frontend
COPY . .
RUN bun run build

# ── Stage 2: production ─────────────────────────────────────────────
FROM oven/bun:1.3
WORKDIR /app

# Copy production artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/scraper ./scraper
COPY --from=builder /app/package.json ./package.json

# Install Playwright Chromium + system packages (needed for PDF generation and scraper)
# bunx finds playwright in the copied node_modules; --with-deps installs apt packages
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN bunx playwright install --with-deps chromium

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
```

**Key design decisions:**
- `oven/bun:1.3` includes a `node` shim — the scraper child process spawned with `spawn('node', ...)` works without installing Node separately
- Playwright Chromium is installed once and shared between the main app (PDF generation) and the scraper (LinkedIn/Indeed scraping) via `PLAYWRIGHT_BROWSERS_PATH`
- `--with-deps` installs the required Debian system packages for Chromium headless (libnss3, libatk, etc.)
- Migration SQL files live in `src/db/migrations/` — they're included in the `COPY src/ ./src` step
- The scraper's `auth/` and `sessions/` dirs are excluded by `.dockerignore`; auth files will need to be bind-mounted for LinkedIn scraping (volume or file mount at `AUTH_DIR`)

### [x] 5. Create `job-hunt-dashboard/docker-compose.yml` (AC: #3, #5)

```yaml
services:
  app:
    build: .
    env_file: .env
    ports:
      - "${PORT}:${PORT}"
    volumes:
      - job_hunt_data:/app/data
    restart: unless-stopped

volumes:
  job_hunt_data:
```

**Notes:**
- Port mapping uses `${PORT}` from `.env` — matches `PORT=3000` default
- `job_hunt_data` named volume mounts to `/app/data` — SQLite DB (`DB_PATH=/app/data/jobs.db`) and cover letter/resume PDFs survive container rebuilds
- Story 27.2 will update this file: remove the `ports` entry from app service and add the Nginx service
- `env_file: .env` loads all environment variables from `.env` in the same directory

### [x] 6. Update `job-hunt-dashboard/.env.example` (AC: #6)

Append after the existing `SMTP_FROM=` line:

```
# First-deploy only: creates admin account if no users exist; remove or rotate after setup
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

The full updated file should read (verify existing content is preserved):

```
PORT=3000
DB_PATH=/app/data/jobs.db   # Docker: use /app/data/jobs.db; dev: ./data/jobs.db

# Email sync: on-demand via POST /api/messages/sync; IMAP credentials stored per-user in DB (set via onboarding UI)

# Embedded Scraper (Epic 14)
AUTH_DIR=          # Path to scraper auth directory; defaults to scraper/auth/
                   # Must contain linkedin.json (saved LinkedIn browser session)
                   # One-time setup: run save-linkedin-auth.js from the job-scraper repo

# Analysis Service (Epic 13)
# One-time setup: bunx playwright install chromium
ANTHROPIC_API_KEY=    # required for Analysis, Cover Letter, and Resume; returns 503 if absent

# Auth & Encryption (Epic 24)
ENCRYPTION_KEY=         # 32-byte hex: openssl rand -hex 32
APP_URL=https://yourdomain.com  # Used in email links (activation, password reset)

# SMTP Mailer (Epic 24)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=             # e.g., "Job Hunt <noreply@example.com>"

# First-deploy only: creates admin account if no users exist; remove or rotate after setup
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

Note: The `DB_PATH` should be changed to `/app/data/jobs.db` for Docker usage (pointing into the mounted volume). Update the comment to make this clear.

### Review Findings

- [x] [Review][Patch] `DB_PATH` default in `.env.example` breaks dev workflows — default changed to `/app/data/jobs.db` (Docker-only path); developers copying `.env.example` to `.env` without editing get a broken dev setup. Revert default to `./data/jobs.db`, keep Docker path in comment only. [`.env.example`:2]
- [x] [Review][Patch] `NODE_ENV` not set before build/install steps in Dockerfile — builder stage runs `bun run build` without `ENV NODE_ENV=production` so Vite produces a dev bundle; production stage runs `RUN bunx playwright install` before `ENV NODE_ENV=production` is declared. Add `ENV NODE_ENV=production` in builder stage before `RUN bun run build`, and move `ENV NODE_ENV=production` before `RUN bunx playwright install` in stage 2. [`Dockerfile`]
- [x] [Review][Patch] `PORT` variable has no default in `docker-compose.yml` ports mapping — if `.env` is absent or `PORT` is unset, Docker Compose substitutes an empty string producing an invalid binding, leaving the container unreachable. Use `${PORT:-3000}:${PORT:-3000}`. [`docker-compose.yml`:6]
- [x] [Review][Patch] devDependencies in production `node_modules` violates AC1 — `bun install --frozen-lockfile` in builder installs all deps including `vite`, `typescript`, `drizzle-kit`, etc., which are then copied verbatim to stage 2. AC1 requires "production node_modules only". Add a production-only install before the stage-2 COPY (e.g., `RUN bun install --production` in stage 2 after copying `package.json`). [`Dockerfile`]
- [x] [Review][Defer] `seedAdmin` runs before `REQUIRED_ENV_VARS` validation [`src/index.ts`] — deferred, pre-existing
- [x] [Review][Defer] `DB_PATH` fallback is CWD-relative while `DATA_DIR` in `api-jobs.ts` uses `import.meta` — inconsistent path resolution strategy [`src/db/client.ts`:5] — deferred, pre-existing
- [x] [Review][Defer] Scraper `sessions/` files use `process.cwd()`-relative paths — not volume-mounted, sessions lost on container restart [`scraper/src/scrapers/indeed.js`:5] — deferred, pre-existing scraper behavior
- [x] [Review][Defer] Duplicate SMTP block entries in `.env.example` — `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` appear twice [`.env.example`] — deferred, pre-existing
- [x] [Review][Defer] No healthcheck in Dockerfile or Compose — container appears healthy during crash loops [`Dockerfile`, `docker-compose.yml`] — deferred, out of story scope
- [x] [Review][Defer] `argon2.hash` unhandled rejection on invalid `ADMIN_PASSWORD` crashes process before env validation [`src/index.ts`:35] — deferred, pre-existing
- [x] [Review][Defer] `ADMIN_PASSWORD` persists in env indefinitely — no enforcement of "remove or rotate" comment; intentional design per spec [`.env.example`] — deferred, intentional design

## Dev Notes

### Path Resolution Pattern — Don't Use process.cwd() or Relative Strings

All file path resolution in server code uses `import.meta.dir` (or `import.meta.dirname`):
- `src/index.ts:96` — distDir uses `import.meta.dir` ✓ (already correct)
- `src/server/routes/api-jobs.ts` — DATA_DIR uses `import.meta.dirname` ✓ (fixed in commit 9941643)
- `src/server/services/scraper-process.ts:10` — SCRAPER_DIR uses `import.meta.dir` ✓ (already correct)
- `src/db/migrate.ts` — uses `'./src/db/migrations'` ✗ → must fix (Task 1)

### No SESSION_SECRET Env Var

The epic spec mentions SESSION_SECRET as a required env var, but the implementation uses **opaque random session tokens stored in SQLite** — not signed JWTs. There is no `SESSION_SECRET` in the codebase and none is needed. Do not add it.

### Scraper Playwright vs Main App Playwright

Both the main app (`package.json`: playwright 1.59.1) and the scraper (`scraper/package.json`: playwright 1.58.2) have Playwright as a dependency. Setting `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` in the container makes both find the same installed Chromium binary. The scraper inherits this env var because it's spawned with `{ env: { ...process.env, PORT: ... } }` in `scraper-process.ts:35` — process.env is passed through.

### LinkedIn Auth in Docker

The scraper requires LinkedIn browser session cookies at `AUTH_DIR` (defaults to `scraper/auth/`). This directory is gitignored and excluded from the Docker image. For production scraping, bind-mount the auth directory:
```yaml
volumes:
  - ./scraper/auth:/app/scraper/auth
```
This is an operational concern beyond the scope of this story — just don't break the path logic.

### SCRAPER_URL / SCRAPER_TOKEN Are Not .env Vars

`scraper-process.ts` sets `process.env.SCRAPER_URL` dynamically when the embedded scraper starts. These don't belong in `.env` and are not needed as Docker env vars. The scraper is started automatically by the main app on boot.

### Admin Seed (AC #5) — Already Implemented

`seedAdmin()` in `src/index.ts:26-51` already handles first-deploy bootstrapping. The only missing piece is documenting `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env.example` (Task 6). No code changes needed for AC #5.

### Playwright `--with-deps` Requires Root

`bunx playwright install --with-deps chromium` runs `apt-get install` internally. The `oven/bun:1.3` Dockerfile runs as root by default, so this works without `sudo`. If the image ever switches to a non-root user, add `USER root` before the playwright install RUN and switch back after.

### docker-compose.yml Port Mapping

Story 27.2 will update `docker-compose.yml` to remove the `ports` entry from the app service and add Nginx as the gateway. Make the `ports:` section easy to find and remove.

### Project Structure Notes

**New files:**
```
job-hunt-dashboard/Dockerfile
job-hunt-dashboard/.dockerignore
job-hunt-dashboard/docker-compose.yml
```

**Modified files:**
```
job-hunt-dashboard/src/db/migrate.ts           ← fix relative migration path
job-hunt-dashboard/src/index.ts                ← conditional hostname binding
job-hunt-dashboard/.env.example                ← add ADMIN_EMAIL, ADMIN_PASSWORD
```

### References

- Epic 27.1 spec: `_bmad-output/planning-artifacts/epics/epic-27-production-deployment.md#story-271`
- Hostname binding pattern: `src/index.ts:118-123` (where `export default { port, hostname, ... }` is)
- Existing `import.meta.dir` usage: `src/index.ts:96`, `src/server/services/scraper-process.ts:10`
- Existing `import.meta.dirname` usage (also valid): `src/server/routes/api-jobs.ts` (commit 9941643)
- Scraper spawn: `src/server/services/scraper-process.ts:35-40`
- Admin seed: `src/index.ts:26-51`
- Architecture deployment notes: `_bmad-output/planning-artifacts/architecture-distillate.md#development--production-workflow`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- All 6 tasks implemented as specified in story file. No deviations.
- Task 1: `migrate.ts` now uses `join(import.meta.dir, 'migrations')` — path resolves correctly regardless of CWD, including inside Docker container.
- Task 2: `src/index.ts` hostname now conditionally `0.0.0.0` in production, `127.0.0.1` in dev — no external exposure in development.
- Task 3: `.dockerignore` created to keep build context lean and prevent `.env` secrets from entering image.
- Task 4: `Dockerfile` created with multi-stage build (builder + production); Playwright Chromium installed once via `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` shared by main app and scraper.
- Task 5: `docker-compose.yml` created with named volume `job_hunt_data` mounted at `/app/data`; port mapping uses `${PORT}` from `.env`; `ports:` section left easy to remove for Story 27.2 Nginx update.
- Task 6: `.env.example` updated — `DB_PATH` default changed to `/app/data/jobs.db` with dev path comment; `ADMIN_EMAIL`/`ADMIN_PASSWORD` appended with first-deploy-only comment.
- Test suite: 326 pass, 1 pre-existing fail (`api-cover-letter.test.ts` cover_letters.user_id NOT NULL — unrelated to this story).

### File List

- job-hunt-dashboard/src/db/migrate.ts
- job-hunt-dashboard/src/index.ts
- job-hunt-dashboard/.dockerignore
- job-hunt-dashboard/Dockerfile
- job-hunt-dashboard/docker-compose.yml
- job-hunt-dashboard/.env.example

## Change Log

- 2026-05-06: Story 27.1 implemented — Dockerfile, docker-compose.yml, .dockerignore created; migrate.ts path fixed to import.meta.dir; hostname binding made conditional on NODE_ENV; .env.example updated with ADMIN_EMAIL/ADMIN_PASSWORD and Docker DB_PATH comment.
