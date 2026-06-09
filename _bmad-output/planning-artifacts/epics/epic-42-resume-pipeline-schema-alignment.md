---
stepsCompleted: ["step-01", "step-02", "step-03", "step-04"]
inputDocuments:
  - "Epic Input: Resume Generation Pipeline (Schema + Prompt + Template Alignment) (provided inline)"
  - "job-hunt-dashboard/src/server/services/resume-service.ts"
  - "job-hunt-dashboard/src/server/services/prompt-defaults.ts"
  - "job-hunt-dashboard/src/db/schema.ts"
  - "resume_json_prompt"
  - "resume_templates/resume_template_sage.html"
---

# Epic 42: Resume Pipeline — Schema + Prompt + Template Alignment

## Overview

Brownfield enhancement to replace the app's existing HTML-generation resume pipeline with
a three-component canonical contract: flat JSON schema, rewritten LLM prompt, and the
Sage HTML template. All three components must conform to the same canonical flat JSON
schema and must remain provably aligned.

**Current state:** `resume-service.ts` calls Anthropic with a prompt asking for raw HTML
(`prompt-defaults.ts`: "Return ONLY valid HTML"), passes the HTML to Playwright for PDF.
The `resume_json_prompt` file in the repo root is a standalone alternate prompt with a
nested/numbered JSON schema — it is NOT currently wired into the app.
The Sage template (`resume_templates/resume_template_sage.html`) is already built and
reads JSON from `<script id="resume-data" type="application/json">`.
No resume JSON is stored in the database; PDFs live in `data/resumes/`.
The only migration risk is custom prompt overrides stored in the `prompts` table.

---

## Requirements Inventory

### Functional Requirements

FR1: Define a canonical flat JSON schema as a single machine-checkable artifact (JSON Schema file) plus a prose-rules companion, covering all top-level keys and array shapes specified in the epic input.
FR2: The canonical schema must enforce all structural constraints: `title_02` contains no "and"/"&"; "/" in skill entries only when one is a direct subset/implementation/prerequisite of the other; arrays may be empty to omit optional sections.
FR3: Rewrite the LLM resume prompt to emit the canonical flat schema directly — not nested/numbered — with all existing hard rules preserved and re-expressed against the flat shape.
FR4: The rewritten prompt must enforce: no invented content, most-recent-first ordering for experience, char/length guidance per field, title and "/" rules.
FR5: Migrate the app's resume service (`resume-service.ts`) from HTML-direct-generation to JSON-generation: call LLM → get JSON → validate → inject into template → Playwright PDF.
FR6: Add a validation layer that checks raw LLM output against the canonical schema before rendering; the validator must catch: missing required fields, wrong types, `title_02` containing "and"/"&", and disallowed "/" pairings.
FR7: Validation failures must be handled deterministically with a defined, user-visible failure mode (reject-and-surface-error or reject-and-retry — decision required; see decisions section).
FR8: Inject validated JSON into the `<script id="resume-data" type="application/json">` blob in the Sage template and render via Playwright with `printBackground: true` and `preferCSSPageSize: true`.
FR9: Rendering must wait on `window.__paginationComplete` before capturing the PDF.
FR10: Empty arrays for optional sections (`skill_groups`, `education`, `projects`) must be handled cleanly through the full path (no template render errors, no empty section dividers).
FR11: Tests proving the full path — prompt output → validation → template render → PDF — for both one-page and two-page content volumes.
FR12: A contract/drift test that ties all three components (schema file, prompt, template expectations) together and fails if they diverge.
FR13: Any custom resume prompt currently stored in the `prompts` table must be handled on migration — either cleared automatically (with a migration note) or preserved with a schema-version marker so the user is notified that it no longer applies.

### Non-Functional Requirements

NFR1: The canonical schema file is the single source of truth; both the prompt and the app service must reference it — no duplicated schema definitions.
NFR2: The LLM prompt emits JSON that validates against the canonical schema with no transform layer required before injection into the template.
NFR3: PDF generation correctness is deterministic for a given JSON input; flaky font-load behavior in Playwright must not silently produce wrong pagination (flag: font-load reliability is a separate hardening risk, surfaced in risks section).
NFR4: The contract/drift test must be CI-runnable without a live Anthropic API key (use fixture JSON, not a live LLM call).
NFR5: Validation is fast (synchronous JSON Schema check + rule checks); no network calls in the validation step.

### Additional Requirements (Technical Constraints — do not re-litigate)

- Canonical schema is the flat shape; prompt and app conform to it.
- The Sage template (`resume_templates/resume_template_sage.html`) is already built and verified; this epic consumes it, does not rebuild it.
- PDF generation is Playwright/Chromium with `printBackground: true` and `preferCSSPageSize: true`.
- Rendering must wait on `window.__paginationComplete` before export.
- Pagination, section placement, and page-break logic live entirely in the template; the app does not manage layout.
- The app stack is TypeScript/Bun, Drizzle ORM, SQLite, Hono server.
- The generate-pdf service (`generate-pdf.ts`) already wraps Playwright; this epic can extend or replace it.

