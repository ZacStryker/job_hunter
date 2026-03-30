# Visual Design Foundation

## Color System

**Base palette (dark mode — shadcn/ui CSS variables in `globals.css`):**

| Role | CSS Variable | Tailwind Equivalent | Hex |
|---|---|---|---|
| Background | `--background` | `zinc-950` | `#09090b` |
| Surface (cards, drawer) | `--card` | `zinc-900` | `#18181b` |
| Surface elevated | `--popover` | `zinc-800` | `#27272a` |
| Border | `--border` | `zinc-700` | `#3f3f46` |
| Text primary | `--foreground` | `zinc-100` | `#f4f4f5` |
| Text muted | `--muted-foreground` | `zinc-400` | `#a1a1aa` |
| Interactive hover | `--accent` | `zinc-800` | `#27272a` |
| Focus ring | `--ring` | `blue-600` | `#2563eb` |

**Semantic score colors (custom tokens):**

| Token | Condition | Color | Hex |
|---|---|---|---|
| `--score-high` | Fit score ≥80 | `emerald-500` | `#10b981` |
| `--score-mid` | Fit score 60–79 | `amber-400` | `#fbbf24` |
| `--score-low` | Fit score <60 | `red-500` | `#ef4444` |

**Semantic action chip colors:**

| Token | Action | Color | Hex |
|---|---|---|---|
| `--action-apply` | Apply | `blue-500` | `#3b82f6` |
| `--action-investigate` | Investigate | `amber-500` | `#f59e0b` |
| `--action-skip` | Skip | `zinc-500` | `#71717a` (muted) |

**Color rule:** Color appears only where it carries semantic meaning — score badges,
action chips, and interactive focus states. The base UI is neutral zinc throughout.
No decorative color.

## Typography System

**Font family:** Inter (variable font) — standard for data-dense UIs; matches the GitHub/n8n
aesthetic precedent. Loaded as a local variable font to avoid network dependency.

**Fallback stack:** `Inter, system-ui, -apple-system, sans-serif`

**Type scale:**

| Role | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| Drawer title | `text-lg` (18px) | `font-semibold` | `1.4` | Job title in drawer header |
| Section heading | `text-sm` (14px) | `font-medium` | `1.5` | Drawer section labels |
| Table cell | `text-sm` (14px) | `font-normal` | `1.4` | All table data |
| Table header | `text-xs` (12px) | `font-medium uppercase` | `1.5` | Column headers |
| Metadata / muted | `text-xs` (12px) | `font-normal` | `1.4` | Date, source URL, counts |
| Score badge | `text-xs` (12px) | `font-bold` | `1` | Score number in badge |
| Action chip | `text-xs` (12px) | `font-medium` | `1` | skip/investigate/apply |

**Typography rules:**
- No large display text — this is a data tool, not a marketing page
- All table text is `text-sm` or smaller — density is intentional
- Claude's explanation text in drawer: `text-sm` with `leading-relaxed` — the one piece of
  content meant to be read, not scanned

## Spacing & Layout Foundation

**Base unit:** 4px (Tailwind default `space-1`)

**Table density (tight):**
- Row padding: `py-1.5 px-3` (6px vertical, 12px horizontal)
- Column gap: managed by table cell padding
- Header row: `py-2 px-3`

**Drawer layout:**
- Drawer width: `w-[480px]` fixed
- Internal padding: `p-6` (24px)
- Section spacing: `space-y-4` (16px between sections)
- Separator between major sections (score → explanation → actions)

**App shell:**
- Header bar height: `h-14` (56px) — fixed top; contains view tabs + sync button
- Table fills remaining viewport height: `h-[calc(100vh-56px)]` with overflow scroll
- No sidebar — full-width table

**Grid/layout principles:**
- No grid system needed — single-column layout (header + full-width table)
- Drawer is a fixed overlay; does not push table content
- Table columns: fixed widths for badge/chip columns; flexible width for company/title

## Accessibility Considerations

- **Contrast:** All text on dark backgrounds meets WCAG AA minimum (4.5:1 for normal text,
  3:1 for large text) — zinc-100 on zinc-950 = ~16:1 ratio
- **Score badge contrast:** emerald-500/amber-400/red-500 on zinc-900 card surface — verified
  adequate for badge text readability
- **Focus management:** shadcn `Sheet` (Radix UI) handles focus trap on drawer open; Escape
  key closes drawer; focus returns to triggering row on close
- **Keyboard navigation:** Table rows navigable via keyboard (TanStack Table + tabIndex);
  drawer controls (toggle, select) are standard HTML elements with native keyboard support
- **No motion requirement:** Visual aging uses CSS `opacity` only — no animation; respects
  `prefers-reduced-motion` automatically

---
