---
stepsCompleted: ["step-01", "step-02", "step-03", "step-04"]
inputDocuments:
  - "Epic input provided inline (Profile/Resume page redesign requirements + new JSON schema)"
  - "job-hunt-dashboard/src/shared/schemas.ts"
  - "job-hunt-dashboard/src/db/schema.ts"
  - "job-hunt-dashboard/src/server/routes/api-profile.ts"
  - "job-hunt-dashboard/src/server/services/analysis-service.ts"
  - "job-hunt-dashboard/src/server/services/cover-letter-service.ts"
  - "job-hunt-dashboard/src/server/services/resume-service.ts"
  - "job-hunt-dashboard/src/server/services/discovery-service.ts"
  - "job-hunt-dashboard/src/server/services/resume-embedding-cache.ts"
  - "job-hunt-dashboard/src/client/routes/config/profile-resume.tsx"
---

# Epic 43: Profile Schema Redesign & Form UI

## Overview

Replaces the current freetext-textarea profile page with a structured, schema-driven form UI. The existing `Profile` model stores everything as flat nullable text fields (`name`, `experience TEXT`, `skills TEXT`, `education TEXT`, etc.). This epic migrates the DB and API to a new structured JSON schema (`personal` + `experience` objects), rebuilds the Profile/Resume config page as a proper CRUD form with collapsible sections and inline entry forms, and updates every downstream consumer (analysis, cover letter, resume, discovery/embedding) to read from the new structure.

**Current state:**
- `profileSchema` in `shared/schemas.ts`: flat nullable text fields — `name`, `email`, `phone`, `location`, `linkedinUrl`, `githubUrl`, `summary`, `experience` (free text), `skills` (free text), `education` (free text).
- `profile` DB table: one row per user, individual text columns matching the schema.
- `profile-resume.tsx`: single edit/view toggle page — one "Edit" button opens all fields as inputs/textareas; "Save" PUT the whole record.
- Downstream services (`analysis-service.ts`, `cover-letter-service.ts`, `resume-service.ts`, `discovery-service.ts`) read flat columns directly from the DB row.

**Target state:**
- New `profileDataSchema` with `personal` and `experience` sub-objects stored as a single JSON text column (`profile_data`) in the `profile` table.
- Profile page rebuilt as a schema-driven form: always-editable personal section + six collapsible experience sections, each with Add Entry and Delete entry controls.
- All downstream consumers updated to construct their context strings from the new structured shape.
- Old flat columns remain in the DB until Story 43.5 removes them.

---

## Requirements Inventory

### Functional Requirements

FR1: Define a new `profileDataSchema` Zod type in `shared/schemas.ts` with the exact shape specified: `personal.{ fullName, email, phone?, location?, summary?, websites[{label,url}] }` and `experience.{ jobs[], education[], projects[], certifications[], licences[], awards[] }` with per-section field definitions.

FR2: Add a `profile_data TEXT` column to the `profile` DB table via a Drizzle migration. The migration must populate `profile_data` from existing flat columns where a mapping exists (name → personal.fullName, email → personal.email, phone, location, summary → personal.summary; linkedinUrl → website entry labelled "LinkedIn" if non-null; githubUrl → website entry labelled "GitHub" if non-null). Experience arrays default to empty.

FR3: Update `api-profile.ts` GET and PUT to read/write the `profile_data` column using the new schema. GET returns the structured object (defaulting to an empty-but-valid profile if the row does not exist). PUT accepts and validates the new structure.

FR4: Update `useProfileQuery` and `useProfileMutation` TypeScript types to use the new `ProfileData` / `ProfileDataInput` types.

FR5: Replace `profile-resume.tsx` with a new schema-driven page. The Personal section renders fullName, email, phone (optional), location (optional), and summary (optional, multi-line) as editable fields with an explicit "Save" button. Fields are pre-populated from the profile query into local draft state; the Save button commits the draft via the profile mutation.

FR6: The Personal section includes a repeatable Websites sub-section: a list of existing `{label, url}` entries each with a trash-icon delete button, plus an "Add Website" button that appends an inline form row (label field + URL field + confirm add).