### UX Design Requirements

N/A — no new UI surfaces in this epic. All changes are in the server-side pipeline.

### Decisions to Resolve Before or During Implementation

**D1 — Schema file location:** Where does the canonical JSON Schema file live?
  Options: (a) `job-hunt-dashboard/src/shared/resume-schema.json` (in-repo, referenced by both service and test); (b) `resume_templates/resume-schema.json` (alongside the template artifacts).
  *Recommendation: (a) — lives in `src/shared/` so it can be imported by TypeScript service code without path gymnastics.*

**D2 — Validation strictness:** Reject-and-surface-error vs. reject-and-retry on malformed LLM output?
  Options: (a) Reject immediately, surface a user-visible error (simple, predictable); (b) Retry once with a correction prompt (better UX, more complex).
  *Recommendation: (a) for this epic — retry logic can be added later. Keeps the validation layer simple and deterministic.*

**D3 — Custom prompt migration:** What happens to a user-stored custom resume prompt in the `prompts` table when this epic ships?
  Options: (a) Clear it automatically in a DB migration (breaking, but the old prompt now emits the wrong schema anyway); (b) Leave it in place but add a version field and a UI warning; (c) Log a startup warning only.
  *Recommendation: (a) — the old prompt is broken by definition after this epic; clearing it is correct and honest.*

**D4 — Font-load reliability in Playwright:** The Sage template loads fonts over the network (Google Fonts). Slow font loads can affect pagination measurement.
  *Decision: Flag as a separate hardening risk. This epic assumes a reliable network font load (consistent with current generate-pdf behavior). If font reliability causes flaky tests in CI, add a font-mock or local font fallback as a follow-up epic.*

### FR Coverage Map

| FR   | Epic 42 Story |
|------|---------------|
| FR1  | 42.1          |
| FR2  | 42.1          |
| FR3  | 42.2          |
| FR4  | 42.2          |
| FR5  | 42.3          |
| FR6  | 42.3          |
| FR7  | 42.3          |
| FR8  | 42.3          |
| FR9  | 42.3          |
| FR10 | 42.4          |
| FR11 | 42.4          |
| FR12 | 42.4          |
| FR13 | 42.3          |
| NFR1 | 42.1          |
| NFR2 | 42.2          |
| NFR3 | 42.4          |
| NFR4 | 42.4          |
| NFR5 | 42.3          |

---

## Epic 42: Resume Pipeline — Schema + Prompt + Template Alignment

**Epic Goal:** Replace the current HTML-direct-generation resume pipeline with a canonical-JSON pipeline: define the flat schema as a single source of truth, rewrite the LLM prompt to emit it, add a validation layer, wire the app to inject validated JSON into the Sage template, and render to PDF via Playwright — with a contract test ensuring the three components cannot drift.

**Epic Sequence Rationale:**
1. Story 42.1 — Define the canonical schema first. Nothing else can be built without it.
2. Story 42.2 — Rewrite the prompt. The prompt must target the canonical schema, so the schema must exist.
3. Story 42.3 — Migrate the service. Swap the service from HTML-mode to JSON-mode, add validation, wire the template injection and Playwright render.
4. Story 42.4 — E2E + contract tests. Prove the full path works for one-page and two-page cases; add the drift guard.

---

### Story 42.1: Define Canonical Resume JSON Schema

As a developer,
I want a single machine-checkable JSON Schema artifact that defines the canonical flat resume structure,
So that the LLM prompt and the application service both have a shared, authoritative contract that can be validated against programmatically.

**Context:**
The Sage template (`resume_templates/resume_template_sage.html`) already reads from `<script id="resume-data">` and expects the flat shape defined in the epic input. This story creates the schema artifact and prose rules that make that shape explicit and machine-verifiable. It does NOT change any running code.

**Schema top-level shape (from epic input):**
```
{
  first_name, last_name, title_01, title_02,
  email, website, linkedin, location, summary,
  skill_groups[]: { label, skills[] },
  education[]:    { school, degree, year },
  projects[]:     { name, desc, stack },   // stack = " · "-separated string
  experience[]:   { company, location, dates, role, bullets[] }
}
```

**Acceptance Criteria:**

**Given** the canonical schema file does not yet exist
**When** story 42.1 is implemented
**Then** a JSON Schema file exists at `job-hunt-dashboard/src/shared/resume-schema.json`
**And** the schema defines all required top-level scalar fields as required strings: `first_name`, `last_name`, `title_01`, `title_02`, `email`, `website`, `linkedin`, `location`, `summary`
**And** `skill_groups` is defined as an array of `{ label: string, skills: string[] }` (may be empty)
**And** `education` is defined as an array of `{ school: string, degree: string, year: string }` (may be empty)
**And** `projects` is defined as an array of `{ name: string, desc: string, stack: string }` (may be empty)
**And** `experience` is defined as an array of `{ company: string, location: string, dates: string, role: string, bullets: string[] }` with `minItems: 1` (at least one job required)

