# Story 13.3: Discovery Service — Scraper to DB

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-3-discovery-service-scraper-to-db  
**Status:** backlog  
**Depends on:** 13-2

---

## User Story

As a job seeker, I want the Discovery button to find new job listings and save them directly to the local database, so that I don't need n8n or Google Sheets to populate my pipeline.

---

## Acceptance Criteria

### AC1 — discovery-service.ts created
- New `src/server/services/discovery-service.ts` implements a `runDiscovery()` function
- Fires 6 parallel `POST /scrape/search` requests to `SCRAPER_URL` with `Authorization: Bearer <SCRAPER_TOKEN>` header:
  - LinkedIn: query `"genai ml"`, location `"The Randstad, Netherlands"`
  - Indeed: query `"genai ml python"`, location `"remote"`
  - Indeed NL: query `"genai ml python"`, location `"Randstad"`
  - LinkedIn: query `"Full stack developer"`, location `"Remote"`
  - Indeed: query `"full stack developer"`, location `"remote"`
  - Indeed NL: query `"full stack developer"`, location `"Randstad"`
- Collects `results[]` from each response (shape: `{ id, title, company, location, url }`)

### AC2 — Deduplication against DB
- Before inserting, queries existing `externalJobId` values from the DB
- Deduplicates within the current batch and against existing rows by `externalJobId`
- Only new jobs (not already in DB) are inserted

### AC3 — New jobs written to DB
- Each new job inserted with: `company`, `jobTitle`, `location`, `sourceUrl` (url), `source`, `externalJobId` (id), `dateScraped` (today ISO date), `analysisStatus = 'pending'`
- Insert uses a transaction for the batch

### AC4 — api-webhooks.ts updated
- `POST /api/webhooks/discovery` handler calls `runDiscovery()` instead of forwarding to `DISCOVERY_WEBHOOK_URL`
- Returns `{ ok: true }` with count on success; `{ error: string }` + 502 on failure
- `recordRun` call updated with actual item count
- `DISCOVERY_WEBHOOK_URL` env var is removed from `.env.example`

### AC5 — New env vars documented
- `SCRAPER_URL` and `SCRAPER_TOKEN` added to `.env.example` with comments
- Both are optional at startup (Discovery is gracefully disabled if absent, returning 503)

### AC6 — Tests
- `discovery-service.test.ts` unit tests with mocked `fetch`: happy path inserts correct rows; deduplication skips existing externalJobIds; scraper error results in failed run
- `api-webhooks.test.ts` updated: discovery route calls service and records run correctly
- All tests pass
