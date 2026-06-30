# Epic 47: Config IA Restructure — Frequency-Ordered, Cohesive Navigation

## Epic Goal

A user navigating the Config section finds a calm, deliberately ordered structure that reflects how often they actually touch each area — **Profile → Sources → Connections → Prompts → System** — instead of the disjointed feature-area grouping where connections were scattered (LinkedIn under Job Sources, Inbox + API key under Profile). LinkedIn auth, Inbox connect/mapping, and the Anthropic API key are consolidated into a single **Connections** home; "Job Sources" is renamed **Sources** (Searches + Blacklist only); Logs + Privacy move under **System**; and Profile becomes a pure settings page. All moved pages keep working via redirects so deep links never break.

**FRs covered:** FR47.1–FR47.6
**UX-DRs covered:** UX-DR47.1–UX-DR47.2

**Out of scope:** No change to the *content* or behavior of any moved page (the LinkedIn connect flow, API-key form, inbox mapping editor, search/blacklist editors, logs table, profile form all behave exactly as before — only their location in the nav and their route path change). The Configured/Incomplete status badges are **not** removed here — they remain functional through this restructure and are retired in Epic 48's final story when the Notifications dropdown replaces them (no status vacuum). No top-nav icon-cluster or Notifications work (Epic 48).

**Architecture note (decided):** This builds on Epic 35's pathless `_config` layout route + `ConfigLayout`. Section reordering and grouping happen in the existing `ConfigLayout` sidenav (`src/client/routes/config/layout.tsx`). Page moves are route re-registrations under `_config` with the component files relocated; every old path gets a redirect (TanStack Router `beforeLoad` → `throw redirect({ to: ... })`) so bookmarks, the onboarding deep-links, and any `Link` references resolve. Sidenav `Link`s use `activeOptions` so a parent section stays active on its child routes. Existing query hooks (`useOnboardingStatusQuery`, `useProfileQuery`, `useSearchConfigsQuery`, prompts/blacklist/mappings hooks) are reused unchanged — this epic moves UI, it does not touch the API or DB.

---

## Story 47.1: Frequency-Ordered Grouped Sidenav & "Sources" Rename

As a user in the Config section,
I want the left nav grouped and ordered by how often I use each area,
So that the things I touch most are at the top and the section feels cohesive rather than scattered.

**Acceptance Criteria:**

**Given** the `ConfigLayout` sidenav
**When** it renders
**Then** it shows grouped section headers in this exact top-to-bottom order: **Profile, Sources, Connections, Prompts, System** — each header visually distinct from its child links (Plex-style grouping, matching existing zinc styling)

**Given** the section formerly labelled "Job Sources"
**When** the sidenav renders
**Then** its header reads **"Sources"** and it contains only the Searches and Blacklist child links

**Given** the user is on any `/config/*` page that belongs to a section
**When** they look at the sidenav
**Then** the owning section is shown as active (parent stays highlighted on child routes via `activeOptions`), and the active child link is also distinguished

**Given** the reordered sidenav
**When** a user clicks any section or child link
**Then** navigation works exactly as before this story (no dead links) — pages that have not yet moved still resolve at their current paths

**Given** the existing Configured/Incomplete badges on section overview tiles
**When** this story is complete
**Then** those badges still render and function unchanged (their removal is deferred to Epic 48)

> **Dev note:** Edit `src/client/routes/config/layout.tsx` only. Introduce grouped rendering (a small ordered array of `{ section, links[] }`) rather than per-story rerouting — section order is fixed in that array, not alphabetical. Rename the "Job Sources" group label to "Sources" in this file (the routes themselves are renamed in 47.3; this story is label + order + grouping). Keep all current `to=` targets intact so nothing breaks before the page-move stories land. No API/loader changes.

---

## Story 47.2: Connections Section — Consolidate LinkedIn, Inbox & API Key

As a user setting up my integrations,
I want LinkedIn auth, my inbox connection/mapping, and my Anthropic API key in one "Connections" place,
So that all my set-once external hookups live together instead of being split across Profile and Job Sources.

**Acceptance Criteria:**

