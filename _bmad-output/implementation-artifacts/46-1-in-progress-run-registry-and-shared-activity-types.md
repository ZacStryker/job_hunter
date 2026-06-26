---
baseline_commit: 68568847d93e50295c64cc64e0f8a622b80c42db
---

# Story 46.1: In-Progress Run Registry & Shared Activity Types

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer building the Activity feature,
I want a single per-user, in-memory registry of currently-active workflow runs with a shared type contract,
so that every workflow can report start/progress/finish to one place and the SSE layer has one source of truth.

## Acceptance Criteria

1. **Shared activity types in `src/shared/schemas.ts`** — Zod schemas (named `*Schema`) are exported for:
   - `activityRunType`: `'discovery' | 'analysis' | 'cover_letter' | 'resume'`
   - `activityRunState`: `'running' | 'done' | 'failed'`
   - `activityRun`: fields `id` (string), `type`, `state`, `startedAt`/`updatedAt` (ISO-8601 strings), and a `progress` payload carrying `count`/`total` for discovery & analysis and `company`/`role` for cover_letter & resume.
   - The corresponding TypeScript types are exported via `z.infer` — with **no inline redefinition** of these shapes anywhere else.

2. **`register({ userId, type, progress })`** creates a run with a unique `id`, `state: 'running'`, `startedAt`/`updatedAt` timestamps set, stores it scoped to that `userId` only, and returns the `id`.

3. **`progress(id, payload)`** updates the run's progress payload and `updatedAt`, and emits a change to that user's subscribers.

4. **`finalize(id, 'done')` / `finalize(id, 'failed')`** sets the run's `state` to `done`/`failed`, sets `updatedAt`, emits a change, and prunes the run from the active set **after a short retention window** so completion is observable before it drops out.

5. **`snapshot(userId)`** returns only that user's runs as an array — never another user's. Unknown/empty user returns `[]`.

6. **`subscribe(userId, listener)`** invokes the listener on every start/progress/finalize for that user; **`unsubscribe`** stops further calls. A different user's listener never fires for this user's changes.

7. Behavior in ACs 2–6 is verified by `bun:test` unit tests **co-located beside the module** (`activity-registry.test.ts`).

## Tasks / Subtasks

- [x] **Task 1 — Add shared activity schemas to `src/shared/schemas.ts`** (AC: 1)
  - [x] Add `activityRunTypeSchema = z.enum(['discovery', 'analysis', 'cover_letter', 'resume'])`
  - [x] Add `activityRunStateSchema = z.enum(['running', 'done', 'failed'])`
  - [x] Add a progress contract: `activityCountProgressSchema = z.object({ count: z.number().int(), total: z.number().int().nullable() })` (discovery/analysis) and `activityDocProgressSchema = z.object({ company: z.string(), role: z.string() })` (cover_letter/resume); combine as `activityProgressSchema = z.union([activityCountProgressSchema, activityDocProgressSchema])`
  - [x] Add `activityRunSchema = z.object({ id: z.string(), type: activityRunTypeSchema, state: activityRunStateSchema, startedAt: z.string(), updatedAt: z.string(), progress: activityProgressSchema })`
  - [x] Export inferred types at the bottom with the other `z.infer` exports: `ActivityRunType`, `ActivityRunState`, `ActivityProgress`, `ActivityRun`
- [x] **Task 2 — Create `src/server/services/activity-registry.ts`** (AC: 2–6)
  - [x] Implement a `createActivityRegistry()` factory returning `{ register, progress, finalize, snapshot, subscribe, unsubscribe }`, and export a shared singleton `activityRegistry = createActivityRegistry()` for production use (see Dev Notes — downstream consumers must import the *same* instance)
  - [x] Internal state: `runs` keyed by `userId` → `Map<runId, ActivityRun>`; a `runId → userId` index so `progress`/`finalize` can resolve the owner from id alone; `listeners` keyed by `userId` → `Set<listener>`
  - [x] `register`: `id = crypto.randomUUID()`; `now = new Date().toISOString()`; build run `{ id, type, state: 'running', startedAt: now, updatedAt: now, progress }`; store under `userId`; emit; return `id`
  - [x] `progress(id, payload)`: resolve `userId` from the index; replace `progress`, set `updatedAt = new Date().toISOString()`; emit
  - [x] `finalize(id, state)`: set `state` + `updatedAt`; emit; then schedule prune after `RETENTION_MS` — on prune, delete the run + index entry and emit again so subscribers see it drop
  - [x] `snapshot(userId)`: return `[...runs.get(userId)?.values() ?? []]`
  - [x] `subscribe(userId, listener)` / `unsubscribe(userId, listener)`: add/remove from that user's listener set; emit = invoke each listener for that `userId` with the fresh `snapshot(userId)`
