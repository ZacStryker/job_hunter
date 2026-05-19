# Epic 37: Docker Dependency Layer Separation

Operators can deploy new code in seconds rather than minutes. Playwright browsers, system packages, and node_modules are pre-installed in a local `hitlobster-deps` base image that rebuilds only when dependencies change. The main `Dockerfile` derives from that base and copies only application code — completing the production stage in under a minute.

**Source:** User request 2026-05-18
**Priority:** High — every deploy currently waits 7–10 min on Playwright downloads

---

## Story 37.1: Split Deps into Base Image for Fast App Builds

As an operator deploying HITLOBSTER,
I want a pre-built local base image that contains all 3rd-party dependencies,
So that building the app image only compiles and copies code — completing in seconds.

**Acceptance Criteria:**

**Given** the `hitlobster-deps:latest` base image exists on the Linode server,
**When** the operator runs `docker compose build`,
**Then** the build completes in under 2 minutes (excluding the initial deps image build).

**Given** `Dockerfile.deps` exists in the repo root,
**When** the operator runs `scripts/build-deps.sh` on the Linode server,
**Then** the script builds and tags `hitlobster-deps:latest` locally with all system packages, bun production node_modules, and Playwright browsers pre-installed.

**Given** the updated `Dockerfile` production stage derives `FROM hitlobster-deps:latest`,
**When** `docker compose build` runs after a code-only change,
**Then** no apt-get, bun install, or playwright install steps execute — the build consists only of copying compiled artifacts.

**Given** `docker-compose.yml` previously mounted a `playwright_browsers` named volume at `/ms-playwright`,
**When** the updated compose file is applied,
**Then** that volume mount and volume definition are absent — Playwright browsers are served from the image layer instead.

**Given** the deps image was built with a specific `package.json` + `bun.lock`,
**When** the operator changes `package.json` or `bun.lock` (or upgrades Playwright),
**Then** the operator rebuilds the deps image via `scripts/build-deps.sh` before the next `docker compose build`.

## Tasks / Subtasks

- [ ] Task 1 — Create `Dockerfile.deps`
  - [ ] Start `FROM oven/bun:1.3`
  - [ ] Install system packages: `apt-get install -y curl xvfb`
  - [ ] Copy `package.json bun.lock` and run `bun install --production --frozen-lockfile`
  - [ ] Copy `scraper/package.json scraper/package-lock.json` into `./scraper/` and run `cd scraper && bun install --production`
  - [ ] Set `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`
  - [ ] Run `bunx playwright install --with-deps chromium firefox`
  - [ ] Run `cd scraper && bunx playwright install --with-deps firefox`
  - [ ] Run `bunx patchright install chromium`
  - [ ] Set `ENV NODE_ENV=production`

- [ ] Task 2 — Create `scripts/build-deps.sh`
  - [ ] Build and tag `hitlobster-deps:latest` using `docker build -f Dockerfile.deps -t hitlobster-deps:latest .`
  - [ ] Print a reminder: "Rebuild when package.json, bun.lock, scraper/package.json, or Playwright version changes"
  - [ ] Make the script executable (`chmod +x`)

- [ ] Task 3 — Update `Dockerfile` production stage
  - [ ] Change `FROM oven/bun:1.3` → `FROM hitlobster-deps:latest`
  - [ ] Remove: `RUN apt-get update && apt-get install -y curl xvfb ...`
  - [ ] Remove: `RUN bun install --production --frozen-lockfile`
  - [ ] Remove: `RUN bunx playwright install --with-deps chromium firefox`
  - [ ] Remove: `RUN cd scraper && bunx playwright install --with-deps firefox`
  - [ ] Remove: `RUN bunx patchright install chromium`
  - [ ] Change `COPY --from=builder /app/scraper ./scraper` → selective copies that do NOT overwrite `scraper/node_modules` already present in the base image:
    ```
    COPY --from=builder /app/scraper/src ./scraper/src
    COPY --from=builder /app/scraper/package.json ./scraper/package.json
    COPY --from=builder /app/scraper/package-lock.json ./scraper/package-lock.json
    ```
  - [ ] Keep all other COPY lines unchanged (`dist`, `src`, `package.json`, `bun.lock`, `entrypoint.sh`)
  - [ ] Keep `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` (harmless to repeat; makes intent clear)
  - [ ] Builder stage (Stage 1) is unchanged — still installs all deps for the frontend build

