# Story 20.1: Pipeline Run Metrics — Duration, Token Usage & Cost

**Epic:** 20 — Pipeline Run Metrics  
**Story ID:** 20-1-pipeline-run-metrics  
**Status:** done  
**Date:** 2026-04-20

---

## User Story

As a job hunter,  
I want each Discovery, Analysis, Cover Letter, and Resume run to record its wall-clock duration, Anthropic token counts, and estimated USD cost,  
so that I can see at a glance how long each pipeline step took and what it cost.

---

## Acceptance Criteria

### AC1 — Duration logged for all four flows
- `webhook_runs.duration_ms` is populated (integer milliseconds, non-null) for every successful or failed Discovery, Analysis, Cover Letter, and Resume run.

### AC2 — Token counts logged for Anthropic flows
- `webhook_runs.input_tokens` and `webhook_runs.output_tokens` are populated (integer) for Analysis, Cover Letter, and Resume runs.
- Discovery has no Anthropic call: both columns are `NULL` for Discovery runs.
- For Analysis (batch): counts are **summed across all jobs** processed in that batch; failed jobs that threw before receiving an Anthropic response contribute 0.

### AC3 — Cost logged for Anthropic flows
- `webhook_runs.cost_usd` is populated (real) for Analysis, Cover Letter, and Resume runs.
- Discovery: `cost_usd` is `NULL`.
- Formula: `(inputTokens × inputPrice + outputTokens × outputPrice) / 1_000_000` where prices are per-million tokens for the model used.

### AC4 — Webhook History UI displays new fields
- The Webhook History table shows `durationMs`, `inputTokens`, `outputTokens`, and `costUsd` when populated.
- Discovery rows show duration only; token/cost cells are empty/dashed.
- Cost displays with 4 decimal places (e.g. `$0.0234`).

### AC5 — No regressions in existing functionality
- All existing tests pass.
- Existing `recordRun` call sites that do not yet pass the new fields continue to work (new fields are all nullable; old callers need no change).

---

## Technical Design

### 1. New Migration: `src/db/migrations/0016_webhook_run_metrics.sql`

```sql
ALTER TABLE webhook_runs ADD COLUMN duration_ms INTEGER;
ALTER TABLE webhook_runs ADD COLUMN input_tokens INTEGER;
ALTER TABLE webhook_runs ADD COLUMN output_tokens INTEGER;
ALTER TABLE webhook_runs ADD COLUMN cost_usd REAL;
```

Use `ALTER TABLE … ADD COLUMN` (SQLite supports this). All columns are nullable — no default needed.

**Generate via**: `bun run db:generate` then rename/check the output file, OR write the SQL manually and place it at `src/db/migrations/0016_webhook_run_metrics.sql`. The migration runner picks up all `.sql` files in that folder in alphabetical order at `bun start`.

### 2. Schema Update: `src/db/schema.ts`

Add to `webhookRuns`:

```typescript
import { integer, real, text, sqliteTable } from 'drizzle-orm/sqlite-core'
// add `real` to the existing import

export const webhookRuns = sqliteTable('webhook_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  runAt: text('run_at').notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
  itemCount: integer('item_count'),
  errorMessage: text('error_message'),
  // NEW
  durationMs: integer('duration_ms'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: real('cost_usd'),
})
```

`real` is imported from `drizzle-orm/sqlite-core` — add it to the existing import.

### 3. `recordRun` signature update: `src/server/routes/api-webhook-runs.ts`

Extend the `params` object (all new fields optional/nullable for backward compat):

```typescript
export function recordRun(params: {
  name: string
  success: boolean
  itemCount?: number | null
  errorMessage?: string | null
  durationMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  costUsd?: number | null
}) {
  try {
    db.insert(webhookRuns).values({
      name: params.name,
      runAt: new Date().toISOString(),
      success: params.success,
      itemCount: params.itemCount ?? null,
      errorMessage: params.errorMessage ?? null,
      durationMs: params.durationMs ?? null,
      inputTokens: params.inputTokens ?? null,
      outputTokens: params.outputTokens ?? null,
      costUsd: params.costUsd ?? null,
    }).run()
  } catch (err) {
    console.error('[webhook-runs] Failed to record run:', err)
  }
}
```

