# Story 38.1: Rename Config Section Labels

Status: done

## Story

As a user navigating the Config section,
I want labels that describe what each section does (not just what it contains),
so that the purpose of each area is immediately clear.

## Acceptance Criteria

1. **Given** the user navigates to `/config/profile`, **When** the page loads, **Then** the tile for the profile form reads "Candidate Info" (not "Resume").
2. **Given** the user navigates to `/config/profile/resume`, **When** the page loads, **Then** the page heading reads "Candidate Info" (not "Profile" or "Resume").
3. **Given** the user navigates to `/config/prompts`, **When** the page loads, **Then** the three tiles read "Analyze Jobs", "Generate Cover Letter", and "Generate Resume" (not "Analysis", "Cover Letter", "Resume").
4. **Given** the user navigates to any prompts subpage (`/analysis`, `/cover-letter`, `/resume`), **When** the page loads, **Then** the page heading matches the tile label: "Analyze Jobs", "Generate Cover Letter", or "Generate Resume" respectively.
5. **Given** any of the above renames are applied, **When** the user inspects the URL, **Then** all route paths remain unchanged — only display labels change.

## Tasks / Subtasks

- [x] Rename "Resume" card label → "Candidate Info" in profile-index.tsx (AC: 1)
  - [x] Change `<span>Resume</span>` to `<span>Candidate Info</span>` on line 19
- [x] Rename `<h1>` heading → "Candidate Info" in profile-resume.tsx (AC: 2)
  - [x] Change `"Profile"` to `"Candidate Info"` in the `<h1>` on line 73
- [x] Rename three card labels in prompts-index.tsx (AC: 3)
  - [x] `"Analysis"` → `"Analyze Jobs"` on line 17
  - [x] `"Cover Letter"` → `"Generate Cover Letter"` on line 26
  - [x] `"Resume"` → `"Generate Resume"` on line 35
- [x] Rename `<h1>` heading in prompts-analysis.tsx (AC: 4)
  - [x] `"Analysis"` → `"Analyze Jobs"` on line 10
- [x] Rename `<h1>` heading in prompts-cover-letter.tsx (AC: 4)
  - [x] `"Cover Letter"` → `"Generate Cover Letter"` on line 10
- [x] Rename `<h1>` heading in prompts-resume.tsx (AC: 4)
  - [x] `"Resume"` → `"Generate Resume"` on line 10

## Dev Notes

This is a **text-only** change across 6 files. No new components, no route changes, no API changes, no imports added. Zero risk of regressions outside the 6 files below.

### Exact Changes Required

**`job-hunt-dashboard/src/client/routes/config/profile-index.tsx`** (line 19):
```diff
- <span className="text-sm font-medium text-zinc-200">Resume</span>
+ <span className="text-sm font-medium text-zinc-200">Candidate Info</span>
```

**`job-hunt-dashboard/src/client/routes/config/profile-resume.tsx`** (line 73):
```diff
- <h1 className="text-2xl font-semibold text-zinc-100">Profile</h1>
+ <h1 className="text-2xl font-semibold text-zinc-100">Candidate Info</h1>
```

**`job-hunt-dashboard/src/client/routes/config/prompts-index.tsx`** (lines 17, 26, 35):
```diff
- <span className="text-sm font-medium text-zinc-200">Analysis</span>
+ <span className="text-sm font-medium text-zinc-200">Analyze Jobs</span>

- <span className="text-sm font-medium text-zinc-200">Cover Letter</span>
+ <span className="text-sm font-medium text-zinc-200">Generate Cover Letter</span>

- <span className="text-sm font-medium text-zinc-200">Resume</span>
+ <span className="text-sm font-medium text-zinc-200">Generate Resume</span>
```

**`job-hunt-dashboard/src/client/routes/config/prompts-analysis.tsx`** (line 10):
```diff
- <h1 className="text-xl font-semibold text-zinc-100 mb-6">Analysis</h1>
+ <h1 className="text-xl font-semibold text-zinc-100 mb-6">Analyze Jobs</h1>
```

**`job-hunt-dashboard/src/client/routes/config/prompts-cover-letter.tsx`** (line 10):
```diff
- <h1 className="text-xl font-semibold text-zinc-100 mb-6">Cover Letter</h1>
+ <h1 className="text-xl font-semibold text-zinc-100 mb-6">Generate Cover Letter</h1>
```

**`job-hunt-dashboard/src/client/routes/config/prompts-resume.tsx`** (line 10):
```diff
- <h1 className="text-xl font-semibold text-zinc-100 mb-6">Resume</h1>
+ <h1 className="text-xl font-semibold text-zinc-100 mb-6">Generate Resume</h1>
```

