# Story 13.6: Resume — Direct Anthropic + Playwright PDF

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-6-resume-direct-anthropic-and-playwright-pdf  
**Status:** backlog  
**Depends on:** 13-4 (for ANTHROPIC_API_KEY)

---

## User Story

As a job seeker, I want tailored resumes generated in-app and returned as a downloadable PDF, so that I don't need n8n or a PDFBolt account to generate resumes.

---

## Acceptance Criteria

### AC1 — resume-service.ts rewritten
- `callResumeWebhook` replaced with a function that returns a `Buffer` (PDF binary)
- Calls `https://api.anthropic.com/v1/messages` with `ANTHROPIC_API_KEY`
- Model: `claude-sonnet-4-6`, `max_tokens: 4096`
- Reads profile from DB (`profile` table) — no HTTP round-trip
- System prompt: expert resume writer + inline HTML resume template (ported from n8n flow, Google Fonts `Inter` replaced with `system-ui, sans-serif` for offline compatibility) + candidate profile
- User prompt: requests tailored functional HTML resume for the given role; may reorder/reword skills and bullets for relevance; no emdashes; descending chronological order
- Strips markdown code fences from Claude's response before passing to PDF generation

### AC2 — generate-pdf.ts service created
- New `src/server/services/generate-pdf.ts` exports `generatePdf(html: string): Promise<Buffer>`
- Launches Playwright Chromium headless browser
- Calls `page.setContent(html, { waitUntil: 'networkidle' })`
- Calls `page.pdf({ format: 'A4' })` and returns the result as a `Buffer`
- Closes browser after each call

### AC3 — Playwright moved to production dependency
- `playwright` moved from `devDependencies` to `dependencies` in `package.json`
- `.env.example` includes a comment: `# One-time setup: bunx playwright install chromium`

### AC4 — Resume endpoint returns PDF
- `POST /api/resume` (or existing resume route) returns the PDF binary directly
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="Zac Stryker - Resume - <company> - <jobTitle>.pdf"`
- Request body: `{ jobId: number }` — job data fetched from DB by id (not passed in body)
- Returns `503` if `ANTHROPIC_API_KEY` is not set
- Returns `404` if job not found
- `N8N_RESUME_WEBHOOK_URL` removed from `.env.example`

### AC5 — UI updated for PDF download
- Generate Resume button in `JobDrawer` (or wherever it currently lives) triggers `POST /api/resume`
- On success, response blob is downloaded as a PDF file via browser download
- Replaces the current fire-and-forget toast-only behavior
- Button shows loading state (`isPending`) during generation (Playwright + Claude may take 10–20s)

### AC6 — Tests
- `resume-service.test.ts`: unit test that Claude response with markdown fences is correctly stripped to clean HTML before PDF generation
- `api-resume.test.ts` (or equivalent): contract test that endpoint returns 200 with `content-type: application/pdf`; returns 503 when `ANTHROPIC_API_KEY` absent; returns 404 for unknown jobId
- Playwright `generatePdf` is mocked in contract tests (do not launch a real browser in unit/contract tests)
- All tests pass
