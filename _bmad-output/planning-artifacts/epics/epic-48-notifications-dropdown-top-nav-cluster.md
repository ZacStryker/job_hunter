# Epic 48: Notifications Dropdown & Top-Nav Cluster — One "What Needs My Attention" Signal

## Epic Goal

From anywhere in the app, a user sees a single ambient signal — a dot on a new **Notifications** icon — that opens a Plex-style dropdown walking them through their outstanding setup in priority order (LinkedIn → API key → Profile → Inbox connect → Inbox mapping), then flips to a celebratory **"Start hunting →"** launchpad once everything required is done. The same component re-surfaces a connection that has **broken** (expired LinkedIn, invalid API key, disconnected inbox, deleted Gmail label / missing IMAP folder) as an urgent alert, detected proactively in the background. A new **User** menu (section jump-list + logout) and the existing **Activity** icon complete a three-icon top-right cluster, and attention status echoes into the Config sidenav at the item level. This retires the Epic 35 Configured/Incomplete badges.

**FRs covered:** FR48.1–FR48.17, **FR47.7** (badge retirement, deferred from Epic 47)
**NFRs covered:** NFR48.1–NFR48.3
**UX-DRs covered:** UX-DR48.1–UX-DR48.3

**Out of scope:** Announcements (the dropdown is scoped to setup tasks now; announcements are a later epic — the empty/rest state is designed to host them but none are built here). Run/error/match notifications stay in the **Activity** dropdown (Epic 46) — this feature never shows in-progress run state. No changes to how any setup page actually saves its data (those pages exist; this epic reads their status and links to them).

**Architecture note (decided):** Setup status is a **per-user source of truth** computed server-side from existing signals (`onboarding-status`, profile fields, inbox mappings, search configs) plus background credential health-checks. It is delivered two ways: an initial `GET /api/setup-status` (TanStack Query, **reactively invalidated** whenever a setup mutation succeeds — same `['onboarding-status']`-style invalidation already in the app) **and** live `broken`-transition pushes over **Epic 46's existing SSE stream + per-user registry** (no new poller, no second EventSource). The client `useSetupStatus` hook merges the query snapshot with SSE updates, exactly mirroring `useActivityStream`. All top-bar work lands in `Layout.tsx` beside the Epic 46 Activity control. Per-user isolation is mandatory: status is always derived from `ctx.get('userId')`, never request input; credentials are never returned — only presence/validity.

---

## Story 48.1: Setup-Status Source of Truth, Shared Types & Optional-Task Dismissals

As a developer building the Notifications feature,
I want one server-computed, per-user setup-status contract that classifies every setup task by state and tier and honors dismissals,
So that the dropdown, badge, and sidenav all render from a single source instead of re-deriving status in the UI.

**Acceptance Criteria:**

**Given** the shared schema module `src/shared/schemas.ts`
**When** the setup-status types are defined
**Then** it exports Zod schemas (named `*Schema`) for `setupTaskId` (`'linkedin' | 'apiKey' | 'profile' | 'inboxConnect' | 'inboxMapping'`), `setupTaskState` (`'notStarted' | 'partial' | 'complete' | 'broken'`), `setupTaskTier` (`'required' | 'optional'`), and `setupStatus` (an ordered array of tasks each carrying `id`, `state`, `tier`, a `dependsOn` (nullable `setupTaskId`), a `dismissed` boolean, and for `profile` a `{ filled, total }` progress pair), plus a top-level `ready` boolean — with TypeScript types via `z.infer` and no inline redefinition elsewhere

**Given** a new service `src/server/services/setup-status.ts`
**When** `computeSetupStatus(userId)` runs
**Then** it derives each task's state from existing signals — `linkedin` from `hasLinkedinAuth`; `apiKey` from `hasAnthropicKey`; `profile` from whether **Name, Email, Phone, Location, Summary, Skills** are all present (returning `partial` with `{ filled, total: 6 }` when some but not all are set); `inboxConnect` from inbox connection presence (IMAP or Gmail); `inboxMapping` from whether at least one folder/label mapping exists — scoped to that `userId` only

**Given** the task tiers
**When** status is computed
**Then** `linkedin`, `apiKey`, `profile` are `required`; `inboxConnect`, `inboxMapping` are `optional`; `inboxMapping.dependsOn` is `'inboxConnect'`

**Given** the priority/display order
**When** the `setupStatus` array is returned
**Then** tasks are ordered **linkedin, apiKey, profile, inboxConnect, inboxMapping**

