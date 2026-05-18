# Story 35.2: Profile Section — Overview & Resume Subpage

Status: done

## Story

As a user managing my profile,
I want a Profile section overview and a Resume subpage,
so that I can see my profile configuration status at a glance and edit all my profile details in one place.

## Acceptance Criteria

1. **Given** the user navigates to `/config/profile`, **When** the page loads, **Then** three tiles are rendered: "Resume", "API Keys", "Inbox Mapping", each with a configured/incomplete badge:
   - Resume tile: Configured if `profile.name` is set (non-null, non-empty); otherwise Incomplete
   - API Keys tile: Configured if `hasAnthropicKey` is true; otherwise Incomplete
   - Inbox Mapping tile: Configured if `hasImap` is true; otherwise Incomplete

2. **Given** the user clicks the "Resume" tile on the Profile overview, **When** the navigation completes, **Then** the URL is `/config/profile/resume` and the full profile form renders.

3. **Given** the user is on `/config/profile/resume`, **When** the page loads, **Then** all profile fields are present and editable: Full Name, Email, Phone, Location, LinkedIn URL, GitHub/Portfolio URL (2-column grid), and Summary, Experience, Skills, Education (full-width textareas).

4. **Given** the user edits fields and clicks Save, **When** the mutation succeeds, **Then** the form exits edit mode, updated values are displayed, and a success toast is shown.

5. **Given** the user clicks Cancel while editing, **When** Cancel is clicked, **Then** the draft is discarded and the form returns to read-only view with original values.

6. **Given** the mutation is in progress, **When** the Save button is in pending state, **Then** a spinner is shown and all form controls are disabled.

## Tasks / Subtasks

- [x] Task 1 — Replace profile-index stub with 3-tile overview (AC: 1)
  - [x] Replace content of `src/client/routes/config/profile-index.tsx` with a 3-tile grid component using `useOnboardingStatusQuery` and `useProfileQuery`
  - [x] Resume tile: link to `/config/profile/resume`; badge logic: `!!profile?.name` → Configured / Incomplete
  - [x] API Keys tile: link to `/config/profile/api-keys` (stub nav target — no route yet); badge: `status?.hasAnthropicKey`
  - [x] Inbox Mapping tile: link to `/config/profile/inbox-mapping` (stub nav target — no route yet); badge: `status?.hasImap`
  - [x] Badge style: emerald-900 bg / emerald-400 text for Configured; zinc-800 bg / zinc-400 text for Incomplete (matches overview.tsx pattern)
  - [x] Tile click: `<Link>` wrapping the entire tile (same pattern as overview.tsx)
  - [x] Data is pre-loaded by router loader — do NOT add loading/error states; hooks return synchronously from cache

- [x] Task 2 — Create profile-resume.tsx (AC: 2, 3, 4, 5, 6)
  - [x] Create `src/client/routes/config/profile-resume.tsx`
  - [x] Move the `ProfileRoute` component from `src/client/routes/profile.tsx` into this file; rename export to `ProfileResumeRoute`
  - [x] Remove `isLoading` / `isError` guard states — data is pre-loaded by router loader; the hook returns from cache instantly (keep the hook call, but omit the loading/error branches)
  - [x] Add `import { toast } from 'sonner'` and call `toast.success('Profile saved')` inside `onSuccess` of the `mutation.mutate(...)` callback (AC 4)
  - [x] Keep all other logic unchanged: draft state, `handleEdit`, `handleCancel`, `handleSave`, `setField`, 2-column grid for short fields, full-width textareas for Summary/Experience/Skills/Education

- [x] Task 3 — Update router.ts (AC: 1, 2)
  - [x] Add import for `ProfileResumeRoute` from `'../routes/config/profile-resume'`
  - [x] Add loader to `configProfileRoute`: `loader: () => Promise.all([queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }), queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus })])`
  - [x] Add new route: `configProfileResumeRoute` — `createRoute({ getParentRoute: () => configLayoutRoute, path: '/config/profile/resume', component: ProfileResumeRoute, loader: () => queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }) })`
  - [x] Add `configProfileResumeRoute` inside `configLayoutRoute.addChildren([...])` in the routeTree

- [x] Task 4 — Delete old profile.tsx (AC: cleanup)
  - [x] Delete `src/client/routes/profile.tsx` (the component is now in `profile-resume.tsx`; the route was already removed from the router in story 35.1)
  - [x] Verify no remaining imports of `ProfileRoute` from `profile.tsx` exist (already removed in 35.1)

