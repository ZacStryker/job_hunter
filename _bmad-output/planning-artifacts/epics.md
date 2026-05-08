---
stepsCompleted: [step-01, step-02, step-03, step-04]
inputDocuments:
  - /home/zac/Documents/Scraper Bot Report.md
  - _bmad-output/planning-artifacts/architecture.md
---

# bmad - Epic Breakdown (Scraper Reliability Sprint)

## Overview

This document provides the epic and story breakdown derived from the Scraper Bot Detection & Reliability Investigation Report (2026-05-08), decomposing 6 identified issues into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Switch fetchLinkedInListing and fetchLinkedInJobDetails (linkedin.js lines 30–67) from withPage (Chromium + stealth) to withFirefoxPage to match the fix already applied to searchLinkedIn. [HIGH]

FR2: Parameterize locale and timezoneId in getFirefoxPage (pool.js lines 50–61) so callers pass their own values rather than always receiving 'nl-NL'/'Europe/Amsterdam'. indeed_nl should pass the Dutch values explicitly; LinkedIn/other callers use 'en-US'/'America/New_York'. [MEDIUM]

FR3: Implement a Firefox browser pool of ≥2 instances (pool.js line 9), mirroring the existing Chromium POOL_SIZE=2 pattern, so concurrent LinkedIn/Indeed/Indeed-NL operations do not serialize on a single browser process. [MEDIUM]

FR4: Fix the discovery temp file race condition in discovery-service.ts (lines 183–185) by moving unlinkSync cleanup to a finally block (or equivalent deferred cleanup) and reducing scrapeWithRetry retries from 3 to 1 to prevent ENOENT errors on in-flight retry attempts after AbortSignal fires. [MEDIUM]

FR5: Apply the pending input_tokens column migration to the production webhook_runs table so that webhook-triggered runs are recorded successfully; investigate and fix why the startup migration runner is not catching this schema drift. [LOW/URGENT]

FR6: Switch searchArc (arc.js line 1) from withPage (Chromium) to withFirefoxPage for consistency and future-proofing against bot detection. [LOW]

### Non-Functional Requirements

NFR1: indeed_nl scraping must continue to use Dutch locale/timezone — no regression.

NFR2: LinkedIn search (already on Firefox) must continue working — no regression.

NFR3: Pool changes must support concurrent discovery runs across multiple users without serialization bottleneck.

NFR4: Schema migration must be idempotent and applied without data loss.

NFR5: No new bot-detection fingerprinting signals introduced (e.g., mismatched locale for non-Dutch scrapers).

### Additional Requirements

- Side decision: determine whether 2 Chromium instances are still needed given the shift toward Firefox (flagged in report).
- Startup migration runner investigation: verify the migration file is present in the deployed image and that the runner picks it up on boot.

### UX Design Requirements

N/A — all fixes are backend/infrastructure with no UI surface.

### FR Coverage Map

FR1: Epic 31 / Story 31.1 — LinkedIn listing/detail fetchers → Firefox
FR2: Epic 31 / Story 31.2 — Firefox locale/timezone parameterization
FR3: Epic 31 / Story 31.3 — Firefox browser pool
FR4: Epic 31 / Story 31.4 — Discovery temp file race condition + retry reduction
FR5: Epic 32 / Story 32.1 — webhook_runs schema drift hotfix
FR6: Epic 31 / Story 31.5 — Arc scraper → Firefox

## Epic List

### Epic 31: Scraper Reliability & Bot Detection Hardening
Operators can run discovery across LinkedIn, Indeed, and Arc without bot-detection failures, locale fingerprinting signals, or concurrency bottlenecks. All scrapers run on a consistent browser strategy with a properly pooled Firefox instance.
**FRs covered:** FR1, FR2, FR3, FR4, FR6

### Epic 32: Webhook Run Recording Hotfix
Webhook-triggered discovery runs are recorded correctly in the database. The schema drift that caused `SQLiteError: table webhook_runs has no column named input_tokens` is resolved and the startup migration runner is verified to catch future drift.
**FRs covered:** FR5

---

## Epic 31: Scraper Reliability & Bot Detection Hardening

Operators can run discovery across LinkedIn, Indeed, and Arc without bot-detection failures, locale fingerprinting signals, or concurrency bottlenecks. All scrapers run on a consistent browser strategy with a properly pooled Firefox instance.

### Story 31.1: Switch LinkedIn Listing/Detail Fetchers to Firefox

As a user running discovery,
I want LinkedIn listing and job detail fetches to use Firefox (withFirefoxPage),
So that the analysis flow is not blocked by LinkedIn's bot detection.

**Acceptance Criteria:**

**Given** fetchLinkedInListing is called with a valid LinkedIn URL
**When** the function executes
**Then** it uses withFirefoxPage instead of withPage (Chromium + stealth)
**And** the job listing HTML is returned without a timeout

**Given** fetchLinkedInJobDetails is called with a valid LinkedIn job URL
**When** the function executes
**Then** it uses withFirefoxPage
**And** the full job description and metadata are returned

