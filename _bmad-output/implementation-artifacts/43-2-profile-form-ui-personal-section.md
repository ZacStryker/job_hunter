# Story 43.2: Profile Form UI — Personal Section

Status: done

## Story

As a user,
I want to edit my personal contact details (name, email, phone, location) and manage a list of website links directly on the Profile page,
So that my contact info is always easy to update without a global "edit mode" toggle.

## Acceptance Criteria

1. **Given** the user navigates to Config > Candidate Info **When** the page loads **Then** a "Personal" section is visible with always-editable fields: Full Name, Email, Phone (optional), Location (optional), Summary (optional, multi-line textarea). **And** there is no page-level "Edit" button or global edit/view toggle.

2. **Given** the Personal section **When** the page loads **Then** all fields are pre-populated from `useProfileQuery` data (new `ProfileData` shape) into local draft state. **And** a "Save" button is present in the Personal section header area.

3. **Given** the Personal section **When** the user modifies any field and clicks "Save" **Then** `useProfileMutation` is called with the full `ProfileData` object: updated `personal` section and the existing `experience` arrays passed through unchanged from the last fetched value. **And** a success toast is shown. **And** local draft state reflects the saved values.

4. **Given** the Personal section **When** there are existing website entries in `personal.websites` **Then** each entry is rendered as a row showing its label and URL with a trash-icon delete button on the right.

5. **Given** the Personal section **When** the user clicks "Add Website" **Then** an inline form row appears with a Label field and a URL field plus "Add" and "Cancel" buttons. **And** clicking "Add" appends the new `{label, url}` entry to the websites list and persists via the profile mutation immediately. **And** clicking "Cancel" dismisses the inline form without saving.

6. **Given** an existing website entry **When** the user clicks the trash icon **Then** the entry is removed from the list and the updated profile is persisted immediately (no confirmation needed).

7. **Given** the six experience sections (Jobs, Education, Projects, Certifications, Licences, Awards) **When** Story 43.2 is complete **Then** each section header is visible as a collapsible panel — collapsed by default when its array is empty, expanded when it has entries. **And** each section shows "No entries yet" and a disabled "Add Entry" placeholder button (fully functional Add Entry is in Stories 43.3 and 43.4).

8. **Given** `profile-index.tsx` **When** Story 43.2 is complete **Then** the `resumeConfigured` check uses `!!profile?.personal?.fullName` (not the old `profile?.name` which is now `undefined`).

## Tasks / Subtasks