- [x] **Task 3 — Co-located tests `src/server/services/activity-registry.test.ts`** (AC: 7)
  - [x] Each test uses a **fresh `createActivityRegistry()`** instance (no shared singleton, no DB) for isolation
  - [x] register → snapshot returns the run with `state: 'running'` and a generated `id`
  - [x] progress → snapshot reflects new payload and a bumped `updatedAt`; subscriber received the change
  - [x] finalize('done'/'failed') → state updates, subscriber notified, and run is gone from snapshot after the retention window
  - [x] **User isolation:** two userIds; `snapshot(a)` never contains b's runs; a's subscriber never fires for b's activity
  - [x] subscribe/unsubscribe: after `unsubscribe`, no further listener calls

### Review Findings

_Code review 2026-06-25 — 3 layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 decision-needed (1 resolved → deferred), 3 patch, 2 defer, 7 dismissed._

- [x] [Review][Defer] Progress payload is not bound to run `type` — `activityProgressSchema` is a bare `z.union([activityCountProgressSchema, activityDocProgressSchema])` with no discriminant tying payload shape to `type`, and neither arm is `.strict()`, so a `discovery` run can carry `{company, role}` and `{count, total, company, role}` validates against both arms. The registry also never calls `.parse()` — types are compile-time only. All 3 reviewers flagged this as the top concern. — deferred: spec explicitly prescribed the loose union; revisit a discriminated union when 46.5/46.6 narrow progress by type. [src/shared/schemas.ts:~139, activity-registry.ts register/progress]
- [x] [Review][Patch] `finalize`/`progress` lack a `state === 'running'` guard — double-`finalize` schedules a duplicate `setTimeout` (extra prune + redundant emit), and `progress` after `finalize` resurrects a finalized run's payload and bumps `updatedAt` while `state` stays `done`. [job-hunt-dashboard/src/server/services/activity-registry.ts:45,35]
- [x] [Review][Patch] `emit` is not fault- or mutation-isolated — `listenersByUser.get(userId)?.forEach(l => l(runs))` propagates if any one listener throws (remaining listeners skipped; the throw bubbles into the workflow's register/progress/finalize), and mutating the listener Set during iteration (subscribe/unsubscribe inside a listener) is unsafe. Iterate a copy and wrap each call in try/catch. [job-hunt-dashboard/src/server/services/activity-registry.ts:14]
- [x] [Review][Patch] AC6/AC7 test coverage gaps — no test for `progress`/`finalize` with an unknown id, and the cross-user isolation test only checks the `register` emit, not that user B's listener stays silent during user A's `progress`/`finalize`/prune emits. [job-hunt-dashboard/src/server/services/activity-registry.test.ts]
- [x] [Review][Defer] Retention timers are uncancellable — each `finalize` discards its `setTimeout` handle; no `dispose()` to clear pending prunes on shutdown. Real for production lifecycle but premature in this consumer-less foundational story; revisit when SSE lifecycle lands in 46.2. [job-hunt-dashboard/src/server/services/activity-registry.ts:48]

## Dev Notes

### Scope & boundaries
- This story delivers **only** the shared types + the registry service and its tests. No routes, no SSE, no workflow wiring, no client code — those are stories 46.2–46.6.
- Design the registry's public surface deliberately: it is the **single source of truth** consumed downstream by the SSE endpoint (46.2, calls `subscribe`/`snapshot`), and by `api-webhooks.ts` (46.3) and `api-jobs.ts` (46.4, call `register`/`progress`/`finalize`). The client hook (46.5) and dropdown (46.6) render `ActivityRun[]` validated against `activityRunSchema`. Keep the API minimal and exactly as the ACs name it.

### Critical project rules (from `_bmad-output/project-context.md`)
- **`userId` is a `number`**, not a string — it comes from `c.get('userId')` (typed in `src/server/types.ts:3`). `register`/`snapshot`/`subscribe` all key on a numeric `userId`. [Source: src/server/middleware/auth-middleware.ts:42]
- **All cross-boundary types come from `src/shared/schemas.ts`** — never redefine `ActivityRun`/progress shapes inline in the registry, the SSE route, or the client. Import them. [Source: project-context.md#Language-Specific Rules]
- **Zod naming:** `camelCaseSchema` suffix; types via `z.infer<typeof ...>`. Follow the existing pattern in `schemas.ts` (e.g. `webhookRunSchema` → `export type WebhookRun = z.infer<typeof webhookRunSchema>` at the file's type-export block, lines ~231–236).
- **Dates are ISO-8601 strings everywhere** — use `new Date().toISOString()` for `startedAt`/`updatedAt`. Never store `Date` objects or Unix timestamps. [Source: project-context.md]
- **Unique ids:** use the global `crypto.randomUUID()` — this is the established in-repo pattern (no import needed). [Source: src/server/services/linkedin-browser-service.ts:33, indeed-browser-service.ts:33]
- **Collections are arrays** in any boundary-facing shape — `snapshot` returns an array, never an object keyed by id. [Source: project-context.md]
- **`console.error` for server errors**; `console.log` for errors is forbidden (likely no logging needed here at all — keep it silent).
- **No speculative abstractions / no comments unless non-obvious.** There is **no existing EventEmitter/pub-sub in the codebase** (`grep` for `EventEmitter`/`subscribe`/`emit(` in `src/server` returns nothing) — do **not** pull in Node's `events` or any dependency. A plain `Map<userId, Set<listener>>` is the right, minimal mechanism.

### Registry shape — recommended design
```ts
// src/server/services/activity-registry.ts
import { randomUUID } from 'crypto'  // or use global crypto.randomUUID()
import type { ActivityRun, ActivityRunType, ActivityRunState, ActivityProgress } from '@shared/schemas'

export type ActivityListener = (runs: ActivityRun[]) => void
export const RETENTION_MS = 5_000

export function createActivityRegistry() {
  const runsByUser = new Map<number, Map<string, ActivityRun>>()
  const ownerById = new Map<string, number>()
  const listenersByUser = new Map<number, Set<ActivityListener>>()
  // register / progress / finalize / snapshot / subscribe / unsubscribe ...
  return { register, progress, finalize, snapshot, subscribe, unsubscribe }
}

export const activityRegistry = createActivityRegistry()
```
- **Why a factory + singleton:** production code (46.2–46.4) imports the one `activityRegistry` so they share state; tests call `createActivityRegistry()` for a clean instance each time. This gives test isolation without a global `reset()` hack (which would violate the "no helpers for one-time ops" rule).
- `emit(userId)` helper (internal): `listenersByUser.get(userId)?.forEach(l => l(snapshot(userId)))`. Push the **full fresh snapshot** so the SSE layer/client just replace their list — simplest contract for 46.2/46.5.

### Progress payload — why a union
The four workflows carry different progress data: discovery/analysis report numeric `count`/`total`; cover_letter/resume report `company`/`role` (rendered in the dropdown as "Generating … — {Company} · {Role}" in 46.6). A `z.union([activityCountProgressSchema, activityDocProgressSchema])` keeps both shapes type-safe rather than one loose object with everything optional. Discovery has no fixed total mid-run → `total` is `.nullable()`; analysis sets both `count` and `total` from its `Analyzing i / total` messages (46.3).

### Retention window & testability (AC 4 + 7)
- `finalize` schedules pruning via `setTimeout(..., RETENTION_MS)`. Keep `RETENTION_MS` an exported module constant so the test can reason about it.
- For the "run is gone after retention" test: either (a) await a real timeout slightly longer than a small retention value, or (b) have the test use a fresh registry and assert the run is present immediately after `finalize` (state `done`), then absent after the window. Bun's `bun:test` runs real timers; prefer a short, deterministic wait. Do **not** introduce fake-timer libraries. If a tighter test is wanted, accept an optional `retentionMs` override on `finalize` — but only if it reads cleanly; otherwise the constant + short await is fine.
- Emitting again on prune is required so the client/dropdown sees the row drop out (don't silently delete).

### Testing standards (from project-context.md#Testing Rules)
- Runner is `bun:test` — import `describe`, `test`, `expect`, `beforeEach` from `bun:test`; **never** vitest/jest.
- Co-locate as `activity-registry.test.ts` beside the module — no `__tests__/` dir.
- **No DB** is involved here, so do **not** set `DB_PATH` or build tables — this is a pure in-memory unit. (That setup applies only to DB-touching tests.)
- Use a fresh `createActivityRegistry()` per test (or in `beforeEach`) for isolation.
- Assert both the emitted payload (subscriber received array) and the `snapshot` state where relevant.

### Project Structure Notes
- New files: `src/server/services/activity-registry.ts`, `src/server/services/activity-registry.test.ts` — consistent with existing `services/*-service.ts` + co-located `*.test.ts` layout (e.g. `analysis-service.ts` / `analysis-service.test.ts`).
- File naming: kebab-case `.ts` for the service (matches repo convention). [Source: project-context.md#Naming Conventions]
- `schemas.ts` edit: add the new schemas grouped together; add the `z.infer` type exports alongside the existing block near the end of the file (after `webhookRunSchema`/around the other type exports). No other file should redefine these.
- Import alias for the type import in the server service: `@shared/schemas` (configured in `vite.config.ts` + `tsconfig.json`). [Source: project-context.md#Technology Stack]

### References
- [Source: _bmad-output/planning-artifacts/epics/epic-46-activity-dropdown.md#Story 46.1] — full AC text
- [Source: _bmad-output/project-context.md#Critical Implementation Rules] — Zod naming, ISO dates, userId, no-inline-types, testing rules
- [Source: src/shared/schemas.ts#webhookRunSchema] — schema + `z.infer` export pattern to mirror
- [Source: src/server/types.ts:3] — `userId: number` Hono Variables typing
- [Source: src/server/middleware/auth-middleware.ts:42] — `c.set('userId', …)`
- [Source: src/server/services/linkedin-browser-service.ts:33] — `crypto.randomUUID()` precedent

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `bun test src/server/services/activity-registry.test.ts` → 8 pass / 0 fail (23 assertions)
- `bunx tsc --noEmit` → new files (`activity-registry.ts`, schemas additions) are type-clean; remaining errors are pre-existing in unrelated files (client routes, `useMessageMutation`, auth-middleware).
- Full suite regression check: baseline (changes stashed) = 412 pass / 40 fail; with changes = 420 pass / 40 fail → **+8 passing (the new tests), 0 new regressions**. The 40 failures are pre-existing and unrelated (network-dependent gmail tests, onboarding/linkedin).

### Completion Notes List

- AC1: Added `activityRunTypeSchema`, `activityRunStateSchema`, `activityCountProgressSchema`, `activityDocProgressSchema`, `activityProgressSchema` (union), and `activityRunSchema` to `src/shared/schemas.ts`, placed directly after `webhookRunSchema` with inline `z.infer` exports (`ActivityRunType`, `ActivityRunState`, `ActivityProgress`, `ActivityRun`) mirroring the existing pattern. No shapes are redefined elsewhere.
- AC2–6: Implemented `createActivityRegistry()` factory + shared `activityRegistry` singleton in `src/server/services/activity-registry.ts`. State: `runsByUser: Map<number, Map<string, ActivityRun>>`, `ownerById: Map<string, number>`, `listenersByUser: Map<number, Set<listener>>`. `emit(userId)` pushes the full fresh `snapshot(userId)` to that user's listeners only.
- **Project-rule note:** `userId` is keyed as a `number` (per project-context.md / `src/server/types.ts`), not the `string` implied loosely in the AC prose. Used the global `crypto.randomUUID()` and ISO-8601 `new Date().toISOString()` timestamps per repo conventions. Imported shared types via relative `../../shared/schemas` — the actual convention used by every other file in `src/server/services/` (the `@shared/schemas` alias mentioned in Dev Notes is not used anywhere in `src/server`).
- AC4 retention: `finalize` schedules pruning via `setTimeout(..., retentionMs)`, defaulting to the exported `RETENTION_MS = 5_000` constant; on prune it deletes the run + index entry and emits again so subscribers observe the drop. Added an **optional** `retentionMs` override param (Dev-Notes-sanctioned) so the prune test is fast and deterministic without fake-timer libraries; downstream production callers (46.3/46.4) are unaffected as it defaults to the constant.
- AC7: 8 co-located `bun:test` cases using a fresh `createActivityRegistry()` per test (no DB, no shared singleton). Covers register/snapshot, progress + updatedAt bump + subscriber notification, finalize done/failed + post-retention prune, two-user isolation (snapshot + subscriber), unknown-user `[]`, and unsubscribe.

### File List

- `job-hunt-dashboard/src/shared/schemas.ts` (modified — added activity schemas + inferred types)
- `job-hunt-dashboard/src/server/services/activity-registry.ts` (new)
- `job-hunt-dashboard/src/server/services/activity-registry.test.ts` (new)

## Change Log

- 2026-06-25 — Implemented Story 46.1: shared activity Zod types in `schemas.ts` + in-memory per-user `activity-registry` service with co-located `bun:test` unit tests. All 7 ACs satisfied; 8/8 new tests pass; no new regressions.
