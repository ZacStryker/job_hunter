---
title: 'Add logout button to top-right of header'
type: 'feature'
created: '2026-06-13'
status: 'done'
context: []
baseline_commit: '3059ec7a4b1033f6bc983195fee49c0a5e8bb959'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no way to log out from the app UI. The server already exposes `POST /auth/logout` (clears the session row + cookies, returns 204) but nothing in the client calls it.

**Approach:** Add an icon-only logout button at the far right of the header (after the centered nav) using lucide's `LogOut` icon. Clicking it calls the existing logout endpoint, clears the TanStack Query cache, and navigates to `/login`.

## Boundaries & Constraints

**Always:** Mirror the existing auth client pattern in `login.tsx` — plain `fetch('/auth/logout', { method: 'POST' })` (the `/auth/*` routes are exempt from `authMiddleware`/CSRF; no `x-csrf-token` needed). After logout, clear all cached user data via `queryClient.clear()` then `navigate({ to: '/login' })`. Button must be accessible (`aria-label`/`title` "Log out"). Keep it visually consistent with the dark header (zinc palette, subtle hover).

**Ask First:** Adding a confirmation dialog before logout, or relocating/restyling existing header elements beyond inserting the button.

**Never:** Touch the server logout route or any other auth endpoint. Add a new logout hook/abstraction or a new dependency. Route logout through `apiFetch`/`/api/*`. Change the centered nav tabs or app-name label.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Click logout | Authenticated session | POST returns 204; query cache cleared; redirected to `/login` | N/A |
| Logout request fails | Network/server error | Cache still cleared and user still sent to `/login` (fail-safe sign-out) | swallow error, no crash |
| In-flight click | Button clicked twice fast | No crash; ends on `/login` | idempotent |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/client/components/shared/Layout.tsx` -- header lives here; insert logout button as the last child of `<header>`, after the centered `<nav>` (which ends ~line 87). Only file changed.
- `job-hunt-dashboard/src/client/routes/login.tsx` -- reference for the plain-fetch auth pattern.
- `job-hunt-dashboard/src/client/lib/query-client.ts` -- `queryClient` singleton to clear on logout.

## Tasks & Acceptance

**Execution:**
- [x] `job-hunt-dashboard/src/client/components/shared/Layout.tsx` -- add `useNavigate` (from `@tanstack/react-router`), import `queryClient` (`@/lib/query-client`) and `LogOut` (`lucide-react`); add an async `handleLogout` (POST `/auth/logout` in try/catch, then `queryClient.clear()`, then `navigate({ to: '/login' })`); render an icon-only `<button>` as the last child of `<header>` (after the `<nav>`) with `aria-label`/`title` "Log out", zinc hover styling, and `shrink-0`. -- gives users a working sign-out in the top-right.

**Acceptance Criteria:**
- Given an authenticated user on any page, when they click the top-right logout button, then they are redirected to `/login` and the session is ended (cookie cleared, cache empty).
- Given the logout request fails, when the user clicks logout, then they are still navigated to `/login` and the app does not crash.
- Given the header renders, then the logout button is the rightmost element with a visible logout icon and an accessible label.

## Design Notes

Insert order inside `<header>`: `HITLOBSTER` span → centered `<nav>` (`flex-1 justify-center`) → `[logout button]`. Placing the button after the `flex-1` nav anchors it to the far right. Example skeleton:

```tsx
const navigate = useNavigate()
async function handleLogout() {
  try { await fetch('/auth/logout', { method: 'POST' }) } catch { /* sign out anyway */ }
  queryClient.clear()
  await navigate({ to: '/login' })
}
// <button onClick={handleLogout} aria-label="Log out" title="Log out"
//   className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"><LogOut className="h-5 w-5" /></button>
```

## Verification

**Commands:**
- `cd job-hunt-dashboard && bunx tsc --noEmit 2>&1 | grep Layout` -- expected: no Layout.tsx errors
- `cd job-hunt-dashboard && bun run build` -- expected: build succeeds

**Manual checks:**
- `bun run dev`, sign in, confirm a logout icon sits at the top-right; click it → land on `/login`; pressing back / hitting a protected route does not show stale data.

## Suggested Review Order

- The action: fail-safe sign-out — POST logout (errors swallowed), clear cache, redirect to `/login`.
  [`Layout.tsx:14`](../../job-hunt-dashboard/src/client/components/shared/Layout.tsx#L14)

- The button: icon-only `LogOut`, placed after the `flex-1` nav so it anchors top-right, with accessible label.
  [`Layout.tsx:103`](../../job-hunt-dashboard/src/client/components/shared/Layout.tsx#L103)
