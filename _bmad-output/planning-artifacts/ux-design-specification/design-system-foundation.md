# Design System Foundation

## Design System Choice

**shadcn/ui + Tailwind CSS** — selected in architecture, confirmed here.

shadcn/ui is a copy-paste component library built on Radix UI primitives with Tailwind CSS.
Components live in the codebase (`src/client/components/ui/`), not in a node_modules package —
giving full ownership and zero upstream breakage risk.

## Rationale for Selection

- **Component ownership** — components are part of the codebase; customizable without fighting
  library APIs
- **Radix UI accessibility** — keyboard navigation, focus traps, ARIA attributes handled correctly
  out of the box (critical for Sheet/drawer pattern)
- **Tailwind CSS variable theming** — dark mode, semantic color tokens, and density all controlled
  through CSS custom properties
- **shadcn Sheet component** — the right-side slide panel pattern (identified from n8n inspiration)
  is a first-class primitive in shadcn, not a workaround
- **Single-user personal tool** — no need for enterprise design system overhead; shadcn's lean
  approach is a strength here

## Implementation Approach

```bash
bunx shadcn@latest init   # sets up components.json, globals.css, tailwind config
bunx shadcn@latest add sheet badge button select toast separator
```

Components added to `src/client/components/ui/` and owned by the project from that point forward.

## Customization Strategy

**Theme: Dark mode base**
The tool is used daily for focused work sessions. Dark base palette reduces eye strain, and
semantic badge colors (green/yellow/red) pop with stronger contrast against dark backgrounds.
Aligns with n8n aesthetic precedent.

**Semantic Color Tokens (defined in `globals.css`):**

| Token | Usage | Tailwind Color |
|---|---|---|
| `--score-high` | Fit score ≥80 badge | `emerald-500` |
| `--score-mid` | Fit score 60–79 badge | `amber-400` |
| `--score-low` | Fit score <60 badge | `red-500` |
| `--action-apply` | Apply chip accent | `blue-500` |
| `--action-investigate` | Investigate chip | `amber-500` |
| `--action-skip` | Skip chip | `zinc-500` (muted) |

**Density Configuration:**
- Table row padding: `py-1.5 px-3` (tighter than shadcn defaults)
- Table cell font: `text-sm` across all columns
- Drawer width: `480px` fixed — wide enough for fit breakdown, doesn't dominate screen

**shadcn Components Used:**

| Component | Usage |
|---|---|
| `Sheet` | JobDrawer — right-side slide panel |
| `Badge` | FitScoreBadge, ActionChip |
| `Button` | SyncButton, AppliedToggle |
| `Select` | StatusOverride dropdown |
| `Toast` | Job update feedback (transient) |
| `Separator` | Drawer section dividers |
