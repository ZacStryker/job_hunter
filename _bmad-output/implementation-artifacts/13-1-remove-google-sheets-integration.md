# Story 13.1: Remove Google Sheets Integration

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-1-remove-google-sheets-integration  
**Status:** ready-for-dev  
**Date:** 2026-04-14

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
- `SyncButton.tsx` component file deleted (dead code)
- `useSyncMutation.ts` hook file deleted (dead code)

### AC4 — Google env vars removed
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID` are removed from `.env.example`
- The startup env var validation in `src/index.ts` no longer checks for these keys

### AC5 — Schema comments updated
- `src/db/schema.ts` comments are updated: "Sheets-owned" references replaced with "scraper-owned"; "user-owned" section label retained
- No functional upsert logic changes in this story — that is handled in 13-2

### AC6 — project-context.md updated
- Rules referencing Google Sheets, OAuth, or Sheets-owned/user-owned column discipline are updated or removed
- "Sheets-sync is the only file that knows Sheets column names" rule is removed
- Required env vars list updated to remove Google keys
- Data ownership section updated: "Sheets-owned" → "scraper-owned" throughout

### AC7 — All tests pass
- `bun test` passes with no failures after deletions

---

## Tasks/Subtasks

- [ ] Task 1: Delete Sheets service files (AC1)
  - [ ] Delete `src/server/services/sheets-sync.ts`
  - [ ] Delete `src/server/services/sheets-sync.test.ts`
  - [ ] Delete `src/server/services/oauth-client.ts`
  - [ ] Delete `src/server/services/oauth-client.test.ts`

- [ ] Task 2: Delete sync API route (AC2)
  - [ ] Delete `src/server/routes/api-sync.ts`
  - [ ] Delete `src/server/routes/api-sync.test.ts`
  - [ ] Remove `import syncRoute from './server/routes/api-sync'` from `src/index.ts`
  - [ ] Remove `app.route('/api/sync', syncRoute)` from `src/index.ts`

- [ ] Task 3: Remove Sync button and related UI code (AC3)
  - [ ] Delete `src/client/components/shared/SyncButton.tsx`
  - [ ] Delete `src/client/hooks/useSyncMutation.ts`
  - [ ] Update `src/client/components/shared/Layout.tsx` per Implementation Notes

- [ ] Task 4: Remove Google env vars (AC4)
  - [ ] Remove `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID` from `REQUIRED_ENV_VARS` array in `src/index.ts`
  - [ ] Remove those four lines from `.env.example`

- [ ] Task 5: Update schema.ts comments (AC5)
  - [ ] Replace `// Sheets-owned (overwritten on every sync — do NOT protect)` comment with `// Scraper-owned (overwritten on every ingest — do NOT protect)` in `src/db/schema.ts`
  - [ ] Update comment on line 41 for `syncResultSchema` in `src/shared/schemas.ts`: change "and POST /api/sync" to just "POST /api/ingest"

- [ ] Task 6: Update project-context.md (AC6)
  - [ ] Remove "Server services in `src/server/services/` — `sheets-sync.ts` is the ONLY file that knows Sheets column names" from File Organization section
  - [ ] Update Data Ownership section: replace "Sheets-owned" with "scraper-owned" throughout the rules
  - [ ] Update "Required env vars" section: remove the four Google env vars
  - [ ] Update "Critical Don't-Miss Rules → Data Ownership" section: change terminology from "Sheets-owned" to "scraper-owned"
  - [ ] Remove OAuth/Sheets security rule from Security section
  - [ ] Remove "sheets-sync.ts is the only file that knows Sheets column names" rule from Security section

- [ ] Task 7: Run tests and verify (AC7)
  - [ ] Run `bun test` from `job-hunt-dashboard/` directory
  - [ ] Confirm zero failures

---

## Implementation Notes

### Files Being Deleted (complete list)

```
src/server/services/sheets-sync.ts       ← imports oauth-client + Google Sheets API
src/server/services/sheets-sync.test.ts  ← mocks sheets-sync + ingest-service
src/server/services/oauth-client.ts      ← Google OAuth2 token refresh logic
src/server/services/oauth-client.test.ts ← tests for oauth token refresh
src/server/routes/api-sync.ts            ← POST /api/sync (calls sheets-sync → ingestJobs)
src/server/routes/api-sync.test.ts       ← 4 tests using mock.module() for sheets-sync
src/client/components/shared/SyncButton.tsx   ← thin Button wrapper
src/client/hooks/useSyncMutation.ts           ← useMutation for POST /api/sync
```

**Do NOT delete or modify:**
- `src/server/services/ingest-service.ts` — still used by `api-ingest.ts` (POST /api/ingest remains)
- `src/server/routes/api-ingest.ts` — external ingest endpoint stays
- `src/shared/schemas.ts` `syncResultSchema` / `SyncResult` — still used by `/api/ingest` response shape

### Layout.tsx — Exact Changes Required

Current file imports:
```ts
import { SyncButton } from './SyncButton'           // DELETE this import
import { useSyncMutation } from '../../hooks/useSyncMutation'  // DELETE this import
```

Current ActiveAlert type:
```ts
type ActiveAlert =
  | { kind: 'sync-success'; data: { added: number; updated: number } }  // DELETE this line
  | { kind: 'webhook-success'; label: string }
  | { kind: 'error'; label: string; message: string }
  | null
```

Inside the component body, DELETE:
```ts
const syncMutation = useSyncMutation()
```