**Given** the new Connections section
**When** the user navigates to `/config/connections`
**Then** it renders a section landing listing its three areas — **LinkedIn**, **Inbox**, **API Key** — each linking to its subpage

**Given** the LinkedIn auth page (formerly `/config/job-sources/auth-setup`)
**When** the user navigates to `/config/connections/linkedin`
**Then** the existing LinkedIn connect/status UI renders and behaves identically (same `AuthSourcesList`/`ConnectionsCard` behavior, same `['onboarding-status']` invalidation)

**Given** the inbox page (formerly `/config/profile/inbox-mapping`)
**When** the user navigates to `/config/connections/inbox`
**Then** the existing inbox connection form + folder/label mapping editor renders and behaves identically (IMAP folder mapping and Gmail label mapping both supported as today)

**Given** the API key page (formerly `/config/profile/api-keys`)
**When** the user navigates to `/config/connections/api-key`
**Then** the existing masked Anthropic API key form (with Test/Save) renders and behaves identically

**Given** the old paths `/config/job-sources/auth-setup`, `/config/profile/inbox-mapping`, `/config/profile/api-keys`
**When** a user navigates to any of them (bookmark, onboarding link, or stale `Link`)
**Then** they are redirected to the corresponding new `/config/connections/*` path

**Given** any internal `Link`/navigation reference to the old paths (sidenav, overview tiles, onboarding, breadcrumbs)
**When** this story is complete
**Then** every reference points to the new `/config/connections/*` path — no reference targets a redirect

> **Dev note:** Relocate the component files (`job-sources-auth-setup.tsx` → `connections-linkedin.tsx`, `profile-inbox-mapping.tsx` → `connections-inbox.tsx`, `profile-api-keys.tsx` → `connections-api-key.tsx`) under `src/client/routes/config/`; register the three new routes + a `/config/connections` index under `_config`. Add redirect routes at the three old paths using `beforeLoad: () => { throw redirect({ to: '/config/connections/...' }) }`. Reuse loaders verbatim (`['onboarding-status']`, mapping/api-key keys). Update `ConfigBreadcrumb` segment map. No API/DB changes.

---

## Story 47.3: Sources & System Sections — Reroute Searches/Blacklist & Logs/Privacy; Profile as Pure Settings

As a user,
I want Searches/Blacklist under "Sources", Logs/Privacy under "System", and Profile reduced to just my candidate info,
So that each section means one clear thing and Profile is a focused settings page, not a catch-all.

**Acceptance Criteria:**

**Given** the Sources section
**When** the user navigates to `/config/sources/searches` and `/config/sources/blacklist`
**Then** the existing search-config editor and blacklist editor render and behave identically to their `/config/job-sources/*` versions

**Given** the System section
**When** the user navigates to `/config/system/logs` and `/config/system/privacy`
**Then** the existing webhook-runs Logs table and the Privacy page render and behave identically

**Given** the Profile section after consolidation
**When** the user navigates to `/config/profile`
**Then** it shows the Candidate Info / Resume settings only (API Key and Inbox Mapping have moved to Connections in 47.2) — Profile is a single pure settings page with no status-dashboard behavior

**Given** the old paths `/config/job-sources/searches`, `/config/job-sources/blacklist`, `/config/logs`, and the old Privacy path
**When** a user navigates to any of them
**Then** they are redirected to the corresponding `/config/sources/*` or `/config/system/*` path

**Given** any internal reference to the old Sources/Logs/Privacy paths (sidenav, tiles, top-nav, onboarding, breadcrumbs)
**When** this story is complete
**Then** every reference points to the new path — no reference targets a redirect

> **Dev note:** Relocate `job-sources-searches.tsx`/`job-sources-blacklist.tsx` → `sources-*.tsx`; move `logs.tsx` → `system-logs.tsx` and the privacy page under `/config/system/privacy`. Register new routes under `_config` and add `beforeLoad` redirects at all old paths. Confirm `/config/job-sources` parent and `/config/profile` overview no longer reference the moved children. Update `ConfigBreadcrumb` and the Layout top-nav `Link` (Logs was previously linked from the top bar). No API/DB changes — purely route + link relocation. With 47.2 + 47.3 complete the sidenav groups in 47.1 now point at their final homes.

---
