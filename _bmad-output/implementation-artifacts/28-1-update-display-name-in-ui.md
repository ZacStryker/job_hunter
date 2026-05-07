# Story 28.1: Update Display Name in UI

**Epic:** 28 — HITLOBSTER Rebrand  
**Story ID:** 28-1-update-display-name-in-ui  
**Status:** review  
**Date:** 2026-05-07

---

## Story

As a user,
I want to see "HITLOBSTER" in the navbar and browser tab,
so that the app identity is consistent with the new brand everywhere I look.

---

## Acceptance Criteria

### AC1 — Browser tab title
- `index.html` `<title>` reads `"HITLOBSTER"` — not `"Job Hunt Dashboard"`.

### AC2 — Navbar brand label
- The `<span>` in `Layout.tsx` that currently renders `"Job Hunt"` now renders `"HITLOBSTER"`.

### AC3 — No other user-visible strings reference "Job Hunt"
- A grep for `"Job Hunt"` in `src/` returns zero results after this story is complete.
- The `job-hunt-column-visibility` localStorage key in `PipelineTable.tsx` is **out of scope** for this story — it is addressed in Story 28.2.

---

## Tasks / Subtasks

- [x] T1: Update browser tab title (AC: 1)
  - [x] T1.1: In `index.html` line 6, change `<title>Job Hunt Dashboard</title>` to `<title>HITLOBSTER</title>`

- [x] T2: Update navbar brand label (AC: 2)
  - [x] T2.1: In `src/client/components/shared/Layout.tsx` line 16, change the text content of the brand `<span>` from `"Job Hunt"` to `"HITLOBSTER"`

- [x] T3: Verify no remaining user-visible "Job Hunt" strings (AC: 3)
  - [x] T3.1: Run `grep -rn "Job Hunt" src/` — confirm zero results (the `VISIBILITY_KEY` in `PipelineTable.tsx` contains `job-hunt-column-visibility` but that is lowercase and handled in Story 28.2; this grep is case-sensitive so it will not match)

---

## Dev Notes

### Exact File Locations

| File | Location | Change |
|------|----------|--------|
| `index.html` | `/job-hunt-dashboard/index.html` line 6 | `<title>` content |
| `Layout.tsx` | `src/client/components/shared/Layout.tsx` line 16 | Brand `<span>` text |

### Scope Boundaries — Do NOT touch in this story

- `src/client/components/pipeline/PipelineTable.tsx` — `VISIBILITY_KEY = 'job-hunt-column-visibility'` is Story 28.2
- `package.json` `name` field — Story 28.2
- `docker-compose.yml` volume names — Story 28.3
- No new files, no migrations, no API changes, no tests needed — this is pure string replacement

### No Regression Risk

- `Layout.tsx` renders the brand span as a static string with no logic; changing its text content has zero functional side effects.
- `index.html` `<title>` is a static HTML string; Vite inlines it at build time; no runtime impact.

---

## Dev Agent Record

### Completion Notes

- T1: Changed `<title>Job Hunt Dashboard</title>` → `<title>HITLOBSTER</title>` in `job-hunt-dashboard/index.html` line 6.
- T2: Changed brand `<span>` text from `"Job Hunt"` → `"HITLOBSTER"` in `src/client/components/shared/Layout.tsx` line 16.
- T3: `grep -rn "Job Hunt" src/` returns zero results. AC3 satisfied. `job-hunt-column-visibility` (lowercase) is out of scope per story spec and not matched by case-sensitive grep.

### File List

- `job-hunt-dashboard/index.html`
- `job-hunt-dashboard/src/client/components/shared/Layout.tsx`

### Change Log

- 2026-05-07: Changed browser tab title and navbar brand label to "HITLOBSTER" (Story 28.1)

---

## Story Completion Status

- Story: review
- Notes: Two static string replacements across two files. Zero functional risk. No tests required.
