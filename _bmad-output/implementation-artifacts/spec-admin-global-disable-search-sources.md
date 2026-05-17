---
title: 'Admin Global Source Enable/Disable'
type: 'feature'
created: '2026-05-17'
status: 'done'
baseline_commit: '57ec532de4976bebc791968537a64b79a70956d8'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admins have no way to globally gate which discovery source scrapers are available across all users. If LinkedIn or Indeed breaks or is not configured, all users still see those sources in the search config UI and existing rows silently reference broken sources.

**Approach:** Introduce a `source_settings` table (global, no `userId`) with one row per scraper source and an `enabled` boolean. Admins toggle sources on the admin page; all users see the filtered source dropdown on the config page; existing rows with a now-disabled source show a red ⚠ badge with a "Disabled by Admin" tooltip.

## Boundaries & Constraints

**Always:**
- `source_settings` has NO `userId` — it is global, not per-user.
- All four `SCRAPER_SOURCES` (`linkedin`, `indeed`, `indeed_nl`, `arc`) are seeded as enabled on first boot.
- The `PATCH /api/admin/source-settings/:source` endpoint is gated behind `adminMiddleware` (existing `/api/admin/*` blanket rule covers this).
- `GET /api/source-settings` is available to any auth'd user (NOT admin-only) — needed for the config dropdown and row badges.
- Discovery service must also skip search configs whose source is globally disabled.
- Existing search config rows for a disabled source are NOT deleted — they remain and show a visual cue.
- Source dropdown in add-form only lists enabled sources; if all sources are disabled, dropdown is empty and "Add" is disabled.
- Follow all project conventions: Drizzle `casing: 'camelCase'`, `{ error: string }` shapes, no envelope wrappers, `bun:test`, strict TypeScript.

**Ask First:**
- If a new migration number conflicts with an already-existing file in `src/db/migrations/`.

