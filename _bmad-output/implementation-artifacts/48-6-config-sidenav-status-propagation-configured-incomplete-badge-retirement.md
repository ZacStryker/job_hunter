---
baseline_commit: 3497542bb3da6b292a26a293acb347b60975afb5
---

# Story 48.6: Config Sidenav Status Propagation & Configured/Incomplete Badge Retirement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user fixing my setup inside Config,
I want attention status to show contextually next to the exact nav item that needs it,
so that I can see what's wrong while navigating — and the old Configured/Incomplete badges, now redundant, are removed.

## Acceptance Criteria

1. **Child-item status dots** — In the Config sidenav (`ConfigLayout`, `src/client/routes/config/layout.tsx`), when a setup task **needs attention** (it is `broken`, **or** it is a `required` task that is not `complete`), a small status dot appears next to the specific child link it maps to: `linkedin`→**LinkedIn**, `apiKey`→**API Key**, `profile`→**Candidate Info**, `inboxConnect`/`inboxMapping`→**Inbox**. Status is read from `useSetupStatus()` — no page-local re-derivation.

2. **Parent section roll-up** — When any child item inside a section needs attention, that section's **parent header** (e.g. `Connections`, `Profile`) also shows a roll-up dot, so a scanned sidenav still signals which section has the issue.

3. **User menu stays clean** — Sidenav dot propagation is **sidenav-only**. The Story 48.5 `UserMenu` must continue to show **no** dots/badges in any setup state (do not touch `UserMenu.tsx`; do not add `useSetupStatus` to it).

4. **No dots when healthy** — When all setup is complete/healthy (no task needs attention), **no** status dot appears anywhere in the sidenav — not on any child link, not on any section header.

5. **Configured/Incomplete badge retirement (FR47.7)** — The Epic-35 `Configured`/`Incomplete` status badges on Config overview tiles and section-index pages are **removed**. After this story there is **no** `Configured` or `Incomplete` badge, and **no** stale `Configured`/`Incomplete` string, anywhere in the Config UI. The Notifications dropdown (48.4) + sidenav dots (this story) are the single setup-status surface.

6. **Tiles/links still work after removal** — The affected overview/section pages still render and navigate correctly (every tile/`Link` intact); only the status-badge `<span>` element (and its now-dead derivation + newly-unused query import) is gone.

7. **The Prompts `Edited`/`Default` badge is retained** — It is driven by `usePromptsQuery` (prompt customization), is **not** a setup-status/`Configured`/`Incomplete` badge, and is out of scope for this retirement. Leave it and its `usePromptsQuery`/`promptsEdited` wiring in `overview.tsx` untouched.

8. **Baseline held** — `bunx tsc --noEmit` introduces **zero** new errors over the 87-error baseline in any touched file (strict `noUnusedLocals` will flag any query hook left imported after its only consumer — the removed badge — is deleted; remove those imports). `bun run build` stays green.

## Tasks / Subtasks

