---
title: 'Optional project URL rendered as resume hyperlink'
type: 'feature'
created: '2026-06-13'
status: 'done'
context: []
baseline_commit: '44d91008becb0c77c2939fc094bab114c235ffa4'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Profile projects have no URL field. Users want a project to optionally link to its page on the generated resume — the project **name** should become a hyperlink that opens in a new tab, with no visible URL text. The URL is irrelevant to discovery, analysis, and cover-letter generation and must not be sent to those LLM flows (token waste).

**Approach:** Add an optional `url` to the profile project schema and the create/edit form. Carry it through only the resume pipeline: include it in the resume prompt's candidate profile, add it to the resume JSON schema so the LLM copies it onto the chosen project, and update the active resume template to wrap the project name in an anchor when a URL is present. Explicitly strip `url` from the analysis flow (the only non-resume flow that serializes whole project objects).

## Boundaries & Constraints

**Always:** `url` is optional — stored as `null` on profile projects when absent (per project null convention), and an empty string in resume JSON when none. The resume template must render the project **name** as the link (`target="_blank" rel="noopener noreferrer"`); never print the raw URL as text; link must be visually unobtrusive (inherit color, no jarring underline). Only render the anchor when the URL is non-empty. The LLM must copy a chosen project's URL verbatim into its `url` field (matching by name post-filter is unreliable, so it travels with the project).

**Ask First:** Adding URL-format validation/normalization beyond trimming (current form fields only trim). Updating the non-active resume templates (cyan/ember/gold/sage/violet) — only `resume_template(1).html` is wired into `resume-service.ts`.

**Never:** Add `url` to the discovery, analysis, or cover-letter prompt text. Change `cover-letter-service.ts` / `discovery-service.ts` (they already exclude it). Make `url` required anywhere. Add a DB migration (profile data is a JSON blob, not columns).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Project with URL → resume | project `{name, description, url}` | Resume project name is an `<a href=url target=_blank>`; URL text not shown | N/A |
| Project without URL → resume | `url` null/'' | Plain project name, no anchor | N/A |
| Analysis / cover / discovery flows | any project with URL | URL absent from all three prompt payloads | N/A |
| URL containing `"` | `https://x?a="b` | href is attribute-escaped; no markup breakout | escape quotes |
| Existing profiles (no url) | stored JSON lacks url | Parses with `url` defaulting to null; form shows empty URL field | N/A |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/shared/schemas.ts` -- `projectEntrySchema` (L202) add optional `url`; `resumeDataSchema.projects` (L358) add `url`.
- `job-hunt-dashboard/src/client/routes/config/profile-resume.tsx` -- `AddProjectSheet` (L1514) and `ProjectEntryRow` (L1634): add optional URL field to create/edit.
- `job-hunt-dashboard/src/server/services/resume-service.ts` -- `buildProfileText` projectLines (L30): include URL so the LLM sees it.
- `job-hunt-dashboard/src/server/services/prompt-defaults.ts` -- resume JSON shape (L56) + projects rule (L82): add `url` field + copy-verbatim instruction.
- `job-hunt-dashboard/resume_templates/resume_template(1).html` -- `projectsHTML()` (L416) + `.project-name` CSS (L203): name→anchor when url present.
- `job-hunt-dashboard/src/server/services/analysis-service.ts` -- `Projects:` mapping (L154): strip url to `{name, description}`.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/schemas.ts` -- add `url: z.string().nullable().default(null)` to `projectEntrySchema`; add `url: z.string().default('')` to the `resumeDataSchema.projects` object. -- single source of truth for both profile input and resume output.
- [x] `src/client/routes/config/profile-resume.tsx` -- in `AddProjectSheet` and `ProjectEntryRow` add an optional "Project URL" `Input` (read-only view + editable), seed edit state from `project.url ?? ''`, and include `url: url.trim() || null` in every `onSave` payload. -- lets users set/edit the URL.
- [x] `src/server/services/resume-service.ts` -- in `buildProfileText`, append the URL to each project line when present (e.g. `${p.name}: ${p.description}${p.url ? ` [URL: ${p.url}]` : ''}`). -- exposes URL to the resume LLM only.
- [x] `src/server/services/prompt-defaults.ts` -- add `"url": "string"` to the resume `projects` JSON shape and a rule: copy the project's URL verbatim into `url`, empty string if none. -- LLM carries URL onto the selected project.
- [x] `resume_templates/resume_template(1).html` -- in `projectsHTML()` render `project-name` as `<a href target=_blank rel=noopener noreferrer>` when `p.url` is truthy (escape `"` in href in addition to `esc`); add `.project-name a { color: inherit; text-decoration: none; }`. -- name becomes the unobtrusive hyperlink.
- [x] `src/server/services/analysis-service.ts` -- map `Projects` to `{ name, description }` only. -- keeps URL out of the analysis prompt.

