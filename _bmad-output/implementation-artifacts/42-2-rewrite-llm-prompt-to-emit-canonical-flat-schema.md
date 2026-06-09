# Story 42.2: Rewrite LLM Prompt to Emit Canonical Flat Schema

**Story ID:** 42.2  
**Epic:** 42 — Resume Pipeline: Schema + Prompt + Template Alignment  
**Status:** done  
**Date Created:** 2026-06-09

---

## Story

As a developer,
I want the resume LLM prompt rewritten to emit the canonical flat JSON schema directly,
So that no transform layer is required between LLM output and template injection.

---

## Context

The current `resume` default in `prompt-defaults.ts` asks the LLM to return raw HTML. This story replaces it with a prompt that emits the canonical flat JSON schema defined in Story 42.1.

**Pre-conditions:** Story 42.1 is done. The following artifacts now exist:
- `job-hunt-dashboard/src/shared/resume-schema.json` — canonical JSON Schema draft-07
- `job-hunt-dashboard/src/shared/resume-schema-rules.md` — prose rules companion
- `job-hunt-dashboard/src/shared/schemas.ts` — `resumeDataSchema` Zod schema + `ResumeData` type

**Scope:** Only `prompt-defaults.ts` is modified. No changes to `resume-service.ts`, `generate-pdf.ts`, the database, or any template. Service migration is Story 42.3.

**Post-condition:** When Story 42.3 wires the service, `JSON.parse()` on the LLM response will produce a valid `ResumeData` object with no pre-processing required.

---

## Acceptance Criteria

**Given** the new prompt is set as the default in `prompt-defaults.ts`  
**When** the prompt is read by the resume service  
**Then** `systemPrompt` instructs the LLM to return ONLY a JSON object — no markdown, no code fences, no explanatory text

**Given** the new prompt  
**When** tested against a sample candidate profile and job description  
**Then** the LLM output is a valid flat JSON object with all required top-level keys present (`first_name`, `last_name`, `title_01`, `title_02`, `email`, `website`, `linkedin`, `location`, `summary`, `skill_groups`, `education`, `projects`, `experience`)

**Given** the new prompt  
**When** the LLM generates the resume  
**Then** all hard rules are enforced: no invented content, `experience` most-recent first, `title_02` contains no "and"/"&", "/" in skills only for subset/superset relationships, no emdashes

**Given** the new prompt  
**When** content limits are evaluated  
**Then** the prompt specifies: `skill_groups` 3–6, skills per group 3–5, projects 1–4, bullets per experience 3–5, bullet length ~140–170 chars

**Given** the new prompt  
**When** the LLM output is parsed with `JSON.parse()`  
**Then** it parses successfully without any pre-processing (no fence stripping needed)

---

## Single File to Modify

**`job-hunt-dashboard/src/server/services/prompt-defaults.ts`**

Change only the `resume` entry in `DEFAULT_PROMPTS`. The rest of the file is unchanged.

---

## The New Prompt

Replace the `resume` entry's `systemPrompt` and `userMessage` with the following. Use the exact placeholder names — the service does string substitution on these:
- `{{CANDIDATE_PROFILE}}` in `systemPrompt` → replaced with the candidate's profile text at call time
- `{{JOB_DETAILS}}` in `userMessage` → replaced with job company, title, location, and description at call time

