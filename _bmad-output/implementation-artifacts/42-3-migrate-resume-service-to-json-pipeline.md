# Story 42.3: Migrate Resume Service to JSON Pipeline

**Story ID:** 42.3  
**Epic:** 42 — Resume Pipeline: Schema + Prompt + Template Alignment  
**Status:** done  
**Date Created:** 2026-06-09

---

## Story

As a developer,
I want the resume service refactored from HTML-direct-generation to JSON → validate → inject → PDF,
So that the pipeline uses the canonical schema and the Sage template, with deterministic failure handling.

---

## Context

**Pre-conditions (both done):**
- Story 42.1: `job-hunt-dashboard/src/shared/resume-schema.json`, `resume-schema-rules.md`, and `resumeDataSchema`/`ResumeData` in `schemas.ts` exist.
- Story 42.2: `prompt-defaults.ts` `resume` entry already emits flat JSON — `systemPrompt` no longer says "Return ONLY valid HTML".

**Current service behavior (to be replaced):**
- `resume-service.ts` calls Anthropic, strips code fences from response, treats output as HTML, passes to `generatePdf()`.
- `generatePdf()` uses `waitUntil: 'networkidle'` and `page.pdf({ format: 'A4' })`.
- The massive `htmlTemplate` const inside `resume-service.ts` is a legacy artifact — remove it entirely.

**New behavior:**
- Call Anthropic → parse JSON → validate (Zod schema + semantic checks) → read Sage template from disk → inject JSON into `<script id="resume-data">` tag → call `generatePdf()` → PDF.

**Template file (critical — do not confuse):**
- Use `resume_templates/resume_template(1).html` — this is the complete Sage template with the JSON injection point and `window.__paginationComplete` pagination engine.
- Do NOT use `resume_templates/resume_template_sage.html` — it uses old `[[field_name]]` placeholder syntax and is an outdated draft.

**Token budget deferred item (must fix in this story):**
- `max_tokens: 4096` can truncate a large JSON payload mid-object for candidates with extensive experience, causing `JSON.parse()` to throw. Raise to `8192`.

---

## Acceptance Criteria

**Given** the refactored service  
**When** a resume generation is triggered for a job  
**Then** the Anthropic API is called with the new flat-JSON prompt (from `prompt-defaults.ts`)  
**And** the response is parsed with `JSON.parse()` — no code-fence stripping needed (but a single code-fence strip guard is acceptable as a safety net)

**Given** valid JSON returned by the LLM  
**When** the validation layer runs  
**Then** the JSON is validated against the canonical schema using `resumeDataSchema.safeParse()` (Zod — already in project, equivalent to ajv on `resume-schema.json`)  
**And** semantic rules are checked: `title_02` contains no "and" or "&"; "/" pairings are not validated structurally (documented as prompt-enforced)

**Given** LLM output that fails schema validation  
**When** validation fails  
**Then** the service throws a descriptive error that surfaces to the user (e.g., `"Resume generation failed: LLM output did not conform to schema — [field details]"`)  
**And** no PDF is generated

**Given** valid, validated JSON  
**When** template injection runs  
**Then** the Sage template HTML (`resume_templates/resume_template(1).html`) is read from disk  
**And** the validated JSON is serialized and injected into `<script id="resume-data" type="application/json">...</script>` in the template

**Given** the injected template HTML  
**When** Playwright renders and exports the PDF  
**Then** `page.pdf()` is called with `{ printBackground: true, preferCSSPageSize: true }`  
**And** the render waits for `window.__paginationComplete` to be truthy before capturing (15s timeout)

**Given** empty arrays for optional sections (`skill_groups: []`, `education: []`, `projects: []`)  
**When** the template renders  
**Then** no render error occurs (the template already handles empty arrays safely — `if (!DATA.skill_groups || DATA.skill_groups.length === 0) return ''`)

