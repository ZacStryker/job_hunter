---
baseline_commit: d2d007b14a16e36bb8d4425a9347e5ae9796d6f2
---

# Story 47.1: Frequency-Ordered Grouped Sidenav & "Sources" Rename

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user in the Config section,
I want the left nav grouped and ordered by how often I use each area,
so that the things I touch most are at the top and the section feels cohesive rather than scattered.

## Acceptance Criteria

1. **Given** the `ConfigLayout` sidenav, **When** it renders, **Then** it shows grouped section headers in this exact top-to-bottom order: **Profile, Sources, Connections, Prompts, System** — each header visually distinct from its child links (Plex-style grouping, matching existing zinc styling).
2. **Given** the section formerly labelled "Job Sources", **When** the sidenav renders, **Then** its header reads **"Sources"** and it contains only the **Searches** and **Blacklist** child links.
3. **Given** the user is on any `/config/*` page that belongs to a section, **When** they look at the sidenav, **Then** the owning section is shown as active (parent stays highlighted on child routes via `activeOptions`), and the active child link is also distinguished.
4. **Given** the reordered sidenav, **When** a user clicks any section or child link, **Then** navigation works exactly as before this story (no dead links) — pages that have not yet moved still resolve at their current paths.
5. **Given** the existing Configured/Incomplete badges on section overview tiles, **When** this story is complete, **Then** those badges still render and function unchanged (their removal is deferred to Epic 48).

## Tasks / Subtasks