**Given** the schema artifact exists
**When** a developer reads `src/shared/resume-schema.json`
**Then** the file is valid JSON Schema draft-07 (or later) and can be consumed by standard validators (ajv, etc.)

**Given** the prose-rules companion exists
**When** a developer implements or reviews the LLM prompt
**Then** they can read the prose rules to understand: (a) `title_02` must not contain "and" or "&"; (b) "/" in skill strings only when one is a direct subset/implementation/prerequisite of the other; (c) `experience` is most-recent first; (d) `projects` and `skill_groups` arrays may be empty to omit their sections
**And** these prose rules are co-located with the schema file (inline `$comment` fields or a sibling `resume-schema-rules.md`)

**Given** the schema exists
**When** the app imports `resume-schema.json` as a TypeScript type (via `satisfies` or generated type)
**Then** the TypeScript build compiles without errors and the inferred type matches the flat schema shape

---

### Story 42.2: Rewrite LLM Prompt to Emit Canonical Flat Schema

As a developer,
I want the resume LLM prompt rewritten to emit the canonical flat JSON schema directly,
So that no transform layer is required between LLM output and template injection.

**Context:**
The current default resume prompt in `prompt-defaults.ts` asks the LLM to "Return ONLY valid HTML." The `resume_json_prompt` file in the repo root uses a nested/numbered JSON format (`CANDIDATE INFO → TITLES → 1/2`, `SKILLGROUPS`, etc.) — this is NOT currently wired into the app and is the old format. This story replaces the default resume prompt with one that emits the canonical flat JSON defined in Story 42.1, preserving every existing hard rule re-expressed against the flat shape.

**Acceptance Criteria:**

**Given** the new prompt is set as the default in `prompt-defaults.ts`
**When** the prompt is read by the resume service
**Then** the `systemPrompt` instructs the LLM to return ONLY a JSON object conforming to the canonical flat schema — no markdown, no code fences, no explanatory text

**Given** the new prompt
**When** tested against a sample candidate profile and job description
**Then** the LLM output is a valid flat JSON object with all required top-level keys present

**Given** the new prompt
**When** the LLM generates the resume
**Then** all existing hard rules are enforced:
- No invented content — every value comes from the candidate profile
- `experience` entries are most-recent first
- `title_02` contains no "and" or "&"
- "/" in skill entries only when one is a direct subset/implementation/prerequisite of the other
- No emdashes in any string value

**Given** the new prompt
**When** content limits are evaluated
**Then** the prompt instructs appropriate limits: skill_groups 3–6, skills per group 3–5, projects 1–4, bullets per experience entry 3–5, bullet length ~140–170 chars

**Given** the new prompt
**When** the LLM output is parsed with `JSON.parse()`
**Then** the output parses successfully without any pre-processing (no fence stripping needed)

**Given** any custom resume prompt previously stored in the `prompts` table
**When** Story 42.3 ships its DB migration
**Then** the stored override is cleared (see FR13 / D3) so the new default takes effect for all users

---

### Story 42.3: Migrate Resume Service to JSON Pipeline

As a developer,
I want the resume service refactored from HTML-direct-generation to JSON → validate → inject → PDF,
So that the pipeline uses the canonical schema and the Sage template, with deterministic failure handling.

**Context:**
`resume-service.ts` currently: calls Anthropic expecting HTML, strips code fences, passes raw HTML to `generatePdf()`. This story replaces that with: call Anthropic expecting flat JSON, parse JSON, validate against canonical schema, inject into Sage template, call `generatePdf()` with the injected HTML. The Sage template is at `resume_templates/resume_template_sage.html` (already built). The `generate-pdf.ts` Playwright wrapper is already functional and is reused.

**Acceptance Criteria:**

**Given** the refactored service
**When** a resume generation is triggered for a job
**Then** the Anthropic API is called with the new flat-JSON prompt (Story 42.2)
**And** the response is parsed with `JSON.parse()` — no code-fence stripping needed (but a single code-fence strip guard is acceptable as a safety net)

**Given** valid JSON returned by the LLM
**When** the validation layer runs
**Then** the JSON is validated against `resume-schema.json` using a lightweight JSON Schema validator (ajv or equivalent)
**And** semantic rules are checked: `title_02` contains no "and"/"&"; "/" pairings are not validated structurally (too complex for mechanical check — documented as prompt-enforced)