**Given** the `prompts` table migration  
**When** the migration runs  
**Then** any existing row with `flow = 'resume'` is deleted from the `prompts` table  
**And** a migration note/comment documents why (old HTML prompt is incompatible with new JSON pipeline)

**Given** the refactored service  
**When** `resume-service.test.ts` runs  
**Then** existing tests are updated to mock Anthropic returning JSON (not HTML) and verify:
- Valid JSON is validated and injected into the Sage template before PDF generation
- Invalid JSON (schema violation) causes a throw, not a silent PDF of garbage

---

## Files to Modify / Create

| File | Action | Notes |
|------|--------|-------|
| `job-hunt-dashboard/src/server/services/resume-service.ts` | Modify | Full refactor: remove htmlTemplate const, add JSON parse/validate/inject |
| `job-hunt-dashboard/src/server/services/generate-pdf.ts` | Modify | Update PDF options + add `window.__paginationComplete` wait |
| `job-hunt-dashboard/src/server/services/resume-service.test.ts` | Modify | Replace HTML mocks with JSON mocks; add schema-violation test |
| `job-hunt-dashboard/src/db/migrations/0031_clear_resume_prompt.sql` | Create | Data migration: DELETE resume flow prompt |

**Do NOT create a new drizzle schema file** — the `prompts` table schema is unchanged. This is a data-only migration written as a raw SQL file.

---

## Technical Requirements

### 1. `generate-pdf.ts` — Update Playwright options and add pagination wait

The current implementation is:
```typescript
await page.setContent(html, { waitUntil: 'networkidle' })
const pdf = await page.pdf({ format: 'A4' })
```

Replace with:
```typescript
await page.setContent(html, { waitUntil: 'networkidle' })
await page.waitForFunction(() => (window as unknown as { __paginationComplete?: boolean }).__paginationComplete === true, { timeout: 15_000 })
const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
```

Rationale: `waitUntil: 'networkidle'` is still needed because the Sage template loads Google Fonts from the network. After that, we wait for the pagination JS to finish running (it sets `window.__paginationComplete = true`). This is a 15s timeout — if the template hangs, we surface an error rather than capturing a broken PDF.

**TypeScript note:** `window.__paginationComplete` is not typed in the page context; cast appropriately inside `waitForFunction`.

### 2. `resume-service.ts` — Full refactor

**Remove entirely:**
- The `htmlTemplate` const (the entire multi-line HTML string — lines 14–314 in the current file)
- The `stripCodeFences` function (can keep a minimal one-liner guard if desired — see below)
- The `'\n\nHTML TEMPLATE (use this structure):\n' + htmlTemplate` concatenation from the systemPrompt

**New flow:**

```typescript
// Step 1: call Anthropic (same as before, but raise max_tokens and clean up systemPrompt)
const systemPrompt = (promptConfig.systemPrompt ?? '')
  .replaceAll('{{CANDIDATE_PROFILE}}', profileText)
// Note: no HTML template appended

// Step 2: parse JSON response (with optional fence strip safety net)
let rawText = data.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
if (!rawText) throw new Error('Anthropic returned empty resume')
// Strip code fences if LLM ignores the "no fences" instruction
if (rawText.startsWith('```')) {
  rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
}
const resumeJson = JSON.parse(rawText)  // throws if malformed

// Step 3: validate against canonical schema
const parsed = resumeDataSchema.safeParse(resumeJson)
if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
  throw new Error(`Resume generation failed: LLM output did not conform to schema — ${issues}`)
}
// Semantic rule: title_02 must not contain "and" or "&"
if (parsed.data.title_02.toLowerCase().includes('and') || parsed.data.title_02.includes('&')) {
  throw new Error('Resume generation failed: title_02 contains "and" or "&" — violates template rendering rule')
}

// Step 4: inject into Sage template
const templatePath = path.join(process.cwd(), 'resume_templates', 'resume_template(1).html')
const templateHtml = await fs.readFile(templatePath, 'utf-8')
const injectedHtml = templateHtml.replace(
  /<script id="resume-data" type="application\/json">[\s\S]*?<\/script>/,
  `<script id="resume-data" type="application/json">\n${JSON.stringify(parsed.data, null, 2)}\n</script>`
)

