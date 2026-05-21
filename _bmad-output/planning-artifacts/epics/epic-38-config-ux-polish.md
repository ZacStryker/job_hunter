# Epic 38: Config UX Polish — Labels, Tooltips, Breadcrumbs & Expanded Nav

Users see clearer, action-oriented labels throughout the Config section, get one-sentence help tooltips on every section card, navigate with breadcrumbs at the top of the content area, and the left nav always shows an expanded tree with visually distinct parent and child entries.

**Source:** User request 2026-05-21
**Priority:** Medium — UX improvement; no backend or API changes required

---

## Story 38.1: Rename Config Section Labels

As a user navigating the Config section,
I want labels that describe what each section does (not just what it contains),
So that the purpose of each area is immediately clear.

**Acceptance Criteria:**

**Given** the user navigates to `/config/profile`
**When** the page loads
**Then** the tile for the profile form reads "Candidate Info" (not "Resume")

**Given** the user navigates to `/config/profile/resume`
**When** the page loads
**Then** the page heading reads "Candidate Info" (not "Profile" or "Resume")

**Given** the user navigates to `/config/prompts`
**When** the page loads
**Then** the three tiles read "Analyze Jobs", "Generate Cover Letter", and "Generate Resume" (not "Analysis", "Cover Letter", "Resume")

**Given** the user navigates to any prompts subpage (`/analysis`, `/cover-letter`, `/resume`)
**When** the page loads
**Then** the page heading matches the tile label: "Analyze Jobs", "Generate Cover Letter", or "Generate Resume" respectively

**Given** any of the above renames are applied
**When** the user inspects the URL
**Then** all route paths remain unchanged (`/config/profile/resume`, `/config/prompts/analysis`, etc.) — only display labels change

> **Dev note:** Text-only changes in six files. No route path or file name changes.
>
> - `src/client/routes/config/profile-index.tsx`: card label `"Resume"` → `"Candidate Info"`
> - `src/client/routes/config/profile-resume.tsx`: `<h1>` content `"Profile"` → `"Candidate Info"`
> - `src/client/routes/config/prompts-index.tsx`: three card labels updated
> - `src/client/routes/config/prompts-analysis.tsx`: `<h1>` `"Analysis"` → `"Analyze Jobs"`
> - `src/client/routes/config/prompts-cover-letter.tsx`: `<h1>` `"Cover Letter"` → `"Generate Cover Letter"`
> - `src/client/routes/config/prompts-resume.tsx`: `<h1>` `"Resume"` → `"Generate Resume"`

---

## Story 38.2: Card Tooltips in Config Sections

As a user exploring the Config section for the first time,
I want a `?` tooltip on every section card that gives me a one-sentence description,
So that I understand what each area controls before clicking in.

**Acceptance Criteria:**

**Given** the user hovers the `?` icon on any card in the Config overview, Profile, Job Sources, or Prompts section pages
**When** the tooltip appears
**Then** a one-sentence description of the section is shown

**Given** the user clicks the `?` icon button
**When** the click fires
**Then** the parent card's navigation does not trigger (tooltip interaction only)

**Given** the Config overview is rendered
**When** the user inspects each card
**Then** each card has a `?` tooltip button between the card label and the status badge, with the following text:
- **Profile:** "Your name, contact details, and credentials used across all AI features."
- **Job Sources:** "LinkedIn authentication and job search filters that drive automated discovery."
- **Prompts:** "System prompts that control how AI analyzes jobs, writes cover letters, and generates resumes."
- **Logs:** "History of automation runs showing timing, token usage, and costs."

**Given** the Profile index is rendered
**When** the user inspects each card
**Then** the tooltip texts are:
- **Candidate Info:** "Your personal details and resume content used as context for all AI-generated documents."
- **API Keys:** "Your Anthropic API key, required to enable all AI analysis and generation features."
- **Inbox Mapping:** "IMAP credentials and folder rules for automatic email-based application status tracking."

**Given** the Job Sources index is rendered
**When** the user inspects each card
**Then** the tooltip texts are:
- **Auth Setup:** "Your LinkedIn session authentication that allows the scraper to discover job listings."
- **Searches:** "Job title and location targets that drive automated LinkedIn job discovery runs."

**Given** the Prompts index is rendered
**When** the user inspects each card
**Then** the tooltip texts are:
- **Analyze Jobs:** "The prompt used to score and evaluate incoming job listings against your candidate profile."
- **Generate Cover Letter:** "The prompt template for generating personalized cover letters tailored to each job."
- **Generate Resume:** "The prompt used to adapt your resume content to match a specific job description."

> **Dev note:** Use `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` from `@/components/ui/tooltip`. `TooltipProvider` already wraps at the component level in other pages (see `job-sources-searches.tsx`) — wrap each overview page's root `<div>` with `<TooltipProvider>`.
>
> Card layout currently: `<div className="flex items-center justify-between"><span>Label</span><span>Badge</span></div>`. Update to: `<div className="flex items-center justify-between"><div className="flex items-center gap-1.5"><span>Label</span><Tooltip><TooltipTrigger asChild><button type="button" onClick={e => { e.preventDefault(); e.stopPropagation() }} className="text-zinc-600 hover:text-zinc-400 transition-colors"><CircleHelp className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent side="top" className="max-w-xs text-xs">…</TooltipContent></Tooltip></div><span>Badge</span></div>`.
>
> Import `CircleHelp` from `lucide-react`. Apply to all four overview files: `overview.tsx`, `profile-index.tsx`, `job-sources-index.tsx`, `prompts-index.tsx`.