FR7: Each key under `experience` (jobs, education, projects, certifications, licences, awards) renders as a collapsible/grouped section with a section header and an "Add Entry" button that opens an inline form (or slide-in form) pre-populated with empty fields for that entry type.

FR8: On "Save Entry", the new entry is appended to the relevant array and persisted to the profile store via the profile API PUT.

FR9: Each existing entry in any experience section shows a trash-icon delete button. Clicking it removes the entry and persists the updated array. A confirmation may be shown for entries that have meaningful content (e.g., jobs with multiple bullets).

FR10: Field definitions per section:
  - **jobs**: title (req), company (req), startDate (YYYY-MM, req), endDate (YYYY-MM, nullable), current (boolean toggle, defaults false), employmentType (optional string), bullets (repeatable string list — add/remove individual bullets inline).
  - **education**: name (req), school (req), current (boolean toggle), degrees (repeatable sub-entries each: degreeType, degreeSubject, graduationDate YYYY-MM nullable).
  - **projects**: name (req), description (req).
  - **certifications**: name (req), issuer (req), year (YYYY, req).
  - **licences**: name (req), issuer (req), year (YYYY, req).
  - **awards**: name (req), issuer (req), year (YYYY, req).

FR11: All saves and deletes persist via the existing `PUT /api/profile` endpoint with the full updated profile object (replace-on-write semantics).

FR12: Update `analysis-service.ts` to construct `profileJson` from the new `profileData` structure — serialise `personal.*` fields plus a flattened representation of `experience.jobs`, `education`, `projects`, `certifications` as human-readable text/JSON for the LLM.

FR13: Update `cover-letter-service.ts` to construct `profileText` and the `buildCoverLetterHtml` header from the new schema (personal.fullName for name, personal.email/phone/location, first website URL for website/linkedin fallback).

FR14: Update `resume-service.ts` to construct `profileText` from the new schema so the LLM prompt receives the same quality of context as before.

FR15: Update `discovery-service.ts` resumeText construction for the embedding path: build a text representation from `experience.jobs` bullets + titles + companies, replacing the old `summary + experience + skills` text blob.

FR16: Remove the old flat text columns (`name`, `email`, `phone`, `location`, `linkedinUrl`, `githubUrl`, `summary`, `experience`, `skills`, `education`) from the `profile` DB table and Drizzle schema in Story 43.5, after all consumers are updated.

### Non-Functional Requirements

NFR1: The new `profileDataSchema` is the single source of truth for the profile shape — `api-profile.ts`, all client hooks, and all server-side consumers must import from `shared/schemas.ts`.

NFR2: The DB migration is additive-first (add column, populate) before destructive (drop columns in Story 43.5) — no data loss on deploy.

NFR3: All profile API reads must return a valid (possibly empty) `ProfileData` object even when the user has not yet saved structured data.

NFR4: No change to the resume PDF generation output format — `resumeDataSchema` (`ResumeData`) and the Sage template remain unchanged. Only the profileText context string passed to the LLM changes.

NFR5: The profile form does not introduce a global "Edit" toggle — sections should be individually editable (or the personal section always inline-editable). This avoids the current UX where a single large textarea is the only interface.

### Additional Requirements (Technical Constraints)

- App stack: TypeScript/Bun, Drizzle ORM, SQLite, Hono server, React + TanStack Query on the client.
- SQLite JSON storage: `profile_data` column is `text('profile_data')` in the Drizzle schema; parse/serialise as JSON in the API route.
- The `PUT /api/profile` route uses upsert (`onConflictDoUpdate` on `userId`) — this contract does not change, only the payload shape.
- Stories 43.1–43.4 may leave downstream services temporarily reading from old flat columns (which still exist). Story 43.5 is the cutover: old columns are dropped only after all consumers are updated.
- `buildCoverLetterHtml` in `cover-letter-service.ts` uses `p?.name`, `p?.email`, `p?.phone`, `p?.location` directly from the DB row — Story 43.5 must update this to read from the new `profileData` object parsed from `profile_data`.

