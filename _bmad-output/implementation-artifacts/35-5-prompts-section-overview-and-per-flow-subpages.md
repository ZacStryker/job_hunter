# Story 35.5: Prompts Section — Overview & Per-Flow Subpages

Status: done

## Story

As a user customizing AI prompts,
I want a Prompts section overview and individual subpages per prompt flow,
So that I can see which prompts are customized at a glance and edit each one independently.

## Acceptance Criteria

1. **Given** the user navigates to `/config/prompts`, **When** the page loads, **Then** three tiles render: "Analysis", "Cover Letter", "Resume", each with a badge: "Edited" (style: `bg-zinc-700 text-zinc-300`) if `prompt.isCustom === true`; "Default" (style: `bg-zinc-800 text-zinc-400`) otherwise.

2. **Given** the user clicks a prompt tile (e.g., "Analysis"), **When** the navigation completes, **Then** the URL is `/config/prompts/analysis`.

3. **Given** the user is on `/config/prompts/analysis`, `/config/prompts/cover-letter`, or `/config/prompts/resume`, **When** the page loads, **Then** the `PromptSection` component for that flow renders with its system prompt (if applicable), user message, and edit/save/cancel/reset controls.

4. **Given** the user edits a prompt and saves, **When** `PUT /api/prompts/:flow` succeeds, **Then** the form exits edit mode, updated content is shown, and the prompt is marked `isCustom: true`.

5. **Given** the user resets a customized prompt to defaults, **When** `DELETE /api/prompts/:flow` succeeds, **Then** the default prompt text is restored and the "Edited" badge disappears from the tile (badge on the subpage heading also clears).

6. **Given** the Prompts overview tile for a flow shows "Edited", **When** the user navigates away and returns, **Then** the badge still reflects the current `isCustom` state (data from `['prompts']` query, invalidated on mutation success).

## Tasks / Subtasks

- [x] Task 1 — Extract `PromptSection` into a shared component (prerequisite for Tasks 2 & 3)
  - [x] Create `src/client/components/config/PromptSection.tsx` — move the `PromptSection` function (lines 27–136 of `prompts.tsx`) into it verbatim, exporting it as a named export
  - [x] Keep all internal state (`isEditing`, `draftSystem`, `draftUser`), hooks (`usePromptMutation`, `usePromptResetMutation`), and constants (`FLOW_LABELS`, `SYSTEM_PROMPT_PLACEHOLDERS`, `USER_MESSAGE_PLACEHOLDERS`) inside the new file
  - [x] Exports: `export function PromptSection({ prompt }: { prompt: Prompt })`
  - [x] Imports needed: `useState` from React, `Loader2` from `lucide-react`, `Button` from `@/components/ui/button`, `Textarea` from `@/components/ui/textarea`, `usePromptMutation` from `@/hooks/usePromptMutation`, `usePromptResetMutation` from `@/hooks/usePromptResetMutation`, `Prompt`, `PromptFlow` from `@shared/schemas`

- [x] Task 2 — Replace `prompts-index.tsx` stub with 3-tile overview (AC: 1, 2)
  - [x] Replace the current `<p>Coming soon</p>` stub in `src/client/routes/config/prompts-index.tsx` with a 3-tile grid
  - [x] Import: `Link` from `@tanstack/react-router`, `usePromptsQuery` from `@/hooks/usePromptsQuery`
  - [x] Derive badge state: find each flow in `prompts` array by `.find(p => p.flow === flow)?.isCustom ?? false`
  - [x] Three tiles: "Analysis" → `/config/prompts/analysis`, "Cover Letter" → `/config/prompts/cover-letter`, "Resume" → `/config/prompts/resume`
  - [x] Badge: `isCustom` → `<span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>`; otherwise → `<span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>`
  - [x] Data is pre-populated by router loader — do NOT add loading/error guards; use `const { data: prompts = [] } = usePromptsQuery()`
  - [x] Outer div: `<div className="p-6">` with `<h1 className="text-xl font-semibold text-zinc-100 mb-6">Prompts</h1>` and `<div className="grid grid-cols-2 gap-4">`