---

## Story 38.3: Breadcrumbs & Expanded Left Nav

As a user navigating deep into the Config section,
I want breadcrumbs at the top of the content area and an always-expanded left nav showing all child pages,
So that I always know where I am and can jump to any config page in one click.

**Acceptance Criteria:**

**Given** the user is on any `/config/*` route except the root `/config` overview
**When** the content area renders
**Then** a breadcrumb trail appears at the top of the content area, separated from the page content by a thin border, with segments separated by `/`

**Given** the user is on any route, the breadcrumb segments are:

| Route | Breadcrumb |
|---|---|
| `/config` | *(no breadcrumb)* |
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

**Given** the breadcrumb is rendered
**When** the user clicks any segment except the last
**Then** they navigate to that route (each non-last segment is a `Link`)

**Given** the breadcrumb is rendered
**When** the user looks at the last segment
**Then** it is plain text (not a link) and uses a lighter color to indicate the current page

**Given** the user is on any config page
**When** they look at the left nav
**Then** the nav always shows all child pages nested under each parent section (expanded tree, never collapsed)

**Given** the left nav is rendered
**When** the user inspects the visual hierarchy
**Then** parent section links are visually larger/bolder than child links, which are indented to the right

**Given** the user is on a child page (e.g., `/config/profile/resume`)
**When** they look at the left nav
**Then** the active child link is highlighted (`bg-zinc-800 text-zinc-100`); the parent link does not show an active background but its text is `text-zinc-100`

**Given** the user is on a section overview (e.g., `/config/profile`)
**When** they look at the left nav
**Then** the parent "Profile" link is active (`bg-zinc-800 text-zinc-100`); child links are visible but inactive

> **Dev note:** Two components to create/update.
>
> **Breadcrumb — create `src/client/components/config/ConfigBreadcrumb.tsx`:**
> Uses `useRouterState` with `select: s => s.location.pathname`. Maintain a static record mapping every config path to its display label (include all 13 paths from the ACs above). To render: `split('/')` the pathname, build up cumulative path prefixes (`/config`, `/config/profile`, `/config/profile/resume`), map each prefix to its label, skip the first segment (root `/config`) only when rendering if you want "Config" to appear as the first crumb. Render segments as `<Link>` except the last which is a `<span>`. Separator is ` / ` styled as `text-zinc-600`. Return `null` when `pathname === '/config'` (no breadcrumb on overview). Style: `<nav className="flex items-center gap-1 text-xs text-zinc-500">`.
>
> **Layout — update `src/client/routes/config/layout.tsx`:**
> Add breadcrumb to the `<main>` area. Render a thin header bar above the `<Outlet />`:
> ```tsx
> <main className="flex-1 overflow-auto">
>   <div className="px-6 pt-3 pb-2 border-b border-zinc-800/60">
>     <ConfigBreadcrumb />
>   </div>
>   <Outlet />
> </main>
> ```
> The breadcrumb returns null on `/config`, so the bar appears only when there's a trail to show.
>
> **Left nav — update `src/client/routes/config/layout.tsx`:**
> Replace the current four flat `<Link>` items with an expanded tree. Parent entries are nav section headings styled as `text-xs font-semibold uppercase tracking-wide text-zinc-500 px-3 py-1.5 mt-1`. Each parent is still a `<Link>` (navigates to the section overview). Child entries are `<Link>` elements with `pl-7 py-1.5 text-xs rounded`. Use `activeProps`/`inactiveProps` on each `<Link>`:
> - Parent active (exact match on section overview path): `text-zinc-100 bg-zinc-800`
> - Parent inactive or partially active (children active): `text-zinc-400 hover:text-zinc-200`
> - Child active (exact path): `text-zinc-100 bg-zinc-800 font-medium`
> - Child inactive: `text-zinc-500 hover:text-zinc-300`
>
> Use `activeOptions={{ exact: true }}` on parent links so they don't highlight when on a child. Child links always use exact matching. Full nav structure:
> ```
> Profile → /config/profile
>   Candidate Info → /config/profile/resume
>   API Keys → /config/profile/api-keys
>   Inbox Mapping → /config/profile/inbox-mapping
> Job Sources → /config/job-sources
>   Auth Setup → /config/job-sources/auth-setup
>   Searches → /config/job-sources/searches
> Prompts → /config/prompts
>   Analyze Jobs → /config/prompts/analysis
>   Generate Cover Letter → /config/prompts/cover-letter
>   Generate Resume → /config/prompts/resume
> Logs → /config/logs
> ```
> Logs has no children — it renders as a single entry like the old nav. Add a `mt-2` top spacer before "Logs" to visually separate it from the Prompts group.