**Given** LLM output that fails schema validation
**When** validation fails
**Then** the service throws a descriptive error that surfaces to the user (e.g., `"Resume generation failed: LLM output did not conform to schema — [field details]"`)
**And** no PDF is generated

**Given** valid, validated JSON
**When** template injection runs
**Then** the Sage template HTML (`resume_templates/resume_template_sage.html`) is read from disk
**And** the validated JSON is serialized and injected into `<script id="resume-data" type="application/json">...</script>` in the template

**Given** the injected template HTML
**When** Playwright renders and exports the PDF
**Then** `page.pdf()` is called with `{ printBackground: true, preferCSSPageSize: true }`
**And** the render waits for `window.__paginationComplete` to be truthy before capturing (with a reasonable timeout, e.g., 15s)

**Given** empty arrays for optional sections (`skill_groups: []`, `education: []`, `projects: []`)
**When** the template renders
**Then** no render error occurs and no empty section heading or divider is shown in the PDF

**Given** the `prompts` table migration
**When** the migration runs
**Then** any existing row with `flow = 'resume'` is deleted from the `prompts` table
**And** a migration note/comment documents why (old HTML prompt is incompatible with the new JSON pipeline)

**Given** the refactored service
**When** `resume-service.test.ts` runs
**Then** existing tests are updated to mock Anthropic returning JSON (not HTML) and to verify:
  - Valid JSON is validated and injected into the Sage template before PDF generation
  - Invalid JSON (schema violation) causes a throw, not a silent PDF of garbage

---

### Story 42.4: End-to-End Tests and Contract Drift Guard

As a developer,
I want end-to-end tests for the one-page and two-page resume cases plus a contract test that fails CI on schema drift,
So that the three components (schema, prompt, template) cannot silently diverge.

**Context:**
The Sage template auto-selects one-page or two-page layout based on content overflow (via `window.__paginationComplete`). This story adds fixture-based E2E tests for both cases (no live LLM call) and a contract test that verifies the schema, the prompt's stated output format, and the template's expected input keys are all consistent.

**Acceptance Criteria:**

**Given** a fixture JSON conforming to the canonical schema (one-page-sized content)
**When** the template is rendered and `window.__paginationComplete` resolves
**Then** the rendered output is a single page and `generatePdf()` returns a non-empty Buffer

**Given** a fixture JSON conforming to the canonical schema (two-page-sized content — many experience entries + full skill groups)
**When** the template is rendered and `window.__paginationComplete` resolves
**Then** the rendered output spans two pages (verifiable via PDF page count or by the template's own pagination signal)

**Given** the Sage template HTML source
**When** the contract test runs
**Then** it extracts all field references from the template's render script (the JS that reads `resume-data`)
**And** confirms every referenced key exists in `resume-schema.json`
**And** the test fails with a clear error if the template references a key not in the schema, or if the schema defines a required key not referenced by the template

**Given** the canonical schema in `resume-schema.json`
**When** the contract test runs
**Then** it confirms the prompt in `prompt-defaults.ts` (resume systemPrompt) mentions/references the schema keys by name or includes the schema inline
**And** the test fails if the prompt appears to describe a non-flat structure (e.g., contains "CANDIDATE INFO", "TITLES", "SKILLGROUPS" — the old nested keys)

**Given** all four stories complete
**When** the full test suite runs (`bun test`)
**Then** all existing resume-service tests pass (updated for JSON pipeline)
**And** all new E2E and contract tests pass
**And** no TypeScript build errors

**Given** a developer modifies `resume-schema.json` (adds or removes a key)
**When** the contract test runs
**Then** it fails if the template or prompt is not updated to match
**And** the error message names the specific diverging key

---

## Epic 42 Story Sequence Summary

| Story | Title | Dependency |
|-------|-------|------------|
| 42.1  | Define Canonical Resume JSON Schema | None — do first |
| 42.2  | Rewrite LLM Prompt to Emit Canonical Flat Schema | 42.1 (schema must exist) |
| 42.3  | Migrate Resume Service to JSON Pipeline | 42.1, 42.2 |
| 42.4  | End-to-End Tests and Contract Drift Guard | 42.1, 42.2, 42.3 |

## Flagged Risks

**RISK-1 — Font-load reliability:** The Sage template loads Google Fonts over the network. Slow/flaky font loads can affect pagination measurement and produce wrong one-page vs. two-page results. **Decision:** Out of scope for this epic. If font-load flakiness causes CI failures, raise a follow-up hardening epic.

**RISK-2 — Validation strictness (D2):** This epic uses reject-and-surface-error (no retry). If retry behavior is desired after observing production failure rates, it can be added in a follow-up story without architectural changes.

**RISK-3 — Prompt drift over time:** The contract test (Story 42.4) guards against code-level drift but cannot guard against a future LLM model update that changes output format without code changes. Recommend periodic manual smoke tests when the LLM model is upgraded.
