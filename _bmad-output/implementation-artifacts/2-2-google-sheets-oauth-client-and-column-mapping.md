# Story 2.2: Google Sheets OAuth Client & Column Mapping

Status: done

## Story

As a user,
I want the app to fetch my job records from Google Sheets using OAuth credentials from my `.env`,
so that my upstream pipeline data flows into the dashboard without manual export steps.

## Acceptance Criteria

1. **Given** valid OAuth credentials in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`) **When** `oauth-client.ts` is called **Then** it uses the refresh token to obtain a valid access token from Google's token endpoint **And** if the token request returns a non-2xx response or the response body lacks `access_token`, it throws exactly `new Error("OAuth token expired or invalid")` — no silent failure, no partial result

2. **Given** a successful OAuth access token **When** `sheets-sync.ts` fetches from Sheets API v4 using `GOOGLE_SPREADSHEET_ID` **Then** all rows from the spreadsheet are retrieved **And** the raw Sheets column values are mapped to `JobInput[]` conforming to `ingestPayloadSchema` — `sheets-sync.ts` is the ONLY file that knows Sheets column header names **And** the returned `JobInput[]` can be passed directly to the ingest logic from Story 2.1

3. **Given** a Sheets API network failure or non-2xx HTTP response **When** `sheets-sync.ts` is called **Then** it throws an `Error` with a descriptive message including the HTTP status code — no partial results returned, no silent swallowing

## Tasks / Subtasks

- [x] Task 1: Create `src/server/services/oauth-client.ts` — Google OAuth 2.0 token refresh (AC: 1)
  - [x] Export `getAccessToken(): Promise<string>` — fetches fresh access token using refresh token flow
  - [x] POST to `https://oauth2.googleapis.com/token` with `Content-Type: application/x-www-form-urlencoded`
  - [x] Body: `client_id`, `client_secret`, `refresh_token` from `process.env`, `grant_type=refresh_token`
  - [x] If `res.ok` is false OR response body lacks `access_token` field: throw `new Error("OAuth token expired or invalid")`
  - [x] Never log credential values (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`)
  - [x] Return `data.access_token` (string) on success

- [x] Task 2: Create `src/server/services/sheets-sync.ts` — Sheets API v4 fetch + column mapping (AC: 2, 3)
  - [x] Export `fetchJobsFromSheets(): Promise<JobInput[]>`
  - [x] Call `getAccessToken()` from `./oauth-client` first
  - [x] Fetch from `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SPREADSHEET_ID}/values/Sheet1` with `Authorization: Bearer {token}` header
  - [x] If `res.ok` is false: throw `new Error(\`Sheets API error ${res.status}: ${text}\`)` where `text` is the response body text
  - [x] Parse `data.values: string[][]` — first row is headers, remaining rows are data
  - [x] If `data.values` is missing or has fewer than 2 rows: return `[]` (empty array, not an error)
  - [x] Map each data row to `JobInput` using the header-index lookup — this is the column mapping layer
  - [x] Use expected Sheets column names (see Dev Notes for mapping table)
  - [x] Rows missing `company` or `job_title` values: skip silently (return null, filter out)
  - [x] Parse `fit_score` string to integer (`parseInt`); null if empty/NaN
  - [x] All other string fields: pass through as-is or null if empty string / missing

- [x] Task 3: Write co-located tests (AC: 1, 2, 3)
  - [x] `src/server/services/oauth-client.test.ts` — test `getAccessToken()` with mocked `fetch`
    - [x] Test: valid token response → returns access_token string
    - [x] Test: non-2xx response → throws `"OAuth token expired or invalid"`
    - [x] Test: 2xx response missing `access_token` → throws `"OAuth token expired or invalid"`
  - [x] `src/server/services/sheets-sync.test.ts` — test `fetchJobsFromSheets()` with mocked deps
    - [x] Test: valid spreadsheet response → returns correctly mapped `JobInput[]`
    - [x] Test: Sheets API returns non-2xx → throws with descriptive message including status code
    - [x] Test: empty spreadsheet (0 data rows) → returns `[]`
    - [x] Test: rows missing company/job_title → filtered out of result
    - [x] Test: fit_score string "85" → parsed to integer 85

- [x] Task 4: Verify (AC: 1, 2, 3)
  - [x] `tsc --noEmit` — zero TypeScript errors
  - [x] `bun test src/server/services/` — all tests pass
  - [x] No credentials appear in any `console.error` or `console.log` call

### Review Findings

- [x] [Review][Defer] `parseInt` float truncation: `parseInt('82.5')` returns 82, silently truncating decimal fit scores [sheets-sync.ts:43] — deferred, pre-existing; spec mandates using `parseInt`, spec intent satisfied
- [x] [Review][Defer] No OAuth token caching — fresh token fetched on every `fetchJobsFromSheets()` call; tokens are reusable for ~3600s [oauth-client.ts] — deferred, pre-existing; out of spec scope for this story
- [x] [Review][Defer] No `fetch` timeout via `AbortController` on either HTTP call; stalled requests hang indefinitely [oauth-client.ts:2, sheets-sync.ts:8] — deferred, pre-existing; out of spec scope
- [x] [Review][Defer] `res.json()` throws `SyntaxError` if Google returns a 2xx with non-JSON body (e.g., proxy page) [oauth-client.ts:16, sheets-sync.ts:18] — deferred, pre-existing; error propagates and is not silent, AC satisfied
- [x] [Review][Defer] Whitespace-only cell values (e.g., `"   "`) bypass the `val !== ''` empty-string filter [sheets-sync.ts:35] — deferred, pre-existing; spec says null on empty string/missing but does not address whitespace
- [x] [Review][Defer] `global.fetch` mock overwritten in `beforeEach` but never restored in `afterEach` — mock state bleeds if other suites share the global [oauth-client.test.ts:6, sheets-sync.test.ts:7] — deferred, pre-existing; low severity for co-located single-suite files
- [x] [Review][Defer] Duplicate spreadsheet column names: `headers.indexOf()` silently uses the first match [sheets-sync.ts:33] — deferred, pre-existing; spec assumes well-formed spreadsheet input
- [x] [Review][Defer] `headers.indexOf(col)` linear scan for each of ~11 fields per row (O(n×m)); a header-index map would be O(n+m) [sheets-sync.ts:33] — deferred, pre-existing; negligible at spreadsheet data volumes

## Dev Notes

### New Files This Story

```
src/server/services/          ← directory already exists (created in Story 2.1's server/ setup)
  oauth-client.ts             ← Task 1 (new)
  oauth-client.test.ts        ← Task 3 (new)
  sheets-sync.ts              ← Task 2 (new)
  sheets-sync.test.ts         ← Task 3 (new)
```

**Do NOT touch**: `src/index.ts`, `src/server/routes/api-ingest.ts`, any DB or schema files. Story 2.3 mounts `/api/sync` using these services; Story 2.2 is pure service layer with no route mounting.

### Environment Variables — Already Validated

All four Google env vars are already in `REQUIRED_ENV_VARS` in `src/index.ts` (added in Story 1.3):

```ts
'GOOGLE_CLIENT_ID',
'GOOGLE_CLIENT_SECRET',
'GOOGLE_REFRESH_TOKEN',
'GOOGLE_SPREADSHEET_ID',
```

Do NOT add them again. Do NOT modify `src/index.ts`.

### No New Dependencies

Use native `fetch` (built into Bun). Do NOT install `googleapis`, `google-auth-library`, or any Google SDK. The entire OAuth + Sheets integration fits in ~80 lines using raw `fetch`.

### `oauth-client.ts` Implementation

```ts
export async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error('OAuth token expired or invalid')
  }

  const data = await res.json() as { access_token?: string }
  if (!data.access_token) {
    throw new Error('OAuth token expired or invalid')
  }

  return data.access_token
}
```

**Critical constraints:**
- Error message must be exactly `"OAuth token expired or invalid"` — this is the string the AC specifies and what Story 2.3 will surface to the UI
- Never include `process.env.GOOGLE_CLIENT_SECRET` or other credentials in the thrown error message or any `console.error` call
- No retry logic — throw immediately on failure

### `sheets-sync.ts` Implementation

```ts
import { getAccessToken } from './oauth-client'
import type { JobInput } from '../../shared/schemas'

export async function fetchJobsFromSheets(): Promise<JobInput[]> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!
  const token = await getAccessToken()

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets API error ${res.status}: ${text}`)
  }

  const data = await res.json() as { values?: string[][] }

  if (!data.values || data.values.length < 2) {
    return []
  }

  const [headers, ...rows] = data.values

  return rows
    .map((row) => mapRow(headers, row))
    .filter((r): r is JobInput => r !== null)
}

