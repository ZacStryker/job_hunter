# Story 37.1: Split Deps into Base Image for Fast App Builds

Status: review

## Story

As an operator deploying HITLOBSTER,
I want a pre-built local base image that contains all 3rd-party dependencies,
so that building the app image only compiles and copies code — completing in seconds.

## Acceptance Criteria

1. **Given** the `hitlobster-deps:latest` base image exists on the Linode server, **When** the operator runs `docker compose build`, **Then** the build completes in under 2 minutes (excluding the initial deps image build).

2. **Given** `Dockerfile.deps` exists in the repo root (`job-hunt-dashboard/`), **When** the operator runs `scripts/build-deps.sh` on the Linode server, **Then** the script builds and tags `hitlobster-deps:latest` locally with all system packages, bun production node_modules, and Playwright browsers pre-installed.

3. **Given** the updated `Dockerfile` production stage derives `FROM hitlobster-deps:latest`, **When** `docker compose build` runs after a code-only change, **Then** no apt-get, bun install, or playwright install steps execute — the build consists only of copying compiled artifacts.

4. **Given** `docker-compose.yml` previously mounted a `playwright_browsers` named volume at `/ms-playwright`, **When** the updated compose file is applied, **Then** that volume mount and volume definition are absent — Playwright browsers are served from the image layer instead.

5. **Given** the deps image was built with a specific `package.json` + `bun.lock`, **When** the operator changes `package.json`, `bun.lock`, `scraper/package.json`, or `scraper/package-lock.json` (or upgrades Playwright), **Then** the operator rebuilds the deps image via `scripts/build-deps.sh` before the next `docker compose build`.

## Tasks / Subtasks

- [x] Task 1 — Create `Dockerfile.deps` (AC: 2, 3)
  - [x] Start `FROM oven/bun:1.3`
  - [x] `RUN apt-get update && apt-get install -y curl xvfb && rm -rf /var/lib/apt/lists/*`
  - [x] `COPY package.json bun.lock ./` then `RUN bun install --production --frozen-lockfile`
  - [x] `COPY scraper/package.json scraper/package-lock.json ./scraper/` then `RUN cd scraper && bun install --production`
  - [x] `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`
  - [x] `RUN bunx playwright install --with-deps chromium firefox`
  - [x] `RUN cd scraper && bunx playwright install --with-deps firefox`
  - [x] `RUN bunx patchright install chromium`
  - [x] `ENV NODE_ENV=production`

- [x] Task 2 — Create `scripts/build-deps.sh` (AC: 2, 5)
  - [x] Create `scripts/` directory (does not exist yet)
  - [x] Write script with `#!/usr/bin/env bash` + `set -e`; `cd "$(dirname "$0")/.."` to ensure correct working directory
  - [x] Run `docker build -f Dockerfile.deps -t hitlobster-deps:latest .`
  - [x] Print rebuild reminder: "Rebuild when package.json, bun.lock, scraper/package.json, scraper/package-lock.json, or Playwright version changes"
  - [x] Make executable: `chmod +x scripts/build-deps.sh`

- [x] Task 3 — Update `Dockerfile` production stage (AC: 1, 3)
  - [x] Change `FROM oven/bun:1.3` → `FROM hitlobster-deps:latest` in Stage 2
  - [x] Remove: `RUN apt-get update && apt-get install -y curl xvfb ...`
  - [x] Remove: `RUN bun install --production --frozen-lockfile`
  - [x] Remove: `RUN bunx playwright install --with-deps chromium firefox`
  - [x] Remove: `RUN cd scraper && bunx playwright install --with-deps firefox`
  - [x] Remove: `RUN bunx patchright install chromium`
  - [x] Change `COPY --from=builder /app/scraper ./scraper` to selective copies (see Dev Notes — this is critical)
  - [x] Keep `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` and `ENV NODE_ENV=production`
  - [x] Keep all other COPY lines unchanged (`dist`, `src`, `package.json`, `bun.lock`)
  - [x] Keep `entrypoint.sh` COPY and `chmod` lines unchanged
  - [x] Builder stage (Stage 1) is UNCHANGED — do not modify it

- [x] Task 4 — Update `docker-compose.yml` (AC: 4)
  - [x] Remove `playwright_browsers:/ms-playwright` from `app.volumes` list
  - [x] Remove `playwright_browsers:` entry from top-level `volumes:` block
  - [x] No other compose changes

