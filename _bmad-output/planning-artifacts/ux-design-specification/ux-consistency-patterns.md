# UX Consistency Patterns

## Feedback Patterns

**Sync result feedback** — inline `Alert` below the header bar, not a floating toast. Persists until dismissed or next sync. Two variants:

- **Success:** `variant="default"` with green border tint — "15 records added, 47 updated." Auto-dismisses after 4s.
- **Error:** `variant="destructive"` — "Sync failed — OAuth token expired. No data was modified." Persists until next sync attempt.

**Applied toggle feedback** — no toast. The `Switch` flips immediately (optimistic); the row in Tracker view gains the applied date. The state change is the feedback.

**Status override feedback** — no toast. The `Select` shows the new value; the drawer reflects it immediately.

**Rule:** No floating toasts anywhere. All feedback is inline and contextual to the triggering element or view.

## Loading & Empty States

**Initial table load** — `Skeleton` rows (5–8 rows of shimmer) while TanStack Query fetches. Column structure preserved so the layout doesn't shift.

**Empty table (no data)** — centered empty state inside the card: "No jobs yet. Hit Sync to pull from Google Sheets." Single `Button` shortcut to trigger sync.

**Empty drawer field** — `AssessmentSection` renders nothing if `content` is null. No "N/A" placeholder — absent fields are simply absent.

**Sync button loading** — button disabled + spinner inline. Table remains fully interactive during sync; data refreshes when invalidation resolves.

## Table Interaction Patterns

**Row click** — entire row is the click target. Opens the drawer for that job. No separate action column.

**Active row** — selected row gets `bg-zinc-800` highlight while drawer is open. Clears on drawer close.

**Column visibility** — `DropdownMenu` in the header toolbar. Checkboxes per optional column (`reqs_met`, `reqs_missed`, `notes`). Persists to `localStorage` under key `job-dashboard:column-visibility`. All columns shown on first load.

**Sorting** — click column header to sort ascending; click again for descending. Fit score sorts descending by default. No multi-column sort.

**No row selection checkboxes** — not a bulk-action interface. One drawer at a time.

## Drawer Patterns

**Open:** Click any table row → `Sheet` slides in from right. Table remains visible behind the overlay.

**Close:** Escape key, click outside the drawer, or close button (`×` top-right). Focus returns to the triggering row.

**Scroll:** Drawer content scrolls independently. Header sticky within the drawer.

**Content order (top to bottom):**
1. Sticky header — company, job title, `ScoreBadge`, `ActionChip`
2. `AssessmentSection` × 4 — `role_fit`, `requirements_met`, `requirements_missed`, `red_flags`
3. `Separator`
4. Job description (collapsible — show first 300 chars, "Show more" toggle)
5. Source URL — external link icon, opens in new tab
6. `Separator`
7. Applied toggle (`Switch` + label + date if applied)
8. Status override (`Select`)
9. `StatusTimeline`

**One drawer at a time** — clicking a different row while drawer is open replaces content without closing/reopening animation.

## Navigation Patterns

**View switching (Pipeline / Tracker)** — two tabs in the header. Active tab: `text-zinc-100` + bottom border. Inactive: `text-zinc-500`. View state is local React state — always opens to Pipeline on load.

**No routing** — view switch is local state, not a URL change. TanStack Router reserved for post-MVP deep-linking.

**Header layout:** App name (left) → View tabs (center) → `SyncButton` + column visibility toggle (right).

## State Transition Rules

**Optimistic updates:** Applied toggle and status override write optimistically via `useMutation`. On error, mutation rolls back and shows inline error in the drawer.

**No confirmation dialogs:** All writes are immediately reversible — toggle back, change the select. No confirmations for a single-user tool.

**Query invalidation:** Only `POST /api/sync` invalidates the full `['jobs']` list. PATCH mutations update `['jobs', id]` optimistically — no full refetch.

---
