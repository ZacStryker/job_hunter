# Story 13.2: Schema — Analysis Status & External Job ID

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-2-schema-analysis-status-and-external-job-id  
**Status:** backlog  
**Depends on:** 13-1

---

## User Story

As a developer, I want the jobs table to track analysis pipeline state and store the scraper's job ID, so that Discovery can mark jobs for analysis and Analysis can fetch their full descriptions.

---

## Acceptance Criteria

### AC1 — analysisStatus column added
- `jobs` table gains a nullable `analysis_status` text column
- Valid values: `'pending' | 'analyzing' | 'done' | 'failed'`; `null` means pre-pipeline or manually ingested
- Drizzle schema in `src/db/schema.ts` reflects the new column with camelCase mapping (`analysisStatus`)

### AC2 — externalJobId column added
- `jobs` table gains a nullable `external_job_id` text column
- Stores the scraper service's `job_id` for use by Analysis when fetching descriptions
- Drizzle schema reflects the new column (`externalJobId`)

### AC3 — Migration generated and committed
- `bun run db:generate` produces a new SQL migration file
- Migration file is committed to the repo
- Migration is idempotent (safe to re-run)

### AC4 — shared/schemas.ts updated
- `jobSchema` and any related Zod types in `src/shared/schemas.ts` include `analysisStatus` and `externalJobId`
- Both fields are optional/nullable in the schema

### AC5 — Ingest upsert simplified
- `src/server/services/ingest-service.ts` ON CONFLICT clause is updated: analysis fields (`fitScore`, `recommendation`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription`, `salary`, `benefits`, `contactName`, `contactEmail`, `contactPhone`) are no longer set by ingest — they are owned by Analysis
- User-owned fields (`applied`, `status`, `statusOverride`, `coverLetterSentAt`, `dateApplied`, `archived`) remain protected in the ON CONFLICT clause
- `analysisStatus` and `externalJobId` are set on insert but protected (not overwritten) on conflict

### AC6 — Tests updated
- `api-ingest.test.ts` updated to reflect the simplified upsert behavior
- All tests pass