- [x] Task 5 — Update `DEPLOYMENT.md` (AC: 2, 5)
  - [x] Add "One-time setup: build the deps image" section immediately before the `docker compose build` step (currently Step 5)
  - [x] Include: `cd /path/to/repo/job-hunt-dashboard && bash scripts/build-deps.sh`
  - [x] Update deploy workflow to clarify: **Code-only deploy** = `git pull && docker compose build && docker compose up -d`; **Deps changed** = `bash scripts/build-deps.sh` first, then code-only deploy
  - [x] Note that `playwright_browsers` Docker volume is no longer used and can be pruned: `docker volume rm hitlobster_playwright_browsers`

- [ ] Task 6 — Build and verify on Linode (AC: 1, 3) ⚠️ OPERATOR MANUAL TASK
  - [ ] SSH to Linode server and run `bash scripts/build-deps.sh` (~10 min first time)
  - [ ] Run `docker compose build` and confirm it completes in under 2 minutes
  - [ ] Run `docker compose up -d` and confirm app starts and passes healthcheck
  - [ ] Verify Playwright-dependent features work (cover letter generation, scraper)

## Dev Notes

### This story is pure Docker/infrastructure — no TypeScript or application code changes

All changes are to: `Dockerfile`, `Dockerfile.deps` (new), `scripts/build-deps.sh` (new), `docker-compose.yml`, `DEPLOYMENT.md`. The `job-hunt-dashboard/scripts/` directory does not exist and must be created as part of Task 2.

### Current state of files being modified

**Current `Dockerfile` production stage (Stage 2):**
```dockerfile
FROM oven/bun:1.3
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/scraper ./scraper          # ← must be changed to selective copies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
RUN apt-get update && apt-get install -y curl xvfb && rm -rf /var/lib/apt/lists/*
RUN bun install --production --frozen-lockfile
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN bunx playwright install --with-deps chromium firefox
RUN cd scraper && bunx playwright install --with-deps firefox
RUN bunx patchright install chromium
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 3000
CMD ["/app/entrypoint.sh"]
```

**Current `docker-compose.yml` volumes section (app service):**
```yaml
volumes:
  - hitlobster_data:/app/data
  - playwright_browsers:/ms-playwright   # ← remove this line
```
**Top-level volumes block:**
```yaml
volumes:
  hitlobster_data:
  playwright_browsers:    # ← remove this line
```

### Critical: Why selective COPY for scraper

`hitlobster-deps:latest` has `/app/scraper/node_modules` already installed. Using `COPY --from=builder /app/scraper ./scraper` (whole directory) would overwrite the entire `./scraper/` destination — including `node_modules` — with whatever the builder produced. Since the builder stage no longer installs scraper production deps (they come from the base image), this would **DELETE** the scraper's `node_modules`.

The fix is surgical — copy only the source files the builder produced:
```dockerfile
COPY --from=builder /app/scraper/src ./scraper/src
COPY --from=builder /app/scraper/package.json ./scraper/package.json
COPY --from=builder /app/scraper/package-lock.json ./scraper/package-lock.json
```
Docker's union filesystem leaves `scraper/node_modules` (from the base image layer) intact.

### Authoritative file contents

**`Dockerfile.deps` (complete):**
```dockerfile
FROM oven/bun:1.3
WORKDIR /app

RUN apt-get update && apt-get install -y curl xvfb && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY scraper/package.json scraper/package-lock.json ./scraper/
RUN cd scraper && bun install --production

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN bunx playwright install --with-deps chromium firefox
RUN cd scraper && bunx playwright install --with-deps firefox
RUN bunx patchright install chromium

ENV NODE_ENV=production
```

**Updated `Dockerfile` production stage (complete Stage 2):**
```dockerfile
# ── Stage 2: production ─────────────────────────────────────────────
FROM hitlobster-deps:latest
WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Selective scraper copy — preserves /app/scraper/node_modules from base image
COPY --from=builder /app/scraper/src ./scraper/src
COPY --from=builder /app/scraper/package.json ./scraper/package.json
COPY --from=builder /app/scraper/package-lock.json ./scraper/package-lock.json

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000
CMD ["/app/entrypoint.sh"]
```