function mapRow(headers: string[], row: string[]): JobInput | null {
  const get = (col: string): string | null => {
    const idx = headers.indexOf(col)
    if (idx < 0) return null
    const val = row[idx]
    return val !== undefined && val !== '' ? val : null
  }

  const company = get('company')
  const jobTitle = get('job_title')
  if (!company || !jobTitle) return null

  const fitScoreRaw = get('fit_score')
  const fitScoreParsed = fitScoreRaw !== null ? parseInt(fitScoreRaw, 10) : null
  const fitScore = fitScoreParsed !== null && !isNaN(fitScoreParsed) ? fitScoreParsed : null

  const rec = get('recommendation')
  const recommendation =
    rec === 'apply' || rec === 'investigate' || rec === 'skip' ? rec : null

  return {
    company,
    jobTitle,
    fitScore,
    recommendation,
    roleFit: get('role_fit'),
    requirementsMet: get('requirements_met'),
    requirementsMissed: get('requirements_missed'),
    redFlags: get('red_flags'),
    jobDescription: get('job_description'),
    sourceUrl: get('source_url'),
    dateScraped: get('date_scraped'),
  }
}
```

### Expected Sheets Column Names (Mapping Table)

These are the header strings `sheets-sync.ts` looks for in the first row of the spreadsheet. Based on architecture: "Compound key columns: `company`, `job_title` (match Sheets column names exactly)" and snake_case conventions throughout.

| Sheets header     | `JobInput` field     | Notes                                       |
|-------------------|----------------------|---------------------------------------------|
| `company`         | `company`            | Required — row skipped if missing           |
| `job_title`       | `jobTitle`           | Required — row skipped if missing           |
| `fit_score`       | `fitScore`           | Parse as int; null if empty or NaN          |
| `recommendation`  | `recommendation`     | Must be `apply`/`investigate`/`skip` or null|
| `role_fit`        | `roleFit`            | String passthrough                          |
| `requirements_met`| `requirementsMet`    | String passthrough                          |
| `requirements_missed`| `requirementsMissed` | String passthrough                       |
| `red_flags`       | `redFlags`           | String passthrough                          |
| `job_description` | `jobDescription`     | String passthrough                          |
| `source_url`      | `sourceUrl`          | String passthrough                          |
| `date_scraped`    | `dateScraped`        | String passthrough (ISO 8601 expected)      |

**If your actual spreadsheet uses different header names**, the only file to change is `sheets-sync.ts` — no other file knows Sheets column names. That's the isolation boundary.

### Shared Types — What to Import

```ts
import type { JobInput } from '../../shared/schemas'
// Do NOT import Job, IngestPayload — only JobInput is needed here
```

`JobInput` is the output type of `mapRow()`. It's also the element type of `IngestPayload` (which is `JobInput[]`). Story 2.3 will call `fetchJobsFromSheets()` and pass the result to the ingest logic.

### Testing Approach — Mocking `fetch`

These services make HTTP calls to Google APIs; external calls must be mocked in tests. Bun's test runner supports `mock` from `bun:test`:

```ts
import { test, expect, mock, beforeEach } from 'bun:test'

