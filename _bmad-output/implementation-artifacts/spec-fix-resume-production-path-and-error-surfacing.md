---
title: 'fix-resume-generation-production-path-and-error-surfacing'
type: 'bugfix'
created: '2026-06-09'
status: 'done'
baseline_commit: '9dd49beb713010b91378db339b5bcd3e15c93b85'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Resume generation silently fails in production (Docker) because `resume_templates/` lives at the workspace root, outside the Docker build context, so the container never contains the template. Additionally, the route handler swallows the actual error and returns a generic `"Resume generation failed"` message, making diagnosis impossible in both dev and production.

**Approach:** Move `resume_templates/` into `job-hunt-dashboard/` (inside the Docker build context), update the three source-file path references, add a `COPY` line to the Dockerfile, and pass the real error message through to the API response.

## Boundaries & Constraints

**Always:**
- Preserve all template files as-is — do not modify HTML content
- Error messages returned to the client must not expose API keys, internal paths, or stack traces — the descriptive strings from `resume-service.ts` (e.g. schema validation details) are already safe to surface
- Use `git mv` to move the directory so history is preserved

**Ask First:**
- If any other code outside `job-hunt-dashboard/` references `resume_templates/` directly

**Never:**
- Modify the template HTML/JS pagination logic
- Change the Docker base image or `hitlobster-deps`
- Add error-handling shims or retry logic — the fix is structural, not defensive

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Success | Job with description, valid Anthropic response | 200 PDF download | N/A |
| Schema failure | LLM returns JSON missing required fields | 502 + `{ error: "Resume generation failed: LLM output did not conform to schema — ..." }` | Descriptive message from `resume-service.ts` |
| Template not found | Template file missing from disk | 502 + `{ error: "ENOENT: no such file or directory, open '...'" }` | Raw error message surfaced |
| ANTHROPIC_API_KEY missing | No key configured | 503 + `{ error: "Resume generation is not configured" }` | Existing specific handler preserved |

</frozen-after-approval>

## Code Map

- `resume_templates/resume_template(1).html` -- template file to move into `job-hunt-dashboard/`
- `job-hunt-dashboard/src/server/services/resume-service.ts:97` -- template path via `import.meta.dir` (needs `../../../../` → `../../../`)
- `job-hunt-dashboard/src/server/services/resume-contract.test.ts:9` -- same path constant (needs update)
- `job-hunt-dashboard/src/server/services/resume-e2e.test.ts:142` -- same path constant (needs update)
- `job-hunt-dashboard/src/server/routes/api-jobs.ts:421` -- returns generic `'Resume generation failed'` instead of `message`
- `job-hunt-dashboard/Dockerfile` -- production stage missing `COPY resume_templates ./resume_templates`
- `job-hunt-dashboard/src/server/routes/api-resume.test.ts:82-90` -- `CREATE_WEBHOOK_RUNS_TABLE` missing `user_id` column

## Tasks & Acceptance

**Execution:**
- [x] `resume_templates/ → job-hunt-dashboard/resume_templates/` -- `git mv` directory into build context
- [x] `job-hunt-dashboard/src/server/services/resume-service.ts` -- change path from `../../../../resume_templates/` to `../../../resume_templates/`
- [x] `job-hunt-dashboard/src/server/services/resume-contract.test.ts` -- same path fix: `../../../../` → `../../../`
- [x] `job-hunt-dashboard/src/server/services/resume-e2e.test.ts` -- same path fix: `../../../../` → `../../../`
- [x] `job-hunt-dashboard/src/server/routes/api-jobs.ts` -- line 421: return `c.json({ error: message }, 502)` instead of `c.json({ error: 'Resume generation failed' }, 502)`
- [x] `job-hunt-dashboard/Dockerfile` -- add `COPY resume_templates ./resume_templates` to production stage
- [x] `job-hunt-dashboard/src/server/routes/api-resume.test.ts` -- add `user_id INTEGER NOT NULL DEFAULT 1` to `CREATE_WEBHOOK_RUNS_TABLE`

**Acceptance Criteria:**
- Given `resume_templates/` is inside `job-hunt-dashboard/`, when the Docker image is built, then `COPY resume_templates` succeeds and the template is present at `/app/resume_templates/` in the container
- Given the Anthropic API returns JSON that fails schema validation, when generation is triggered, then the UI shows the specific validation error message (not just "Resume generation failed")
- Given the template file path is updated, when all resume tests run, then all pass with zero errors in the console

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun test src/server/services/resume-service.test.ts src/server/services/resume-contract.test.ts src/server/routes/api-resume.test.ts` -- expected: all pass, zero `[webhook-runs] Failed to record run` console errors

## Suggested Review Order

**Template path fix**

- Root service change: path now resolves inside the app directory
  [`resume-service.ts:97`](../../job-hunt-dashboard/src/server/services/resume-service.ts#L97)

**Error surfacing**

- Route now passes real error through; replace generic 502 string with `message`
  [`api-jobs.ts:421`](../../job-hunt-dashboard/src/server/routes/api-jobs.ts#L421)

**Docker build**

- Production stage now includes the templates directory
  [`Dockerfile:27`](../../job-hunt-dashboard/Dockerfile#L27)

**Supporting files**

- Test path references updated to match moved directory
  [`resume-contract.test.ts:9`](../../job-hunt-dashboard/src/server/services/resume-contract.test.ts#L9)
- Test path updated
  [`resume-e2e.test.ts:142`](../../job-hunt-dashboard/src/server/services/resume-e2e.test.ts#L142)
- Test table schema: `user_id` column added to silence `recordRun` errors
  [`api-resume.test.ts:87`](../../job-hunt-dashboard/src/server/routes/api-resume.test.ts#L87)
