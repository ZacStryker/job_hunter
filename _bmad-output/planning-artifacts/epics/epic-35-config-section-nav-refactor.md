# Epic 35: Config Section Navigation Refactor

User can navigate the Config section through a persistent left nav with four top-level entries (Profile, Job Sources, Prompts, Logs). Each entry has its own overview page with status-badged tiles drilling into subpages. The existing flat `/config` layout and standalone `/profile`, `/prompts`, `/logs` routes are replaced by this hierarchical structure.

**Source:** User request 2026-05-18
**Priority:** Medium — UX improvement, no backend schema changes required (except Story 35.3 which adds the inbox folder mapping table)

---

## Story 35.1: Config Layout Shell, Router Restructure & Overview Page

As a user in the Config section,
I want a persistent left nav and a landing overview page when I navigate to Config,
So that I can immediately see all configuration areas and navigate directly to any section.

**Acceptance Criteria:**

**Given** the user clicks "Config" in the top nav
**When** the `/config` route loads
**Then** the page renders a left nav (Profile, Job Sources, Prompts, Logs) and a 4-tile overview grid (one tile per section)

**Given** the user is on any `/config/*` page
**When** they look at the screen
**Then** the left nav is visible, with the active section link visually distinguished from inactive links

**Given** the user clicks a left nav link (e.g., "Job Sources")
**When** the link activates
**Then** the URL changes to `/config/job-sources` and the section overview page renders inside the content area

**Given** the `/config` overview page is rendered
**When** profile data, onboarding status, search configs, and prompts are loaded
**Then** each section tile displays a "Configured" or "Incomplete" status badge:
- Profile tile: Configured if `hasAnthropicKey` AND profile name is set AND `hasImap`; otherwise Incomplete
- Job Sources tile: Configured if `hasLinkedinAuth` AND at least one search config exists; otherwise Incomplete
- Prompts tile: Configured if at least one prompt has `isCustom: true`; otherwise Incomplete
- Logs tile: no badge — always shows "View logs →"

**Given** the old routes `/profile`, `/prompts`, and `/logs` exist in the router
**When** this story is complete
**Then** those three routes are removed from `router.ts`; any top-nav `Link` references to them are updated or removed

**Given** the TanStack Router config layout route wraps all `/config/*` routes
**When** a user navigates directly to a deep URL like `/config/profile/resume`
**Then** the left nav renders correctly and the correct subpage content is shown

> **Dev note:** Create a pathless layout route `_config` (id only, no path) as a child of `protectedRoute`. Its component is `ConfigLayout` which renders the left nav + `<Outlet />`. All `/config/*` routes are registered as children of `_config`. The `/config` route is the overview page; individual section and subpage routes are stubs (rendering placeholder `<p>Coming soon</p>`) until subsequent stories implement them. Left nav `Link` components use `activeOptions={{ exact: false }}` (or equivalent) so e.g. "Profile" is active when on `/config/profile/resume`. Layout: left nav is `w-52 shrink-0 border-r border-zinc-800`; content area is `flex-1 overflow-auto`. The 4-tile overview grid mirrors the existing config cards pattern (border, rounded-lg, p-4) but each tile adds a small status badge ("Configured" in emerald, "Incomplete" in zinc/amber). Router loaders for the `/config` route should fetch profile, onboarding status, search configs, and prompts in parallel via `Promise.all`. Remove `configRoute` from `router.ts` and replace with the new route tree. Remove `profileRoute`, `promptsRoute`, and `historyRoute` entries entirely. Update the `routeTree` accordingly.

---

## Story 35.2: Profile Section — Overview & Resume Subpage

As a user managing my profile,
I want a Profile section overview and a Resume subpage,
So that I can see my profile configuration status at a glance and edit all my profile details in one place.

**Acceptance Criteria:**

