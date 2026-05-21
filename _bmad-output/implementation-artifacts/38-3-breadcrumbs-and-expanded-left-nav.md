# Story 38.3: Breadcrumbs & Expanded Left Nav

Status: done

## Story

As a user navigating deep into the Config section,
I want breadcrumbs at the top of the content area and an always-expanded left nav showing all child pages,
so that I always know where I am and can jump to any config page in one click.

## Acceptance Criteria

1. **Given** the user is on any `/config/*` route except the root `/config` overview, **When** the content area renders, **Then** a breadcrumb trail appears at the top of the content area, separated from the page content by a thin border.

2. **Given** the user is on any route, the breadcrumb segments shown are:

   | Route | Breadcrumb |
   |---|---|
   | `/config` | *(no breadcrumb — do not render the bar)* |
   | `/config/profile` | Config / Profile |
   | `/config/profile/resume` | Config / Profile / Candidate Info |
   | `/config/profile/api-keys` | Config / Profile / API Keys |
   | `/config/profile/inbox-mapping` | Config / Profile / Inbox Mapping |
   | `/config/job-sources` | Config / Job Sources |
   | `/config/job-sources/auth-setup` | Config / Job Sources / Auth Setup |
   | `/config/job-sources/searches` | Config / Job Sources / Searches |
   | `/config/prompts` | Config / Prompts |
   | `/config/prompts/analysis` | Config / Prompts / Analyze Jobs |
   | `/config/prompts/cover-letter` | Config / Prompts / Generate Cover Letter |
   | `/config/prompts/resume` | Config / Prompts / Generate Resume |
   | `/config/logs` | Config / Logs |

3. **Given** the breadcrumb is rendered, **When** the user clicks any segment except the last, **Then** they navigate to that route (each non-last segment is a `<Link>`).

4. **Given** the breadcrumb is rendered, **When** the user looks at the last segment, **Then** it is plain text (not a link) and uses a lighter color to indicate the current page.

5. **Given** the user is on any config page, **When** they look at the left nav, **Then** the nav always shows all child pages nested under each parent section (expanded tree, never collapsed).

6. **Given** the left nav is rendered, **When** the user inspects the visual hierarchy, **Then** parent section links are visually styled as uppercase labels and child links are indented.

7. **Given** the user is on a child page (e.g., `/config/profile/resume`), **When** they look at the left nav, **Then** the active child link is highlighted (`bg-zinc-800 text-zinc-100`); the parent link text is `text-zinc-400 hover:text-zinc-200` (no active background on parent).

8. **Given** the user is on a section overview (e.g., `/config/profile`), **When** they look at the left nav, **Then** the parent "Profile" link is active (`bg-zinc-800 text-zinc-100`); child links are visible but inactive.

## Tasks / Subtasks

- [x] Create `src/client/components/config/ConfigBreadcrumb.tsx` (AC: 1, 2, 3, 4)
  - [x] Use `useRouterState({ select: s => s.location.pathname })` to get current path
  - [x] Define static `PATH_LABELS` record mapping all 13 config paths to display labels
  - [x] Build cumulative path prefix array from pathname segments
  - [x] Render each prefix as a `<Link>` except the last (rendered as `<span>`)
  - [x] Return `null` when pathname is exactly `/config` (no breadcrumb bar on overview)
  - [x] Wrap the bar in a div so it's conditionally absent (see Dev Notes)
- [x] Update `src/client/routes/config/layout.tsx` — breadcrumb bar in main area (AC: 1)
  - [x] Import `ConfigBreadcrumb` from `@/components/config/ConfigBreadcrumb`
  - [x] Wrap `<Outlet />` with breadcrumb header: `<ConfigBreadcrumb />` above `<Outlet />`
- [x] Update `src/client/routes/config/layout.tsx` — expanded left nav tree (AC: 5, 6, 7, 8)
  - [x] Replace 4 flat links with expanded tree structure (Profile, Job Sources, Prompts, Logs)
  - [x] Add child links indented under each parent
  - [x] Apply `activeOptions={{ exact: true }}` to parent links
  - [x] Style parents as uppercase label, children as `pl-7` indented

## Dev Notes

