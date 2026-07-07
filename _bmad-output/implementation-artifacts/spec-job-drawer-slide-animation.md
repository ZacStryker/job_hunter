---
title: 'Job drawer slide-in/out animation'
type: 'bugfix'
created: '2026-07-07'
status: 'done'
context: ['{project-root}/_bmad-output/project-context.md']
baseline_commit: '43b333254e58d6a4afdf0f60d7e2da43da62bd67'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `JobDrawer` pops in and out with no transition. Its underlying shadcn `Sheet` (`sheet.tsx`) and the drawer's custom backdrop already carry the correct classes (`animate-in`/`animate-out`, `slide-in-from-right`, `slide-out-to-right`, `fade-in-0`), but those utilities are supplied by the `tailwindcss-animate` layer, which is absent on this Tailwind v4 project — so every such class is dead across the whole app.

**Approach:** Install `tw-animate-css` (the Tailwind v4 successor to `tailwindcss-animate`) and import it once in `src/client/index.css`. This activates the already-written slide/fade classes: the job drawer slides in from the right on open and slides out on close, and the same enter/exit motion becomes live for other shadcn components (dialogs, selects, dropdowns, tooltips, the other drawers) as their authors intended. No generated `ui/` component is edited.

## Boundaries & Constraints

**Always:** Add the animation engine via a single `@import` in `index.css`, immediately after `@import "tailwindcss";`. Keep the existing hand-rolled `@keyframes accordion-*` / `@theme` block intact. Preserve dark-only theming. The job drawer must slide (translateX) from the right edge on open and back out on close.

**Ask First:** Switching approach away from `tw-animate-css` (e.g. hand-rolling every composable `animate-in`/`slide-in-from-*` utility, or adopting a motion library like framer-motion).

**Never:** Do not hand-edit any file in `src/client/components/ui/` (generated shadcn components) — including `sheet.tsx`. Do not change the drawer's `modal={false}` behavior or its two-route architecture. Do not add feature flags or per-component animation toggles. Do not touch backend, DB, or schemas.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open drawer | User clicks a job row (`open` → true) | Panel slides in from right edge; custom backdrop fades in | N/A |
| Close drawer | User clicks backdrop / close / Esc (`open` → false) | Panel slides out to the right before unmounting (Radix Presence) | N/A |
| Reduced motion | OS `prefers-reduced-motion: reduce` | tw-animate-css suppresses/reduces the transition; drawer still opens and closes | N/A |
| Other overlays | Any dialog/select/dropdown/tooltip opens | Gets its intended enter/exit motion (previously static) | N/A |

</frozen-after-approval>

## Code Map

- `src/client/index.css` -- global stylesheet; `@import "tailwindcss"` + hand-rolled accordion keyframes. The single edit site: add the animate import here.
- `package.json` -- add `tw-animate-css` to dependencies.
- `src/client/components/ui/sheet.tsx` -- generated shadcn Sheet; already has correct slide classes. READ-ONLY (do not edit) — proof the fix is CSS-only.
- `src/client/components/detail/JobDrawer.tsx` -- consumer; custom backdrop uses `animate-in fade-in-0` (becomes live). READ-ONLY reference — no change expected.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- run `bun add tw-animate-css` to add the dependency (do not hand-edit the version; let Bun resolve). — added `tw-animate-css@1.4.0`.
- [x] `src/client/index.css` -- add `@import "tw-animate-css";` on the line immediately after `@import "tailwindcss";` -- activates the slide/fade utilities the shadcn components already reference.

**Acceptance Criteria:**
- Given the app is running, when the user opens a job, then the drawer panel visibly slides in from the right edge (not an instant pop).
- Given the drawer is open, when the user closes it, then the panel slides out to the right over its transition before disappearing.
- Given the change, when `bun run build` runs, then it completes without TypeScript or Vite errors.
- Given no `ui/` component or `JobDrawer.tsx` is edited, when reviewing the diff, then only `package.json`, the lockfile, and `index.css` change.

## Design Notes

`tw-animate-css` is a drop-in reimplementation of `tailwindcss-animate` for Tailwind v4's CSS-first setup; it exposes exactly the composable utilities (`animate-in`, `fade-in-0`, `slide-in-from-right`, `duration-*`, etc.) that shadcn's generated `sheet.tsx` was authored against. Importing it is the standard shadcn-on-v4 wiring that this project skipped.

The panel's exit slide is driven by Radix Dialog's built-in Presence (it delays unmount until the `data-[state=closed]` animation finishes), so no JS change is needed. Known minor asymmetry (acceptable, out of scope to fix): the drawer's custom backdrop is conditionally mounted on `open` and only has an enter fade, so on close it disappears instantly while the panel slides out — this pre-exists and is not part of this change.

## Verification

**Commands:**
- `bun add tw-animate-css` -- expected: dependency added, lockfile updated, no resolution error.
- `bun run build` -- expected: clean Vite production build, no TS/bundler errors.

**Manual checks:**
- `bun run dev`, open a job in the pipeline: panel slides in from the right, backdrop fades. Close it: panel slides out to the right. Spot-check that a Select/dropdown now animates too (confirms global activation).

## Suggested Review Order

- The whole fix: one import activates every dead animate/slide/fade class app-wide.
  [`index.css:2`](../../job-hunt-dashboard/src/client/index.css#L2)

- Dependency added by Bun — pinned `tw-animate-css@^1.4.0`.
  [`package.json:47`](../../job-hunt-dashboard/package.json#L47)

- Proof of no `ui/` edit: the slide classes it already shipped now light up.
  [`sheet.tsx:32`](../../job-hunt-dashboard/src/client/components/ui/sheet.tsx#L32)
