# Story 28.3: Migrate Docker Volume to New Name

**Epic:** 28 — HITLOBSTER Rebrand  
**Story ID:** 28-3-migrate-docker-volume-to-new-name  
**Status:** review  
**Date:** 2026-05-07

---

## Story

As an operator,
I want the Docker Compose configuration to use a `hitlobster_data` named volume with a documented migration checklist,
so that production data is preserved and the infrastructure matches the new brand.

---

## Acceptance Criteria

### AC1 — docker-compose.yml volume references updated

- `job-hunt-dashboard/docker-compose.yml` line 6: `- job_hunt_data:/app/data` → `- hitlobster_data:/app/data`
- `job-hunt-dashboard/docker-compose.yml` line 29: `job_hunt_data:` → `hitlobster_data:`
- After changes, zero references to `job_hunt_data` remain in `docker-compose.yml`

### AC2 — Migration checklist documented

The migration runbook is appended to `job-hunt-dashboard/DEPLOYMENT.md` as a new section and contains exactly these steps in order:

1. Stop all running containers: `docker compose down`
2. Create the new volume: `docker volume create hitlobster_data`
3. Copy data from old volume to new: `docker run --rm -v job_hunt_data:/from -v hitlobster_data:/to alpine sh -c "cp -av /from/. /to/"`
4. Verify the copy: `docker run --rm -v hitlobster_data:/data alpine ls -la /data`
5. Update `docker-compose.yml` to reference `hitlobster_data` (this code change ships this step)
6. Start containers: `docker compose up -d`
7. Confirm the app is healthy
8. Remove the old volume only after confirming health: `docker volume rm job_hunt_data`

### AC3 — Stale volume reference in DEPLOYMENT.md prose updated

- `DEPLOYMENT.md` line 87 contains: `"The job_hunt_data named volume is mounted at /app/data."` → update to `hitlobster_data`

### AC4 — Data preservation guaranteed

- An operator who follows the migration checklist exactly loses no SQLite data; the app runs identically under the new volume name.

---

## Tasks / Subtasks

- [x] T1: Update `docker-compose.yml` volume references (AC: 1)
  - [x] T1.1: In `job-hunt-dashboard/docker-compose.yml` line 6, change `- job_hunt_data:/app/data` to `- hitlobster_data:/app/data`
  - [x] T1.2: In `job-hunt-dashboard/docker-compose.yml` line 29, change `job_hunt_data:` to `hitlobster_data:`
  - [x] T1.3: Run `grep "job_hunt_data" job-hunt-dashboard/docker-compose.yml` — confirm zero results

- [x] T2: Update stale prose reference in DEPLOYMENT.md (AC: 3)
  - [x] T2.1: In `job-hunt-dashboard/DEPLOYMENT.md` line 87, change `job_hunt_data` → `hitlobster_data` in the sentence: *"The `job_hunt_data` named volume is mounted at `/app/data`."*

- [x] T3: Append volume migration section to DEPLOYMENT.md (AC: 2, 4)
  - [x] T3.1: Append a new `## Volume Migration — job_hunt_data → hitlobster_data` section to `DEPLOYMENT.md` containing the 8-step checklist (exact commands in Dev Notes below)
  - [x] T3.2: Include a callout noting this is a **one-time migration** for operators with existing `job_hunt_data` volumes; fresh deploys using the updated `docker-compose.yml` do not need this step

- [x] T4: Verify completeness (AC: 1, 3)
  - [x] T4.1: Run `grep -rn "job_hunt_data" job-hunt-dashboard/` — confirm zero results after all changes (remaining references are intentional migration guide commands only; zero unintentional references remain)

### Review Findings

- [x] [Review][Decision] hitlobster_data may already exist with stale or partial data — resolved: warn and continue (docker volume inspect pre-check prints warning if volume exists, then proceeds) [DEPLOYMENT.md:step 3]
- [x] [Review][Patch] Copy safety: cp -av has no `|| exit 1` so a partial-copy failure is silent; no pre-flight assertion that job_hunt_data exists before migration starts [DEPLOYMENT.md:step 3]
- [x] [Review][Patch] git pull is buried inside a step 5 comment instead of being step 0 — operator who hasn't pulled runs `docker compose down` against the old config and the whole sequence is unsafe [DEPLOYMENT.md:step 5]
- [x] [Review][Patch] curl -I is an insufficient health check — nginx reverse proxy returns 200 even when the Bun app has crashed; use `docker compose ps` to assert the `app` container is in the `healthy` state [DEPLOYMENT.md:step 7]
- [x] [Review][Patch] No rollback procedure despite calling old volume the "rollback path" — the guide must document the recovery sequence (revert docker-compose.yml, restart against job_hunt_data) [DEPLOYMENT.md:migration section]
- [x] [Review][Patch] docker compose down lacks explicit warning against `--volumes` flag — an operator with that flag in muscle memory destroys job_hunt_data before migration begins [DEPLOYMENT.md:step 1]
- [x] [Review][Defer] Step 4 verify uses only `ls -la`, no checksum to confirm data integrity [DEPLOYMENT.md:step 4] — deferred, pre-existing
- [x] [Review][Defer] No minimum Docker/Compose version stated in runbook [DEPLOYMENT.md:prerequisites] — deferred, pre-existing
- [x] [Review][Defer] hitlobster_data pre-existing with wrong permissions could block app writes [docker-compose.yml:6] — deferred, pre-existing
- [x] [Review][Defer] docker-compose.yml healthcheck hits root `/` not a dedicated `/health` endpoint [docker-compose.yml:healthcheck] — deferred, pre-existing

---

## Dev Notes

### Exact File Locations and Changes