**Given** the `ready` flag
**When** it is computed
**Then** it is `true` only when every `required` task is `complete` **and** every `optional` task is either `complete` or `dismissed` — and `false` if any task is `broken`

**Given** a route `GET /api/setup-status` mounted under the existing `/api/*` auth middleware
**When** an authenticated user requests it
**Then** it returns that user's computed `setupStatus` (+ `ready`) with the standard direct-data shape, deriving the user from `ctx.get('userId')` — never from request input; an unauthenticated request is rejected with `{ error: string }`

**Given** dismissals must persist
**When** `POST /api/setup-status/dismiss` (body: `{ taskId }`) is called for an `optional` task
**Then** the dismissal is persisted per-user and reflected as `dismissed: true` on subsequent status reads; calling it for a `required` task returns a `400 { error }` and changes nothing; a corresponding un-dismiss path restores it

**Given** the service and route
**When** tested with `bun:test` (co-located)
**Then** business-logic tests cover each state/tier/dependency/ready permutation against a test DB, and HTTP contract tests assert response shape + status code and that one user never sees another user's status — and dismissals never appear in any API response as raw credential data

> **Dev note:** Reuse the data behind `useOnboardingStatusQuery` (`hasAnthropicKey`, `hasImap`/Gmail, `hasLinkedinAuth`), `useProfileQuery` fields, and the inbox-mappings + Gmail-mappings sources. Persist dismissals via the existing per-user settings mechanism (e.g., a `setup_dismissals` row set or a key in the feature-settings store) — add a migration only if no suitable store exists. Do NOT bake health/`broken` detection here (that is 48.2); `computeSetupStatus` returns `broken` only when 48.2's health cache marks a credential invalid — until then treat a present credential as `complete`. Profile required-field list must match the Epic 43 schema field names exactly.

---

## Story 48.2: Proactive Credential Health-Checks & Broken-State Events via Activity SSE

As a user who finished setup,
I want the app to notice in the background when a connection breaks,
So that I'm alerted before a run silently fails at 2am instead of discovering it later.

**Acceptance Criteria:**

**Given** a new health-check service
**When** it runs on a background interval (per active user)
**Then** it validates each connected credential — LinkedIn session validity, Anthropic API key validity, inbox connection (IMAP login / Gmail token), and inbox-mapping target existence (Gmail label present / IMAP folder present) — and caches a per-user, per-task `healthy | broken` result with a timestamp, without blocking any request path

**Given** a credential transitions to invalid
**When** the next health-check observes it
**Then** the cached state for that task becomes `broken`, and `computeSetupStatus` (Story 48.1) now reports that task as `broken` and `ready` as `false`

**Given** Epic 46's existing per-user registry + SSE stream
**When** a setup task's health transitions (healthy→broken or broken→healthy)
**Then** a `setup-status` change event is emitted to that user's existing SSE subscribers carrying the updated setup snapshot — reusing the Epic 46 channel, with no second EventSource and no polling endpoint added

**Given** two different users
**When** health-checks and SSE emission run
**Then** a user only ever receives their own setup-status events; a different user's broken credential is never pushed to them (assertable in a contract/unit test)