**2 files total:** 1 new component, 1 updated layout. No API changes, no route changes, no schema changes.

### New Component: `ConfigBreadcrumb.tsx`

**File location:** `job-hunt-dashboard/src/client/components/config/ConfigBreadcrumb.tsx`

This folder already exists — `PromptSection.tsx` lives there (`job-hunt-dashboard/src/client/components/config/PromptSection.tsx`). Place `ConfigBreadcrumb.tsx` alongside it.

**Import path in layout.tsx:** `import { ConfigBreadcrumb } from '@/components/config/ConfigBreadcrumb'`

**Key implementation pattern — `useRouterState`:**

`useRouterState` is available in TanStack Router v1.x (project uses `^1.0.0`). It is NOT currently used elsewhere in the codebase (new usage). Import from `@tanstack/react-router`:

```tsx
import { useRouterState, Link } from '@tanstack/react-router'

const pathname = useRouterState({ select: s => s.location.pathname })
```

The `select` form prevents re-renders when other router state changes (search params, etc.) — always use the `select` form here.

**Static path → label map (all 13 paths — every one must be present):**

```tsx
const PATH_LABELS: Record<string, string> = {
  '/config': 'Config',
  '/config/profile': 'Profile',
  '/config/profile/resume': 'Candidate Info',
  '/config/profile/api-keys': 'API Keys',
  '/config/profile/inbox-mapping': 'Inbox Mapping',
  '/config/job-sources': 'Job Sources',
  '/config/job-sources/auth-setup': 'Auth Setup',
  '/config/job-sources/searches': 'Searches',
  '/config/prompts': 'Prompts',
  '/config/prompts/analysis': 'Analyze Jobs',
  '/config/prompts/cover-letter': 'Generate Cover Letter',
  '/config/prompts/resume': 'Generate Resume',
  '/config/logs': 'Logs',
}
```

**CRITICAL — label strings must match story 38.1 renames:** `/config/profile/resume` → "Candidate Info" (NOT "Resume"), `/config/prompts/analysis` → "Analyze Jobs", `/config/prompts/cover-letter` → "Generate Cover Letter", `/config/prompts/resume` → "Generate Resume". These were renamed in story 38.1 and must be consistent here.

**Building prefix segments:**

Split the pathname on `/` to get segments, build cumulative prefixes:
- `/config/profile/resume` → segments `['', 'config', 'profile', 'resume']`
- Prefixes: `/config`, `/config/profile`, `/config/profile/resume`
- Map each prefix to `PATH_LABELS[prefix]` to get the display label
- Render each prefix/label pair; the last is a `<span>`, all others are `<Link to={prefix}>`

**Conditional rendering — return null on `/config`:**

The breadcrumb component should render the wrapper div too (not just the nav), so the layout never shows an empty border line on the overview page. The layout renders `<ConfigBreadcrumb />` directly above `<Outlet />` — there is no separate conditional in the layout.

Return `null` from the component when `pathname === '/config'`.

**Breadcrumb styling:**

```tsx
<nav className="flex items-center gap-1 text-xs text-zinc-500">
  {/* for each non-last segment */}
  <Link to={prefix} className="hover:text-zinc-300 transition-colors">{label}</Link>
  <span className="text-zinc-700">/</span>
  {/* for last segment */}
  <span className="text-zinc-400">{label}</span>
</nav>
```

The enclosing div (rendered from the component, NOT layout):
```tsx
<div className="px-6 pt-3 pb-2 border-b border-zinc-800/60">
  <nav ...>...</nav>
</div>
```

### Updated Layout: `layout.tsx`

**Current state** (`job-hunt-dashboard/src/client/routes/config/layout.tsx`):
- 4 flat `<Link>` items (Profile, Job Sources, Prompts, Logs)
- `<main className="flex-1 overflow-auto"><Outlet /></main>`

**After this story:**

