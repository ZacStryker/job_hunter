# Story 13.1: Remove Google Sheets Integration

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-1-remove-google-sheets-integration  
**Status:** backlog  

---

## User Story

As a developer setting up this project, I want the Google Sheets dependency removed entirely, so that I don't need to create a GCP project, enable APIs, or manage OAuth tokens just to run the app.

---

## Acceptance Criteria

### AC1 — Sheets sync service deleted
- `src/server/services/sheets-sync.ts` and its test file are deleted
- `src/server/services/oauth-client.ts` and its test file are deleted

### AC2 — Sync API route deleted
- `src/server/routes/api-sync.ts` and its test file are deleted
- The route is unmounted from `src/index.ts`

### AC3 — Sync button removed from UI
- The Sync button is removed from `Layout.tsx`
- No references to sync remain in the nav or toolbar

### AC4 — Google env vars removed
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID` are removed from `.env.example`
- The startup env var validation in `src/index.ts` no longer checks for these keys

### AC5 — Schema comments updated
- `src/db/schema.ts` comments are updated: "Sheets-owned" references replaced with "scraper-owned"; "user-owned" section label retained
- No functional upsert logic changes in this story — that is handled in 13-2

### AC6 — project-context.md updated
- Rules referencing Google Sheets, OAuth, or Sheets-owned/user-owned column discipline are updated or removed
- "Sheets-sync is the only file that knows Sheets column names" rule is removed

### AC7 — All tests pass
- `bun test` passes with no failures after deletions