**`scripts/build-deps.sh` (complete):**
```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "Building hitlobster-deps:latest — this takes ~10 min on first run..."
docker build -f Dockerfile.deps -t hitlobster-deps:latest .
echo ""
echo "Done. hitlobster-deps:latest is ready."
echo ""
echo "Rebuild this image when any of these change:"
echo "  package.json, bun.lock, scraper/package.json, scraper/package-lock.json, Playwright version"
```

### Scraper uses npm, not bun (important)

The scraper directory has `package-lock.json` (npm lockfile), NOT `bun.lock`. This is why `Dockerfile.deps` uses `bun install --production` (no `--frozen-lockfile`) for the scraper — bun can install npm packages but the lockfile flag only works with bun's own lockfile format.

### Builder stage is unchanged

Stage 1 (`FROM oven/bun:1.3 AS builder`) still runs `bun install --frozen-lockfile` (all deps including devDeps for Vite build) and `bun run build`. No changes needed there.

### Task 6 requires Linode access — dev agent cannot complete it

Task 6 is an operator verification task requiring SSH access to the production Linode server. The dev agent should mark Tasks 1–5 complete and leave Task 6 with a note that it requires manual operator verification.

### Trigger checklist — when operator must rebuild deps image

- `job-hunt-dashboard/package.json` changes
- `job-hunt-dashboard/bun.lock` changes
- `job-hunt-dashboard/scraper/package.json` changes
- `job-hunt-dashboard/scraper/package-lock.json` changes
- Playwright version changes in either package.json

Code changes in `src/`, `scraper/src/`, or frontend files never require a deps rebuild.

### Project Structure Notes

- All Docker files live at `job-hunt-dashboard/` root (same level as `Dockerfile`, `docker-compose.yml`)
- New `scripts/` directory at `job-hunt-dashboard/scripts/` — create it as part of Task 2
- `DEPLOYMENT.md` is at `job-hunt-dashboard/DEPLOYMENT.md`
- No TypeScript changes → no TypeScript compiler, linting, or test suite to run

### References

- Epic source: `_bmad-output/planning-artifacts/epics/epic-37-docker-dependency-layer-separation.md`
- Current Dockerfile: `job-hunt-dashboard/Dockerfile`
- Current compose: `job-hunt-dashboard/docker-compose.yml`
- Deployment runbook: `job-hunt-dashboard/DEPLOYMENT.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No issues encountered — pure Docker/infra changes with authoritative file contents provided in Dev Notes.

### Completion Notes List

- Created `Dockerfile.deps` with system packages (curl, xvfb), bun production deps, scraper npm deps, and all Playwright browsers (chromium + firefox via playwright, firefox via scraper, chromium via patchright). Scraper uses `bun install --production` (no `--frozen-lockfile`) because its lockfile is npm format.
- Created `scripts/build-deps.sh` (executable) that builds `hitlobster-deps:latest` and prints a rebuild reminder.
- Rewrote `Dockerfile` Stage 2 to derive `FROM hitlobster-deps:latest`; removed all apt-get/bun install/playwright install steps; replaced whole-scraper COPY with surgical selective copies to preserve `scraper/node_modules` from base image layer.
- Removed `playwright_browsers` volume mount and volume definition from `docker-compose.yml`.
- Updated `DEPLOYMENT.md`: inserted Step 5 (one-time deps build), renumbered old Steps 5–7 to 6–8, added deploy workflow summary (code-only vs deps-changed), noted volume prune command.
- Task 6 is an operator manual verification task requiring Linode SSH access; left unchecked per Dev Notes guidance.

### File List

- `job-hunt-dashboard/Dockerfile.deps` — new
- `job-hunt-dashboard/scripts/build-deps.sh` — new
- `job-hunt-dashboard/Dockerfile` — production stage rewritten to derive from `hitlobster-deps:latest`
- `job-hunt-dashboard/docker-compose.yml` — `playwright_browsers` volume mount and definition removed
- `job-hunt-dashboard/DEPLOYMENT.md` — one-time deps build step added; deploy workflow updated

## Change Log

- 2026-05-19: Story created from Epic 37
- 2026-05-19: Tasks 1–5 implemented; Task 6 left for operator manual verification on Linode