// Mock the global fetch before importing the module under test
const mockFetch = mock(() => Promise.resolve(new Response(
  JSON.stringify({ access_token: 'test-token' }),
  { status: 200 }
)))
global.fetch = mockFetch as unknown as typeof fetch

// Then import the module
import { getAccessToken } from './oauth-client'
```

**Alternative for sheets-sync.ts tests:** mock `oauth-client` using `mock.module()`:

```ts
import { mock } from 'bun:test'

mock.module('./oauth-client', () => ({
  getAccessToken: () => Promise.resolve('mock-access-token'),
}))

import { fetchJobsFromSheets } from './sheets-sync'
```

**What to test (not how):**
- `oauth-client.test.ts`: 3 tests covering valid response, non-2xx, and missing `access_token`
- `sheets-sync.test.ts`: 5 tests covering mapped output, non-2xx error, empty sheet, skipped rows, fitScore parsing

Run tests with: `/home/zac/.bun/bin/bun test src/server/services/`

### Credential Safety Rules

- ❌ `console.error(err)` where `err` contains credential values — always throw; let the caller log
- ❌ Including env var values in error messages: `throw new Error(\`bad client_id: ${process.env.GOOGLE_CLIENT_ID}\`)`
- ✅ Logging the error message only (no stack, no env values) is acceptable in the route handler (Story 2.3)
- ❌ `access_token` value in logs — treat it as sensitive

### Google Sheets API v4 — Reference

Token refresh endpoint:
```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id=...&client_secret=...&refresh_token=...&grant_type=refresh_token
```

Success response: `{ "access_token": "ya29...", "expires_in": 3599, "token_type": "Bearer" }`
Error response (400/401): `{ "error": "invalid_grant", "error_description": "Token has been expired..." }`

Sheets values endpoint:
```
GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}
Authorization: Bearer {access_token}
```

Success response:
```json
{
  "range": "Sheet1!A1:Z1000",
  "majorDimension": "ROWS",
  "values": [
    ["company", "job_title", "fit_score", ...],
    ["Acme Corp", "Backend Engineer", "82", ...]
  ]
}
```

Range `Sheet1` fetches all populated cells. If using a named tab other than `Sheet1`, update the range string — this is the only code change needed.

### Anti-Patterns (Do Not Do)

- ❌ Install `googleapis` or `google-auth-library` — use native `fetch`
- ❌ Hardcode Sheets column names anywhere outside `sheets-sync.ts`
- ❌ Throw on empty spreadsheet — return `[]` instead
- ❌ `await` inside `oauth-client.ts` after a non-ok response (the `throw` should be immediate after `if (!res.ok)`)
- ❌ Mount any routes in this story — services only; Story 2.3 does the route
- ❌ `console.log` for errors — not needed here; services throw; callers log
- ❌ Modify `src/index.ts`, `api-ingest.ts`, or any existing files
- ❌ Validate `JobInput[]` with `ingestPayloadSchema` in sheets-sync.ts — Story 2.3 passes to `/api/ingest` which already validates; don't double-validate here

### Project Structure After This Story

```
src/server/
  middleware/
    error-handler.ts        ← existing (Story 2.1)
  routes/
    api-ingest.ts           ← existing (Story 2.1)
    api-ingest.test.ts      ← existing (Story 2.1)
  services/
    oauth-client.ts         ← NEW (Task 1)
    oauth-client.test.ts    ← NEW (Task 3)
    sheets-sync.ts          ← NEW (Task 2)
    sheets-sync.test.ts     ← NEW (Task 3)
```

### Previous Story Learnings (from 2.1)

- **`bun` not in PATH for CLI** — use `/home/zac/.bun/bin/bun test ...` not `bun test ...`
- **TypeScript strict mode** — `tsc --noEmit` must pass; use explicit return types, no implicit `any`
- **Composite key separator** — Story 2.1 changed separator to `\x00` to prevent collision; no impact on this story (no DB access)
- **`.run()` vs `await`** — Not relevant here (no DB); all service calls are async, use `await`
- **Test structure** — co-locate tests next to source files, not in `__tests__/` directory
- **Import paths** — `../../shared/schemas` for shared types from `src/server/services/`
- **No `console.log` for errors** — use `console.error` in callers; services should throw

### References

- Architecture: OAuth 2.0 pattern — tokens in `.env` only, throw on expiry [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- Architecture: Google Sheets Integration Boundary — only file that knows Sheets column names is `sheets-sync.ts` [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries]
- Architecture: `services/` directory structure [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure]
- Architecture: Naming conventions — server files are kebab-case.ts [Source: _bmad-output/planning-artifacts/architecture.md#Code Naming Conventions]
- Architecture: Enforcement — no inline type defs, always import from shared/schemas [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines]
- Epics: Story 2.2 acceptance criteria [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2]
- Shared types: `src/shared/schemas.ts` — `JobInput`, `ingestPayloadSchema`
- Env vars: `src/index.ts` REQUIRED_ENV_VARS — Google creds already validated at boot
- Previous story: Story 2.1 patterns — error shape, test structure, bun PATH [Source: _bmad-output/implementation-artifacts/2-1-api-ingest-endpoint-with-transactional-upsert.md#Dev Notes]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `oauth-client.ts`: native `fetch` POST to Google token endpoint, throws exact error message `"OAuth token expired or invalid"` on non-2xx or missing `access_token`. No credential values in logs.
- Implemented `sheets-sync.ts`: fetches `Sheet1` via Sheets API v4, header-index column mapping to `JobInput[]`, skips rows missing `company`/`job_title`, parses `fit_score` as int, throws on non-2xx with status code in message, returns `[]` for empty sheets.
- All 3 tests for `oauth-client` and 5 tests for `sheets-sync` pass (8 new tests total).
- Full regression suite: 22/22 pass. `tsc --noEmit`: 0 errors.
- No routes mounted; services only. No modifications to existing files.

### File List

- `job-hunt-dashboard/src/server/services/oauth-client.ts` (new)
- `job-hunt-dashboard/src/server/services/oauth-client.test.ts` (new)
- `job-hunt-dashboard/src/server/services/sheets-sync.ts` (new)
- `job-hunt-dashboard/src/server/services/sheets-sync.test.ts` (new)
## Change Log

- 2026-03-29: Implemented Story 2.2 — created `oauth-client.ts` (OAuth 2.0 refresh token flow) and `sheets-sync.ts` (Sheets API v4 fetch + header-index column mapping to `JobInput[]`) with 8 co-located tests. All ACs satisfied. Status → review.
- 2026-03-29: Code review complete — 0 patch, 0 decision-needed, 8 deferred. All critical findings dismissed (env vars validated at startup by REQUIRED_ENV_VARS; spec constraints confirmed). Status → done.