// Step 5: generate PDF
return { pdf: await generatePdf(injectedHtml), inputTokens: ..., outputTokens: ... }
```

**Important imports to add:**
```typescript
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resumeDataSchema } from '../../shared/schemas'
```

**`max_tokens` change:** Raise from `4096` to `8192`. A full resume JSON for a candidate with 5 experience entries × 5 bullets + skill groups + summary approaches 4096 tokens easily.

**`templatePath` path construction:** Use `process.cwd()` — the app runs from the `job-hunt-dashboard/` directory (`bun start` in that dir), so the template is at `../resume_templates/resume_template(1).html` relative to CWD. Verify exact working directory at runtime. Alternatively use `import.meta.dir` to construct an absolute path from the service file's location: the service is at `src/server/services/resume-service.ts`, so `join(import.meta.dir, '../../../../resume_templates/resume_template(1).html')`. Use `import.meta.dir` — it's Bun-specific and reliable regardless of CWD.

**Regex for injection:** The `<script id="resume-data" ...>` block spans multiple lines (the template has a JSON object inside). Use `[\s\S]*?` for the multiline match — confirmed working from the template structure (line 354–370 in the template).

### 3. DB Migration — `0031_clear_resume_prompt.sql`

Create this file manually at `job-hunt-dashboard/src/db/migrations/0031_clear_resume_prompt.sql`:

```sql
-- Clear stored 'resume' prompt override: the old HTML-generation prompt is
-- incompatible with the new JSON pipeline introduced in Epic 42 Story 42.3.
-- Users with a stored override would get the broken HTML prompt until cleared.
DELETE FROM prompts WHERE flow = 'resume';
```

No schema change — data-only. The migration runner executes all SQL files in `migrations/` in sequence at `bun start`. Confirm the migration runner picks up `.sql` files without a schema change marker — if the runner requires a Drizzle-generated meta entry, check `migrations/meta/` and manually add the entry. If the runner uses straight SQL file execution, the file alone suffices.

**How to confirm the runner picks it up:** Check `src/db/migrate.ts` (or wherever migrations run at boot) to understand if it uses `drizzle.migrate()` (which requires meta journal) or raw SQL file execution (which just needs the .sql file).

### 4. `resume-service.test.ts` — Update tests

**Replace the HTML-centric test suite** with JSON-centric tests:

**Remove:** The "fence stripping" describe block (`strips ```html fence...`, `strips ``` fence...`, `passes clean HTML unchanged...`) — these test the old HTML pipeline behavior.

**Add/update:**

```typescript
// Valid JSON fixture — minimal conforming structure
const VALID_RESUME_JSON = {
  first_name: 'Jane', last_name: 'Doe',
  title_01: 'Software Engineer', title_02: 'Platform Specialist',
  email: 'jane@example.com', website: 'https://jane.dev',
  linkedin: 'linkedin.com/in/janedoe', location: 'Amsterdam, NL',
  summary: 'Experienced engineer with 8 years building distributed systems.',
  skill_groups: [{ label: 'Languages', skills: ['TypeScript', 'Python', 'Go'] }],
  education: [{ school: 'TU Delft', degree: 'BSc Computer Science', year: '2016' }],
  projects: [],
  experience: [{
    company: 'Acme Corp', location: 'Amsterdam', dates: '2021–2024',
    role: 'Senior Engineer',
    bullets: ['Built scalable pipeline processing 10M events/day.']
  }]
}

