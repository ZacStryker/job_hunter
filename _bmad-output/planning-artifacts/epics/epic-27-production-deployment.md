# Epic 27: Production Deployment

The app runs on Linode behind Nginx with TLS, reachable from the internet; Docker Compose manages lifecycle; SQLite is volume-mounted; first-deploy bootstrap creates the admin account automatically.

**FRs covered:** (operational — no new user-facing FRs)
**NFRs addressed:** NFR-A4 (HTTPS), NFR-A6 (10 concurrent users)
**Architecture:** Dockerfile, docker-compose.yml, Nginx config, .env.example update, import.meta.dirname path fix, first-deploy bootstrap script

## Story 27.1: Dockerfile & Docker Compose Configuration

As an operator,
I want the app fully containerized with Docker Compose — correct path handling, environment configuration, and a volume-mounted SQLite database —
So that deployment to Linode is a `docker compose up` away.

**Acceptance Criteria:**

**Given** a `Dockerfile` at the repo root
**When** `docker build` runs
**Then** the image builds successfully using a multi-stage Bun build: first stage installs all deps and runs `bun run build`; second stage copies `dist/`, `src/`, migration SQL files, and production `node_modules` only

**Given** any server code that references file paths (migrations, static assets)
**When** those paths are resolved at runtime inside the container
**Then** they use `import.meta.dirname` — not `process.cwd()` — so paths resolve correctly regardless of working directory

**Given** `docker-compose.yml` at the repo root and a `.env` file present on the host
**When** `docker compose up -d` runs
**Then** the app container starts, runs boot migrations, and serves on the configured `PORT`
**And** a named volume mounts the `data/` directory — SQLite data survives container rebuilds and restarts

**Given** `NODE_ENV=production` in the container environment
**When** Hono initializes its server
**Then** it binds to `0.0.0.0` (required for Docker container networking); in development (`NODE_ENV` not set or `development`) it binds to `127.0.0.1`

**Given** the container starts on first deploy with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set
**When** the bootstrap migration runs
**Then** an admin user is created with those credentials if no users exist; subsequent restarts skip creation — idempotent

**Given** `.env.example` in the repo
**When** it is read
**Then** it documents ALL required env vars including: existing (`PORT`, `DB_PATH`, `SCRAPER_URL`, `SCRAPER_TOKEN`) and all new (`SESSION_SECRET`, `ENCRYPTION_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL`, `INVITE_KEY_SEED`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`)
**And** all values are placeholder strings — no real credentials committed

## Story 27.2: Nginx Reverse Proxy & Deployment Runbook

As an operator,
I want a committed Nginx configuration and deployment runbook,
So that standing up the app on a fresh Linode VPS with TLS takes under an hour.

**Acceptance Criteria:**

**Given** `nginx/nginx.conf` committed to the repo
**When** the file is read
**Then** it includes: an HTTP (port 80) server block that redirects all traffic to HTTPS; an HTTPS (port 443) server block that proxies to the app container with `proxy_set_header` for Host, X-Real-IP, X-Forwarded-For, and X-Forwarded-Proto

**Given** `docker-compose.yml` updated for production (building on Story 27.1)
**When** the file is read
**Then** it includes an Nginx service that mounts `nginx/nginx.conf` and the Let's Encrypt certificate volume; the app container is NOT directly exposed on any host port — only Nginx is on ports 80 and 443

**Given** `DEPLOYMENT.md` committed to the repo
**When** it is read
**Then** it covers these steps in order:
1. Provision Linode VPS (Ubuntu 24.04 LTS) and install Docker + Docker Compose
2. Clone the repo and copy `.env.example` → `.env`; fill in all required values
3. Generate `ENCRYPTION_KEY` and `SESSION_SECRET` with `openssl rand -hex 32`
4. Obtain TLS certificate with Certbot before starting Nginx
5. Run `docker compose up -d` — migrations run automatically on first start
6. Verify with `docker compose logs -f` and `curl -I https://yourdomain.com`
7. Generate first invite key via a documented admin CLI command or API call
**And** the runbook notes that `ADMIN_EMAIL`/`ADMIN_PASSWORD` create the seed admin on first boot only — remove or rotate after setup

---
