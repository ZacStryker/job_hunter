# Design Direction Decision

## Design Directions Explored

Six directions were explored, each built on the established visual foundation (zinc-950, Inter, semantic score colors):

- **A — Zinc Command:** Tight `py-1.5` rows, bordered score badges, dense table. The baseline.
- **B — Terminal Flat:** JetBrains Mono, text-only score indicators, monochrome with green-only accent.
- **C — Elevated Card:** Table in a rounded card container with visible border; backdrop-blur sticky header; slightly more structured "app" feel while keeping row density.
- **D — Warm Slate:** Slate-900 base (blue-gray undertones), same bordered badge treatment as A.
- **E — High Signal:** Solid filled score badges (white text on color), uppercase bold action chips. Maximum contrast.
- **F — With Drawer Open:** Direction A table + full drawer layout — Claude assessment, applied toggle, status override.

## Chosen Direction

**Direction C (Elevated Card) with Direction F's drawer.**

Table view: rounded card container, visible card border on zinc-900 background, backdrop-blur sticky header. Rows remain dense (`py-1.5`), score badges use the outlined/bordered style.

Drawer: 480px fixed right panel — score badge, action chip, Claude's assessment section, job description, source URL, applied toggle, status override.

## Claude Assessment Fields

The drawer's AI analysis section renders four long-text fields:

| Field | Description |
|---|---|
| `role_fit` | Claude's overall fit assessment |
| `red_flags` | Concerns, gaps, or risks identified |
| `requirements_met` | Requirements the candidate satisfies |
| `requirements_missed` | Requirements the candidate does not meet |

Each field is a full paragraph string rendered as readable prose. Display order in drawer: `role_fit` → `requirements_met` → `requirements_missed` → `red_flags` — positive signal first, gaps second, concerns last.

## Design Rationale

Direction C adds just enough visual structure to separate the table from the page without sacrificing density. The card border makes the table a contained, scannable object. Backdrop-blur sticky header keeps column labels visible during scroll — matters for 8+ visible columns.

Direction F's drawer was the clear choice: score + verdict at top, structured assessment in the middle, action controls at the bottom. The four named prose fields (`role_fit`, `red_flags`, `requirements_met`, `requirements_missed`) replace the previously unspecified "fit score breakdown + Claude explanation" with an exact rendering contract.

## Implementation Approach

- Card container: `rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden`
- Sticky header: `sticky top-0 backdrop-blur-sm bg-zinc-900/80 border-b border-zinc-800`
- Row padding: `py-1.5 px-3`
- Score badges: outlined — `border border-emerald-600 text-emerald-400 bg-transparent` (color-swapped per score tier)
- Drawer: shadcn `<Sheet side="right">`, 480px fixed width
- Assessment rendering: four labeled prose blocks in order — `role_fit`, `requirements_met`, `requirements_missed`, `red_flags`; plain `<p>` tags, no markdown parsing needed for MVP

---
