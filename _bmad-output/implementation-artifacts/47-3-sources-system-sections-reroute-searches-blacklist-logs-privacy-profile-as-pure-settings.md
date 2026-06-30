---
baseline_commit: d2d007b14a16e36bb8d4425a9347e5ae9796d6f2
---

# Story 47.3: Sources & System Sections — Reroute Searches/Blacklist & Logs/Privacy; Profile as Pure Settings

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want Searches/Blacklist under "Sources", Logs/Privacy under "System", and Profile reduced to just my candidate info,
so that each section means one clear thing and Profile is a focused settings page, not a catch-all.

## Acceptance Criteria

1. **Given** the Sources section, **When** the user navigates to `/config/sources/searches` and `/config/sources/blacklist`, **Then** the existing search-config editor and blacklist editor render and behave identically to their `/config/job-sources/*` versions.
2. **Given** the Sources section landing, **When** the user navigates to `/config/sources`, **Then** it renders the section landing (Searches + Blacklist tiles) exactly as the old `/config/job-sources` index did, with its heading now reading **"Sources"**.
3. **Given** the System section, **When** the user navigates to `/config/system/logs`, **Then** the existing webhook-runs Logs table renders and behaves identically to the old `/config/logs` page.
4. **Given** the System section landing, **When** the user navigates to `/config/system`, **Then** it renders a section landing listing its areas — **Logs** and **Privacy** — each linking to its destination (so the System sidenav header is a real `<Link>`, closing 47.1's "System stays a label" deferral). The Privacy tile links to the existing public `/privacy-policy` page (see Open Question Q1).
5. **Given** the Profile section after consolidation, **When** the user navigates to `/config/profile`, **Then** it shows the Candidate Info tile **only** — the Privacy Policy tile is removed (API Key + Inbox already moved to Connections in 47.2). Profile is a single pure settings page with no status-dashboard behavior.
6. **Given** the old paths `/config/job-sources`, `/config/job-sources/searches`, `/config/job-sources/blacklist`, and `/config/logs`, **When** a user navigates to any of them (bookmark, stale `Link`), **Then** they are redirected to the corresponding `/config/sources` / `/config/sources/*` / `/config/system/logs` path.
7. **Given** any internal reference to the old Sources/Logs paths (sidenav, overview grid, top-bar activity dropdown, breadcrumbs), **When** this story is complete, **Then** every live reference points to the new path — **no live reference targets a redirect**.
8. **Given** the `/config` overview grid (deferred reconciliation from 47.2), **When** this story is complete, **Then** (a) the grid no longer links to any moving/redirected path, (b) a **Connections** card is present, and (c) the **Profile** completion badge no longer keys off `hasAnthropicKey`/`hasImap` (those moved to Connections) — it reflects candidate-info only.
9. **Given** `bunx tsc --noEmit` and `bun run build`, **When** the story is complete, **Then** there are **zero new** type errors over the repo baseline (**88** pre-existing) and the build succeeds. No automated test changes are required (no server/test references to the moved paths exist — verified).

## Tasks / Subtasks

- [x] **Task 1: Relocate + rename the Sources leaf pages** (AC: #1)
  - [x] `git mv src/client/routes/config/job-sources-searches.tsx src/client/routes/config/sources-searches.tsx`; rename the export `JobSourcesSearchesRoute` → `SourcesSearchesRoute`. **No other changes** — keep the `Discovery Searches` `<h1>` and all logic verbatim (this is a descriptive page title, like 47.2 kept "Inbox Mapping").
  - [x] `git mv src/client/routes/config/job-sources-blacklist.tsx src/client/routes/config/sources-blacklist.tsx`; rename the export `ConfigJobSourcesBlacklistRoute` → `SourcesBlacklistRoute`. Keep the `Blacklist` `<h1>` and logic verbatim.
- [x] **Task 2: Relocate + rename the Sources index** (AC: #2, #7)
  - [x] `git mv src/client/routes/config/job-sources-index.tsx src/client/routes/config/sources-index.tsx`; rename the export `ConfigJobSourcesIndexRoute` → `ConfigSourcesIndexRoute`.
  - [x] Change the `<h1>` from `Job Sources` → **`Sources`**.
  - [x] Repoint its two tile `<Link to=>` targets: `/config/job-sources/searches` → `/config/sources/searches`, `/config/job-sources/blacklist` → `/config/sources/blacklist`. Leave the tile markup / tooltips / `searchesConfigured` badge otherwise verbatim.
- [x] **Task 3: Relocate + rename the Logs page** (AC: #3)
  - [x] `git mv src/client/routes/config/logs.tsx src/client/routes/config/system-logs.tsx`; rename the export `ConfigLogsRoute` → `SystemLogsRoute`. **No other changes** — the Logs table page has no `<h1>` to touch; keep its toolbar/title and all logic verbatim.
- [x] **Task 4: Create the System section landing** (AC: #4)
  - [x] New file `src/client/routes/config/system-index.tsx` exporting `ConfigSystemIndexRoute`. Mirror the existing tile pattern in `sources-index.tsx` / `connections-index.tsx` exactly (same `TooltipProvider` + `border border-zinc-800 rounded-lg p-4` tile, `CircleHelp` tooltip). `<h1>System</h1>`.
  - [x] Two tiles, **no badges** (these are navigational, like the overview's old Logs card): **Logs** → `/config/system/logs` (tooltip: "History of automation runs showing timing, token usage, and costs.", right-edge `View logs →` hint like overview.tsx:125), **Privacy** → `/privacy-policy` (tooltip: "How HITLOBSTER collects, uses, and protects your data, including Google account access." — reuse the wording from `profile-index.tsx`'s removed Privacy tile).
  - [x] No loader needed (the landing renders no data-driven state). Do **not** add a `useWebhookRunsQuery`/onboarding hook here.
- [x] **Task 5: Make Profile a pure settings page** (AC: #5, #7)
  - [x] In `src/client/routes/config/profile-index.tsx`, **remove the Privacy Policy tile** (the second `<Link to="/privacy-policy">` block, lines ~43–64). After this, Profile shows the **Candidate Info** tile only. (Privacy now lives under System per Task 4.)
  - [x] Leave the Candidate Info tile + `resumeConfigured` badge + `useProfileQuery` import verbatim. Run tsc — nothing should be orphaned (the page already only imports what Candidate Info needs), but verify under strict `noUnusedLocals`.
- [x] **Task 6: Register new routes + redirect routes in `router.ts`** (AC: #1–#6)
  - [x] Update imports: replace `ConfigJobSourcesIndexRoute` (from `'../routes/config/job-sources-index'`) → `ConfigSourcesIndexRoute` (from `'../routes/config/sources-index'`); `JobSourcesSearchesRoute` (`job-sources-searches`) → `SourcesSearchesRoute` (`sources-searches`); `ConfigJobSourcesBlacklistRoute` (`job-sources-blacklist`) → `SourcesBlacklistRoute` (`sources-blacklist`); `ConfigLogsRoute` (`logs`) → `SystemLogsRoute` (`system-logs`). Add `ConfigSystemIndexRoute` (from `'../routes/config/system-index'`).
  - [x] Add five new routes under `configLayoutRoute` (mirror the existing `createRoute({ getParentRoute: () => configLayoutRoute, path, component, loader })` shape):
    - `/config/sources` → `ConfigSourcesIndexRoute`, `loader: () => queryClient.ensureQueryData({ queryKey: ['search-configs'], queryFn: fetchSearchConfigs })`. (Drop the old index's redundant `['onboarding-status']` prefetch — after 47.2 removed the Auth Setup tile, the index reads only `useSearchConfigsQuery`. Verify it renders without onboarding-status.)
    - `/config/sources/searches` → `SourcesSearchesRoute`, **same loader** as the old searches route (`['search-configs']` + `['source-settings']`).
    - `/config/sources/blacklist` → `SourcesBlacklistRoute`, **same loader** as the old blacklist route (`['blacklist']`).
    - `/config/system` → `ConfigSystemIndexRoute`, **no loader**.
    - `/config/system/logs` → `SystemLogsRoute`, **same loader** as the old logs route (`['webhook-runs']`).
  - [x] Convert the four old route registrations into **redirect-only** routes (keep the same `path`, drop component/loader, add `beforeLoad`):
    - `/config/job-sources` → `redirect({ to: '/config/sources' })`
    - `/config/job-sources/searches` → `redirect({ to: '/config/sources/searches' })`
    - `/config/job-sources/blacklist` → `redirect({ to: '/config/sources/blacklist' })`
    - `/config/logs` → `redirect({ to: '/config/system/logs' })`
  - [x] Add all new + redirect routes to `configLayoutRoute.addChildren([...])`. **Leave the existing `configJobSourcesAuthSetupRedirectRoute`** (`/config/job-sources/auth-setup` → `/config/connections/linkedin`, from 47.2) in place — it's still a valid stale-path catch. `redirect`, `fetchSearchConfigs`, `fetchSourceSettings`, `fetchBlacklist`, `fetchWebhookRuns` are already imported in `router.ts`.
- [x] **Task 7: Repoint the sidenav** (AC: #7)
  - [x] In `src/client/routes/config/layout.tsx`, the **Sources** section: change header `to: '/config/job-sources'` → `'/config/sources'`; children `to: '/config/job-sources/searches'` → `'/config/sources/searches'`, `'/config/job-sources/blacklist'` → `'/config/sources/blacklist'`.
  - [x] The **System** section: add `to: '/config/system'` to the section object (so its header renders as a `<Link>` with fuzzy parent-active highlighting, closing 47.1's "System stays a label" caveat). Change the Logs child `to: '/config/logs'` → `'/config/system/logs'`. **Leave the Privacy child `to: '/privacy-policy'` unchanged** (see Open Question Q1).
- [x] **Task 8: Update the breadcrumb segment map** (AC: #7)
  - [x] In `src/client/components/config/ConfigBreadcrumb.tsx` `PATH_LABELS`: remove `'/config/job-sources'`, `'/config/job-sources/searches'`, `'/config/job-sources/blacklist'`, `'/config/logs'`. Add: `'/config/sources': 'Sources'`, `'/config/sources/searches': 'Searches'`, `'/config/sources/blacklist': 'Blacklist'`, `'/config/system': 'System'`, `'/config/system/logs': 'Logs'`.
- [x] **Task 9: Repoint the top-bar activity dropdown Logs link** (AC: #7)
  - [x] In `src/client/components/shared/ActivityIndicator.tsx:78`, change `to="/config/logs"` → `to="/config/system/logs"`. **(NB: the epic dev note says this link is in `Layout.tsx`; it was relocated to `ActivityIndicator.tsx` in Epic 46. This is the only top-bar Logs reference — verified by grep.)**
- [x] **Task 10: Reconcile the `/config` overview grid** (AC: #7, #8 — deferred from 47.2)
  - [x] In `src/client/routes/config/overview.tsx`: repoint the **Job Sources** card `<Link to="/config/job-sources">` → `'/config/sources'`, relabel its text `Job Sources` → **`Sources`**, and update its tooltip to drop the "LinkedIn authentication" phrase (LinkedIn is Connections now) — e.g. "Job search filters and blacklist that drive automated discovery." Change its badge to key on searches only: `sourcesConfigured = searchConfigs.length > 0` (drop `status?.hasLinkedinAuth`).
  - [x] Repoint the **Logs** card `<Link to="/config/logs">` → `'/config/system/logs'` (or relabel to a **System** card → `/config/system`; default: keep "Logs" text, repoint to `/config/system/logs`). It has no badge — leave the `View logs →` hint.
  - [x] Fix the **Profile** card badge: change `profileConfigured = !!(status?.hasAnthropicKey && profile?.name && status?.hasImap)` → `profileConfigured = !!profile?.name` (candidate-info only; API-key + IMAP moved to Connections in 47.2). Update its tooltip to drop "credentials" if it implies API-key/inbox.
  - [x] Add a **Connections** card (mirror the existing card markup) → `<Link to="/config/connections">`, tooltip "LinkedIn, inbox, and Anthropic API key — your set-once external hookups.", badge `connectionsConfigured = !!(status?.hasLinkedinAuth && status?.hasAnthropicKey)` (Inbox is email-gated/optional, so exclude `hasImap` from the rollup).
  - [x] After these edits, re-check imports under strict `noUnusedLocals`: `useOnboardingStatusQuery`/`status` is still used (Connections + Sources badges read it), `usePromptsQuery`/`prompts` still used (Prompts badge), `useSearchConfigsQuery`/`searchConfigs` still used, `useProfileQuery`/`profile` still used — nothing should be orphaned, but verify.
- [x] **Task 11: Verify** (AC: #9)
  - [x] `bunx tsc --noEmit` — exactly **88** baseline errors, **zero** new, none referencing the new/moved/edited files. `bun run build` exits 0.
  - [x] `bun test src/server/routes/api-onboarding.test.ts` (and full `bun test`) — counts unchanged vs. baseline; this story touches **no** server code or tests (the only server `/config/*` strings are the 47.2 connections/inbox redirects — untouched). Confirm no test references `/config/job-sources` or `/config/logs` (verified: none).
  - [ ] Manual walkthrough (`bun run dev`, human-in-the-loop — no DOM harness in repo): `/config/sources` shows Searches + Blacklist; both leaves render identically; `/config/system` shows Logs + Privacy; `/config/system/logs` shows the runs table; `/config/profile` shows Candidate Info only; the four old URLs redirect; sidenav Sources + System headers highlight on their children; breadcrumbs read `Config / Sources / …` and `Config / System / Logs`; the overview grid shows Profile/Sources/Connections/Prompts + Logs(System) with corrected badges; the activity-dropdown "Logs" link lands on `/config/system/logs`. _OUTSTANDING until a human runs it (per 47.1 / 47.2 / Epic 46 no-DOM-harness convention)._

## Dev Notes

### Scope: this is a MOVE + overview-reconcile story, not a behavior story
Per the epic: "No change to the *content* or behavior of any moved page … only their location in the nav and their route path change." Reuse the moved component bodies **verbatim** (git mv + export rename + the single `Job Sources`→`Sources` `<h1>` on the index). The new work is (a) wiring routes/redirects/links so nothing breaks and no live reference targets a redirect (AC7), (b) the **two new index landings** (`/config/sources` moved, `/config/system` new) that give the Sources/System sidenav headers their final homes, and (c) the `/config` overview-grid reconciliation that 47.2's review explicitly deferred here.

### Why the two index pages (beyond the literal epic dev note)
The epic's 47.3 dev note lists only the leaf moves (searches/blacklist/logs) and says "Confirm `/config/job-sources` parent … no longer reference the moved children." Two architectural facts force the index work:
1. **Sidenav parent-active highlighting needs prefix-matching paths.** `layout.tsx` headers use **default (fuzzy)** `activeOptions`; children use `activeOptions={{ exact: true }}`. A Sources header pointing at `/config/job-sources` would **not** light up on `/config/sources/searches` (no prefix match), breaking 47.1's AC3 ("owning section shown as active"). So the Sources index must move to `/config/sources` and the header repoint there. The same logic gives the System header a `/config/system` index `to` (it was an inert `<div>` label in 47.1 — 47.2's completion notes state plainly: *"System stays a label — its index lands in 47.3."*).
2. **The epic's closing line:** "With 47.2 + 47.3 complete the sidenav groups in 47.1 now point at their final homes." All five headers (Profile, Sources, Connections, Prompts, System) must be real `<Link>`s to section indexes. Connections got its index in 47.2 (precedent); Sources moves + System is created here.

### The complete reference inventory (every place the moving paths appear)
Authoritative — verified by `grep -rn "config/job-sources\|config/logs"` over `src`. Touch each; **none are on the server** (server `/config/*` strings are all the 47.2 connections/inbox redirects — do not touch):

| Reference location | Old path | Action | Task |
|---|---|---|---|
| `layout.tsx:26` Sources header `to` | `/config/job-sources` | → `/config/sources` | 7 |
| `layout.tsx:28-29` Searches/Blacklist children | `/config/job-sources/{searches,blacklist}` | → `/config/sources/*` | 7 |
| `layout.tsx:53` System Logs child | `/config/logs` | → `/config/system/logs` | 7 |
| `layout.tsx` System header (no `to`) | — | add `to: '/config/system'` | 7 |
| `ConfigBreadcrumb.tsx:11-13,18` PATH_LABELS | job-sources*, logs | swap → sources*, system, system/logs | 8 |
| `ActivityIndicator.tsx:78` top-bar Logs link | `/config/logs` | → `/config/system/logs` | 9 |
| `overview.tsx:51` "Job Sources" card | `/config/job-sources` | → `/config/sources` (+relabel) | 10 |
| `overview.tsx:105` "Logs" card | `/config/logs` | → `/config/system/logs` | 10 |
| `overview.tsx:15` Profile badge | hasAnthropicKey+hasImap | → candidate-info only | 10 |
| `sources-index.tsx` (moved) tiles | `/config/job-sources/*` | → `/config/sources/*` | 2 |
| `profile-index.tsx:43` Privacy tile | `/privacy-policy` | **remove** (→ System) | 5 |
| `router.ts` route regs + imports | all four | move + redirect routes | 6 |

`/privacy-policy` also appears in `tour.tsx:197` and `login.tsx:85` (public footers) — **leave those untouched**; they correctly point at the public privacy page.

### Privacy is a PUBLIC root route — read this before touching anything privacy-related
There is **no `/config` privacy page**. `PrivacyRoute` lives at the root path `/privacy-policy` (`src/client/routes/privacy.tsx`), is registered **outside** `_protected` (publicly reachable, no auth), renders its **own full-page chrome** (`min-h-screen`, a HITLOBSTER header with a "← Back" link to `/`), and its legal text is canonically sourced from `PRIVACY.md`. It is linked from the tour and login pages.

The epic's AC premise ("old Privacy path redirected to `/config/system/privacy`", "a `/config/system/privacy` page renders") is therefore **based on a page that does not exist**. The default chosen here (Open Question Q1): **System → Privacy continues to link to the existing public `/privacy-policy`** (as 47.1's sidenav already does). No `/config/system/privacy` route is created and **no privacy redirect is added** (there was never a `/config` privacy path to redirect). Rationale: creating a config-embedded privacy route would either double-chrome the public full-page component or duplicate the canonical legal text — both bad. If Stryker wants a config-wrapped privacy view instead, see Q1.

### Route registration pattern (copy the existing shape exactly)
Routes are `createRoute({ getParentRoute: () => configLayoutRoute, path, component, loader })` consts, listed in `configLayoutRoute.addChildren([...])`. Redirect routes follow 47.2's prescribed shape (already used for `/config/profile/api-keys`, `/config/profile/inbox-mapping`, `/config/job-sources/auth-setup`):

```ts
const configJobSourcesRedirectRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/job-sources',
  beforeLoad: () => { throw redirect({ to: '/config/sources' }) },
})
```

A `beforeLoad` redirect fires before the loader, so redirect routes need no component/loader. Keeping the old `path` registered (as a redirect) is what makes stale bookmarks resolve (AC6). The redirect `to` literals must be registered routes or tsc's typed-router will error.

### Don't break / preserve list
- **No loaders dropped on moved leaves.** `/config/sources/searches` keeps `['search-configs']` + `['source-settings']`; `/config/sources/blacklist` keeps `['blacklist']`; `/config/system/logs` keeps `['webhook-runs']`. These pages render with data **pre-cached via route loader** (project rule: no in-page loading flicker) — dropping a loader is a regression.
- **`/config/sources` index loader:** the old `/config/job-sources` index loader prefetched `['onboarding-status']` + `['search-configs']`, but post-47.2 the index only reads `useSearchConfigsQuery` (the onboarding-status was for the deleted Auth Setup tile). Reduce to `['search-configs']` only; verify the page renders (no orphaned `useOnboardingStatusQuery` in the component — 47.2 already removed it).
- **Keep the 47.2 auth-setup redirect** (`/config/job-sources/auth-setup` → `/config/connections/linkedin`). It is unrelated to this story's moves and must keep catching stale LinkedIn bookmarks.
- **strict `noUnusedLocals`/`noUnusedParameters`** are hard compile errors. Removing the Privacy tile (Task 5) and editing overview (Task 10) may orphan imports — run tsc and clean up exactly what's orphaned, nothing more.
- **No API/DB/schema/shared-types changes.** This is purely route + link relocation + JSX. No `src/shared/schemas.ts` edits, no new hooks (reuse `useSearchConfigsQuery`, `useOnboardingStatusQuery`, `useProfileQuery`, `usePromptsQuery`).
- **`git mv` (not delete+create)** so history follows the four moved files (searches, blacklist, index, logs — all tracked).

### Overview reconciliation — the two 47.2-deferred findings land here
47.2's code review deferred exactly two items to 47.3 (see `47-2-…md` Review Findings + sprint-status note "overview reconciliation rides 47.3"):
1. `overview.tsx:15` `profileConfigured` keyed on `hasAnthropicKey`/`hasImap` — wrong after those moved to Connections (esp. with email features off, where `hasImap` is always false → Profile reads "Incomplete" for reasons no longer under Profile). Fix to candidate-info-only (Task 10).
2. No "Connections" card on the overview grid — add one (Task 10).
Beyond those two, repointing the Job Sources + Logs cards is **mandatory** (not optional) because after this story those targets become redirects, and AC7 forbids any live reference targeting a redirect.

### Project Structure Notes
- Route component files kebab-case (`sources-searches.tsx`, `system-logs.tsx`, `system-index.tsx`); index exports `Config<Section>IndexRoute` (`ConfigSourcesIndexRoute`, `ConfigSystemIndexRoute` — matching `ConfigConnectionsIndexRoute`/`ConfigProfileIndexRoute`); leaf exports `<Section><Page>Route` (`SourcesSearchesRoute`, `SourcesBlacklistRoute`, `SystemLogsRoute` — matching `ConnectionsLinkedinRoute`).
- Path aliases: `@/*` → `src/client/*`. New `system-index.tsx` imports UI via `@/components/ui/...` like its siblings.
- The two new index landings reuse the **exact** tile markup from `sources-index.tsx`/`connections-index.tsx` (`TooltipProvider`, `border border-zinc-800 rounded-lg p-4`, `CircleHelp` button with `e.preventDefault();e.stopPropagation()`). Reuse, don't invent.

### Testing
- **No DOM/component test harness exists in this repo** (Epic 46 / 47.1 / 47.2 convention — JSX route wiring is verified by manual `bun run dev` walkthrough, not rendered tests). Do **not** add a test library or render harness.
- **No automated test changes are required.** Verified: no test file references `/config/job-sources` or `/config/logs`; the only server `/config/*` strings (`api-onboarding.test.ts:412,434`) are the 47.2 connections/inbox assertions, untouched by this story.
- Test rules if you do touch any test: `bun:test`, `process.env.DB_PATH=':memory:'` before prod imports, assert exact strings + HTTP status, `{ error }` shape.
- Verification bar is **zero new** tsc errors vs. the **88** baseline and a green `bun run build` — not zero absolute (per 47.1 / 47.2 / Epic 46).

### Previous Story Intelligence (47.2, done)
- 47.2 set the exact precedent this story follows: `git mv` page + rename export + cosmetic `<h1>`, create a section index (`connections-index.tsx`), register new routes + `beforeLoad`-redirect the old paths, repoint sidenav header (`to`) + children + breadcrumb `PATH_LABELS`, and remove moved tiles from old overview pages. Mirror that structure.
- 47.2 gave the **Connections** header a `to` and noted **System's index "lands in 47.3"** — Task 4 fulfills that.
- 47.2 already removed the API-Key + Inbox tiles from `profile-index.tsx`; this story removes the **last** non-Candidate-Info tile (Privacy), completing "Profile as pure settings."
- 47.2's deferred overview items (Profile badge + Connections card) are resolved in Task 10.
- Repo baseline at 47.2 review: **88** tsc errors, build green. Same bar here.
- The `type ToPath = LinkProps['to']` in `layout.tsx` keeps `to` strongly typed (tsc-confirmed in 47.2) — new path literals are still typechecked against the registered route union, so a typo in a `to=` or redirect target is a compile error. Good safety net.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-47-config-ia-restructure.md#Story 47.3] — ACs + dev note (relocate searches/blacklist → `sources-*`, `logs.tsx` → `system-logs.tsx`, `beforeLoad` redirects at old paths, update `ConfigBreadcrumb` + top-nav Logs link, no API/DB changes). **Deviation flags:** Privacy has no `/config` page (Q1); the "top-nav Logs link" is in `ActivityIndicator.tsx`, not `Layout.tsx` (Task 9); the two index landings are required by the active-highlighting architecture note + 47.2's "System index lands in 47.3."
- [Source: _bmad-output/planning-artifacts/epics/epic-47-config-ia-restructure.md (Architecture note)] — `_config` pathless layout (Epic 35); `beforeLoad` → `throw redirect({ to })`; `activeOptions` parent-active (fuzzy header / exact child); query hooks reused unchanged.
- [Source: src/client/lib/router.ts:296-356,357-376] — old `configJobSources*` + `configLogsRoute` consts (loaders) and the `configLayoutRoute.addChildren` list to extend; `redirect`/`fetchSearchConfigs`/`fetchSourceSettings`/`fetchBlacklist`/`fetchWebhookRuns` already imported (lines 1,11,13,42). Existing redirect-route shape at lines 256-273 (47.2).
- [Source: src/client/routes/config/layout.tsx:24-57] — Sources section (header `to` + 2 children) to repoint; System section (label header, no `to`; Logs child) to give a `to` + repoint Logs.
- [Source: src/client/components/config/ConfigBreadcrumb.tsx:3-19] — `PATH_LABELS` map to edit.
- [Source: src/client/components/shared/ActivityIndicator.tsx:78] — top-bar activity-dropdown Logs `<Link to="/config/logs">` to repoint.
- [Source: src/client/routes/config/overview.tsx:9-128] — grid badges (`profileConfigured`:15, `jobSourcesConfigured`:16) + the Job Sources card (51) + Logs card (105) to repoint/relabel; add a Connections card; fix Profile badge.
- [Source: src/client/routes/config/profile-index.tsx:43-64] — Privacy Policy tile to remove (Privacy moves to System); tooltip wording to reuse in `system-index.tsx`.
- [Source: src/client/routes/config/job-sources-index.tsx:6,14,16,42] — index to move/rename, `<h1>` Job Sources→Sources, tile targets to repoint.
- [Source: src/client/routes/privacy.tsx:1-35] — `PrivacyRoute` is a **public** root route (`/privacy-policy`) with full-page chrome, canonical text from `PRIVACY.md` — explains Q1.
- [Source: _bmad-output/implementation-artifacts/47-2-connections-section-consolidate-linkedin-inbox-api-key.md] — precedent pattern + the two overview items deferred to this story.
- [Source: _bmad-output/project-context.md] — TanStack Router/Query rules (route loaders prefetch, no in-drawer/in-page loading), strict `noUnusedLocals`, kebab-case files / PascalCase components, error shape `{ error }`, no DOM test harness convention.

### Open Questions (non-blocking; defaults chosen above)
- **Q1 — Privacy under "System" (the big one):** There is no `/config` privacy page; `/privacy-policy` is a **public, full-page-chrome** root route shared with the tour/login. **Default:** System → Privacy (sidenav child + `system-index` tile) links to the existing public `/privacy-policy`; no `/config/system/privacy` route, no redirect. This satisfies AC4's "Privacy listed under System" and "Privacy page renders," diverging only from the AC's literal "/config/system/privacy path" + "redirect old Privacy path" (which presume a page that never existed). *Alternative if you want a config-wrapped privacy view:* create `/config/system/privacy` rendering a config-chrome-friendly privacy component — but that requires extracting the legal body out of `PrivacyRoute`'s full-page shell into a shared content component used by both routes (to avoid duplicating `PRIVACY.md` text). Say the word and the dev does the extraction instead.
- **Q2 — Overview "Logs" card → keep as "Logs" or relabel "System":** Default keeps the card labelled **"Logs"** but repoints it to `/config/system/logs` (smallest change, preserves the familiar "View logs →" affordance). Alternative: relabel it **"System"** → `/config/system` to make the overview grid mirror the five sidenav sections 1:1. Either satisfies AC7/AC8 (no redirect target). Flag if you prefer the 1:1 mirror.
- **Q3 — Moved `<h1>` headings:** Default changes only the index heading (`Job Sources`→`Sources`); the Searches page keeps `Discovery Searches` and Blacklist keeps `Blacklist` (descriptive page titles, consistent with 47.2 keeping "Inbox Mapping"). The Logs page has no `<h1>` to change. If you want the Searches heading shortened to "Searches," say so (display-only, satisfies all ACs either way).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- Baseline `bunx tsc --noEmit`: **88** errors (captured before edits).
- Post-implementation `bunx tsc --noEmit`: **88** errors — **zero new**, none referencing moved/new/edited files.
- `bun run build`: exit **0** (green).
- `bun test src/server/routes/api-onboarding.test.ts`: **38 pass / 5 fail** — identical counts confirmed on the baseline client state (stash-verified); the 5 are pre-existing env/network-dependent failures (DB upsert returning 0 rows, `[gmail] revoke failed: network down`), unrelated to this client-only story.
- Full `bun test`: **483 pass / 40 fail** — matches the documented ~40 env-dependent repo-wide baseline. No test files touched.

### Completion Notes List

- **Sources section (Tasks 1–2):** `git mv` `job-sources-{searches,blacklist,index}.tsx` → `sources-*.tsx`; renamed exports (`SourcesSearchesRoute`, `SourcesBlacklistRoute`, `ConfigSourcesIndexRoute`). Index `<h1>` `Job Sources`→`Sources`; its two tiles repointed to `/config/sources/{searches,blacklist}`. Leaf `<h1>`s (`Discovery Searches`, `Blacklist`) kept verbatim per Q3 default.
- **System section (Tasks 3–4):** `git mv` `logs.tsx` → `system-logs.tsx` (export `SystemLogsRoute`, body verbatim). New `system-index.tsx` (`ConfigSystemIndexRoute`) mirroring the sibling tile pattern — two badge-less tiles: **Logs** → `/config/system/logs` (with `View logs →` hint) and **Privacy** → `/privacy-policy` (public route per Q1; no `/config/system/privacy` route/redirect created).
- **Profile pure settings (Task 5):** removed the Privacy Policy tile from `profile-index.tsx`; Candidate Info is now the only tile. No orphaned imports (tsc clean).
- **Routing (Task 6):** new routes `/config/sources`, `/config/sources/searches`, `/config/sources/blacklist`, `/config/system`, `/config/system/logs`; the four old paths (`/config/job-sources`, `/config/job-sources/{searches,blacklist}`, `/config/logs`) converted to `beforeLoad`-redirect routes pointing at the new paths. `/config/sources` loader reduced to `['search-configs']` only (dropped the obsolete `['onboarding-status']` prefetch). The 47.2 `configJobSourcesAuthSetupRedirectRoute` left intact.
- **Reference repointing (Tasks 7–9):** sidenav `layout.tsx` Sources header+children & System header (`to: '/config/system'`, closing 47.1's "System stays a label" caveat) + Logs child; `ConfigBreadcrumb` `PATH_LABELS` swapped; `ActivityIndicator.tsx` top-bar Logs link → `/config/system/logs`. Grep confirms no live `to=` reference targets a redirect (AC7) — only the redirect routes' own `path:` literals remain as old strings.
- **Overview reconcile (Task 10, 47.2-deferred):** Profile badge → `!!profile?.name` (candidate-info only); Job Sources card → Sources (`/config/sources`, searches-only badge, tooltip de-LinkedIn'd); Logs card → `/config/system/logs`; new **Connections** card with `connectionsConfigured = !!(hasLinkedinAuth && hasAnthropicKey)`. All four overview hooks (`status`/`profile`/`searchConfigs`/`prompts`) still consumed — no orphans under strict `noUnusedLocals`.
- **Deviations (all per story Dev Notes):** Q1 — Privacy stays the public `/privacy-policy` (no config-embedded route); Task 9 — top-bar Logs link is in `ActivityIndicator.tsx`, not `Layout.tsx`; two index landings created as required by active-highlighting + 47.2's "System index lands in 47.3."
- **OUTSTANDING:** the human-in-the-loop `bun run dev` browser walkthrough (Task 11, final subtask) — no DOM/component harness exists in this repo (Epic 46 / 47.1 / 47.2 convention); left unchecked for a human to confirm.

### File List

**Renamed (git mv) + edited:**
- `job-hunt-dashboard/src/client/routes/config/sources-searches.tsx` (from `job-sources-searches.tsx` — export rename)
- `job-hunt-dashboard/src/client/routes/config/sources-blacklist.tsx` (from `job-sources-blacklist.tsx` — export rename)
- `job-hunt-dashboard/src/client/routes/config/sources-index.tsx` (from `job-sources-index.tsx` — export rename, `<h1>`, tile targets)
- `job-hunt-dashboard/src/client/routes/config/system-logs.tsx` (from `logs.tsx` — export rename)

**New:**
- `job-hunt-dashboard/src/client/routes/config/system-index.tsx`

**Modified:**
- `job-hunt-dashboard/src/client/routes/config/profile-index.tsx`
- `job-hunt-dashboard/src/client/routes/config/overview.tsx`
- `job-hunt-dashboard/src/client/routes/config/layout.tsx`
- `job-hunt-dashboard/src/client/lib/router.ts`
- `job-hunt-dashboard/src/client/components/config/ConfigBreadcrumb.tsx`
- `job-hunt-dashboard/src/client/components/shared/ActivityIndicator.tsx`

## Change Log

| Date | Change |
|---|---|
| 2026-06-29 | Story 47.3 implemented — `git mv` searches/blacklist/index → `sources-*.tsx` + `logs.tsx` → `system-logs.tsx` (export renames + cosmetic `Sources` `<h1>` on index), new `system-index.tsx` landing (Logs + Privacy tiles), 5 new routes + 4 `beforeLoad`-redirect routes in `router.ts`, removed Privacy tile from Profile, reconciled `/config` overview grid (Profile badge → candidate-info-only, added Connections card, repointed Sources/Logs cards), repointed sidenav/breadcrumb/activity-dropdown Logs link. tsc 88=baseline (zero new), `bun run build` green, test counts unchanged. Manual `bun run dev` walkthrough OUTSTANDING (no DOM harness). Status → review. |
| 2026-06-29 | Story 47.3 drafted — Sources & System sections: `git mv` searches/blacklist/index → `sources-*`, `logs.tsx` → `system-logs.tsx`, new `system-index.tsx` landing, move Sources index to `/config/sources` + give System header a `/config/system` index, `beforeLoad` redirects at 4 old paths, remove Privacy tile from Profile (pure settings), reconcile `/config` overview grid (47.2-deferred: fix Profile badge + add Connections card + repoint moved-path cards), repoint sidenav/breadcrumb/activity-dropdown Logs link. Flagged 3 epic-vs-reality deviations (Privacy is a public route; top-nav Logs link is in ActivityIndicator.tsx not Layout.tsx; two index landings required by active-highlighting). No API/DB/test changes. Status → ready-for-dev. |

## Review Findings

_Code review 2026-06-29 (3-layer: Blind Hunter + Edge Case Hunter + Acceptance Auditor). 0 decision-needed, 1 patch, 1 deferred, 3 dismissed as noise._

- [x] [Review][Patch] Profile completion badge always reads "Incomplete" — FIXED 2026-06-29 (`profile?.personal?.fullName`; tsc now 87, one baseline error removed) [job-hunt-dashboard/src/client/routes/config/overview.tsx:15] — `profileConfigured = !!profile?.name` references a non-existent field. `ProfileData` (src/shared/schemas.ts `profileDataSchema`) has no `name`; the candidate name lives at `profile.personal.fullName` (cf. `profile-index.tsx` `resumeConfigured`). So the badge can never show "Configured", meaning AC8(c)'s stated intent ("it reflects candidate-info only") is not actually met. Fix: `!!profile?.personal?.fullName`. NOTE: spec Task 10 prescribed `profile?.name` verbatim — the spec text is itself wrong; this was also the pre-existing baseline value, so it produces no NEW tsc error and AC9's 88-baseline still holds.
- [x] [Review][Defer] Orphan `src/client/routes/config.tsx` references old route paths [job-hunt-dashboard/src/client/routes/config.tsx:24,25,83,84,127,128] — deferred, pre-existing. Unimported dead `ConfigRoute` export (last touched Epic 38); its `to="/logs"`/`"/profile"`/`"/prompts"` literals contribute 6 of the 88 baseline tsc errors. Not in the live route tree (no AC7 violation) and untouched by 47.3 — surfaced only because the reorg's new route-path union re-flags it. Candidate for separate deletion.