**Given** a credential is repaired (user reconnects)
**When** the reactive invalidation from the fix (Story 48.1's mutations) and/or the next health-check runs
**Then** the task returns to `complete` and a healthy `setup-status` event is emitted so the badge/dropdown clear promptly

**Given** health-check failures themselves (e.g., the validity probe errors transiently)
**When** a probe cannot conclusively determine validity
**Then** it does not flap the task to `broken` on a single inconclusive probe — only a confirmed-invalid result marks `broken` (guard against false alarms), and `console.error` is used for server-side probe errors

> **Dev note:** Extend the Epic 46 registry/stream rather than adding infrastructure: add a `setup-status` event type alongside the activity `snapshot`/update events, and have the health-check service publish through the same per-user emit path. Interval cadence should be conservative (credentials rarely break); piggyback on existing per-user session/activity lifecycle where possible so checks only run for users with an open stream or recent activity. Validity probes should reuse existing clients (the Anthropic key "Test" path already exists in the API-key page; LinkedIn/inbox validation reuse their existing connect/test code). No credential values in logs or responses.

---

## Story 48.3: `useSetupStatus` Client Hook

As the front-end,
I want a hook that maintains live setup status from the query snapshot plus SSE updates,
So that the icon badge, dropdown, and sidenav all read one push-driven source with no duplicated state.

**Acceptance Criteria:**

**Given** a new hook `src/client/hooks/useSetupStatus.ts`
**When** it mounts
**Then** it loads the initial snapshot from `GET /api/setup-status` via TanStack Query (key `['setup-status']`) and subscribes to `setup-status` events on the **existing** Epic 46 EventSource, exposing `{ tasks, ready, badge }` where `badge` is `'none' | 'dot' | 'alert'`

**Given** a setup mutation succeeds anywhere in the app (LinkedIn connect, API key save, profile save, inbox connect/map, dismiss)
**When** it settles
**Then** `['setup-status']` is invalidated and the hook reflects the new status — no stale phantom tasks (reactive update path)

**Given** a `setup-status` SSE event arrives (a background broken/healthy transition)
**When** it is received
**Then** its data is validated against the shared `setupStatus` schema and the hook's state updates accordingly — status lives only here (no duplicate copy in component `useState`, no direct `fetch`)

**Given** the derived `badge` value
**When** computed
**Then** it is `'alert'` if any task is `broken` **or** any `required` task is incomplete; `'dot'` if all required are complete but an optional task is pending (not dismissed); `'none'` if `ready` is true

**Given** the underlying EventSource errors/reconnects (handled by the Epic 46 hook)
**When** connection is restored
**Then** `useSetupStatus` resumes from the latest query snapshot + resumed events without leaking subscribers on unmount

> **Dev note:** Do not open a new `EventSource` — consume the Epic 46 stream (either via a shared context the activity hook already provides, or by registering an additional event listener on the same connection). Keep `badge` derivation here so both the icon (48.4) and any other consumer share one rule. Query key `['setup-status']` is added to the app's invalidation calls in the existing setup mutations (api-key save, profile save, LinkedIn connect, inbox connect/map) — alongside their current `['onboarding-status']` invalidation.

---

## Story 48.4: Notifications Icon & Dropdown

As a user anywhere in the app,
I want a Notifications icon that signals when something needs me and opens a prioritized setup walkthrough,
So that I always know my outstanding setup (or that I'm ready) and can fix each item in one click.

**Acceptance Criteria:**

**Given** the top bar in `Layout.tsx`
**When** it renders
**Then** a **Notifications** icon (bell-style glyph) appears in the top-right cluster, styled to match the existing Activity control

**Given** the `badge` from `useSetupStatus`
**When** the icon renders
**Then** it shows a **dot, never a number** — a solid/colored dot for `'alert'` (broken or required-incomplete), a faint dot for `'dot'` (optional-only pending), and no badge for `'none'`; on the transition to fully ready it briefly shows a ✓ then rests with no badge

**Given** the user clicks the icon
**When** the dropdown opens (shadcn dropdown/popover, dark low-chrome panel anchored under the icon, matching the Activity dropdown)
**Then** incomplete tasks render as rows in priority order (linkedin, apiKey, profile, inboxConnect, inboxMapping), each as `[icon] Label … Verb →` with the whole row deep-linking to its fix page — verbs: LinkedIn→**Connect** (`/config/connections/linkedin`), API key→**Add** (`/config/connections/api-key`), Profile→**Complete** (`/config/profile`), Inbox→**Connect** (`/config/connections/inbox`), Mapping→**Map** (`/config/connections/inbox`)

**Given** a task is `broken`
**When** its row renders
**Then** it uses the **alert** style (amber/red weight) with a **Reconnect/Fix** verb, visually distinct from neutral setup rows

**Given** the dependent task `inboxMapping` whose `dependsOn` (`inboxConnect`) is not yet complete
**When** the dropdown renders
**Then** the mapping row appears **grayed/disabled** (not hidden) with a tooltip "Connect your inbox first" and is not clickable

**Given** first-time setup (no `broken` tasks, required tasks pending)
**When** the dropdown renders
**Then** a slim **progress meter** shows required completion (e.g. `Setup 2/3 required`); the meter is absent when the only items are `broken` alerts

**Given** an `optional` task row
**When** it renders
**Then** it carries a **dismiss** affordance (✕); dismissing it calls the dismiss endpoint and removes it from the list; `required` rows never show a dismiss affordance

**Given** all `required` tasks are complete but an optional task is still pending (not dismissed)
**When** the dropdown renders
**Then** it still shows the pending optional row(s) with connect/dismiss — the celebratory ready-state does **not** appear yet (optionals must be resolved or dismissed first)

**Given** `ready` is true (all required complete; all optional complete or dismissed)
**When** the dropdown renders
**Then** it shows the terminal launchpad: **"Start hunting →"** which triggers a Discovery run (the existing discovery trigger) and then the panel rests on a quiet "✓ All set" state

**Given** the dropdown's data source
**When** it renders
**Then** it reads exclusively from `useSetupStatus` (no page-local re-derivation), so it is correct from any route

> **Dev note:** New component `src/client/components/shared/NotificationsDropdown.tsx` (or `components/notifications/`). Deep-link targets are the **Epic 47** Connections/Profile paths — this epic depends on Epic 47 having moved them. The "Start hunting" action reuses the existing Discovery trigger used elsewhere (same call the Discover button makes). Match the Activity dropdown's panel styling/anchoring for cohesion. Row styles (setup / alert / locked / dismissible) are the UX-DR48.3 visual weights.

---

## Story 48.5: User Menu & Three-Icon Top-Right Cluster

As a user,
I want a User menu that jumps me to any Config section and lets me log out,
So that I have one calm fast-travel control, completing the Activity · Notifications · User icon trio.

**Acceptance Criteria:**

**Given** the top bar in `Layout.tsx`
**When** it renders
**Then** the top-right shows exactly three icons in order **Activity · Notifications · User** (Activity from Epic 46, Notifications from Story 48.4, User new), consistently styled

**Given** the User icon (avatar/initials)
**When** the user clicks it
**Then** a dropdown opens with a header (avatar + name/email), then a section jump-list — **Profile, Sources, Connections, Prompts, Logs** — each a `Link` to its Config section, then a divider, then **Log out**

**Given** a user-menu jump-list item
**When** clicked
**Then** it navigates to the corresponding Config section (using the Epic 47 paths) and closes the menu; **Log out** performs the existing logout action

**Given** the User menu
**When** it renders in any setup state (including broken connections / pending setup)
**Then** it shows **no status dots or badges** on any row — the user menu stays a calm jump-list; attention signaling lives only on the Notifications icon and (per Story 48.6) the Config sidenav

> **Dev note:** New `src/client/components/shared/UserMenu.tsx`. Reuse the existing logout mutation/action currently behind the standalone logout button (which this cluster replaces). Jump-list targets use the final Epic 47 routes (`/config/profile`, `/config/sources`, `/config/connections`, `/config/prompts`, `/config/system/logs`). Avatar can be initials from the profile name/email — no new asset pipeline. Ensure the three controls share alignment/spacing with the existing header.

---

## Story 48.6: Config Sidenav Status Propagation & Configured/Incomplete Badge Retirement

As a user fixing my setup inside Config,
I want attention status to show contextually next to the exact nav item that needs it,
So that I can see what's wrong while navigating — and the old Configured/Incomplete badges, now redundant, are removed.

**Acceptance Criteria:**

**Given** the Config sidenav (`ConfigLayout`) and `useSetupStatus`
**When** a task is `broken` or an incomplete required task maps to a nav item
**Then** an item-level status dot/⚠ appears next to that specific child link (e.g., LinkedIn, Inbox, API Key under Connections; Candidate Info under Profile)

**Given** a section contains a child item needing attention
**When** the sidenav renders
**Then** the **parent section header** also shows a roll-up dot (e.g., `Connections ⚠`) so a scrolled/scanned sidenav still signals where the issue is

**Given** the user menu (Story 48.5)
**When** any sidenav dots are showing
**Then** the user menu still shows none — propagation is sidenav-only, never the user menu

**Given** all setup is healthy and complete
**When** the sidenav renders
**Then** no status dots appear anywhere in it

**Given** the Epic 35 Configured/Incomplete status badges on Config overview tiles/section pages
**When** this story is complete
**Then** those badges are **removed** (FR47.7) — the Notifications dropdown + sidenav dots are now the single status surface, with no remaining Configured/Incomplete badge in the Config UI

**Given** the removal of badges
**When** the affected overview/section pages render
**Then** they still navigate correctly (tiles/links intact) — only the status-badge element is gone, with no stale `Configured`/`Incomplete` strings left in the codebase

> **Dev note:** Map each `setupTaskId` to its sidenav item and parent section for dot placement in `layout.tsx`. Badge retirement removes the badge logic added in Epic 35 Stories 35.1–35.5 (the `Configured`/`Incomplete`/`Edited` tile badges driven by `useOnboardingStatusQuery`); leave the tiles/links themselves. Grep for the badge strings/components to ensure none remain. This is the final story — after it, the Configured/Incomplete model is fully replaced by Epic 48.

---
