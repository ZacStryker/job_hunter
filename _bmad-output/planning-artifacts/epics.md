---
stepsCompleted: [step-01, step-02]
inputDocuments:
  - "Epic brief (provided via command arguments — link Gmail inbox for email syncing via Google API + OAuth 2.0, following IMAP rules with per-user custom mapping)"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/architecture-distillate.md"
  - "Existing IMAP email-sync implementation (job-hunt-dashboard/src/server/services/email-fetch-service.ts, api-messages.ts, api-onboarding.ts, api-config-inbox-mappings.ts, db/schema.ts, config/profile-inbox-mapping.tsx, onboarding.tsx) — the canonical pattern this epic mirrors"
scopeDecisions:
  connectFlow: "Standard OAuth 2.0 redirect (browser → Google consent → /api/onboarding/gmail/callback)"
  imapRelationship: "Gmail coexists with IMAP as an alternative connection; a user has Gmail OR IMAP"
  uiSurfaces: "Onboarding email step + Config > Profile > Inbox Mapping"
  verification: "Testing mode only (≤100 manually-added test users; production OAuth verification + CASA out of scope)"
---

# HITLOBSTER - Epic 45: Gmail Inbox Integration (Google API + OAuth 2.0)

## Overview

This document captures the requirements and story breakdown for Epic 45 — a direct Gmail integration that lets a user link their Gmail inbox for email syncing via the Google Gmail API using OAuth 2.0. It follows the same rules as the existing IMAP sync (per-user custom mapping, 30-day cutoff, dedup, manual message-to-job mapping in the Messages view) with Gmail **labels** standing in for IMAP folders. Gmail is offered as an alternative to IMAP: a user connects either Gmail (OAuth) or IMAP, and `POST /api/messages/sync` uses whichever is configured.

**Scope decisions confirmed with the product owner:**
- **Connect flow:** standard OAuth 2.0 redirect (no embedded webview — Google blocks OAuth in embedded browsers).
- **IMAP relationship:** Gmail coexists as an alternative; IMAP remains for non-Gmail providers.
- **UI surfaces:** onboarding email step + Config > Profile > Inbox Mapping (mirrors how IMAP appears in both).
- **Verification:** Testing-mode setup only (≤100 test users, no Google review). Public OAuth verification + CASA security assessment is explicitly out of scope.

## Requirements Inventory

### Functional Requirements

FR1: A user can connect their Gmail account via a standard OAuth 2.0 redirect flow — a "Connect Gmail" action redirects the browser to Google's consent screen requesting the `gmail.readonly` scope; Google redirects back to `/api/onboarding/gmail/callback`; the server exchanges the authorization code for tokens and stores the **refresh token** (and the connected Gmail address) encrypted, per-user, in `user_secrets`.

FR2: Gmail is offered as an alternative to IMAP, not a replacement — both options are presented in the onboarding email step and in Config > Profile > Inbox Mapping; a user may have Gmail OR IMAP configured. IMAP remains fully functional for non-Gmail providers.

FR3: Connection status is visible — `GET /api/onboarding/status` reports `hasGmail`; the UI shows a Connected badge with the linked Gmail address (and a Disconnect control) when Gmail is connected, mirroring the IMAP Connected / Not connected badges.

FR4: A user can map Gmail **labels** to job statuses (the existing `MESSAGE_TYPES`: Submitted, Rejected, Screening, Interview, Offer, Other) on a per-user basis — the Gmail equivalent of the IMAP folder→status mapping (`inbox_folder_mappings`).

FR5: When mapping labels, the user picks from their actual Gmail labels (fetched live from the Gmail API) rather than typing a free-text path — labels are discoverable via the API, unlike IMAP folder paths.

FR6: `POST /api/messages/sync` syncs Gmail when Gmail is connected — for each mapped label it lists messages with a 30-day cutoff (`newer_than:30d`), dedups against already-stored messages (by Gmail message id and RFC 2822 Message-ID), and writes new messages into the existing `messages` table with `type` set from the label's mapped job status. Behavioural parity with `fetchAndStoreEmails`.

