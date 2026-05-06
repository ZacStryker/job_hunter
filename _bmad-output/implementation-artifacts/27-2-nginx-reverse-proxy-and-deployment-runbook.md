# Story 27.2: Nginx Reverse Proxy & Deployment Runbook

Status: review

## Story

As an operator,
I want a committed Nginx configuration and deployment runbook,
so that standing up the app on a fresh Linode VPS with TLS takes under an hour.

## Acceptance Criteria

1. **Given** `nginx/nginx.conf` committed at `job-hunt-dashboard/nginx/nginx.conf`
   **When** the file is read
   **Then** it includes: an HTTP (port 80) server block that redirects all traffic to HTTPS; an HTTPS (port 443) server block that proxies to the app container on port 3000 with `proxy_set_header` for `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`

2. **Given** `job-hunt-dashboard/docker-compose.yml` updated for production (building on Story 27.1)
   **When** the file is read
   **Then** it includes an `nginx` service that mounts `./nginx/nginx.conf` and the Let's Encrypt certificate directory (`/etc/letsencrypt`); the `app` container has NO `ports:` mapping — only Nginx exposes ports 80 and 443 to the host

3. **Given** `job-hunt-dashboard/DEPLOYMENT.md` committed to the repo
   **When** it is read
   **Then** it covers these steps in order:
   1. Provision Linode VPS (Ubuntu 24.04 LTS) and install Docker + Docker Compose
   2. Clone the repo and copy `.env.example` → `.env`; fill in all required values
   3. Generate `ENCRYPTION_KEY` with `openssl rand -hex 32`; set `APP_URL` to the real domain
   4. Obtain TLS certificate with Certbot (standalone mode) before starting Nginx
   5. Run `docker compose up -d` — migrations run automatically on first start
   6. Verify with `docker compose logs -f` and `curl -I https://yourdomain.com`
   7. Generate first invite key by logging in as admin and using the Admin UI
   **And** the runbook notes that `ADMIN_EMAIL`/`ADMIN_PASSWORD` create the seed admin on first boot only — remove or rotate after setup

## Tasks / Subtasks

### [x] 1. Create `job-hunt-dashboard/nginx/` directory and `nginx.conf` (AC: #1)

Create `job-hunt-dashboard/nginx/nginx.conf`:

```nginx
events {}

http {
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name _;

        ssl_certificate     /etc/letsencrypt/live/DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;

        location / {
            proxy_pass         http://app:3000;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
        }
    }
}
```

**Key details:**
- `server_name _` is a catch-all — works for any hostname; operator should replace `DOMAIN` with their actual domain in the cert paths
- `http://app:3000` — Docker Compose service name `app` resolves via internal Docker DNS; port 3000 matches `EXPOSE 3000` in Dockerfile and `PORT=3000` default in `.env`
- The four `proxy_set_header` directives match exactly what AC #1 requires
- `ssl_certificate` paths follow Certbot's standard output location for standalone mode

### [x] 2. Update `job-hunt-dashboard/docker-compose.yml` (AC: #2)

Remove the `ports:` block from the `app` service. Add an `nginx` service. Result:

```yaml
services:
  app:
    build: .
    env_file: .env
    volumes:
      - job_hunt_data:/app/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  job_hunt_data:
```

**Key details:**
- `app` service: drop the `ports:` block entirely — no host port exposure; Nginx is the only ingress
- `nginx` image: `nginx:alpine` (minimal, well-maintained)
- `./nginx/nginx.conf` bind-mounts the committed config file (`:ro` — read-only)
- `/etc/letsencrypt` bind-mounts the host's Let's Encrypt directory (`:ro`); Certbot writes here via standalone mode on the host before `docker compose up`
- `depends_on: app` — Nginx starts after the app container (not a readiness guarantee, just ordering)
- No explicit Docker network needed — Compose creates a default bridge network; `app` hostname resolves automatically

### [x] 3. Create `job-hunt-dashboard/DEPLOYMENT.md` (AC: #3)

Create the deployment runbook. The content must follow the exact ordered steps in AC #3. Include:

- All required env vars (from `.env.example`) and generation commands
- Certbot standalone mode instructions (stop nginx on host if running, then certbot certonly)
- The `DOMAIN` placeholder in `nginx.conf` must be replaced — call this out explicitly
- Invite key generation via Admin UI (login as admin at `https://yourdomain.com/admin` → Invite Keys tab → Generate)
- ADMIN_EMAIL / ADMIN_PASSWORD rotation reminder

## Dev Notes

### File Placement

All files are relative to `job-hunt-dashboard/` (the Docker build context):
- `job-hunt-dashboard/nginx/nginx.conf` — new directory + file
- `job-hunt-dashboard/docker-compose.yml` — existing file, update in place
- `job-hunt-dashboard/DEPLOYMENT.md` — new file

The docker-compose.yml build context is already `job-hunt-dashboard/` (the `build: .` in the `app` service means "build from current directory"). Nginx mounts `./nginx/nginx.conf` which is relative to the docker-compose.yml location — correct.

### No SESSION_SECRET Required

Story 27.1 dev notes established this: the implementation uses **opaque random session tokens in SQLite**, not signed JWTs. There is no `SESSION_SECRET` in the codebase. Do NOT add it to the runbook or generate it with `openssl rand`. The architecture distillate mentions it but that's stale — the actual `.env.example` does not include it.

### Actual Required Env Vars (from current `.env.example`)

