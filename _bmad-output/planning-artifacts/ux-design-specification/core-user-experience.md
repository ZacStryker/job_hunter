# Core User Experience

## Defining Experience

The core loop is: **scan → evaluate → decide**. The user opens the dashboard, scans the pipeline
table for high-signal rows (fit score color, action chip), clicks a row to open the detail drawer,
reads the AI analysis, and makes a triage decision. Everything in the product exists to make this
loop faster and less cognitively taxing.

The core action that must be perfected: **opening a job record and making a decision in under
10 seconds.**

## Platform Strategy

- **Platform:** Desktop web application, localhost only
- **Browser:** Firefox latest — no cross-browser adaptation needed
- **Input:** Mouse + keyboard; touch not considered
- **Layout:** Dense table-first UI; responsive adaptation not required
- **Display:** Single-monitor desktop; assume adequate horizontal space for full table columns

## Effortless Interactions

These interactions must require zero cognitive overhead:

1. **Row → drawer** — single click anywhere on a row opens the detail drawer instantly; no loading
   state (data already in cache); no modal confirmation
2. **Applied toggle** — one click; immediate visual confirmation on the toggle itself; drawer
   remains open so the user retains context
3. **Sync** — one button; spinner during operation; clear success/failure message; no anxiety
   about data integrity
4. **Column visibility toggle** — show/hide optional columns without losing current scroll position
   or table state; preference persists automatically

## Critical Success Moments

1. **Table first load** — Within 1–2 seconds of opening the app, the pipeline table is populated
   with color-coded fit score badges. The user immediately knows which rows to look at without
   reading a single label. This is the product's first impression.

2. **Drawer first open** — The user clicks a row and sees: fit score → requirements met/missed →
   Claude's explanation → apply button. All in one visual pass, no scrolling. This is where the
   product earns its keep daily.

3. **Post-sync integrity confirmation** — After hitting Sync, the user spot-checks a job they
   already marked as applied. It's still applied. The sync result says "0 records corrupted."
   Trust is established. The product becomes the reliable daily tool it's meant to be.

## Experience Principles

1. **Signal before text** — Color, shape, and visual weight communicate intent before any label
   is parsed. The fit score column is a heat map; the action chip is a voice; row opacity is a
   timeline. Visual encoding is the first language.

2. **Every decision is one action** — `apply`, `skip`, `status override` — all reachable in a
   single click from wherever the user is in the interface. No confirmation dialogs for routine
   decisions.

3. **Data integrity as felt trust** — Sync is safe by design, and the user must *feel* that
   safety. Idempotent behavior, atomic writes, and clear feedback after every sync operation
   build the trust that makes this the user's primary tool.

4. **Ambient communication, not labels** — Visual aging replaces "ghosted." Color-coded scores
   replace threshold explanations. The interface communicates through design, not through
   additional text fields.