FR7: Synced Gmail messages appear in the Messages view identically to IMAP messages — same `messages` table, same `BLOCKED_SENDERS` filtering, same manual per-message company / jobTitle / type editing via `PATCH /api/messages/:id`.

FR8: A user can disconnect Gmail — the stored refresh token and Gmail address are removed (and the token revoked with Google where possible), and `hasGmail` returns to false. Gmail label mappings are cleared on disconnect.

FR9: Operator setup is documented as an explicit prerequisite — enabling the Gmail API, configuring the OAuth consent screen with the `gmail.readonly` scope and test users, creating the Web-application OAuth Client ID with the `{APP_URL}/api/onboarding/gmail/callback` redirect URI, and populating `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

FR10: The integration requests read-only access only (`gmail.readonly`) — no modify, send, or delete scopes.

### NonFunctional Requirements

NFR1: A single shared Google OAuth client app serves all HITLOBSTER users — `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are app-level environment variables (added to `.env.example`); only the **per-user refresh token** and Gmail address are stored per user. Client secret is never per-user and never exposed to the client.

NFR2: Gmail tokens are encrypted at rest using the existing `encrypt()` / `decrypt()` crypto module (the `user_secrets` pattern) — never logged, never returned in any API response.

NFR3: OAuth scope is limited to `gmail.readonly`; no write scopes are requested.

NFR4: Gmail is optional and must not affect application boot — the app must NOT require `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` at startup (unlike `PORT`/`DB_PATH`). Their absence yields a clear "Gmail not configured" error only when a user attempts to connect or sync Gmail.

NFR5: Per-user isolation is preserved — all Gmail secrets, label mappings, and synced messages are scoped by `userId`, consistent with the multi-user data-isolation invariant.