```tsx
import { Outlet, Link } from '@tanstack/react-router'
import { ConfigBreadcrumb } from '@/components/config/ConfigBreadcrumb'

export function ConfigLayout() {
  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 border-r border-zinc-800 p-4">
        {/* Profile section */}
        <Link
          to="/config/profile"
          activeOptions={{ exact: true }}
          className="block px-3 py-1.5 mt-1 text-xs font-semibold uppercase tracking-wide transition-colors rounded"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >
          Profile
        </Link>
        <Link to="/config/profile/resume" activeOptions={{ exact: true }}
          className="block pl-7 py-1.5 text-xs rounded transition-colors"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800 font-medium' }}
          inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
        >Candidate Info</Link>
        <Link to="/config/profile/api-keys" activeOptions={{ exact: true }}
          className="block pl-7 py-1.5 text-xs rounded transition-colors"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800 font-medium' }}
          inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
        >API Keys</Link>
        <Link to="/config/profile/inbox-mapping" activeOptions={{ exact: true }}
          className="block pl-7 py-1.5 text-xs rounded transition-colors"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800 font-medium' }}
          inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-300' }}
        >Inbox Mapping</Link>

        {/* Job Sources section */}
        <Link to="/config/job-sources" activeOptions={{ exact: true }}
          className="block px-3 py-1.5 mt-3 text-xs font-semibold uppercase tracking-wide transition-colors rounded"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >Job Sources</Link>
        {/* ... child links ... */}

        {/* Prompts section */}
        {/* ... */}

        {/* Logs — no children, mt-2 top spacer */}
        <Link to="/config/logs" activeOptions={{ exact: true }}
          className="block px-3 py-1.5 mt-2 text-xs font-semibold uppercase tracking-wide transition-colors rounded"
          activeProps={{ className: 'text-zinc-100 bg-zinc-800' }}
          inactiveProps={{ className: 'text-zinc-400 hover:text-zinc-200' }}
        >Logs</Link>
      </nav>

      <main className="flex-1 overflow-auto">
        <ConfigBreadcrumb />
        <Outlet />
      </main>
    </div>
  )
}
```

**Full nav tree label → route mapping:**

```
Profile → /config/profile (exact, parent)
  Candidate Info → /config/profile/resume
  API Keys → /config/profile/api-keys
  Inbox Mapping → /config/profile/inbox-mapping
Job Sources → /config/job-sources (exact, parent)
  Auth Setup → /config/job-sources/auth-setup
  Searches → /config/job-sources/searches
Prompts → /config/prompts (exact, parent)
  Analyze Jobs → /config/prompts/analysis
  Generate Cover Letter → /config/prompts/cover-letter
  Generate Resume → /config/prompts/resume
Logs → /config/logs (exact, standalone — no children)
```

**Active state rules:**
- Parent links use `activeOptions={{ exact: true }}` — they activate ONLY on their exact path (not when a child is active)
- Child links always use exact matching (default in TanStack Router when `activeOptions` is not set, but set `exact: true` explicitly for clarity)
- When on a child page: child is highlighted (`bg-zinc-800 text-zinc-100`), parent just uses `text-zinc-400 hover:text-zinc-200` (no highlight)
- When on a parent overview: parent is highlighted, children are inactive

**IMPORTANT: Drop the old `activeOptions={{ exact: false }}` pattern.** The current layout.tsx uses `activeOptions={{ exact: false }}` on all links (so "Profile" highlights on `/config/profile/resume`). This story replaces that with `exact: true` on parent links. The old `space-y-1` on `<nav>` can be dropped since spacing is now controlled per-item with `mt-1`/`mt-3`/`mt-2`.

### TypeScript Strict Mode Compliance

- `useRouterState` returns typed router state — no `any` casts needed
- All entries in `PATH_LABELS` are `string → string` — no optional chaining required
- No unused imports or variables — TypeScript strict mode will fail the build otherwise
- Do not import `useRouterState` in `layout.tsx` — keep router state only in `ConfigBreadcrumb.tsx`

### Anti-Patterns to Avoid

- **DO NOT** use `activeOptions={{ exact: false }}` on parent links — this was the old pattern that caused parents to highlight when children are active
- **DO NOT** use `useNavigate` or `window.location` to derive the path — use `useRouterState`
- **DO NOT** split on `/config` prefix manually with string slicing — build cumulative prefixes from the segments array
- **DO NOT** add dynamic/accordion collapse logic to the nav — the spec requires always-expanded; no toggle state
- **DO NOT** modify any file other than `layout.tsx` and the new `ConfigBreadcrumb.tsx`
- **DO NOT** edit `src/client/components/ui/` files — shadcn generated
- **DO NOT** add `TooltipProvider` or other story 38.2 changes — those are already done in `overview.tsx`, `profile-index.tsx`, `job-sources-index.tsx`, `prompts-index.tsx`

