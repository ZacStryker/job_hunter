# Epic 8 (Post-MVP): Field Visibility & Archive

User can see additional job data fields in the pipeline table and archive irrelevant jobs to keep active views focused.

## Story 8.1: Pipeline Table — Date Scraped & Status Columns

As a user,
I want to see the date a job was scraped and its current status directly in the pipeline table,
So that I can assess job recency and application state without opening the drawer.

**Acceptance Criteria:**

**Given** the Pipeline table renders
**When** the user opens the Columns dropdown
**Then** "Date Scraped" and "Status" entries are present and toggleable

**Given** a job has a non-null `dateScraped` value
**When** its row renders
**Then** the date is displayed in the Date Scraped cell; null values show an em-dash (—)

**Given** a job has a non-null `status` value
**When** its row renders
**Then** the status string is displayed in the Status cell; null values show an em-dash (—)

**Given** the user hides the Date Scraped or Status column via the Columns toggle
**When** they reload the page
**Then** the hidden state persists via localStorage

## Story 8.2: Archive Jobs

As a user,
I want to archive jobs I'm no longer interested in,
So that my Pipeline and Tracker views stay focused on active opportunities.

**Acceptance Criteria:**

**Given** the user opens the job drawer for any non-archived job
**When** they view the drawer
**Then** an "Archive" button is visible

**Given** the user clicks "Archive"
**When** the PATCH request completes
**Then** the job's `archived` field is set to `true`, the drawer closes, and the job is no longer visible in the Pipeline or Tracker view

**Given** the user switches to the "Archived" tab
**When** the view renders
**Then** only archived jobs are shown, using the same Pipeline table layout (no Sync button, no view-switching to Tracker from this tab)

**Given** the user opens an archived job's drawer
**When** they view it
**Then** an "Unarchive" button is shown instead of "Archive"

**Given** the user clicks "Unarchive"
**When** the PATCH request completes
**Then** `archived` is set to `false`, the job reappears in Pipeline/Tracker, and disappears from the Archived view

**Given** the Sheets sync runs
**When** a job record is upserted
**Then** the `archived` field is never overwritten (user-owned field, excluded from ON CONFLICT UPDATE clause)