All existing callers (`api-jobs.ts`, `api-webhooks.ts`) continue to work with no changes — the new fields are optional.

### 4. Anthropic response type — extend in each service

Each service currently has its own local `AnthropicMessage` / `AnthropicResponse` interface. Add `usage` to each:

```typescript
interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}
```

### 5. Service return type changes

**`analysis-service.ts`** — accumulate tokens across all jobs in the batch:

```typescript
export async function runAnalysis(
  onProgress?: (msg: string) => void
): Promise<{ processed: number; failed: number; inputTokens: number; outputTokens: number }>
```

Declare `let totalInputTokens = 0; let totalOutputTokens = 0` before the job loop. After each successful Anthropic call:

```typescript
const anthropicData = await anthropicRes.json() as AnthropicResponse
totalInputTokens += anthropicData.usage.input_tokens
totalOutputTokens += anthropicData.usage.output_tokens
```

Return `{ processed, failed, inputTokens: totalInputTokens, outputTokens: totalOutputTokens }`.

Failed jobs (those that throw before or after the Anthropic call) contribute 0 tokens — no special handling needed.

**`cover-letter-service.ts`** — change return type:

```typescript
export async function generateCoverLetter(
  job: Job
): Promise<{ content: string; inputTokens: number; outputTokens: number }>
```

Extract from response:
```typescript
const data = await anthropicRes.json() as AnthropicResponse
const coverLetter = data.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
if (!coverLetter) throw new Error('Anthropic returned empty cover letter')
return { content: coverLetter, inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
```

**`resume-service.ts`** — change return type:

```typescript
export async function generateResume(
  job: Job
): Promise<{ pdf: Buffer; inputTokens: number; outputTokens: number }>
```

Extract and return:
```typescript
return { pdf: generatePdf(html), inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
```

Wait — `generatePdf` returns a `Buffer` (or `Promise<Buffer>`). Check the signature in `generate-pdf.ts` and await if needed. The current code `return generatePdf(html)` — look at that file to confirm whether it's sync or async. Update the caller in `api-jobs.ts` accordingly (see below).

### 6. Callers updated: `src/server/routes/api-webhooks.ts`

**Pricing constants** (inline at top of file, no utility needed):

```typescript
// USD per token (per-million prices / 1_000_000)
const OPUS_4_7_INPUT  = 15 / 1_000_000   // claude-opus-4-7
const OPUS_4_7_OUTPUT = 75 / 1_000_000
```

**Discovery route** — add timing only:

```typescript
app.post('/discovery', (c) => {
  if (!process.env.SCRAPER_URL) return c.json({ error: 'SCRAPER_URL not configured' }, 503)
  return stream(c, async (s) => {
    const write = (ev: object) => s.writeln(JSON.stringify(ev))
    const startMs = Date.now()
    try {
      const { inserted } = await runDiscovery((msg) => write({ status: msg }))
      recordRun({ name: 'Discovery', success: true, itemCount: inserted, errorMessage: null, durationMs: Date.now() - startMs })
      write({ done: true, inserted })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[discovery] run failed:', message)
      recordRun({ name: 'Discovery', success: false, itemCount: null, errorMessage: message, durationMs: Date.now() - startMs })
      write({ error: message })
    }
  })
})
```

**Analysis route** — add timing and token cost:

```typescript
app.post('/analysis', (c) => {
  if (!process.env.ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)
  return stream(c, async (s) => {
    const write = (ev: object) => s.writeln(JSON.stringify(ev))
    const startMs = Date.now()
    try {
      const { processed, failed, inputTokens, outputTokens } = await runAnalysis((msg) => write({ status: msg }))
      const costUsd = inputTokens * OPUS_4_7_INPUT + outputTokens * OPUS_4_7_OUTPUT
      recordRun({ name: 'Analysis', success: true, itemCount: processed, errorMessage: null,
        durationMs: Date.now() - startMs, inputTokens, outputTokens, costUsd })
      write({ done: true, processed, failed })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[analysis] run failed:', message)
      recordRun({ name: 'Analysis', success: false, itemCount: null, errorMessage: message,
        durationMs: Date.now() - startMs })
      write({ error: message })
    }
  })
})
```

### 7. Callers updated: `src/server/routes/api-jobs.ts`

**Pricing constants** (inline at top of file):

```typescript
const SONNET_4_6_INPUT  = 3 / 1_000_000   // claude-sonnet-4-6
const SONNET_4_6_OUTPUT = 15 / 1_000_000
```

**Cover letter route** — update call site:

```typescript
const startMs = Date.now()
let coverLetterResult: { content: string; inputTokens: number; outputTokens: number }
try {
  coverLetterResult = await generateCoverLetter(job as Job)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'ANTHROPIC_API_KEY not configured') {
    return c.json({ error: 'Cover letter generation is not configured' }, 503)
  }
  recordRun({ name: `Cover Letter - ${job.company} - ${job.jobTitle}`,
    success: false, itemCount: 0, errorMessage: message, durationMs: Date.now() - startMs })
  return c.json({ error: 'Cover letter generation failed' }, 502)
}
const { content: coverLetterText, inputTokens, outputTokens } = coverLetterResult
const costUsd = inputTokens * SONNET_4_6_INPUT + outputTokens * SONNET_4_6_OUTPUT
// ... existing DB insert ...
recordRun({ name: `Cover Letter - ${job.company} - ${job.jobTitle}`, success: true, itemCount: 1,
  durationMs: Date.now() - startMs, inputTokens, outputTokens, costUsd })
```

**Resume route** — same pattern:

```typescript
const startMs = Date.now()
let resumeResult: { pdf: Buffer; inputTokens: number; outputTokens: number }
try {
  resumeResult = await generateResume(job as Job)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'ANTHROPIC_API_KEY not configured') {
    return c.json({ error: 'Resume generation is not configured' }, 503)
  }
  recordRun({ name: `Resume - ${job.company} - ${job.jobTitle}`,
    success: false, itemCount: 0, errorMessage: message, durationMs: Date.now() - startMs })
  return c.json({ error: 'Resume generation failed' }, 502)
}
const { pdf: pdfBuffer, inputTokens, outputTokens } = resumeResult
const costUsd = inputTokens * SONNET_4_6_INPUT + outputTokens * SONNET_4_6_OUTPUT
// ... existing disk persist logic unchanged ...
recordRun({ name: `Resume - ${job.company} - ${job.jobTitle}`, success: true, itemCount: 1,
  durationMs: Date.now() - startMs, inputTokens, outputTokens, costUsd })
```

### 8. UI: Webhook History display

The Webhook History table is in `src/client/` — find the component that renders the `webhook-runs` query result and add columns/cells for the new fields. Check where the existing columns (name, runAt, success, itemCount, errorMessage) are rendered.

**Display format:**
- `durationMs`: render as `"1.2s"` → `(durationMs / 1000).toFixed(1) + 's'`; show `"—"` if null
- `inputTokens` / `outputTokens`: render as integers; show `"—"` if null
- `costUsd`: render as `"$" + costUsd.toFixed(4)`; show `"—"` if null

---

## Pricing Note

The prices above (`claude-opus-4-7`: $15/$75, `claude-sonnet-4-6`: $3/$15 per MTok) reflect best-known values as of this story's creation. **Verify current pricing** at the Anthropic pricing page before finalizing — these constants are in two places only (`api-webhooks.ts` and `api-jobs.ts`) so a correction is a two-line change.