The runbook must document these (and only these):
```
PORT=3000                          # default; keep as 3000
DB_PATH=/app/data/jobs.db          # Docker path pointing to the named volume
AUTH_DIR=                          # optional scraper auth dir
ANTHROPIC_API_KEY=                 # required for AI features
ENCRYPTION_KEY=                    # 32-byte hex: openssl rand -hex 32
APP_URL=https://yourdomain.com     # MUST be updated to real domain — used in email links
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
ADMIN_EMAIL=                       # first-deploy only
ADMIN_PASSWORD=                    # first-deploy only; rotate after setup
```

`DB_PATH` in Docker must be `/app/data/jobs.db` (pointing to the `job_hunt_data` named volume mounted at `/app/data`). The dev default (`./data/jobs.db`) breaks in Docker.

### Nginx + Certbot: Standalone Mode Flow

Certbot standalone mode briefly runs its own HTTP server on port 80 to complete the ACME challenge. This means:
1. Port 80 must be free on the host when running certbot
2. Do NOT run `docker compose up` before getting the cert — Nginx will fail to start if cert files don't exist
3. Correct order: certbot → certs at `/etc/letsencrypt/live/DOMAIN/` → update nginx.conf with real domain → `docker compose up -d`

Certbot install on Ubuntu 24.04 and run:
```bash
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com
```

### Domain Placeholder in nginx.conf

The `nginx.conf` uses `DOMAIN` as a placeholder in the cert paths:
```
ssl_certificate     /etc/letsencrypt/live/DOMAIN/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;
```

The operator must replace `DOMAIN` with their actual domain (matching what Certbot used). The runbook must call this out explicitly as a required manual step.

### App Container Internal Port

The app binds to `0.0.0.0:3000` in production (set in Story 27.1 — `hostname: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'`). Nginx proxies to `http://app:3000`. This is correct; Docker Compose networking connects them via the default bridge network.

### Invite Key Generation — Admin UI, Not curl

The admin `POST /api/admin/invite-keys` route requires:
- A valid session cookie (must be logged in as admin)
- A CSRF token header (`x-csrf-token` double-submit)

This makes curl-based generation complex. The runbook should direct operators to use the Admin UI: login at the app URL → navigate to Admin → Invite Keys tab → click Generate. This is the intended flow.

### No Google Sheets / n8n Variables

Epic 13 removed Google Sheets and n8n integrations. Do NOT include `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SPREADSHEET_ID`, `SCRAPER_URL`, `SCRAPER_TOKEN`, or `INVITE_KEY_SEED` in the runbook. These are gone or internally managed.

### No New Application Code

This story is pure infrastructure: config files + documentation. No TypeScript, no migrations, no schema changes. No tests needed.

### Dockerfile Location (Context)

The `Dockerfile` is at `job-hunt-dashboard/Dockerfile`. The `docker-compose.yml` is at `job-hunt-dashboard/docker-compose.yml` with `build: .` — both relative to `job-hunt-dashboard/`. Nginx config mounts as `./nginx/nginx.conf` from the same directory. This is consistent.

### Let's Encrypt Mount Strategy

Binding `/etc/letsencrypt` from the host (`:ro`) is the simplest approach for a single-VPS deployment. It avoids managing a certbot container and works with `certbot renew` cronjobs on the host. The alternative (certbot container in docker-compose) adds complexity not warranted for this story.

### Project Structure Notes

**New files:**
```
job-hunt-dashboard/nginx/nginx.conf
job-hunt-dashboard/DEPLOYMENT.md
```

**Modified files:**
```
job-hunt-dashboard/docker-compose.yml    ← remove ports from app, add nginx service
```

### References

- Story 27.1: `_bmad-output/implementation-artifacts/27-1-dockerfile-and-docker-compose-configuration.md`
- Hostname binding: `job-hunt-dashboard/src/index.ts` (production → `0.0.0.0`)
- Docker Compose current state: `job-hunt-dashboard/docker-compose.yml`
- `.env.example`: `job-hunt-dashboard/.env.example`
- Admin invite key route: `job-hunt-dashboard/src/server/routes/api-admin.ts:194`
- Architecture deployment notes: `_bmad-output/planning-artifacts/architecture-distillate.md#development--production-workflow`
- Epic 27 spec: `_bmad-output/planning-artifacts/epics/epic-27-production-deployment.md#story-272`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `nginx/nginx.conf` with HTTP→HTTPS redirect and HTTPS proxy block including all four required `proxy_set_header` directives; uses `DOMAIN` placeholder in cert paths per story spec.
- Updated `docker-compose.yml`: removed `ports:` from `app` service; added `nginx:alpine` service exposing 80/443, mounting `./nginx/nginx.conf:ro` and `/etc/letsencrypt:ro`.
- Created `DEPLOYMENT.md` with all seven ordered steps per AC #3: VPS provisioning, env config with all required vars (and only those vars), certbot standalone mode flow including `DOMAIN` replacement call-out, `docker compose up -d`, verification, and Admin UI invite key generation. Includes ADMIN_EMAIL/ADMIN_PASSWORD rotation reminder.
- Pure infrastructure story — no application code, no tests (per Dev Notes).

### Change Log

- 2026-05-06: Created nginx/nginx.conf, updated docker-compose.yml (nginx service + removed app ports), created DEPLOYMENT.md.

### File List

- `job-hunt-dashboard/nginx/nginx.conf` (new)
- `job-hunt-dashboard/docker-compose.yml` (modified)
- `job-hunt-dashboard/DEPLOYMENT.md` (new)