**Never:**
- Do not delete or archive existing search configs when a source is disabled.
- Do not expose source settings management in the per-user config card — admin-only.
- Do not add a per-user source override — this is strictly a global admin toggle.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin disables `linkedin` | `PATCH /api/admin/source-settings/linkedin` `{ enabled: false }` | Returns `{ source: 'linkedin', enabled: false }`; discovery skips linkedin configs | 400 if source not in SCRAPER_SOURCES; 404 if row missing |
| Config page dropdown | `linkedin` disabled globally | `linkedin` absent from Source `<select>` options | — |
| Existing row, source disabled | User has a saved `linkedin` config, admin disables linkedin | Row remains; red ⚠ icon with tooltip "Disabled by Admin" renders next to source cell | — |
| All sources disabled | All 4 disabled | Add-form Source dropdown empty; Add button disabled | — |
| Discovery run | `linkedin` disabled | All `linkedin` search configs skipped even if individually `enabled: true` | — |
| Re-enable source | `PATCH /api/admin/source-settings/linkedin` `{ enabled: true }` | Source returns to dropdown; badge disappears from rows | — |
| Invalid source in PATCH | `/api/admin/source-settings/badvalue` | 400 `{ error: 'Invalid source' }` | — |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` — add `sourceSettings` Drizzle table (global, no userId)
- `src/db/migrations/0027_source_settings.sql` — CREATE TABLE + seed 4 enabled rows
- `src/shared/schemas.ts` — add `sourceSettingSchema` + `SourceSetting` type
- `src/server/routes/api-source-settings.ts` — new file, `GET /` returns all 4 rows (any auth'd user)
- `src/server/routes/api-admin.ts` — add `GET /source-settings` + `PATCH /source-settings/:source`
- `src/index.ts` — mount `api-source-settings` at `/api/source-settings`
- `src/server/services/discovery-service.ts` — filter by global source `enabled` state
- `src/client/hooks/useSourceSettingsQuery.ts` — new file, queryKey `['source-settings']`
- `src/client/hooks/useToggleSourceMutation.ts` — new file, PATCH admin endpoint, invalidates `['source-settings']`
- `src/client/routes/config.tsx` — filter dropdown + disabled-row badge with Tooltip
- `src/client/routes/admin-users.tsx` — add Source Settings section after Invite Keys
- `src/client/lib/router.ts` — add `fetchSourceSettings` to configRoute and adminUsersRoute loaders

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` — add `export const sourceSettings = sqliteTable('source_settings', { source: text('source').primaryKey(), enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true) })`
- [x] `src/db/migrations/0027_source_settings.sql` — `CREATE TABLE IF NOT EXISTS source_settings (source TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1); INSERT OR IGNORE INTO source_settings (source, enabled) VALUES ('linkedin',1),('indeed',1),('indeed_nl',1),('arc',1);`
- [x] `src/shared/schemas.ts` — add `export const sourceSettingSchema = z.object({ source: scraperSourceSchema, enabled: z.boolean() })` and `export type SourceSetting = z.infer<typeof sourceSettingSchema>`
- [x] `src/server/routes/api-source-settings.ts` — new Hono app, `GET /` selects all rows from `sourceSettings`, returns as `SourceSetting[]`; import `sourceSettings` from schema
- [x] `src/server/routes/api-admin.ts` — add `GET /source-settings` (returns all rows) and `PATCH /source-settings/:source` (validates source via `scraperSourceSchema`, validates body `{ enabled: boolean }`, upserts row, returns updated row)
- [x] `src/index.ts` — `import sourceSettingsRoute from './server/routes/api-source-settings'` + `app.route('/api/source-settings', sourceSettingsRoute)`; also add `sourceSettings` to the `api-admin.ts` import from schema (already imported in admin file separately)
- [x] `src/server/services/discovery-service.ts` — at start of `runDiscovery()`, query `sourceSettings` to get enabled sources; filter the `searches` result to exclude configs whose source is not in the enabled set
- [x] `src/client/hooks/useSourceSettingsQuery.ts` — `fetchSourceSettings(): Promise<SourceSetting[]>` + `useSourceSettingsQuery()` with queryKey `['source-settings']`; parse response with `z.array(sourceSettingSchema)` (safeParse fallback on unexpected rows)
- [x] `src/client/hooks/useToggleSourceMutation.ts` — mutation calls `PATCH /api/admin/source-settings/:source` with `{ enabled }`, on success invalidates `['source-settings']`; throws on non-ok response using `{ error }` shape
- [x] `src/client/routes/config.tsx` — in `SearchConfigCard`: call `useSourceSettingsQuery()`; derive `enabledSources = Set` of enabled source names; filter `SCRAPER_SOURCES` in source dropdown to only include enabled ones; in table rows, if `!enabledSources.has(row.source)` render a `<TooltipProvider><Tooltip><TooltipTrigger><span aria-label="Disabled by Admin" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-xs font-bold ml-1">!</span></TooltipTrigger><TooltipContent>Disabled by Admin</TooltipContent></Tooltip></TooltipProvider>` next to the source name; also guard edit mode: when editing a row whose source is disabled, still show that source in the edit dropdown (don't silently drop it); if `enabledSources.size === 0` disable the Add button even when query is filled
- [x] `src/client/routes/admin-users.tsx` — add Source Settings section after Invite Keys: import `useSourceSettingsQuery` + `useToggleSourceMutation`; render a table with columns Source | Status (enabled/disabled); use `<Switch>` per row to toggle; show loading state
- [x] `src/client/lib/router.ts` — add `fetchSourceSettings` to `configRoute` loader and `adminUsersRoute` loader; import from `'../hooks/useSourceSettingsQuery'`

**Acceptance Criteria:**
- Given a logged-in admin on `/admin/users`, when they scroll to the Source Settings section, then all 4 sources appear with a Switch showing current enabled state.
- Given admin toggles a source Switch off, when the mutation completes, then the Switch updates to off and the change persists on page refresh.
- Given `linkedin` is disabled, when a regular user visits `/config`, then `linkedin` is absent from the Source dropdown in the add-form.
- Given a user has a saved `linkedin` search config and admin disables `linkedin`, when the user views the config page, then the `linkedin` row remains but shows a red ⚠ icon; hovering reveals tooltip "Disabled by Admin".
- Given `linkedin` is disabled, when `runDiscovery()` executes, then no `linkedin` search configs are scraped regardless of their individual `enabled` state.
- Given admin re-enables `linkedin`, when the user refreshes `/config`, then `linkedin` re-appears in the Source dropdown and the ⚠ badge is gone.

## Design Notes

**Edit-mode source dropdown for disabled rows:** When a user edits an existing row whose source is currently disabled, the edit dropdown must still include that disabled source so the user can save without being forced to change it. Only the add-form dropdown restricts to enabled sources.

**Tooltip pattern (follow `JobDrawer.tsx`):** wrap each `Tooltip` in its own `TooltipProvider` inline — no global provider in the app root.

**Migration idempotency:** Use `INSERT OR IGNORE` (SQLite) to avoid duplicate seeds on replay.

**Admin PATCH upsert:** Use `db.insert(sourceSettings).values({...}).onConflictDoUpdate({ target: sourceSettings.source, set: { enabled } }).returning().get()` — SQLite upsert via Drizzle.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun run typecheck` -- expected: zero errors
- `cd job-hunt-dashboard && bun test src/server/routes/api-source-settings.test.ts` -- expected: all pass (write this test file)
- `cd job-hunt-dashboard && bun test src/server/routes/api-admin.test.ts` -- expected: all pass (add source-settings test cases)

## Spec Change Log

## Suggested Review Order

**Data layer — schema and migration**

- Global table with no `userId`; single `enabled` boolean column; `TEXT PRIMARY KEY` avoids surrogate key.
  [`schema.ts:165`](../../job-hunt-dashboard/src/db/schema.ts#L165)

- Idempotent seed using `INSERT OR IGNORE`; all four sources default to enabled.
  [`0027_source_settings.sql:1`](../../job-hunt-dashboard/src/db/migrations/0027_source_settings.sql#L1)

- Zod type mirrors DB shape; `scraperSourceSchema` reused for source validation.
  [`schemas.ts:213`](../../job-hunt-dashboard/src/shared/schemas.ts#L213)

**Server — API endpoints**

- Admin `PATCH` handler: validates source via `scraperSourceSchema`, upserts via `onConflictDoUpdate`, returns updated row.
  [`api-admin.ts:233`](../../job-hunt-dashboard/src/server/routes/api-admin.ts#L233)

- Public `GET` endpoint (any auth'd user) for config dropdown and row badges.
  [`api-source-settings.ts:1`](../../job-hunt-dashboard/src/server/routes/api-source-settings.ts#L1)

- Route mounted under `/api/source-settings` (not under `/api/admin/`).
  [`index.ts:103`](../../job-hunt-dashboard/src/index.ts#L103)

**Discovery service — enforcement**

- Pre-filter: builds `globallyEnabledSources` Set before search query; disabled sources are silently skipped.
  [`discovery-service.ts:27`](../../job-hunt-dashboard/src/server/services/discovery-service.ts#L27)

**Client — admin toggle UI**

- Toggle mutation calls `PATCH /api/admin/source-settings/:source`, invalidates `['source-settings']` on success.
  [`useToggleSourceMutation.ts:5`](../../job-hunt-dashboard/src/client/hooks/useToggleSourceMutation.ts#L5)

- Admin page "Discovery Source Settings" section: Switch per row, pending-disabled during mutation.
  [`admin-users.tsx:313`](../../job-hunt-dashboard/src/client/routes/admin-users.tsx#L313)

**Client — config page filtering and badge**

- `enabledSources` Set and `addableSources` array drive dropdown and Add-button disabled state.
  [`config.tsx:300`](../../job-hunt-dashboard/src/client/routes/config.tsx#L300)

- Add-form dropdown restricted to enabled sources; gated on `sourceSettingsLoading` to prevent stale-state submission.
  [`config.tsx:378`](../../job-hunt-dashboard/src/client/routes/config.tsx#L378)

- Edit dropdown retains the row's own (possibly disabled) source so save doesn't force a source change.
  [`config.tsx:453`](../../job-hunt-dashboard/src/client/routes/config.tsx#L453)

- Red `!` badge with inline `TooltipProvider` (no global provider) — guard `sourceSettingsList.length > 0` prevents false positives on load.
  [`config.tsx:499`](../../job-hunt-dashboard/src/client/routes/config.tsx#L499)

**Client — data layer hooks and loader**

- `useSourceSettingsQuery` with `z.array(sourceSettingSchema)` safeParse for type-safe response handling.
  [`useSourceSettingsQuery.ts:15`](../../job-hunt-dashboard/src/client/hooks/useSourceSettingsQuery.ts#L15)

- `fetchSourceSettings` prefetched in both `configRoute` and `adminUsersRoute` loaders.
  [`router.ts:175`](../../job-hunt-dashboard/src/client/lib/router.ts#L175)

**Tests**

- 8 tests covering `GET /api/source-settings` and `PATCH /api/admin/source-settings/:source` including invalid-source 400 and upsert round-trip.
  [`api-source-settings.test.ts:1`](../../job-hunt-dashboard/src/server/routes/api-source-settings.test.ts#L1)
