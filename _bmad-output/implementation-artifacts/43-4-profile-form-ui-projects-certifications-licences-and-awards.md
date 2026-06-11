# Story 43.4: Profile Form UI — Projects, Certifications, Licences & Awards

Status: done

## Story

As a user,
I want to record my notable projects, certifications, licences, and awards as structured entries,
So that the AI can reference them by name, issuer, and year without having to parse freetext blocks.

## Acceptance Criteria

1. **Given** the Projects section **When** the user clicks "Add Project" **Then** the Sheet form contains: Name (req, text), Description (req, textarea). **And** "Save Project" validates both fields, appends to `experience.projects`, and persists.

2. **Given** the Certifications section **When** the user clicks "Add Certification" **Then** the Sheet form contains: Name (req), Issuer (req), Year (req, 4-digit YYYY text input). **And** "Save Certification" validates all three fields and persists.

3. **Given** the Licences section **When** the user clicks "Add Licence" **Then** the Sheet form contains: Name (req), Issuer (req), Year (req, YYYY). **And** "Save Licence" validates and persists — section behaves identically to Certifications.

4. **Given** the Awards section **When** the user clicks "Add Award" **Then** the Sheet form contains: Name (req), Issuer (req), Year (req, YYYY). **And** "Save Award" validates and persists.

5. **Given** any entry in Projects, Certifications, Licences, or Awards **When** rendered in the list **Then** it shows a one-line summary with a trash icon. **And** clicking the trash icon removes the entry and persists immediately (no confirmation dialog). **And** clicking the summary row (or expand chevron) opens an inline edit form pre-populated with the entry's data; "Save" updates in-place and persists; "Cancel" collapses without saving.

6. **Given** all four sections **When** any save or delete completes **Then** section counts update in headers. **And** a success toast is shown.

7. **Given** the complete Profile page after Stories 43.2–43.4 **When** a user fills in all sections and refreshes the page **Then** all data is correctly re-loaded from the API and displayed.

## Tasks / Subtasks