NFR6: Access tokens are refreshed transparently from the stored refresh token at sync time; expired/revoked tokens surface a clear, actionable error (consistent with IMAP's 502/503 `{ error }` responses) prompting the user to reconnect.

NFR7: 30-day lookback parity with IMAP — Gmail sync uses the same recency window so the two paths produce comparable results.

NFR8: OAuth callbacks are protected against CSRF via a signed/opaque `state` parameter tied to the user's session, validated on the callback before any token exchange.

### Additional Requirements

- New runtime dependency for Google OAuth + Gmail API access (e.g. `googleapis` or `google-auth-library` + direct REST calls) — keep the footprint minimal and consistent with the existing direct-`fetch` style used for the Anthropic key test.
- New optional env vars in `.env.example`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (documented as required only for Gmail).
- New `user_secrets` keys: `gmail_refresh_token`, `gmail_address`.
- Label→status mapping storage decision (resolved in Step 2 design): either reuse `inbox_folder_mappings` (storing the Gmail label in `folder_path` with a connection discriminator) or introduce a dedicated `gmail_label_mappings` table + migration `0034`. The chosen approach must keep `email-fetch-service` (IMAP) and the new `gmail-fetch-service` independent.
- New OAuth routes under the onboarding router: connect-initiation (`GET /api/onboarding/gmail/connect` → redirect URL) and callback (`GET /api/onboarding/gmail/callback`), plus disconnect (`DELETE /api/onboarding/gmail`).
- New service module `gmail-fetch-service.ts` (parallel to `email-fetch-service.ts`), and a label-list endpoint (`GET /api/onboarding/gmail/labels`).
- `POST /api/messages/sync` branches: if Gmail connected → Gmail sync; else if IMAP configured → existing IMAP sync; else 503.
- Route registration in `src/index.ts` consistent with existing onboarding sub-routes; redirect URI must be registered in the Google Cloud OAuth client for both production (`{APP_URL}`) and local dev (`http://localhost:3000`).
- Operator runbook addition: Testing-mode consent-screen instructions and the `gmail.readonly` restricted-scope caveat (production verification + CASA assessment is out of scope for this epic).

### UX Design Requirements

UX-DR1: "Connect Gmail" uses Google's official sign-in button styling/branding per Google's brand guidelines, placed alongside (not replacing) the IMAP form in both the onboarding email step and the Config inbox-mapping page.

UX-DR2: When Gmail is connected, the UI shows the linked Gmail address with a green "Connected" badge and a "Disconnect" action — mirroring the existing IMAP `Connected` / `Not connected` badge pattern in `profile-inbox-mapping.tsx`.

UX-DR3: The Gmail label-mapping UI mirrors the IMAP folder-mapping table (Add / Edit / Delete rows, label + Job Status columns), but the label field is a dropdown populated from the user's fetched Gmail labels rather than a free-text input.

UX-DR4: The onboarding email step presents a clear either/or choice between "Connect Gmail" (OAuth) and "Use IMAP" (manual credentials), keeping the step skippable/soft-gated exactly as the current IMAP step is.

UX-DR5: After returning from the Google consent screen, the user lands back on the originating surface (onboarding or Config) with a success toast and the connection shown as Connected — no dead-end callback page.

### FR Coverage Map

```
FR1:  Epic 45 — OAuth redirect connect; encrypted per-user refresh token in user_secrets
FR2:  Epic 45 — Gmail coexists with IMAP (either/or per user)
FR3:  Epic 45 — hasGmail status + connected-address badge / disconnect
FR4:  Epic 45 — Gmail label → job-status mapping (per user)
FR5:  Epic 45 — Label picker populated live from Gmail API
FR6:  Epic 45 — POST /api/messages/sync Gmail path (30-day cutoff, dedup, write messages)
FR7:  Epic 45 — Gmail messages behave identically in the Messages view
FR8:  Epic 45 — Disconnect (revoke + clear token, address, mappings)
FR9:  Epic 45 — Operator Google Cloud setup prerequisite (Testing mode)
FR10: Epic 45 — gmail.readonly read-only scope

NFR1–NFR8:     Epic 45 — Shared OAuth app + per-user tokens, encryption reuse,
               read-only, optional-at-boot, per-user isolation, token refresh,
               30-day parity, CSRF state param
UX-DR1–UX-DR5: Epic 45 — Google-branded connect, connected badge, label-dropdown
               mapping table, either/or onboarding choice, clean return-to-surface
```

## Epic List

### Epic 45: Gmail Inbox Integration (Google API + OAuth 2.0)
A user can link their Gmail account via Google's OAuth 2.0 consent — no password sharing — map their Gmail labels to job statuses, and have matching emails sync into the Messages view exactly as IMAP does today. Gmail and IMAP coexist; `POST /api/messages/sync` uses whichever the user connected. Builds only on existing shipped infrastructure (`user_secrets`, `messages` table, Messages view, onboarding/Config surfaces); requires no future epic to function.
**FRs covered:** FR1–FR10 · **NFRs:** NFR1–NFR8 · **UX-DRs:** UX-DR1–UX-DR5
**Source:** User request 2026-06-15
**Priority:** Medium — adds a passwordless inbox-connection option alongside IMAP
**Out of scope:** Public OAuth app verification + CASA security assessment (Testing mode only, ≤100 test users); write/send Gmail scopes; background polling (on-demand sync only, like IMAP)

**Data-model decision:** Gmail label→status mappings live in a new dedicated `gmail_label_mappings` table (migration `0034`), NOT in `inbox_folder_mappings`. This keeps the IMAP `email-fetch-service` and the new `gmail-fetch-service` fully independent, with no shared rows to disambiguate.

**Story dependency order:** 45.1 (OAuth connect/disconnect, server) → 45.2 (label data model + label list + mapping CRUD, server) → 45.3 (sync service + endpoint branching, server) → 45.4 (UI on Config + onboarding surfaces). Each story is completable on top of the previous ones only, with no forward dependencies.

---

## Epic 45: Gmail Inbox Integration (Google API + OAuth 2.0)

A user can link their Gmail account via Google's OAuth 2.0 consent — no password sharing — map their Gmail labels to job statuses, and have matching emails sync into the Messages view exactly as IMAP does today. Gmail and IMAP coexist; `POST /api/messages/sync` uses whichever the user connected.

### Story 45.1: Connect & Disconnect Gmail via OAuth 2.0

As a job seeker,
I want to link my Gmail account through Google's consent screen instead of entering a password,
So that HITLOBSTER can read my job-related emails securely without me sharing my Gmail credentials.

**Acceptance Criteria:**

**Given** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
**When** an authenticated user requests `GET /api/onboarding/gmail/connect`
**Then** the server returns a Google OAuth consent URL requesting only the `gmail.readonly` scope, with `access_type=offline` and `prompt=consent` (to guarantee a refresh token), and an opaque CSRF `state` parameter bound to the user's session

**Given** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are NOT set
**When** any Gmail connect or sync action is attempted
**Then** the request fails with `503 { error: "Gmail not configured …" }`
**And** application startup is unaffected — these env vars are never required at boot (unlike `PORT` / `DB_PATH`)

**Given** Google redirects the browser to `GET /api/onboarding/gmail/callback` with a valid `code` and `state`
**When** the `state` matches the session
**Then** the server exchanges the code for tokens, obtains a refresh token, reads the connected account's email address, and stores `gmail_refresh_token` and `gmail_address` encrypted (via `encrypt()`) per-user in `user_secrets`
**And** redirects the browser back to the originating surface (onboarding or Config) with a success indication

**Given** a callback with a missing or invalid `state`
**When** it is received
**Then** no token exchange occurs and the request is rejected (CSRF protection)

**Given** a connected user
**When** `GET /api/onboarding/status` is called
**Then** the response includes `hasGmail: true` and all existing status fields are unchanged

**Given** a connected user
**When** `DELETE /api/onboarding/gmail` is called
**Then** the refresh token is revoked with Google on a best-effort basis, `gmail_refresh_token` and `gmail_address` are removed from `user_secrets`, and `hasGmail` returns to `false`

**Given** Gmail tokens at any point
**When** API responses are produced or logs are written
**Then** no token value ever appears in a response body or log line

**Given** the repository documentation and `.env.example`
**When** an operator sets up Gmail
**Then** a runbook section documents the Testing-mode Google Cloud steps — enable the Gmail API, configure the OAuth consent screen with the `gmail.readonly` scope and test users, create a Web-application OAuth Client ID with the `{APP_URL}/api/onboarding/gmail/callback` redirect URI (plus a localhost variant for dev), and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — and `.env.example` lists both vars as optional (Gmail-only)

### Story 45.2: Gmail Label Mapping — Data Model, Label List & CRUD

As a job seeker,
I want to choose which of my Gmail labels map to which application statuses,
So that emails I have organised under specific labels are recorded against the right stage of my job search — the same way IMAP folder mapping works.

**Acceptance Criteria:**

**Given** migration `0034`
**When** it runs (idempotently)
**Then** a `gmail_label_mappings` table exists with columns `id`, `user_id` (FK → users), `label`, `job_status`, `created_at`, a `user_id` index, and a `UNIQUE(user_id, label)` index — mirroring `inbox_folder_mappings`

**Given** a Gmail-connected user
**When** `GET /api/onboarding/gmail/labels` is called
**Then** the response lists the user's Gmail labels (id + name), fetched live from the Gmail API using an access token refreshed from the stored refresh token

**Given** a user who has NOT connected Gmail
**When** `GET /api/onboarding/gmail/labels` is called
**Then** the request fails with `503 { error }`

**Given** an authenticated user
**When** `GET /api/config/gmail-mappings` is called
**Then** only that user's label→status rows are returned (per-user scoped)

**Given** an authenticated user
**When** `PUT /api/config/gmail-mappings` is called with an array of `{ label, jobStatus }` where `jobStatus` ∈ `MESSAGE_TYPES`
**Then** the user's mappings are replaced transactionally (mirroring the inbox-mappings `PUT`) and the saved rows are returned
**And** an invalid `jobStatus` or malformed body returns `400 { error }`

**Given** a user disconnects Gmail via `DELETE /api/onboarding/gmail`
**When** the disconnect completes
**Then** that user's `gmail_label_mappings` rows are also cleared (additive extension of Story 45.1's disconnect)

