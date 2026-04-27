# Epic 2: Discovery & Analysis Pipeline

User can trigger Discovery to find new job listings from the scraper API and trigger Analysis to score them via Anthropic API — both phases complete with clear feedback and without touching user-owned fields.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6

---

## Story 2.1: Discovery Service (`POST /api/discover`)

As a developer,
I want a POST endpoint that queries the scraper API with 6 parallel searches and inserts new job listings with `analysisStatus = 'pending'`,
So that the Discovery phase has a reliable, atomic server-side implementation that protects user-owned fields on every run.

**Depends on:** Story 1.2 — the `jobs` table must define `external_job_id` (text, unique), `analysis_status` (text), `source`, and `location` columns with a unique index on `external_job_id`.

**Acceptance Criteria:**

**Given** a POST request to `/api/discover` with a valid authenticated session
**When** the endpoint processes the request
**Then** it fires 6 parallel HTTP requests to the scraper API using `SCRAPER_URL` as the base URL and `SCRAPER_TOKEN` as the bearer token
**And** each request targets one of the configured LinkedIn or Indeed search combinations (role + location)

**Given** the scraper API returns job listings
**When** the Discovery service processes the combined results
**Then** any listing whose `externalJobId` already exists in the `jobs` table is skipped
**And** only listings with a new `externalJobId` are inserted

**Given** new listings to insert
**When** the Discovery service writes to the database
**Then** all rows are inserted inside a single SQLite transaction — if any row fails, the entire batch rolls back and no records are written
**And** each inserted record has `analysisStatus = 'pending'`
**And** scraper-owned fields are populated from the API response: `externalJobId`, `title`, `company`, `source`, `location`, `sourceUrl`, `dateScraped`
**And** user-owned fields (`applied`, `status`, `statusOverride`, `coverLetterSentAt`) are set to their schema defaults (false / null) and are never overwritten by any future Discovery run on a conflict

**Given** a successful Discovery run
**When** the response is returned
**Then** the response body is `{ added: number }` with HTTP 200
**And** no stack traces or credential values appear in the response body

**Given** a Discovery run where every returned listing already exists in the database
**When** the endpoint processes the request
**Then** `{ added: 0 }` is returned — idempotent behavior confirmed with no side effects

**Given** the scraper API is unreachable or returns a non-2xx response
**When** `/api/discover` is called
**Then** no records are written to the database
**And** `{ error: string }` is returned with an appropriate HTTP status code describing the failure

**Given** the Discovery service implementation
**Then** all scraper API response field name mappings are contained within `server/services/discovery.ts` only
**And** no other file imports or references scraper API response field names directly

---

## Story 2.2: Discover Button UI

As a user,
I want to click a Discover button and get clear feedback on how many new jobs were found,
So that I know my pipeline has the latest listings and whether the operation succeeded or failed.

**Acceptance Criteria:**

**Given** the user is viewing the Pipeline page
**When** the page renders
**Then** a Discover button is visible in the header bar

**Given** the user clicks the Discover button
**When** the POST `/api/discover` request is in flight
**Then** the button shows a spinner and "Discovering…" label and is disabled for the duration

**Given** a successful Discovery run
**When** the operation completes
**Then** an inline Alert appears showing "X new jobs found" where X is the `added` count from the response
**And** the TanStack Query `['jobs']` cache is invalidated, triggering a re-fetch of the jobs list
**And** the Alert auto-dismisses after 4 seconds
**And** the button returns to its idle state

**Given** a Discovery run that returns `added: 0`
**When** the operation completes
**Then** the inline Alert shows "0 new jobs found" — this is a confirmation, not an error state
**And** no error styling is applied

**Given** a Discovery failure (scraper unreachable, network error, or server error)
**When** the mutation returns an error
**Then** a persistent destructive Alert appears showing "Discovery failed — [error message]. No data was modified."
**And** the Alert persists until the next Discover attempt begins
**And** the existing jobs data in the table is unchanged

---

## Story 2.3: Analysis Service (`POST /api/analyze`)

