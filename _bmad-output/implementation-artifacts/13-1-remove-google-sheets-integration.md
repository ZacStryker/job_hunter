# Story 13.1: Remove Google Sheets Integration

**Epic:** 13 — Remove n8n & Google Sheets — Self-Contained Pipeline  
**Story ID:** 13-1-remove-google-sheets-integration  
**Status:** done  
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

- [x] Task 1: Delete Sheets service files (AC1)
  - [x] Delete `src/server/services/sheets-sync.ts`
  - [x] Delete `src/server/services/sheets-sync.test.ts`
  - [x] Delete `src/server/services/oauth-client.ts`
  - [x] Delete `src/server/services/oauth-client.test.ts`

- [x] Task 2: Delete sync API route (AC2)
  - [x] Delete `src/server/routes/api-sync.ts`
  - [x] Delete `src/server/routes/api-sync.test.ts`
  - [x] Remove `import syncRoute from './server/routes/api-sync'` from `src/index.ts`
  - [x] Remove `app.route('/api/sync', syncRoute)` from `src/index.ts`

- [x] Task 3: Remove Sync button and related UI code (AC3)
  - [x] Delete `src/client/components/shared/SyncButton.tsx`
  - [x] Delete `src/client/hooks/useSyncMutation.ts`
  - [x] Update `src/client/components/shared/Layout.tsx` per Implementation Notes

- [x] Task 4: Remove Google env vars (AC4)
  - [x] Remove `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID` from `REQUIRED_ENV_VARS` array in `src/index.ts`
  - [x] Remove those four lines from `.env.example`

- [x] Task 5: Update schema.ts comments (AC5)
  - [x] Replace `// Sheets-owned (overwritten on every sync — do NOT protect)` comment with `// Scraper-owned (overwritten on every ingest — do NOT protect)` in `src/db/schema.ts`
  - [x] Update comment on line 41 for `syncResultSchema` in `src/shared/schemas.ts`: change "and POST /api/sync" to just "POST /api/ingest"

- [x] Task 6: Update project-context.md (AC6)
  - [x] Remove "Server services in `src/server/services/` — `sheets-sync.ts` is the ONLY file that knows Sheets column names" from File Organization section
  - [x] Update Data Ownership section: replace "Sheets-owned" with "scraper-owned" throughout the rules
  - [x] Update "Required env vars" section: remove the four Google env vars
  - [x] Update "Critical Don't-Miss Rules → Data Ownership" section: change terminology from "Sheets-owned" to "scraper-owned"
  - [x] Remove OAuth/Sheets security rule from Security section
  - [x] Remove "sheets-sync.ts is the only file that knows Sheets column names" rule from Security section

- [x] Task 7: Run tests and verify (AC7)
  - [x] Run `bun test` from `job-hunt-dashboard/` directory
  - [x] Confirm zero failures

### Review Findings

- [x] [Review][Patch] Broken import of deleted `useSyncMutation` in `index.tsx` — AC3 miss: `src/client/routes/index.tsx` was not in the story's file checklist but imports the now-deleted hook, instantiates `syncMutation`, passes it to `EmptyState`, and renders a Sync button. This causes a compile/runtime crash when the pipeline route loads. [`src/client/routes/index.tsx:5,48,77,114`]
- [x] [Review][Patch] Stale empty state copy: "Hit Sync to pull from Google Sheets" — AC3 miss: `EmptyState` in `index.tsx` line 55 still displays sync-flavoured copy and a Sync/Syncing button wired to the deleted mutation. [`src/client/routes/index.tsx:55`]
- [x] [Review][Patch] `project-context.md` hook example names deleted hook — AC6 miss: line 100 still reads `(e.g., useSyncMutation.ts)` — should reference a surviving hook. [`_bmad-output/project-context.md:100`]
- [x] [Review][Patch] `schema.ts` user-owned comments still say "on sync" — AC5 partial miss: two comments on the user-owned block read "NEVER overwritten on sync" but the scraper-owned comment was correctly updated to "on ingest". [`job-hunt-dashboard/src/db/schema.ts:24,30`]
- [x] [Review][Defer] `ingestJobs()` not awaited in `api-ingest.ts` [`job-hunt-dashboard/src/server/routes/api-ingest.ts`] — deferred, pre-existing
- [x] [Review][Defer] `discoveryMutation.error` accessed without null guard in Layout.tsx — deferred, pre-existing
- [x] [Review][Defer] `useEffect` on `.isError` doesn't re-fire on repeated mutation errors — deferred, pre-existing

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

Purely a deletion + comment-update story. No new files created. Deleted 8 files, modified 6.
All changes followed the exact instructions in Implementation Notes — no deviations required.

### Completion Notes

- Deleted 8 files: sheets-sync.ts/test, oauth-client.ts/test, api-sync.ts/test, SyncButton.tsx, useSyncMutation.ts
- Removed syncRoute import and mount from src/index.ts
- Removed 4 Google env var entries from REQUIRED_ENV_VARS and .env.example
- Cleaned Layout.tsx: removed 2 imports, syncMutation state/effects, SyncButton JSX, sync-success alert type/render, sync-specific error suffix
- Updated schema.ts comment: "Sheets-owned" → "Scraper-owned"
- Updated schemas.ts comments to remove /api/sync and Sheets references
- Updated project-context.md: File Organization, Required env vars, Data Ownership, Security, UI Error Handling, TanStack Query sections
- bun test: 121 pass, 0 fail

---

## File List

### Deleted
- `job-hunt-dashboard/src/server/services/sheets-sync.ts`
- `job-hunt-dashboard/src/server/services/sheets-sync.test.ts`
- `job-hunt-dashboard/src/server/services/oauth-client.ts`
- `job-hunt-dashboard/src/server/services/oauth-client.test.ts`
- `job-hunt-dashboard/src/server/routes/api-sync.ts`
- `job-hunt-dashboard/src/server/routes/api-sync.test.ts`
- `job-hunt-dashboard/src/client/components/shared/SyncButton.tsx`
- `job-hunt-dashboard/src/client/hooks/useSyncMutation.ts`

### Modified
- `job-hunt-dashboard/src/index.ts`
- `job-hunt-dashboard/src/client/components/shared/Layout.tsx`
- `job-hunt-dashboard/.env.example`
- `job-hunt-dashboard/src/db/schema.ts`
- `job-hunt-dashboard/src/shared/schemas.ts`
- `_bmad-output/project-context.md`

---

## Change Log

- Removed Google Sheets integration: deleted all service/route/UI files and cleaned all references (Date: 2026-04-14)
