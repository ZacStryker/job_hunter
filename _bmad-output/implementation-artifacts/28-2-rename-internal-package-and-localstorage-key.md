# Story 28.2: Rename Internal Package and localStorage Key

**Epic:** 28 — HITLOBSTER Rebrand  
**Story ID:** 28-2-rename-internal-package-and-localstorage-key  
**Status:** review  
**Date:** 2026-05-07

---

## Story

As a developer,
I want the npm package name and localStorage key to reflect HITLOBSTER,
so that the internal codebase is consistent with the new brand.

---

## Acceptance Criteria

### AC1 — package.json name field
- `job-hunt-dashboard/package.json` `name` field reads `"hitlobster"` — not `"job-hunt-dashboard"`.

### AC2 — VISIBILITY_KEY constant
- `src/client/components/pipeline/PipelineTable.tsx` `VISIBILITY_KEY` constant value is `'hitlobster-column-visibility'` — not `'job-hunt-column-visibility'`.

### AC3 — localStorage preference loss accepted
- Any user who had column visibility preferences stored under `'job-hunt-column-visibility'` will silently lose those preferences on next load. Column visibility resets to defaults. **No migration of the old key is required or expected.**

---

## Tasks / Subtasks

- [x] T1: Rename npm package (AC: 1)
  - [x] T1.1: In `job-hunt-dashboard/package.json` line 2, change `"name": "job-hunt-dashboard"` to `"name": "hitlobster"`

- [x] T2: Rename localStorage key (AC: 2, 3)
  - [x] T2.1: In `src/client/components/pipeline/PipelineTable.tsx` line 38, change `'job-hunt-column-visibility'` to `'hitlobster-column-visibility'`

- [x] T3: Verify no remaining references to old names in scope
  - [x] T3.1: Run `grep -rn "job-hunt-dashboard" job-hunt-dashboard/package.json` — confirm only the changed line (none remaining with old value)
  - [x] T3.2: Run `grep -rn "job-hunt-column-visibility" src/` — confirm zero results

---

## Dev Notes

### Exact File Locations and Changes

| File | Path | Line | Change |
|------|------|------|--------|
| `package.json` | `job-hunt-dashboard/package.json` | 2 | `"name": "job-hunt-dashboard"` → `"name": "hitlobster"` |
| `PipelineTable.tsx` | `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx` | 38 | `'job-hunt-column-visibility'` → `'hitlobster-column-visibility'` |

### How VISIBILITY_KEY Is Used (PipelineTable.tsx)

The constant is referenced in exactly three places — all within `PipelineTable.tsx`:
- **Line 38:** declaration `const VISIBILITY_KEY = 'job-hunt-column-visibility'`
- **Line 42:** read on mount `localStorage.getItem(VISIBILITY_KEY)`
- **Line 190:** write on change `localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next))`

Changing the constant value at line 38 automatically propagates to both the read and write call sites. No other file references `VISIBILITY_KEY` or the old key string.

### Architecture Note — localStorage Key Is NOT Frozen for This Story

The architecture distillate states the `"job-hunt-column-visibility"` key is "frozen — changing loses user preferences." Story 28.2 explicitly overrides this: the one-time preference loss is accepted. Do not treat the architecture note as a blocker.

### Scope Boundaries — Do NOT touch in this story

- `docker-compose.yml` volume names — Story 28.3
- No new files, no migrations, no API changes, no tests needed — pure string replacement
- Do not rename the working directory `job-hunt-dashboard/` — that is outside Epic 28 scope
- Do not rename any other references to `job-hunt-dashboard` beyond `package.json` `name` (e.g., Dockerfile, nginx config) — out of scope

### No Regression Risk

- `package.json` `name` is metadata only; Bun/Vite do not use it at runtime for the build or dev server; renaming it has zero effect on `bun run dev`, `bun run build`, or `bun start`.
- `VISIBILITY_KEY` is a module-scoped constant in a single file; no external code imports it; the only effect of changing its value is that the browser reads from/writes to a differently-named localStorage key, which is the intended behavior.

### Previous Story Context (28.1)

Story 28.1 (in review) made two static string changes:
- `job-hunt-dashboard/index.html` line 6: `<title>` → `HITLOBSTER`
- `src/client/components/shared/Layout.tsx` line 16: brand span → `HITLOBSTER`

Those files are **not touched** in this story.

---

## Dev Agent Record

### Completion Notes

Two targeted string replacements completed with zero functional risk:
- `package.json` `name` field updated from `"job-hunt-dashboard"` to `"hitlobster"`. This is metadata-only; no build or runtime behavior changes.
- `VISIBILITY_KEY` constant in `PipelineTable.tsx` updated from `'job-hunt-column-visibility'` to `'hitlobster-column-visibility'`. The constant propagates automatically to both the `localStorage.getItem` (line 42) and `localStorage.setItem` (line 190) call sites — no other changes needed.
- Grep verification confirmed zero remaining references to old values in both files and across `src/`.
- No tests required per story spec; no regressions possible from pure string constant replacements.

### File List

- `job-hunt-dashboard/package.json`
- `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx`

### Change Log

- 2026-05-07: Renamed npm package name from `job-hunt-dashboard` to `hitlobster` in `package.json`. Renamed localStorage key from `job-hunt-column-visibility` to `hitlobster-column-visibility` in `PipelineTable.tsx`. Old column-visibility preferences silently lost on next load (accepted per AC3).

---

## Story Completion Status

- Story: review
- Notes: Two targeted string replacements in two files. Zero functional risk. No tests required.
