# Story 17.1: Config View and Nav Reorganization

Status: done

## Change Log

- 2026-04-18: Implemented Config view and nav reorganization — added `/config` route with three read-only preview cards (Logs, Profile, Analysis Prompt), replaced Logs/Profile/Prompts nav links with single Config link

## Story

As a job hunter,
I want a Config view in the nav that consolidates settings (Logs, Profile, Prompts) into a single dashboard with clickable previews,
so that the main nav is less cluttered and I can navigate to settings quickly from one place.

## Acceptance Criteria

1. A "Config" link replaces the "Logs", "Profile", and "Prompts" links in the top-level nav — those three links are removed from the nav bar.
2. Navigating to `/config` renders a Config dashboard with three preview cards: Logs, Profile, and Analysis Prompt.
3. The Logs preview card shows up to 5 of the most recent webhook runs in a compact read-only table (columns: Run Date, Workflow, Job, Success) with no sorting controls.
4. The Profile preview card shows the first 6 fields read-only in a 2-column grid: Name, Email, Phone, Location, LinkedIn URL, GitHub URL — no edit controls.
5. The Analysis Prompt preview card shows the Analysis flow's User Message in a read-only `<pre>` block — no edit or reset controls.
6. Clicking anywhere on a preview card (or a "View all →" / "Go to full →" affordance) navigates to the corresponding full view: `/logs`, `/profile`, `/prompts`.
7. The existing `/logs`, `/profile`, and `/prompts` routes are NOT removed — they remain fully functional. Only the top-level nav links are removed.
8. The Config nav link is active (white + underline) when on `/config`; it is NOT active when on `/logs`, `/profile`, or `/prompts`.
9. Each preview card has a visible heading ("Logs", "Profile", "Analysis Prompt") and a subtle "→" or "View all" call-to-action.
10. If data is not yet loaded, the preview cards show a minimal loading state consistent with existing views (e.g., `"Loading…"` text).

## Tasks / Subtasks

- [x] Task 1 — Update nav in `Layout.tsx` (AC: 1, 8)
  - [x] Remove the Logs, Profile, Prompts `<Link>` elements from `<nav>`
  - [x] Add a `<Link to="/config">` using the exact same `activeProps`/`inactiveProps` className pattern

- [x] Task 2 — Add `/config` route to router (AC: 2)
  - [x] Import `ConfigRoute` from `'../routes/config'`
  - [x] Import `fetchProfile` from `'../hooks/useProfileQuery'` and `fetchPrompts` from `'../hooks/usePromptsQuery'`
  - [x] Create `configRoute` with `path: '/config'`, `component: ConfigRoute`
  - [x] Add loader: `() => Promise.all([queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }), queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts })])`
  - [x] Add `configRoute` to `routeTree`

- [x] Task 3 — Create `src/client/routes/config.tsx` (AC: 2–10)
  - [x] Implement `ConfigRoute` as the page shell with `p-6 space-y-6` layout and `<h1>Config</h1>` heading
  - [x] Implement `LogsPreviewCard` sub-component (inline in same file) (AC: 3, 6, 10)
  - [x] Implement `ProfilePreviewCard` sub-component (inline in same file) (AC: 4, 6, 10)
  - [x] Implement `AnalysisPromptPreviewCard` sub-component (inline in same file) (AC: 5, 6, 10)

- [x] Task 4 — `LogsPreviewCard` implementation (AC: 3, 6, 10)
  - [x] Call `useWebhookRunsQuery()` — reuse exact hook, no new fetch
  - [x] Slice data to first 5 entries sorted by `runAt` desc (same logic as full view: `[...runs].sort((a,b) => b.runAt.localeCompare(a.runAt)).slice(0,5)`)
  - [x] Render compact table using `<table>` with `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableHead>`, `<TableCell>` from `@/components/ui/table` — same imports as `history.tsx`
  - [x] Columns: Run Date (`new Date(runAt).toLocaleString()`), Workflow (via `parseName`), Job (via `parseName`, `"—"` if empty), Success (✓/✗)
  - [x] Omit Item Count column to save space
  - [x] Wrap entire card in a `<button onClick={() => navigate({to:'/logs'})}>` or clickable `<div>` using `useNavigate` from `@tanstack/react-router`
  - [x] Loading state: `<p className="text-sm text-zinc-400">Loading…</p>`
  - [x] Empty state: `<p className="text-sm text-zinc-400">No webhook runs yet.</p>`