**Given** a LinkedIn session exists in the DB for the current user
**When** either function runs
**Then** the session's storageStatePath is passed to withFirefoxPage

**Given** both functions previously imported/used the stealth plugin
**When** the refactor is complete
**Then** no stealth plugin usage remains in these two functions

---

### Story 31.2: Parameterize Firefox Pool Locale & Timezone

As a developer maintaining the scraper pool,
I want getFirefoxPage to accept locale and timezoneId parameters,
So that indeed_nl gets Dutch locale and LinkedIn/Arc get English locale without cross-contamination.

**Acceptance Criteria:**

**Given** getFirefoxPage is called with no locale/timezone arguments
**When** it creates the browser context
**Then** it defaults to locale: 'en-US' and timezoneId: 'America/New_York'

**Given** indeed_nl calls getFirefoxPage
**When** it executes
**Then** it explicitly passes locale: 'nl-NL' and timezoneId: 'Europe/Amsterdam'

**Given** searchLinkedIn calls getFirefoxPage
**When** it executes
**Then** the default English locale is used (no Dutch locale leaking into LinkedIn results)

**Given** all callers are updated and deployed
**When** indeed_nl runs a scrape
**Then** Dutch locale/timezone behavior is preserved — no regression

---

### Story 31.3: Firefox Browser Pool (2+ Instances)

As a user of the application,
I want Firefox browser operations served from a pool of ≥2 instances,
So that concurrent discovery runs do not serialize on a single browser process.

**Acceptance Criteria:**

**Given** a FIREFOX_POOL_SIZE constant (default: 2) is defined in pool.js
**When** the pool initializes at startup
**Then** at least 2 Firefox browser instances are launched

**Given** two concurrent scraping operations (e.g., LinkedIn search + Indeed fetch)
**When** both execute simultaneously
**Then** each is served by a separate pool instance with no blocking

**Given** all pool instances are busy
**When** a new request arrives
**Then** it queues and waits for an available instance (same behavior as the Chromium pool)

**Given** the Chromium pool still runs POOL_SIZE=2
**When** 31.3 is implemented
**Then** a comment or config note documents the decision on whether Chromium pool size should be kept, reduced, or removed

---

### Story 31.4: Fix Discovery Temp File Race & Reduce Retries

As a user running LinkedIn discovery,
I want the storageState temp file to remain available for all retry attempts,
So that discovery runs don't produce ENOENT errors and retries have a fair chance to succeed.

**Acceptance Criteria:**

**Given** a discovery run is in progress with a temp storageState file on disk
**When** the 60-second AbortSignal fires
**Then** the unlinkSync call does not execute until after all in-flight attempts complete (deferred to a finally block or equivalent)

**Given** scrapeWithRetry is called for any route
**When** configured
**Then** retries is set to 1 (down from 3)

**Given** a discovery run times out
**When** the AbortSignal fires with a retry in flight
**Then** no ENOENT error appears in logs for the storageState file

**Given** cleanup is moved to a finally block
**When** a run completes or errors by any path
**Then** the temp file is always deleted — no file leaks

---

### Story 31.5: Switch Arc Scraper to Firefox

As a user running discovery,
I want Arc.dev scraping to use Firefox,
So that it is consistent with the Firefox-first strategy and resilient to future bot detection changes.

**Acceptance Criteria:**

**Given** searchArc is called
**When** it executes
**Then** it uses withFirefoxPage instead of withPage (Chromium)

**Given** Arc.dev requires no authentication
**When** withFirefoxPage is called
**Then** no storageStatePath is passed (auth-free operation preserved)

**Given** the browser switch
**When** Arc search results are returned
**Then** returned job fields match what were returned before the change — no data regression

---

## Epic 32: Webhook Run Recording Hotfix

Webhook-triggered discovery runs are recorded correctly in the database. The schema drift that caused `SQLiteError: table webhook_runs has no column named input_tokens` is resolved and the startup migration runner is verified to catch future drift.

### Story 32.1: Apply webhook_runs input_tokens Migration & Harden Startup Runner

As an operator monitoring webhook-triggered discovery runs,
I want webhook runs recorded successfully in the database,
So that I can audit and track all runs triggered by the n8n webhook.

**Acceptance Criteria:**

**Given** the production DB is missing the input_tokens column in webhook_runs
**When** the migration is applied
**Then** the column exists and INSERT statements for run recording succeed

**Given** a webhook-triggered discovery run completes
**When** run recording executes
**Then** no SQLiteError is thrown and the run is persisted to webhook_runs with all expected fields

**Given** the application starts
**When** the startup migration runner executes
**Then** all pending migrations — including this one — are applied and logged as "Migrations complete"

**Given** the migration file is present in the deployed Docker image
**When** verified post-deploy
**Then** the startup log confirms all migrations ran

**Given** the migration is applied to a DB that already has the column (e.g., a fresh install)
**When** the runner processes it
**Then** no error is thrown — migration is idempotent