### Story 45.3: Gmail Sync into the Messages View

As a job seeker,
I want syncing my inbox to pull labelled Gmail emails into my Messages view,
So that my Gmail-connected account behaves exactly like an IMAP-connected one when I track applications.

**Acceptance Criteria:**

**Given** a Gmail-connected user with label mappings
**When** `POST /api/messages/sync` runs and Gmail is the connected provider
**Then** a new `gmail-fetch-service` lists messages for each mapped label with a 30-day recency cutoff (`newer_than:30d`), using an access token refreshed from the stored refresh token

**Given** a fetched Gmail message
**When** it is stored
**Then** its From (`Name <address>` form), Subject, received date (ISO 8601 `received_at`), and RFC 2822 Message-ID are written into the existing `messages` table with `type` set to the label's mapped job status and `userId` set

**Given** a message that is already stored (matched by its Gmail-message-id-derived `uid` OR by Message-ID)
**When** sync runs again
**Then** it is not duplicated, and a message newly seen under a mapped label updates `type` only if it was previously null — parity with the IMAP `fetchAndStoreEmails` behaviour

**Given** a message from a `BLOCKED_SENDERS` address
**When** sync runs
**Then** it is filtered out (same blocked-sender behaviour as IMAP)

**Given** the sync endpoint
**When** it is called
**Then** it uses the Gmail path if Gmail is connected, otherwise the existing IMAP path if IMAP is configured, otherwise returns `503 { error }`
**And** on success returns `{ added: n }` (parity with IMAP)

