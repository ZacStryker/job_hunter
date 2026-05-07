# Epic 28: HITLOBSTER Rebrand

Every surface where the app was called "Job Hunt Dashboard" — the UI, browser tab, package metadata, localStorage, and production infrastructure — now reads "HITLOBSTER."

**FRs covered:** FR1, FR2, FR3, FR4, FR5 (rebrand-specific)
**NFRs addressed:** NFR1 (non-destructive volume migration), NFR2 (operator migration checklist)

## Story 28.1: Update Display Name in UI

As a user,
I want to see "HITLOBSTER" in the navbar and browser tab,
So that the app identity is consistent with the new brand everywhere I look.

**Acceptance Criteria:**

**Given** the app is loaded in a browser
**When** any page is viewed
**Then** the browser tab title reads "HITLOBSTER" — not "Job Hunt Dashboard"

**Given** the navbar brand label in `Layout.tsx`
**When** the component renders
**Then** it displays "HITLOBSTER" — not "Job Hunt"

**Given** no other user-visible strings reference "Job Hunt" or "job-hunt-dashboard"
**When** the changes are deployed
**Then** the full user-visible interface is consistently branded HITLOBSTER

## Story 28.2: Rename Internal Package and localStorage Key

As a developer,
I want the npm package name and localStorage key to reflect HITLOBSTER,
So that the internal codebase is consistent with the new brand.

**Acceptance Criteria:**

**Given** `package.json`
**When** the file is read
**Then** the `name` field is `"hitlobster"` — not `"job-hunt-dashboard"`

**Given** `PipelineTable.tsx`
**When** the `VISIBILITY_KEY` constant is read
**Then** its value is `'hitlobster-column-visibility'` — not `'job-hunt-column-visibility'`

**Given** a user who had column visibility preferences stored under the old key `'job-hunt-column-visibility'`
**When** the updated app is first loaded
**Then** the old localStorage entry is ignored and column visibility resets to defaults — this one-time preference loss is accepted and no migration of the old key is required

## Story 28.3: Migrate Docker Volume to New Name

As an operator,
I want the Docker Compose configuration to use a `hitlobster_data` named volume with a documented migration checklist,
So that production data is preserved and the infrastructure matches the new brand.

**Acceptance Criteria:**

**Given** `docker-compose.yml`
**When** the file is read
**Then** all references to `job_hunt_data` are replaced with `hitlobster_data` — both the volume mount under the app service and the top-level `volumes:` declaration

**Given** the migration runbook (appended to `DEPLOYMENT.md` or as a new `VOLUME-MIGRATION.md`)
**When** it is read
**Then** it contains these steps in order:
1. Stop all running containers: `docker compose down`
2. Create the new volume: `docker volume create hitlobster_data`
3. Copy data from old volume to new: `docker run --rm -v job_hunt_data:/from -v hitlobster_data:/to alpine sh -c "cp -av /from/. /to/"`
4. Verify the copy: `docker run --rm -v hitlobster_data:/data alpine ls -la /data`
5. Update `docker-compose.yml` to reference `hitlobster_data`
6. Start containers: `docker compose up -d`
7. Confirm the app is healthy
8. Remove the old volume only after confirming health: `docker volume rm job_hunt_data`

**Given** an operator follows the migration checklist exactly
**When** the migration completes
**Then** no SQLite data is lost and the app runs identically under the new volume name

---
