# Epic 31: Scraper Reliability & Bot Detection Hardening

Operators can run discovery across LinkedIn, Indeed, and Arc without bot-detection failures, locale fingerprinting signals, or concurrency bottlenecks. All scrapers run on a consistent Firefox-first browser strategy with a properly pooled Firefox instance.

**FRs covered:** FR1 (LinkedIn fetchers → Firefox), FR2 (Firefox locale parameterization), FR3 (Firefox pool), FR4 (temp file race + retry reduction), FR6 (Arc → Firefox)
**NFRs addressed:** NFR1 (indeed_nl no regression), NFR2 (LinkedIn search no regression), NFR3 (concurrent user support), NFR5 (no new fingerprinting signals)
**Source:** Scraper Bot Detection & Reliability Investigation Report, 2026-05-08
**Files affected:** `job-hunt-dashboard/src/server/scrapers/linkedin.js` (lines 30–67), `job-hunt-dashboard/src/server/scrapers/pool.js` (lines 9, 50–61), `job-hunt-dashboard/src/server/scrapers/arc.js` (line 1), `job-hunt-dashboard/src/server/services/discovery-service.ts` (lines 183–185)

---

## Story 31.1: Switch LinkedIn Listing/Detail Fetchers to Firefox

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

> **Dev note:** `linkedin.js` lines 30–67. Mirror the pattern already applied to `searchLinkedIn`. Consider implementing Story 31.2 (locale parameterization) at the same time to avoid the Dutch locale leaking into LinkedIn fetchers.

---

## Story 31.2: Parameterize Firefox Pool Locale & Timezone

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

> **Dev note:** `pool.js` lines 50–61. The current `contextOptions` hardcodes `locale: 'nl-NL'` and `timezoneId: 'Europe/Amsterdam'`. Accept these via function parameters with `'en-US'`/`'America/New_York'` as defaults, or pass them through `contextOverrides`. Update all callers: `searchLinkedIn`, `fetchLinkedInListing`, `fetchLinkedInJobDetails`, `searchIndeed`, `searchIndeedNl` (nl caller passes Dutch values explicitly).

---

## Story 31.3: Firefox Browser Pool (2+ Instances)

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

> **Dev note:** `pool.js` line 9. Mirror the Chromium pool pattern (`POOL_SIZE = 2`, pool array, acquire/release logic) for Firefox. The existing single `firefoxBrowser` variable becomes a pool. Decide whether Chromium still needs 2 instances given the shift toward Firefox and document the decision inline.

---

## Story 31.4: Fix Discovery Temp File Race & Reduce Retries

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

> **Dev note:** `discovery-service.ts` lines 183–185. Move `unlinkSync(storageStatePath)` from the AbortSignal callback into a `finally` block wrapping the full scrape attempt sequence. Change `scrapeWithRetry` retries from 3 to 1 for all routes.

---

## Story 31.5: Switch Arc Scraper to Firefox

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

> **Dev note:** `arc.js` line 1. Straightforward swap of `withPage` → `withFirefoxPage`. No auth/session required for Arc. Low risk — Arc has less aggressive bot detection than LinkedIn or Indeed.

---