**Given** the user navigates to `/config/profile`
**When** the page loads
**Then** three tiles are rendered: "Resume", "API Keys", "Inbox Mapping", each with a configured/incomplete status badge
- Resume tile: Configured if profile `name` is set (non-null, non-empty); otherwise Incomplete
- API Keys tile: Configured if `hasAnthropicKey` is true; otherwise Incomplete
- Inbox Mapping tile: Configured if `hasImap` is true; otherwise Incomplete

**Given** the user clicks the "Resume" tile on the Profile overview
**When** the navigation completes
**Then** the URL is `/config/profile/resume` and the full profile form renders

**Given** the user is on `/config/profile/resume`
**When** the page loads
**Then** all profile fields are present and editable: Full Name, Email, Phone, Location, LinkedIn URL, GitHub/Portfolio URL (2-column grid), and Summary, Experience, Skills, Education (full-width textareas)

**Given** the user edits fields and clicks Save
**When** the mutation succeeds
**Then** the form exits edit mode, updated values are displayed, and a success toast is shown

**Given** the user clicks Cancel while editing
**When** Cancel is clicked
**Then** the draft is discarded and the form returns to read-only view with original values

**Given** the mutation is in progress
**When** the Save button is in pending state
**Then** a spinner is shown and all form controls are disabled

> **Dev note:** Move the existing `ProfileRoute` component (currently at `/profile`) to a new file `src/client/routes/config/profile-resume.tsx` and register it at path `/config/profile/resume` as a child of `_config`. The Profile overview page (`src/client/routes/config/profile-index.tsx`) is a new 3-tile grid component. Reuse `useOnboardingStatusQuery` and `useProfileQuery` for status badge logic — no new API needed. The loader for `/config/profile` should `ensureQueryData` for both `['profile']` and `['onboarding-status']`. The loader for `/config/profile/resume` should `ensureQueryData` for `['profile']`.

---

## Story 35.3: Profile > API Keys & Inbox Mapping Subpages

As a user managing integrations,
I want dedicated subpages for my Anthropic API key and IMAP inbox settings,
So that I can view, update, and test these credentials independently of the onboarding flow.

**Acceptance Criteria:**

**Given** the user navigates to `/config/profile/api-keys`
**When** the page loads
**Then** a form renders with: a masked input for the Anthropic API key, a "Test" button, and a "Save" button

**Given** the user enters a valid Anthropic API key and clicks Test
**When** the test request completes
**Then** a success indicator is shown ("Key valid") and the Save button is enabled

**Given** the user enters an invalid key and clicks Test
**When** the test request fails
**Then** a failure indicator is shown with the error message and Save remains disabled until a passing test

**Given** the user clicks Save with a valid, tested key
**When** `PUT /api/onboarding/anthropic` succeeds
**Then** the key is saved, the `['onboarding-status']` query is invalidated, and a "API key saved" toast is shown

**Given** an Anthropic API key is already saved (`hasAnthropicKey: true`)
**When** the page loads
**Then** the input shows a placeholder indicating a key is already stored (e.g., "••••••••") and the page shows a "Configured" status chip

**Given** the user navigates to `/config/profile/inbox-mapping`
**When** the page loads
**Then** two sections render: (1) IMAP Connection form (host, port, user, password) with Test and Save actions; (2) Folder Mapping table (inbox folder name → job status mapping)

**Given** the IMAP credentials are already saved (`hasImap: true`)
**When** the inbox-mapping page loads
**Then** the connection section shows a "Connected" status chip

**Given** the user clicks Test on the IMAP form with valid credentials
**When** `PUT /api/onboarding/imap` is called
**Then** a success indicator is shown on test pass; error message on failure

**Given** the Folder Mapping table section is rendered
**When** no mappings are configured yet
**Then** a default set of suggested mappings is shown (e.g., "INBOX/Interviews" → "interview", "INBOX/Offers" → "offer") with the ability to add, edit, and delete rows