### UX Design Requirements

UX-DR1: All sections use an explicit "Save" button — no auto-save, no global edit/view toggle. Each section manages its own local draft state independently; saving one section does not require other sections to be valid. This is consistent with the rest of the Config area.

UX-DR2: Each experience section (Jobs, Education, Projects, Certifications, Licences, Awards) is collapsible — collapsed by default when empty, expanded when it has entries.

UX-DR3: The "Add Entry" button in each section opens a **Sheet** panel (slide-in from the right, consistent with the existing `AddJobDrawer` pattern). The Sheet has a "Save" and a "Cancel" action. Saving appends the entry and closes the Sheet. This is preferred over an inline form because experience entries (especially Jobs) have enough fields that an inline form would be cramped in the Config layout.

UX-DR4: Existing entries render as compact summary cards (e.g., job: "Company — Title (StartDate – EndDate)") with a trash icon on the right. Clicking the summary card (or an expand chevron) opens an inline edit form for that entry.

UX-DR5: The bullets field in the Jobs form renders as a list with each bullet on its own row with a trash icon, plus an "Add Bullet" button that appends a new empty input row.

UX-DR6: The degrees sub-entries in the Education form follow the same pattern as bullets — a list of degree rows each with remove, plus "Add Degree" button.

### FR Coverage Map

| FR    | Story   |
|-------|---------|
| FR1   | 43.1    |
| FR2   | 43.1    |
| FR3   | 43.1    |
| FR4   | 43.1    |
| FR5   | 43.2    |
| FR6   | 43.2    |
| FR7   | 43.3    |
| FR8   | 43.3    |
| FR9   | 43.3    |
| FR10 (jobs, education) | 43.3 |
| FR10 (projects, certs, licences, awards) | 43.4 |
| FR11  | 43.2, 43.3, 43.4 |
| FR12  | 43.5    |
| FR13  | 43.5    |
| FR14  | 43.5    |
| FR15  | 43.5    |
| FR16  | 43.5    |
| NFR1  | 43.1    |
| NFR2  | 43.1    |
| NFR3  | 43.1    |
| NFR4  | 43.5    |
| NFR5  | 43.2    |

---

## Epic 43: Profile Schema Redesign & Form UI

**Epic Goal:** Replace the current freetext profile page with a schema-driven form, migrate the DB and API to a structured JSON profile shape, and update all downstream LLM consumers to read from the new structure — with no change to the resume PDF output.

**Epic Sequence Rationale:**
1. Story 43.1 — Schema + DB + API foundation. Defines the Zod types, adds the DB column, and wires the API. No UI changes.
2. Story 43.2 — Personal section form UI. Establishes the new page skeleton and the always-editable personal fields + repeatable websites.
3. Story 43.3 — Complex experience sections UI: Jobs and Education (both have nested repeaters — bullets and degrees sub-entries).
4. Story 43.4 — Simple experience sections UI: Projects, Certifications, Licences, Awards (flat entry forms).
5. Story 43.5 — Downstream consumers + column cleanup: update analysis, cover letter, resume, discovery services to use the new schema; drop the old flat columns.

---

### Story 43.1: Profile Schema, DB Migration & API Layer

As a developer,
I want the new structured `ProfileData` schema defined in `shared/schemas.ts`, persisted via a new `profile_data` JSON column, and exposed through the existing `GET/PUT /api/profile` endpoints,
So that the new UI and updated consumers have a single authoritative type contract to build against.

**Context:**
The current `profileSchema` (lines 176–193 in `shared/schemas.ts`) is a flat Zod object with nullable text fields. The `profile` DB table has individual text columns (`name`, `email`, `phone`, `location`, `linkedinUrl`, `githubUrl`, `summary`, `experience`, `skills`, `education`). This story adds the new schema without breaking existing consumers — old columns remain intact, new `profile_data` column is added alongside them. Consumers continue to read old columns until Story 43.5.

