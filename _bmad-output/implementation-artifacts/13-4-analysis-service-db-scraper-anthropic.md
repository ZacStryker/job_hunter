# Story 13.4: Analysis Service — DB + Scraper + Anthropic to DB

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-4-analysis-service-db-scraper-anthropic  
**Status:** backlog  
**Depends on:** 13-3

---

## User Story

As a job seeker, I want the Analysis button to score unanalyzed jobs using AI and write results directly to the database, so that fit scores and recommendations appear in my pipeline without needing n8n or Google Sheets.

---

## Acceptance Criteria

### AC1 — analysis-service.ts created
- New `src/server/services/analysis-service.ts` implements a `runAnalysis()` function
- Queries DB for jobs where `analysisStatus = 'pending'`, limited to 10 per run
- Returns `{ processed: number, failed: number }`

### AC2 — Description fetching via scraper
- For each pending job, calls `POST /scrape/job` (or `GET /scrape/job/:externalJobId`) at `SCRAPER_URL` with `Authorization: Bearer <SCRAPER_TOKEN>`, routing by `source` field
- Sets `analysisStatus = 'analyzing'` on the job row before the scraper call
- On scraper failure, sets `analysisStatus = 'failed'` and continues to next job

### AC3 — Profile fetched from DB
- Reads the profile row from the `profile` table (not via HTTP)
- If no profile exists, analysis proceeds with empty profile fields (no hard failure)

### AC4 — Anthropic call per job
- Calls `https://api.anthropic.com/v1/messages` with `ANTHROPIC_API_KEY` (header: `x-api-key`)
- Model: `claude-opus-4-6`, `max_tokens: 1024`
- System prompt: candidate background from profile
- User prompt: job details (company, title, location, description) asking for structured JSON response
- Prompt matches the structure from the n8n flow: returns `score`, `role_fit`, `red_flags`, `requirements_met`, `requirements_missed`, `salary`, `benefits`, `contact_name`, `contact_email`, `contact_phone`, `recommended_action`

### AC5 — Results written to DB
- On success, updates job row with: `fitScore ← score`, `recommendation ← recommended_action`, `roleFit`, `requirementsMet`, `requirementsMissed`, `redFlags`, `jobDescription ← description`, `salary`, `benefits`, `contactName`, `contactEmail`, `contactPhone`
- Sets `analysisStatus = 'done'`
- On Claude error or unparseable JSON, sets `analysisStatus = 'failed'`; does not overwrite any previously set fields

### AC6 — api-webhooks.ts updated
- `POST /api/webhooks/analysis` handler calls `runAnalysis()` instead of forwarding to `ANALYSIS_WEBHOOK_URL`
- Returns `{ ok: true }` with processed/failed counts on success
- `recordRun` call updated with actual item count
- `ANALYSIS_WEBHOOK_URL` env var removed from `.env.example`

### AC7 — New env var documented
- `ANTHROPIC_API_KEY` added to `.env.example` with comment
- App does not exit at startup if absent — Analysis returns 503 if key is missing at request time

### AC8 — Tests
- `analysis-service.test.ts` unit tests with mocked fetch: happy path writes correct fields; scraper failure marks job failed; Claude JSON parse failure marks job failed; missing profile does not throw
- `api-webhooks.test.ts` updated: analysis route calls service and records run
- All tests pass
