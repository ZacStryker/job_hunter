# Epic 6 (Post-MVP): Email Status Detection

System polls IMAP inbox, matches emails to job records via fuzzy matching, and auto-updates application status — email events visible in the drawer.

## Story 6.1: IMAP Polling Service

As a user,
I want the dashboard to automatically poll my email inbox for job-related messages,
So that application status updates arrive without me having to manually check email.

**Acceptance Criteria:**

**Given** `IMAP_HOST`, `IMAP_USER`, and `IMAP_PASS` are set in `.env`
**When** `bun start` runs
**Then** the IMAP polling service starts alongside the Hono server and polls on a configured interval
**And** IMAP credentials are never logged or included in any API response

**Given** IMAP credentials are missing from `.env`
**When** `bun start` runs
**Then** the IMAP service does not start; the rest of the app functions normally; a warning is logged to `console.warn`

**Given** the IMAP connection fails (wrong credentials, unreachable host)
**When** a poll cycle runs
**Then** the error is logged with `console.error`; the polling service retries on the next interval — no crash, no process exit

## Story 6.2: Fuzzy Email-to-Job Matching & Status Update

As a user,
I want the system to automatically match incoming emails to job records and update their status,
So that I get passive application tracking without any manual data entry.

**Acceptance Criteria:**

**Given** a new email arrives in the polled inbox
**When** the matching logic runs
**Then** the email's subject/body is normalized to lowercase and compared against job titles using fuzzy comparison (abbreviation-expanded)
**And** the match is only confirmed if the email's received timestamp is within ±3 days of the job's `date_applied` — date anchoring is the primary false-positive reducer

**Given** a confident match is found
**When** the status update runs
**Then** the matched job's `status` is updated in SQLite with the detected status (e.g., "Interview", "Rejected")
**And** a `status_events` entry is appended with `source: 'email'` and the email's received timestamp

**Given** no confident match is found for an email
**When** the matching logic completes
**Then** no DB writes occur — unmatched emails are silently skipped

## Story 6.3: Email Events Visible in Drawer

As a user,
I want to see email-detected status events in a job's timeline in the detail drawer,
So that I have a complete audit trail of how the application progressed.

**Acceptance Criteria:**

**Given** a job has email-matched status events in `status_events`
**When** the `StatusTimeline` renders in the drawer
**Then** each email-sourced event shows a distinct indicator (e.g., envelope icon or "via email" label) alongside the status and timestamp

**Given** a job has both manually set status events and email-detected events
**When** the `StatusTimeline` renders
**Then** all events are displayed in reverse chronological order regardless of source

---