- [x] Task 1: Add Projects section (AC: #1, #5, #6)
  - [x] Add state to `ProfileResumeForm`: `showAddProject: boolean`, `editingProjectIdx: number | null`
  - [x] Add handlers: `handleAddProject`, `handleSaveProjectEntry`, `handleDeleteProject`
  - [x] Create `AddProjectSheet` inner component
  - [x] Create `ProjectEntryRow` inner component
  - [x] Wire into EXPERIENCE_SECTIONS render loop for `'projects'` key (button + sheet in header; entry list in body)

- [x] Task 2: Add Certifications section (AC: #2, #5, #6)
  - [x] Add state: `showAddCert: boolean`, `editingCertIdx: number | null`
  - [x] Add handlers: `handleAddCert`, `handleSaveCertEntry`, `handleDeleteCert`
  - [x] Create `AddCertSheet` inner component with `sectionTitle: string` prop (reused for all three cert-shaped sections)
  - [x] Create `CertEntryRow` inner component (reused for all three cert-shaped sections)
  - [x] Wire into render loop for `'certifications'` key

- [x] Task 3: Add Licences section (AC: #3, #5, #6)
  - [x] Add state: `showAddLicence: boolean`, `editingLicenceIdx: number | null`
  - [x] Add handlers: `handleAddLicence`, `handleSaveLicenceEntry`, `handleDeleteLicence`
  - [x] Reuse `AddCertSheet` with `sectionTitle="Add Licence"` and `CertEntryRow`
  - [x] Wire into render loop for `'licences'` key

- [x] Task 4: Add Awards section (AC: #4, #5, #6)
  - [x] Add state: `showAddAward: boolean`, `editingAwardIdx: number | null`
  - [x] Add handlers: `handleAddAward`, `handleSaveAwardEntry`, `handleDeleteAward`
  - [x] Reuse `AddCertSheet` with `sectionTitle="Add Award"` and `CertEntryRow`
  - [x] Wire into render loop for `'awards'` key

- [x] Task 5: Verify TypeScript and tests (AC: #7)
  - [x] `bun tsc --noEmit` — zero new errors
  - [x] `bun test` — 403+ passing; zero new failures (no server-side changes in this story)

## Dev Notes

### One File Only

This story modifies **only** `job-hunt-dashboard/src/client/routes/config/profile-resume.tsx`. All inner components stay in the same file — no separate files needed.

### Critical: certEntrySchema is shared across 3 sections

In `shared/schemas.ts`, `licenceEntrySchema` and `awardEntrySchema` are **literal aliases** of `certEntrySchema`:
```ts
export const licenceEntrySchema = certEntrySchema
export const awardEntrySchema = certEntrySchema
```
All three sections have identical shape: `{ name: string, issuer: string, year: string }`. **Create one `AddCertSheet` component** with a `sectionTitle: string` prop and **one `CertEntryRow` component** — reuse them for certifications, licences, and awards.

### Type Imports to Add

Append to the existing import in `profile-resume.tsx`:
```tsx
// existing:
import type { z } from 'zod'
import type { ProfileData, jobEntrySchema, educationEntrySchema, degreeEntrySchema } from '@shared/schemas'
// add:
import type { projectEntrySchema, certEntrySchema } from '@shared/schemas'

type ProjectEntry = z.infer<typeof projectEntrySchema>
type CertEntry = z.infer<typeof certEntrySchema>
// NOTE: LicenceEntry and AwardEntry are the same shape as CertEntry — use CertEntry for all three
```

**Do NOT add new exports to `schemas.ts`** — infer types locally only.

### State to Add in ProfileResumeForm

Add these eight state declarations alongside the existing `showAddJob`, `editingJobIdx`, `showAddEdu`, `editingEduIdx`:
```tsx
const [showAddProject, setShowAddProject] = useState(false)
const [editingProjectIdx, setEditingProjectIdx] = useState<number | null>(null)

const [showAddCert, setShowAddCert] = useState(false)
const [editingCertIdx, setEditingCertIdx] = useState<number | null>(null)

const [showAddLicence, setShowAddLicence] = useState(false)
const [editingLicenceIdx, setEditingLicenceIdx] = useState<number | null>(null)

const [showAddAward, setShowAddAward] = useState(false)
const [editingAwardIdx, setEditingAwardIdx] = useState<number | null>(null)
```

### Project Handlers in ProfileResumeForm

```tsx
function handleAddProject(entry: ProjectEntry) {
  const exp = getExperience()
  const updated = { ...exp, projects: [...exp.projects, entry] }
  mutation.mutate(
    { personal: buildPersonal(), experience: updated },
    {
      onSuccess: () => { toast.success('Project added'); setShowAddProject(false) },
      onError: (err) => toast.error(err.message),
    }
  )
}

function handleSaveProjectEntry(idx: number, entry: ProjectEntry) {
  const exp = getExperience()
  const updated = { ...exp, projects: exp.projects.map((p, i) => i === idx ? entry : p) }
  mutation.mutate(
    { personal: buildPersonal(), experience: updated },
    {
      onSuccess: () => { toast.success('Project updated'); setEditingProjectIdx(null) },
      onError: (err) => toast.error(err.message),
    }
  )
}

function handleDeleteProject(idx: number) {
  const exp = getExperience()
  if (editingProjectIdx !== null && editingProjectIdx >= idx) setEditingProjectIdx(null)
  const updated = { ...exp, projects: exp.projects.filter((_, i) => i !== idx) }
  mutation.mutate(
    { personal: buildPersonal(), experience: updated },
    {
      onSuccess: () => toast.success('Project removed'),
      onError: (err) => toast.error(err.message),
    }
  )
}
```

### Cert/Licence/Award Handlers in ProfileResumeForm

Follow the exact same pattern — one set per section (explicit is clearer for the render loop):
```tsx
function handleAddCert(entry: CertEntry) {
  const exp = getExperience()
  const updated = { ...exp, certifications: [...exp.certifications, entry] }
  mutation.mutate(
    { personal: buildPersonal(), experience: updated },
    {
      onSuccess: () => { toast.success('Certification added'); setShowAddCert(false) },
      onError: (err) => toast.error(err.message),
    }
  )
}

function handleSaveCertEntry(idx: number, entry: CertEntry) {
  const exp = getExperience()
  const updated = { ...exp, certifications: exp.certifications.map((c, i) => i === idx ? entry : c) }
  mutation.mutate(
    { personal: buildPersonal(), experience: updated },
    {
      onSuccess: () => { toast.success('Certification updated'); setEditingCertIdx(null) },
      onError: (err) => toast.error(err.message),
    }
  )
}

function handleDeleteCert(idx: number) {
  const exp = getExperience()
  if (editingCertIdx !== null && editingCertIdx >= idx) setEditingCertIdx(null)
  const updated = { ...exp, certifications: exp.certifications.filter((_, i) => i !== idx) }
  mutation.mutate(
    { personal: buildPersonal(), experience: updated },
    {
      onSuccess: () => toast.success('Certification removed'),
      onError: (err) => toast.error(err.message),
    }
  )
}

// Licences — identical pattern, swap key: 'certifications' → 'licences', state: editingCertIdx → editingLicenceIdx
function handleAddLicence(entry: CertEntry) { ... }
function handleSaveLicenceEntry(idx: number, entry: CertEntry) { ... }
function handleDeleteLicence(idx: number) { ... }

// Awards — identical pattern, key: 'awards', state: editingAwardIdx
function handleAddAward(entry: CertEntry) { ... }
function handleSaveAwardEntry(idx: number, entry: CertEntry) { ... }
function handleDeleteAward(idx: number) { ... }
```

### Modifying the EXPERIENCE_SECTIONS Render Loop

The existing loop (lines 345–427 in `profile-resume.tsx`) has this conditional in the **header button area**:
```tsx
key === 'jobs' ? (...)
: key === 'education' ? (...)
: <Button size="sm" variant="outline" disabled>{addLabel}</Button>  // ← replace this
```

Replace the fallback with explicit cases:
```tsx
key === 'jobs' ? (...)
: key === 'education' ? (...)
: key === 'projects' ? (
  <>
    <Button size="sm" variant="outline" onClick={() => setShowAddProject(true)} disabled={mutation.isPending}>
      {addLabel}
    </Button>
    <AddProjectSheet open={showAddProject} onClose={() => setShowAddProject(false)} onSave={handleAddProject} />
  </>
) : key === 'certifications' ? (
  <>
    <Button size="sm" variant="outline" onClick={() => setShowAddCert(true)} disabled={mutation.isPending}>
      {addLabel}
    </Button>
    <AddCertSheet open={showAddCert} onClose={() => setShowAddCert(false)} onSave={handleAddCert} sectionTitle="Add Certification" />
  </>
) : key === 'licences' ? (
  <>
    <Button size="sm" variant="outline" onClick={() => setShowAddLicence(true)} disabled={mutation.isPending}>
      {addLabel}
    </Button>
    <AddCertSheet open={showAddLicence} onClose={() => setShowAddLicence(false)} onSave={handleAddLicence} sectionTitle="Add Licence" />
  </>
) : (
  <>
    <Button size="sm" variant="outline" onClick={() => setShowAddAward(true)} disabled={mutation.isPending}>
      {addLabel}
    </Button>
    <AddCertSheet open={showAddAward} onClose={() => setShowAddAward(false)} onSave={handleAddAward} sectionTitle="Add Award" />
  </>
)
```

And for the **section body** (the `isOpen` block), extend the existing chain:
```tsx
{isOpen && (
  <div className="px-4 pb-4 border-t border-zinc-800">
    {key === 'jobs' ? (...)
    : key === 'education' ? (...)
    : key === 'projects' ? (
      <>
        {liveExp.projects.length === 0 && <p className="text-sm text-zinc-400 my-3">No entries yet.</p>}
        {liveExp.projects.map((project, idx) => (
          <ProjectEntryRow
            key={editingProjectIdx === idx ? `edit-${idx}` : `view-${idx}`}
            project={project}
            isEditing={editingProjectIdx === idx}
            onToggleEdit={() => setEditingProjectIdx(editingProjectIdx === idx ? null : idx)}
            onSave={(updated) => handleSaveProjectEntry(idx, updated)}
            onCancel={() => setEditingProjectIdx(null)}
            onDelete={() => handleDeleteProject(idx)}
            disabled={mutation.isPending}
          />
        ))}
      </>
    ) : key === 'certifications' ? (
      <>
        {liveExp.certifications.length === 0 && <p className="text-sm text-zinc-400 my-3">No entries yet.</p>}
        {liveExp.certifications.map((cert, idx) => (
          <CertEntryRow
            key={editingCertIdx === idx ? `edit-${idx}` : `view-${idx}`}
            entry={cert}
            isEditing={editingCertIdx === idx}
            onToggleEdit={() => setEditingCertIdx(editingCertIdx === idx ? null : idx)}
            onSave={(updated) => handleSaveCertEntry(idx, updated)}
            onCancel={() => setEditingCertIdx(null)}
            onDelete={() => handleDeleteCert(idx)}
            disabled={mutation.isPending}
          />
        ))}
      </>
    ) : key === 'licences' ? (
      <>
        {liveExp.licences.length === 0 && <p className="text-sm text-zinc-400 my-3">No entries yet.</p>}
        {liveExp.licences.map((licence, idx) => (
          <CertEntryRow
            key={editingLicenceIdx === idx ? `edit-${idx}` : `view-${idx}`}
            entry={licence}
            isEditing={editingLicenceIdx === idx}
            onToggleEdit={() => setEditingLicenceIdx(editingLicenceIdx === idx ? null : idx)}
            onSave={(updated) => handleSaveLicenceEntry(idx, updated)}
            onCancel={() => setEditingLicenceIdx(null)}
            onDelete={() => handleDeleteLicence(idx)}
            disabled={mutation.isPending}
          />
        ))}
      </>
    ) : (
      <>
        {liveExp.awards.length === 0 && <p className="text-sm text-zinc-400 my-3">No entries yet.</p>}
        {liveExp.awards.map((award, idx) => (
          <CertEntryRow
            key={editingAwardIdx === idx ? `edit-${idx}` : `view-${idx}`}
            entry={award}
            isEditing={editingAwardIdx === idx}
            onToggleEdit={() => setEditingAwardIdx(editingAwardIdx === idx ? null : idx)}
            onSave={(updated) => handleSaveAwardEntry(idx, updated)}
            onCancel={() => setEditingAwardIdx(null)}
            onDelete={() => handleDeleteAward(idx)}
            disabled={mutation.isPending}
          />
        ))}
      </>
    )}
  </div>
)}
```

### AddProjectSheet Component

```tsx
function AddProjectSheet({ open, onClose, onSave }: {
  open: boolean
  onClose: () => void
  onSave: (entry: ProjectEntry) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  function reset() {
    setName(''); setDescription(''); setErrors([])
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required')
    if (!description.trim()) errs.push('Description is required')
    if (errs.length) { setErrors(errs); return }
    onSave({ name: name.trim(), description: description.trim() })
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Project</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          {errors.length > 0 && (
            <div className="text-xs text-red-400 space-y-1">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Description *</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div className="flex gap-2 mt-2">
            <Button onClick={handleSave}>Save Project</Button>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

### AddCertSheet Component (shared for Certifications, Licences, Awards)

```tsx
function AddCertSheet({ open, onClose, onSave, sectionTitle }: {
  open: boolean
  onClose: () => void
  onSave: (entry: CertEntry) => void
  sectionTitle: string
}) {
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')
  const [year, setYear] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  function reset() {
    setName(''); setIssuer(''); setYear(''); setErrors([])
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required')
    if (!issuer.trim()) errs.push('Issuer is required')
    if (!year.trim()) errs.push('Year is required')
    if (year.trim() && !/^\d{4}$/.test(year.trim())) errs.push('Year must be 4 digits (YYYY)')
    if (errs.length) { setErrors(errs); return }
    onSave({ name: name.trim(), issuer: issuer.trim(), year: year.trim() })
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{sectionTitle}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          {errors.length > 0 && (
            <div className="text-xs text-red-400 space-y-1">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Issuer *</label>
            <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Year * (YYYY)</label>
            <Input value={year} onChange={(e) => setYear(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="YYYY" maxLength={4} />
          </div>
          <div className="flex gap-2 mt-2">
            <Button onClick={handleSave}>Save</Button>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

### ProjectEntryRow Component

Summary format for Projects: just `project.name` (description may be long; show name only in collapsed view).

```tsx
function ProjectEntryRow({ project, isEditing, onToggleEdit, onSave, onCancel, onDelete, disabled }: {
  project: ProjectEntry
  isEditing: boolean
  onToggleEdit: () => void
  onSave: (entry: ProjectEntry) => void
  onCancel: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [errors, setErrors] = useState<string[]>([])

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required')
    if (!description.trim()) errs.push('Description is required')
    if (errs.length) { setErrors(errs); return }
    onSave({ name: name.trim(), description: description.trim() })
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2 py-2 border-b border-zinc-800 last:border-0">
        <button type="button" className="flex-1 text-left text-sm text-zinc-300 hover:text-zinc-100 truncate" onClick={onToggleEdit} disabled={disabled}>
          {project.name}
        </button>
        <button type="button" onClick={onToggleEdit} disabled={disabled} className="text-zinc-500 hover:text-zinc-300 disabled:opacity-50 shrink-0">
          <ChevronDown className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDelete} disabled={disabled} className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="py-3 border-b border-zinc-800 last:border-0 space-y-3">
      {errors.length > 0 && (
        <div className="text-xs text-red-400 space-y-1">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Name *</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Description *</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="bg-zinc-900 border-zinc-700" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={disabled}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => { setErrors([]); onCancel() }}>Cancel</Button>
      </div>
    </div>
  )
}
```

### CertEntryRow Component (shared for Certifications, Licences, Awards)

Summary format: `"Name — Issuer (Year)"`.

```tsx
function CertEntryRow({ entry, isEditing, onToggleEdit, onSave, onCancel, onDelete, disabled }: {
  entry: CertEntry
  isEditing: boolean
  onToggleEdit: () => void
  onSave: (entry: CertEntry) => void
  onCancel: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const [name, setName] = useState(entry.name)
  const [issuer, setIssuer] = useState(entry.issuer)
  const [year, setYear] = useState(entry.year)
  const [errors, setErrors] = useState<string[]>([])

  const summary = `${entry.name} — ${entry.issuer} (${entry.year})`

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required')
    if (!issuer.trim()) errs.push('Issuer is required')
    if (!year.trim()) errs.push('Year is required')
    if (year.trim() && !/^\d{4}$/.test(year.trim())) errs.push('Year must be 4 digits (YYYY)')
    if (errs.length) { setErrors(errs); return }
    onSave({ name: name.trim(), issuer: issuer.trim(), year: year.trim() })
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2 py-2 border-b border-zinc-800 last:border-0">
        <button type="button" className="flex-1 text-left text-sm text-zinc-300 hover:text-zinc-100 truncate" onClick={onToggleEdit} disabled={disabled}>
          {summary}
        </button>
        <button type="button" onClick={onToggleEdit} disabled={disabled} className="text-zinc-500 hover:text-zinc-300 disabled:opacity-50 shrink-0">
          <ChevronDown className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDelete} disabled={disabled} className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="py-3 border-b border-zinc-800 last:border-0 space-y-3">
      {errors.length > 0 && (
        <div className="text-xs text-red-400 space-y-1">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Name *</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Issuer *</label>
        <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="bg-zinc-900 border-zinc-700" />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Year (YYYY)</label>
        <Input value={year} onChange={(e) => setYear(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="YYYY" maxLength={4} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={disabled}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => { setErrors([]); onCancel() }}>Cancel</Button>
      </div>
    </div>
  )
}
```

### Key Pattern: key trick for entry row remounting

Use the same key pattern from 43.3 to force remount when toggling to edit mode (ensures edit form shows current server data, not stale local state):
```tsx
key={editingProjectIdx === idx ? `edit-${idx}` : `view-${idx}`}
```

### Delete Behaviour

**No confirmation dialog** for any of the four sections — Projects, Certifications, Licences, and Awards have no nested sub-entries that warrant a confirm prompt. Remove immediately on trash click, matching the existing website delete behaviour.

### UI Styling Conventions (Inherited from 43.2/43.3)

- Input fields: `className="bg-zinc-900 border-zinc-700"`
- Labels: `<label className="block text-xs text-zinc-400 mb-1">`
- Section header text: `text-sm font-medium text-zinc-200`
- Entry summary text: `text-sm text-zinc-300`
- Sheet content: `<SheetContent className="overflow-y-auto">`

These are already established in the file — copy exactly from existing components.

### What NOT to Change

- `EXPERIENCE_SECTIONS` const array (lines 19–27) — already has all 6 entries correctly defined
- `shared/schemas.ts` — do NOT add new exports
- `useProfileQuery.ts`, `useProfileMutation.ts` — no changes needed
- `api-profile.ts` — no changes needed
- `profile-index.tsx` — no changes needed
- `getExperience()` and `buildPersonal()` helpers — already exist and correct, just call them
- Any downstream services — updated in Story 43.5

### Verification Steps

1. `bun tsc --noEmit` — zero new TypeScript errors
2. `bun test` — 403+ passing; zero new failures (no server-side changes)
3. Manual: `bun run dev` → navigate to `/config/profile/resume`
4. Manual: click "Add Project" — Sheet opens; fill Name and Description; click "Save Project" — entry appears with name as summary; page refresh persists
5. Manual: click project summary row — expands to inline edit; change description; click "Save" — updates
6. Manual: click trash on a project entry — removes immediately with no confirm dialog
7. Manual: click "Add Certification" — Sheet opens; fill Name, Issuer, Year; click "Save" — appears as "Name — Issuer (Year)"; page refresh persists
8. Manual: enter invalid Year (e.g. "202") — validation error shown
9. Manual: repeat Add/Delete for Licences and Awards — same UX, same Sheet with different title
10. Manual: all 6 section counts update in headers after add/delete without page refresh
11. Manual: save Personal section after adding a Project — personal data saves without overwriting the project (stale data fix already in place via `getExperience()`)

## Previous Story Intelligence (43.3)

- **`getExperience()` helper:** already in `ProfileResumeForm` — use it in ALL mutation calls. Do NOT pass `experience: profileData.experience` (stale snapshot bug fixed in 43.3).
- **`buildPersonal()` helper:** already in `ProfileResumeForm` — use in all mutation calls alongside `getExperience()`.
- **`liveExp` variable:** already computed as `(liveProfile ?? profileData).experience` — reuse for reading live array data in the render loop.
- **Reset form on close:** call `reset()` in `handleClose()`, not in `handleSave()`. The Sheet's `onOpenChange` calls `handleClose()` when the Sheet is dismissed.
- **editingIdx clearing on delete:** always call `setEditingXxxIdx(null)` when the deleted index ≤ currently editing index (prevents stale index pointing at wrong entry).
- **Test baseline:** 403 passing / 13 pre-existing failures — this story has no server-side changes, baseline should be preserved.
- **No Collapsible shadcn component:** section open/close is handled via `openSections` state + manual conditional render. Do not introduce the `Collapsible` component.
- **`mutation.isPending` disable:** disable all action buttons while mutation is pending to prevent double-submits.

### Review Findings

- [x] [Review][Patch] CertEntryRow Year field label missing required asterisk — shows "Year (YYYY)" with no `*`, but field is required and validation enforces it; inconsistent with AddCertSheet which correctly shows "Year * (YYYY)" [profile-resume.tsx:1463]

- [x] [Review][Defer] openSections does not auto-open when first item is added to a previously empty section [profile-resume.tsx:56-59] — deferred, UX gap not in AC
- [x] [Review][Defer] Dead `year.trim() &&` guard before regex in handleSave — always truthy when reached; latent if required-field check ever removed [profile-resume.tsx:1306, 1426] — deferred, pre-existing
- [x] [Review][Defer] CertEntryRow summary shows empty parens if entry.year is empty string — displays "Name — Issuer ()" for imported/migrated data [profile-resume.tsx:1419] — deferred, data integrity edge case
- [x] [Review][Defer] Parallel mutations not serialized — last-writer-wins under concurrent operations; pre-existing across all sections [profile-resume.tsx] — deferred, pre-existing
- [x] [Review][Defer] No server-error feedback inside Sheet components during in-flight mutation — pre-existing pattern matching AddJobSheet/AddEducationSheet [profile-resume.tsx] — deferred, pre-existing

## Dev Agent Record

### Completion Notes

Implemented all four sections (Projects, Certifications, Licences, Awards) in `profile-resume.tsx` following the exact patterns from stories 43.2 and 43.3.

- Added type imports `projectEntrySchema` and `certEntrySchema` from `@shared/schemas`; inferred `ProjectEntry` and `CertEntry` types locally
- Added 8 state variables (showAdd/editingIdx pairs for all 4 sections)
- Added 12 handlers (3 per section: add, save, delete) all using `getExperience()` and `buildPersonal()` helpers
- Created `AddProjectSheet` (name + description) and `AddCertSheet` (name + issuer + year, reused for all 3 cert-shaped sections via `sectionTitle` prop)
- Created `ProjectEntryRow` (shows name in collapsed view) and `CertEntryRow` (shows "Name — Issuer (Year)" in collapsed view, reused for certifications/licences/awards)
- Extended EXPERIENCE_SECTIONS render loop header and body with explicit `key ===` cases; fallback now handles awards
- `bun tsc --noEmit`: zero new errors in profile-resume.tsx (pre-existing errors in other files unchanged)
- `bun test`: 404 passing, 12 pre-existing failures — no regressions introduced

### Change Log

- 2026-06-11: Implemented story 43.4 — Projects, Certifications, Licences, Awards CRUD UI in profile-resume.tsx

## File List

| File | Action |
|------|--------|
| `job-hunt-dashboard/src/client/routes/config/profile-resume.tsx` | Modified |

## Files to Modify

| File | Action |
|------|--------|
| `job-hunt-dashboard/src/client/routes/config/profile-resume.tsx` | Add Projects + Certifications + Licences + Awards CRUD; `AddProjectSheet`, `AddCertSheet`, `ProjectEntryRow`, `CertEntryRow` inner components; extend EXPERIENCE_SECTIONS render loop |

**Do NOT modify:**
- `job-hunt-dashboard/src/shared/schemas.ts`
- `job-hunt-dashboard/src/client/hooks/useProfileQuery.ts`
- `job-hunt-dashboard/src/client/hooks/useProfileMutation.ts`
- `job-hunt-dashboard/src/server/routes/api-profile.ts`
- `job-hunt-dashboard/src/client/routes/config/profile-index.tsx`
- Any server-side services