- [x] Task 5 — Verify build passes
  - [x] Run `bun run build` (or `tsc --noEmit`) to confirm zero TypeScript errors after changes

## Dev Notes

### Context from Story 35.1

Story 35.1 established the `_config` pathless layout route and stubbed out all section routes. Key facts:
- `configLayoutRoute` is the parent for all `/config/*` routes
- `configProfileRoute` currently has NO loader and renders `ConfigProfileIndexRoute` stub — this story adds the loader and replaces the stub component
- `profile.tsx` still exists as a file but `profileRoute` was already removed from the router in 35.1 — no circular imports or lingering registrations to worry about
- All other config routes (`job-sources`, `prompts`, `logs`) remain stubs — do NOT implement beyond this story's scope

### Profile Overview — 3-Tile Pattern

Match `overview.tsx` exactly for tile structure and badge styles:

```tsx
import { Link } from '@tanstack/react-router'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'
import { useProfileQuery } from '@/hooks/useProfileQuery'

export function ConfigProfileIndexRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const { data: profile } = useProfileQuery()

  const resumeConfigured = !!profile?.name
  const apiKeysConfigured = !!status?.hasAnthropicKey
  const inboxConfigured = !!status?.hasImap

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Profile</h1>
      <div className="grid grid-cols-2 gap-6">
        <Link to="/config/profile/resume" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Resume</span>
            {resumeConfigured
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
            }
          </div>
        </Link>
        {/* API Keys and Inbox Mapping tiles — same pattern, links to /config/profile/api-keys and /config/profile/inbox-mapping */}
      </div>
    </div>
  )
}
```

**Important:** `to="/config/profile/api-keys"` and `to="/config/profile/inbox-mapping"` have no registered routes yet (those are story 35.3). TanStack Router will throw a type error if you use `<Link to="...">` for non-existent routes. Use a `<div role="button" onClick={() => {/* noop */}}>` or `<a href="/config/profile/api-keys">` for those two tiles until story 35.3 creates the routes.

Alternatively, if the type error is an issue: wrap in `<div className="... cursor-pointer">` with no link for the unimplemented tiles, but keep the Resume tile as a `<Link>`.

### Profile Resume Route — Adapting ProfileRoute

The existing `ProfileRoute` in `profile.tsx`:
- Uses `useProfileQuery` (returns `{ data, isLoading, isError }`)
- Uses `useProfileMutation` from `src/client/hooks/useProfileMutation.ts`
- Manages `isEditing` and `draft` local state
- On save: calls `mutation.mutate(input, { onSuccess: () => { setDraft(null); setIsEditing(false) } })`

**Changes needed in `ProfileResumeRoute`:**

1. Remove the `isLoading` and `isError` guard branches (data is pre-loaded by loader, hook resolves from cache immediately)
2. Add toast on success:
   ```tsx
   import { toast } from 'sonner'
   // ...
   mutation.mutate(input, {
     onSuccess: () => {
       setDraft(null)
       setIsEditing(false)
       toast.success('Profile saved')
     },
   })
   ```

### Router Changes — Exact Additions Needed

In `router.ts`, two changes are required:

**1. Add loader to `configProfileRoute`:**
```typescript
const configProfileRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile',
  component: ConfigProfileIndexRoute,
  loader: () => Promise.all([
    queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
    queryClient.ensureQueryData({ queryKey: ['onboarding-status'], queryFn: fetchOnboardingStatus }),
  ]),
})
```

**2. Add new `configProfileResumeRoute`:**
```typescript
const configProfileResumeRoute = createRoute({
  getParentRoute: () => configLayoutRoute,
  path: '/config/profile/resume',
  component: ProfileResumeRoute,
  loader: () => queryClient.ensureQueryData({ queryKey: ['profile'], queryFn: fetchProfile }),
})
```

**3. Update routeTree — add `configProfileResumeRoute` to `configLayoutRoute.addChildren([...])`:**
```typescript
configLayoutRoute.addChildren([
  configOverviewRoute,
  configProfileRoute,
  configProfileResumeRoute,   // ← add this
  configJobSourcesRoute,
  configPromptsRoute,
  configLogsRoute,
])
```

### TanStack Router — Link to Unregistered Routes

TanStack Router's `<Link to="...">` is type-checked against the registered route tree. Since `/config/profile/api-keys` and `/config/profile/inbox-mapping` don't exist yet in `router.ts`, using `<Link to="/config/profile/api-keys">` will cause a TypeScript error.