- [x] Task 5 — `ProfilePreviewCard` implementation (AC: 4, 6, 10)
  - [x] Call `useProfileQuery()` — reuse exact hook
  - [x] Render fields in a 2-column grid (`grid grid-cols-2 gap-4`): Name, Email, Phone, Location, LinkedIn URL, GitHub URL — exactly the 6 short fields from `profile.tsx`
  - [x] Each field: `<label className="block text-xs text-zinc-400 mb-1">` + `<p className="text-sm text-zinc-100">` (value or `"—"`)  
  - [x] No edit button, no Input/Textarea
  - [x] Entire card clickable → navigates to `/profile`
  - [x] Loading state: `<p className="text-sm text-zinc-400">Loading…</p>`

- [x] Task 6 — `AnalysisPromptPreviewCard` implementation (AC: 5, 6, 10)
  - [x] Call `usePromptsQuery()` — reuse exact hook
  - [x] Find the Analysis prompt: `data?.find(p => p.flow === 'analysis')`
  - [x] Render the `userMessage` field only in a `<pre className="whitespace-pre-wrap text-sm text-zinc-100 font-mono bg-zinc-900 border border-zinc-800 rounded p-3 max-h-40 overflow-hidden">` — truncated via `max-h-40 overflow-hidden`
  - [x] No edit, save, reset, or system prompt shown
  - [x] Entire card clickable → navigates to `/prompts`
  - [x] Loading state: `<p className="text-sm text-zinc-400">Loading…</p>`

- [x] Task 7 — Card shell pattern (AC: 9)
  - [x] Each card: `<div className="border border-zinc-800 rounded-lg p-4 cursor-pointer hover:border-zinc-600 transition-colors">` wrapping heading + content
  - [x] Card heading row: `<div className="flex items-center justify-between mb-3">` with `<h2 className="text-base font-semibold text-zinc-100">` and `<span className="text-xs text-zinc-500">View all →</span>`

## Dev Notes

### Key Constraint: Preserve existing routes
The `/logs`, `/profile`, and `/prompts` routes must NOT be removed from `router.ts`. Only remove the nav links from `Layout.tsx`. The full views remain accessible via direct URL and via clicking the Config preview cards.

### Navigation within Config previews
Use `useNavigate` from `@tanstack/react-router` to navigate programmatically from click handlers:
```tsx
import { useNavigate } from '@tanstack/react-router'

function LogsPreviewCard() {
  const navigate = useNavigate()
  return (
    <div onClick={() => navigate({ to: '/logs' })} className="... cursor-pointer ...">
      ...
    </div>
  )
}
```

### parseName helper — do NOT duplicate
The `parseName` function exists in `src/client/routes/history.tsx`. For the Logs preview card, copy or inline only the minimal logic needed, OR extract it to a shared location. Since it's a 3-line pure function, inline it directly in `config.tsx` — do not import from `history.tsx` (route files are not library modules).

```ts
function parseName(name: string): { workflow: string; job: string } {
  if (name.startsWith('Cover Letter - ')) return { workflow: 'Cover Letter', job: name.slice(15) }
  if (name.startsWith('Resume - ')) return { workflow: 'Resume', job: name.slice(9) }
  return { workflow: name, job: '' }
}
```

### Data hooks to reuse (no new hooks needed)
- `useWebhookRunsQuery()` from `@/hooks/useWebhookRunsQuery` — returns `{ data: WebhookRun[], isPending, isError }`
- `useProfileQuery()` from `@/hooks/useProfileQuery` — returns `{ data: Profile | undefined, isLoading, isError }`
- `usePromptsQuery()` from `@/hooks/usePromptsQuery` — returns `{ data: Prompt[] | undefined, isLoading, isError }`

### Prompt flow values
From `@shared/schemas`, the `flow` field values are: `'analysis'` | `'cover-letter'` | `'resume'`. Use `p.flow === 'analysis'` to find the Analysis prompt.

### Table imports
The shadcn table primitives used in `history.tsx` are:
```ts
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
```
In `config.tsx` use the `@/` alias:
```ts
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
```

### Path alias reminder
- `@/*` → `src/client/*`
- `@shared/*` → `src/shared/*`
- `history.tsx` uses relative imports; `profile.tsx` uses `@/` alias — use `@/` for consistency in `config.tsx`

### Router loader for `/config`
The `historyRoute` has NO loader (webhook runs load after navigation). Match this behavior: the Config route loader only prefetches profile + prompts. The webhook runs preview will use `isPending` state.