- [x] Task 1: Replace `profile-resume.tsx` with schema-driven page skeleton (AC: #1, #2, #7)
  - [x] Delete all old flat-field state (`ProfileInput` pattern with `isEditing`/`draft`)
  - [x] Render loading skeleton via `Skeleton` from `@/components/ui/skeleton` while `!profileData`
  - [x] Extract `<PersonalSection>` inner component that receives `profileData: ProfileData` as prop — mount only when data loads (avoids useEffect init pitfalls)
  - [x] Inside `<PersonalSection>`, initialize `useState` from `profileData.personal` at first render
  - [x] Render six experience section stubs (see Task 3)

- [x] Task 2: Implement Personal section form with Websites CRUD (AC: #2, #3, #4, #5, #6)
  - [x] Always-editable fields: Full Name (`text`), Email (`text`), Phone (`text`, optional), Location (`text`, optional), Summary (`textarea`, 4 rows, optional)
  - [x] "Save" button in section header row; calls `mutation.mutate({ personal: { ...draftPersonal, websites: draftWebsites }, experience: profileData.experience })` on click
  - [x] Websites list: render each `{label, url}` pair as a row with label + URL text and a `Trash2` icon button on the right
  - [x] Trash click: filter website out of `draftWebsites`, then immediately save full ProfileData via mutation
  - [x] "Add Website" button below the websites list
  - [x] Inline add-form state: `showAddWebsite: boolean`, `newLabel: string`, `newUrl: string`
  - [x] "Add" button: append `{label: newLabel, url: newUrl}` to websites, save immediately via mutation, reset form state, hide form
  - [x] "Cancel" button: reset form state, hide form
  - [x] Disable "Save" and "Add Website" / "Add" buttons while `mutation.isPending`
  - [x] Show success toast on save (use `toast.success`)
  - [x] Show error toast on failure (use `toast.error`)

- [x] Task 3: Implement six experience section placeholders (AC: #7)
  - [x] Render each section as a collapsible panel: header row with section title + entry count badge + ChevronDown/ChevronUp icon
  - [x] Default expansion state: `profileData.experience[sectionKey].length > 0` (all collapsed at 43.2 time since experience arrays are empty)
  - [x] When collapsed: show only header
  - [x] When expanded: show "No entries yet." text + disabled "Add Entry" button (variant `outline`, disabled)
  - [x] Sections in order: Jobs, Education, Projects, Certifications, Licences, Awards
  - [x] Section labels: "Jobs", "Education", "Projects", "Certifications", "Licences", "Awards"
  - [x] Each section has its own `open: boolean` state

- [x] Task 4: Fix `profile-index.tsx` configured check (AC: #8)
  - [x] Change `const resumeConfigured = !!profile?.name` → `const resumeConfigured = !!profile?.personal?.fullName`

## Dev Notes

### Critical: Two-Component Pattern to Avoid useEffect Init Bug

Render the page as two layers:

```tsx
export function ProfileResumeRoute() {
  const { data: profileData } = useProfileQuery()
  
  if (!profileData) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  return <ProfileResumeForm profileData={profileData} />
}

function ProfileResumeForm({ profileData }: { profileData: ProfileData }) {
  // useState initialized once at mount (profileData guaranteed to exist)
  const [fullName, setFullName] = useState(profileData.personal.fullName)
  const [email, setEmail] = useState(profileData.personal.email)
  const [phone, setPhone] = useState(profileData.personal.phone ?? '')
  const [location, setLocation] = useState(profileData.personal.location ?? '')
  const [summary, setSummary] = useState(profileData.personal.summary ?? '')
  const [websites, setWebsites] = useState(profileData.personal.websites)
  
  const mutation = useProfileMutation()
  // ...
}
```

**Why:** If you use `useEffect(() => { setField(data.x) }, [data])`, a background refetch will overwrite the user's unsaved draft. The inner component is mounted exactly once per data-load, so `useState` initializer runs once.

### Save Personal Section

Save always sends the **full ProfileData**, replacing only the personal section:

```tsx
function handleSavePersonal() {
  mutation.mutate(
    {
      personal: {
        fullName,
        email,
        phone: phone || null,
        location: location || null,
        summary: summary || null,
        websites,
      },
      experience: profileData.experience,  // pass-through — not modified in this section
    },
    {
      onSuccess: () => toast.success('Personal info saved'),
      onError: (err) => toast.error(err.message),
    }
  )
}
```

### Websites CRUD (inline, not Sheet)

- The website add form is **inline** (not a Sheet panel — Sheets are for experience entries in 43.3)
- State: `showAddWebsite`, `newLabel`, `newUrl` — all local to `ProfileResumeForm`
- Delete: filter + mutate immediately (no "Save" click needed):

```tsx
function handleDeleteWebsite(idx: number) {
  const updated = websites.filter((_, i) => i !== idx)
  setWebsites(updated)
  mutation.mutate(
    { personal: { fullName, email, phone: phone || null, location: location || null, summary: summary || null, websites: updated }, experience: profileData.experience },
    { onSuccess: () => toast.success('Website removed'), onError: (err) => toast.error(err.message) }
  )
}
```

- Add: append + mutate + reset form:

```tsx
function handleAddWebsite() {
  const updated = [...websites, { label: newLabel.trim(), url: newUrl.trim() }]
  setWebsites(updated)
  mutation.mutate(
    { personal: { fullName, email, phone: phone || null, location: location || null, summary: summary || null, websites: updated }, experience: profileData.experience },
    {
      onSuccess: () => { toast.success('Website added'); setNewLabel(''); setNewUrl(''); setShowAddWebsite(false) },
      onError: (err) => toast.error(err.message),
    }
  )
}
```

### Experience Section Collapsible (no Collapsible shadcn component available)

There is **no `Collapsible` component** in the project's shadcn install. Implement manually:

```tsx
const EXPERIENCE_SECTIONS = [
  { key: 'jobs', label: 'Jobs' },
  { key: 'education', label: 'Education' },
  { key: 'projects', label: 'Projects' },
  { key: 'certifications', label: 'Certifications' },
  { key: 'licences', label: 'Licences' },
  { key: 'awards', label: 'Awards' },
] as const

// Initialize: expand sections that already have entries
const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
  Object.fromEntries(
    EXPERIENCE_SECTIONS.map(({ key }) => [key, profileData.experience[key].length > 0])
  )
)

function toggleSection(key: string) {
  setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
}
```

Section render:

```tsx
{EXPERIENCE_SECTIONS.map(({ key, label }) => {
  const entries = profileData.experience[key as keyof typeof profileData.experience]
  const count = entries.length
  const isOpen = openSections[key]
  return (
    <div key={key} className="border border-zinc-800 rounded-lg">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => toggleSection(key)}
      >
        <span className="text-sm font-medium text-zinc-200">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">({count})</span>
          {isOpen ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </div>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-zinc-800">
          <p className="text-sm text-zinc-400 my-3">No entries yet.</p>
          <Button variant="outline" size="sm" disabled>Add {label.replace(/s$/, '')}</Button>
        </div>
      )}
    </div>
  )
})}
```

**Note:** The `Add {label.replace(/s$/, '')}` logic handles "Jobs" → "Add Job", "Projects" → "Add Project". Handle "Licences" → "Add Licence" correctly (already correct with `replace(/s$/, '')`). Handle "Certifications" → "Add Certification" — this approach won't work for multi-syllable plurals. Use explicit labels instead:

```typescript
const EXPERIENCE_SECTIONS = [
  { key: 'jobs', label: 'Jobs', addLabel: 'Add Job' },
  { key: 'education', label: 'Education', addLabel: 'Add Education' },
  { key: 'projects', label: 'Projects', addLabel: 'Add Project' },
  { key: 'certifications', label: 'Certifications', addLabel: 'Add Certification' },
  { key: 'licences', label: 'Licences', addLabel: 'Add Licence' },
  { key: 'awards', label: 'Awards', addLabel: 'Add Award' },
] as const
```

### `profile-index.tsx` Fix

Current broken line:
```tsx
const resumeConfigured = !!profile?.name  // 'name' no longer exists on ProfileData
```

Fix:
```tsx
const resumeConfigured = !!profile?.personal?.fullName
```

### UI Styling Conventions

Follow existing config page patterns:
- Input fields: add `className="bg-zinc-900 border-zinc-700"` to `Input` and `Textarea` components
- Labels: `<label className="block text-xs text-zinc-400 mb-1">Full Name</label>`
- Section header text: `text-sm font-medium text-zinc-200`
- Secondary text: `text-sm text-zinc-400`
- Section card: `border border-zinc-800 rounded-lg p-4` (or `px-4 py-3` for header rows)
- Page container: `<div className="max-w-3xl mx-auto p-6">`
- Personal section "Save" button: `<Button size="sm">` in the section header flex row

### Imports Required

```tsx
import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileQuery } from '@/hooks/useProfileQuery'
import { useProfileMutation } from '@/hooks/useProfileMutation'
import type { ProfileData } from '@shared/schemas'
```

Do NOT import `ProfileInput` or `Profile` (old types) — they are the flat schema types from before Story 43.1.

### Files to Modify

| File | Action |
|------|--------|
| `job-hunt-dashboard/src/client/routes/config/profile-resume.tsx` | Full rewrite — replace flat-field edit/view toggle pattern with new schema-driven form |
| `job-hunt-dashboard/src/client/routes/config/profile-index.tsx` | Fix `resumeConfigured` check: `profile?.name` → `profile?.personal?.fullName` |

**Do NOT modify:**
- `useProfileQuery.ts`, `useProfileMutation.ts` — already updated in Story 43.1
- `shared/schemas.ts` — already updated in Story 43.1
- `api-profile.ts` — already updated in Story 43.1
- Any experience section internals — implemented in Stories 43.3 and 43.4
- Any downstream services (`analysis-service.ts`, etc.) — updated in Story 43.5

### Previous Story Intelligence (43.1)

- Story 43.1 fully rewrote `useProfileQuery` and `useProfileMutation` to use `ProfileData`/`ProfileDataInput`.
- The `PUT /api/profile` route accepts the full `ProfileDataInput` body — always send the entire object (personal + experience).
- `useProfileMutation` throws `Error(err.error ?? 'Failed to save profile')` on failure — catch with `onError: (err) => toast.error(err.message)`.
- Test baseline: **403 passing / 13 pre-existing failures**. This story has no server-side changes, so no new tests required. Verify `bun test` still passes 403.
- `Skeleton` component is available at `@/components/ui/skeleton`.

### Verification Steps

1. `bun tsc --noEmit` — zero new TypeScript errors (especially: no `profile?.name` reference remaining)
2. `bun test` — 403+ passing; zero new failures (no server-side changes in this story)
3. Manual: `bun run dev` → navigate to `/config/profile/resume` — page loads without "Edit" button; all fields show immediately
4. Manual: fill in Full Name and Email, click "Save" — success toast shown; page refresh shows saved values
5. Manual: click "Add Website" — inline form appears; fill label "LinkedIn" + URL; click "Add" — entry appears in list; page refresh shows persisted
6. Manual: click trash icon on a website entry — entry removed immediately; page refresh confirms deletion
7. Manual: navigate to `/config/profile` index — "Candidate Info" card shows "Configured" after fullName is saved
8. Manual: experience section headers visible and collapsible; "No entries yet." shown when expanded; "Add Job" etc. are disabled buttons

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Rewrote `profile-resume.tsx` using the two-component pattern: `ProfileResumeRoute` (loading skeleton guard) + `ProfileResumeForm` (mounted only when data exists, `useState` initialized once at mount).
- Personal section is always-editable with a "Save" button in the section header. `buildPersonal()` helper DRYs up personal object construction for save, add-website, and delete-website mutations.
- Websites CRUD: inline add-form with label/url inputs, "Add" (immediate mutate + reset) and "Cancel"; trash-icon delete (immediate mutate); all buttons disabled while `mutation.isPending`.
- Six experience section collapsibles implemented with a shared `openSections` Record state; default expansion determined by `profileData.experience[key].length > 0` (all collapsed since arrays are empty at 43.2 time). Each shows disabled "Add X" button with explicit `addLabel` to avoid pluralization issues.
- Fixed `profile-index.tsx`: `resumeConfigured` now uses `!!profile?.personal?.fullName` (old `profile?.name` no longer exists on `ProfileData`).
- No TypeScript errors in modified files; test baseline preserved: 403 pass / 13 pre-existing failures.

### File List
- job-hunt-dashboard/src/client/routes/config/profile-resume.tsx
- job-hunt-dashboard/src/client/routes/config/profile-index.tsx

### Change Log
- 2026-06-11: Rewrote profile-resume.tsx with schema-driven form UI (Personal section + experience collapsibles); fixed resumeConfigured check in profile-index.tsx

### Review Findings

- [x] [Review][Patch] No state rollback on website mutation failure — `handleDeleteWebsite` and `handleAddWebsite` both call `setWebsites(updated)` before `mutation.mutate`, so a server error leaves local state permanently out of sync (item shown as deleted or added when it wasn't). Add rollback in `onError`: `setWebsites(prevWebsites)`. [profile-resume.tsx:handleDeleteWebsite / handleAddWebsite]
- [x] [Review][Defer] Stale `profileData.experience` prop in all mutations — every `mutation.mutate` call passes `experience: profileData.experience` from the mount-time snapshot; safe in 43.2 (experience arrays always empty) but will cause last-write-wins data loss once 43.3/43.4 enable experience editing. Fix in 43.3: read fresh experience from `useProfileQuery` data or `queryClient.getQueryData` at call time. [profile-resume.tsx] — deferred, pre-existing safe in current scope
- [x] [Review][Defer] No URL format validation on `websiteSchema.url` — `z.string()` accepts non-URL values; consistent with project-wide schema pattern. [schemas.ts:websiteSchema] — deferred, pre-existing pattern
- [x] [Review][Defer] No error state on initial fetch failure — `ProfileResumeRoute` shows skeleton indefinitely if `GET /api/profile` fails; pre-existing pattern across config routes. [profile-resume.tsx:ProfileResumeRoute] — deferred, pre-existing pattern
- [x] [Review][Defer] No `aria-label` on icon-only trash button — `<button>` rendering `<Trash2>` has no accessible label; pre-existing a11y gap across the project. [profile-resume.tsx:website delete button] — deferred, pre-existing pattern
- [x] [Review][Defer] `licenceEntrySchema` and `awardEntrySchema` alias `certEntrySchema` by reference — future mutations to `certEntrySchema` silently affect all three. [schemas.ts] — deferred, 43.1 schema design
- [x] [Review][Defer] `educationEntrySchema.name` semantics unclear alongside `school` field — ambiguous whether `name` is degree name or institution alias. [schemas.ts:educationEntrySchema] — deferred, 43.1 schema design