**New schema shape (from epic input):**
```typescript
// personal
{ fullName: string, email: string, phone: string | null, location: string | null,
  summary: string | null,
  websites: Array<{ label: string, url: string }> }

// experience
{
  jobs: Array<{ title, company, startDate, endDate: null, current: boolean,
    employmentType?: string, bullets: string[] }>,
  education: Array<{ name, school, current: boolean,
    degrees: Array<{ degreeType, degreeSubject, graduationDate: null }> }>,
  projects: Array<{ name, description }>,
  certifications: Array<{ name, issuer, year }>,
  licences: Array<{ name, issuer, year }>,
  awards: Array<{ name, issuer, year }>,
}
```

**Acceptance Criteria:**

**Given** `shared/schemas.ts` is updated
**When** the file is compiled
**Then** new exported types exist: `ProfileData`, `ProfileDataInput`, `profileDataSchema`, `profileDataInputSchema`
**And** `ProfileData` has `personal: { fullName: string, email: string, phone: string | null, location: string | null, summary: string | null, websites: Array<{ label: string, url: string }> }` and `experience: { jobs, education, projects, certifications, licences, awards }` with array types per the epic schema
**And** `ProfileData` is an exported type alias; `ProfileInput` / `Profile` (old flat schema) remain exported and unchanged to avoid breaking existing TS consumers before Story 43.5

**Given** the Drizzle migration runs
**When** the migration is applied to an existing database
**Then** a `profile_data TEXT` column is added to the `profile` table
**And** for each existing row, `profile_data` is populated as valid JSON with `personal.fullName` = existing `name` (or `""`), `personal.email` = existing `email` (or `""`), `personal.phone` = existing `phone`, `personal.location` = existing `location`, `personal.summary` = existing `summary`
**And** if `linkedinUrl` is non-null, a website entry `{ label: "LinkedIn", url: linkedinUrl }` is added to `personal.websites`
**And** if `githubUrl` is non-null, a website entry `{ label: "GitHub", url: githubUrl }` is added to `personal.websites`
**And** all `experience` arrays default to empty
**And** all existing columns remain intact (migration is additive-only)

**Given** a `GET /api/profile` request
**When** the user has no profile row
**Then** the response is `200 { personal: { fullName: "", email: "", phone: null, location: null, websites: [] }, experience: { jobs: [], education: [], projects: [], certifications: [], licences: [], awards: [] } }`

**Given** a `GET /api/profile` request
**When** the user has a profile row with `profile_data` populated
**Then** the response is the parsed `ProfileData` JSON from the `profile_data` column
**And** the response validates against `profileDataSchema`

**Given** a `PUT /api/profile` request with a valid `ProfileDataInput` body
**When** the request is processed
**Then** the `profile_data` column is upserted with the serialised JSON
**And** the response is the updated `ProfileData` object
**And** the old flat columns (`name`, `email`, etc.) are NOT updated (they stay as-is for backward compat)

**Given** a `PUT /api/profile` request with an invalid body (e.g., missing `personal.email`)
**When** the request is processed
**Then** a `400` response is returned with a descriptive error

**Given** `useProfileQuery.ts` and `useProfileMutation.ts`
**When** Story 43.1 is complete
**Then** both hooks import from `ProfileData` / `ProfileDataInput` types
**And** `useProfileQuery` returns `ProfileData | undefined`
**And** `useProfileMutation` accepts `ProfileDataInput`

---

### Story 43.2: Profile Form UI — Personal Section

As a user,
I want to edit my personal contact details (name, email, phone, location) and manage a list of website links directly on the Profile page,
So that my contact info is always easy to update without a global "edit mode" toggle.

**Context:**
The current `profile-resume.tsx` renders all fields behind a single "Edit" button toggle. This story replaces that page with the new schema-driven layout. Only the Personal section is implemented here; the six Experience sections (Jobs, Education, Projects, etc.) will be added in Stories 43.3 and 43.4. At this point the experience sections can be rendered as empty placeholders with their headers.

**Acceptance Criteria:**

