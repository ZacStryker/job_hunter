# Epic 25: User Onboarding

After first login, a new user completes a 4-step guided setup — Anthropic API key (live-tested, hard-gated), IMAP configuration (soft-gated, skippable) — and lands on a functional personal dashboard; onboarding is never shown again.

**FRs covered:** FR-A5
**NFRs addressed:** NFR-A1, NFR-A6
**UX:** UX-AUTH6 (StepIndicator), UX-AUTH7 (ConnectionTestButton), UX-AUTH8 (API key step), UX-AUTH9 (IMAP step)
**Architecture:** Onboarding API routes (GET /api/onboarding/status, PUT /api/onboarding/anthropic, PUT /api/onboarding/imap), per-user secrets encryption, onboarding completion gate in auth routing

## Story 25.1: Onboarding API — Status, Anthropic API Key & IMAP Setup

As a user completing onboarding,
I want API endpoints that store my Anthropic API key and IMAP credentials after live testing them,
So that the app can make AI analysis calls and poll my email using credentials that are private and encrypted.

**Acceptance Criteria:**

**Given** a valid session and incomplete onboarding
**When** `GET /api/onboarding/status` is called
**Then** response is `200 { hasAnthropicKey: boolean, hasImap: boolean, onboardingComplete: boolean }`
**And** `onboardingComplete` is `true` only when `hasAnthropicKey` is `true` (IMAP is optional)
**And** raw secret values are never included in the response — presence flags only

**Given** I submit an Anthropic API key
**When** `PUT /api/onboarding/anthropic` is called with `{ apiKey }`
**Then** the server makes a minimal live Anthropic API test call using the provided key
**And** on success: the key is encrypted via `encrypt()` and stored in `user_secrets` (key_name: `anthropic_api_key`); response is `200 { ok: true }`

**Given** an invalid Anthropic API key
**When** `PUT /api/onboarding/anthropic` is called
**Then** the key is NOT stored; response is `400 { error: "Invalid key — verify at console.anthropic.com" }`

**Given** the Anthropic test times out (> 10 seconds)
**When** `PUT /api/onboarding/anthropic` is called
**Then** response is `400 { error: "Connection timed out — check your network and try again" }`

**Given** a server-side error from the Anthropic API
**When** `PUT /api/onboarding/anthropic` is called
**Then** response is `400 { error: "Server error — try again in a moment" }`

**Given** valid IMAP credentials are submitted
**When** `PUT /api/onboarding/imap` is called with `{ host, port, user, pass }`
**Then** the server attempts a live IMAP connection test with a 10-second timeout
**And** on success: all four values are encrypted and stored in `user_secrets` (key_names: `imap_host`, `imap_port`, `imap_user`, `imap_pass`); response is `200 { ok: true }`

**Given** IMAP credentials with wrong password
**When** `PUT /api/onboarding/imap` is called
**Then** credentials are NOT stored; response is `400 { error: "Authentication failed — check username and password" }`

**Given** an unreachable IMAP host
**When** `PUT /api/onboarding/imap` is called
**Then** response is `400 { error: "Cannot reach host — verify server address and port" }`

**Given** the IMAP test times out (> 10 seconds)
**When** `PUT /api/onboarding/imap` is called
**Then** response is `400 { error: "Connection timed out — check your network and try again" }`

**Given** a user has IMAP credentials stored in `user_secrets`
**When** `POST /api/messages/sync` is called
**Then** credentials are read from `user_secrets` (key_names: `imap_host`, `imap_port`, `imap_user`, `imap_pass`) and decrypted via `decrypt()`
**And** `fetchAndStoreEmails` is called with the decrypted per-user credentials and the authenticated `userId`
**And** global env var IMAP credentials (`IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`) are no longer used — `user_secrets` is the sole credential source

**Given** a user has no IMAP credentials in `user_secrets`
**When** `POST /api/messages/sync` is called
**Then** response is `503 { error: "Email sync not configured — add IMAP credentials in settings" }`

**Given** stored IMAP credentials fail to decrypt
**When** `POST /api/messages/sync` is called
**Then** response is `500 { error: "Failed to read email credentials" }`
**And** the decrypt error is logged via `console.error`

> **Dev note:** `api-messages.ts` `POST /sync` must be updated in this story. Replace the env var block (`IMAP_HOST`/`IMAP_USER`/`IMAP_PASS`) with a `user_secrets` query scoped to the authenticated `userId`. Wrap all `decrypt()` calls in explicit try/catch — GCM decryption throws on tampered ciphertext and will surface as 500 without it.

## Story 25.2: Onboarding UI — 4-Step Setup Flow

As a newly activated user,
I want a guided 4-step onboarding flow that walks me through Anthropic API key setup and optional IMAP configuration,
So that I reach a fully functional personal dashboard in under 5 minutes.

**Acceptance Criteria:**

**Given** `GET /api/onboarding/status` returns `onboardingComplete: true`
**When** I navigate to `/onboarding`
**Then** I am redirected to `/` immediately

**Given** I land on `/onboarding` with incomplete onboarding
**When** the page loads
**Then** I see the `StepIndicator` with 4 dots: Step 1 active (blue-500), Steps 2–4 pending (zinc-700)
**And** the `StepIndicator` has `role="list"` and `aria-label="Onboarding progress: step 1 of 4"`; each dot is `role="listitem"` with `sr-only` text describing its status

**Given** I am on Step 1 (Welcome)
**When** I click "Get Started"
**Then** Step 1 dot turns emerald-500; Step 2 becomes active (blue-500); focus moves programmatically to the Step 2 `<h2>` heading

**Given** I am on Step 2 (Anthropic API Key) and I paste a key and click "Test Connection"
**When** the `ConnectionTestButton` is loading
**Then** the button shows a spinner and "Testing…" and is disabled for up to 10 seconds

**Given** the API key test succeeds
**When** `ConnectionTestButton` reaches pass state
**Then** the button shows "✓ Connected" (emerald-600 border + emerald-400 text), an `<Alert>` below reads "Connection successful"; Continue button activates
**And** an `aria-live="polite"` region announces "Connection successful" to screen readers

**Given** the API key test fails
**When** `ConnectionTestButton` reaches fail state
**Then** the button shows "✗ Failed" (red-700 border + red-400 text), an `<Alert variant="destructive">` shows the specific error message; Continue remains disabled
**And** an `aria-live="polite"` region announces the failure message to screen readers

**Given** I edit the API key field after any test result (pass or fail)
**When** the field value changes
**Then** `ConnectionTestButton` resets to idle state and Continue deactivates

**Given** I am on Step 3 (IMAP Setup)
**When** the step renders
**Then** "Skip for now" and "Test Connection" are equal-weight primary-style buttons; "Back" is secondary
**And** hint text is shown: e.g., "Use imap.gmail.com port 993 for Gmail"

**Given** I click "Skip for now" on Step 3
**When** the action fires
**Then** I advance to Step 4 without saving IMAP credentials

**Given** the IMAP test succeeds on Step 3
**When** `ConnectionTestButton` reaches pass state
**Then** Continue activates; "Skip for now" remains visible as a valid equal-weight alternative

**Given** I reach Step 4 (Done)
**When** the step renders
**Then** I see "Your account is ready" and a "Go to Dashboard" primary button
**And** clicking "Go to Dashboard" navigates to `/` and onboarding is never shown again

---
