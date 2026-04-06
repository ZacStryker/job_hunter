# Story 6.3: Email Events Visible in Drawer

Status: done

## Story

As a user,
I want to see email-detected status events in a job's timeline in the detail drawer,
So that I have a complete audit trail of how the application progressed.

## Acceptance Criteria

1. **Given** a job has email-matched status events in `status_events`
   **When** the `StatusTimeline` renders in the drawer
   **Then** each email-sourced event shows a distinct indicator (envelope icon or "via email" label) alongside the status and timestamp

2. **Given** a job has both manually set status events and email-detected events
   **When** the `StatusTimeline` renders
   **Then** all events are displayed in reverse chronological order regardless of source

## Tasks / Subtasks

- [x] Task 1: Add email source indicator to `StatusTimeline` (AC: 1, 2)
  - [x] In `src/client/components/detail/StatusTimeline.tsx`, import `Mail` from `lucide-react`
  - [x] In the event row, conditionally render a `<Mail size={12} />` icon (or a `"via email"` text label) when `event.source === 'email'`
  - [x] Position the indicator alongside the status text (e.g., inline after the status label, or as a subtle suffix)
  - [x] Verify reverse-chronological order is preserved — the API already returns events `ORDER BY timestamp DESC`; no client-side sorting needed

- [x] Task 2: Verify (AC: all)
  - [x] `/home/zac/.bun/bin/bun run --bun tsc --noEmit` — zero TypeScript errors
  - [x] `/home/zac/.bun/bin/bun test` — all existing tests still pass (no new tests needed for this pure UI change)

### Review Findings

- [x] [Review][Defer] No `aria-label` on `<Mail>` icon — screen readers get no indication that this event was email-sourced [StatusTimeline.tsx] — deferred, accessibility hardening pass (consistent with Epic 5 deferred a11y items)
- [x] [Review][Defer] `status_events.source` column has no DB CHECK constraint — accepts arbitrary strings beyond `'manual'`/`'email'`; Zod enum only enforces at schema level, not at API return path [schema.ts, 0002_unknown_slipstream.sql] — deferred, pre-existing from Story 6.2
- [x] [Review][Defer] `useJobEvents` swallows non-ok API responses silently — returns `[]` on any fetch error, showing misleading empty state instead of surfacing the error [useJobEvents.ts] — deferred, pre-existing
- [x] [Review][Defer] `new Date(event.timestamp)` on a malformed/unparseable timestamp silently renders `"Invalid Date"` inline — no guard in `StatusTimeline` or at the API boundary [StatusTimeline.tsx] — deferred, pre-existing
- [x] [Review][Defer] `STATUS_LABELS` has no fallback formatting — raw snake_case DB values (e.g., `'offer_accepted'`) render verbatim for any status not in the map; more likely to surface now that the email path is live [StatusTimeline.tsx] — deferred, pre-existing

## Dev Notes

### What Already Exists — Do Not Rebuild

- **`StatusEvent` type** (`src/shared/schemas.ts` line 38–44) already has `source: z.enum(['manual', 'email'])` — added in Story 6-2
- **`GET /api/jobs/:id/events`** (`src/server/routes/api-jobs.ts` line 21–43) already returns `source` in every event row via `db.select().from(statusEvents)` — no backend change needed
- **`useJobEvents`** hook (`src/client/hooks/useJobEvents.ts`) already fetches and types events with `source` field
- **API ordering**: events are already sorted `ORDER BY timestamp DESC` at the DB level — `StatusTimeline` receives them pre-sorted, do not add a client-side sort

### Current `StatusTimeline` — What to Change

Current file: `src/client/components/detail/StatusTimeline.tsx`

```tsx
// CURRENT — no source awareness
{events.map((event) => (
  <div key={event.id} className="flex items-start gap-2">
    <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />
    <div>
      <p className="text-sm text-zinc-200">
        {STATUS_LABELS[event.status] ?? event.status}
      </p>
      <p className="text-xs text-zinc-500">
        {new Intl.DateTimeFormat(...).format(new Date(event.timestamp))}
      </p>
    </div>
  </div>
))}
```

Add `Mail` import and conditionally render the indicator:

```tsx
import { Mail } from 'lucide-react'

// UPDATED — with source indicator
{events.map((event) => (
  <div key={event.id} className="flex items-start gap-2">
    <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />
    <div>
      <p className="text-sm text-zinc-200 flex items-center gap-1.5">
        {STATUS_LABELS[event.status] ?? event.status}
        {event.source === 'email' && (
          <Mail size={12} className="text-zinc-500 shrink-0" />
        )}
      </p>
      <p className="text-xs text-zinc-500">
        {new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(event.timestamp))}
      </p>
    </div>
  </div>
))}
```

### Key Constraints

- **`lucide-react` is already a project dependency** — it's used in `JobDrawer.tsx` (`ExternalLink`). Do not add a new package.
- **`StatusEvent` type** is imported from `@shared/schemas` — always use the canonical type, never redefine inline.
- **No backend changes** — `source` is already in the DB, schema, API response, and TypeScript type.
- **No new tests** — this is a pure render change on a client component; no testable server logic changes.
- **TypeScript strict mode**: `noUnusedLocals` / `noUnusedParameters` are compile errors — ensure `Mail` import is actually used.

### Architecture Compliance

- Component is in `src/client/components/detail/` — correct location per project structure
- `StatusEvent` type imported from `@shared/schemas` only — no inline redefinition
- No new hooks, no new API routes, no new query keys

### File Changed in This Story

```
src/
  client/
    components/
      detail/
        StatusTimeline.tsx   ← ONLY file modified
```

### Previous Story Learnings (from Stories 6.1 & 6.2)

- **`bun` not in PATH** — use `/home/zac/.bun/bin/bun` for all CLI commands
- **TypeScript strict mode** — every imported symbol must be used; `noUnusedLocals` is a compile error

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Added `Mail` icon import from `lucide-react` to `StatusTimeline.tsx`
- Conditionally renders `<Mail size={12} />` inline after the status label when `event.source === 'email'`
- Reverse-chronological order confirmed preserved (API handles ORDER BY, no client sort needed)
- TypeScript: zero errors (`tsc --noEmit`)
- Tests: 73/73 pass, 0 regressions

### File List

- `job-hunt-dashboard/src/client/components/detail/StatusTimeline.tsx`

## Change Log

- 2026-04-05: Story created by SM agent (create-story workflow)
- 2026-04-05: Implemented by dev agent — added email source indicator (Mail icon) to StatusTimeline