**Given** the user navigates to Config > Candidate Info (the Profile/Resume page)
**When** the page loads
**Then** a "Personal" section is visible with editable fields: Full Name, Email, Phone (optional), Location (optional), Summary (optional, multi-line textarea)
**And** the fields are pre-populated from `useProfileQuery` data (the new `ProfileData` shape) into local draft state
**And** a "Save" button is present in the Personal section header area
**And** there is no page-level "Edit" button or global edit/view toggle — all fields are always editable

**Given** the Personal section
**When** the user modifies any field and clicks "Save"
**Then** `useProfileMutation` is called with the full current `ProfileData` object (personal section updated, experience arrays pass through unchanged from the last fetched value)
**And** a success toast is shown on save
**And** the local draft state is updated to reflect the saved values
**And** unsaved changes are not lost on navigation within the page (draft state is section-local)

**Given** the Personal section
**When** there are existing website entries in `personal.websites`
**Then** each entry is rendered as a row showing its label and URL with a trash-icon delete button on the right

**Given** the Personal section
**When** the user clicks "Add Website"
**Then** an inline form row appears with a Label field and a URL field plus "Add" and "Cancel" buttons
**And** clicking "Add" appends the new `{ label, url }` entry to the websites list and persists via the profile mutation
**And** clicking "Cancel" dismisses the inline form without saving

**Given** an existing website entry
**When** the user clicks the trash icon
**Then** the entry is removed from the list and the updated profile is persisted immediately

**Given** the six experience sections (Jobs, Education, Projects, Certifications, Licences, Awards)
**When** Story 43.2 is complete
**Then** each section header is visible as a collapsible panel (can start collapsed)
**And** each section shows "No entries yet" or a disabled "Add Entry" placeholder (fully functional Add Entry is implemented in Stories 43.3 and 43.4)

---

### Story 43.3: Profile Form UI — Jobs & Education Sections

As a user,
I want to add, view, and delete my work history (Jobs) and academic credentials (Education) as structured entries with proper date fields, toggles, and nested sub-entries,
So that my employment and education history is stored in a way the AI can reason about rather than as a freetext blob.

**Context:**
Jobs and Education are the most structurally complex sections: Jobs has a repeatable `bullets` list; Education has a repeatable `degrees` sub-entry list. Both share the common Add Entry / inline form / Delete pattern established by Story 43.2 for websites.

**Acceptance Criteria:**

**Given** the Jobs section
**When** it has no entries
**Then** it shows a collapsed section header with "(0)" count and an "Add Job" button

**Given** the user clicks "Add Job"
**When** the inline form appears
**Then** it contains: Title (text, required), Company (text, required), Start Date (YYYY-MM text or month picker), End Date (YYYY-MM, nullable), Current (boolean toggle — when enabled, End Date is disabled/cleared), Employment Type (optional free text), and a Bullets list
**And** the Bullets list starts with one empty bullet input row
**And** each bullet row has a trash icon; clicking it removes that bullet
**And** an "Add Bullet" button appends a new empty bullet input row
**And** "Save Job" validates required fields (Title, Company, Start Date), appends the entry to `experience.jobs`, and persists via the profile mutation
**And** "Cancel" dismisses the form without saving

**Given** an existing job entry in the list
**When** it is rendered in collapsed/summary mode
**Then** it shows: "Company — Title (StartDate – EndDate or Present)" with a trash icon on the right and an expand chevron
**And** clicking the summary (or chevron) expands the entry to its inline edit form for modification
**And** clicking "Save" on the edit form updates the entry in-place and persists

**Given** an existing job entry
**When** the user clicks the trash icon
**Then** the entry is removed from `experience.jobs` and the profile is persisted immediately (no additional confirmation needed for entries with ≤1 bullet; a browser-level confirm or inline prompt for entries with ≥2 bullets)

**Given** the Education section
**When** the user clicks "Add Education"
**Then** the inline form contains: Name / Program Name (req), School (req), Current (boolean toggle), and a Degrees list
**And** the Degrees list starts empty with an "Add Degree" button
**And** each degree row has: Degree Type (text), Degree Subject (text), Graduation Date (YYYY-MM, nullable — disabled if parent Current toggle is on), and a trash icon
**And** "Save Education" validates required fields (Name, School), appends to `experience.education`, and persists

