# Deployment Runbook

Deploy the job-hunt-dashboard on a fresh Linode VPS with TLS in under an hour.

---

## Prerequisites

- A domain name with DNS A record pointing to your VPS IP
- A Linode (or any Ubuntu 24.04 LTS) VPS with a public IP

---

## Step 1 — Provision VPS and Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to the docker group (re-login after this)
sudo usermod -aG docker $USER
```

---

## Step 2 — Clone Repo and Configure Environment

```bash
git clone <your-repo-url>
cd job-hunt-dashboard
cp .env.example .env
```

Open `.env` and fill in all required values (see Step 3 below).

---

## Step 3 — Configure Environment Variables

Edit `.env` with your values:

```env
PORT=3000
DB_PATH=/app/data/jobs.db          # Docker path — do NOT use the ./data/jobs.db dev default

AUTH_DIR=                          # Optional: path to scraper auth dir

ANTHROPIC_API_KEY=                 # Required for AI analysis, cover letter, and resume features

ENCRYPTION_KEY=                    # Generate with: openssl rand -hex 32
APP_URL=https://yourdomain.com     # MUST be your real domain — used in activation and password-reset email links

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=                         # e.g., "Job Hunt <noreply@yourdomain.com>"

ADMIN_EMAIL=                       # First-deploy only — creates the seed admin account
ADMIN_PASSWORD=                    # First-deploy only — rotate or remove after setup
```

Generate `ENCRYPTION_KEY`:

```bash
openssl rand -hex 32
```

> **Important:** `DB_PATH` must be `/app/data/jobs.db` in production. The dev default (`./data/jobs.db`) is a relative path that breaks inside Docker. The `job_hunt_data` named volume is mounted at `/app/data`.

> **Security reminder:** `ADMIN_EMAIL` and `ADMIN_PASSWORD` create the seed admin account on first boot only. Remove or rotate these values after initial setup.

---

## Step 4 — Obtain TLS Certificate with Certbot

Certbot standalone mode runs its own HTTP server on port 80 to complete the ACME challenge. Port 80 must be free — do **not** start `docker compose` yet.

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d yourdomain.com
```

Certbot writes certificates to `/etc/letsencrypt/live/yourdomain.com/`.

### Update nginx.conf with your real domain

Open `nginx/nginx.conf` and replace the `DOMAIN` placeholder in both certificate paths with your actual domain:

```nginx
ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
```

> **Required step:** The `nginx.conf` ships with `DOMAIN` as a placeholder. Nginx will fail to start if the cert paths don't match the actual Certbot output directory.

---

## Step 5 — Start the Application

```bash
docker compose up -d
```

Database migrations run automatically on first start — no manual migration step needed.

---

## Step 6 — Verify the Deployment

```bash
# Watch logs
docker compose logs -f

# Check HTTPS response
curl -I https://yourdomain.com
```

Expected: HTTP 200 from `curl`, application loads in browser at `https://yourdomain.com`.

---

## Step 7 — Generate First Invite Key

1. Open `https://yourdomain.com` in a browser
2. Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in `.env`
3. Navigate to **Admin** in the sidebar
4. Open the **Invite Keys** tab
5. Click **Generate** to create an invite key for new users

> **Note:** Invite keys are required for user registration. Share the generated key with users who need access.

---

## Certificate Renewal

Certbot on the host can auto-renew certificates. Add a cron job or use the systemd timer installed by certbot:

```bash
# Test renewal (dry run)
sudo certbot renew --dry-run
```

After renewal, reload Nginx to pick up new certificates:

```bash
docker compose exec nginx nginx -s reload
```

---

## Troubleshooting

| Issue | Resolution |
|-------|-----------|
| Nginx fails to start | Verify cert paths in `nginx/nginx.conf` match your domain; ensure certs exist at `/etc/letsencrypt/live/yourdomain.com/` |
| App not reachable | Check `docker compose logs app`; confirm `DB_PATH=/app/data/jobs.db` in `.env` |
| Port 80/443 in use | Stop any host-level nginx/apache before running certbot or docker compose |
| Email links broken | Confirm `APP_URL=https://yourdomain.com` (no trailing slash) |