- [ ] Task 4 — Update `docker-compose.yml`
  - [ ] Remove the `playwright_browsers:/ms-playwright` volume mount from the `app` service
  - [ ] Remove the `playwright_browsers:` entry from the top-level `volumes:` block
  - [ ] No other changes to compose

- [ ] Task 5 — Update `DEPLOYMENT.md`
  - [ ] Add a "One-time setup: build the deps image" section immediately before the `docker compose build` step:
    ```bash
    cd /path/to/repo/job-hunt-dashboard
    bash scripts/build-deps.sh
    ```
  - [ ] Update the standard deploy workflow to clarify when the deps image rebuild is needed vs. skipped:
    - **Code-only deploy:** `git pull && docker compose build && docker compose up -d`
    - **Deps changed** (package.json, bun.lock, Playwright version): `bash scripts/build-deps.sh` first, then deploy as above
  - [ ] Note that the `playwright_browsers` Docker volume is no longer used and can be pruned: `docker volume rm hitlobster_playwright_browsers`

- [ ] Task 6 — Build and verify on Linode
  - [ ] SSH to Linode server, run `bash scripts/build-deps.sh` (this will take ~10 min the first time)
  - [ ] Run `docker compose build` and confirm it completes in under 2 minutes
  - [ ] Run `docker compose up -d` and confirm the app starts and passes the healthcheck
  - [ ] Verify Playwright-dependent features work (cover letter generation, scraper)

## Dev Notes

### Why selective COPY for scraper (not `COPY --from=builder /app/scraper ./scraper`)

`hitlobster-deps:latest` has `/app/scraper/node_modules` already installed. A full directory COPY from the builder would overwrite the entire `./scraper` destination — including `node_modules` — with whatever the builder produced. Since the builder stage no longer installs scraper deps (they're in the base), this would DELETE the scraper's node_modules.

The fix is surgical: copy only the source files the builder produced (`src/`, `package.json`, `package-lock.json`). Docker's union filesystem leaves `scraper/node_modules` (from the base image layer) intact.

### Trigger checklist — when to rebuild the deps image

Rebuild `hitlobster-deps:latest` when ANY of these change:
- `job-hunt-dashboard/package.json`
- `job-hunt-dashboard/bun.lock`
- `job-hunt-dashboard/scraper/package.json`
- `job-hunt-dashboard/scraper/package-lock.json`
- Playwright version (in either package.json)

Code changes in `src/`, `scraper/src/`, or frontend files never require a deps rebuild.

### Dockerfile.deps — full content

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

### Updated Dockerfile — production stage

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

### scripts/build-deps.sh — full content

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

### No builder stage changes needed

The builder stage (`FROM oven/bun:1.3 AS builder`) is unchanged. It still runs `bun install --frozen-lockfile` (all deps, including devDeps for the Vite build) and `bun run build`. It does not need to install scraper deps because the production stage gets those from the base image.

### Existing playwright_browsers volume

On Linode, the old named volume can be cleaned up after confirming the app works:
```bash
docker volume rm hitlobster_playwright_browsers
```
It is no longer mounted and would otherwise just consume disk space.

## Dev Agent Record

### Agent Model Used
<!-- to be filled -->

### Debug Log References
<!-- to be filled -->

### Completion Notes List
<!-- to be filled -->

### File List
- `Dockerfile.deps` — new; contains all slow dependency installation
- `scripts/build-deps.sh` — new; builds and tags the deps base image
- `Dockerfile` — production stage rewritten to derive from `hitlobster-deps:latest`
- `docker-compose.yml` — `playwright_browsers` volume mount and definition removed
- `DEPLOYMENT.md` — one-time deps build step added; deploy workflow updated

### Review Findings
<!-- to be filled by code review agent -->

## Change Log
- 2026-05-18: Story created