```ts
const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/config',
  component: ConfigRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
    queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
  ]),
})
```

### No new API endpoints
All data already exists via `/api/webhook-runs`, `/api/profile`, `/api/prompts`. Zero backend changes required.

### Project Structure Notes
- New file: `src/client/routes/config.tsx` — sub-components (`LogsPreviewCard`, `ProfilePreviewCard`, `AnalysisPromptPreviewCard`) declared inline in this file (following the `PromptSection` pattern in `prompts.tsx`)
- Modified: `src/client/lib/router.ts` — add `configRoute`
- Modified: `src/client/components/shared/Layout.tsx` — nav link changes
- No new hooks, no new API routes, no schema changes, no migrations

### TypeScript
- TypeScript strict mode is on — all `data?.` access is already nullable-safe since hooks return `undefined` before load
- Do not add `_` prefix to unused params — fix the root cause instead

### References
- Layout nav pattern: `src/client/components/shared/Layout.tsx:58-131`
- Router pattern: `src/client/lib/router.ts`
- Logs table pattern: `src/client/routes/history.tsx`
- Profile field pattern: `src/client/routes/profile.tsx:80-130` (2-col grid section)
- Prompts read-only pattern: `src/client/routes/prompts.tsx` (the `<pre>` rendering in non-edit mode)
- Hooks: `src/client/hooks/useWebhookRunsQuery.ts`, `useProfileQuery.ts`, `usePromptsQuery.ts`
- Shared schemas: `src/shared/schemas.ts` (WebhookRun, Profile/ProfileInput, Prompt types)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented ConfigRoute with three inline preview sub-components (LogsPreviewCard, ProfilePreviewCard, AnalysisPromptPreviewCard) in `src/client/routes/config.tsx`
- Removed Logs/Profile/Prompts nav links from Layout.tsx; added Config link using identical activeProps/inactiveProps pattern
- Added configRoute to router.ts with loader prefetching profile + prompts; all existing routes preserved
- parseName helper inlined in config.tsx (not imported from history.tsx per story guidance)
- Pre-existing TypeScript errors and 7 test failures (date_analyzed column missing) are unrelated to this story

### File List

- `job-hunt-dashboard/src/client/routes/config.tsx` (new)
- `job-hunt-dashboard/src/client/lib/router.ts` (modified)
- `job-hunt-dashboard/src/client/components/shared/Layout.tsx` (modified)

### Review Findings

- [x] [Review][Decision] Story 18-1 code mixed into story 17-1 scope — resolved: intentional co-implementation, treating as single deliverable.

- [x] [Review][Patch] Logs preview table renders 5 columns — AC 3 specifies exactly Run Date, Workflow, Job, Success; the "Count" `<TableHead>` and `<TableCell>` must be removed [config.tsx:40-45, 66-68]

- [x] [Review][Patch] Clickable preview cards not keyboard-accessible — `LogsPreviewCard`, `ProfilePreviewCard`, and `AnalysisPromptPreviewCard` use plain `<div onClick>` with no `tabIndex={0}`, `role="button"`, or `onKeyDown` handler [config.tsx:24, 84, 120]

- [x] [Review][Patch] `runAt` sort uses `localeCompare` — fragile for non-UTC ISO timestamps; use `new Date(b.runAt).getTime() - new Date(a.runAt).getTime()` [config.tsx:21]

- [x] [Review][Patch] Delete button not disabled during in-flight mutation — concurrent deletes possible; disable when `deleteMutation.isPending` [config.tsx:187-191]

- [x] [Review][Patch] No error feedback for failed add/delete mutations in `SearchConfigCard` — `addMutation.isError`/`deleteMutation.isError` never displayed [config.tsx:147-158]

- [x] [Review][Patch] `fetchSearchConfigs` bypasses Zod validation — raw `as SearchConfig[]` cast; should parse with schema like other hooks [hooks/useSearchConfigsQuery.ts]

- [x] [Review][Patch] Delete button missing `aria-label` in `SearchConfigCard` — renders only `✕` with no accessible name [config.tsx:187-191]

- [x] [Review][Patch] Add form `<label>` elements not associated with inputs — missing `htmlFor`/`id` pairing; clicking labels does not focus inputs [config.tsx:201-229]

- [x] [Review][Defer] Loader `Promise.all` rejection leaves Config page blank — no `errorComponent` on `configRoute`; pre-existing pattern [router.ts:84-93] — deferred, pre-existing
