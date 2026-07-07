---
title: 'Top-bar visual polish'
type: 'chore'
created: '2026-07-07'
status: 'done'
route: 'one-shot'
---

# Top-bar visual polish

## Intent

**Problem:** The app header had rough edges: no logo, a redundant "Config" tab (Config is reachable from the user menu), an Activity spinner whose ring stayed dim while its glyph brightened, a notifications ready-state with no empty-state label, and an account-avatar button that read as crowded/heavier than its neighboring icon buttons.

**Approach:** Add a square logo grouped tightly with the wordmark at far left; remove the Config top-nav link; brighten the Activity spinner ring (`border-zinc-700` → `border-zinc-500`) so the circle lights up with the glyph; add a muted "No notifications" line above the Start hunting button; and give all three right-side trigger buttons (Activity, Notifications, Account) uniform `h-9 w-9` centered hit-areas inside a tight cluster so they read as evenly spaced.

## Suggested Review Order

1. [`job-hunt-dashboard/src/client/components/shared/Layout.tsx`](../../job-hunt-dashboard/src/client/components/shared/Layout.tsx) — logo+wordmark group, Config link removed, right-side controls wrapped in a cluster (the structural changes).
2. [`job-hunt-dashboard/src/client/components/shared/UserMenu.tsx`](../../job-hunt-dashboard/src/client/components/shared/UserMenu.tsx) — account trigger uniform hit-area (the reported cohesion fix).
3. [`job-hunt-dashboard/src/client/components/shared/ActivityIndicator.tsx`](../../job-hunt-dashboard/src/client/components/shared/ActivityIndicator.tsx) — ring brightening + matching trigger hit-area.
4. [`job-hunt-dashboard/src/client/components/shared/NotificationsDropdown.tsx`](../../job-hunt-dashboard/src/client/components/shared/NotificationsDropdown.tsx) — "No notifications" label + matching trigger hit-area.