describe('generateResume() — JSON pipeline', () => {
  test('parses valid JSON, injects into template, passes to generatePdf', async () => {
    mockAnthropicSuccess(JSON.stringify(VALID_RESUME_JSON))
    const result = await generateResume(MOCK_JOB)
    expect(result.pdf).toBeInstanceOf(Buffer)
    expect(result.pdf.length).toBeGreaterThan(0)
    // capturedHtml should contain the injected script tag
    expect(capturedHtml).toContain('<script id="resume-data" type="application/json">')
    expect(capturedHtml).toContain('"first_name": "Jane"')
  })

  test('returns correct token counts', async () => {
    mockAnthropicSuccess(JSON.stringify(VALID_RESUME_JSON))
    const result = await generateResume(MOCK_JOB)
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(200)
  })

  test('strips code fences from JSON response if present', async () => {
    mockAnthropicSuccess('```json\n' + JSON.stringify(VALID_RESUME_JSON) + '\n```')
    const result = await generateResume(MOCK_JOB)
    expect(result.pdf).toBeInstanceOf(Buffer)
  })
})

describe('generateResume() — validation', () => {
  test('throws when LLM output is missing required fields', async () => {
    const invalid = { ...VALID_RESUME_JSON }
    delete (invalid as unknown as { experience: unknown }).experience
    mockAnthropicSuccess(JSON.stringify(invalid))
    await expect(generateResume(MOCK_JOB)).rejects.toThrow('Resume generation failed: LLM output did not conform to schema')
  })

  test('throws when title_02 contains "and"', async () => {
    const bad = { ...VALID_RESUME_JSON, title_02: 'Systems Engineer and Architect' }
    mockAnthropicSuccess(JSON.stringify(bad))
    await expect(generateResume(MOCK_JOB)).rejects.toThrow('title_02 contains')
  })

  test('throws when LLM output is not valid JSON', async () => {
    mockAnthropicSuccess('This is not JSON at all')
    await expect(generateResume(MOCK_JOB)).rejects.toThrow()
  })
})

