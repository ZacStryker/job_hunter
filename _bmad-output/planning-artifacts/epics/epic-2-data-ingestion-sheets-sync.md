# Epic 2: Data Ingestion & Sheets Sync

User can sync job records from Google Sheets into the dashboard — jobs land in SQLite, user-owned fields are protected, and feedback is clear on success or failure.

## Story 2.1: `/api/ingest` Endpoint with Transactional Upsert

As a developer,
I want a POST endpoint that safely upserts job records while protecting user-owned fields,
So that all data sync operations have a reliable, atomic write layer to target.

**Acceptance Criteria:**

**Given** a POST request to `/api/ingest` with a valid `IngestPayload` (array of job objects)
**When** the endpoint processes the request
**Then** all rows are validated against `ingestPayloadSchema` (Zod) before any DB write begins
**And** all rows are written inside a single SQLite transaction — if any row fails, the entire batch rolls back and no rows are written

**Given** a job record already exists (matched by `company` + `job_title`)
**When** `/api/ingest` receives an updated version of that record
**Then** only Sheets-owned fields are updated (`fit_score`, `recommendation`, `role_fit`, `requirements_met`, `requirements_missed`, `red_flags`, `job_description`, `source_url`, `date_scraped`)
**And** user-owned fields (`applied`, `status`, `status_override`, `cover_letter_sent_at`, `date_applied`) are NOT overwritten

**Given** a successful ingest
**When** the response is returned
**Then** the response body is `{ added: number, updated: number }` with HTTP 200
**And** no stack traces or credential values appear in any response body

**Given** an invalid payload (missing required fields or wrong types)
**When** `/api/ingest` receives the request
**Then** it returns HTTP 400 with `{ error: string }` describing the validation failure
**And** no DB writes occur

## Story 2.2: Google Sheets OAuth Client & Column Mapping

As a user,
I want the app to fetch my job records from Google Sheets using OAuth credentials from my `.env`,
So that my upstream pipeline data flows into the dashboard without manual export steps.

**Acceptance Criteria:**

**Given** valid OAuth credentials in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`)
**When** `sheets-sync.ts` is called
**Then** `oauth-client.ts` uses the refresh token to obtain a valid access token before making any Sheets API call
**And** if the token is expired or invalid, `oauth-client.ts` throws an error with the message "OAuth token expired or invalid" — no silent failure

**Given** a successful OAuth token
**When** `sheets-sync.ts` fetches from the Sheets API v4
**Then** all rows from the spreadsheet (`GOOGLE_SPREADSHEET_ID`) are retrieved
**And** the raw Sheets column values are mapped to the `IngestPayload` schema in `sheets-sync.ts` — this is the only file that knows Sheets column names
**And** the output is a valid `Job[]` that can be passed directly to the ingest logic

**Given** a Sheets API network failure or quota error
**When** `sheets-sync.ts` is called
**Then** it throws an error with a descriptive message — no partial results returned, no silent swallowing

## Story 2.3: `/api/sync` Endpoint & Sync Button UI

As a user,
I want to click a Sync button and get clear feedback on whether my Google Sheets data synced successfully,
So that I know my dashboard is up to date and trust that existing data was not corrupted.

**Acceptance Criteria:**

**Given** the user clicks the Sync button
**When** the sync is in progress
**Then** the button shows a spinner and "Syncing…" label and is disabled for the duration

**Given** a successful sync
**When** the operation completes
**Then** an inline `Alert` appears below the header bar showing "X records added, Y updated"
**And** the TanStack Query `['jobs']` cache is invalidated, triggering a re-fetch of the jobs list
**And** the alert auto-dismisses after 4 seconds; the button returns to idle

**Given** a sync failure (OAuth error, Sheets API error, or write error)
**When** the operation fails
**Then** an inline `Alert` (destructive variant) appears showing the specific error message and "No data was modified."
**And** the alert persists until the next sync attempt
**And** the existing jobs data in the table is unchanged

**Given** the user runs Sync a second time immediately after a successful sync
**When** the second sync completes
**Then** the result shows "0 records added, X updated" — idempotent behavior with no data corruption

**Given** the `/api/sync` endpoint
**When** it is called
**Then** it calls `sheets-sync.ts` → maps columns → calls the ingest logic from Story 2.1
**And** it returns `{ added: number, updated: number }` on success or `{ error: string }` with appropriate HTTP status on failure

---
