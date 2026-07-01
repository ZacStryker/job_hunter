---
baseline_commit: 3497542bb3da6b292a26a293acb347b60975afb5
---

# Story 48.5: User Menu & Three-Icon Top-Right Cluster

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a User menu that jumps me to any Config section and lets me log out,
so that I have one calm fast-travel control, completing the Activity · Notifications · User icon trio.

## Acceptance Criteria

1. **Three-icon cluster** — the top-right of `Layout.tsx` shows exactly three icon controls in order **Activity · Notifications · User** (Activity from Epic 46, Notifications from Story 48.4, User new). All three share the same trigger-button styling (`shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors`, `h-5 w-5` glyph) and the same popover anchoring/panel chrome. The standalone logout button that previously sat in this cluster is **removed** — its logout action now lives inside the User menu.

2. **User trigger = avatar/initials** — the User control renders an avatar showing the user's **initials** (derived from the profile name, falling back to the account email), inside a small circular badge; when no name/email is resolvable yet it falls back to the `User` glyph from `lucide-react`. It uses the same trigger-button classes as the other two controls.

3. **Menu opens with header + jump-list + logout** — clicking the User control opens a shadcn **Popover** (dark low-chrome panel, `align="end"`, matching Activity/Notifications). Contents, top to bottom: (a) a **header** row — the avatar/initials plus the display name and account email; (b) a **section jump-list** — **Profile, Sources, Connections, Prompts, Logs** — each a `Link` to its Config section; (c) a **divider**; (d) a **Log out** action.

4. **Jump-list navigation** — each jump-list item is a `Link` to the Epic 47 path and **closes the menu** on click (`setOpen(false)`): Profile→`/config/profile`, Sources→`/config/sources`, Connections→`/config/connections`, Prompts→`/config/prompts`, Logs→`/config/system/logs`. All five are confirmed-registered routes.

5. **Log out** — the **Log out** action performs the **existing** logout behavior (the exact logic currently in `Layout.handleLogout`: `POST /auth/logout`, then `queryClient.clear()`, then `navigate({ to: '/login' })`), and closes the menu. Logout failure is swallowed and the user is signed out locally regardless (preserve the current `try/catch` behavior).

6. **No status dots anywhere in the User menu** — the User trigger and every menu row show **no** attention dots/badges in any setup state (including broken connections or pending setup). Attention signaling stays exclusively on the Notifications icon (Story 48.4) and, per Story 48.6, the Config sidenav. The User menu is a calm jump-list only — it does **not** call `useSetupStatus`.

## Tasks / Subtasks

