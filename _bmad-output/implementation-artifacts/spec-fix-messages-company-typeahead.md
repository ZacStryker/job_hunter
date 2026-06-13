---
title: 'Fix clipped company typeahead dropdown on Messages page'
type: 'bugfix'
created: '2026-06-13'
status: 'done'
context: []
baseline_commit: 'eca577d29524b63e15921471d16a238fa6d07b83'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On the Messages page, the Company field typeahead dropdown no longer appears. Commit `e45f342` (resizable columns) added `overflow-hidden` to every `TableCell`; the custom `CompanyTypeahead` renders its options list as a plain `absolute`-positioned `<div>` inside the cell, so it is now clipped and effectively invisible. The sibling `Type`/`Job Title` `Select`s are unaffected because Radix renders them in a portal.

**Approach:** Render the `CompanyTypeahead` options dropdown in a portal (escaping cell clipping) positioned against the input's bounding rect, mirroring the portal pattern Radix `Select` already uses in this table. Do not weaken the cell `overflow-hidden` that the column-resize/ellipsis feature relies on.

## Boundaries & Constraints

**Always:** Keep `overflow-hidden` on `TableCell` intact. Preserve all existing typeahead behavior: focus opens with full list, typing filters case-insensitively, Enter selects first match, Escape/blur closes, mouse selection commits and clears. The `—` (clear/null) option must remain. Selecting still calls `onCommit` with the company string or `null`.

**Ask First:** Swapping the custom typeahead for a different component library (e.g. a shadcn Command/Combobox).

**Never:** Removing or loosening cell/table `overflow-hidden`. Changing the `mutate` patch shape (`{ company, jobTitle: null }`). Touching the `Type` or `Job Title` columns. Adding a new dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Focus input | Cell has company set | Dropdown renders below input, fully visible (not clipped), shows `—` + all distinct companies | N/A |
| Type filter | "goo" typed | List filters to companies containing "goo" (case-insensitive) | empty list shows only `—` |
| Mouse select | Click a company row | `onCommit(company)` fires, dropdown closes, input shows committed value | N/A |
| Select `—` | Click `—` row | `onCommit(null)` fires, value cleared | N/A |
| Scroll table while open | Dropdown open, container scrolls | Dropdown stays aligned to input OR closes — never floats detached over wrong cell | N/A |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/client/components/messages/MessagesTable.tsx` -- contains `CompanyTypeahead` (lines ~79-165); the absolute dropdown div is the clipped element. Only this component changes.

## Tasks & Acceptance

**Execution:**
- [x] `job-hunt-dashboard/src/client/components/messages/MessagesTable.tsx` -- in `CompanyTypeahead`, render the options dropdown via `createPortal` (from `react-dom`) to `document.body` using `position: fixed` coordinates derived from the input's `getBoundingClientRect()`; recompute on open and on window scroll/resize (capture-phase) — close the dropdown on scroll if recomputing is not done. Keep `onMouseDown`+`preventDefault` selection handlers so blur-close (150ms timeout) does not pre-empt selection. -- escapes the cell `overflow-hidden` clip while preserving all behavior.

**Acceptance Criteria:**
- Given a message row with `Type`/`Job Title` widths resized, when the user focuses the Company input, then the full options dropdown is visible and not clipped by the cell.
- Given the dropdown is open, when the user types, clicks an option, or clicks `—`, then filtering and commit behave exactly as before the regression.
- Given the dropdown is open, when the user scrolls the messages table, then the dropdown does not appear orphaned over an unrelated cell.

## Design Notes

The committed list is built in `MessagesTable` (`distinctCompanies`) and passed via `options`; no data-layer change is needed — this is purely a rendering/clipping fix. Match the portal-escape behavior already present for the Radix `Select` columns so all three editable columns behave consistently.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bunx tsc --noEmit` -- expected: no type errors
- `cd job-hunt-dashboard && bun run build` -- expected: build succeeds

**Manual checks:**
- Run `bun run dev`, open Messages, resize columns, focus a Company cell → dropdown is fully visible; type/select/clear all work; scroll does not leave an orphaned dropdown.

## Suggested Review Order

- The fix: dropdown now renders via `createPortal` to `document.body`, escaping the cell's `overflow-hidden` clip.
  [`MessagesTable.tsx:159`](../../job-hunt-dashboard/src/client/components/messages/MessagesTable.tsx#L159)

- Position source: `fixed` coords derived from the input's bounding rect, computed on open.
  [`MessagesTable.tsx:99`](../../job-hunt-dashboard/src/client/components/messages/MessagesTable.tsx#L99)

- Keep-aligned-on-scroll: capture-phase scroll/resize listeners reposition while open, then clean up.
  [`MessagesTable.tsx:106`](../../job-hunt-dashboard/src/client/components/messages/MessagesTable.tsx#L106)

- Supporting: `createPortal` import and `menuRect` state.
  [`MessagesTable.tsx:11`](../../job-hunt-dashboard/src/client/components/messages/MessagesTable.tsx#L11)