**Given** the user adds/edits/deletes a folder mapping and saves
**When** the mutation succeeds
**Then** the updated mappings are persisted and the table reflects the saved state

> **Dev note:** API Keys page (`src/client/routes/config/profile-api-keys.tsx`): lift the Anthropic key UI from `onboarding.tsx` into a standalone component; reuse `PUT /api/onboarding/anthropic`. Inbox Mapping page (`src/client/routes/config/profile-inbox-mapping.tsx`): IMAP connection UI lifted from `onboarding.tsx`; reuse `PUT /api/onboarding/imap`. The Folder Mapping section is **new functionality** — it requires a new DB table (`inbox_folder_mappings`: `id`, `userId`, `folderPath`, `jobStatus`, `createdAt`) with a migration, a new API route (`GET/PUT /api/config/inbox-mappings`), a Zod schema in `src/shared/schemas.ts`, a TanStack Query hook `useInboxMappingsQuery`, and a mutation hook `useInboxMappingsMutation`. The `jobStatus` values should match the existing `jobStatusSchema` enum. No changes to the `OnboardingStatusResponse` are needed. Inline editing pattern for the folder mapping table should match `SearchConfigCard` (edit row in place, save/cancel buttons per row).

---

## Story 35.4: Job Sources Section — Overview, Auth Setup & Searches

As a user managing job discovery sources,
I want a Job Sources section with auth setup and search configuration subpages,
So that I can manage LinkedIn authentication and search targets from a clean, dedicated area.

**Acceptance Criteria:**

**Given** the user navigates to `/config/job-sources`
**When** the page loads
**Then** two tiles render: "Auth Setup" and "Searches", each with a configured/incomplete badge
- Auth Setup tile: Configured if `hasLinkedinAuth` is true; otherwise Incomplete
- Searches tile: Configured if at least one search config exists; otherwise Incomplete

**Given** the user clicks the "Auth Setup" tile
**When** the navigation completes
**Then** the URL is `/config/job-sources/auth-setup`

**Given** the user is on `/config/job-sources/auth-setup`
**When** the page loads
**Then** a list of auth-requiring job sources is shown; LinkedIn is the first entry with its current connected/not-connected status and a "Connect" button

**Given** the user is not connected to LinkedIn
**When** they click Connect
**Then** the LinkedIn browser modal opens (same behavior as the existing `ConnectionsCard`)

**Given** the LinkedIn session is captured successfully
**When** the modal closes
**Then** the LinkedIn entry updates to "Connected" status and `['onboarding-status']` is invalidated

**Given** the user clicks the "Searches" tile
**When** the navigation completes
**Then** the URL is `/config/job-sources/searches`

**Given** the user is on `/config/job-sources/searches`
**When** the page loads
**Then** the full search configuration interface renders: the add-search form and the sortable search configs table (identical to the existing `SearchConfigCard` functionality)

**Given** the user adds, edits, or deletes a search config
**When** mutations succeed
**Then** the table updates and appropriate success/error states are shown

**Given** the old `ConfigRoute` in `config.tsx` contained `ConnectionsCard` and `SearchConfigCard`
**When** this story is complete
**Then** those components are removed from `config.tsx` (which is now superseded by the new route tree)

> **Dev note:** Auth Setup page (`src/client/routes/config/job-sources-auth-setup.tsx`): move `ConnectionsCard` here, rename to `AuthSourcesList` or similar. Structure it as a list to accommodate future sources (e.g., wrap in a `<ul>` with one `<li>` per auth source). Searches page (`src/client/routes/config/job-sources-searches.tsx`): move `SearchConfigCard` here verbatim. Job Sources overview (`src/client/routes/config/job-sources-index.tsx`): 2-tile grid using `useOnboardingStatusQuery` and `useSearchConfigsQuery` for status badges. Loaders: job-sources index should `ensureQueryData` for `['onboarding-status']` and `['search-configs']`; auth-setup route needs `['onboarding-status']`; searches route needs `['search-configs']` and `['source-settings']`.

