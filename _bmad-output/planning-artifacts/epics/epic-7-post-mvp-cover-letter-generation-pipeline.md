# Epic 7 (Post-MVP): Cover Letter Generation Pipeline

User can trigger cover letter generation for any job — delivered via email, tracked in the drawer, with status indicator visible in the table row.

## Story 7.1: Cover Letter Generation Trigger

As a user,
I want to trigger cover letter generation for a specific job directly from the drawer,
So that I can initiate the generation pipeline without leaving the dashboard.

**Acceptance Criteria:**

**Given** the user opens the job drawer and clicks "Generate Cover Letter"
**When** the button is clicked
**Then** a POST is sent to the n8n webhook URL (from env) including the job record payload
**And** the request includes the shared secret from `N8N_WEBHOOK_SECRET` as an Authorization header

**Given** the webhook fires successfully
**When** the response is received
**Then** `cover_letter_sent_at` is set to the current ISO timestamp in SQLite for that job
**And** the button state updates to "Generating…" (disabled) to indicate in-progress

**Given** the webhook request fails
**When** the error is caught
**Then** an inline error message appears in the drawer; `cover_letter_sent_at` is not set

## Story 7.2: n8n Webhook Callback & Cover Letter Storage

As a user,
I want the generated cover letter to be automatically stored in the dashboard after n8n delivers it,
So that I can view it any time without relying on email as the only record.

**Acceptance Criteria:**

**Given** n8n completes cover letter generation and POSTs to `/api/cover-letter/callback`
**When** the callback is received
**Then** the `N8N_WEBHOOK_SECRET` in the Authorization header is validated — invalid secret returns HTTP 401

**Given** a valid callback payload
**When** it is processed
**Then** the cover letter text is stored in a `cover_letters` table (`id`, `job_id` FK, `content`, `created_at`)
**And** the job record's status is updated to reflect cover letter delivery

**Given** storage succeeds
**When** the callback response is sent
**Then** HTTP 200 is returned to n8n; no stack traces in response

## Story 7.3: Cover Letter Display & Table Row Indicator

As a user,
I want to read my generated cover letter in the job drawer and see its status at a glance in the pipeline table,
So that I can track which applications have cover letters without opening each drawer.

**Acceptance Criteria:**

**Given** a job has a generated cover letter in the `cover_letters` table
**When** the drawer is open for that job
**Then** the cover letter content is rendered in a dedicated section below the status timeline

**Given** a job with `cover_letter_sent_at` set
**When** its row renders in the Pipeline table
**Then** a cover letter status chip is visible on the row (e.g., "CL Sent" in a muted style)

**Given** a job with no cover letter
**When** its row renders
**Then** no chip is shown — absence is the default, not a "No CL" label