For story 35.2, use one of these options for the two unimplemented tiles:
- `<div role="button" className="...">` (no `onClick` needed since routes don't exist yet)
- `<Link to="/config/profile" activeOptions={{ exact: false }}>` as a safe fallback (loops back to the same page)

The cleanest approach is to not make them clickable (`<div>`) and add a "Coming soon" visual cue (e.g., `opacity-50 cursor-not-allowed`). Story 35.3 will replace these with real `<Link>` elements.

### No Backend Changes

This story is purely frontend. No API routes, DB migrations, or schema changes needed.

### File Structure Summary

```
New file:    src/client/routes/config/profile-resume.tsx   ← ProfileResumeRoute (moved from profile.tsx)
Modified:    src/client/routes/config/profile-index.tsx    ← Replace stub with 3-tile grid
Modified:    src/client/lib/router.ts                      ← Add loader + new route
Deleted:     src/client/routes/profile.tsx                 ← Unmounted in 35.1; component moved here
```

### Cross-Story Context

- **Story 35.3** adds `/config/profile/api-keys` and `/config/profile/inbox-mapping` routes — those are stubs/unclickable until then
- **Story 35.4** replaces the Job Sources stub with real content
- **Story 35.5** replaces the Prompts stub with real content  
- **Story 35.6** replaces the Logs stub with the full webhook runs table

### References

- Epic 35 spec: `_bmad-output/planning-artifacts/epics/epic-35-config-section-nav-refactor.md`
- Previous story (35.1): `_bmad-output/implementation-artifacts/35-1-config-layout-shell-router-restructure-overview.md`
- Existing profile form (source): `src/client/routes/profile.tsx`
- Router (edit this): `src/client/lib/router.ts`
- Profile-index stub (replace this): `src/client/routes/config/profile-index.tsx`
- Overview pattern to match: `src/client/routes/config/overview.tsx`
- `useOnboardingStatusQuery`: `src/client/hooks/useOnboardingStatusQuery.ts`
- `useProfileQuery` / `fetchProfile`: `src/client/hooks/useProfileQuery.ts`
- `useProfileMutation`: `src/client/hooks/useProfileMutation.ts`
- Toast import: `import { toast } from 'sonner'` (see config.tsx for precedent)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Replaced profile-index.tsx stub with 3-tile grid (Resume, API Keys, Inbox Mapping). Resume tile uses `<Link to="/config/profile/resume">`. API Keys and Inbox Mapping tiles are non-clickable `<div>` with `opacity-50 cursor-not-allowed` until story 35.3 creates those routes.
- Created profile-resume.tsx by moving ProfileRoute from profile.tsx; renamed to ProfileResumeRoute; removed isLoading/isError guards; added `toast.success('Profile saved')` on mutation success; removed unused EMPTY_DRAFT constant (was also unused in original).
- Updated router.ts: added loader to configProfileRoute (profile + onboarding-status); added configProfileResumeRoute with profile loader; registered both in routeTree.
- Deleted src/client/routes/profile.tsx — no remaining imports of the old ProfileRoute component.
- Build passes with zero new TypeScript errors (verified via `bun run build` and `tsc --noEmit` on changed files).

### File List

- `src/client/routes/config/profile-index.tsx` (modified — replace stub with 3-tile overview)
- `src/client/routes/config/profile-resume.tsx` (new — ProfileResumeRoute)
- `src/client/lib/router.ts` (modified — add loader to configProfileRoute + new configProfileResumeRoute)
- `src/client/routes/profile.tsx` (deleted)

### Review Findings

- [x] [Review][Defer] No unsaved-changes guard when navigating away mid-edit [profile-resume.tsx] — deferred, pre-existing pattern from profile.tsx; out of scope
- [x] [Review][Defer] /config/job-sources stub route missing loader [router.ts] — deferred, stub; story 35.4 adds real content and loader (also tracked from 35.1)
- [x] [Review][Defer] staleTime: 0 causes badge flicker on every config tab visit [useOnboardingStatusQuery.ts] — deferred, by design; already tracked from 35.1

## Change Log

- 2026-05-18: Story created for Epic 35 Profile section implementation.
- 2026-05-18: Implemented all tasks — profile overview 3-tile grid, profile-resume route, router updates, deleted old profile.tsx.
- 2026-05-18: Code review complete — 0 decision_needed, 0 patch, 3 defer, 14 dismissed. All 6 ACs pass. Status → done.