DELETE both sync useEffects (lines ~24–37):
```ts
useEffect(() => {
  if (syncMutation.isSuccess) {
    setActiveAlert({ kind: 'sync-success', data: syncMutation.data })
    const t = setTimeout(() => setActiveAlert(null), 4000)
    return () => clearTimeout(t)
  }
}, [syncMutation.isSuccess])

useEffect(() => {
  if (syncMutation.isError) {
    setActiveAlert({ kind: 'error', label: 'Sync', message: syncMutation.error?.message ?? 'Unknown error' })
    const t = setTimeout(() => setActiveAlert(null), 4000)
    return () => clearTimeout(t)
  }
}, [syncMutation.isError])
```

In the JSX action buttons area, DELETE the SyncButton:
```tsx
<SyncButton onSync={() => syncMutation.mutate()} isPending={syncMutation.isPending} />
```

In the alert render area, DELETE the `sync-success` block:
```tsx
{activeAlert.kind === 'sync-success' && (
  <Alert>
    <AlertTitle>Sync complete</AlertTitle>
    <AlertDescription>
      {activeAlert.data.added} records added, {activeAlert.data.updated} updated
    </AlertDescription>
  </Alert>
)}
```

In the `error` alert render, simplify the description — remove the sync-specific suffix:
```tsx
// BEFORE:
<AlertDescription>
  {activeAlert.message}
  {activeAlert.label === 'Sync' ? ' — No data was modified.' : ''}
</AlertDescription>

// AFTER:
<AlertDescription>
  {activeAlert.message}
</AlertDescription>
```

### src/index.ts — Exact Changes Required

Remove from `REQUIRED_ENV_VARS`:
```ts
'GOOGLE_CLIENT_ID',
'GOOGLE_CLIENT_SECRET',
'GOOGLE_REFRESH_TOKEN',
'GOOGLE_SPREADSHEET_ID',
```

Remove import line:
```ts
import syncRoute from './server/routes/api-sync'
```

Remove route mount line:
```ts
app.route('/api/sync', syncRoute)
```

### .env.example — Lines to Remove

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_SPREADSHEET_ID=
```

### src/db/schema.ts — Comment Update Only

Change the comment above the scraper-owned columns block:
```ts
// BEFORE:
// Sheets-owned (overwritten on every sync — do NOT protect)

// AFTER:
// Scraper-owned (overwritten on every ingest — do NOT protect)
```

No other functional changes to schema.ts in this story.

### project-context.md — Sections to Update

File: `_bmad-output/project-context.md`

1. **File Organization section** — remove this rule:
   > `Server services in src/server/services/ — sheets-sync.ts is the ONLY file that knows Sheets column names`

2. **Development Workflow Rules** — update Required env vars:
   > Remove: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID` from the list
   > Remove: `— app exits at startup if any are missing` reference to Google keys

3. **Critical Don't-Miss Rules → Data Ownership** — update terminology:
   > Replace all occurrences of "Sheets-owned" with "scraper-owned"
   > The invariant still applies: scraper-owned columns must never appear in PATCH allowlist

4. **Security section** — remove:
   > The two bullets about Google OAuth tokens and sheets-sync being the only file that knows Sheets column names

5. **API & Type Safety section** — remove SyncResult if listed; it's still valid but no longer Google-related

---

## Architecture Guardrails

- TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`) — after deleting files, ALL their imports in remaining files MUST be cleaned up. Layout.tsx has 3 things to clean: the two imports + the `const syncMutation` declaration + the sync useEffects + the sync JSX + the sync alert type + the sync alert render.
- `ingest-service.ts` is NOT being deleted — it's the underlying upsert engine used by `api-ingest.ts` directly. Do not conflate "removing Sheets sync" with "removing ingest capability."
- `syncResultSchema` and `SyncResult` type in `schemas.ts` are kept — they describe the `{ added, updated }` response shape for POST /api/ingest (which stays). Only update the comment.
- `.env.example` keeps all non-Google vars intact: `PORT`, `DB_PATH`, `IMAP_*`, `N8N_*`, `DISCOVERY_WEBHOOK_URL`, `ANALYSIS_WEBHOOK_URL` all remain.
- No migration needed — no schema changes in this story.
- No new files to create — this story is purely deletions and edits.

---

## File Checklist

### Files to delete:
- `src/server/services/sheets-sync.ts`
- `src/server/services/sheets-sync.test.ts`
- `src/server/services/oauth-client.ts`
- `src/server/services/oauth-client.test.ts`
- `src/server/routes/api-sync.ts`
- `src/server/routes/api-sync.test.ts`
- `src/client/components/shared/SyncButton.tsx`
- `src/client/hooks/useSyncMutation.ts`

### Files to modify:
- `src/index.ts` — remove syncRoute import/mount + remove 4 Google REQUIRED_ENV_VARS
- `src/client/components/shared/Layout.tsx` — remove all sync-related code (see Implementation Notes)
- `.env.example` — remove 4 Google env var lines
- `src/db/schema.ts` — update "Sheets-owned" comment to "scraper-owned"
- `src/shared/schemas.ts` — update syncResultSchema comment (remove "/api/sync" reference)
- `_bmad-output/project-context.md` — update rules per Implementation Notes

---

## Dev Agent Record

### Implementation Plan

_To be filled by dev agent_

### Completion Notes

_To be filled by dev agent_

---

## File List

_To be filled by dev agent_

---

## Change Log

_To be filled by dev agent_
