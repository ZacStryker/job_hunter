# Story 42.1: Define Canonical Resume JSON Schema

**Story ID:** 42.1  
**Epic:** 42 — Resume Pipeline: Schema + Prompt + Template Alignment  
**Status:** done  
**Date Created:** 2026-06-08

---

## Story

As a developer,
I want a single machine-checkable JSON Schema artifact that defines the canonical flat resume structure,
So that the LLM prompt and the application service both have a shared, authoritative contract that can be validated against programmatically.

---

## Context

This story creates the schema artifact and prose rules that make the resume shape explicit and machine-verifiable. **It does NOT change any running code or modify any existing service.** Stories 42.2–42.4 build on this artifact.

The current resume pipeline in `resume-service.ts` generates raw HTML from Anthropic and passes it directly to Playwright. This story is step 1 of replacing that with a JSON pipeline.

---

## Acceptance Criteria

**Given** the canonical schema file does not yet exist  
**When** story 42.1 is implemented  
**Then** a JSON Schema file exists at `job-hunt-dashboard/src/shared/resume-schema.json`  
**And** the schema defines all required top-level scalar fields as required strings: `first_name`, `last_name`, `title_01`, `title_02`, `email`, `website`, `linkedin`, `location`, `summary`  
**And** `skill_groups` is defined as an array of `{ label: string, skills: string[] }` (may be empty)  
**And** `education` is defined as an array of `{ school: string, degree: string, year: string }` (may be empty)  
**And** `projects` is defined as an array of `{ name: string, desc: string, stack: string }` (may be empty, `stack` is a `" · "`-separated string)  
**And** `experience` is defined as an array of `{ company: string, location: string, dates: string, role: string, bullets: string[] }` with `minItems: 1`

**Given** the schema artifact exists  
**When** a developer reads `src/shared/resume-schema.json`  
**Then** the file is valid JSON Schema draft-07 and can be consumed by standard validators (ajv)

**Given** the prose-rules companion exists  
**When** a developer implements or reviews the LLM prompt  
**Then** they can read the rules: (a) `title_02` must not contain "and" or "&"; (b) "/" in skill strings only when one is a direct subset/implementation/prerequisite of the other; (c) `experience` is most-recent first; (d) `projects` and `skill_groups` may be empty arrays to omit their sections

**Given** the schema exists  
**When** the dev adds a TypeScript type companion  
**Then** a `resumeDataSchema` Zod schema + exported `ResumeData` type exist in `src/shared/schemas.ts`, the TypeScript build compiles without errors, and the inferred type matches the flat schema shape

---

## Deliverables

Three artifacts created, zero running code changed:

1. `job-hunt-dashboard/src/shared/resume-schema.json` — JSON Schema draft-07 file
2. `job-hunt-dashboard/src/shared/resume-schema-rules.md` — prose rules companion
3. `src/shared/schemas.ts` — add `resumeDataSchema` Zod schema + `ResumeData` type (append to existing file)

---

## Technical Requirements

### 1. JSON Schema File — `src/shared/resume-schema.json`

