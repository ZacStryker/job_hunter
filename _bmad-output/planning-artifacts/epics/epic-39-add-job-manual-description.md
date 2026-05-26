# Epic 39: Add Job with Manual Description

Users can add a job to the pipeline with a pasted job description — either alongside a URL or with no URL at all. When a description is pre-populated at creation time, the analysis flow uses it directly and skips the scraper, delivering accurate AI analysis for jobs from any source without scraper dependency.

**Source:** User request 2026-05-26
**Priority:** Medium — UX and reliability improvement; no DB migration required

---

## Story 39.1: Add Job Form & API — Accept Optional Job Description

As a user adding a job manually,
I want to optionally paste the job description directly into the Add Job form,
So that I can add jobs from any source (not just scraped platforms) and still get full AI analysis.

**Acceptance Criteria:**

**Given** the Add Job form is open
**When** the user inspects the form fields
**Then** a "Job Description" textarea is visible below the URL field

**Given** the user has entered Company, Job Title, and a URL (but no description)
**When** the form's submit button is evaluated
**Then** the button is enabled (URL alone satisfies the validation requirement)

**Given** the user has entered Company, Job Title, and a description (but no URL)
**When** the form's submit button is evaluated
**Then** the button is enabled (description alone satisfies the validation requirement)

**Given** the user has entered Company and Job Title but neither a URL nor a description
**When** the form's submit button is evaluated
**Then** the button remains disabled

**Given** the user submits the form with a description provided
**When** the job is created
**Then** `POST /api/jobs` accepts the payload with `description` present and `sourceUrl` absent

**Given** the user submits the form with both URL and description
**When** the job is created
**Then** both are accepted and the description is stored as `jobDescription`

**Given** `POST /api/jobs` receives a payload missing both `sourceUrl` and `description`
**When** the server validates the request
**Then** a `400` response is returned with `{ error: "..." }`

**Given** a job is created with a manually-pasted description
**When** the job record is inserted into the database
**Then** `jobDescription` is populated with the user-provided text and `analysisStatus` is `'pending'`

> **Dev note:** Files to change:
>
> - **`src/server/routes/api-jobs.ts`** — update `manualJobSchema` (line 186): change `sourceUrl: z.string().url()` to `sourceUrl: z.string().url().optional()`, add `description: z.string().min(1).optional()`. Add `.refine(d => !!(d.sourceUrl || d.description), { message: 'sourceUrl or description is required' })`. In the insert `.values()` block, add `jobDescription: description?.trim() || null`.
>
> - **`src/client/hooks/useAddJobMutation.ts`** — add `description?: string | null` to `AddJobInput`. Pass it in the JSON body.
>
> - **`src/client/components/pipeline/AddJobDrawer.tsx`** — add `const [description, setDescription] = useState('')`. Add a `<textarea>` field labelled "Job Description (optional if URL provided)". Update `isValid`: `company.trim().length > 0 && jobTitle.trim().length > 0 && (url.trim().length > 0 || description.trim().length > 0)`. Pass `description: description.trim() || null` in `mutation.mutate(...)`.
>
> - **`src/server/routes/api-jobs.test.ts`** — add test cases: POST with description only (200/201), POST with neither URL nor description (400), POST with both URL and description (stores `jobDescription`).

---

## Story 39.2: Analysis — Use Pre-Stored Description, Skip Scraper

As the system running AI analysis on a pending job,
I want to detect when a job description was already provided at creation time,
So that the scraper step is skipped and the existing description is used directly for analysis.

**Acceptance Criteria:**

**Given** a job was added manually with `jobDescription` already populated
**When** the analysis service processes that job
**Then** no request is made to the scraper service for that job

**Given** a job was added with both a `sourceUrl` and a `jobDescription`
**When** the analysis service processes that job
**Then** the pre-stored `jobDescription` is used directly and no scraper call is made

**Given** a job was added with only a `sourceUrl` and no `jobDescription`
**When** the analysis service processes that job
**Then** the scraper is called as normal (existing behavior unchanged)

**Given** a job with a pre-stored description is analyzed
**When** the Anthropic API call completes
**Then** the `jobDescription` field in the database retains the user's original value (not overwritten with empty string)

**Given** a manual job with no URL and no description
**When** the analysis service processes it
**Then** description is empty string and the scraper block is skipped gracefully (existing behavior)

> **Dev note:** One targeted change in **`src/server/services/analysis-service.ts`**, inside the per-job loop at line 87.
>
> Replace:
> ```ts
> let description = ''
> if (scraperUrl && job.sourceUrl) {
>   // ...scraper fetch block
> }
> ```
> With:
> ```ts
> let description = job.jobDescription ?? ''
> if (!description && scraperUrl && job.sourceUrl) {
>   // ...scraper fetch block unchanged
> }
> ```
> If `jobDescription` is already populated, `description` is truthy and the scraper block is never entered. The rest of the function — Anthropic call and DB update — is untouched. The existing `jobDescription: description || null` in the DB `.set({...})` already preserves the value correctly.
>
> Update **`src/server/services/analysis-service.test.ts`** — add test: job with pre-populated `jobDescription` should not invoke the scraper mock; the stored description should be passed through to the Anthropic mock as the `Description` field in `jobJson`.