### Previous Story Context

**Story 38.2 (done)** added `TooltipProvider` + `CircleHelp` tooltip buttons to all 4 index pages. Those files are not touched in this story.

**Story 38.1 (done)** renamed display labels. The breadcrumb label strings MUST match 38.1 renames:
- `/config/profile/resume` → "Candidate Info" (NOT "Resume")
- `/config/prompts/analysis` → "Analyze Jobs" (NOT "Analysis")
- `/config/prompts/cover-letter` → "Generate Cover Letter" (NOT "Cover Letter")
- `/config/prompts/resume` → "Generate Resume" (NOT "Resume")

### Project Structure Notes

- New component: `job-hunt-dashboard/src/client/components/config/ConfigBreadcrumb.tsx`
  - `@/` alias resolves to `src/client/` — import as `@/components/config/ConfigBreadcrumb`
- Modified: `job-hunt-dashboard/src/client/routes/config/layout.tsx`
- No changes to `src/client/lib/router.ts` — no new routes, no loader changes
- No changes to any index or subpage route files

### References

- Epic spec: `_bmad-output/planning-artifacts/epics/epic-38-config-ux-polish.md` — Story 38.3 (full dev notes)
- Current layout: `job-hunt-dashboard/src/client/routes/config/layout.tsx` (4 flat links, read 2026-05-21)
- Existing component in same folder: `job-hunt-dashboard/src/client/components/config/PromptSection.tsx`
- Router setup: `job-hunt-dashboard/src/client/lib/router.ts` — confirms all 13 config routes exist
- `useRouterState` docs: TanStack Router v1.x — `select` option reduces re-renders to pathname changes only
- Label strings: `_bmad-output/implementation-artifacts/38-1-rename-config-section-labels.md` — authoritative source of display labels

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Created `ConfigBreadcrumb.tsx` alongside existing `PromptSection.tsx` in `components/config/`. Uses `useRouterState` with `select` to subscribe to pathname only, preventing unnecessary re-renders. Breadcrumb builds cumulative prefix segments from the split pathname and maps each to `PATH_LABELS` — returns `null` on `/config` so no border line appears on the overview. Updated `layout.tsx` to replace 4 flat `exact: false` links with a full expanded nav tree (4 parent sections + 10 children), switched all parents to `exact: true` active matching, styled parents as uppercase tracking-wide labels and children as `pl-7` indented. `ConfigBreadcrumb` placed above `<Outlet />` in the main area. Build passes TypeScript strict mode with zero errors; 11 pre-existing test failures in unrelated modules (LinkedIn/Indeed auth, SMTP).

### File List

- job-hunt-dashboard/src/client/components/config/ConfigBreadcrumb.tsx (new)
- job-hunt-dashboard/src/client/routes/config/layout.tsx (modified)

### Review Findings

- [x] [Review][Patch] Typo in Prompts section-header `inactiveProps`: `text/zinc-400` — dismissed, false positive (code was already `text-zinc-400`)
- [x] [Review][Patch] Missing `aria-label="Breadcrumb"` on breadcrumb `<nav>` — two unlabelled nav landmarks on the page [ConfigBreadcrumb.tsx] — fixed
- [x] [Review][Patch] Missing `aria-current="page"` on last breadcrumb `<span>` — screen readers cannot identify current location [ConfigBreadcrumb.tsx] — fixed
- [x] [Review][Defer] Fallback label exposes raw path string for unrecognized routes (`PATH_LABELS[prefix] ?? prefix`) — deferred, pre-existing design gap for future routes [ConfigBreadcrumb.tsx]
- [x] [Review][Defer] Trailing slash `/config/` bypasses `pathname === '/config'` null guard — deferred, TanStack Router normalizes trailing slashes in practice [ConfigBreadcrumb.tsx]