**Given** an existing education entry
**When** rendered in summary mode
**Then** it shows: "School — Name (degree count)" with a trash icon and expand chevron, mirroring the Jobs pattern

**Given** all Jobs and Education CRUD operations
**When** any save or delete completes
**Then** section entry counts in the section header update to reflect the new total
**And** a success toast is shown (or silently updates if within 500ms of another save)

---

### Story 43.4: Profile Form UI — Projects, Certifications, Licences & Awards

As a user,
I want to record my notable projects, certifications, licences, and awards as structured entries,
So that the AI can reference them by name, issuer, and year without having to parse freetext blocks.

**Context:**
Projects, Certifications, Licences, and Awards are simpler than Jobs/Education — each has 2–3 flat fields and no nested repeaters. They follow the same Add Entry / inline form / Delete pattern but with a lighter form.

**Acceptance Criteria:**

**Given** the Projects section
**When** the user clicks "Add Project"
**Then** the inline form contains: Name (req, text), Description (req, textarea or multi-line text)
**And** "Save Project" validates both fields, appends to `experience.projects`, and persists

**Given** the Certifications section
**When** the user clicks "Add Certification"
**Then** the inline form contains: Name (req), Issuer (req), Year (req, 4-digit YYYY text input)
**And** "Save Certification" validates all three fields and persists

**Given** the Licences section
**When** the user clicks "Add Licence"
**Then** the inline form contains: Name (req), Issuer (req), Year (req, YYYY)
**And** "Save Licence" validates and persists — section behaves identically to Certifications

**Given** the Awards section
**When** the user clicks "Add Award"
**Then** the inline form contains: Name (req), Issuer (req), Year (req, YYYY)
**And** "Save Award" validates and persists

**Given** any entry in Projects, Certifications, Licences, or Awards
**When** rendered in the list
**Then** it shows a one-line summary (Name — Issuer, Year) with a trash icon
**And** clicking the trash icon removes the entry and persists immediately

**Given** all four sections
**When** all CRUD operations complete
**Then** section counts update in headers
**And** all six experience sections (Jobs, Education, Projects, Certifications, Licences, Awards) are fully functional on the Profile page

**Given** the complete Profile page after Stories 43.2–43.4
**When** a user fills in all sections and refreshes the page
**Then** all data is correctly re-loaded from the API and displayed

---

### Story 43.5: Update Downstream Consumers & Drop Old Columns

As a developer,
I want the analysis, cover letter, resume, and discovery services updated to consume the new `ProfileData` shape, and the old flat text columns removed from the DB,
So that the system has a single, coherent profile schema and no dead columns.

**Context:**
Stories 43.1–43.4 added the new `profile_data` column and UI, but the server-side services still read the old flat columns (`profileRow.name`, `profileRow.experience`, etc.). This story replaces all those reads with reads from the new structured shape, then drops the old columns in a final migration. No change is made to the resume PDF output format — `ResumeData` and the Sage template are untouched.

**Acceptance Criteria:**

**Given** `analysis-service.ts`
**When** the service builds `profileJson` for the LLM prompt
**Then** it reads `profile_data` from the DB row and parses it as `ProfileData`
**And** `candidateName` is `profileData.personal.fullName || 'a candidate'`
**And** `profileJson` is a JSON object with: Name, Email, Phone, Location, Summary (from `personal.*`), Websites (from `personal.websites` — array of `{label, url}`), Jobs (from `experience.jobs` — full array), Education (from `experience.education`), Projects (from `experience.projects`), Certifications (from `experience.certifications`), Licences (from `experience.licences`), Awards (from `experience.awards`)
**And** no reference to `profileRow.experience`, `profileRow.skills`, `profileRow.summary`, `profileRow.linkedinUrl`, or `profileRow.githubUrl` remains

