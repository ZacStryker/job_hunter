---
baseline_commit: d2d007b14a16e36bb8d4425a9347e5ae9796d6f2
---

# Story 47.2: Connections Section — Consolidate LinkedIn, Inbox & API Key

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user setting up my integrations,
I want LinkedIn auth, my inbox connection/mapping, and my Anthropic API key in one "Connections" place,
so that all my set-once external hookups live together instead of being split across Profile and Job Sources.

## Acceptance Criteria

1. **Given** the new Connections section, **When** the user navigates to `/config/connections`, **Then** it renders a section landing listing its three areas — **LinkedIn**, **Inbox**, **API Key** — each linking to its subpage (Inbox tile email-gated, like today).
2. **Given** the LinkedIn auth page (formerly `/config/job-sources/auth-setup`), **When** the user navigates to `/config/connections/linkedin`, **Then** the existing LinkedIn connect/status UI renders and behaves identically (same `LinkedInBrowserModal` flow, same `['onboarding-status']` invalidation on capture).
3. **Given** the inbox page (formerly `/config/profile/inbox-mapping`), **When** the user navigates to `/config/connections/inbox`, **Then** the existing inbox connection form + folder/label mapping editor renders and behaves identically (IMAP folder mapping and Gmail label mapping both supported; the `?gmail=connected|error` return handling still works).
4. **Given** the API key page (formerly `/config/profile/api-keys`), **When** the user navigates to `/config/connections/api-key`, **Then** the existing masked Anthropic API key form (with Test/Save) renders and behaves identically.
5. **Given** the old paths `/config/job-sources/auth-setup`, `/config/profile/inbox-mapping`, `/config/profile/api-keys`, **When** a user navigates to any of them (bookmark, onboarding link, or stale `Link`), **Then** they are redirected to the corresponding new `/config/connections/*` path.
6. **Given** any internal `Link`/navigation/redirect reference to the old paths (sidenav, overview tiles, onboarding server redirects, breadcrumbs), **When** this story is complete, **Then** every reference points to the new `/config/connections/*` path — no live reference targets a redirect.
7. **Given** the Configured/Incomplete badges currently shown for these areas, **When** this story is complete, **Then** they still render and function on the new Connections landing (badge removal is deferred to Epic 48 — do not remove them here).
8. **Given** `bunx tsc --noEmit` and `bun run build`, **When** the story is complete, **Then** there are **zero new** type errors over the repo baseline (~88 pre-existing) and the build succeeds; the `api-onboarding.test.ts` suite passes with its redirect expectations updated to the new inbox path.

## Tasks / Subtasks

