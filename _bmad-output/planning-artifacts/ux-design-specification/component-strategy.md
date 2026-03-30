# Component Strategy

## Design System Components (shadcn/ui)

These shadcn primitives are used directly with minimal customization:

| Component | Usage |
|---|---|
| `Sheet` | Detail drawer — `side="right"`, 480px fixed width |
| `Badge` | Base for ScoreBadge and ActionChip (extended with custom variants) |
| `Button` | Sync button, column visibility toggle trigger |
| `Switch` | Applied toggle in drawer |
| `Select` | Status override dropdown in drawer |
| `Separator` | Section dividers in drawer |
| `Tooltip` | Visual aging fallback — "Applied 18 days ago" on row hover |
| `DropdownMenu` | Column visibility toggle menu |
| `Skeleton` | Table loading state during initial data fetch |
| `Alert` | Sync result feedback (success and error banners) |

TanStack Table provides table logic (sorting, column visibility, row selection); shadcn `Table` markup (`<TableHeader>`, `<TableRow>`, `<TableCell>`) provides the DOM structure.

## Custom Components

### `ScoreBadge`

**Purpose:** Display fit score as a color-coded visual indicator — the primary triage signal.

**Anatomy:** Outlined badge — border + text in tier color, transparent background. Number displayed; tier label hidden in tight table rows.

**Variants:**

| Score range | Color tier | Classes |
|---|---|---|
| 75–100 | Emerald (apply) | `border-emerald-600 text-emerald-400` |
| 50–74 | Amber (investigate) | `border-amber-500 text-amber-400` |
| 0–49 | Red (skip) | `border-red-700 text-red-500` |

**States:** Default only — pure display, no interaction.

**Props:** `score: number` — derives color tier internally.

---

### `ActionChip`

**Purpose:** Display the AI-recommended action (skip/investigate/apply) as a compact visual chip.

**Anatomy:** Small rounded badge, subtle background tint, no border.

**Variants:**

| Action | Classes |
|---|---|
| `apply` | `bg-blue-950 text-blue-300` |
| `investigate` | `bg-amber-950 text-amber-300` |
| `skip` | `bg-zinc-800 text-zinc-400` |

**States:** Default only — display component, not interactive.

**Props:** `recommendation: 'apply' | 'investigate' | 'skip'`

---

### `AgingRow`

**Purpose:** Apply time-decay opacity to table rows in Tracker view, communicating staleness without an explicit "ghosted" label.

**Anatomy:** Wrapper around `<TableRow>` that injects computed `opacity` style based on `daysSinceApplication`.

**Opacity tiers:**

| Days since application | Opacity |
|---|---|
| 0–7 | 1.0 |
| 8–14 | 0.75 |
| 15–21 | 0.55 |
| 22+ | 0.35 |

**Props:** `appliedAt: string | null` — computes days diff at render time. If null, renders at full opacity.

---

### `AssessmentSection`

**Purpose:** Render one of the four Claude assessment fields as a labeled prose block in the drawer.

**Anatomy:** Small uppercase label (`text-xs text-zinc-500 uppercase tracking-wide`) above a `<p>` of body text (`text-sm text-zinc-200 leading-relaxed`).

**Props:** `label: string`, `content: string | null` — renders nothing if content is null/empty.

**Usage:** Rendered four times in sequence: `role_fit` → `requirements_met` → `requirements_missed` → `red_flags`.

---

### `SyncButton`

**Purpose:** Trigger Sheets sync with loading state and inline result feedback.

**States:**
- **Idle:** "Sync" label, enabled
- **Loading:** Spinner icon + "Syncing…", disabled
- **Success:** Brief green tint + "15 added, 47 updated" (auto-dismisses after 3s, returns to idle)
- **Error:** Brief red tint + truncated error message (persists until next click)

Wraps `useMutation` from TanStack Query — manages state internally.

---

### `StatusTimeline`

**Purpose:** Show chronological status events for a job record in the drawer.

**Anatomy:** Vertical list of timestamped entries — dot indicator + status label + formatted date. Most recent at top.

**States:** Empty state shows "No status history yet."

**Props:** `events: Array<{ status: string; timestamp: string }>`

---

## Component Implementation Strategy

- All custom components live in `src/client/components/jobs/` (e.g., `ScoreBadge.tsx`, `ActionChip.tsx`)
- Custom components use Tailwind utility classes only — no CSS modules, no inline style objects except computed `opacity` in `AgingRow`
- shadcn components extended via `className` prop only — never modified in `components/ui/`
- No barrel re-exports — components imported directly from their file

## Implementation Roadmap

**Phase 1 — Pipeline view (core triage):**
- `ScoreBadge`, `ActionChip`, `SyncButton`, `Sheet` (drawer shell)

**Phase 2 — Drawer (decision moment):**
- `AssessmentSection` × 4, `Switch` (applied toggle), `Select` (status override), `StatusTimeline`

**Phase 3 — Tracker view:**
- `AgingRow`, `Tooltip` (aging hover fallback)

---