**Given** `cover-letter-service.ts`
**When** the service builds `profileText` for the LLM system prompt
**Then** it reads `profile_data` from the DB row and parses it as `ProfileData`
**And** `profileText` includes: Name (personal.fullName), Email, Phone, Location, Summary (personal.summary), Websites (formatted as "Label: URL" lines), Jobs (company/title/dates/bullets), Projects, Education
**And** `buildCoverLetterHtml` uses `personal.fullName` for the header name and `[personal.email, personal.phone, personal.location].filter(Boolean).join(' · ')` for the contact line

**Given** `resume-service.ts`
**When** the service builds `profileText` for the LLM system prompt
**Then** it reads and parses `profile_data` as `ProfileData`
**And** `profileText` includes the same rich structured representation as the cover letter service (name, contact, summary, websites, jobs with bullets, education with degrees, projects, certifications/licences/awards)
**And** `resumeDataSchema` / `ResumeData` and the Sage template are NOT modified

**Given** `discovery-service.ts` (lines 275–301 — resume embedding path)
**When** it builds `resumeText` for the embedding
**Then** it reads `profile_data` from the DB row and parses it as `ProfileData`
**And** `resumeText` is constructed from: `experience.jobs` (each job: title + company + bullets joined), `experience.projects` (name + description), and any freetext-rich fields available
**And** the `hashText` input changes with the new text construction — the existing `user_embeddings` cache will naturally miss and recompute on next discovery run (this is correct behaviour)

**Given** the column-drop migration runs
**When** applied after all consumers are updated
**Then** the `profile` table no longer has columns: `name`, `email`, `phone`, `location`, `linkedin_url`, `github_url`, `summary`, `experience`, `skills`, `education`
**And** the Drizzle schema for `profile` in `db/schema.ts` is updated to remove those column definitions
**And** `profileSchema` / `profileInputSchema` (the old flat Zod types) are removed from `shared/schemas.ts`
**And** the `Profile` and `ProfileInput` type aliases now point to `ProfileData` and `ProfileDataInput` respectively (or are removed entirely if no remaining references)

**Given** the full test suite after all five stories
**When** `bun test` runs
**Then** all profile-related tests pass (`api-profile.test.ts`, `analysis-service.test.ts`, `cover-letter-service.test.ts`, `resume-service.test.ts`)
**And** no TypeScript build errors remain
**And** no references to the removed old flat columns exist in the codebase

---

## Epic 43 Story Sequence Summary

| Story | Title | Dependency |
|-------|-------|------------|
| 43.1  | Profile Schema, DB Migration & API Layer | None — do first |
| 43.2  | Profile Form UI — Personal Section | 43.1 (new schema + API must exist) |
| 43.3  | Profile Form UI — Jobs & Education Sections | 43.2 (page skeleton established) |
| 43.4  | Profile Form UI — Projects, Certifications, Licences & Awards | 43.2 (page skeleton), 43.3 can be parallel |
| 43.5  | Update Downstream Consumers & Drop Old Columns | 43.1–43.4 all complete |

## Flagged Risks

**RISK-1 — Embedding cache invalidation:** Changing `resumeText` construction in `discovery-service.ts` will always miss the embedding cache on the first post-deploy discovery run, causing one recomputation per user. This is expected and harmless.

**RISK-2 — LLM prompt quality regression:** The analysis and cover letter prompts currently receive a flat text blob for `experience`/`skills`. After Story 43.5 they receive a structured JSON representation. The AI output quality may change (likely improve, but should be smoke-tested on a sample job).

**RISK-3 — Partial data loss on migration:** The old `summary` field migrates cleanly to `personal.summary`. However, `experience`/`skills`/`education` free-text blobs have no structural equivalent in the new schema and are not migrated — users will need to re-enter that content as structured entries via the new UI. Consider surfacing a one-time notice on the Profile page after the migration ships.

**RISK-4 — Cover letter PDF header:** `buildCoverLetterHtml` in `cover-letter-service.ts` currently takes the whole `profile.$inferSelect` row as `p` and reads `p?.name` etc. directly. After Story 43.5 this must be refactored to accept a `ProfileData` object — a small but easy-to-miss change.