- [x] **Task 1: Relocate + rename the three moved component files** (AC: #2, #3, #4)
  - [x] `git mv src/client/routes/config/job-sources-auth-setup.tsx src/client/routes/config/connections-linkedin.tsx`; rename the export `JobSourcesAuthSetupRoute` → `ConnectionsLinkedinRoute`. Update the `<h1>` from `Auth Setup` → **`LinkedIn`** (display-only, matches the new nav label — see Open Question Q1). No other logic changes; keep `useLinkedinBrowserSession`, `LinkedInBrowserModal`, and the `['onboarding-status']` invalidation exactly as-is.
  - [x] `git mv src/client/routes/config/profile-inbox-mapping.tsx src/client/routes/config/connections-inbox.tsx`; rename the export `ProfileInboxMappingRoute` → `ConnectionsInboxRoute`. **Do not change anything else** — the component already reads `?gmail=` from `window.location.search` and cleans it via `window.history.replaceState({}, '', window.location.pathname)` (lines ~73/80), so it carries over to the new path automatically. Keep the `<h1>Inbox Mapping</h1>` heading (it is the page's own title; the nav/breadcrumb already say "Inbox").
  - [x] `git mv src/client/routes/config/profile-api-keys.tsx src/client/routes/config/connections-api-key.tsx`; rename the export `ProfileApiKeysRoute` → `ConnectionsApiKeyRoute`. Update the `<h1>` from `API Keys` → **`API Key`** (matches the new nav label). Keep the Test/Save flow, `['onboarding-status']` invalidation, and the Configured/Incomplete badge it already renders.
- [x] **Task 2: Create the Connections section landing** (AC: #1, #7)
  - [x] New file `src/client/routes/config/connections-index.tsx` exporting `ConfigConnectionsIndexRoute`. Mirror the existing tile pattern in `job-sources-index.tsx` / `profile-index.tsx` exactly (same `TooltipProvider` + `border border-zinc-800 rounded-lg p-4` tile, `CircleHelp` tooltip, Configured/Incomplete badge spans).
  - [x] Three tiles: **LinkedIn** → `/config/connections/linkedin` (badge from `status?.hasLinkedinAuth`), **Inbox** → `/config/connections/inbox` (badge from `status?.hasImap`, **render only when `emailFeatures`** via `useFeatureSettingsQuery()`), **API Key** → `/config/connections/api-key` (badge from `status?.hasAnthropicKey`). Use `useOnboardingStatusQuery()` for all three statuses (no new hook). `<h1>Connections</h1>`.
- [x] **Task 3: Register new routes + redirect routes in `router.ts`** (AC: #1–#5)
  - [x] Replace the three old imports (`ProfileApiKeysRoute`, `ProfileInboxMappingRoute`, `JobSourcesAuthSetupRoute`) with `ConfigConnectionsIndexRoute`/`ConnectionsLinkedinRoute`/`ConnectionsInboxRoute`/`ConnectionsApiKeyRoute` from their new files.
  - [x] Add four new routes under `configLayoutRoute`:
    - `/config/connections` → `ConfigConnectionsIndexRoute`, `loader: () => queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus })`.
    - `/config/connections/linkedin` → `ConnectionsLinkedinRoute`, **same loader** as the old auth-setup route (`['onboarding-status']`).
    - `/config/connections/inbox` → `ConnectionsInboxRoute`, **copy verbatim** the old inbox-mapping route's `beforeLoad` (emailFeatures gate → `throw redirect({ to: '/' })`) and its three-way loader (`['onboarding-status']`, `['inbox-mappings']`, `['gmail-mappings']`).
    - `/config/connections/api-key` → `ConnectionsApiKeyRoute`, **same loader** as the old api-keys route (`['onboarding-status']`).
  - [x] Convert the three old route registrations into **redirect-only** routes (keep the same `path`, drop component/loader/beforeLoad-gate, add `beforeLoad: () => { throw redirect({ to: '<new path>' }) }`):
    - `/config/profile/api-keys` → redirect to `/config/connections/api-key`
    - `/config/profile/inbox-mapping` → redirect to `/config/connections/inbox`
    - `/config/job-sources/auth-setup` → redirect to `/config/connections/linkedin`
  - [x] Add all new + redirect routes to `configLayoutRoute.addChildren([...])`. `redirect` is already imported in `router.ts`.
- [x] **Task 4: Repoint the sidenav** (AC: #6)
  - [x] In `src/client/routes/config/layout.tsx`, the **Connections** section currently points its three children at the OLD paths. Update them to the new ones: LinkedIn → `/config/connections/linkedin`, Inbox → `/config/connections/inbox`, API Key → `/config/connections/api-key`. Keep the `requiresEmail: true` flag on Inbox.
  - [x] The **Connections** header has no `to` today (rendered as a label in 47.1 because its index didn't exist). Now that `/config/connections` exists, give the Connections section a `to: '/config/connections'` so its header renders as a `<Link>` with fuzzy parent-active highlighting like Profile/Sources/Prompts. (This also fixes the 47.1 interim cross-section highlight caveat for Connections.)
- [x] **Task 5: Update the breadcrumb segment map** (AC: #6)
  - [x] In `src/client/components/config/ConfigBreadcrumb.tsx` `PATH_LABELS`: remove the three stale entries (`/config/profile/api-keys`, `/config/profile/inbox-mapping`, `/config/job-sources/auth-setup`) and add: `'/config/connections': 'Connections'`, `'/config/connections/linkedin': 'LinkedIn'`, `'/config/connections/inbox': 'Inbox'`, `'/config/connections/api-key': 'API Key'`.
- [x] **Task 6: Remove the moved tiles from the old overview pages** (AC: #6)
  - [x] `profile-index.tsx`: remove the **API Keys** tile (line ~50) and the **Inbox Mapping** tile (line ~77, the `emailFeatures && (...)` block). They now live on the Connections landing. After this, Profile overview shows **Candidate Info** + **Privacy Policy** (Privacy moves to System in 47.3). Drop the now-unused `apiKeysConfigured`/`inboxConfigured`/`status`/`useOnboardingStatusQuery`/`featureSettings`/`emailFeatures`/`useFeatureSettingsQuery` locals & imports **only if** they become unused (strict `noUnusedLocals` will error otherwise — verify with tsc).
  - [x] `job-sources-index.tsx`: remove the **Auth Setup** tile (line ~19). After this it shows **Searches** + **Blacklist**. Drop the now-unused `authConfigured` / `status` / `useOnboardingStatusQuery` if they become unused (verify with tsc).
  - [x] Do **not** touch the top-level `/config` overview grid (`overview.tsx`) — it links to section indexes (`/config/profile`, `/config/job-sources`, `/config/prompts`, `/config/logs`), none of which are moving paths, so it contains no reference that targets a redirect. (Adding a "Connections" card there is out of scope — see Open Question Q2.)
- [x] **Task 7: Repoint the server-side onboarding redirects** (AC: #5, #6)
  - [x] `src/server/middleware/auth-middleware.ts:12` — change `'/config/profile/inbox-mapping?gmail=error'` → `'/config/connections/inbox?gmail=error'`.
  - [x] `src/server/routes/api-onboarding.ts:206` — change the config-surface fallback `'/config/profile/inbox-mapping'` → `'/config/connections/inbox'` (the `?gmail=...` suffix is appended downstream — leave that logic untouched).
  - [x] `src/server/routes/api-onboarding.test.ts:412,434` — update the two expected `location` headers to `'/config/connections/inbox?gmail=connected'` and `'/config/connections/inbox?gmail=error'`.
- [x] **Task 8: Verify** (AC: #8)
  - [x] `bunx tsc --noEmit` — exactly the 88 baseline errors, **zero** new, none referencing the new/edited files (the only changed-file errors are the 2 pre-existing `auth-middleware.ts:37` `data.impersonating` errors, untouched by this story). `bun run build` exits 0.
  - [x] `bun test src/server/routes/api-onboarding.test.ts` — the 2 updated Gmail-callback redirect expectations pass; the suite's 38 pass / 5 fail counts are identical with vs. without this story's server changes (the 5 fails are pre-existing env-dependent `PUT /api/onboarding/linkedin` failures, unrelated to redirect paths). Full repo suite: 483 pass / 40 fail (40 = documented repo-wide env-dependent baseline — no new failures).
  - [ ] Manual walkthrough (`bun run dev`, human-in-the-loop — no DOM harness in repo): `/config/connections` shows the three tiles (Inbox hidden when email features off); each subpage renders identically to before; the three old URLs redirect to their new homes; the sidenav Connections header + children highlight correctly; breadcrumbs read `Config / Connections / <Area>`; the Gmail OAuth round-trip lands back on `/config/connections/inbox?gmail=connected`. _OUTSTANDING until a human runs it (per 47.1 / Epic 46 no-DOM-harness convention)._

## Dev Notes

### Scope: this is a MOVE story, not a behavior story
Per the epic: "No change to the *content* or behavior of any moved page … only their location in the nav and their route path change." Reuse the three component bodies **verbatim** (rename file + export + the two cosmetic `<h1>`s only). Do not refactor, re-style, or "improve" them. The hard part is wiring routes/redirects/links so nothing breaks and **no live reference targets a redirect** (AC6).

### The complete reference inventory (every place the old paths appear)
This is the authoritative checklist — these are ALL the references in the repo (verified by grep). Touch each:

| Old reference location | Old path | Action |
|---|---|---|
| `layout.tsx` sidenav (Connections children) | all three | repoint to `/config/connections/*` (Task 4) |
| `ConfigBreadcrumb.tsx` `PATH_LABELS` | all three | swap map entries (Task 5) |
| `profile-index.tsx` tiles | api-keys, inbox-mapping | **remove** tiles (Task 6) |
| `job-sources-index.tsx` tile | auth-setup | **remove** tile (Task 6) |
| `auth-middleware.ts:12` | inbox-mapping | repoint redirect (Task 7) |
| `api-onboarding.ts:206` | inbox-mapping | repoint redirect (Task 7) |
| `api-onboarding.test.ts:412,434` | inbox-mapping | update expectations (Task 7) |
| `router.ts` route regs | all three | replace with new routes + redirect routes (Task 3) |

There are **no references in `onboarding.tsx`** or other client components (verified — onboarding reaches inbox only via the server Gmail-callback redirect, which Task 7 repoints). The `/api/config/inbox-mappings` API route and its hooks are a **different** thing (API endpoint, not a config page path) — **do not touch them**.

### Route registration pattern (copy the existing shape exactly)
Routes are defined as `createRoute({ getParentRoute: () => configLayoutRoute, path, component, loader })` consts, then listed in `configLayoutRoute.addChildren([...])` (`router.ts:357`). Redirect routes follow the epic's prescribed shape:

```ts
const configProfileInboxMappingRedirectRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile/inbox-mapping',
  beforeLoad: () => { throw redirect({ to: '/config/connections/inbox' }) },
})
```

`redirect` is already imported at `router.ts:1`. A `beforeLoad` redirect fires before the loader, so redirect routes need no component/loader. Keeping the old `path` registered (as a redirect) is what makes stale bookmarks/links resolve (AC5).

**Carry the inbox route's guards onto the NEW path, not the old one.** The old `/config/profile/inbox-mapping` route had a `beforeLoad` emailFeatures gate (`throw redirect({ to: '/' })`) AND a 3-key loader. Those must move to `/config/connections/inbox`; the old path becomes a bare redirect. Don't drop the emailFeatures gate — it's a real regression guard (direct nav to inbox with email features off must bounce to `/`).

### Why give the Connections header a `to` now (and the 47.1 caveat it resolves)
In 47.1, Connections/System headers were rendered as inert `<div>` labels because `/config/connections` didn't exist (a `<Link>` to it would be a dead link). This story creates that index, so the Connections header becomes a real `<Link to="/config/connections">` with default fuzzy `activeOptions` — exactly the epic's "with 47.2 + 47.3 complete the sidenav groups now point at their final homes." It also resolves 47.1's documented interim highlight bug: once the three children live under `/config/connections/*`, the Sources/Profile headers stop prefix-matching them. (System stays a label — its index lands in 47.3.)

### Configured/Incomplete badges — keep them (AC7)
The badges are NOT retired here (Epic 48 does that). The moved API-key page renders its own `hasAnthropicKey` badge — keep it. The new Connections landing should render Configured/Incomplete badges per area exactly like `profile-index.tsx`/`job-sources-index.tsx` do (same emerald/zinc span markup), sourced from `useOnboardingStatusQuery()` (`hasLinkedinAuth`, `hasImap`, `hasAnthropicKey`). Reuse, don't invent badge styling.

### Don't break / preserve list
- **Email-features gate (two places):** (1) the new `/config/connections/inbox` route's `beforeLoad` must keep the `emailFeatures` → redirect-to-`/` guard; (2) the new Connections landing's Inbox **tile** must keep the `emailFeatures &&` render gate. Dropping either is a regression.
- **Gmail return handling:** `connections-inbox.tsx` reads `?gmail=` from `window.location.search` and strips it via `window.history.replaceState(..., window.location.pathname)`. Because it uses `window.location.pathname` (not a hardcoded path), it self-corrects to the new URL — **do not** hardcode any path in that component.
- **Onboarding `beforeLoad` (`router.ts:139`)** keys off `?gmail` presence to avoid bouncing a completed user away; the Gmail callback for the **onboarding** surface still returns to `/onboarding` (Task 7 only repoints the **config** surface). Don't touch the onboarding branch.
- **strict `noUnusedLocals`/`noUnusedParameters`:** removing tiles in Task 6 may orphan imports/locals — those become hard compile errors, not warnings. Run tsc and clean up exactly what's orphaned (nothing more).
- **No API/DB changes.** Task 7 edits are redirect-target **strings** + their test assertions — not API contracts, schemas, or query keys. That is the only server surface this story touches, and it's mandated by AC5/AC6 ("onboarding" references must point to the new path).

### Project Structure Notes
- Route component files are kebab-case (`connections-linkedin.tsx`), exports are PascalCase (`ConnectionsLinkedinRoute`) — matches the existing `src/client/routes/config/` convention.
- Path aliases: `@/*` → `src/client/*`. New files import UI/hooks via `@/...` like their siblings.
- No `src/shared/schemas.ts` changes — no new cross-boundary types. No new hooks — reuse `useOnboardingStatusQuery`, `useFeatureSettingsQuery`, `useInboxMappingsQuery`, `useGmailMappingsQuery`.
- `git mv` (not delete+create) so history follows the files; all three are tracked (verified).

### Testing
- **No DOM/component test harness exists in this repo** (same convention as Epic 46 + story 47.1 — JSX route wiring is verified by manual `bun run dev` walkthrough, not rendered tests). Do **not** add a test library or render harness.
- The **one** automated test impacted is `src/server/routes/api-onboarding.test.ts` (two redirect-location assertions) — update them (Task 7) and confirm the file passes with `bun test`. Test rules: `bun:test`, `process.env.DB_PATH=':memory:'` already set at top, assert exact `location` header strings.
- Verification bar is **zero new** tsc errors vs. the ~88 baseline and a green `bun run build` — not zero absolute (per 47.1 / Epic 46).

### Previous Story Intelligence (47.1)
- 47.1 built the ordered `SECTIONS` array in `layout.tsx` and **already** lists the Connections children — but pointing at the OLD paths (`/config/job-sources/auth-setup`, `/config/profile/inbox-mapping`, `/config/profile/api-keys`) and with **no `to`** on the Connections header. This story just updates those three `to=` targets and adds the header `to`. Don't rebuild the array.
- 47.1 used final group-coherent display labels (LinkedIn / Inbox / API Key) in the sidenav already — so the sidenav labels are correct; only the targets change.
- 47.1's documented "interim cross-section highlight caveat" and "Connections header is an inert div" deferrals are **closed by this story** (Connections children move under `/config/connections/*`; header becomes a Link). Note this in the completion notes.
- Repo baseline at 47.1 review: **88 tsc errors**, build green. Same bar here.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-47-config-ia-restructure.md#Story 47.2] — ACs, dev note (relocate files, register new routes + `/config/connections` index, `beforeLoad` redirects at old paths, reuse loaders verbatim, update `ConfigBreadcrumb`, no API/DB changes).
- [Source: _bmad-output/planning-artifacts/epics/epic-47-config-ia-restructure.md (Architecture note)] — `_config` pathless layout from Epic 35; TanStack Router `beforeLoad` → `throw redirect({ to })`; `activeOptions` parent-active; query hooks reused unchanged.
- [Source: src/client/lib/router.ts:236-273,357-372] — old route consts for api-keys/inbox-mapping/auth-setup (loaders + inbox emailFeatures `beforeLoad`), and the `configLayoutRoute.addChildren` list to extend; `redirect` imported at line 1.
- [Source: src/client/routes/config/layout.tsx:32-39] — Connections section's three children (old `to=` targets) + label-only header to give a `to`.
- [Source: src/client/components/config/ConfigBreadcrumb.tsx:3-18] — `PATH_LABELS` map to edit.
- [Source: src/client/routes/config/profile-index.tsx:50,77-104 / job-sources-index.tsx:19-44] — overview tiles to remove (and the tile markup pattern to mirror in `connections-index.tsx`).
- [Source: src/client/routes/config/profile-inbox-mapping.tsx:25,73,80,180] — export name, `window.location` gmail read/replace (path-agnostic), `<h1>`.
- [Source: src/server/middleware/auth-middleware.ts:11-12 / api-onboarding.ts:203-220] — config-surface Gmail-callback redirects to repoint; [api-onboarding.test.ts:412,434] — assertions to update.
- [Source: _bmad-output/project-context.md] — TanStack Router/Query rules, strict `noUnusedLocals`, kebab-case files / PascalCase components, error shape `{ error }`, no DOM test harness convention.

### Open Questions (non-blocking; defaults chosen above)
- **Q1 — Moved-page `<h1>` headings:** Default updates `Auth Setup`→`LinkedIn` and `API Keys`→`API Key` so the page title matches the new nav label (consistent with 47.1's final-label choice). The inbox page keeps its `Inbox Mapping` heading (it's a descriptive page title, and the area is "Inbox" in nav/breadcrumb). If you'd rather keep all original headings verbatim, that still satisfies every AC (headings are display-only) — flag it and the dev keeps them.
- **Q2 — Connections card on the `/config` overview grid:** The top-level overview (`overview.tsx`) still lists Profile / Job Sources / Prompts / Logs and has no Connections card. No 47.2 AC requires editing it (it references only section indexes, none of which are moving paths), so the default leaves it untouched and the full overview-grid reconciliation rides with 47.3's IA settling. If you want a Connections card added to the overview grid now, say so.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- `bunx tsc --noEmit` → 88 errors (= documented baseline; zero new). Only changed-file errors are the 2 pre-existing `auth-middleware.ts:37` `data.impersonating` errors (line 37, untouched — this story edited line 12 only).
- `bun run build` → exit 0, built in ~775ms.
- `bun test src/server/routes/api-onboarding.test.ts` → 38 pass / 5 fail. Stash-compared: identical 38/5 with the server changes reverted, proving the 5 fails (all in the `PUT /api/onboarding/linkedin` block — env/network-dependent) pre-date this story and the paired source+test redirect edits are consistent.
- `bun test` (full repo) → 483 pass / 40 fail (40 = documented repo-wide env-dependent baseline; no new failures).

### Completion Notes List

- **Pure MOVE story** — reused the three component bodies verbatim; only changes were `git mv` (history preserved), export renames, and the two sanctioned cosmetic `<h1>`s (`Auth Setup`→`LinkedIn`, `API Keys`→`API Key`; inbox kept `Inbox Mapping`). Q1/Q2 defaults taken as written.
- **No live reference targets a redirect (AC6):** sidenav, breadcrumb `PATH_LABELS`, both overview pages, and both server Gmail-callback redirects all point at `/config/connections/*`. The only remaining old-path strings in the repo are the three redirect-route `path:` declarations in `router.ts` (intended — they catch stale bookmarks per AC5).
- **Guards carried to the NEW inbox path:** `/config/connections/inbox` keeps the `emailFeatures` `beforeLoad` → redirect-to-`/` gate and the 3-key loader (`onboarding-status`, `inbox-mappings`, `gmail-mappings`); the Connections-landing Inbox tile keeps its `emailFeatures &&` render gate. Old `/config/profile/inbox-mapping` is now a bare redirect.
- **Badges kept (AC7):** the moved API-key page renders its own `hasAnthropicKey` badge; the new landing renders Configured/Incomplete badges per area from `useOnboardingStatusQuery()` (reused the existing emerald/zinc span markup).
- **Closes 47.1 deferrals:** the Connections header is now a real `<Link to="/config/connections">` (no longer an inert `<div>`), and moving the three children under `/config/connections/*` resolves 47.1's interim cross-section parent-highlight caveat for Connections. (System stays a label — its index lands in 47.3.)
- **Orphan cleanup (strict `noUnusedLocals`):** removed now-unused `useOnboardingStatusQuery`/`useFeatureSettingsQuery`/`status`/`featureSettings`/`apiKeysConfigured`/`inboxConfigured`/`emailFeatures` from `profile-index.tsx` and `useOnboardingStatusQuery`/`status`/`authConfigured` from `job-sources-index.tsx`. `useProfileQuery`/`useSearchConfigsQuery` retained (still used).
- **No API/DB/schema changes** — Task 7 edits are redirect-target strings + their two test assertions only.
- **OUTSTANDING:** the human-in-the-loop `bun run dev` browser walkthrough (Task 8 final subtask) — no DOM/render harness exists in this repo (Epic 46 / 47.1 convention), so JSX route wiring is verified manually by a human, not automated tests.

### File List

- `src/client/routes/config/connections-linkedin.tsx` (renamed from `job-sources-auth-setup.tsx`; export + `<h1>`)
- `src/client/routes/config/connections-inbox.tsx` (renamed from `profile-inbox-mapping.tsx`; export only)
- `src/client/routes/config/connections-api-key.tsx` (renamed from `profile-api-keys.tsx`; export + `<h1>`)
- `src/client/routes/config/connections-index.tsx` (new — Connections section landing)
- `src/client/lib/router.ts` (imports; 4 new routes; 3 old paths → redirect routes; `addChildren` list)
- `src/client/routes/config/layout.tsx` (Connections sidenav children repointed + header `to`)
- `src/client/components/config/ConfigBreadcrumb.tsx` (`PATH_LABELS` swap)
- `src/client/routes/config/profile-index.tsx` (removed API Keys + Inbox tiles + orphaned imports/locals)
- `src/client/routes/config/job-sources-index.tsx` (removed Auth Setup tile + orphaned imports/locals)
- `src/server/middleware/auth-middleware.ts` (Gmail-callback unauthorized redirect target)
- `src/server/routes/api-onboarding.ts` (config-surface Gmail-callback redirect target)
- `src/server/routes/api-onboarding.test.ts` (2 redirect-location assertions)

## Change Log

| Date | Change |
|---|---|
| 2026-06-29 | Story 47.2 drafted — Connections section: relocate LinkedIn/Inbox/API-Key pages under `/config/connections`, new section landing, `beforeLoad` redirects at old paths, repoint sidenav/breadcrumb/overview tiles/server onboarding redirects, update api-onboarding test expectations. Status → ready-for-dev. |
| 2026-06-29 | Story 47.2 implemented — all 8 tasks complete. `git mv` + rename 3 pages, new `connections-index.tsx` landing, 4 new routes + 3 redirect routes in `router.ts`, sidenav/breadcrumb repointed, moved tiles removed from overview pages, server Gmail-callback redirects + 2 test assertions updated. tsc 88 (zero new) / build green / api-onboarding redirect tests pass / full suite 483 pass at baseline. Status → review. Human-in-the-loop browser walkthrough remains OUTSTANDING (no DOM harness). |
| 2026-06-29 | Code review (3-layer: Blind Hunter + Edge Case Hunter + Acceptance Auditor). Acceptance Auditor: PASS, all 8 ACs MET. 0 decision-needed, 0 patch, 2 deferred to 47.3 (overview-grid reconciliation — spec-scoped-out per Task 6/Q2), 2 dismissed (fuzzy header active-highlight = spec Task 4 intent; `LinkProps['to']` typing refuted by tsc). tsc re-verified 88 = baseline, zero new. Status → done. |

### Review Findings

_Code review 2026-06-29 — Blind Hunter + Edge Case Hunter + Acceptance Auditor. 0 decision-needed, 0 patch, 2 deferred, 2 dismissed. Acceptance Auditor: PASS, all 8 ACs MET._

- [x] [Review][Defer] Overview Profile completion badge keyed on moved settings [src/client/routes/config/overview.tsx:15] — deferred to 47.3. `profileConfigured = !!(status?.hasAnthropicKey && profile?.name && status?.hasImap)` still treats API-Key + IMAP as Profile-completion criteria, but 47.2 moved both into Connections. Spec Task 6 / Q2 explicitly scope `overview.tsx` out and defer the overview-grid reconciliation to 47.3. Med severity (Profile card can read "Incomplete" for reasons no longer under Profile, esp. with email features off where `hasImap` is always false).
- [x] [Review][Defer] No "Connections" card on the `/config` overview grid [src/client/routes/config/overview.tsx] — deferred to 47.3. New top-level section not surfaced on the overview landing (only Profile / Job Sources / Prompts / Logs cards). Spec Q2 explicitly defers adding a Connections card to 47.3.

**Dismissed (verified false positives):**
- Section-header active highlight uses fuzzy (not `exact`) matching → parent header lights up on child routes. This is the spec-mandated behavior (Task 4: "fuzzy parent-active highlighting like Profile/Sources/Prompts"); also closes 47.1's interim cross-section-highlight caveat. Not a regression.
- `type ToPath = LinkProps['to']` weakens path typechecking → refuted: `tsc` output shows the `to` union still resolves to the strongly-typed registered-route literal union (typos still caught); `layout.tsx` + `connections-index.tsx` produce zero tsc errors.