**Acceptance Criteria:**
- Given a profile project with a URL, when a resume is generated, then the project name renders as a hyperlink to that URL opening in a new tab and the URL string is not printed.
- Given a profile project without a URL, when a resume is generated, then the project name renders as plain text (no anchor).
- Given any project with a URL, when discovery, analysis, or cover-letter generation runs, then the URL does not appear in the prompt sent to the model.
- Given a previously saved profile without project URLs, when the profile form loads, then it parses without error and shows empty URL fields.

## Design Notes

The LLM filters/reorders projects in the resume flow, so the URL must ride along inside each project object rather than be injected by the service afterward. The template's `esc()` only escapes `&<>`; the href additionally needs `"` escaped to avoid attribute breakout. Keeping the link `color: inherit; text-decoration: none` satisfies "don't print the link text" — the styled name simply becomes clickable.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bunx tsc --noEmit 2>&1 | grep -E "schemas|profile-resume|resume-service|analysis-service"` -- expected: no errors in changed files
- `cd job-hunt-dashboard && bun test src/server/services/resume-service.test.ts src/server/services/analysis-service.test.ts 2>&1 | tail -5` -- expected: pass (run only those that exist)
- `cd job-hunt-dashboard && bun run build` -- expected: build succeeds

**Manual checks:**
- Add a project with a URL in the profile form, generate a resume for a job → name is clickable, opens new tab, URL not shown.
- Inspect the analysis prompt (or its builder) → confirm no project URL present.

## Suggested Review Order

**Data contract**

- Source of truth: `url` on the profile project (nullable) and on the resume JSON output (default '').
  [`schemas.ts:205`](../../job-hunt-dashboard/src/shared/schemas.ts#L205)
  [`schemas.ts:359`](../../job-hunt-dashboard/src/shared/schemas.ts#L359)

**Resume pipeline (URL flows in)**

- Expose URL to the resume LLM via the candidate profile text.
  [`resume-service.ts:30`](../../job-hunt-dashboard/src/server/services/resume-service.ts#L30)

- Instruct the LLM to copy the URL verbatim onto the chosen project.
  [`prompt-defaults.ts:83`](../../job-hunt-dashboard/src/server/services/prompt-defaults.ts#L83)

- The payoff: project name becomes an unobtrusive new-tab anchor; href is attribute-escaped.
  [`resume_template(1).html:421`](../../job-hunt-dashboard/resume_templates/resume_template(1).html#L421)

**Flow isolation (URL kept out)**

- Strip URL from the analysis prompt (only flow that serialized whole project objects).
  [`analysis-service.ts:154`](../../job-hunt-dashboard/src/server/services/analysis-service.ts#L154)

**UI**

- Optional URL field in add/edit project; committed as `url.trim() || null`.
  [`profile-resume.tsx:1538`](../../job-hunt-dashboard/src/client/routes/config/profile-resume.tsx#L1538)
