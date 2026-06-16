---
title: 'Privacy Policy Page + Links'
type: 'feature'
created: '2026-06-16'
status: 'done'
baseline_commit: '3b0ad91'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** HITLOBSTER has a `PRIVACY.md` privacy policy but no in-app page that exposes it. A publicly reachable privacy policy is required (e.g. Google OAuth verification) and users have no link to it from the login, tour, or config screens.

**Approach:** Add a public `/privacy` route rendering the privacy policy as hand-written JSX in the existing dark `zinc` theme (no markdown dependency), with `PRIVACY.md` as the canonical source. Link to it from the login card footer, the tour page footer, and the config Profile section (both the sidebar nav and the Profile cards page).

## Boundaries & Constraints

**Always:** Keep `/privacy` publicly accessible — it must NOT sit under `protectedRoute`. Match the existing visual language (zinc palette, font sizing, spacing) used in `tour.tsx` / `login.tsx`. Privacy content must mirror the current `PRIVACY.md` text faithfully (contact `admin@hitlobster.ai`, gmail.metadata scope language, etc.). Use TanStack Router `<Link>` for internal navigation.

**Ask First:** Changing the privacy policy wording itself, or altering `PRIVACY.md`. Adding any new npm dependency.

**Never:** Do not add a markdown-rendering library. Do not put the privacy page behind auth/onboarding. Do not invent legal clauses not present in `PRIVACY.md`. Do not modify unrelated config sections (Job Sources, Prompts, Logs).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Visit `/privacy` logged out | No session | Privacy page renders fully; no redirect to /login | N/A |
| Visit `/privacy` logged in | Active session | Privacy page renders (public route, unaffected by session) | N/A |
| Click privacy link on login card | On `/login` | Navigates to `/privacy` | N/A |
| Click privacy link in tour footer | On `/tour` | Navigates to `/privacy` | N/A |
| Click privacy link in config Profile (sidebar or card) | On `/config/profile` | Navigates to `/privacy` | N/A |

</frozen-after-approval>

## Code Map

- `src/client/routes/privacy.tsx` -- NEW: public privacy policy page component (`PrivacyRoute`), JSX transcription of `PRIVACY.md`
- `PRIVACY.md` -- canonical source text to transcribe (read-only reference)
- `src/client/lib/router.ts` -- register a new public `privacyRoute` (sibling of `tourRoute`/`loginRoute`, child of `rootRoute`, NOT `protectedRoute`)
- `src/client/routes/login.tsx` -- add privacy `<Link>` in the auth card footer (alongside existing "See how it works →")
- `src/client/routes/tour.tsx` -- add a footer/closing link to `/privacy` after `ClosingCta`
- `src/client/routes/config/layout.tsx` -- add a "Privacy Policy" child link under the Profile sidebar group
- `src/client/routes/config/profile-index.tsx` -- add a Privacy Policy card (or link) to the Profile cards grid

## Tasks & Acceptance

**Execution:**
- [x] `src/client/routes/privacy.tsx` -- Create `PrivacyRoute`: full-page `min-h-screen bg-zinc-950 text-zinc-100` layout with a simple header (HITLOBSTER wordmark + "Back" `<Link to="/login">`), a centered `max-w-3xl` content column transcribing all 10 sections of `PRIVACY.md` with headings/paragraphs/lists/links styled in the zinc theme -- gives a public, themed privacy page
- [x] `src/client/lib/router.ts` -- Import `PrivacyRoute`, declare `privacyRoute` (path `/privacy`, parent `rootRoute`, no `beforeLoad`), and add it to the top-level `rootRoute.addChildren([...])` list next to `tourRoute` -- makes `/privacy` reachable without auth
- [x] `src/client/routes/login.tsx` -- Add `<Link to="/privacy">Privacy Policy</Link>` styled like the existing footer links, below "See how it works →" -- exposes policy from login
- [x] `src/client/routes/tour.tsx` -- Add a footer element (or extend `ClosingCta`) containing a `/privacy` link in muted zinc styling at the bottom of the tour page -- exposes policy from the marketing/tour page
- [x] `src/client/routes/config/layout.tsx` -- Add a `Privacy Policy` child `<Link to="/privacy">` under the Profile sidebar group using the existing `childLinkClass`/`childActiveProps`/`childInactiveProps` pattern -- exposes policy in config sidebar Profile section
- [x] `src/client/routes/config/profile-index.tsx` -- Add a Privacy Policy entry to the Profile cards grid (a `<Link to="/privacy">` card matching the existing card styling; no "Configured" badge needed) -- exposes policy in config Profile cards

**Acceptance Criteria:**
- Given a logged-out visitor, when they navigate to `/privacy`, then the full privacy policy renders without redirecting to `/login`.
- Given the login screen, when the user clicks the Privacy Policy link, then they land on `/privacy`.
- Given the tour page, when the user scrolls to the footer and clicks the privacy link, then they land on `/privacy`.
- Given the config Profile screen, when the user clicks the Privacy Policy entry in either the sidebar or the cards grid, then they land on `/privacy`.
- Given the rendered page, then its content matches `PRIVACY.md` (sections 1–10, `admin@hitlobster.ai` contact, gmail.metadata scope wording).

## Design Notes

The app hand-writes all page content (see `tour.tsx`), so transcribe `PRIVACY.md` to JSX rather than adding a renderer. Keep `PRIVACY.md` as the source of truth — note in the route file a brief comment that edits should track `PRIVACY.md`. Footer/sidebar/card links should reuse existing class strings verbatim (e.g. login footer link: `text-sm text-zinc-500 hover:text-zinc-300 mt-2 block text-center`; config child link: `childLinkClass`) so styling stays consistent.

## Verification

**Commands:**
- `bun run build` -- expected: Vite build succeeds with no TypeScript/route errors

**Manual checks:**
- Run `bun run dev`, open `/privacy` while logged out → page renders, no redirect.
- From `/login`, `/tour`, and `/config/profile` (sidebar + card), each privacy link navigates to `/privacy`.

## Suggested Review Order

**Routing (public access)**

- Entry point — `/privacy` registered as a public child of `rootRoute`, not behind `protectedRoute`.
  [`router.ts:112`](../../job-hunt-dashboard/src/client/lib/router.ts#L112)

- Mounted into the top-level route tree beside `tourRoute` (the auth gate is below this line).
  [`router.ts:333`](../../job-hunt-dashboard/src/client/lib/router.ts#L333)

**Privacy page**

- The page component; transcribes PRIVACY.md to themed JSX. Back links target `/` so they resolve per auth state.
  [`privacy.tsx:16`](../../job-hunt-dashboard/src/client/routes/privacy.tsx#L16)

- Known carry-over: `[YOUR-DOMAIN]` placeholder mirrors PRIVACY.md (see deferred-work.md).
  [`privacy.tsx:48`](../../job-hunt-dashboard/src/client/routes/privacy.tsx#L48)

**Link surfaces**

- Config Profile sidebar link, reusing the shared child-link styling.
  [`layout.tsx:31`](../../job-hunt-dashboard/src/client/routes/config/layout.tsx#L31)

- Config Profile card, matching sibling cards (no status badge).
  [`profile-index.tsx:101`](../../job-hunt-dashboard/src/client/routes/config/profile-index.tsx#L101)

- Login card footer link.
  [`login.tsx:85`](../../job-hunt-dashboard/src/client/routes/login.tsx#L85)

- Tour page footer link.
  [`tour.tsx:169`](../../job-hunt-dashboard/src/client/routes/tour.tsx#L169)