| File | Path | Change |
|------|------|--------|
| `docker-compose.yml` | `job-hunt-dashboard/docker-compose.yml` | Two string replacements (lines 6 and 29) |
| `DEPLOYMENT.md` | `job-hunt-dashboard/DEPLOYMENT.md` | Update line 87 + append new migration section |

### Current docker-compose.yml State (for reference)

```yaml
services:
  app:
    build: .
    env_file: .env
    volumes:
      - job_hunt_data:/app/data   # LINE 6 — change to hitlobster_data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:3000/ || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      app:
        condition: service_healthy
    restart: unless-stopped

volumes:
  job_hunt_data:   # LINE 29 — change to hitlobster_data
```

### Target docker-compose.yml State

Only two lines change — the rest stays identical:

```yaml
    volumes:
      - hitlobster_data:/app/data   # line 6
...
volumes:
  hitlobster_data:   # line 29
```

### Migration Section to Append to DEPLOYMENT.md

Append verbatim at the end of `DEPLOYMENT.md`:

```markdown
---

## Volume Migration — `job_hunt_data` → `hitlobster_data`

**One-time migration for existing deployments.** Fresh deploys using the updated `docker-compose.yml` already reference `hitlobster_data` — skip this section if standing up a new instance.

If you have an existing production container with data stored in the `job_hunt_data` volume, follow these steps in order before restarting with the new `docker-compose.yml`:

```bash
# 1. Stop all running containers
docker compose down

# 2. Create the new volume
docker volume create hitlobster_data

# 3. Copy all data from old volume to new (alpine is tiny, already cached on most hosts)
docker run --rm -v job_hunt_data:/from -v hitlobster_data:/to alpine sh -c "cp -av /from/. /to/"

# 4. Verify the copy — you should see jobs.db and any other data files
docker run --rm -v hitlobster_data:/data alpine ls -la /data

# 5. The updated docker-compose.yml already references hitlobster_data (this story ships that change)
#    If you haven't pulled the latest code yet, do so now: git pull

# 6. Start containers with the new config
docker compose up -d

# 7. Confirm the app is healthy
docker compose logs app --tail=30
curl -I https://yourdomain.com

# 8. Remove the old volume ONLY after confirming the app is healthy and data is correct
docker volume rm job_hunt_data
```

> **Critical:** Do NOT remove `job_hunt_data` until step 7 confirms health. The old volume is your rollback path.
```

### DEPLOYMENT.md Line 87 — Stale Reference

Current text (line 87):
> The `job_hunt_data` named volume is mounted at `/app/data`.

Change to:
> The `hitlobster_data` named volume is mounted at `/app/data`.

### No Regression Risk

- `docker-compose.yml` is a deployment config file; renaming the volume does not affect the running app binary, code, or DB schema.
- The DB path inside the container (`/app/data/jobs.db`) is unchanged — only the Docker-side volume name changes.
- No Bun/TypeScript/React code is touched in this story.
- `bun run dev` is unaffected — local dev uses a bind-mounted `./data/` directory, not a named Docker volume.

### Context from Prior Stories

- **28.1 (review):** Changed UI display strings — `index.html` title and `Layout.tsx` brand span. Not touched here.
- **28.2 (review):** Changed `package.json` name and `PipelineTable.tsx` `VISIBILITY_KEY`. Not touched here.
- **27.2 (done):** Created `DEPLOYMENT.md` and `nginx/nginx.conf`. `DEPLOYMENT.md` is the canonical ops runbook — that's why the migration section belongs there.
- Epic 28 scope boundary: do NOT rename the working directory `job-hunt-dashboard/`, `Dockerfile` image name, nginx config, or any other `job-hunt` strings outside the specific AC targets.

### Scope Boundaries — Do NOT touch in this story

- `Dockerfile` — not in scope
- `nginx/nginx.conf` — not in scope  
- Working directory name `job-hunt-dashboard/` — not in scope
- Any source code files (`.ts`, `.tsx`) — not in scope
- Do not create a separate `VOLUME-MIGRATION.md` — append to `DEPLOYMENT.md` per AC2 preferred option

### No Tests Required

This story touches only infrastructure config (`.yml`) and documentation (`.md`). No TypeScript/Bun code changes; no test files needed.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- T1: Replaced both `job_hunt_data` references in `docker-compose.yml` — volume mount (line 6) and named volume declaration (line 29). Zero remaining references confirmed.
- T2: Updated stale prose in DEPLOYMENT.md line 87 — `job_hunt_data` → `hitlobster_data` in the DB_PATH note.
- T3: Appended full 8-step migration checklist as `## Volume Migration — \`job_hunt_data\` → \`hitlobster_data\`` section at end of DEPLOYMENT.md, including one-time migration callout and critical rollback warning.
- T4: Verified with grep — remaining `job_hunt_data` occurrences are exclusively within the migration guide's bash commands (intentional; they instruct operators to copy from and remove the old volume).

### File List

- `job-hunt-dashboard/docker-compose.yml`
- `job-hunt-dashboard/DEPLOYMENT.md`

---

## Change Log

- 2026-05-07: Renamed Docker volume from `job_hunt_data` to `hitlobster_data` in `docker-compose.yml`; updated stale prose reference in `DEPLOYMENT.md`; appended 8-step volume migration runbook section to `DEPLOYMENT.md`.

---

## Story Completion Status

- Story: done
- Notes: Infrastructure config rename (docker-compose.yml) + ops migration runbook appended to DEPLOYMENT.md. Zero functional risk. No tests required. Code review applied 5 patches (copy safety, git pull ordering, health check, rollback procedure, --volumes warning) + 1 decision resolved (warn-and-continue for pre-existing hitlobster_data volume).