```typescript
resume: {
  systemPrompt:
    'You are an expert resume writer. Analyze the candidate profile and job description, ' +
    'then return ONLY a valid JSON object — no markdown, no code fences, no explanatory text.\n\n' +
    'CANDIDATE PROFILE:\n{{CANDIDATE_PROFILE}}\n\n' +
    'OUTPUT FORMAT — return exactly this shape:\n' +
    '{\n' +
    '  "first_name": "string",\n' +
    '  "last_name": "string",\n' +
    '  "title_01": "string",\n' +
    '  "title_02": "string",\n' +
    '  "email": "string",\n' +
    '  "website": "string",\n' +
    '  "linkedin": "string",\n' +
    '  "location": "string",\n' +
    '  "summary": "string",\n' +
    '  "skill_groups": [{ "label": "string", "skills": ["string"] }],\n' +
    '  "education": [{ "school": "string", "degree": "string", "year": "string" }],\n' +
    '  "projects": [{ "name": "string", "desc": "string", "stack": "string" }],\n' +
    '  "experience": [{ "company": "string", "location": "string", "dates": "string", "role": "string", "bullets": ["string"] }]\n' +
    '}\n\n' +
    'HARD RULES — never violate:\n' +
    '- Return ONLY the JSON object. No text before or after it.\n' +
    '- No invented content — every value must come from the candidate profile.\n' +
    '- experience: ordered most-recent first (descending by start date).\n' +
    '- title_02: must not contain "and" or "&" — the template renders "title_01 and title_02".\n' +
    '- skills: "/" only when one is a direct subset/superset/prerequisite of the other ' +
    '(e.g. "TypeScript/JavaScript" ✔; "Python/SQL" ✘).\n' +
    '- No em-dashes (—) in any string — use a hyphen (-) or restructure.\n' +
    '- first_name, last_name, email, website, linkedin, location: copy exactly from the candidate profile.\n\n' +
    'CONTENT LIMITS:\n' +
    '- skill_groups: 3–6 groups (empty array [] omits the Skills section entirely).\n' +
    '- skills per group: 3–5 items.\n' +
    '- projects: 1–4 entries (empty array [] omits the Projects section entirely).\n' +
    '- bullets per experience entry: 3–5.\n' +
    '- bullet length: ~140–170 characters.\n' +
    '- education: copy exactly if present in profile; use [] if not present.\n\n' +
    'TAILORING GUIDANCE:\n' +
    '- title_01: primary title signaling compatibility with both the candidate background and the target role.\n' +
    '- title_02: secondary title for dual expertise or sub-specialization (no "and"/"&").\n' +
    '- skill_groups: infer relevant group labels from the job description; populate each with skills from the profile.\n' +
    '- summary: 2–4 sentences, high-impact professional tone, reference relevant achievements.\n' +
    '- bullets: maximize relevance to the role; never trim metrics, named technologies, or most-recent-job entries unless no other option remains.\n' +
    '- projects: choose those most relevant to the job; filter out the rest. stack is a "·"-separated string (e.g. "TypeScript · Bun · SQLite").',
  userMessage:
    'Tailor a resume for this role. Return ONLY the JSON object as specified.\n\n' +
    '{{JOB_DETAILS}}',
},
```

---

## Technical Requirements

### Placeholder names are fixed — do not change them

The `resume-service.ts` currently does:
```typescript
const systemPrompt = ((promptConfig.systemPrompt ?? '') + '\n\nHTML TEMPLATE...')
  .replaceAll('{{CANDIDATE_PROFILE}}', profileText)
const userMessage = promptConfig.userMessage
  .replaceAll('{{JOB_DETAILS}}', jobDetails)
```

Story 42.3 will refactor this substitution, but it will keep the same placeholder names (`{{CANDIDATE_PROFILE}}`, `{{JOB_DETAILS}}`). The new prompt must use these exact placeholders.

**Important:** The `'\n\nHTML TEMPLATE...'` concatenation in the current service will append garbage to the system prompt until 42.3 fixes it. This is fine — 42.2's only job is to have the correct default text in place so 42.3 can wire it.

### `stack` field is a string, not an array

`projects[].stack` is a plain `" · "`-separated string per the canonical schema (e.g., `"TypeScript · Bun · SQLite"`). The old `resume_json_prompt` used a numbered object `"STACK": { "1": ... }` — do NOT use that shape. The prompt must guide the LLM to produce a single string.

### Unicode characters in string concatenation

Use Unicode escapes to avoid any encoding issues:
- Em-dash: `—`
- En-dash range: `–`
- Middle dot (·): `·`
- Checkmark/cross: `✔`, `✘`

### `title_02` constraint — critical for template rendering

The template (`resume_templates/resume_template(1).html`) renders:
```js
`${esc(DATA.title_01)}<br>and ${esc(DATA.title_02)}`
```
If `title_02` contains "and" this produces e.g. "Engineer and Systems Engineer and Architect". The prompt must enforce this rule explicitly.

### Old prompt artifacts to ignore

The repo root contains `resume_json_prompt` and `resume_json_prompt_example` — these are the old nested/numbered schema format and are NOT connected to the app. Do not reference them. The correct schema to target is the flat schema in `src/shared/resume-schema.json`.

### No DB migration in this story

The clearing of stored custom `resume` prompts from the `prompts` table is Story 42.3's responsibility (FR13 / D3). This story only changes the hardcoded default in `DEFAULT_PROMPTS`. Users with a stored override will continue to get the old (broken) HTML prompt until 42.3's migration runs — that is expected and acceptable.

---

## Architecture & Anti-Pattern Guidance

**Do NOT:**
- Modify `resume-service.ts` — that is Story 42.3 scope
- Modify `generate-pdf.ts` — out of scope for this epic
- Add any DB migration — Story 42.3 scope
- Touch the Sage template or `resume_template(1).html` — already built and correct
- Install any new packages — this story requires zero new dependencies
- Change how `loadEffectivePrompt` works — it's correct as-is

**Do:**
- Replace only the `resume` entry in `DEFAULT_PROMPTS` (leave `analysis` and `cover_letter` unchanged)
- Keep the `promptConfig.systemPrompt: string | null` type — the new systemPrompt is a non-null string
- Verify TypeScript compiles after the change: `bun tsc --noEmit`

---

## Previous Story Intelligence (42.1)