- [x] **Task 1 — `UserMenu` component** (AC: #1, #2, #3, #4, #5, #6)
  - [x] Create `src/client/components/shared/UserMenu.tsx`. Mirror `ActivityIndicator.tsx` / `NotificationsDropdown.tsx` wiring: `Popover`/`PopoverTrigger asChild`/`PopoverContent` from `@/components/ui/popover`, `useState(false)` for `open`, `PopoverContent align="end"`. [Source: ActivityIndicator.tsx:39-87; NotificationsDropdown.tsx:214-244]
  - [x] Trigger: `<button type="button" aria-label="User menu" title="Account" className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors">` wrapping the avatar (Task 2). Same classes as the other two triggers (AC1). [Source: ActivityIndicator.tsx:42-48]
  - [x] Read identity from existing hooks only: `const { data: session } = useSessionQuery()` (gives `email`) and `const { data: profile } = useProfileQuery()` (gives `personal.fullName` / `personal.email`). Do **not** add a new fetch and do **not** call `useSetupStatus` (AC6). [Source: useSessionQuery.ts; useProfileQuery.ts; src/shared/schemas.ts:330-335 SessionResponse, :230-238 profilePersonalSchema]
  - [x] `PopoverContent`: (a) header row = avatar + display name (`profile?.personal.fullName || session?.email`) + `session?.email`; (b) `<ul>` jump-list of `JUMP_LINKS` (Task 3), each a `Link to={item.to} onClick={() => setOpen(false)}`; (c) `border-t border-zinc-800` divider; (d) `Log out` button (Task 4). Match the `flex flex-col gap-2` + bottom-divider layout of `ActivityIndicator`. [Source: ActivityIndicator.tsx:60-85]
- [x] **Task 2 — Avatar initials (exported pure)** (AC: #2)
  - [x] Export `initials(name?: string | null, email?: string | null): string`: from a non-empty trimmed `name`, take the first letter of the first two whitespace-separated words, uppercased (single word → its first letter); else from `email`, the first character uppercased; else `''`. Keep it total (never throws on `undefined`/empty).
  - [x] Render the avatar as a small circular span (e.g. `inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-medium text-zinc-100`) containing `initials(...)`; when `initials(...)` is empty, render the `User` glyph (`lucide-react`, `h-5 w-5`) instead. No new asset pipeline. [Source: AC2 — "Avatar can be initials from the profile name/email"]
- [x] **Task 3 — Jump-list (exported static)** (AC: #3, #4)
  - [x] Export `JUMP_LINKS: { label: string; to: LinkProps['to'] }[]` in order: `{ Profile, /config/profile }`, `{ Sources, /config/sources }`, `{ Connections, /config/connections }`, `{ Prompts, /config/prompts }`, `{ Logs, /config/system/logs }`. Type `to` as `LinkProps['to']` (import `type LinkProps` from `@tanstack/react-router`) so TanStack Router keeps the literal-route typing — mirror `NotificationsDropdown.tsx:24` (`type ToPath = LinkProps['to']`). Each renders `[optional icon] Label` with no verb, no dot. [Source: router.ts:223,288,240,336,370 — all five paths registered]
- [x] **Task 4 — Logout (absorb from Layout)** (AC: #5)
  - [x] In `UserMenu`, add `handleLogout` with the **exact** body currently in `Layout.tsx:19-27`: `try { await fetch('/auth/logout', { method: 'POST' }) } catch {}`, then `queryClient.clear()`, then `await navigate({ to: '/login' })`. Import `queryClient` from `@/lib/query-client`, `useNavigate` from `@tanstack/react-router`, `LogOut` from `lucide-react`. Render the `Log out` row as a `<button type="button">` that calls `handleLogout` then `setOpen(false)` (or `handleLogout` navigates away, unmounting the menu — either is fine; do not double-navigate). [Source: Layout.tsx:19-27, 116-124]
- [x] **Task 5 — Rewire `Layout.tsx`** (AC: #1)
  - [x] In `src/client/components/shared/Layout.tsx`, import and render `<UserMenu />` in place of the standalone logout `<button>` (Layout.tsx:115-124), immediately after `<NotificationsDropdown />` (line 113). Final cluster order: `<ActivityIndicator />` → `<NotificationsDropdown />` → `<UserMenu />`. [Source: Layout.tsx:108-125]
  - [x] Remove now-dead code from `Layout.tsx`: the `handleLogout` function (lines 19-27), the `LogOut` import, the `useNavigate` import + `const navigate = useNavigate()`, and the `queryClient` import — **only if** each is unused elsewhere in the file after the move. Verify: `navigate`/`queryClient`/`LogOut` are used **only** by `handleLogout` today, so all three become unused and must be removed (TS strict `noUnusedLocals`/`noUnusedParameters` will otherwise error). Keep `useSessionQuery`/`useFeatureSettingsQuery`/`ImpersonationBanner`/`cn` — still used. [Source: Layout.tsx:1-27]
- [x] **Task 6 — Tests** (AC: #2, #4)
  - [x] Co-located `src/client/components/shared/UserMenu.test.ts` (`bun:test`, `describe/test/expect`). **No React DOM harness exists** (Epic 46 / 48.3 / 48.4 precedent — pures only). Test the exported pures: `initials()` — `"Zac Stryker"→"ZS"`, `"zac"→"Z"`, `""`+`"zac@x.com"→"Z"`, `null`+`null→""`, extra whitespace trimmed; and `JUMP_LINKS` — length 5, labels/paths in the exact order of AC4.
  - [x] Do **not** add `@testing-library/*` or attempt to mount the component. [Source: NotificationsDropdown.test.ts; useSetupStatus.test.ts; project-context.md Testing]

### Review Findings

_Code review 2026-07-01 (bmad-code-review). 3 layers passed (Blind Hunter, Edge Case Hunter, Acceptance Auditor). No Critical/High/Medium defects; all 6 ACs satisfied. 3 Low `patch` findings, 1 dismissed as noise._

- [x] [Review][Patch] Inconsistent identity fallback between `displayName` and avatar `glyph` [UserMenu.tsx:44-45] — FIXED: single `email = session?.email || profile?.personal.email`; both `displayName` and `glyph` derive from it, header email line uses it too. — `displayName = profile?.personal.fullName || session?.email` never falls back to `profile.personal.email`, while `glyph = initials(fullName, session?.email ?? profile?.personal.email)` does. Also the `??` on `session.email` keeps an empty-string email, blocking the `profile.personal.email` fallback (a truthy `||` would fall through). In edge states (session query loading/errored + empty `fullName`) the avatar can show an initial while the name line renders blank, or fall to the generic `User` glyph despite a usable profile email. Fix: resolve one shared identity (e.g. `fullName || session?.email || profile?.personal.email` with `||` semantics) and derive both `displayName` and `glyph` from it. Cosmetic only; ACs met for the normal path.
- [x] [Review][Patch] `initials()` first-character extraction is not codepoint-safe [UserMenu.tsx:13,16] — FIXED: `[...w][0]!` / `[...trimmedEmail][0]!` iterate by codepoint. — `w[0]` and `trimmedEmail[0]` index by UTF-16 code unit, so a name/email starting with an astral/multibyte character (emoji, astral-plane letter) yields a lone surrogate → broken/tofu glyph; a malformed email like `@x.com` yields `@`. Fix: take the first codepoint (`[...w][0]`) and/or guard the email path to an alphanumeric first char. Low likelihood for real names; cosmetic.
- [x] [Review][Patch] Trigger `aria-label` / `title` mismatch [UserMenu.tsx:53-54] — FIXED: both set to `"Account menu"`. — button announces `aria-label="User menu"` but tooltips `title="Account"`. Harmless but inconsistent; align the two (or confirm intentional).

## Dev Notes

### What this story is (and is NOT)
- **IS:** the **User menu** (new `UserMenu.tsx`) — an avatar/initials trigger opening a Popover with a header (avatar + name + email), a **Profile / Sources / Connections / Prompts / Logs** jump-list, a divider, and **Log out**. It **absorbs** the standalone logout button (which is removed from `Layout.tsx`), completing the **Activity · Notifications · User** three-icon cluster.
- **IS NOT:** the Config sidenav status-dot propagation or the Epic 35 Configured/Incomplete badge retirement (**Story 48.6**). This story adds **no** status signaling: the User menu never renders dots and never reads `useSetupStatus`. It touches **no** server, schema, route, or SSE code — it is a pure client presentational + navigation control reusing existing hooks.

### Consume, don't rebuild — everything you need already exists
- **Session identity:** `useSessionQuery()` → `{ userId, email, role, impersonating? }` (`SessionResponse`). Use `email` for the account-email line. [Source: useSessionQuery.ts; src/shared/schemas.ts:330-335]
- **Profile name:** `useProfileQuery()` → `ProfileData`; `data.personal.fullName` for the display name / initials, `data.personal.email` as a secondary source. Both hooks are already used across the app and are cached — no new fetch, no loading gymnastics (menu renders whatever is resolved; both can be briefly `undefined`, so guard with `?.` and let `initials()` fall back). [Source: useProfileQuery.ts; src/shared/schemas.ts:230-238]
- **Logout action:** there is **no** logout mutation hook — the logout logic lives inline in `Layout.handleLogout` (`POST /auth/logout` → `queryClient.clear()` → `navigate('/login')`). Move that exact body into `UserMenu`; the epic dev-note "reuse the existing logout action" means this inline behavior, not a hook. `fetch('/auth/logout')` is an **auth** endpoint, not `/api/*` — the "never `fetch('/api/...')` in components" rule does not apply, and `Layout` (a component) already does exactly this today. [Source: Layout.tsx:19-27]

### Mirror the Activity / Notifications controls for cohesion (the files to copy from)
`ActivityIndicator.tsx` and `NotificationsDropdown.tsx` are the templates. AC1 requires the three controls to be "consistently styled," so use the **same** `Popover` wiring, the **same** trigger-button classes, and the **same** `PopoverContent align="end"` dark panel. **Do not** use the `dropdown-menu.tsx` shadcn component — it exists in `components/ui/` but is unused anywhere in the app; introducing it here would break visual cohesion with the two sibling controls. Popover is the established pattern.
- Trigger button: `className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"`. [ActivityIndicator.tsx:42-48]
- Panel: `<PopoverContent align="end">` with `flex flex-col gap-2` content and a `border-t border-zinc-800 pt-2` divider before the Log out row. [ActivityIndicator.tsx:60-85]
- `Link` from `@tanstack/react-router`; `cn` from `@/lib/utils`; glyphs from `lucide-react` (`User`, `LogOut`, and optionally per-section icons — decorative only).

### Jump-list targets (all Epic 47 routes — confirmed registered)
```ts
import { type LinkProps } from '@tanstack/react-router'
export const JUMP_LINKS: { label: string; to: LinkProps['to'] }[] = [
  { label: 'Profile',     to: '/config/profile' },
  { label: 'Sources',     to: '/config/sources' },
  { label: 'Connections', to: '/config/connections' },
  { label: 'Prompts',     to: '/config/prompts' },
  { label: 'Logs',        to: '/config/system/logs' },
]
```
[Source: router.ts:223 (`/config/profile`), :288 (`/config/sources`), :240 (`/config/connections`), :336 (`/config/prompts`), :370 (`/config/system/logs`)]. Note `Logs` targets `/config/system/logs` (not the legacy `/config/logs` redirect) — the same path `ActivityIndicator` links to (ActivityIndicator.tsx:78).

### The logout-button removal (AC1) — the one regression risk
`Layout.tsx` currently owns `handleLogout` **and** the standalone logout `<button>`. After moving logout into `UserMenu`:
- `navigate` (Layout.tsx:14), `queryClient` (import), and `LogOut` (import) are used **only** by `handleLogout`/the button — once both are gone, all three are unused. **TS strict `noUnusedLocals`/`noUnusedParameters` will fail the build if any are left.** Remove all three imports + the `const navigate` line + the whole `handleLogout` function.
- Keep `useSessionQuery` (used for `isImpersonating`/`isAdmin`), `useFeatureSettingsQuery`, `ImpersonationBanner`, `cn`, and every nav `Link` — untouched.
- Do **not** reorder or restyle `ActivityIndicator`/`NotificationsDropdown`; just replace the logout `<button>` block with `<UserMenu />`.

### Impersonation (minor — do not overthink)
`session.impersonating` and the `ImpersonationBanner` already handle the impersonation case at the top of `Layout`. The User menu just shows `session.email` + profile name; no impersonation-specific branching is required by any AC. Leave the banner as-is.

### Project rules that bite here (non-negotiable)
- **Server state only in TanStack Query** — read identity via `useSessionQuery`/`useProfileQuery`; the only allowed `useState` is the Popover `open` boolean. Do **not** copy session/profile into local state. [Source: project-context.md React rules]
- **No `useSetupStatus` in this component** — AC6 mandates zero status signaling in the user menu. [Source: epic-48 Story 48.5/48.6]
- **Shared types only from `@shared/schemas`** — do not redefine `SessionResponse`/`ProfileData`. shadcn `ui/` files are generated — do not hand-edit `popover.tsx`. [Source: project-context.md]
- **Naming:** component `PascalCase.tsx` (`UserMenu.tsx`); domain folder `components/shared/`. Path aliases `@/*`→`src/client/*`, `@shared/*`→`src/shared/*`. [Source: project-context.md Naming]
- **TS strict** — no unused imports/vars (see logout-removal note); no `_` suppression; **no comments** unless non-obvious. [Source: project-context.md]

### Testing standards summary
- `bun:test` (`describe/test/expect`), co-located beside the component (`UserMenu.test.ts`) — no `__tests__/`. [Source: project-context.md Testing]
- **No React DOM render harness in the repo** (Epic 46 / 48.3 / 48.4 precedent). Test only **exported pure functions/consts** — `initials()` and `JUMP_LINKS`. These are plain in-memory values: no DB, no `:memory:` DDL. The component body/JSX is verified by `tsc` + `bun run build` + manual `bun run dev`. [Source: NotificationsDropdown.test.ts; project-context.md]

### Baselines (bar is zero-new)
- `bunx tsc --noEmit`: **87** pre-existing errors (48.4 baseline). Introduce **zero** new in any touched file (`UserMenu.tsx`, `Layout.tsx`). [Source: 48-4 Debug Log]
- Full `bun test`: ~**562 pass / ~42 pre-existing** flaky `:memory:` fails (run-to-run variance); your new pure tests add to the pass count with zero regressions. [Source: 48-4 Debug Log]
- `bun run build`: green. **Manual check owed:** `bun run dev` → confirm the top-right shows **Activity · Notifications · User** in order, the avatar shows correct initials, the menu opens with header + the five jump-list links + Log out, each jump-list link navigates to its Config section and closes the menu, **Log out** signs out to `/login`, and **no dots/badges** appear anywhere in the user menu. [Source: 48-4 precedent — runtime walkthrough owed for UI]

### Project Structure Notes
- **New files:** `src/client/components/shared/UserMenu.tsx`, `src/client/components/shared/UserMenu.test.ts`.
- **Edited files:** `src/client/components/shared/Layout.tsx` (replace standalone logout button with `<UserMenu />`; remove now-dead `handleLogout` + `navigate`/`queryClient`/`LogOut`).
- **No** server changes, **no** new route, **no** migration, **no** schema change, **no** new `EventSource`, **no** `useSetupStatus` usage. Config sidenav dots + Configured/Incomplete badge retirement are **Story 48.6**.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-48-notifications-dropdown-top-nav-cluster.md#Story 48.5] (ACs; dev-note: new `UserMenu.tsx`, reuse existing logout, Epic 47 jump-list paths, initials avatar, three-control alignment; #Story 48.6 confirms sidenav-dots are NOT here)
- [Source: _bmad-output/implementation-artifacts/48-4-notifications-icon-dropdown.md] (sibling control just built — Popover pattern, trigger classes, `align="end"`, no-DOM-harness convention, baselines)
- [Source: src/client/components/shared/ActivityIndicator.tsx] (Popover wiring, trigger button classes, `align="end"` panel, bottom-divider layout — the template to mirror; :78 `/config/system/logs` link)
- [Source: src/client/components/shared/NotificationsDropdown.tsx:24] (`type ToPath = LinkProps['to']` pattern for typed `to`)
- [Source: src/client/components/shared/Layout.tsx:1-27,108-125] (current `handleLogout` to absorb + logout button to remove + mount point)
- [Source: src/client/hooks/useSessionQuery.ts; src/shared/schemas.ts:330-335] (`SessionResponse` = `{ userId, email, role, impersonating? }`)
- [Source: src/client/hooks/useProfileQuery.ts; src/shared/schemas.ts:230-238] (`ProfileData.personal.fullName`/`.email`)
- [Source: src/client/lib/router.ts:223,240,288,336,370] (registered jump-list targets)
- [Source: _bmad-output/project-context.md] (React/TanStack Query/naming/testing/type-safety rules)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story workflow)

### Debug Log References

- `bun test src/client/components/shared/UserMenu.test.ts` → 7 pass / 0 fail (10 expect() calls).
- `bunx tsc --noEmit` → 87 errors total (matches 48.4 baseline); **zero** in `UserMenu.tsx` / `Layout.tsx`.
- `bun run build` → green (client build succeeded, only the pre-existing chunk-size advisory).
- Full `bun test` → 568 pass / 43 fail / 611 tests; the 43 failures are the pre-existing flaky `:memory:` suite (e.g. `api-onboarding` gmail-labels), none in touched files — consistent with the 48.4 baseline (~562 pass / ~42 flaky), +7 new passing pures.

### Completion Notes List

- New `UserMenu.tsx` mirrors `ActivityIndicator`/`NotificationsDropdown`: same `Popover`/`PopoverTrigger asChild`/`PopoverContent align="end"` wiring, same trigger classes (`shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors`), only local state is the `open` boolean. Identity read via existing `useSessionQuery` + `useProfileQuery` only — no new fetch, no `useSetupStatus` (AC6: zero status dots anywhere in the menu).
- Avatar renders `initials(fullName, email)` in a circular badge, falling back to the `User` glyph when nothing resolves. `initials` and `JUMP_LINKS` are exported pures (tested); `JUMP_LINKS` typed `LinkProps['to']` to keep TanStack literal-route typing.
- `handleLogout` body copied verbatim from the old `Layout.handleLogout` (`POST /auth/logout` in try/catch → `queryClient.clear()` → `navigate({ to: '/login' })`); navigation unmounts the menu, so no double-navigate.
- `Layout.tsx` rewired: standalone logout `<button>` replaced by `<UserMenu />` after `<NotificationsDropdown />` (cluster order Activity · Notifications · User). Removed now-dead `handleLogout`, `useNavigate`+`const navigate`, `LogOut` import, and `queryClient` import — all were used only by logout; strict `noUnusedLocals` stays clean.
- **Manual runtime walkthrough still owed** (no DOM harness in repo): `bun run dev` → confirm cluster order, initials, header + 5 jump-links + Log out, each link navigates + closes menu, Log out signs out to `/login`, and no dots/badges anywhere in the User menu.

### File List

- `job-hunt-dashboard/src/client/components/shared/UserMenu.tsx` (new)
- `job-hunt-dashboard/src/client/components/shared/UserMenu.test.ts` (new)
- `job-hunt-dashboard/src/client/components/shared/Layout.tsx` (modified)

## Change Log

| Date | Change |
| --- | --- |
| 2026-07-01 | Created Story 48.5 — User menu (avatar/initials trigger, header + Profile/Sources/Connections/Prompts/Logs jump-list + Log out), absorbing the standalone logout button to complete the Activity · Notifications · User cluster. Status → ready-for-dev. |
| 2026-07-01 | Implemented Story 48.5 — new `UserMenu.tsx` (+ `UserMenu.test.ts`, 7 pures) mirroring the Activity/Notifications Popover controls; rewired `Layout.tsx` to render `<UserMenu />` and removed the now-dead logout button + `handleLogout`/`navigate`/`queryClient`/`LogOut`. tsc zero-new (87 baseline), build green, no test regressions. Status → review. |