---

## Files to Change

| File | Change |
|---|---|
| `src/db/migrations/0016_webhook_run_metrics.sql` | **New** — 4 `ALTER TABLE` statements |
| `src/db/schema.ts` | Add `durationMs`, `inputTokens`, `outputTokens`, `costUsd` to `webhookRuns`; add `real` to import |
| `src/server/routes/api-webhook-runs.ts` | Extend `recordRun` params; persist new fields |
| `src/server/services/analysis-service.ts` | Return `inputTokens`/`outputTokens`; accumulate across batch; extend `AnthropicMessage` with `usage` |
| `src/server/services/cover-letter-service.ts` | Return `{ content, inputTokens, outputTokens }`; extend `AnthropicResponse` with `usage` |
| `src/server/services/resume-service.ts` | Return `{ pdf, inputTokens, outputTokens }`; extend `AnthropicResponse` with `usage` |
| `src/server/routes/api-webhooks.ts` | Add timing + pricing constants; pass new fields to `recordRun` |
| `src/server/routes/api-jobs.ts` | Add timing + pricing constants; update cover-letter and resume call sites |
| Webhook History UI component | Add 4 new columns with display formatting |

---

## Dev Agent Guardrails

**Do not create a shared utility for cost calculation.** Three inline multiplications across two files is not worth an abstraction. Inline the constants at each call site.

**`real` type import.** `schema.ts` currently imports `integer, text, sqliteTable, uniqueIndex`. Add `real` to that import — it is available in `drizzle-orm/sqlite-core`.

**Timing placement.** `startMs = Date.now()` goes _before_ the service call, not inside it. `Date.now() - startMs` goes at each `recordRun` call site (both success and failure paths). This measures end-to-end wall time including any pre-flight work.

**Analysis token accumulation.** Initialize `totalInputTokens = 0` and `totalOutputTokens = 0` _before_ the `for` loop. Only add to them inside the `try` block after a successful Anthropic response. The `failed` count already handles error accounting.

**`generateResume` return type.** The current code does `return generatePdf(html)`. If `generatePdf` is async (returns `Promise<Buffer>`), change to `return { pdf: await generatePdf(html), inputTokens: ..., outputTokens: ... }`. Check `generate-pdf.ts` before writing.

**Test mocks need updating.**
- `api-webhooks.test.ts` line 13: the `mockRunAnalysis` type must match the new return shape:
  ```typescript
  let mockRunAnalysis: (onProgress?: (msg: string) => void) => Promise<{ processed: number; failed: number; inputTokens: number; outputTokens: number }> =
    async () => ({ processed: 0, failed: 0, inputTokens: 0, outputTokens: 0 })
  ```
- `api-webhooks.test.ts` line 24: the `CREATE_WEBHOOK_RUNS_TABLE` DDL needs the 4 new columns:
  ```sql
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL
  ```
- `api-cover-letter.test.ts` line 7: the mock `generateCoverLetter` must return the new shape:
  ```typescript
  let mockGenerateCoverLetter: () => Promise<{ content: string; inputTokens: number; outputTokens: number }> =
    async () => ({ content: 'Mock cover letter text', inputTokens: 100, outputTokens: 200 })
  ```
- Same update needed in `api-resume.test.ts` for `mockGenerateResume` if it exists.

**Existing callers in `api-jobs.ts` that call `recordRun` without new fields** (e.g. error path before the Anthropic call succeeds) are fine — new params are all optional.

**No change to `useWebhookStream.ts` or `PipelineRoute`** — the NDJSON protocol (`done`, `status`, `error` events) is unchanged. The new data is only persisted server-side via `recordRun`.

**TypeScript strict mode**: `real` columns in Drizzle return `number | null`. The `recordRun` params use `number | null` for the new fields — this matches.

---

## Test Guidance

