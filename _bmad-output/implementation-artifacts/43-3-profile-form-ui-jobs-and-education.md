# Story 43.3: Profile Form UI — Jobs & Education Sections

Status: done

## Story

As a user,
I want to add, view, edit, and delete my work history (Jobs) and academic credentials (Education) as structured entries with proper date fields, toggles, and nested sub-entries,
So that my employment and education history is stored in a way the AI can reason about rather than as a freetext blob.

## Acceptance Criteria

1. **Given** the Jobs section **When** it has no entries **Then** it shows a collapsed section header with "(0)" count and an enabled "Add Job" button (replacing the disabled placeholder from 43.2).

2. **Given** the user clicks "Add Job" **When** the Sheet panel opens **Then** it contains: Title (text, required), Company (text, required), Start Date (YYYY-MM text, required), End Date (YYYY-MM, nullable), Current toggle (boolean, defaults false — when enabled End Date is cleared and disabled), Employment Type (optional free text), and a Bullets list. **And** the Bullets list starts with one empty bullet input row. **And** each bullet row has a trash icon; clicking it removes that bullet. **And** an "Add Bullet" button appends a new empty bullet input row.

3. **Given** the Add Job sheet **When** the user fills required fields and clicks "Save Job" **Then** the entry is validated (Title, Company, Start Date required), appended to `experience.jobs`, and persisted via the profile mutation. **And** the Sheet closes. **And** a success toast is shown. **And** "Cancel" dismisses the form without saving.

4. **Given** an existing job entry in the list **When** rendered in collapsed/summary mode **Then** it shows: "Company — Title (StartDate – EndDate or Present)" with a trash icon on the right and an expand chevron. **And** clicking the summary row (or chevron) expands to an inline edit form pre-populated with all entry values. **And** clicking "Save" on the edit form updates the entry in-place and persists. **And** clicking "Cancel" collapses without saving.

5. **Given** an existing job entry **When** the user clicks the trash icon **Then** the entry is removed from `experience.jobs` and the profile is persisted immediately. **And** no confirmation prompt is shown for entries with ≤1 bullet. **And** `window.confirm('Remove this job entry?')` is shown for entries with ≥2 bullets.

6. **Given** the Education section **When** the user clicks "Add Education" **Then** the Sheet form contains: Program Name (req), School (req), Current toggle (boolean), and a Degrees list. **And** the Degrees list starts empty with an "Add Degree" button. **And** each degree row has: Degree Type (text), Degree Subject (text), Graduation Date (YYYY-MM, nullable — disabled if parent Current toggle is on), and a trash icon. **And** "Save Education" validates required fields (Program Name, School), appends to `experience.education`, and persists.

7. **Given** an existing education entry **When** rendered in summary mode **Then** it shows: "School — Program Name (N degrees)" with a trash icon and expand chevron, mirroring the Jobs pattern. **And** clicking expands to an inline edit form.

8. **Given** all Jobs and Education CRUD operations **When** any save or delete completes **Then** section entry counts in the section header update to reflect the new total. **And** a success toast is shown.

9. **Given** the four remaining sections (Projects, Certifications, Licences, Awards) **When** Story 43.3 is complete **Then** they remain as collapsible placeholders with disabled "Add X" buttons — unchanged from Story 43.2. **And** their entry counts are still read from live profile data (not mount-time snapshot).

10. **Given** the stale-data fix from the 43.2 review **When** any experience mutation fires **Then** the fresh experience arrays from the query cache are used (not the mount-time `profileData.experience` snapshot) so no data loss occurs when multiple sections are modified in the same session.

## Tasks / Subtasks