Use JSON Schema draft-07 (`"$schema": "http://json-schema.org/draft-07/schema#"`). All fields are required. Shape:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "resume-schema",
  "title": "ResumeData",
  "type": "object",
  "required": [
    "first_name", "last_name", "title_01", "title_02",
    "email", "website", "linkedin", "location", "summary",
    "skill_groups", "education", "projects", "experience"
  ],
  "additionalProperties": false,
  "properties": {
    "first_name":  { "type": "string" },
    "last_name":   { "type": "string" },
    "title_01":    { "type": "string" },
    "title_02":    { "type": "string", "$comment": "Must not contain 'and' or '&'" },
    "email":       { "type": "string" },
    "website":     { "type": "string" },
    "linkedin":    { "type": "string" },
    "location":    { "type": "string" },
    "summary":     { "type": "string" },
    "skill_groups": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["label", "skills"],
        "additionalProperties": false,
        "properties": {
          "label":  { "type": "string" },
          "skills": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "education": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["school", "degree", "year"],
        "additionalProperties": false,
        "properties": {
          "school": { "type": "string" },
          "degree": { "type": "string" },
          "year":   { "type": "string" }
        }
      }
    },
    "projects": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "desc", "stack"],
        "additionalProperties": false,
        "properties": {
          "name":  { "type": "string" },
          "desc":  { "type": "string" },
          "stack": { "type": "string", "$comment": "' · '-separated string, e.g. 'TypeScript · Bun · SQLite'" }
        }
      }
    },
    "experience": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["company", "location", "dates", "role", "bullets"],
        "additionalProperties": false,
        "properties": {
          "company":  { "type": "string" },
          "location": { "type": "string" },
          "dates":    { "type": "string" },
          "role":     { "type": "string" },
          "bullets":  { "type": "array", "items": { "type": "string" }, "minItems": 1 }
        }
      }
    }
  }
}
```

### 2. Prose Rules — `src/shared/resume-schema-rules.md`

Document all hard rules that mechanical JSON Schema cannot enforce:
- `title_02` must not contain "and" or "&" (it is already preceded by "and" in the template header)
- "/" in skill entries only when one is a direct subset/implementation/prerequisite of the other (e.g., "TypeScript/JavaScript" is OK; "Python/SQL" is not)
- `experience` entries must be most-recent first
- `skill_groups`, `education`, `projects` may be empty arrays (`[]`) to omit their sections entirely
- No emdashes in any string value
- Content limits: `skill_groups` 3–6; `skills` per group 3–5; `projects` 1–4; `bullets` per experience 3–5; bullet length ~140–170 chars

### 3. TypeScript Type in `src/shared/schemas.ts`

Append to the BOTTOM of the existing `src/shared/schemas.ts` file. Follow all project conventions:
- Zod schema named `resumeDataSchema` (camelCase + Schema suffix)
- Type inferred via `z.infer<typeof resumeDataSchema>`
- This mirrors the JSON Schema exactly

```typescript
export const resumeDataSchema = z.object({
  first_name:   z.string(),
  last_name:    z.string(),
  title_01:     z.string(),
  title_02:     z.string(),
  email:        z.string(),
  website:      z.string(),
  linkedin:     z.string(),
  location:     z.string(),
  summary:      z.string(),
  skill_groups: z.array(z.object({ label: z.string(), skills: z.array(z.string()) })),
  education:    z.array(z.object({ school: z.string(), degree: z.string(), year: z.string() })),
  projects:     z.array(z.object({ name: z.string(), desc: z.string(), stack: z.string() })),
  experience:   z.array(z.object({
    company:  z.string(),
    location: z.string(),
    dates:    z.string(),
    role:     z.string(),
    bullets:  z.array(z.string()).min(1),
  })).min(1),
})
export type ResumeData = z.infer<typeof resumeDataSchema>
```

**Why Zod in schemas.ts + separate JSON Schema file:**  
- `schemas.ts` Zod schemas are the TypeScript type source of truth (project convention — all types from here)
- `resume-schema.json` exists for ajv runtime validation in Story 42.3 (validator runs in-service on raw LLM output; ajv is fast/synchronous and works off the JSON Schema file)
- Both must stay in sync — the contract test in Story 42.4 will enforce this

---

## Architecture & Anti-Pattern Guidance

**Do NOT:**
- Modify `resume-service.ts`, `generate-pdf.ts`, or `prompt-defaults.ts` — those are Story 42.3 scope
- Install `ajv` now — that's Story 42.3 scope
- Change the Sage template — that's Story 42.3 scope
- Add any enum constraints to the JSON Schema (story 42.4 handles rule testing)

**File placement is fixed (Decision D1 from epic):**
- `src/shared/resume-schema.json` lives in `src/shared/` so the TypeScript service can import it without path gymnastics
- Co-locate `resume-schema-rules.md` in the same directory

**`src/shared/` import alias:**
- The path alias `@shared/*` → `src/shared/*` is configured in `vite.config.ts` and `tsconfig.json`
- Resume-service can later import: `import resumeSchema from '@shared/resume-schema.json' assert { type: 'json' }` (or `with { type: 'json' }` in newer runtimes)

**TypeScript strict mode:**
- `noUnusedLocals` and `noUnusedParameters` are ON — `ResumeData` type must be exported so it's used downstream
- The type will be used in Story 42.3 when `resume-service.ts` is refactored

---

## Template Notes for Story 42.3

**Correct template file:** `resume_templates/resume_template(1).html` — this is the complete Sage template with JSON injection and the pagination engine. It reads from `<script id="resume-data" type="application/json">` and sets `window.__paginationComplete = true` in its `finish()` function. The schema defined in this story matches it exactly.

`resume_templates/resume_template_sage.html` is an older draft using `[[field_name]]` placeholders — **do not use it**.

**`generate-pdf.ts` currently uses Chromium** (`import { chromium } from 'playwright'`). The epic specifies no browser requirement for PDF generation (only scraping requires Firefox). Do not change `generate-pdf.ts` in this story.

---

## Verification Steps

After completing this story, verify:

1. `bun run build` (or `bun tsc --noEmit`) succeeds with zero TypeScript errors
2. `resume-schema.json` is valid JSON Schema — parse it with `JSON.parse` manually to confirm
3. `ResumeData` is exported from `schemas.ts` — grep for `export type ResumeData`
4. No existing tests break — run `bun test` to confirm zero regressions
5. The `src/shared/` directory contains three resume artifacts: `resume-schema.json`, `resume-schema-rules.md`, and the type entry in `schemas.ts`

---

## Dev Agent Record

### Completion Notes

Implemented 2026-06-08. Three artifacts created, zero running code changed.

- `job-hunt-dashboard/src/shared/resume-schema.json` — JSON Schema draft-07 matching the spec exactly
- `job-hunt-dashboard/src/shared/resume-schema-rules.md` — prose rules companion covering title_02 constraint, "/" separator rule, ordering, empty-array semantics, em-dash prohibition, and content limits
- `job-hunt-dashboard/src/shared/schemas.ts` — appended `resumeDataSchema` Zod schema and exported `ResumeData` type

TypeScript compile: pre-existing errors in unrelated files (discovery-service, routes, tests) — zero new errors introduced by this story. `bun tsc --noEmit` produces no errors touching `schemas.ts` or the new files.

Test suite: 393 pass / 12 fail — all 12 failures are pre-existing api-onboarding test failures unrelated to this story.

No deviations from spec.

## File List

- `job-hunt-dashboard/src/shared/resume-schema.json` (created)
- `job-hunt-dashboard/src/shared/resume-schema-rules.md` (created)
- `job-hunt-dashboard/src/shared/schemas.ts` (modified — appended resumeDataSchema + ResumeData)

## Change Log

- 2026-06-08: Story 42.1 implemented — canonical resume JSON Schema, prose rules companion, and Zod type added to schemas.ts

## Review Findings

- [x] [Review][Patch] Content Limits table entry for `projects` says "1–4 entries" but Section Presence rule says `[]` is valid — table should note `0 or 1–4 (use [] to omit section)` [`resume-schema-rules.md`] — fixed
- [x] [Review][Defer] Email/website/linkedin accept any string — format validation not required by spec [`resume-schema.json`, `schemas.ts`] — deferred, out of scope for 42.1; Story 42.4+
- [x] [Review][Defer] Zod and JSON Schema have no sync enforcement mechanism — Story 42.4 explicitly owns contract testing [`schemas.ts`, `resume-schema.json`] — deferred, pre-existing by design
- [x] [Review][Defer] `title_02` "no and/&" rule is advisory-only (unenforced at runtime) — `$comment` is non-normative; Zod has no `.refine()` — Story 42.4 scope [`resume-schema.json`, `schemas.ts`] — deferred, pre-existing by design
- [x] [Review][Defer] Content limit bounds unenforced in schemas (maxItems on skill_groups, skills per group, bullets, experience) — Story 42.4 scope [`resume-schema.json`, `schemas.ts`] — deferred, pre-existing by design
- [x] [Review][Defer] All scalar string fields accept empty strings — no `minLength: 1` in either schema — not required by spec [`resume-schema.json`, `schemas.ts`] — deferred, pre-existing
- [x] [Review][Defer] `dates` and `year` are free-form strings with no format constraint — not required by spec [`resume-schema.json`, `schemas.ts`] — deferred, pre-existing
- [x] [Review][Defer] Zod `.strict()` not used: Zod strips extra keys silently vs JSON Schema `additionalProperties: false` rejects them — intentional design; ajv handles LLM validation, Zod provides TypeScript types [`schemas.ts`] — deferred, intentional design
- [x] [Review][Patch] `skill_groups` Content Limits row says "3–6 groups" but Section Presence allows empty array — should read "0 or 3–6 (use `[]` to omit section)" to match the fix already applied to `projects` [`resume-schema-rules.md`] — fixed
- [x] [Review][Defer] `$id` value in JSON Schema is a bare string ("resume-schema") rather than a URI reference — non-normative, no impact on ajv functionality for this use case [`resume-schema.json`] — deferred, low impact
- [x] [Review][Defer] `skill_groups[].skills` inner array has no `minItems: 1` — a group with a label and zero skills passes validation silently [`resume-schema.json`, `schemas.ts`] — deferred, not required by spec; Story 42.4 scope
- [x] [Review][Defer] `title_01` and `title_02` could be identical strings — no cross-field uniqueness check enforced in either schema [`schemas.ts`, `resume-schema.json`] — deferred, not enforceable in standard JSON Schema / Zod without `.superRefine()`
