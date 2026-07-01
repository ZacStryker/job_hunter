---
baseline_commit: 3497542bb3da6b292a26a293acb347b60975afb5
---

# Story 48.4: Notifications Icon & Dropdown

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user anywhere in the app,
I want a Notifications icon that signals when something needs me and opens a prioritized setup walkthrough,
so that I always know my outstanding setup (or that I'm ready) and can fix each item in one click.

## Acceptance Criteria

1. **Icon in the top bar** — a **Notifications** icon (bell-style glyph) appears in `Layout.tsx`'s top-right cluster, styled to match the existing `ActivityIndicator` control (same `shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors`, `h-5 w-5` glyph). It reads its state exclusively from `useSetupStatus`.

2. **Dot badge — never a number** — driven by `badge` from `useSetupStatus`: a **solid/colored dot** for `'alert'` (broken or any required-incomplete), a **faint dot** for `'dot'` (optional-only pending), and **no badge** for `'none'`. On the transition into fully ready (`badge` becomes `'none'` after having been non-`'none'`), the icon briefly shows a ✓ (~2s) then rests with no badge.

3. **Dropdown opens, incomplete tasks as priority rows** — clicking the icon opens a shadcn **Popover** (dark low-chrome panel, `align="end"` anchored under the icon, matching the Activity dropdown). Incomplete tasks render as rows in priority order **linkedin, apiKey, profile, inboxConnect, inboxMapping**, each as `[icon] Label … Verb →`, the whole row a `Link` deep-linking to its fix page and closing the popover on click. Verbs + targets: LinkedIn→**Connect** `/config/connections/linkedin`; API key→**Add** `/config/connections/api-key`; Profile→**Complete** `/config/profile`; Inbox connect→**Connect** `/config/connections/inbox`; Inbox mapping→**Map** `/config/connections/inbox`.

4. **Broken rows use the alert style** — a task whose `state === 'broken'` renders in the **alert** visual weight (amber/red) with a **Reconnect/Fix** verb, visually distinct from neutral setup rows.

5. **Dependent locked row** — when `inboxMapping`'s `dependsOn` (`inboxConnect`) is not yet `complete`, the mapping row appears **grayed/disabled (not hidden)**, is **not clickable** (rendered as a non-`Link` element), and carries a tooltip "Connect your inbox first".

6. **Progress meter for first-time setup** — when there are **no** `broken` tasks and required tasks are still pending, a slim progress meter shows required completion (e.g. `Setup 2/3 required`). The meter is **absent** when the only outstanding items are `broken` alerts (i.e., all required already `complete` but something is broken).

7. **Optional-task dismiss affordance** — each `optional` task row carries a **dismiss (✕)** affordance; clicking it calls the dismiss endpoint via a mutation and the row disappears (driven by the invalidated `['setup-status']` refetch — no local list state). `required` rows **never** show a dismiss affordance.

8. **Pending optionals block the ready state** — when all `required` tasks are `complete` but an `optional` task is still pending (present, not `complete`, not `dismissed`), the dropdown still shows the pending optional row(s) with their connect + dismiss affordances; the celebratory ready launchpad does **not** appear yet.

9. **Ready launchpad** — when `ready` is `true` (all required complete; all optional complete or dismissed), the dropdown shows the terminal launchpad: a **"Start hunting →"** action that triggers a Discovery run via the existing discovery trigger (`useWebhookStream('/api/webhooks/discovery').trigger()`), after which the panel rests on a quiet **"✓ All set"** state.

10. **Single data source** — the dropdown reads **exclusively** from `useSetupStatus` (no page-local re-derivation, no direct `fetch`), so it is correct from any route. The dismiss mutation is the only new network call this story adds, and it invalidates `['setup-status']`.

## Tasks / Subtasks

- [x] **Task 1 — Dismiss mutation hook** (AC: #7, #10)
  - [x] Create `src/client/hooks/useDismissSetupTaskMutation.ts` mirroring `useInboxMappingsMutation.ts` exactly (same imports: `useMutation`, `queryClient` from `@/lib/query-client`, `apiFetch` from `@/lib/api`, `toast` from `sonner`).
  - [x] `mutationFn: async (taskId: SetupTaskId)` → `apiFetch('/api/setup-status/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId }) })`; throw `new Error(err.error ?? 'Failed to dismiss')` on `!res.ok`; `return res.json()`. Import `type SetupTaskId` from `@shared/schemas`.
  - [x] `onSuccess`: `queryClient.invalidateQueries({ queryKey: ['setup-status'] })`. `onError`: `toast.error(err.message)`. [Source: src/client/hooks/useInboxMappingsMutation.ts — copy structure; src/server/routes/api-setup-status.ts:17 — endpoint contract]
- [x] **Task 2 — `NotificationsDropdown` component** (AC: #1, #3, #4, #5, #6, #8, #9, #10)
  - [x] Create `src/client/components/shared/NotificationsDropdown.tsx`. Use shadcn `Popover`/`PopoverTrigger`/`PopoverContent` from `@/components/ui/popover` with `useState(false)` for `open`, mirroring `ActivityIndicator.tsx:39-87`.
  - [x] Trigger: a `<button type="button" aria-label="Notifications" title="Notifications" className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors">` wrapping a `relative inline-flex` span containing the `Bell` glyph (`lucide-react`, `h-5 w-5`) plus the badge dot (Task 3). [Source: ActivityIndicator.tsx:42-58]
  - [x] Pull `const { tasks, ready, badge } = useSetupStatus()`. Derive `incomplete = tasks.filter((t) => t.state !== 'complete' && !t.dismissed)` for row rendering. Keep the popover content reading **only** from this hook (AC10).
  - [x] `PopoverContent align="end"`: render (a) the progress meter (Task 4) when applicable, (b) one row per incomplete task in `SETUP_TASK_ORDER` priority (the hook already returns tasks in that order — preserve it, do not re-sort by anything else), (c) the ready launchpad (Task 5) when `ready`.
  - [x] Each task row = a small presentational sub-component taking the `SetupTask`. Map `id → { label, verb, to }` via a static record (see Dev Notes "Row metadata"). Broken rows: amber/red weight + verb `Reconnect`. Locked `inboxMapping` (when the `inboxConnect` task in `tasks` is not `complete`): render a non-clickable grayed `div` (not a `Link`) with `title="Connect your inbox first"` and no verb action. All other rows: a `Link to={to}` that calls `setOpen(false)` `onClick`, formatted `[icon] Label … Verb →`.
  - [x] Optional rows (`tier === 'optional'`) get a trailing ✕ button calling `dismiss.mutate(task.id)` (from Task 1) with `e.preventDefault()/e.stopPropagation()` so the row `Link` doesn't also fire; required rows render no ✕. [Source: AC7]
- [x] **Task 3 — Badge dot + brief ✓ on ready transition** (AC: #2)
  - [x] Render an absolutely-positioned dot over the bell when `badge !== 'none'`: solid (e.g. `bg-amber-500`/red weight) for `'alert'`, faint (e.g. `bg-zinc-500`) for `'dot'`; nothing for `'none'`. Mirror ActivityIndicator's overlay-span pattern (`pointer-events-none absolute ...`). [Source: ActivityIndicator.tsx:50-55]
  - [x] Brief ✓: track the previous `badge` with a `useRef`; when it transitions from non-`'none'` → `'none'`, show a `Check`/`CheckCircle2` glyph for ~2s (a single `useState<boolean>` + `setTimeout` cleared on unmount), then fall back to no badge. This is transient UI state (allowed in `useState` — it is not server state). [Source: project-context.md "UI state in useState"; AC2]
- [x] **Task 4 — Progress meter** (AC: #6)
  - [x] Compute from `tasks`: `requiredTotal = tasks.filter(t => t.tier === 'required').length`; `requiredDone = tasks.filter(t => t.tier === 'required' && t.state === 'complete').length`; `hasBroken = tasks.some(t => t.state === 'broken')`.
  - [x] Show the meter only when `!hasBroken && requiredDone < requiredTotal`. Render a slim inline bar (a `div` track + filled `div` at `width: ${(requiredDone/requiredTotal)*100}%`) and the label `Setup {requiredDone}/{requiredTotal} required`. **No shadcn `Progress` component exists** in `components/ui/` — build the bar inline with Tailwind (track `bg-zinc-800`, fill `bg-zinc-200`/accent). [Source: AC6 — meter absent when only broken alerts remain]
- [x] **Task 5 — Ready launchpad ("Start hunting")** (AC: #9)
  - [x] When `ready`, render the launchpad instead of task rows: a primary **"Start hunting →"** action wired to `const discovery = useWebhookStream('/api/webhooks/discovery')` → `onClick={() => discovery.trigger()}`, disabled while `discovery.isPending` (show a spinner like the pipeline button). After trigger fires, the panel rests on a quiet **"✓ All set"** line. Do **not** add a Discovery button anywhere else — reuse the same trigger the pipeline Discover button uses. [Source: src/client/routes/index.tsx:75,137 — `useWebhookStream('/api/webhooks/discovery').trigger()`]
  - [x] Note the resume gate (Dev Notes "Start hunting & the resume gate"): the pipeline page gates Discover behind `hasResumeText`, but `setup-status.ready` does not track resume. Do **not** re-implement that gate here — fire the trigger; the server enforces prerequisites and `useWebhookStream` already swallows the 409 / surfaces errors. Flag this in Completion Notes if it feels wrong in manual testing.
- [x] **Task 6 — Mount in `Layout.tsx`** (AC: #1)
  - [x] In `src/client/components/shared/Layout.tsx`, render `<NotificationsDropdown />` in the top-right area immediately **after** `<ActivityIndicator />` (line 109) and **before** the existing logout button. Do not reorder/remove the logout button or `ActivityIndicator` — the full three-icon Activity·Notifications·User cluster and logout-button replacement land in **Story 48.5**, not here. Import the component at the top. [Source: Layout.tsx:108-120]
- [x] **Task 7 — Tests** (AC: all testable pures)
  - [x] Co-located `src/client/components/shared/NotificationsDropdown.test.ts` (`bun:test`). **No React DOM harness exists** (Epic 46/48.3 precedent — pures only). So extract any non-trivial derivations as **exported pure functions** and unit-test those: e.g. `rowMeta(id)` returning the correct `{ label, verb, to }`, an `isLocked(task, tasks)` predicate for the `inboxMapping` dependency, and a `progressMeter(tasks)` returning `{ show, done, total }`. Cover: locked when `inboxConnect` incomplete / unlocked when complete; meter hidden when a broken task is present; meter shown 2/3 for required progress; broken-row verb selection.
  - [x] Do **not** add `@testing-library/*` or attempt to mount the component. [Source: src/client/hooks/useSetupStatus.test.ts; project-context.md Testing]

### Review Findings (code review 2026-06-30)

3-layer adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Acceptance Auditor: **all 10 ACs MET**, every project-context rule passes; tsc 87 baseline zero-new; 12/12 pure tests pass; build green. Findings below.

- [x] [Review][Patch] Badge ✓ sticks permanently when `badge` flaps non-`none`→`none`→non-`none` inside the 2s window — effect cleanup `clearTimeout`s the pending reset and the next run skips the `if` (prevBadge already `'none'`), so `justReady` never clears and a real `alert` is masked by a green check for the session [NotificationsDropdown.tsx:197-205] (blind+edge) — FIXED: added `if (badge !== 'none') setJustReady(false)` to the effect so any non-`none` badge immediately clears the check.
- [x] [Review][Patch] Ready launchpad shows green "✓ All set" for a **failed** discovery run — `fired = isPending || isSuccess || statusMessage !== null`; on stream error `useWebhookStream` leaves `statusMessage` non-null while `isSuccess` stays false, so a failure renders as success (and an error before any status line silently reverts to the button) [NotificationsDropdown.tsx:156-187] (edge+auditor) — FIXED: rewrote `ReadyLaunchpad` to gate on `isPending`→Starting / `isSuccess`→All set / else→Start-hunting button, dropping the stale-`statusMessage` proxy; surfaces `discovery.error` inline on `isError`.
- [x] [Review][Patch] `progressMeter` `hasBroken` ignores `dismissed` — `tasks.some(t => t.state === 'broken')` lacks the `&& !t.dismissed` qualifier the rest of the system uses (incomplete filter, server `anyBroken`), so a dismissed-broken optional wrongly hides the "Setup N/3 required" bar while required tasks are still pending [NotificationsDropdown.tsx:59] (edge) — FIXED: added `&& !t.dismissed` to the `hasBroken` predicate.
- [x] [Review][Defer] "Start hunting" launchpad is single-use per page load — `useWebhookStream` is always-mounted and `reset()` is never called, so after one success it rests on "All set" with no re-hunt path [NotificationsDropdown.tsx:156-193] — deferred: AC9 prescribes resting on "✓ All set"; re-trigger is not an AC, and `reset()` exists for a later story (edge)
- [x] [Review][Defer] Empty popover during the brief initial-load window — `useSetupStatus` returns `tasks: []`/`ready:false` pre-resolve, rendering an empty `<ul>` with no message (ActivityIndicator shows "No active workflows") [NotificationsDropdown.tsx:230-236] — deferred: load-window-only polish, cannot occur post-load (edge)
- [x] [Review][Defer] Locked `inboxMapping` becomes an un-actionable dead-end when `inboxConnect` is incomplete **and** dismissed — the dismissed inbox row is filtered out while the locked mapping row stays, instructing "Connect your inbox first" with no visible inbox row to act on [NotificationsDropdown.tsx:108-117,207] — deferred: narrow reachable edge, fix needs product intent (edge)
- [x] [Review][Defer] Dismiss `<button>` is nested inside the `<Link>` anchor — invalid interactive-in-anchor HTML (click masked by preventDefault/stopPropagation but structurally invalid; possible a11y/hydration quirk) [NotificationsDropdown.tsx:123-152] — deferred: low-risk a11y, restructure out of scope (edge)

## Dev Notes

### What this story is (and is NOT)
- **IS:** the first piece of **visible UI** for Epic 48 — the Notifications **bell icon + dot badge** in the top bar and its **Popover dropdown** (priority setup rows, broken-alert rows, locked dependent row, progress meter, optional dismiss, and the ready "Start hunting" launchpad). Plus the one new network call this epic's UI needs: the **dismiss mutation** (the endpoint already exists from 48.1).
- **IS NOT:** the User menu / three-icon cluster / logout-button replacement (**48.5**), or the Config sidenav dot propagation + Configured/Incomplete badge retirement (**48.6**). It does **not** touch the server, schemas, the SSE stream, or `useSetupStatus` itself (all shipped in 48.1–48.3). It adds exactly one icon beside `ActivityIndicator` and leaves the existing logout button in place for 48.5 to absorb.

### Everything upstream is already shipped — consume, don't rebuild
- **`useSetupStatus()`** (48.3, `src/client/hooks/useSetupStatus.ts`) returns `{ tasks: SetupTask[]; ready: boolean; badge: 'none' | 'dot' | 'alert' }`. `tasks` is already ordered by `SETUP_TASK_ORDER` (linkedin, apiKey, profile, inboxConnect, inboxMapping) and already merges the query snapshot with live `setup-status` SSE pushes. **This is your only data source** (AC10). Do not call `fetchSetupStatus`/`/api/setup-status` directly, and do not re-derive `badge` — the hook's `computeBadge` is the single shared rule.
- **`badge` semantics (from 48.3, do not redefine):** `'alert'` = any `broken` OR any `required` incomplete; `'dot'` = required all complete but an optional pending/undismissed; `'none'` = `ready`. Map alert→solid dot, dot→faint dot, none→(no dot, or brief ✓ on transition). [Source: useSetupStatus.ts:24-37]
- **`SetupTask` shape (from `@shared/schemas`, never redefine inline):** `{ id: SetupTaskId, state: 'notStarted'|'partial'|'complete'|'broken', tier: 'required'|'optional', dependsOn: SetupTaskId|null, dismissed: boolean, progress: { filled, total } | null }`. Tiers: `linkedin/apiKey/profile` = required; `inboxConnect/inboxMapping` = optional; `inboxMapping.dependsOn = 'inboxConnect'`. [Source: src/shared/schemas.ts:390-414]
- **Dismiss endpoint (48.1):** `POST /api/setup-status/dismiss` body `{ taskId }`; a required task → `400 { error }` (won't happen here — only optional rows show ✕); `POST /api/setup-status/undismiss` exists too (not needed this story). [Source: src/server/routes/api-setup-status.ts:17-43]

### Mirror the Activity dropdown for cohesion (the file to copy from)
`src/client/components/shared/ActivityIndicator.tsx` is the template for the whole control — same Popover wiring, same trigger button classes, same `PopoverContent align="end"`, same overlay-span pattern for the badge. Read it and match it; the epic explicitly wants the Notifications dropdown to "match the Activity dropdown."
- Trigger button: `className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"`, glyph `h-5 w-5`. [ActivityIndicator.tsx:42-58]
- Badge overlay: `<span aria-hidden className="pointer-events-none absolute ...">` layered over the glyph. [ActivityIndicator.tsx:50-55]
- Popover content: `<PopoverContent align="end">` with a `flex flex-col gap-2` list and a bottom `border-t border-zinc-800 pt-2` divider section. [ActivityIndicator.tsx:60-85]
- Use the `Bell` glyph from `lucide-react` (Activity uses `Activity`). `Link` from `@tanstack/react-router`. `cn` from `@/lib/utils`.

### Row metadata (static record — define once in the component, export for tests)
```ts
const ROW_META: Record<SetupTaskId, { label: string; verb: string; to: string }> = {
  linkedin:     { label: 'LinkedIn',      verb: 'Connect',  to: '/config/connections/linkedin' },
  apiKey:       { label: 'API key',       verb: 'Add',      to: '/config/connections/api-key' },
  profile:      { label: 'Profile',       verb: 'Complete', to: '/config/profile' },
  inboxConnect: { label: 'Inbox',         verb: 'Connect',  to: '/config/connections/inbox' },
  inboxMapping: { label: 'Inbox mapping', verb: 'Map',      to: '/config/connections/inbox' },
}
```
All five targets are confirmed-registered Epic 47 routes. [Source: src/client/lib/router.ts:247,269,223,254]
- **Broken override:** when `task.state === 'broken'`, swap the verb to `Reconnect` (or `Fix`) and apply the amber/red row style regardless of `id`. UX-DR48.3 visual weights: setup (neutral) / alert (amber-red) / locked (grayed) / dismissible (✕). [Source: epic-48 Story 48.4 dev-note]

### The locked dependent row (AC5) — render, don't hide
`inboxMapping` is locked when the `inboxConnect` entry in `tasks` is not `complete`. Locked = a **grayed, non-clickable `div`** (NOT a `Link`), `title="Connect your inbox first"`, no verb/dismiss. It must still appear in the list (grayed), not be filtered out. Recommended predicate (export for tests):
```ts
function isLocked(task: SetupTask, tasks: SetupTask[]): boolean {
  if (!task.dependsOn) return false
  const dep = tasks.find((t) => t.id === task.dependsOn)
  return !!dep && dep.state !== 'complete'
}
```
Note: your `incomplete` filter drops `complete`/`dismissed` tasks — a locked-but-incomplete `inboxMapping` survives that filter and should render grayed.

### Progress meter (AC6) — inline, no shadcn Progress
There is **no** `Progress` component under `src/client/components/ui/` (only `dropdown-menu`, `popover`, and the rest). Build the bar inline (Tailwind track + fill div). Show it only when `!hasBroken && requiredDone < requiredTotal` so a broken-only state (all required complete but something broke) shows alert rows with **no** meter. Keep `requiredTotal` derived from `tasks` (currently 3) — don't hardcode `3`.

### Start hunting & the resume gate (AC9) — a real nuance, but don't gate here
The pipeline page (`src/client/routes/index.tsx`) gates its Discover button behind `hasResumeText` ("Profile & resume required to run discovery"), but `setup-status.ready` is computed from `linkedin/apiKey/profile/inbox*` only — **resume text is not a setup task**. So a user can be `ready` (badge `'none'`) yet lack resume text, and "Start hunting" would hit the server's discovery prerequisites. Per the AC, **reuse the existing trigger** (`useWebhookStream('/api/webhooks/discovery').trigger()`) and let the server/`useWebhookStream` handle the outcome (it already swallows 409 and surfaces errors). Do not re-create the resume gate in the dropdown. If manual testing shows a confusing dead-end, note it in Completion Notes for the PO rather than expanding scope. [Source: index.tsx:131-167]

### Project rules that bite here (non-negotiable)
- **Server state only in TanStack Query** — render from `useSetupStatus`; the only allowed `useState` here is **UI state**: the Popover `open` boolean and the transient "brief ✓" flag. Do **not** copy `tasks`/`ready` into `useState`, and do **not** keep a local "dismissed rows" list — the invalidated refetch removes dismissed rows. [Source: project-context.md React rules]
- **Never `fetch('/api/...')` directly in components** — the dismiss call lives in the new mutation hook; the discovery trigger lives in `useWebhookStream`. [Source: project-context.md]
- **Shared types only from `@shared/schemas`** — import `SetupTask`, `SetupTaskId`, `SetupTaskState` from there; never redefine. shadcn `ui/` files are generated — do not hand-edit `popover.tsx`. [Source: project-context.md]
- **Naming:** component `PascalCase.tsx` (`NotificationsDropdown.tsx`), hook `camelCase` `use*` (`useDismissSetupTaskMutation.ts`); domain folder `components/shared/`. Path aliases `@/*`→`src/client/*`, `@shared/*`→`src/shared/*`. [Source: project-context.md Naming]
- **TS strict (`noUnusedLocals`/`noUnusedParameters`)** — no unused imports/vars; no `_` suppression. **No comments** unless non-obvious. [Source: project-context.md]
- **Error UI:** dismiss failure → transient `toast.error` (already in the mutation's `onError`), matching the low-stakes toast convention. [Source: project-context.md UI Error Handling; useInboxMappingsMutation.ts:24-26]

### Testing standards summary
- `bun:test` (`describe/test/expect`), co-located beside the component (`NotificationsDropdown.test.ts`) — no `__tests__/`. [Source: project-context.md Testing]
- **No React DOM render harness in the repo** (Epic 46 / 48.3 precedent). Test only **exported pure functions** — `rowMeta`/`ROW_META` lookups, `isLocked`, `progressMeter`, broken-verb selection. These are over in-memory `SetupTask` objects: no DB, no `:memory:` DDL needed. The component body/JSX is verified by `tsc` + `bun run build` + manual `bun run dev`. [Source: src/client/hooks/useSetupStatus.test.ts; project-context.md]
- Add a small `task(partial)` factory returning a valid `SetupTask` (mirror the one in `useSetupStatus.test.ts`).

### Baselines (bar is zero-new)
- `bunx tsc --noEmit`: **87** pre-existing errors (48.3 baseline). Introduce **zero** new in any touched file. [Source: 48-3 Debug Log]
- Full `bun test`: ~**550 pass / ~42 pre-existing** flaky `:memory:` fails (run-to-run variance); your new pure tests add to the pass count with zero regressions. [Source: 48-3 Debug Log]
- `bun run build`: green. **Manual check owed:** `bun run dev` → confirm the bell renders beside Activity, the dot reflects state, the dropdown opens with priority rows, a row deep-links + closes the popover, the locked mapping row is grayed with its tooltip, dismissing an optional removes it, and (when ready) "Start hunting" fires a discovery run. [Source: 48-3 precedent — runtime walkthrough owed for UI]

### Project Structure Notes
- **New files:** `src/client/components/shared/NotificationsDropdown.tsx`, `src/client/components/shared/NotificationsDropdown.test.ts`, `src/client/hooks/useDismissSetupTaskMutation.ts`.
- **Edited files:** `src/client/components/shared/Layout.tsx` (mount `<NotificationsDropdown />` after `<ActivityIndicator />`, before the logout button).
- **No** server changes, **no** new route, **no** migration, **no** schema change, **no** new `EventSource`, **no** change to `useSetupStatus`. Logout-button replacement and the User menu are **48.5** — leave the existing logout button untouched.

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-48-notifications-dropdown-top-nav-cluster.md#Story 48.4] (ACs, dev-note: new component path, deep-link targets, Start-hunting reuse, UX-DR48.3 row styles)
- [Source: _bmad-output/implementation-artifacts/48-3-usesetupstatus-client-hook.md] (`useSetupStatus` contract, `badge` rule, single-EventSource constraint, baselines, no-DOM-harness convention)
- [Source: src/client/hooks/useSetupStatus.ts] (`{ tasks, ready, badge }`, `computeBadge` — the single shared rule; do not re-derive)
- [Source: src/shared/schemas.ts:388-414] (`SETUP_TASK_ORDER`, `setupTaskSchema`, `SetupTask`, `SetupTaskId` — import, never redefine)
- [Source: src/client/components/shared/ActivityIndicator.tsx] (Popover wiring, trigger button classes, badge overlay span, `align="end"` panel — the template to mirror)
- [Source: src/client/components/shared/Layout.tsx:108-120] (mount point — after ActivityIndicator, before logout button)
- [Source: src/client/hooks/useInboxMappingsMutation.ts] (mutation hook pattern to copy for dismiss — `apiFetch`, `invalidateQueries(['setup-status'])`, `toast.error` onError)
- [Source: src/server/routes/api-setup-status.ts:17-43] (`POST /dismiss` / `/undismiss` contract: body `{ taskId }`, required→400)
- [Source: src/client/routes/index.tsx:75,131-167] (discovery trigger reuse `useWebhookStream('/api/webhooks/discovery').trigger()`; the `hasResumeText` gate this story does NOT replicate)
- [Source: src/client/hooks/useWebhookStream.ts] (`trigger()`, `isPending`, 409-swallow — the Start-hunting action)
- [Source: src/client/lib/router.ts:223,247,254,269] (registered Epic 47 deep-link targets)
- [Source: _bmad-output/project-context.md] (React/TanStack Query/naming/testing/type-safety rules)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `bunx tsc --noEmit`: **87** errors total — identical to the 48.3 baseline, **zero new**, **none** in any touched file (`NotificationsDropdown.tsx`, `useDismissSetupTaskMutation.ts`, `Layout.tsx`).
- `bun test src/client/components/shared/NotificationsDropdown.test.ts`: **12 pass / 0 fail**.
- `bun test` (full suite): **562 pass / 42 fail** — the 42 failures are the pre-existing flaky shared-`:memory:` cross-file pollution in server route test files (e.g. `api-onboarding.test.ts`), unchanged by this client-only story; my 12 new pures landed in the pass count.
- `bun run build`: green.
- **lucide-react has no `Linkedin` brand glyph** (brand icons removed) — bun test surfaced `SyntaxError: Export named 'Linkedin' not found`. Substituted `Briefcase` for the LinkedIn row icon. (Row icons are decorative; `ROW_META`/deep-link targets are unaffected.)

### Completion Notes List

- Implemented all 7 tasks. New `NotificationsDropdown.tsx` mirrors `ActivityIndicator.tsx` (same Popover wiring, trigger button classes, `align="end"` panel, overlay-span badge). Reads **exclusively** from `useSetupStatus()` — no page-local re-derivation, no direct `fetch`; the only new network call is the dismiss mutation, which invalidates `['setup-status']` (AC10).
- The only `useState` is UI state: the Popover `open` boolean and the transient "brief ✓" flag (driven by a `useRef` previous-`badge` tracker + 2s `setTimeout`, cleared on unmount). No server state copied into local state (AC2).
- Locked `inboxMapping` renders as a grayed, non-`Link` `div` with `title="Connect your inbox first"` and survives the `incomplete` filter so it stays visible (AC5). Progress meter is inline Tailwind (no shadcn `Progress` exists), `requiredTotal` derived from tasks, hidden when any task is broken (AC6).
- Mounted `<NotificationsDropdown />` in `Layout.tsx` immediately after `<ActivityIndicator />` and before the existing logout button. The logout button and three-icon cluster are left intact for Story 48.5.
- Tested only **exported pure functions** (`rowMeta`/`ROW_META`, `rowVerb`, `isLocked`, `progressMeter`) per the Epic 46/48.3 no-DOM-harness convention; the JSX is verified by `tsc` + `bun run build`.
- **Resume-gate nuance (AC9, per Dev Notes):** "Start hunting" fires `useWebhookStream('/api/webhooks/discovery').trigger()` directly without re-implementing the pipeline page's `hasResumeText` gate. `setup-status.ready` does not track resume text, so a `ready` user lacking resume text will hit the server's discovery prerequisites (the stream swallows 409 / surfaces errors). Flagged here for the PO as Task 5 instructed.
- **Manual `bun run dev` walkthrough still owed** (no DOM harness): confirm the bell renders beside Activity, the dot reflects state, the dropdown opens with priority rows, a row deep-links + closes the popover, the locked mapping row is grayed with its tooltip, dismissing an optional removes it, and (when ready) "Start hunting" fires a discovery run.

### File List

- **Added:** `job-hunt-dashboard/src/client/hooks/useDismissSetupTaskMutation.ts`
- **Added:** `job-hunt-dashboard/src/client/components/shared/NotificationsDropdown.tsx`
- **Added:** `job-hunt-dashboard/src/client/components/shared/NotificationsDropdown.test.ts`
- **Modified:** `job-hunt-dashboard/src/client/components/shared/Layout.tsx`

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-30 | Created Story 48.4 — Notifications bell icon + dot badge + Popover dropdown (priority setup rows, broken-alert rows, locked dependent row, progress meter, optional dismiss, ready "Start hunting" launchpad) and the dismiss mutation hook. Status → ready-for-dev. |
| 2026-06-30 | Implemented all 7 tasks: dismiss mutation hook, `NotificationsDropdown` (mirrors `ActivityIndicator`), badge dot + brief-✓ transition, inline progress meter, ready "Start hunting" launchpad, mounted in `Layout.tsx` after `ActivityIndicator`. 12 new pure-function tests pass; tsc zero-new (87 baseline); build green. Substituted `Briefcase` for the removed lucide `Linkedin` brand glyph. Status → review. |
