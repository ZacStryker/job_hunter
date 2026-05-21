# Story 38.2: Card Tooltips in Config Sections

Status: done

## Story

As a user exploring the Config section for the first time,
I want a `?` tooltip on every section card that gives me a one-sentence description,
so that I understand what each area controls before clicking in.

## Acceptance Criteria

1. **Given** the user hovers the `?` icon on any card in the Config overview, Profile, Job Sources, or Prompts section pages, **When** the tooltip appears, **Then** a one-sentence description of the section is shown.
2. **Given** the user clicks the `?` icon button, **When** the click fires, **Then** the parent card's navigation does not trigger (tooltip interaction only).
3. **Given** the Config overview is rendered, **When** the user inspects each card, **Then** each card has a `?` tooltip button between the card label and the status badge with the following text:
   - **Profile:** "Your name, contact details, and credentials used across all AI features."
   - **Job Sources:** "LinkedIn authentication and job search filters that drive automated discovery."
   - **Prompts:** "System prompts that control how AI analyzes jobs, writes cover letters, and generates resumes."
   - **Logs:** "History of automation runs showing timing, token usage, and costs."
4. **Given** the Profile index is rendered, **When** the user inspects each card, **Then** the tooltip texts are:
   - **Candidate Info:** "Your personal details and resume content used as context for all AI-generated documents."
   - **API Keys:** "Your Anthropic API key, required to enable all AI analysis and generation features."
   - **Inbox Mapping:** "IMAP credentials and folder rules for automatic email-based application status tracking."
5. **Given** the Job Sources index is rendered, **When** the user inspects each card, **Then** the tooltip texts are:
   - **Auth Setup:** "Your LinkedIn session authentication that allows the scraper to discover job listings."
   - **Searches:** "Job title and location targets that drive automated LinkedIn job discovery runs."
6. **Given** the Prompts index is rendered, **When** the user inspects each card, **Then** the tooltip texts are:
   - **Analyze Jobs:** "The prompt used to score and evaluate incoming job listings against your candidate profile."
   - **Generate Cover Letter:** "The prompt template for generating personalized cover letters tailored to each job."
   - **Generate Resume:** "The prompt used to adapt your resume content to match a specific job description."

## Tasks / Subtasks

- [x] Add `?` tooltip button to each card in `overview.tsx` (AC: 1, 2, 3)
  - [x] Wrap root `<div>` with `<TooltipProvider>`
  - [x] Add imports: `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` from `@/components/ui/tooltip` and `CircleHelp` from `lucide-react`
  - [x] Update card header layout in all 4 cards: label+tooltip on left, badge/text on right
  - [x] Add `e.preventDefault(); e.stopPropagation()` to button onClick to prevent Link navigation (AC: 2)
- [x] Add `?` tooltip button to each card in `profile-index.tsx` (AC: 1, 2, 4)
  - [x] Wrap root `<div>` with `<TooltipProvider>`
  - [x] Add same imports
  - [x] Update 3 card header layouts
- [x] Add `?` tooltip button to each card in `job-sources-index.tsx` (AC: 1, 2, 5)
  - [x] Wrap root `<div>` with `<TooltipProvider>`
  - [x] Add same imports
  - [x] Update 2 card header layouts
- [x] Add `?` tooltip button to each card in `prompts-index.tsx` (AC: 1, 2, 6)
  - [x] Wrap root `<div>` with `<TooltipProvider>`
  - [x] Add same imports
  - [x] Update 3 card header layouts

## Dev Notes

**4 files to modify, no new files.** UI-only change — no API calls, no schema changes, no route changes.

### Component Usage

Import from the existing shadcn/ui wrapper (do not modify):
```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CircleHelp } from 'lucide-react'
```

`TooltipProvider` already used in `job-sources-searches.tsx` — this is the established pattern.

### Card Header Layout Pattern

**Current layout in all 4 files:**
```tsx
<div className="flex items-center justify-between">
  <span className="text-sm font-medium text-zinc-200">Label</span>
  <span>Badge</span>
</div>
```

**Updated layout (apply to every card in scope):**
```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-1.5">
    <span className="text-sm font-medium text-zinc-200">Label</span>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation() }}
          className="text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        One-sentence description here.
      </TooltipContent>
    </Tooltip>
  </div>
  <span>Badge</span>
</div>
```

**CRITICAL — click propagation on `<Link>` cards:** All cards in `overview.tsx`, `profile-index.tsx`, `job-sources-index.tsx`, and `prompts-index.tsx` are `<Link>` elements (TanStack Router). A `<button>` inside a `<Link>` that calls `e.preventDefault()` prevents the Link's navigation and `e.stopPropagation()` stops the click from reaching the Link. Both are required — omitting either causes the card to navigate when the user clicks `?`.

### `<TooltipProvider>` Placement

Wrap the root `<div className="p-6">` of each component with `<TooltipProvider>`. Do not nest multiple `<TooltipProvider>` elements — one at the component root is sufficient.

```tsx
return (
  <TooltipProvider>
    <div className="p-6">
      {/* ... */}
    </div>
  </TooltipProvider>
)
```

### Exact Tooltip Strings Per File

**`overview.tsx`:**
| Card label | Tooltip text |
|---|---|
| Profile | "Your name, contact details, and credentials used across all AI features." |
| Job Sources | "LinkedIn authentication and job search filters that drive automated discovery." |
| Prompts | "System prompts that control how AI analyzes jobs, writes cover letters, and generates resumes." |
| Logs | "History of automation runs showing timing, token usage, and costs." |