**Critical finding from 42.1 dev notes:**
> The correct template file is `resume_templates/resume_template(1).html` — this is the complete Sage template with JSON injection and the pagination engine. `resume_templates/resume_template_sage.html` is an **older draft** using `[[field_name]]` placeholders — **do not use it**.

This matters for your understanding of what the prompt's output must feed: the template reads `<script id="resume-data" type="application/json">` and accesses `DATA.first_name`, `DATA.last_name`, `DATA.title_01`, `DATA.title_02`, `DATA.email`, `DATA.website`, `DATA.linkedin`, `DATA.location`, `DATA.summary`, `DATA.skill_groups`, `DATA.education`, `DATA.projects`, `DATA.experience`. The flat schema matches these keys exactly.

**No deviations from spec in 42.1.** TypeScript compile: zero new errors. Test suite: 393 pass / 12 fail (all 12 pre-existing failures unrelated to this epic).

---

## Verification Steps

After completing this story:

1. **TypeScript compile:** `bun tsc --noEmit` — zero new errors
2. **Visual inspect:** Read the `resume` entry in `DEFAULT_PROMPTS` and confirm:
   - `systemPrompt` does NOT contain "Return ONLY valid HTML"
   - `systemPrompt` DOES contain the full flat JSON shape with all 13 top-level keys
   - `systemPrompt` DOES contain "HARD RULES" section
   - `userMessage` ends with `{{JOB_DETAILS}}`
3. **No test changes needed** in this story — the service tests will be updated in Story 42.3 when the service is refactored to expect JSON instead of HTML
4. **Regression check:** `bun test` — confirm still 393 pass / 12 fail (same baseline as 42.1); no new failures

---

## Dev Agent Record

### Completion Notes

Replaced the `resume` entry in `DEFAULT_PROMPTS` in `prompt-defaults.ts`. The new `systemPrompt` instructs the LLM to return ONLY a flat JSON object with all 13 required top-level keys, includes the full OUTPUT FORMAT shape, HARD RULES, CONTENT LIMITS, and TAILORING GUIDANCE sections. The `userMessage` is reduced to a single directive ending with `{{JOB_DETAILS}}`. Both placeholder names (`{{CANDIDATE_PROFILE}}`, `{{JOB_DETAILS}}`) are preserved for Story 42.3 compatibility. Unicode characters (em-dashes, en-dashes, middle dot, checkmark, cross) are embedded as literal UTF-8 strings consistent with the existing codebase style. TypeScript compile: zero new errors. Regression: 393 pass / 12 fail — identical to 42.1 baseline.

## File List

- `job-hunt-dashboard/src/server/services/prompt-defaults.ts` (modified — resume prompt replaced)

## Change Log

- 2026-06-09: Story 42.2 created
- 2026-06-09: Implemented — replaced `resume` default prompt in `prompt-defaults.ts` to emit canonical flat JSON schema

## Review Findings

**Result: 0 decision-needed, 0 patch, 8 deferred, 6 dismissed. Story passes review.**

- [x] [Review][Defer] Scalar required string fields accept empty string — no `.min(1)` on `first_name`, `last_name`, `summary`, etc. [`schemas.ts`] — deferred, captured in 42.1 deferred-work
- [x] [Review][Defer] No `.max()` bounds on array fields despite prompt specifying upper limits (`skill_groups` ≤6, `bullets` ≤5, etc.) [`schemas.ts`] — deferred, captured in 42.1 deferred-work
- [x] [Review][Defer] `email`/`website`/`linkedin` accept any string; no `.email()`/`.url()` format validation [`schemas.ts`] — deferred, captured in 42.1 deferred-work
- [x] [Review][Defer] `title_02` no-"and"/"&" rule only in prompt, not enforced via Zod `.refine()` [`schemas.ts`] — deferred, captured in 42.1 deferred-work
- [x] [Review][Defer] `projects[].stack` middle-dot separator format not validated — template or splitter that expects `·` would silently fail on LLM output using a different separator [`schemas.ts`] — deferred, pre-existing
- [x] [Review][Defer] `experience[].location` is required in schema but may be legitimately absent from a candidate profile, forcing the LLM to invent a value (violating the "no invented content" rule) or return an empty string [`schemas.ts`] — deferred, pre-existing
- [x] [Review][Defer] `max_tokens: 4096` in `resume-service.ts` could truncate a large JSON payload mid-object, causing `JSON.parse()` to throw when the service is wired in 42.3 [`resume-service.ts`] — deferred, pre-existing
- [x] [Review][Defer] No validation that `{{CANDIDATE_PROFILE}}`/`{{JOB_DETAILS}}` placeholders resolve to non-empty strings before the prompt is sent to the LLM; an unreplaced literal placeholder would produce a resume with invented content and no error signal [`resume-service.ts`] — deferred, pre-existing