---

## Story 35.5: Prompts Section — Overview & Per-Flow Subpages

As a user customizing AI prompts,
I want a Prompts section overview and individual subpages per prompt flow,
So that I can see which prompts are customized at a glance and edit each one independently.

**Acceptance Criteria:**

**Given** the user navigates to `/config/prompts`
**When** the page loads
**Then** three tiles render: "Analysis", "Cover Letter", "Resume", each with a configured/incomplete badge
- A tile is "Configured" (shows "Edited" badge in zinc-700) if the corresponding prompt has `isCustom: true`; otherwise "Default"

**Given** the user clicks a prompt tile (e.g., "Analysis")
**When** the navigation completes
**Then** the URL is `/config/prompts/analysis`

**Given** the user is on `/config/prompts/analysis` (or `/config/prompts/cover-letter` or `/config/prompts/resume`)
**When** the page loads
**Then** the single `PromptSection` component for that flow renders with its system prompt (if applicable), user message, edit/save/cancel/reset controls

**Given** the user edits a prompt and saves
**When** `PATCH /api/prompts/:flow` succeeds
**Then** the form exits edit mode, updated content is shown, and the prompt is marked `isCustom: true`

**Given** the user resets a customized prompt to defaults
**When** `DELETE /api/prompts/:flow` succeeds
**Then** the default prompt text is restored and the "Edited" badge disappears

**Given** the Prompts overview tile for a flow shows "Edited"
**When** the user navigates away and returns
**Then** the badge still reflects the current `isCustom` state (not cached stale)

> **Dev note:** Prompts overview (`src/client/routes/config/prompts-index.tsx`): 3-tile grid using `usePromptsQuery`; badge logic derives from `prompt.isCustom`. Each subpage (`src/client/routes/config/prompts-analysis.tsx`, `prompts-cover-letter.tsx`, `prompts-resume.tsx`): each renders the existing `PromptSection` component filtered to the relevant flow. The `PromptSection` component can be extracted from `prompts.tsx` into `src/client/components/config/PromptSection.tsx` and reused across the three subpages. Loaders for all prompts routes: `ensureQueryData` for `['prompts']`. The old `PromptsRoute` in `prompts.tsx` is deleted once this story is done.

---

## Story 35.6: Logs Section — /config/logs

As a user reviewing automation history,
I want the webhook run logs accessible at `/config/logs` via the left nav,
So that logs are part of the Config section with consistent navigation rather than a standalone top-level route.

**Acceptance Criteria:**

**Given** the user clicks "Logs" in the Config left nav
**When** the navigation completes
**Then** the URL is `/config/logs` and the full webhook runs table renders with sorting, pagination, and all columns

**Given** the user is on `/config/logs`
**When** they look at the left nav
**Then** "Logs" is highlighted as the active item

**Given** no webhook runs exist
**When** the page loads
**Then** an empty state message is shown ("No webhook runs yet.")

**Given** runs exist
**When** the table renders
**Then** it shows Run Date, Workflow, Detail, Success, Duration, Input Tokens, Output Tokens, Cost columns with correct sort and pagination behavior (page size 20)

**Given** the old `/logs` standalone route existed in the router
**When** this story is complete
**Then** that route entry is gone (removed in Story 35.1) and the Layout top nav no longer references `/logs` directly

> **Dev note:** Create `src/client/routes/config/logs.tsx` and move the `HistoryRoute` component from `src/client/routes/history.tsx` into it (rename export to `ConfigLogsRoute` or keep as `HistoryRoute` and re-export — your call). Register as `/config/logs` under the `_config` layout route. No API changes. `history.tsx` file can be deleted once moved. The Logs tile on the `/config` overview page links to `/config/logs` directly (no child overview — clicking the Logs nav entry or tile goes straight to the table).

---