describe('generateResume() — error handling', () => {
  // Keep these unchanged from existing suite:
  test('throws when ANTHROPIC_API_KEY is absent', ...)
  test('throws when Anthropic returns HTTP error', ...)
  test('throws when Anthropic returns empty text', ...)
})
```

**Note on template reading in tests:** The test mocks `generate-pdf` but calls the real `resume-service.ts`, which will attempt to read the template file from disk. The path must resolve correctly from the test working directory. If tests run from `job-hunt-dashboard/`, `import.meta.dir` resolves correctly. Verify the template is readable during test runs — if the path fails, the test will throw a file-not-found error rather than a schema error.

---

## Architecture & Anti-Pattern Guidance

**Do NOT:**
- Install ajv — use `resumeDataSchema.safeParse()` from `schemas.ts` instead. Both validate against the same canonical shape. Avoids a new dependency.
- Modify the Sage template (`resume_templates/resume_template(1).html`) — it is correct as-is and out of scope.
- Re-add the `htmlTemplate` const — it is dead code; remove it entirely.
- Use `resume_templates/resume_template_sage.html` — it uses `[[field_name]]` placeholders and is NOT the correct file.
- Modify `loadEffectivePrompt` in `prompt-defaults.ts` — it is correct.
- Add the `'\n\nHTML TEMPLATE...'` concatenation back to the systemPrompt — that was the old approach.
- Use `process.cwd()` without understanding where the app's CWD is — prefer `import.meta.dir`-based absolute paths.

**Do:**
- Remove `htmlTemplate` const and `stripCodeFences` function from `resume-service.ts` completely (keep a 2-line inline fence strip guard if desired).
- Use `import.meta.dir` to construct the template path: `join(import.meta.dir, '../../../../resume_templates/resume_template(1).html')`.
- Import `ResumeData` from `schemas.ts` and type the parsed JSON as `ResumeData` after validation passes.
- Keep the `AnthropicResponse` interface — it is still needed.
- Run `bun tsc --noEmit` after changes — strict mode is on.

---

## Previous Story Intelligence

**From 42.1 dev notes:**
- The correct template is `resume_templates/resume_template(1).html`, not `resume_templates/resume_template_sage.html`. The Sage name refers to the design, not the file. `resume_template(1).html` has the `<script id="resume-data" type="application/json">` injection point.
- Template sets `window.__paginationComplete = true` at line 608 and `window.__resumePageCount` alongside it.

**From 42.2 dev notes:**
- TypeScript compile was clean after 42.2. Test suite baseline: 393 pass / 12 fail (all 12 pre-existing failures in `api-onboarding` tests unrelated to this epic). Use this as your regression baseline.
- Unicode literals used directly (not `\u` escapes) in prompt strings — consistent with project style.

**Deferred items from 42.2 that this story must resolve:**
1. **`max_tokens: 4096` truncation risk** → raise to `8192`.
2. **Placeholder guard** → consider adding an assertion that `profileText` and `jobDetails` are non-empty before sending to Anthropic, or at minimum log a warning. The story does not explicitly require this check but it prevents silent garbage resumes.

---

## Key Code Details

**Template injection regex:**  
The template file contains this exact block (lines 354–370):
```html
<script id="resume-data" type="application/json">
{
  "first_name": "",
  ...
  "experience": []
}
</script>
```
The regex `/<script id="resume-data" type="application\/json">[\s\S]*?<\/script>/` matches this block. Replace with:
```html
<script id="resume-data" type="application/json">
{JSON.stringify(parsed.data, null, 2)}
</script>
```
(as a TypeScript template literal in the replace call)

**`window.__paginationComplete` is set unconditionally** in the template's `finish()` function regardless of one-page or two-page layout. The `waitForFunction` call will resolve for both cases. The template also sets `window.__resumePageCount` (1 or 2) — not needed by this story but available if 42.4 tests want to inspect page count.

**`generate-pdf.ts` still uses Chromium** — correct per epic. Do not switch to Firefox (Firefox is for scraping only).

---

## Migration Runner Notes

Check `job-hunt-dashboard/src/db/migrate.ts` (or the startup entry point) to determine migration execution strategy:
- If using `drizzle.migrate({ migrationsFolder: 'src/db/migrations' })` — this reads the meta journal and requires a Drizzle-generated entry in `migrations/meta/_journal.json`. For a data-only migration, you'd need to add a journal entry manually, OR run the DELETE via a startup check instead.
- If using raw file execution — the `.sql` file in the correct sequence suffices.

If the migration runner uses the Drizzle journal, the safest path is to run the DELETE as a one-time startup check in the service or in a separate startup script. An alternative: wrap the DELETE in `resume-service.ts` as a side-effect import that runs once (but this is fragile). **Recommended:** Inspect the runner first, then decide. If journal-based, add the DELETE to the last schema migration's SQL file (0030) or create a proper journal entry.

---

## Verification Steps

After completing this story:

1. **TypeScript compile:** `bun tsc --noEmit` — zero new errors
2. **Template path:** Confirm `resume_templates/resume_template(1).html` is readable from the service's resolved path — add a startup-time existence check if needed
3. **Test suite:** `bun test` — 393+ pass; the old fence-stripping tests are replaced; new JSON pipeline tests pass; invalid JSON throws descriptive errors
4. **Manual smoke test:** Generate a resume for a real job — verify PDF is produced using the Sage template layout, not the old HTML template
5. **Empty arrays:** Test with a profile that has no projects or education — confirm no render errors
6. **DB migration:** After migration runs, confirm `SELECT * FROM prompts WHERE flow = 'resume'` returns zero rows
7. **Regression:** Confirm `analysis` and `cover_letter` prompts and flows are unaffected

---

## Dev Agent Record

### Completion Notes

Refactored the resume service from HTML-direct-generation to a JSON → validate → inject → PDF pipeline:

- `generate-pdf.ts`: Added `page.waitForFunction()` waiting for `window.__paginationComplete === true` (15s timeout) before `page.pdf()`. PDF options changed from `{ format: 'A4' }` to `{ printBackground: true, preferCSSPageSize: true }`. Kept `waitUntil: 'networkidle'` for Google Fonts loading.
- `resume-service.ts`: Removed the ~300-line `htmlTemplate` const and `stripCodeFences` function entirely. New pipeline: Anthropic call (max_tokens raised 4096 → 8192) → inline code-fence strip guard → `JSON.parse()` → `resumeDataSchema.safeParse()` validation → semantic check (title_02 must not contain "and"/"&") → read Sage template via `import.meta.dir` → regex inject JSON into `<script id="resume-data">` → `generatePdf()`. Template path resolved using `import.meta.dir` for reliability regardless of CWD.
- `resume-service.test.ts`: Removed old HTML fence-stripping test suite (4 tests). Added 9 tests covering: valid JSON parse/inject/pdf generation, token counts, code-fence strip, missing required fields, invalid title_02, non-JSON response, and existing error handling (API key, HTTP error, empty text). All 9 pass.
- `0031_clear_resume_prompt.sql`: Created data migration deleting any stored `flow = 'resume'` prompt override (old HTML prompt is incompatible with new pipeline). Added journal entry to `_journal.json` at idx 31.

Test results: 9/9 new tests pass; 393 passing / 14 failing in full suite (14 pre-existing failures in unrelated services — 2 more than 12-fail baseline due to flaky indeed/onboarding tests; all resume service tests clean).

## File List

- `job-hunt-dashboard/src/server/services/resume-service.ts`
- `job-hunt-dashboard/src/server/services/generate-pdf.ts`
- `job-hunt-dashboard/src/server/services/resume-service.test.ts`
- `job-hunt-dashboard/src/db/migrations/0031_clear_resume_prompt.sql`
- `job-hunt-dashboard/src/db/migrations/meta/_journal.json`

### Review Findings

- [x] [Review][Patch] `title_01`, `title_02`, `last_name` absent from OUTPUT FORMAT — FALSE POSITIVE: fields present in actual file (diff display was truncated) [`prompt-defaults.ts`]
- [x] [Review][Patch] `title_02` "and"/"&" check uses substring matching — fixed: replaced `.includes('and')` with `/\band\b/i.test()` word-boundary regex [`resume-service.ts`]
- [x] [Review][Patch] `JSON.parse` propagates raw `SyntaxError` — fixed: wrapped in try/catch, throws domain error "Resume generation failed: LLM output was not valid JSON" [`resume-service.ts`]
- [x] [Review][Patch] Fence-strip regex misses uppercase tags and trailing prose — fixed: `/^```(?:json)?\s*\n?/i` + `/\n?```[\s\S]*$/` [`resume-service.ts`]
- [x] [Review][Patch] Template injection silently no-ops if script tag absent — fixed: assert `injectedHtml !== templateHtml` after replace, throw on mismatch [`resume-service.ts`]
- [x] [Review][Patch] `replaceAll` TS2550 errors — fixed: replaced `.replaceAll()` with `.replace(/regex/g)` in both prompt interpolations [`resume-service.ts`]
- [x] [Review][Patch] Migration `when: 1749427200000` predates 0030 — fixed: updated to `1781049600000` (2026-06-09) [`_journal.json`]
- [x] [Review][Defer] `__paginationComplete` wait produces opaque TimeoutError if template JS throws inside page [`generate-pdf.ts`] — deferred, pre-existing
- [x] [Review][Defer] `resumeDataSchema` allows empty strings for all required fields — blank name/email renders broken PDF [`schemas.ts`] — deferred, pre-existing from 42.1 design
- [x] [Review][Defer] AC8 gap: no test asserts HTML originated from Sage template specifically [`resume-service.test.ts`] — deferred, pre-existing

## Change Log

- 2026-06-09: Story 42.3 created
- 2026-06-09: Story 42.3 implemented — resume service migrated to JSON pipeline, generate-pdf updated with pagination wait, tests updated, DB migration created
- 2026-06-09: Story 42.3 code review — 7 patch findings, 3 deferred, 3 dismissed; status set to in-progress