**For `analysis-service.test.ts`:** Add a test that provides a mock Anthropic response with `usage: { input_tokens: 50, output_tokens: 30 }` and verifies the returned `inputTokens`/`outputTokens` values. For a multi-job batch, verify the values are summed.

**For `api-webhooks.test.ts`:** After running the analysis route with a mock that returns token data, query the `webhook_runs` table and assert `input_tokens`, `output_tokens`, `cost_usd`, and `duration_ms` are all non-null. Assert `duration_ms >= 0`.

**For `api-cover-letter.test.ts` / `api-resume.test.ts`:** If these tests assert on the webhook_runs row, add the 4 new columns to the in-test `CREATE TABLE` DDL and assert the new fields are written.

---

## Project Context Reference

- All shared types live in `src/shared/schemas.ts` — no new shared types needed (webhook run shape is internal to the server)
- `real` from `drizzle-orm/sqlite-core` maps to SQLite `REAL` — correct type for floating-point USD cost
- `bun:test` only — never import from `vitest` or `jest`
- `DB_PATH = ':memory:'` must be set at top of every test file
- In-test table DDL: create manually in `beforeAll`, not via migration runner
- `console.error` for server-side errors; `console.log` is forbidden for errors

---

## Tasks/Subtasks

- [x] Task 1: Migration and schema
  - [x] Create `src/db/migrations/0016_webhook_run_metrics.sql` with 4 `ALTER TABLE` statements
  - [x] Add `real` to import + 4 new columns to `webhookRuns` in `src/db/schema.ts`
- [x] Task 2: Extend `recordRun` in `src/server/routes/api-webhook-runs.ts`
  - [x] Add 4 optional params; persist them in the `db.insert` call
- [x] Task 3: Update `analysis-service.ts`
  - [x] Add `usage` to `AnthropicMessage` interface
  - [x] Declare `totalInputTokens`/`totalOutputTokens` before loop; accumulate after each Anthropic call
  - [x] Return `{ processed, failed, inputTokens, outputTokens }`
- [x] Task 4: Update `cover-letter-service.ts`
  - [x] Add `usage` to `AnthropicResponse` interface
  - [x] Return `{ content, inputTokens, outputTokens }`
- [x] Task 5: Update `resume-service.ts`
  - [x] Add `usage` to `AnthropicResponse` interface; check `generatePdf` sync/async
  - [x] Return `{ pdf, inputTokens, outputTokens }`
- [x] Task 6: Update `api-webhooks.ts`
  - [x] Add pricing constants for `claude-opus-4-7`
  - [x] Add `startMs` timing to both routes
  - [x] Pass `durationMs`, `inputTokens`, `outputTokens`, `costUsd` to `recordRun`
- [x] Task 7: Update `api-jobs.ts`
  - [x] Add pricing constants for `claude-sonnet-4-6`
  - [x] Add `startMs` timing + destructure token results for both cover letter and resume routes
  - [x] Pass new fields to `recordRun` on both success and failure paths
- [x] Task 8: Update Webhook History UI component
  - [x] Add duration, input tokens, output tokens, cost columns with display formatting
- [x] Task 9: Update tests
  - [x] `api-webhooks.test.ts`: update mock type + `CREATE_WEBHOOK_RUNS_TABLE` DDL
  - [x] `api-cover-letter.test.ts`: update mock return type
  - [x] `api-resume.test.ts`: update mock return type if present
  - [x] `analysis-service.test.ts`: add token accumulation tests

---

## File List