**Given** an expired or revoked Gmail refresh token
**When** sync runs
**Then** it returns a clear, actionable error (`5xx { error }`) prompting the user to reconnect, and no token value is logged

**Given** Gmail messages have been synced
**When** the user views `GET /api/messages` and edits one via `PATCH /api/messages/:id`
**Then** they appear and behave identically to IMAP-sourced messages (company / jobTitle / type editable)

### Story 45.4: Connect Gmail UI — Config & Onboarding Surfaces

As a job seeker,
I want a clear "Connect Gmail" option in onboarding and in Config alongside the IMAP form, with my mappings managed by picking from my real labels,
So that I can set up and manage Gmail syncing visually without leaving the app.

**Acceptance Criteria:**

**Given** the Config > Profile > Inbox Mapping page
**When** it renders
**Then** a Google-branded "Connect Gmail" button appears alongside — not replacing — the existing IMAP connection form

**Given** the user has not connected Gmail
**When** they click "Connect Gmail"
**Then** the OAuth flow starts (`GET /api/onboarding/gmail/connect` → redirect to Google)

**Given** the user has connected Gmail
**When** the page renders
**Then** a green "Connected" badge shows the linked Gmail address with a "Disconnect" action — mirroring the IMAP `Connected` / `Not connected` badge pattern

**Given** the user returns from Google's consent screen
**When** the callback completes
**Then** they land back on the originating surface with a success toast and the Connected state shown — there is no dead-end callback page

**Given** a Gmail-connected user
**When** they manage label mappings
**Then** a mapping table (Add / Edit / Delete rows) is shown where the label is chosen from a dropdown populated by `GET /api/onboarding/gmail/labels` and the status from `MESSAGE_TYPES` — mirroring the IMAP folder-mapping table

**Given** the onboarding email step
**When** it renders
**Then** it presents an either/or choice between "Connect Gmail" (OAuth) and "Use IMAP" (manual credentials), and remains skippable / soft-gated exactly as the current IMAP step is

**Given** a user who has Gmail connected
**When** they view the IMAP form
**Then** the IMAP form still functions and connecting Gmail does not remove IMAP configuration (and vice versa) — the two coexist per user

**Given** the connected UI in both surfaces
**When** it decides what to show
**Then** it is driven by `hasGmail` from `GET /api/onboarding/status`