### Anti-Patterns to Avoid

- **DO NOT** rename files (e.g., `profile-resume.tsx` stays `profile-resume.tsx` — route path `/config/profile/resume` stays unchanged)
- **DO NOT** change route `path` definitions in the router
- **DO NOT** change any API calls or query keys
- **DO NOT** change the `flow` values used in `prompts.find(p => p.flow === 'analysis')` — those are data identifiers, not display labels
- **DO NOT** add any new imports or helper functions — these are purely inline string changes
- TypeScript strict mode is on — avoid any changes that introduce unused variables

### Project Structure Notes

- All 6 files live at: `job-hunt-dashboard/src/client/routes/config/`
- File names match route segments (`profile-resume.tsx` → `/config/profile/resume`) — do not rename
- `src/client/components/ui/` contains shadcn/ui components — do not edit
- Config was restructured in Epic 35; this epic (38) polishes labels within that existing structure

### Context for Epic 38 Stories 38.2 and 38.3

The label renames in this story are foundational for 38.2 (tooltips) and 38.3 (breadcrumbs). The breadcrumb for `/config/prompts/analysis` will display "Analyze Jobs" — matching the label set here. Do not deviate from the label strings established in this story.

### References

- Epic spec: `_bmad-output/planning-artifacts/epics/epic-38-config-ux-polish.md` — Story 38.1
- Files confirmed as-read (2026-05-21):
  - `profile-index.tsx`: card label `"Resume"` at line 19
  - `profile-resume.tsx`: `<h1>"Profile"` at line 73
  - `prompts-index.tsx`: labels at lines 17, 26, 35
  - `prompts-analysis.tsx`: `<h1>"Analysis"` at line 10
  - `prompts-cover-letter.tsx`: `<h1>"Cover Letter"` at line 10
  - `prompts-resume.tsx`: `<h1>"Resume"` at line 10

### Review Findings

- [x] [Review][Decision] `profile-index.tsx` page h1 still reads "Profile" — intentional: "Profile" is the section heading, "Candidate Info" is the named subsection within it; dismissed by owner 2026-05-21
- [x] [Review][Patch] `PromptSection.tsx` `FLOW_LABELS` stale — h2 inside the prompt editor card still renders "Analysis", "Cover Letter", "Resume"; users see contradicting h1/h2 labels on the same screen [job-hunt-dashboard/src/client/components/config/PromptSection.tsx]
- [x] [Review][Patch] `config.tsx` `PROMPT_FLOW_LABELS` stale — `PromptsPreviewCard` on the config overview page still shows old names "Analysis", "Cover Letter", "Resume" [job-hunt-dashboard/src/client/routes/config.tsx:112-116]
- [x] [Review][Defer] Dashboard WORKFLOW_KEYS use old terminology — `'Analysis'`, `'Cover Letter'`, `'Resume'` column headers are data-coupled to server-stored workflow names in the DB; renaming requires a coordinated server+client change outside this story's scope [job-hunt-dashboard/src/client/routes/dashboard.tsx] — deferred, pre-existing
- [x] [Review][Defer] Pipeline alert labels hardcode `'Analysis'` — "Analysis complete" / "Analysis failed" toasts still use old term [job-hunt-dashboard/src/client/routes/index.tsx] — deferred, pre-existing

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Applied all 8 inline text replacements across 6 files. Zero logic changes, zero route changes, zero import changes. Pre-existing TypeScript errors in unrelated files (`useMessageMutation.ts`, `config.tsx`, auth routes) confirmed as not introduced by this story.

### File List

- job-hunt-dashboard/src/client/routes/config/profile-index.tsx
- job-hunt-dashboard/src/client/routes/config/profile-resume.tsx
- job-hunt-dashboard/src/client/routes/config/prompts-index.tsx
- job-hunt-dashboard/src/client/routes/config/prompts-analysis.tsx
- job-hunt-dashboard/src/client/routes/config/prompts-cover-letter.tsx
- job-hunt-dashboard/src/client/routes/config/prompts-resume.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/38-1-rename-config-section-labels.md

### Change Log

- 2026-05-21: Renamed display labels across 6 config route files — "Resume" card → "Candidate Info", "Profile" h1 → "Candidate Info", "Analysis" → "Analyze Jobs", "Cover Letter" → "Generate Cover Letter", "Resume" (prompts) → "Generate Resume". No route paths or data identifiers changed.