**`profile-index.tsx`:**
| Card label | Tooltip text |
|---|---|
| Candidate Info | "Your personal details and resume content used as context for all AI-generated documents." |
| API Keys | "Your Anthropic API key, required to enable all AI analysis and generation features." |
| Inbox Mapping | "IMAP credentials and folder rules for automatic email-based application status tracking." |

**`job-sources-index.tsx`:**
| Card label | Tooltip text |
|---|---|
| Auth Setup | "Your LinkedIn session authentication that allows the scraper to discover job listings." |
| Searches | "Job title and location targets that drive automated LinkedIn job discovery runs." |

**`prompts-index.tsx`:**
| Card label | Tooltip text |
|---|---|
| Analyze Jobs | "The prompt used to score and evaluate incoming job listings against your candidate profile." |
| Generate Cover Letter | "The prompt template for generating personalized cover letters tailored to each job." |
| Generate Resume | "The prompt used to adapt your resume content to match a specific job description." |

### Special Cases

**`overview.tsx` Logs card** — the right side is `<span className="text-xs text-zinc-500">View logs →</span>` (not a badge). The layout update is the same pattern: label+tooltip go in the left `<div>`, the "View logs →" span stays on the right. No change to the right side.

**`overview.tsx` card wrapper** — uses `<Link>` components (TanStack Router), same as the other three files. The stopPropagation pattern applies here too.

### Anti-Patterns to Avoid

- **DO NOT** modify `src/client/components/ui/tooltip.tsx` — it is a shadcn/ui generated file
- **DO NOT** add `TooltipProvider` inside the card loop — one per component root
- **DO NOT** omit `e.preventDefault()` from the button onClick — without it, the `<Link>` parent will navigate on click
- **DO NOT** change any label text, badge logic, query hooks, or imports not listed above
- TypeScript strict mode is on (`noUnusedLocals`) — do not introduce unused imports

### Project Structure Notes

All 4 files live at: `job-hunt-dashboard/src/client/routes/config/`
- `overview.tsx` → Config overview, 4 cards
- `profile-index.tsx` → Profile section overview, 3 cards
- `job-sources-index.tsx` → Job Sources section overview, 2 cards
- `prompts-index.tsx` → Prompts section overview, 3 cards

### References

- Epic spec: `_bmad-output/planning-artifacts/epics/epic-38-config-ux-polish.md` — Story 38.2
- Story 38.1 (done): `_bmad-output/implementation-artifacts/38-1-rename-config-section-labels.md` — established label strings used in this story's tooltip tables
- Existing tooltip usage reference: `job-hunt-dashboard/src/client/routes/config/job-sources-searches.tsx:6` — imports `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger`
- shadcn/ui tooltip wrapper: `job-hunt-dashboard/src/client/components/ui/tooltip.tsx`

### Review Findings

- [x] [Review][Patch] Missing `aria-label` on tooltip trigger buttons — all 4 files. Each `<button>` contains only `<CircleHelp>` SVG with no accessible name; screen readers announce "button" with no context. Fix: add `aria-label="What is this?"` to every tooltip trigger button. [overview.tsx, profile-index.tsx, job-sources-index.tsx, prompts-index.tsx]
- [x] [Review][Defer] `<button>` nested inside TanStack Router `<Link>` (`<a>`) is technically invalid HTML — spec-mandated pattern, acknowledged in dev notes. [all 4 files] — deferred, pre-existing design choice
- [x] [Review][Defer] Touch device tooltip dead zone — Radix Tooltip does not open on tap; `e.stopPropagation()` swallows the tap so user gets no feedback on touch screens. Known Radix limitation; out of scope. [all 4 files] — deferred, pre-existing
- [x] [Review][Defer] `prompts-index.tsx` "Edited" badge uses `bg-zinc-700 text-zinc-300` while `overview.tsx` uses `bg-emerald-900 text-emerald-400` for the same semantic state — pre-existing inconsistency, 38.2 did not change badge logic. [prompts-index.tsx] — deferred, pre-existing
- [x] [Review][Defer] 13 identical tooltip-button blocks duplicated across 4 files with no abstraction — `<Tooltip><TooltipTrigger><button>…</button></TooltipTrigger><TooltipContent>` repeated verbatim 13 times; any future change to the pattern (icon size, aria-label, stop-propagation) must be applied to every instance. Extractable to a shared `CardTooltip` component. — deferred, out of scope for UI-only story
- [x] [Review][Defer] `aria-label="What is this?"` is identical on all 13 tooltip trigger buttons — screen readers cannot distinguish which card each button belongs to; per-card labels (e.g., `aria-label="About Profile"`) would better serve keyboard/AT users. Story prescribed "What is this?" as the fix. — deferred, future a11y improvement

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `TooltipProvider` wrapper + `Tooltip/TooltipTrigger/TooltipContent/CircleHelp` imports to all 4 files.
- Applied card header layout pattern (label+tooltip left, badge/text right) to 12 cards total: 4 in overview.tsx, 3 in profile-index.tsx, 2 in job-sources-index.tsx, 3 in prompts-index.tsx.
- All tooltip buttons use `e.preventDefault(); e.stopPropagation()` to block parent `<Link>` navigation (AC 2).
- TypeScript clean (no new errors). 357/367 tests pass; the 10 pre-existing failures are in api-onboarding.test.ts and unrelated to this UI-only change.

### File List

- job-hunt-dashboard/src/client/routes/config/overview.tsx
- job-hunt-dashboard/src/client/routes/config/profile-index.tsx
- job-hunt-dashboard/src/client/routes/config/job-sources-index.tsx
- job-hunt-dashboard/src/client/routes/config/prompts-index.tsx
