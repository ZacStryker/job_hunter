---
title: 'Spinning ring around active activity-bar pulse glyph'
type: 'feature'
created: '2026-06-26'
status: 'done'
route: 'one-shot'
---

# Spinning ring around active activity-bar pulse glyph

## Intent

**Problem:** While a workflow is running, the activity-bar glyph only pulses — a subtle signal that's easy to miss and reads as ambient rather than "work in progress."

**Approach:** Wrap the `Activity` icon in a relative container and overlay an absolutely-positioned, `animate-spin` circular border (faint zinc-700 track + bright zinc-200 top segment) that renders only while `isActive`, keeping the existing pulse beneath it.

## Suggested Review Order

1. [`ActivityIndicator.tsx` — the spinning ring overlay + a11y attrs](../../job-hunt-dashboard/src/client/components/shared/ActivityIndicator.tsx) — the only behavioral change: ring markup gated on `isActive`, `pointer-events-none` + `motion-reduce:animate-none` on the ring, `aria-busy={isActive}` on the trigger button.