- `job-hunt-dashboard/src/db/migrations/0016_webhook_run_metrics.sql` (new)
- `job-hunt-dashboard/src/db/schema.ts` (modified)
- `job-hunt-dashboard/src/shared/schemas.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-webhook-runs.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-webhooks.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-jobs.ts` (modified)
- `job-hunt-dashboard/src/server/services/analysis-service.ts` (modified)
- `job-hunt-dashboard/src/server/services/cover-letter-service.ts` (modified)
- `job-hunt-dashboard/src/server/services/resume-service.ts` (modified)
- `job-hunt-dashboard/src/client/routes/history.tsx` (modified)
- `job-hunt-dashboard/src/server/routes/api-webhook-runs.test.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-webhooks.test.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-cover-letter.test.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-resume.test.ts` (modified)
- `job-hunt-dashboard/src/server/routes/api-stats.test.ts` (modified)
- `job-hunt-dashboard/src/server/services/analysis-service.test.ts` (modified)
- `job-hunt-dashboard/src/server/services/cover-letter-service.test.ts` (modified)
- `job-hunt-dashboard/src/server/services/resume-service.test.ts` (modified)

---

## Dev Agent Record

### Completion Notes

Implemented pipeline run metrics (duration, token usage, cost) for all four flows:

- **Migration**: Added 4 nullable columns to `webhook_runs` via `0016_webhook_run_metrics.sql`.
- **Schema + recordRun**: Extended Drizzle schema and `recordRun` params with `durationMs`, `inputTokens`, `outputTokens`, `costUsd` — all optional for backward compat.
- **Services**: Added `usage` to Anthropic response interfaces in all three services. `analysis-service` accumulates tokens across batch. `cover-letter-service` and `resume-service` return token counts alongside their primary output. `generatePdf` confirmed async (`Promise<Buffer>`).
- **Routes**: `api-webhooks.ts` adds timing and cost for Discovery/Analysis. `api-jobs.ts` adds timing and cost for Cover Letter/Resume. Pricing constants inline per guardrail.
- **UI**: `history.tsx` gains Duration, Input Tokens, Output Tokens, Cost columns with `—` for null values.
- **Tests**: Updated 8 test files — DDL, mock shapes, mock responses (added `usage`), assertions. Added 3 new token accumulation tests to `analysis-service.test.ts`. All 206 passing tests pass; 7 pre-existing `api-ingest.test.ts` failures unchanged.

### Review Findings

- [x] [Review][Patch] `usage` field accessed without null guard in all 3 Anthropic services — `anthropicData.usage.input_tokens` etc. accessed without `?.`; if Anthropic omits `usage`, TypeError crashes the service [analysis-service.ts:133, cover-letter-service.ts:64, resume-service.ts:376]
- [x] [Review][Patch] `costUsd` returned as string from SQLite REAL over JSON; `val.toFixed()` crashes History table — root cause of "val.toFixed is not a function" [history.tsx:68]
- [x] [Review][Patch] Analysis failed-run path records NULL tokens/cost instead of 0s — AC2/AC3 require Anthropic flows to record 0s on failure, not NULL; currently indistinguishable from Discovery [api-webhooks.ts:44-46]
- [x] [Review][Defer] Pricing constants hardcoded with no runtime binding to model actually called [api-jobs.ts:3, api-webhooks.ts:7] — deferred, pre-existing design
- [x] [Review][Defer] `durationMs` timing inconsistent — success path includes DB write, error path doesn't [api-jobs.ts, api-webhooks.ts] — deferred, negligible impact
- [x] [Review][Defer] Token test "failed jobs contribute 0" relies on DB insertion order [analysis-service.test.ts] — deferred, low risk
- [x] [Review][Defer] `recordRun` fire-and-forget; metrics silently lost on DB failure [api-webhook-runs.ts] — deferred, pre-existing
- [x] [Review][Defer] `durationMs` schema column nullable but AC1 states non-null [schema.ts:62] — deferred, acknowledged in spec
- [x] [Review][Defer] Cell renderers mix plain string and JSX return types [history.tsx] — deferred, cosmetic
- [x] [Review][Defer] ANTHROPIC_API_KEY error matched by exact string literal [api-jobs.ts:240,298] — deferred, pre-existing

### Change Log

- 2026-04-20: Implemented story 20-1 — pipeline run metrics (duration, token counts, USD cost) for Discovery, Analysis, Cover Letter, and Resume flows.