- [x] **Task 1: Introduce ordered, grouped sidenav data structure** (AC: #1, #2)
  - [x] In `src/client/routes/config/layout.tsx`, replace the current flat sequence of header/child `<Link>`s with a single ordered `SECTIONS` array of `{ label, to?, links: [{ label, to, requiresEmail? }] }`. Section order is **fixed by array position** (Profile → Sources → Connections → Prompts → System) — never alphabetical, never derived.
  - [x] Map the five groups to their **current** targets (see "Exact target sidenav for 47.1" in Dev Notes). Do **not** invent new paths — pages move in 47.2/47.3.
  - [x] Rename the group label `"Job Sources"` → `"Sources"` (label change only; the `to="/config/job-sources"` target stays for now).
- [x] **Task 2: Add the Blacklist child link to Sources** (AC: #2, #4)
  - [x] Add a child link `Blacklist → /config/job-sources/blacklist`. This route is **already registered** in `src/client/lib/router.ts` (`configJobSourcesBlacklistRoute`) but was never linked in the sidenav — this story surfaces it. Place it after Searches.
- [x] **Task 3: Group-aware active highlighting** (AC: #3)
  - [x] Section headers that have an existing index route (**Profile** `/config/profile`, **Sources** `/config/job-sources`, **Prompts** `/config/prompts`) render as `<Link>` and stay highlighted on their child routes by using fuzzy `activeOptions` (drop the current `activeOptions={{ exact: true }}` on these headers; default fuzzy/prefix matching highlights the parent on child routes).
  - [x] **Connections** and **System** headers have **no index route yet** (those `/config/connections` + `/config/system` indexes are created in 47.2/47.3). Render them as **non-interactive group labels** (a `<div>`/`<span>`, not a `<Link>`) styled identically to the other headers, until their landing routes exist.
  - [x] Keep each **child** `<Link>` using `activeOptions={{ exact: true }}` so the active child is distinguished (unchanged from today).
- [x] **Task 4: Preserve existing behaviors** (AC: #4, #5)
  - [x] Keep the `useFeatureSettingsQuery()` email-features gate on the **Inbox** child link (currently "Inbox Mapping" under Profile, now under Connections) — render it only when `emailFeatures` is true.
  - [x] Touch **no other file**. The Configured/Incomplete badges live in the overview/index page components (`overview.tsx`, `profile-index.tsx`, `job-sources-index.tsx`), not in `layout.tsx`, so they remain functional automatically.
- [x] **Task 5: Verify** (AC: #1–#5)
  - [x] `bunx tsc --noEmit` introduces **zero new** type errors over the repo baseline (~88 pre-existing). _Verified: exactly 88 total errors, zero referencing `config/layout.tsx`. `bun run build` also succeeds (exit 0)._
  - [ ] Manual walkthrough (`bun run dev`): headers appear in the exact order; "Sources" shows Searches + Blacklist; every link navigates to a live page (no dead links / no 404s); the parent section and active child highlight correctly; section overview tiles still show Configured/Incomplete badges. _OUTSTANDING — human-in-the-loop interactive browser check (no DOM harness in repo; same convention as 46.6)._

## Dev Notes

### Single file to edit
**`src/client/routes/config/layout.tsx`** — and nothing else. No API, loader, router, or DB changes. The epic explicitly scopes 47.1 to "label + order + grouping" in this one file. Page moves, redirects, and breadcrumb/top-nav link updates are 47.2 (Connections) and 47.3 (Sources/System + Profile cleanup).

### Current state of the file (what exists today)
The sidenav (`ConfigLayout`) is a flat list of `<Link>`s. Each **section header** is itself a `<Link>` to a section index, styled `text-xs font-semibold uppercase tracking-wide`, with `activeOptions={{ exact: true }}`. Child links share three module-level constants:
- `childLinkClass = 'block pl-7 py-1.5 text-xs rounded transition-colors'`
- `childActiveProps = { className: 'text-zinc-100 bg-zinc-800 font-medium' }`
- `childInactiveProps = { className: 'text-zinc-500 hover:text-zinc-300' }`

Header active/inactive styling currently: `activeProps={{ className: 'text-zinc-100 bg-zinc-800' }}`, `inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}`.

Today's groups: **Profile** (Candidate Info, API Keys, Inbox Mapping [email-gated], Privacy Policy) → **Job Sources** (Auth Setup, Searches) → **Prompts** (Analyze Jobs, Generate Cover Letter, Generate Resume) → **Logs**. Reuse the existing zinc class strings verbatim for visual consistency (AC1 says "matching existing zinc styling").

### Exact target sidenav for 47.1 (current targets — pages have NOT moved)
Build the ordered array to produce exactly this. Keep every `to=` as listed; these are today's live paths, confirmed registered in `src/client/lib/router.ts`:

| Group (order) | Header `to` | Child label | Child `to` | Notes |
|---|---|---|---|---|
| **Profile** | `/config/profile` (Link, fuzzy) | Candidate Info | `/config/profile/resume` | |
| **Sources** | `/config/job-sources` (Link, fuzzy) | Searches | `/config/job-sources/searches` | renamed from "Job Sources" |
| | | Blacklist | `/config/job-sources/blacklist` | **newly linked** (route already exists) |
| **Connections** | — (label only) | LinkedIn | `/config/job-sources/auth-setup` | currently labelled "Auth Setup" |
| | | Inbox | `/config/profile/inbox-mapping` | **email-gated** (`emailFeatures`) |
| | | API Key | `/config/profile/api-keys` | currently labelled "API Keys" |
| **Prompts** | `/config/prompts` (Link, fuzzy) | Analyze Jobs | `/config/prompts/analysis` | |
| | | Generate Cover Letter | `/config/prompts/cover-letter` | |
| | | Generate Resume | `/config/prompts/resume` | |
| **System** | — (label only) | Logs | `/config/logs` | |
| | | Privacy | `/privacy-policy` | top-level route, not under `/config` |

> **Child label naming:** The new group structure already disambiguates these pages, so this story uses the final, group-coherent child labels — **LinkedIn / Inbox / API Key** (Connections) and **Privacy** (System) — instead of today's "Auth Setup / Inbox Mapping / API Keys / Privacy Policy". This is pure display text in `layout.tsx`; it does not change any route, loader, or page title and stays consistent with how 47.2 surfaces these areas. (See Open Question Q1 if you'd rather keep the literal current labels — both satisfy the ACs.)

### Why Connections & System headers are labels, not Links (in 47.1 only)
The `/config/connections` and `/config/system` index routes do **not exist yet** — they are registered in stories 47.2 and 47.3. A header `<Link to="/config/connections">` in 47.1 would be a dead link (violates AC4). So in 47.1 those two headers are **non-interactive labels**. When 47.2/47.3 land the index routes and move the child pages under the new prefixes, those headers become `<Link>`s with fuzzy `activeOptions` like the others — "with 47.2 + 47.3 complete the sidenav groups now point at their final homes" (epic dev note). Style the labels identically to the link headers so the grouping reads uniformly.

### Active-highlight: known interim caveat (acceptable — do not over-engineer)
The epic mandates the `activeOptions` mechanism (architecture note: "Sidenav `Link`s use `activeOptions` so a parent section stays active on its child routes"). For **Profile / Sources / Prompts** this works cleanly because their children share the header's path prefix.

Because the Connections/System children still live under the **old** `/config/profile/*` and `/config/job-sources/*` paths in 47.1, parent-highlight precision is imperfect in the interim (e.g., visiting LinkedIn at `/config/job-sources/auth-setup` will prefix-match the **Sources** header). This is **expected interim behavior** and fully resolves in 47.2/47.3 once the pages move under their own prefixes. **Do not** add bespoke `useMatchRoute`/location-computation logic to chase perfect interim highlighting — the epic chose `activeOptions` and the scope here is order/grouping/label. The active child link itself (exact match) always highlights correctly, satisfying the second half of AC3.

### Don't break / preserve list
- **Email-features gate:** `useFeatureSettingsQuery()` → `emailFeatures` must continue to hide the Inbox link when false (regression risk if you drop it while restructuring).
- **All current `to=` targets unchanged** — this is the core invariant of 47.1 (AC4). Moving paths is 47.2/47.3's job; doing it here breaks redirects/onboarding deep-links that haven't been added yet.
- **Badges:** Configured/Incomplete badges are rendered by the section index/overview page components, not the sidenav — untouched here, so AC5 holds with no action. Do not remove or alter them.
- **No new imports beyond what's needed** — the existing imports are `Outlet, Link` from `@tanstack/react-router`, `ConfigBreadcrumb`, and `useFeatureSettingsQuery`. You should not need to add any (non-link labels are plain JSX).

### Project Structure Notes
- File is a React route component: `PascalCase` export `ConfigLayout`, file is `layout.tsx` (kebab/lowercase route file — matches the existing convention in `src/client/routes/config/`).
- This is purely client UI. Per project-context: server state lives in TanStack Query (the `useFeatureSettingsQuery` hook already does this — do not duplicate into `useState`). UI state only.
- No shared-schema or type changes (`src/shared/schemas.ts` untouched).

### Testing
There is **no DOM/component test harness in this repo** (confirmed: no `*.test.*` under `src/client/routes/config/`, consistent with Epic 46's stories which unit-tested only exported pure functions and left JSX to manual walkthrough). This story adds no exported pure logic worth unit-testing — it is presentational route/link wiring. **Do not** introduce a test library or render harness for this. Verification is:
1. `bunx tsc --noEmit` — zero new errors vs. baseline.
2. `bun run dev` manual walkthrough per Task 5 (the human-in-the-loop check; this is the OUTSTANDING item the reviewer will expect, same pattern as 46.6).

### Previous Story Intelligence (Epic 46 patterns that carry over)
- Repo baseline at last review: **~88 pre-existing `tsc` errors / ~40 env-dependent suite failures**; the acceptance bar is **zero new** regressions, not zero absolute.
- UI-only stories in this codebase are verified by manual `bun run dev` walkthrough, not automated DOM tests (46.6 explicitly: "no DOM harness in repo … DO NOT add a test lib or render the component").
- Reuse existing shadcn/zinc styling rather than introducing new chrome (low-chrome dark zinc-900/zinc-800 panels) — matches AC1's "matching existing zinc styling".

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-47-config-ia-restructure.md#Story 47.1] — ACs, dev note, "edit `layout.tsx` only", ordered-array guidance, "Sources" rename, keep `to=` intact.
- [Source: _bmad-output/planning-artifacts/epics/epic-47-config-ia-restructure.md (Architecture note)] — builds on Epic 35 `_config` layout; `activeOptions` for parent-active; hooks reused unchanged; redirects/page-moves are 47.2/47.3.
- [Source: src/client/routes/config/layout.tsx] — current flat sidenav, header/child styling constants, `emailFeatures` gate.
- [Source: src/client/lib/router.ts:285] — `configJobSourcesBlacklistRoute` at `/config/job-sources/blacklist` already registered (just unlinked); index routes exist for `/config/profile`, `/config/job-sources`, `/config/prompts` but NOT `/config/connections` or `/config/system`.
- [Source: _bmad-output/project-context.md#Framework-Specific Rules (TanStack Router/React)] — two app routes only + config layout overlay; server state in TanStack Query only; never duplicate to `useState`.

### Open Questions (for the author/PO — non-blocking; defaults chosen above)
- **Q1 — Child link labels:** This story relabels the moved children to their final group-coherent names (LinkedIn / Inbox / API Key / Privacy). The epic dev note literally scopes 47.1 to "label + order + grouping" and only spells out the **group** label rename ("Job Sources" → "Sources"). If you prefer to keep the literal current child labels ("Auth Setup / Inbox Mapping / API Keys / Privacy Policy") until 47.2/47.3, that also satisfies every AC — flag it and the dev will keep them verbatim. **Default: use the final names.**

### Review Findings

_Code review 2026-06-29 (Blind Hunter · Edge Case Hunter · Acceptance Auditor). Acceptance Auditor: all 5 ACs PASS. 0 decision-needed, 0 patches, 3 deferred, 9 dismissed as verified false positives / spec-sanctioned._

- [x] [Review][Defer] Cross-section interim parent-header highlighting [layout.tsx:67] — deferred, expected interim behavior. With `exact:true` dropped (per AC3), the **Sources** header (`/config/job-sources`) prefix-matches Connections' LinkedIn child (`/config/job-sources/auth-setup`), and the **Profile** header (`/config/profile`) prefix-matches Connections' Inbox/API-Key children (`/config/profile/*`). Explicitly documented in Dev Notes "known interim caveat" — resolves in 47.2/47.3 when pages move under `/config/connections` + `/config/system`. Spec says do NOT add bespoke `useMatchRoute` logic.
- [x] [Review][Defer] `emailFeatures` gate collapses loading/error into "hidden" [layout.tsx:60] — deferred, pre-existing. On initial feature-settings load or a transient fetch failure (loader `.catch(()=>{})` in `router.ts:63`), `featureSettings` is `undefined` → `emailFeatures=false` → Inbox link never renders that session. Same gate + same hook existed before this diff; `router.ts` is outside 47.1's single-file scope.
- [x] [Review][Defer] Connections/System headers are inert `<div>`s lacking heading semantics/focusability (a11y) [layout.tsx:75] — deferred. No `role="heading"`/`aria-level` or keyboard focus on the two label-only headers. They become `<Link>`s in 47.2/47.3 once their index routes exist; minor and bounded to the interim.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- `bunx tsc --noEmit` → 88 total `error TS` lines (matches ~88 baseline); **0** reference `src/client/routes/config/layout.tsx`.
- `bun run build` → exit 0 (`✓ built in 744ms`, 2722 modules transformed). Pre-existing chunk-size warning only.

### Completion Notes List

- Replaced the flat header/child `<Link>` sequence in `layout.tsx` with a single ordered `SECTIONS` array (`{ label, to?, links: [{ label, to, requiresEmail? }] }`), order fixed by array position: **Profile → Sources → Connections → Prompts → System** (AC1).
- Renamed group label `"Job Sources"` → **"Sources"**; kept `to="/config/job-sources"`. Sources now lists **Searches** + the newly surfaced **Blacklist** (`/config/job-sources/blacklist`, route already registered, line 366 of `router.ts`) (AC2).
- Link-headers (Profile, Sources, Prompts) dropped `activeOptions={{ exact: true }}` → default fuzzy/prefix matching keeps the parent highlighted on child routes. **Connections** and **System** render as non-interactive `<div>` labels (no index route yet — created in 47.2/47.3) styled identically to link-headers. Child links keep `activeOptions={{ exact: true }}` (AC3).
- All `to=` targets are today's live paths — no path moved (AC4). Used final group-coherent child display labels per Dev Notes Q1 default (LinkedIn / Inbox / API Key / Privacy).
- Preserved the `useFeatureSettingsQuery()` → `emailFeatures` gate on the **Inbox** child (renders only when true) (AC4). No other file touched, so Configured/Incomplete badges in the index/overview components are untouched and still function (AC5).
- Typed the `to` fields as `LinkProps['to']` (added a `type`-only import) so TanStack Router's strict literal-union typing is satisfied with zero new tsc errors — verified no path-param (`$`) routes exist, so `Link` does not demand a params object.
- **Outstanding (human-in-the-loop):** interactive `bun run dev` browser walkthrough of Task 5 — no DOM/component test harness exists in this repo (same as Epic 46 UI stories). Type-check + production build pass; visual order/highlight/no-dead-links confirmation is left for the reviewer.

### File List

- `job-hunt-dashboard/src/client/routes/config/layout.tsx` (modified)

## Change Log

| Date | Change |
|---|---|
| 2026-06-29 | Implemented 47.1 — ordered grouped sidenav (`SECTIONS` array), "Job Sources" → "Sources" rename, surfaced Blacklist link, Connections/System as non-link labels, fuzzy parent-active on Profile/Sources/Prompts. tsc zero-new (88 baseline) + `bun run build` pass. Status → review. |