- [x] **Task 1 — Sidenav task→nav mapping + attention pures** (AC: #1, #2, #4)
  - [x] In `src/client/routes/config/layout.tsx`, export a pure `taskNeedsAttention(t: SetupTask): boolean` returning `t.state === 'broken' || (t.tier === 'required' && t.state !== 'complete')`. (This mirrors the `alert` half of `computeBadge` in `useSetupStatus.ts:24-34`, but per-task.) [Source: useSetupStatus.ts:24-34; epic-48 Story 48.6 AC1]
  - [x] Export a static map from each child link's `to` path to the setup task ids it represents:
    ```ts
    import type { SetupTaskId } from '@shared/schemas'
    const NAV_TASK_IDS: Partial<Record<string, SetupTaskId[]>> = {
      '/config/profile/resume': ['profile'],
      '/config/connections/linkedin': ['linkedin'],
      '/config/connections/inbox': ['inboxConnect', 'inboxMapping'],
      '/config/connections/api-key': ['apiKey'],
    }
    ```
    Keys are the exact `to` literals already in `SECTIONS` (layout.tsx:22-57). `Inbox` intentionally maps to **both** inbox tasks (a dot shows if either connect or mapping needs attention). Nav items with no setup task (Searches, Blacklist, Prompts children, Logs, Privacy) are simply absent from the map. [Source: layout.tsx:18-58; epic-48 Story 48.6 AC1; SETUP_TASK_ORDER src/shared/schemas.ts:390]
  - [x] Export a pure `childNeedsAttention(to: ToPath, tasks: SetupTask[]): boolean` = the link's mapped task ids exist and **some** mapped task `taskNeedsAttention`. Use `String(to)` to index `NAV_TASK_IDS` (the `to` union stringifies to the path literal). Return `false` for unmapped links.
  - [x] Export a pure `sectionNeedsAttention(section: Section, tasks, emailFeatures): boolean` = **some visible** child link (respecting the `requiresEmail && !emailFeatures` hide rule, AC re: Inbox hidden) `childNeedsAttention`. This drives the parent roll-up dot so hidden children never contribute.
- [x] **Task 2 — Render dots in `ConfigLayout`** (AC: #1, #2, #3, #4)
  - [x] In `ConfigLayout`, add `const { tasks } = useSetupStatus()` (import from `@/hooks/useSetupStatus`). This is the **only** new data source; do not add a second fetch or duplicate state. The hook already owns its SSE subscription + `['setup-status']` query — mounting it here just makes the sidenav a live consumer. [Source: useSetupStatus.ts:36-55]
  - [x] Child link: when `childNeedsAttention(link.to, tasks)`, render a status dot inside the existing child `<Link>` (after the label text). Keep the label + dot on one row (e.g. wrap current `{link.label}` so the dot sits inline, `flex items-center justify-between` or a trailing `<span>` — match the compact sidenav density). Dot markup: `<span className="ml-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />`. Use the **amber** alert weight already established for broken/alert rows in `NotificationsDropdown.tsx` (`bg-amber-500` / `text-amber-400`) and `BadgeDot` (`bg-amber-500`). [Source: NotificationsDropdown.tsx:77,128,133]
  - [x] Section header: when `sectionNeedsAttention(section, tasks, emailFeatures)`, render the same amber dot next to the header label — in **both** the `section.to` `<Link>` branch and the plain `<div>` branch (all current sections have a `to`, but keep both paths correct). Place the dot after `{section.label}`.
  - [x] Do **not** touch `UserMenu.tsx` (AC3) or any other top-bar control. Propagation is confined to `layout.tsx`.
- [x] **Task 3 — Retire Configured/Incomplete badges** (AC: #5, #6, #7, #8)
  - [x] `src/client/routes/config/overview.tsx` — remove the three `Configured`/`Incomplete` badge blocks on the **Profile** (lines 45-48), **Sources** (72-75), and **Connections** (99-102) tiles, plus their derivations `profileConfigured` (15), `sourcesConfigured` (16), `connectionsConfigured` (17). Then remove the now-unused imports/hooks: `useOnboardingStatusQuery` + `const { data: status }`, `useProfileQuery` + `const { data: profile }`, `useSearchConfigsQuery` + `const { data: searchConfigs = [] }`. **KEEP** `usePromptsQuery`/`promptsEdited` and the **Prompts** `Edited`/`Default` badge (lines 18, 126-129) — AC7. Keep `Tooltip*`/`CircleHelp`/`Link`. [Source: overview.tsx:1-18,45-48,72-75,99-102,126-129]
  - [x] `src/client/routes/config/connections-index.tsx` — remove the three badge blocks (LinkedIn 41-44, Inbox 69-72, API Key 97-100) and their derivations `linkedinConfigured`/`inboxConfigured`/`apiKeyConfigured` (11-13). Remove `useOnboardingStatusQuery` + `const { data: status }` (now unused). **KEEP** `useFeatureSettingsQuery`/`emailFeatures` — it still gates the Inbox tile (line 48). [Source: connections-index.tsx:1-14,41-44,69-72,97-100]
  - [x] `src/client/routes/config/connections-api-key.tsx` — remove **only** the header badge block (lines 57-60). **KEEP** `useOnboardingStatusQuery` + `const { data: status }` — `status?.hasAnthropicKey` is still used for the input `placeholder` (line 73). [Source: connections-api-key.tsx:10,13,57-60,73]
  - [x] `src/client/routes/config/profile-index.tsx` — remove the badge block (36-39) + `resumeConfigured` (9) + the now-unused `useProfileQuery` import & `const { data: profile }` (2,7). [Source: profile-index.tsx:1-9,36-39]
  - [x] `src/client/routes/config/sources-index.tsx` — remove the Searches badge block (36-39) + `searchesConfigured` (9) + the now-unused `useSearchConfigsQuery` import & `const { data: searchConfigs = [] }` (2,7). (Blacklist tile has no badge — leave it.) [Source: sources-index.tsx:1-9,36-39]
  - [x] **Grep-verify** no `Configured`/`Incomplete` string remains anywhere under `src/` (`grep -rn "Configured\|Incomplete" src/`). The only surviving `emerald-900/emerald-400` "green pill" should be the Prompts **Edited** badge in `overview.tsx`. [Source: epic-48 Story 48.6 AC5/AC6]
- [x] **Task 4 — Tests (exported pures only)** (AC: #1, #2, #4)
  - [x] Co-located `src/client/routes/config/layout.test.ts` (`bun:test`, `describe/test/expect`). **No React DOM harness exists** (Epic 46 / 48.3 / 48.4 / 48.5 precedent — pures only; do NOT add `@testing-library/*` or render `ConfigLayout`).
  - [x] `taskNeedsAttention`: `broken`→true (any tier); required `notStarted`/`partial`→true; required `complete`→false; optional `notStarted`/`partial`→false; optional `broken`→true.
  - [x] `childNeedsAttention`: `/config/connections/linkedin` true when the `linkedin` task is broken; `/config/connections/inbox` true when **either** `inboxConnect` or `inboxMapping` is broken (and false when both healthy); unmapped path (e.g. `/config/sources/searches`) always false.
  - [x] `sectionNeedsAttention`: Connections section true when a mapped child needs attention; false when all healthy; **Inbox-broken with `emailFeatures=false` → false** (hidden child does not roll up).
  - [x] Build test `SetupTask[]` fixtures inline from `@shared/schemas` types (plain objects — no DB, no `:memory:`). Include `dismissed`/`progress`/`dependsOn` fields to satisfy the type. [Source: src/shared/schemas.ts:396-403]
- [x] **Task 5 — Verify baselines** (AC: #8)
  - [x] `bunx tsc --noEmit` → still **87** errors, **zero** new in touched files (watch strict `noUnusedLocals` after each import removal). `bun run build` → green. `bun test src/client/routes/config/layout.test.ts` → all new pures pass.
  - [x] **Manual `bun run dev` walkthrough owed** (no DOM harness): with a broken/incomplete setup, confirm an amber dot on the exact child (e.g. LinkedIn) + its section header (Connections); with all healthy, no dots anywhere; confirm the User menu shows no dots; confirm the Config overview + section pages no longer show any `Configured`/`Incomplete` pill but still navigate, and the Prompts tile still shows `Edited`/`Default`.

### Review Findings

- [x] [Review][Patch] Guard `taskNeedsAttention` with `!t.dismissed` [layout.tsx:20-22] — resolved from decision; applied (`if (t.dismissed) return false`) + test added (12 pass, tsc 87 held). `taskNeedsAttention` ignores `dismissed` — a dismissed but `broken` optional inbox task (`inboxConnect`/`inboxMapping`) keeps a permanent, unclearable amber dot on the **Inbox** child + **Connections** header in the sidenav. The sibling consumer `NotificationsDropdown` filters `!t.dismissed` (drops it from the list + `hasBroken`), so the two consumers of `useSetupStatus` diverge on exactly the `broken`+`dismissed` state dismissal targets, and there is no dismiss affordance in the sidebar to clear it. Spec's AC1 formula (`layout.tsx:20-22`) deliberately omits `dismissed`; resolving requires product intent. [layout.tsx:20-22 `taskNeedsAttention`; NotificationsDropdown.tsx:137,211] (blind+edge)

## Dev Notes

### What this story is (and is NOT)
- **IS:** the **final** Epic-48 story — (a) propagate setup-status attention into the **Config sidenav** at the item level (child dots + parent roll-up), reading the existing `useSetupStatus` hook; and (b) **retire** the Epic-35 `Configured`/`Incomplete` tile/section badges now made redundant by the Notifications dropdown (48.4) + these sidenav dots. After this, the Configured/Incomplete model is fully replaced by Epic 48. [Source: epic-48 Story 48.6; Epic Goal]
- **IS NOT:** any server/schema/route/migration/SSE change (all shipped in 48.1/48.2), any change to the top-bar cluster, the Notifications dropdown, or the User menu. It does **not** change how any setup page saves data. It does **not** remove the Prompts `Edited`/`Default` badge (per product decision — that badge tracks prompt customization, not setup status). Pure client work in `layout.tsx` + five Config route files + one test file.

### Consume, don't rebuild — the hook already exists
`useSetupStatus()` (`src/client/hooks/useSetupStatus.ts`) already: loads `GET /api/setup-status` via TanStack Query key `['setup-status']`, subscribes to `setup-status` SSE events on the shared Epic-46 EventSource (`subscribeActivityStream`), and exposes `{ tasks, ready, badge }`. The sidenav just needs `tasks`. Mounting the hook in `ConfigLayout` makes the sidenav a live, push-driven consumer with **no** new fetch and **no** duplicated state — exactly what 48.4's `NotificationsDropdown` does. Do **not** re-derive status from `useOnboardingStatusQuery`/`useProfileQuery` in the sidenav; that would reintroduce the exact duplication Epic 48 exists to remove. [Source: useSetupStatus.ts:36-55; NotificationsDropdown.tsx (single-source consumer)]

### `SetupTask` shape (from `@shared/schemas`, do not redefine)
```ts
// src/shared/schemas.ts:390-403
SETUP_TASK_ORDER = ['linkedin','apiKey','profile','inboxConnect','inboxMapping']
SetupTask = { id: SetupTaskId; state: 'notStarted'|'partial'|'complete'|'broken';
              tier: 'required'|'optional'; dependsOn: SetupTaskId|null;
              dismissed: boolean; progress: { filled: number; total: number } | null }
```
Tiers (fixed by 48.1): `linkedin`,`apiKey`,`profile` = **required**; `inboxConnect`,`inboxMapping` = **optional**. So a plain incomplete inbox never dots the sidenav — only a **broken** inbox does (attention = broken ∨ required-incomplete). This is deliberate and matches the `alert` badge rule. [Source: src/shared/schemas.ts:390-403; epic-48 Story 48.1 tiers; useSetupStatus.ts:26-33]

### Attention rule — keep it a single shared pure
`taskNeedsAttention(t) = t.state === 'broken' || (t.tier === 'required' && t.state !== 'complete')`. This is the **per-task** form of `computeBadge`'s `alert` branch; keep it exported so the dot logic and any future consumer share one definition. Do **not** import `computeBadge` for this (it takes the whole status and returns a global badge, not per-item). [Source: useSetupStatus.ts:24-34]

### Task→nav mapping (the crux)
The sidenav `SECTIONS` (layout.tsx:18-58) already has stable `to` literals. Map by `to` path, not by label:
| setupTaskId | nav child (`to`) | section |
|---|---|---|
| `profile` | `/config/profile/resume` (Candidate Info) | Profile |
| `linkedin` | `/config/connections/linkedin` | Connections |
| `apiKey` | `/config/connections/api-key` | Connections |
| `inboxConnect` + `inboxMapping` | `/config/connections/inbox` | Connections |

`inboxMapping.dependsOn === 'inboxConnect'`, but for the sidenav dot you do **not** need the dependency gate the dropdown uses — a broken mapping and a broken connect both surface on the single **Inbox** item. Sections without setup tasks (Sources, Prompts, System) never dot. [Source: layout.tsx:18-58; epic-48 Story 48.6 AC1]

### `emailFeatures` / hidden Inbox edge (don't roll up a hidden child)
The Inbox child link is hidden when `!emailFeatures` (layout.tsx:81 `link.requiresEmail && !emailFeatures ? null`). Compute child dots **only for visible** links and roll up the section dot **only from visible** children, so a broken inbox task while email features are off does not light up the Connections header for a link the user can't see. `ConfigLayout` already reads `emailFeatures` via `useFeatureSettingsQuery` (layout.tsx:61-62) — reuse it; `sectionNeedsAttention` takes it as a param. [Source: layout.tsx:61-62,80-92]

### Dot visual — reuse the established amber alert weight
The app already uses **amber** as the alert/broken weight: `NotificationsDropdown` `BadgeDot` (`badge==='alert' ? 'bg-amber-500' : 'bg-zinc-500'`, :77), broken rows (`text-amber-400`, :128,133). Use one amber dot for **both** broken and required-incomplete in the sidenav (AC1 groups them). A tiny `h-1.5 w-1.5 rounded-full bg-amber-500` inline span reads well against the `text-xs` sidenav. `aria-hidden` on the dot (decorative; the item label still names the destination). Do not introduce a numeric badge or a `⚠` glyph unless you prefer it — a dot is sufficient and matches `BadgeDot`. [Source: NotificationsDropdown.tsx:63-79,128,133]

### Badge retirement — precise removals & the import-cleanup trap
Five files. The trap is **TS strict `noUnusedLocals`**: deleting a badge often orphans the query hook that fed it. Per-file (verified against current source):
- **overview.tsx** — remove 3 badges (Profile/Sources/Connections) + 3 derivations. `useOnboardingStatusQuery`, `useProfileQuery`, `useSearchConfigsQuery` become unused → **remove all three imports + their `const { data }` lines**. `usePromptsQuery` stays (Prompts `Edited` badge, AC7). [overview.tsx:1-18,45-48,72-75,99-102]
- **connections-index.tsx** — remove 3 badges + 3 derivations. `useOnboardingStatusQuery` unused → remove import + `const { data: status }`. **Keep** `useFeatureSettingsQuery`/`emailFeatures` (gates Inbox tile). [connections-index.tsx:8-14,41-44,69-72,97-100]
- **connections-api-key.tsx** — remove header badge only. **Keep** `useOnboardingStatusQuery`/`status` (used by input `placeholder` line 73). [connections-api-key.tsx:57-60,73]
- **profile-index.tsx** — remove badge + `resumeConfigured` + unused `useProfileQuery` import & `const`. [profile-index.tsx:2,7,9,36-39]
- **sources-index.tsx** — remove Searches badge + `searchesConfigured` + unused `useSearchConfigsQuery` import & `const`. [sources-index.tsx:2,7,9,36-39]

After removal, `grep -rn "Configured\|Incomplete" src/` must return **nothing** (AC5/AC6). The `emerald-900`/`emerald-400` green pill survives **only** as the Prompts `Edited` badge.

### Project rules that bite here (non-negotiable)
- **Server state only in TanStack Query** — the sidenav reads status via `useSetupStatus`; the only local `useState` allowed in `ConfigLayout` is none (it has none today — keep it that way). No copying `tasks` into component state. [Source: project-context.md React rules]
- **Shared types only from `@shared/schemas`** — import `SetupTask`/`SetupTaskId` types; never redefine. shadcn `ui/` files are generated — don't hand-edit. [Source: project-context.md]
- **TS strict** — no unused imports/vars after badge removal (see per-file cleanup); no `_` suppression; **no comments** unless non-obvious. [Source: project-context.md]
- **Naming/paths** — pures live in `layout.tsx` (exported for co-located `layout.test.ts`); path aliases `@/*`→`src/client/*`, `@shared/*`→`src/shared/*`. [Source: project-context.md Naming/File Org]

### Testing standards summary
- `bun:test` (`describe/test/expect`), co-located `layout.test.ts` beside `layout.tsx` — no `__tests__/`. [Source: project-context.md Testing]
- **No React DOM render harness in the repo** (Epic 46 / 48.3 / 48.4 / 48.5 precedent). Test only the **exported pures** — `taskNeedsAttention`, `childNeedsAttention`, `sectionNeedsAttention` (+ the `NAV_TASK_IDS` map indirectly). Plain in-memory `SetupTask[]` fixtures; no DB, no `:memory:`. JSX/dot rendering is verified by `tsc` + `bun run build` + manual `bun run dev`. This mirrors 48.4/48.5 where only the exported pures were unit-tested. [Source: UserMenu.test.ts; NotificationsDropdown.test.ts; useSetupStatus.test.ts]

### Baselines (bar is zero-new)
- `bunx tsc --noEmit`: **87** pre-existing errors (48.5 baseline). Introduce **zero** new in any touched file. Removing badges tends to *reduce* errors if any touched line was in the baseline — that is fine (zero-new is the bar; a drop is acceptable). [Source: 48-5 Debug Log — 87 baseline]
- Full `bun test`: ~**568 pass / ~43 pre-existing** flaky `:memory:` fails (run-to-run variance); your new pures add to the pass count with zero regressions. [Source: 48-5 Debug Log]
- `bun run build`: green.

### Project Structure Notes
- **New file:** `src/client/routes/config/layout.test.ts`.
- **Edited files:** `src/client/routes/config/layout.tsx` (add `useSetupStatus` + exported pures + dot rendering), `overview.tsx`, `connections-index.tsx`, `connections-api-key.tsx`, `profile-index.tsx`, `sources-index.tsx` (badge retirement + import cleanup).
- **No** server/schema/route/migration/SSE change; **no** change to `Layout.tsx`, `UserMenu.tsx`, `NotificationsDropdown.tsx`, `ActivityIndicator.tsx`, `useSetupStatus.ts`.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-48-notifications-dropdown-top-nav-cluster.md#Story 48.6] (ACs; dev-note: map each `setupTaskId` to its sidenav item + parent for dot placement in `layout.tsx`; badge retirement targets Epic-35 tile badges, leave tiles/links; grep for badge strings; final story)
- [Source: _bmad-output/implementation-artifacts/48-5-user-menu-three-icon-top-right-cluster.md] (sibling — pures-only no-DOM-harness convention, amber weight, baselines; AC6 there = user menu stays dotless, mirrored by AC3 here)
- [Source: src/client/routes/config/layout.tsx:18-92] (`SECTIONS`, child-link `requiresEmail` hide rule, `useFeatureSettingsQuery`/`emailFeatures` — the file to edit)
- [Source: src/client/hooks/useSetupStatus.ts:24-55] (`useSetupStatus` → `{ tasks, ready, badge }`; `computeBadge` alert rule to mirror per-task)
- [Source: src/client/components/shared/NotificationsDropdown.tsx:63-79,128,133] (amber `bg-amber-500`/`text-amber-400` alert weight to reuse)
- [Source: src/shared/schemas.ts:390-414] (`SETUP_TASK_ORDER`, `setupTaskSchema`, `SetupTask`/`SetupTaskId` types)
- [Source: src/client/routes/config/{overview,connections-index,connections-api-key,profile-index,sources-index}.tsx] (the five badge locations + exact import-cleanup needs)
- [Source: _bmad-output/project-context.md] (React/TanStack Query/naming/testing/type-safety rules)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `bun test src/client/routes/config/layout.test.ts` → 11 pass / 0 fail (16 expect calls).
- `bunx tsc --noEmit` → 87 errors (baseline held), zero in any touched file.
- `bun run build` → green.
- `grep -rn "Configured\|Incomplete" src/` → only server-side `gmail-oauth` identifiers (`isGmailConfigured`, `GmailNotConfiguredError`) remain — no Config-UI badge string. `emerald-900/emerald-400` survives only as the Prompts `Edited` badge (AC7) and the out-of-scope inbox `Connected`/test-button pills.

### Completion Notes List

- **Task 1/2 (sidenav dots):** Added exported pures `taskNeedsAttention`, `childNeedsAttention`, `sectionNeedsAttention` + `NAV_TASK_IDS` map (keyed by child `to` literal) + exported `SECTIONS`/`Section` (for co-located tests) to `layout.tsx`. `ConfigLayout` now mounts `useSetupStatus()` as its only new data source (no second fetch, no `useState` mirror) and renders a single amber dot (`bg-amber-500`, `aria-hidden`) inline after each attention child link and after each section header (both `<Link>` and `<div>` header branches). Hidden Inbox (`requiresEmail && !emailFeatures`) never dots and never rolls up.
- **Task 3 (badge retirement):** Removed all Configured/Incomplete badge blocks + their derivations across `overview.tsx`, `connections-index.tsx`, `connections-api-key.tsx`, `profile-index.tsx`, `sources-index.tsx`, and dropped the now-orphaned query-hook imports (`useOnboardingStatusQuery` in overview + connections-index, `useProfileQuery` in overview + profile-index, `useSearchConfigsQuery` in overview + sources-index) to satisfy strict `noUnusedLocals`. Kept `usePromptsQuery`/Prompts `Edited` badge (AC7), `useFeatureSettingsQuery` in connections-index (gates Inbox tile), and `useOnboardingStatusQuery`/`status` in connections-api-key (drives the input placeholder).
- **UserMenu.tsx untouched** (AC3). No server/schema/route/migration/SSE change.
- **Owed:** manual `bun run dev` walkthrough (no DOM harness) — confirm amber dot on the exact broken/incomplete child + its section header, none when healthy, User menu dotless, Config tiles/section pages navigate with no Configured/Incomplete pill but Prompts still shows Edited/Default.

### File List

- `job-hunt-dashboard/src/client/routes/config/layout.tsx` (modified — pures + `useSetupStatus` + dot rendering)
- `job-hunt-dashboard/src/client/routes/config/layout.test.ts` (new — exported-pure unit tests)
- `job-hunt-dashboard/src/client/routes/config/overview.tsx` (modified — badge retirement + import cleanup)
- `job-hunt-dashboard/src/client/routes/config/connections-index.tsx` (modified — badge retirement + import cleanup)
- `job-hunt-dashboard/src/client/routes/config/connections-api-key.tsx` (modified — header badge removed)
- `job-hunt-dashboard/src/client/routes/config/profile-index.tsx` (modified — badge retirement + import cleanup)
- `job-hunt-dashboard/src/client/routes/config/sources-index.tsx` (modified — badge retirement + import cleanup)

## Change Log

| Date | Change |
| --- | --- |
| 2026-07-01 | Created Story 48.6 — Config sidenav status propagation (child dots + parent roll-up from `useSetupStatus`) + retirement of the Epic-35 Configured/Incomplete tile/section badges (Prompts Edited/Default retained per product decision). Final story of Epic 48. Status → ready-for-dev. |
| 2026-07-01 | Implemented all 5 tasks — sidenav attention pures + amber dots (child + section roll-up) reading `useSetupStatus`; retired Configured/Incomplete badges across 5 Config route files with strict-mode import cleanup; new `layout.test.ts` (11 pass). tsc 87 baseline held (zero new in touched files), build green. Status → review. |