- [x] Task 1: Fix stale experience data in all profile mutations (AC: #10)
  - [x] Add `const { data: liveProfile } = useProfileQuery()` inside `ProfileResumeForm`
  - [x] Create helper `function getExperience()` that returns `(liveProfile ?? profileData).experience`
  - [x] Replace all existing mutation calls that pass `experience: profileData.experience` to use `experience: getExperience()`
  - [x] Apply to Personal Save, Add Website, Delete Website handlers

- [x] Task 2: Implement Jobs section with Add Sheet (AC: #1, #2, #3)
  - [x] Replace the disabled "Add Job" button in the Jobs section with an enabled button (`showAddJob: boolean` state)
  - [x] Create `<AddJobSheet>` inner component (same file): `{ open, onClose, onSave }`
  - [x] Sheet form state: `title`, `company`, `startDate`, `endDate`, `current`, `employmentType`, `bullets: string[]`
  - [x] Initialize bullets with one empty string: `useState([''])`
  - [x] When `current` toggle turns ON: clear `endDate` and disable the End Date input
  - [x] Bullets list: each item rendered as `<Input>` with value + onChange + `<Trash2>` remove button; disabled when only 1 bullet remains (min 1 row)
  - [x] "Add Bullet" button appends `''` to bullets array
  - [x] "Save Job" button: validate `title.trim()`, `company.trim()`, `startDate.trim()` all non-empty; if invalid show inline error; on valid call `onSave(entry)` and close
  - [x] Empty bullets filtered out (`bullets.filter(b => b.trim())`) before saving

- [x] Task 3: Implement Jobs section entry list with inline edit and delete (AC: #4, #5)
  - [x] Replace placeholder "No entries yet." with a mapped list of job entries when `liveJobs.length > 0`
  - [x] Each entry: summary row = `"Company — Title (StartDate – EndDate or Present)"` + `<ChevronDown/ChevronUp>` + `<Trash2>`
  - [x] Track `editingJobIdx: number | null` state; clicking summary toggles between `null` and the entry's index
  - [x] When editing: render an inline edit form (same fields as Add, pre-populated) with "Save" and "Cancel" buttons
  - [x] "Save": update `jobs[editingJobIdx]` with new values, call mutation with full profile, set `editingJobIdx = null`
  - [x] "Cancel": set `editingJobIdx = null` without saving
  - [x] Trash icon: if `entry.bullets.length >= 2` call `window.confirm('Remove this job entry?')` and proceed only on `true`; otherwise remove immediately

- [x] Task 4: Implement Education section with Add Sheet and entry list (AC: #6, #7, #8)
  - [x] Same collapsible pattern as Jobs; replace disabled "Add Education" button with enabled one
  - [x] Create `<AddEducationSheet>` inner component: `{ open, onClose, onSave }`
  - [x] Sheet form state: `name` (program name), `school`, `current`, `degrees: DegreeEntry[]`
  - [x] `DegreeEntry` = `{ degreeType: string, degreeSubject: string, graduationDate: string | null }`
  - [x] Degrees list: each row = Degree Type `<Input>` + Degree Subject `<Input>` + Graduation Date `<Input>` (disabled when `current` toggle ON) + `<Trash2>` remove
  - [x] "Add Degree" button appends `{ degreeType: '', degreeSubject: '', graduationDate: null }` to degrees array
  - [x] "Save Education": validate `name.trim()` and `school.trim()` non-empty; call `onSave(entry)` and close
  - [x] Entry summary: `"School — Name (N degrees)"` where N = `entry.degrees.length`
  - [x] Track `editingEduIdx: number | null`; expand to inline edit form matching Add form fields
  - [x] No delete confirmation for education entries (no "≥2 bullets" equivalent)

- [x] Task 5: Update section header entry counts to use live data (AC: #8, #9)
  - [x] The section header renders `({count})` — ensure `count` reads from `liveProfile?.experience[key].length ?? profileData.experience[key].length` so counts update after mutations without page refresh

- [x] Task 6: Verify test baseline and TypeScript (AC: implied)
  - [x] `bun tsc --noEmit` — zero new TypeScript errors
  - [x] `bun test` — 403+ passing; zero new failures (this story has no server-side changes)

## Dev Notes

### Critical: Fix Stale Experience Data (Deferred from 43.2 Review)

The 43.2 deferred review item **must** be addressed in this story. Every `mutation.mutate` call in `ProfileResumeForm` currently passes `experience: profileData.experience`, which is the mount-time snapshot. Once experience sections are editable, this will silently overwrite server-side data with the stale snapshot.

**Fix:** Add a second `useProfileQuery()` call inside `ProfileResumeForm` to always get the freshest data:

```tsx
function ProfileResumeForm({ profileData }: { profileData: ProfileData }) {
  // Existing useState initializations...
  
  // Always-fresh query data — used in all mutations to prevent stale overwrites
  const { data: liveProfile } = useProfileQuery()
  
  function getExperience() {
    return (liveProfile ?? profileData).experience
  }
  
  // All mutation calls update to:
  mutation.mutate({ personal: buildPersonal(), experience: getExperience() }, ...)
}
```

Apply `getExperience()` to ALL existing mutation calls: `handleSavePersonal`, `handleDeleteWebsite`, `handleAddWebsite`.

### Component Structure

Keep all components in the same file (`profile-resume.tsx`) to avoid prop-drilling. Use inner function components:

```
profile-resume.tsx exports:
  ProfileResumeRoute          — loading guard (no change from 43.2)
  ProfileResumeForm           — main form (mount-once), updated with live data + experience sections
  AddJobSheet                 — Sheet form for adding a new job
  AddEducationSheet           — Sheet form for adding education
```

The `ProfileResumeForm` component manages:
- All personal section state (unchanged from 43.2)
- `showAddJob: boolean` — controls AddJobSheet open state
- `editingJobIdx: number | null` — which job entry is in inline-edit mode
- `showAddEdu: boolean` — controls AddEducationSheet open state
- `editingEduIdx: number | null` — which education entry is in inline-edit mode
- `openSections: Record<string, boolean>` (unchanged from 43.2)

### Sheet Import Path

The Sheet component is already in the project. Use the same alias pattern as the rest of `profile-resume.tsx`:

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
```

**Make the SheetContent scrollable** — the job form is long:
```tsx
<SheetContent className="overflow-y-auto flex flex-col">
```

### Switch Component (For "Current" Toggle)

Use the existing `Switch` component from `@/components/ui/switch`:

```tsx
import { Switch } from '@/components/ui/switch'
```

Usage in form:
```tsx
<div className="flex items-center gap-2">
  <Switch
    checked={current}
    onCheckedChange={(checked) => {
      setCurrent(checked)
      if (checked) setEndDate('')
    }}
  />
  <label className="text-xs text-zinc-400">Currently employed here</label>
</div>
```

### Type Inference for Entry Types

`schemas.ts` exports the Zod schemas but **not** the TypeScript type aliases for entry types. Infer inline or add type aliases locally:

```tsx
import type { ProfileData } from '@shared/schemas'
import { jobEntrySchema, educationEntrySchema, degreeEntrySchema } from '@shared/schemas'

type JobEntry = z.infer<typeof jobEntrySchema>
type EducationEntry = z.infer<typeof educationEntrySchema>
type DegreeEntry = z.infer<typeof degreeEntrySchema>
```

Or use the fully qualified `z.infer<typeof jobEntrySchema>` inline. **Do NOT add new exports to `schemas.ts`** — importing and inferring locally keeps the change contained to this file.

### Jobs Section Entry List

Replace the Jobs section's placeholder content with:
```tsx
{/* When section is open */}
{isOpen && (
  <div className="px-4 pb-4 border-t border-zinc-800">
    {liveJobs.length === 0 && (
      <p className="text-sm text-zinc-400 my-3">No entries yet.</p>
    )}
    {liveJobs.map((job, idx) => (
      <JobEntryRow
        key={idx}
        job={job}
        isEditing={editingJobIdx === idx}
        onToggleEdit={() => setEditingJobIdx(editingJobIdx === idx ? null : idx)}
        onSave={(updated) => handleSaveJobEntry(idx, updated)}
        onCancel={() => setEditingJobIdx(null)}
        onDelete={() => handleDeleteJob(idx)}
        disabled={mutation.isPending}
      />
    ))}
    <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowAddJob(true)}>
      Add Job
    </Button>
    <AddJobSheet open={showAddJob} onClose={() => setShowAddJob(false)} onSave={handleAddJob} />
  </div>
)}
```

Where `liveJobs = (liveProfile ?? profileData).experience.jobs`.

### Job Entry Save/Delete Handlers

```tsx
function handleAddJob(entry: z.infer<typeof jobEntrySchema>) {
  const exp = getExperience()
  const updated = { ...exp, jobs: [...exp.jobs, entry] }
  mutation.mutate(
    { personal: buildPersonal(), experience: updated },
    {
      onSuccess: () => { toast.success('Job added'); setShowAddJob(false) },
      onError: (err) => toast.error(err.message),
    }
  )
}

function handleSaveJobEntry(idx: number, entry: z.infer<typeof jobEntrySchema>) {
  const exp = getExperience()
  const updated = { ...exp, jobs: exp.jobs.map((j, i) => i === idx ? entry : j) }
  mutation.mutate(
    { personal: buildPersonal(), experience: updated },
    {
      onSuccess: () => { toast.success('Job updated'); setEditingJobIdx(null) },
      onError: (err) => toast.error(err.message),
    }
  )
}

function handleDeleteJob(idx: number) {
  const exp = getExperience()
  const job = exp.jobs[idx]
  if (job.bullets.length >= 2 && !window.confirm('Remove this job entry?')) return
  const updated = { ...exp, jobs: exp.jobs.filter((_, i) => i !== idx) }
  mutation.mutate(
    { personal: buildPersonal(), experience: updated },
    {
      onSuccess: () => toast.success('Job removed'),
      onError: (err) => toast.error(err.message),
    }
  )
}
```

### AddJobSheet Component Pattern

```tsx
function AddJobSheet({ open, onClose, onSave }: {
  open: boolean
  onClose: () => void
  onSave: (entry: z.infer<typeof jobEntrySchema>) => void
}) {
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [current, setCurrent] = useState(false)
  const [employmentType, setEmploymentType] = useState('')
  const [bullets, setBullets] = useState([''])
  const [errors, setErrors] = useState<string[]>([])

  function handleSave() {
    const errs: string[] = []
    if (!title.trim()) errs.push('Title is required')
    if (!company.trim()) errs.push('Company is required')
    if (!startDate.trim()) errs.push('Start Date is required')
    if (errs.length) { setErrors(errs); return }
    onSave({
      title: title.trim(),
      company: company.trim(),
      startDate: startDate.trim(),
      endDate: current ? null : (endDate.trim() || null),
      current,
      employmentType: employmentType.trim() || undefined,
      bullets: bullets.map(b => b.trim()).filter(Boolean),
    })
    // Reset form
    setTitle(''); setCompany(''); setStartDate(''); setEndDate('')
    setCurrent(false); setEmploymentType(''); setBullets(['']); setErrors([])
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Job</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          {/* Title, Company, StartDate, EndDate, Current toggle, EmploymentType, Bullets */}
          {errors.length > 0 && (
            <div className="text-xs text-red-400 space-y-1">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <Button onClick={handleSave}>Save Job</Button>
            <Button variant="ghost" onClick={() => { onClose(); setErrors([]) }}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

Reset the Sheet form state on `onClose` — either in `handleSave` after `onSave()` succeeds (parent controls `open`), or in the `onOpenChange` handler.

### Education Section Specifics

Education summary format: `"School — Program Name (N degrees)"`:
```tsx
`${entry.school} — ${entry.name} (${entry.degrees.length} degree${entry.degrees.length !== 1 ? 's' : ''})`
```

The `educationEntrySchema.name` field is the **program/degree program name** (e.g., "Bachelor of Science in Computer Science"), while `school` is the institution. This is a known ambiguity noted in deferred work but do not rename — just label the UI field clearly as "Program Name".

### Section Count in Headers

The section header renders the entry count badge. Replace `profileData.experience[key].length` with live data:

```tsx
const liveExp = (liveProfile ?? profileData).experience
const count = liveExp[key as keyof typeof liveExp].length
```

This ensures counts update immediately after mutations without waiting for the component to re-mount.

### What NOT to Change

- `profile-index.tsx` — already fixed in 43.2
- `useProfileQuery.ts`, `useProfileMutation.ts` — already updated in 43.1; no changes needed
- `shared/schemas.ts` — do NOT add new exports; infer types locally as needed
- `api-profile.ts` — already handles the PUT with full ProfileData; no changes needed
- Projects, Certifications, Licences, Awards sections — remain as disabled-button collapsible placeholders (fully implemented in 43.4)
- Any downstream services — updated in Story 43.5

### Import Changes for 43.3

Add to existing imports in `profile-resume.tsx`:

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { jobEntrySchema, educationEntrySchema, degreeEntrySchema } from '@shared/schemas'
import type { z } from 'zod'
```

Keep all existing imports (`useState`, `ChevronDown`, `ChevronUp`, `Loader2`, `Trash2`, `toast`, `Button`, `Input`, `Textarea`, `Skeleton`, `useProfileQuery`, `useProfileMutation`, `ProfileData`).

Add `ChevronRight` or reuse `ChevronDown/ChevronUp` for the entry expand/collapse toggle — same icons already imported.

### UI Styling Conventions (Unchanged from 43.2)

- Input fields: `className="bg-zinc-900 border-zinc-700"`
- Labels: `<label className="block text-xs text-zinc-400 mb-1">`
- Section header text: `text-sm font-medium text-zinc-200`
- Entry summary text: `text-sm text-zinc-300`
- Secondary text: `text-sm text-zinc-400`
- Sheet form inputs: use the same `bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm` pattern from `AddJobDrawer.tsx` OR use the `<Input>` component with `bg-zinc-900 border-zinc-700` — either is fine, pick one and be consistent

### Verification Steps

1. `bun tsc --noEmit` — zero new TypeScript errors
2. `bun test` — 403+ passing; zero new failures (no server-side changes)
3. Manual: `bun run dev` → navigate to `/config/profile/resume`
4. Manual: click "Add Job" — Sheet opens; fill Title, Company, Start Date; click "Save Job" — entry appears in Jobs list; page refresh shows persisted data
5. Manual: click job summary row — expands to inline edit; change Title; click "Save" — updated title shown; page refresh confirms
6. Manual: add 2+ bullets to a job; click trash icon — confirm dialog appears; confirm removal
7. Manual: add job with Current toggle ON — End Date field is disabled; saved entry shows "Present" in summary
8. Manual: click "Add Education" — Sheet opens; add Program Name, School; add a degree row; click "Save Education" — entry appears; summary shows "(1 degree)"
9. Manual: Jobs and Education counts in section headers update immediately after add/delete without page refresh
10. Manual: save Personal section after adding a Job — personal data saves without overwriting the job (stale data fix verified)
11. Manual: Projects/Certifications/Licences/Awards sections still show disabled "Add X" buttons

## Previous Story Intelligence (43.2)

- **Two-component pattern**: `ProfileResumeRoute` (loading guard) + `ProfileResumeForm` (mount-once, initialized from `profileData`). Keep this pattern — do NOT add `useEffect` to sync prop changes into state.
- **`buildPersonal()` helper**: already exists in `ProfileResumeForm` — reuse it in all new mutation calls.
- **Immediate delete**: Delete handlers call `mutation.mutate` immediately (same as website delete in 43.2), with state rollback in `onError` if needed.
- **`mutation.isPending` disable**: disable all action buttons while mutation is pending to prevent double-submits.
- **Toast pattern**: `toast.success(...)` / `toast.error(err.message)` — from `sonner`.
- **No `Collapsible` shadcn component**: implement collapsible manually with `openSections` state (already done in 43.2). Same pattern for job/education entry expand.
- **Test baseline at 43.2 completion**: 403 passing / 13 pre-existing failures. This story has no server-side changes — just verify the baseline is preserved.

## Files to Modify

| File | Action |
|------|--------|
| `job-hunt-dashboard/src/client/routes/config/profile-resume.tsx` | Add Jobs + Education sections with Sheet forms, inline edit, delete; fix stale experience data |

**Do NOT modify:**
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/client/hooks/useProfileQuery.ts`
- `job-hunt-dashboard/src/client/hooks/useProfileMutation.ts`
- `job-hunt-dashboard/src/server/routes/api-profile.ts`
- Any server-side services
- `job-hunt-dashboard/src/client/routes/config/profile-index.tsx`

## File List

| File | Change |
|------|--------|
| `job-hunt-dashboard/src/client/routes/config/profile-resume.tsx` | Modified — added Jobs/Education CRUD UI, AddJobSheet, AddEducationSheet, JobEntryRow, EduEntryRow inner components; fixed stale experience data via `getExperience()` helper; live counts from `liveProfile` |

## Dev Agent Record

### Completion Notes

- **Task 1 (Stale data fix):** Added second `useProfileQuery()` call inside `ProfileResumeForm` as `liveProfile`. Created `getExperience()` helper returning `(liveProfile ?? profileData).experience`. Updated all three mutation call sites (handleSavePersonal, handleDeleteWebsite, handleAddWebsite) to use `getExperience()` instead of `profileData.experience`.

- **Task 2 (Add Job Sheet):** Implemented `AddJobSheet` as an inner function component. All form fields per spec. `current` toggle clears and disables End Date. Bullets start with one empty row; trash disabled at 1 bullet. Form resets on close via `reset()` helper. Validation shows inline errors.

- **Task 3 (Job entry list + inline edit/delete):** Implemented `JobEntryRow` inner component. Uses key trick (`edit-${idx}` vs `view-${idx}`) to force remount on edit toggle, ensuring pre-populated form always reflects current server data. Summary format: `"Company — Title (Start – End or Present)"`. Confirm dialog for entries with ≥2 bullets.

- **Task 4 (Education section):** Implemented `AddEducationSheet` and `EduEntryRow` with same patterns. Degree rows in a bordered card layout. Current toggle disables graduation date on all degree rows. No delete confirmation per spec.

- **Task 5 (Live counts):** Computed `liveExp = (liveProfile ?? profileData).experience` once in `ProfileResumeForm`. Used for all section header counts via `liveExp[key as keyof typeof liveExp].length`.

- **Task 6 (Validation):** Zero new TypeScript errors. Test suite: 403 passing / 13 pre-existing failures — baseline preserved.

- **Import approach:** Used `import type { ..., jobEntrySchema, educationEntrySchema, degreeEntrySchema }` from `@shared/schemas` with local `type X = z.infer<typeof xSchema>` aliases. No new exports to schemas.ts.

### Review Findings

- [x] [Review][Decision] AC #1 "Add Job" button placement — resolved: moved Add Job/Education buttons to section header row (always visible, even when collapsed); disabled Add X buttons for placeholder sections also moved to header. Decision: option A (button in header).

- [x] [Review][Patch] AddJobSheet/AddEducationSheet reset() fires before mutation resolves — fixed: removed `reset()` from `handleSave()`; form resets via `handleClose()` only when the sheet actually closes (on success or user dismiss). [`profile-resume.tsx`]

- [x] [Review][Patch] editingJobIdx/editingEduIdx go stale after a lower-index entry is deleted — fixed: `handleDeleteJob`/`handleDeleteEducation` now clear the editing index when the deleted index is ≤ the currently editing index. [`profile-resume.tsx`]

- [x] [Review][Defer] Concurrent mutation last-write-wins — the single shared `mutation` instance means an in-flight personal-save can be overwritten by an experience mutation (or vice versa); pre-existing architectural pattern from 43.2 [`profile-resume.tsx`] — deferred, pre-existing

- [x] [Review][Defer] openSections not auto-opened when first entry is added in session — after the first job/education entry is saved, the section stays in whatever open/closed state the user left it; section doesn't auto-expand to reveal the new entry [`profile-resume.tsx`] — deferred, pre-existing

## Change Log

| Date | Change |
|------|--------|
| 2026-06-11 | Implemented Jobs and Education CRUD UI (AC #1–10); fixed stale experience data in all mutations; added AddJobSheet, AddEducationSheet, JobEntryRow, EduEntryRow components to profile-resume.tsx |