As a developer,
I want a POST endpoint that processes all pending job records — fetching full descriptions from the scraper and scoring them via the Anthropic API — with per-record error handling that never corrupts user-owned fields,
So that the Analysis phase can be triggered independently from Discovery and recovers gracefully from individual record failures.

**Acceptance Criteria:**

**Given** a POST request to `/api/analyze` with a valid authenticated session
**When** the endpoint processes the request
**Then** it selects all `jobs` records with `analysisStatus = 'pending'` scoped to the current user (via `ctx.get('userId')`)
**And** if no pending records exist, returns `{ analyzed: 0, failed: 0 }` with HTTP 200 immediately

**Given** pending records exist
**When** the Analysis service processes each record
**Then** it calls the scraper API to fetch the full job description using the record's `externalJobId`
**And** it calls the Anthropic API directly via `fetch` (no Anthropic SDK) using the user's Anthropic API key
**And** the API key is read from `user_secrets` via `decrypt()` — never from the request body, query params, or a global environment variable

**Given** a successful Anthropic API response
**When** the response is parsed
**Then** `fitScore` (number), `requirementsMet` (string array), `requirementsMissed` (string array), `recommendation` (`skip` | `investigate` | `apply`), and `explanation` (string) are extracted from the response
**And** these fields are written to the job record in the database
**And** `analysisStatus` is set to `'done'`
**And** user-owned fields (`applied`, `status`, `statusOverride`, `coverLetterSentAt`) are not read, modified, or touched in any way

**Given** a per-record failure (scraper fetch error, Anthropic API error, malformed response, or parse failure)
**When** that record's processing fails
**Then** `analysisStatus` is set to `'failed'` for that record only
**And** the error is logged server-side via `console.error`
**And** processing continues to the next pending record — a single record's failure does not abort the remaining batch

**Given** an Anthropic API rate-limit response for a record
**When** the rate-limit error is detected
**Then** `analysisStatus` is set to `'failed'` for that record with a descriptive log entry
**And** no silent corruption or partial write occurs for that record

**Given** all pending records have been processed (with any mix of successes and failures)
**When** the endpoint returns
**Then** the response body is `{ analyzed: number, failed: number }` with HTTP 200
**And** `analyzed` equals the count of records now with `analysisStatus = 'done'`
**And** `failed` equals the count of records now with `analysisStatus = 'failed'`
**And** no stack traces or credential values appear in the response body

---

## Story 2.4: Analyze Button UI

As a user,
I want to click an Analyze button and see progress feedback as jobs are scored,
So that I know the AI analysis is running, how many records are being processed, and whether any failed.

**Acceptance Criteria:**

**Given** the user is viewing the Pipeline page
**When** the page renders
**Then** an Analyze button is visible in the header bar, adjacent to the Discover button

**Given** the user clicks the Analyze button
**When** the POST `/api/analyze` request is in flight
**Then** the button shows a spinner and is disabled for the duration
**And** a label shows "Analyzing N jobs…" where N is the count of `pending` records in the current `['jobs']` cache at the moment the button was clicked

**Given** a successful Analysis run with no per-record failures
**When** the operation completes with `failed: 0`
**Then** an inline Alert shows "N jobs analyzed"
**And** the TanStack Query `['jobs']` cache is invalidated, triggering a re-fetch
**And** the Alert auto-dismisses after 4 seconds
**And** the button returns to its idle state

**Given** an Analysis run that completes with some per-record failures
**When** the response contains `failed > 0`
**Then** the completion Alert shows "X analyzed, Y failed" using the counts from the response
**And** the Alert persists and does not auto-dismiss until the next Analyze attempt begins
**And** no destructive Alert variant is used — this is informational, not a total failure

**Given** the user clicks Analyze when no pending records exist
**When** the response returns `{ analyzed: 0, failed: 0 }`
**Then** a brief Alert shows "0 jobs to analyze"
**And** no error state is triggered

**Given** a total Analysis failure (e.g., user has no Anthropic API key configured, endpoint returns HTTP 4xx/5xx)
**When** the mutation returns an error
**Then** a persistent destructive Alert appears showing the error message returned by the server
**And** the existing job data is unchanged
**And** the Alert persists until the next Analyze attempt begins