- [x] Task 3 — Create three subpage components (AC: 3, 4, 5)
  - [x] Create `src/client/routes/config/prompts-analysis.tsx`:
    - Export `PromptsAnalysisRoute`
    - `const { data: prompts = [] } = usePromptsQuery()` — find `prompts.find(p => p.flow === 'analysis')`
    - `<h1 className="text-xl font-semibold text-zinc-100 mb-6">Analysis</h1>` at top
    - Render `<PromptSection prompt={prompt} />` — if prompt not found, render nothing (loader guarantees it exists)
    - Wrap in `<div className="p-6">`
  - [x] Create `src/client/routes/config/prompts-cover-letter.tsx`:
    - Export `PromptsCoverLetterRoute`
    - Find `prompts.find(p => p.flow === 'cover_letter')` (note: flow value is `cover_letter`, URL is `cover-letter`)
    - `<h1>Cover Letter</h1>` heading, same wrapper pattern
  - [x] Create `src/client/routes/config/prompts-resume.tsx`:
    - Export `PromptsResumeRoute`
    - Find `prompts.find(p => p.flow === 'resume')`
    - `<h1>Resume</h1>` heading, same wrapper pattern

- [x] Task 4 — Router updates (AC: 1, 2, 3, 6)
  - [x] Add imports to `router.ts`: `PromptsAnalysisRoute` from `'../routes/config/prompts-analysis'`, `PromptsCoverLetterRoute` from `'../routes/config/prompts-cover-letter'`, `PromptsResumeRoute` from `'../routes/config/prompts-resume'`
  - [x] Add loader to the existing `configPromptsRoute` (currently has no loader): `loader: () => queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts })`
  - [x] Add three new routes as children of `configLayoutRoute`:
    ```typescript
    const configPromptsAnalysisRoute = createRoute({
      getParentRoute: () => configLayoutRoute,
      path: '/config/prompts/analysis',
      component: PromptsAnalysisRoute,
      loader: () => queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
    })

    const configPromptsCoverLetterRoute = createRoute({
      getParentRoute: () => configLayoutRoute,
      path: '/config/prompts/cover-letter',
      component: PromptsCoverLetterRoute,
      loader: () => queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
    })

    const configPromptsResumeRoute = createRoute({
      getParentRoute: () => configLayoutRoute,
      path: '/config/prompts/resume',
      component: PromptsResumeRoute,
      loader: () => queryClient.ensureQueryData({ queryKey: ['prompts'], queryFn: fetchPrompts }),
    })
    ```
  - [x] Add all three to `configLayoutRoute.addChildren([..., configPromptsAnalysisRoute, configPromptsCoverLetterRoute, configPromptsResumeRoute, ...])`
  - [x] `fetchPrompts` is already imported in `router.ts` (line 11) — no new import needed

- [x] Task 5 — Cleanup `prompts.tsx` (dead code)
  - [x] Delete `src/client/routes/prompts.tsx` — it is not imported anywhere in `router.ts` (the `PromptsRoute` was removed in story 35.1); it is orphaned dead code once `PromptSection` is extracted

- [x] Task 6 — Verify build passes (AC: all)
  - [x] Run `bun run build` (or `tsc --noEmit`) to confirm zero TypeScript errors

## Dev Notes

### Badge Style — DIFFERENT from other overview tiles

Other section overviews (Profile, Job Sources) use emerald "Configured" / zinc "Incomplete" badges. Prompts tiles use a **different semantic**:

```tsx
// Edited (customized):
<span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>

// Default (not customized):
<span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
```

This matches the `PromptSection` inline badge (`bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded`). Use `rounded-full` on the tile badge (same as profile/job-sources tiles) for visual consistency.

### PromptSection Source (prompts.tsx lines 1–136)

The full source is at `src/client/routes/prompts.tsx`. Key internals to preserve verbatim:

```tsx
const FLOW_LABELS: Record<PromptFlow, string> = {
  analysis: 'Analysis',
  cover_letter: 'Cover Letter',
  resume: 'Resume',
}

const SYSTEM_PROMPT_PLACEHOLDERS: Record<PromptFlow, string | null> = {
  analysis: null,
  cover_letter: '{{CANDIDATE_PROFILE}}',
  resume: '{{CANDIDATE_PROFILE}}  (HTML template appended automatically)',
}

const USER_MESSAGE_PLACEHOLDERS: Record<PromptFlow, string> = {
  analysis: '{{CANDIDATE_NAME}}, {{CANDIDATE_PROFILE_JSON}}, {{JOB_LISTING_JSON}}',
  cover_letter: '{{JOB_DETAILS}}',
  resume: '{{JOB_DETAILS}}',
}
```

