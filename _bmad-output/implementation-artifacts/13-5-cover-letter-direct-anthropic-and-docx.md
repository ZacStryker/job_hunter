# Story 13.5: Cover Letter — Direct Anthropic + Docx Download

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-5-cover-letter-direct-anthropic-and-docx  
**Status:** backlog  
**Depends on:** 13-4 (for ANTHROPIC_API_KEY)

---

## User Story

As a job seeker, I want cover letters generated directly by the app using the Anthropic API, and I want to download them as a .docx file, so that I don't need n8n running to use this feature.

---

## Acceptance Criteria

### AC1 — cover-letter-service.ts rewritten
- `callN8nWebhook` replaced with a direct `POST` to `https://api.anthropic.com/v1/messages`
- Uses `ANTHROPIC_API_KEY` env var (header: `x-api-key`)
- Model: `claude-sonnet-4-6`, `max_tokens: 2048`
- Reads profile from DB (`profile` table) — no HTTP round-trip
- System prompt: expert cover letter writer + candidate profile (name, email, phone, location, LinkedIn, GitHub, summary, experience, skills, education) + target: ML/GenAI engineering roles
- User prompt: requests 3-paragraph letter, no emdashes, references 2-3 specific achievements, no date/address block, starts with salutation
- Returns the generated cover letter text string
- `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` removed from `.env.example`

### AC2 — build-docx.ts utility created
- New `src/server/services/build-docx.ts` exports `buildDocx(text: string): Buffer`
- Generates a minimal valid `.docx` (OOXML ZIP) from plain text — ported from the n8n flow's pure-JS ZIP builder
- Paragraphs split on newlines; empty lines become spacer paragraphs; 12pt body text
- Returns a `Buffer` of the binary docx

### AC3 — Docx download endpoint
- New `GET /api/cover-letters/:id/docx` route added to `api-cover-letter.ts`
- Fetches the cover letter text from the `cover_letters` table by id
- Calls `buildDocx(text)` and returns the binary with:
  - `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `Content-Disposition: attachment; filename="Cover Letter - <company> - <jobTitle>.docx"` (company/title from the associated job)
- Returns `404` if cover letter id not found

### AC4 — Download button in UI
- A "Download .docx" button appears in the cover letter display area in `JobDrawer` when a cover letter exists
- Clicking it fetches `GET /api/cover-letters/:id/docx` and triggers a browser file download
- Button shows a loading state while fetching

### AC5 — Tests
- `build-docx.test.ts`: unit test verifies output is a valid ZIP buffer containing `word/document.xml` and `[Content_Types].xml`
- `api-cover-letter.test.ts`: contract test for `GET /api/cover-letters/:id/docx` — returns 200 with correct content-type; returns 404 for unknown id
- All tests pass