The `PromptSection` component manages its own `isEditing` state and calls `usePromptMutation` / `usePromptResetMutation` directly — no props needed beyond `prompt`. The save mutation sends `{ flow, input: { systemPrompt: prompt.systemPrompt !== null ? draftSystem : null, userMessage: draftUser } }`.

### URL vs Flow Value Mismatch

| Flow value (DB/schema) | URL segment | File name |
|------------------------|------------|-----------|
| `analysis` | `analysis` | `prompts-analysis.tsx` |
| `cover_letter` | `cover-letter` | `prompts-cover-letter.tsx` |
| `resume` | `resume` | `prompts-resume.tsx` |

Use the flow value (`cover_letter`) when calling `.find(p => p.flow === 'cover_letter')`. Use the URL segment (`cover-letter`) for the router path. Do NOT confuse them.

### Exact `prompts-index.tsx` Implementation

```tsx
import { Link } from '@tanstack/react-router'
import { usePromptsQuery } from '@/hooks/usePromptsQuery'

export function ConfigPromptsIndexRoute() {
  const { data: prompts = [] } = usePromptsQuery()

  const analysisEdited = prompts.find(p => p.flow === 'analysis')?.isCustom ?? false
  const coverLetterEdited = prompts.find(p => p.flow === 'cover_letter')?.isCustom ?? false
  const resumeEdited = prompts.find(p => p.flow === 'resume')?.isCustom ?? false

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Prompts</h1>
      <div className="grid grid-cols-2 gap-4">
        <Link to="/config/prompts/analysis" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Analysis</span>
            {analysisEdited
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
            }
          </div>
        </Link>
        <Link to="/config/prompts/cover-letter" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Cover Letter</span>
            {coverLetterEdited
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
            }
          </div>
        </Link>
        <Link to="/config/prompts/resume" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Resume</span>
            {resumeEdited
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
            }
          </div>
        </Link>
      </div>
    </div>
  )
}
```

### Exact Subpage Pattern (`prompts-analysis.tsx` as example)

```tsx
import { usePromptsQuery } from '@/hooks/usePromptsQuery'
import { PromptSection } from '@/components/config/PromptSection'

export function PromptsAnalysisRoute() {
  const { data: prompts = [] } = usePromptsQuery()
  const prompt = prompts.find(p => p.flow === 'analysis')

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Analysis</h1>
      {prompt && <PromptSection prompt={prompt} />}
    </div>
  )
}
```

Follow the same pattern for `cover_letter` and `resume` flows. The loader guarantees the prompt exists, but the `&&` guard prevents a TypeScript error on the `undefined` case.

### Router Additions — Exact Placement

The existing `configPromptsRoute` is at `router.ts:235`. Add the loader to it, then insert the three new routes after it and before `configLogsRoute`. Updated `addChildren` order:

```typescript
configLayoutRoute.addChildren([
  configOverviewRoute,
  configProfileRoute,
  configProfileResumeRoute,
  configProfileApiKeysRoute,
  configProfileInboxMappingRoute,
  configJobSourcesRoute,
  configJobSourcesAuthSetupRoute,
  configJobSourcesSearchesRoute,
  configPromptsRoute,           // ← add loader here
  configPromptsAnalysisRoute,   // ← new
  configPromptsCoverLetterRoute, // ← new
  configPromptsResumeRoute,     // ← new
  configLogsRoute,
])
```

`fetchPrompts` is already imported at router.ts line 11. No new imports needed beyond the three route components.

### `prompts.tsx` Deletion

After extracting `PromptSection`, `prompts.tsx` becomes dead code. It is NOT imported in `router.ts` (the `PromptsRoute` was removed in story 35.1 when the old `/prompts` route was deleted). Delete the file — do not leave it orphaned.

The `PromptsRoute` function in `prompts.tsx` was the old standalone page; it rendered all three flows in a single scrollable view. This story replaces it with per-flow subpages accessible through the left nav.

### New Directory

`src/client/components/config/` does not exist yet — create it when placing `PromptSection.tsx`. No other files go there for this story.

### Project Conventions

- `apiFetch` from `@/lib/api` for API calls — `usePromptMutation` and `usePromptResetMutation` already use it internally
- Route loader data pre-caches queries — do NOT add loading/error guards in components for pre-loaded `['prompts']` key; use `data = [] ` fallback to keep TypeScript happy
- Toast: not needed in `PromptSection` (it shows inline error; save/reset success is evident from UI state change)
- No comments for obvious code

### File Structure Summary

```
New files:
  src/client/components/config/PromptSection.tsx
  src/client/routes/config/prompts-analysis.tsx
  src/client/routes/config/prompts-cover-letter.tsx
  src/client/routes/config/prompts-resume.tsx

Modified files:
  src/client/routes/config/prompts-index.tsx   ← replace stub with 3-tile grid
  src/client/lib/router.ts                      ← add loader to configPromptsRoute + 3 new routes

Deleted files:
  src/client/routes/prompts.tsx                 ← dead code, replaced by per-flow subpages
```

### Cross-Story Context

- **Story 35.4** (done): Established the tile grid pattern for Job Sources (2 tiles). This story follows the same pattern for Prompts (3 tiles, same `gap-4 grid-cols-2` layout).
- **Story 35.1** (done): Removed the old `/prompts` standalone route from `router.ts` — `PromptsRoute` is already dead code in `prompts.tsx`.
- **Story 35.6** (next): Logs section — `/config/logs` route already exists from 35.1, story 35.6 fleshes it out. Do not touch it here.
- The `configPromptsRoute` currently has NO loader. The `configOverviewRoute` (35.1) already loads `['prompts']` for the overview tiles — that's a separate ensureQueryData call and this story adds an independent one to the prompts route itself.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation with no issues.

### Completion Notes List

- Extracted `PromptSection` component verbatim from `prompts.tsx` into `src/client/components/config/PromptSection.tsx`; created the new `src/client/components/config/` directory
- Replaced `prompts-index.tsx` stub with a 3-tile grid (Analysis, Cover Letter, Resume) with Edited/Default badges matching the spec
- Created three subpage route components: `prompts-analysis.tsx`, `prompts-cover-letter.tsx`, `prompts-resume.tsx` — each finds its prompt by flow value and renders `<PromptSection>`
- Updated `router.ts`: added loader to `configPromptsRoute`, imported and registered three new routes, added all three to `configLayoutRoute.addChildren`
- Deleted orphaned `src/client/routes/prompts.tsx` (dead code since story 35.1)
- Build passes with zero TypeScript errors (`bun run build` ✓)

### File List

- `src/client/components/config/PromptSection.tsx` (new)
- `src/client/routes/config/prompts-index.tsx` (modified)
- `src/client/routes/config/prompts-analysis.tsx` (new)
- `src/client/routes/config/prompts-cover-letter.tsx` (new)
- `src/client/routes/config/prompts-resume.tsx` (new)
- `src/client/lib/router.ts` (modified)
- `src/client/routes/prompts.tsx` (deleted)

### Review Findings

- [x] [Review][Patch] Stale draft state after mutation — identified from truncated diff; actual `handleEdit()` already re-syncs `draftSystem`/`draftUser` from the current `prompt` prop before entering edit mode. No fix needed. [`PromptSection.tsx`]
- [x] [Review][Defer] Reset error never shown to user [`PromptSection.tsx`] — deferred, pre-existing; `resetMutation.isError` has no error display; carried verbatim from `prompts.tsx`
- [x] [Review][Defer] Concurrent mutation collision traps UI [`PromptSection.tsx`] — deferred, pre-existing; if reset fails and `isError` is unshown, `isBusy` stays false but user has no recovery path; carried verbatim from `prompts.tsx`

## Change Log

- 2026-05-18: Implemented story 35.5 — extracted PromptSection component, built 3-tile Prompts overview, created per-flow subpages (analysis, cover-letter, resume), updated router with loaders and new routes, deleted dead code prompts.tsx. Build ✓
- 2026-05-18: Code review complete — 1 patch, 2 deferred, 9 dismissed
