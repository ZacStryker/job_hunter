# Story 45.4: Connect Gmail UI — Config & Onboarding Surfaces

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a job seeker,
I want a clear "Connect Gmail" option in onboarding and in Config alongside the IMAP form, with my mappings managed by picking from my real labels,
so that I can set up and manage Gmail syncing visually without leaving the app.

## Acceptance Criteria

1. **Connect-Gmail button on Config (additive, not replacing IMAP):** Given the Config > Profile > Inbox Mapping page (`/config/profile/inbox-mapping`), when it renders, then a Google-branded "Connect Gmail" button appears **alongside — not replacing** — the existing IMAP connection form and folder-mapping table.
2. **Start OAuth on click:** Given the user has not connected Gmail, when they click "Connect Gmail", then the OAuth flow starts: the client calls `GET /api/onboarding/gmail/connect?return=config`, receives `{ url }`, and navigates the browser to that Google consent URL (`window.location.href = url`).
3. **Connected badge + address + Disconnect:** Given the user has connected Gmail, when the page renders, then a green "Connected" badge shows the linked Gmail **address** with a "Disconnect" action — mirroring the IMAP `Connected` / `Not connected` badge pattern. Clicking Disconnect calls `DELETE /api/onboarding/gmail` and returns the surface to the not-connected state.
4. **No dead-end callback — return to originating surface with success toast:** Given the user returns from Google's consent screen, when the callback completes, then they land back on the originating surface (Config inbox-mapping page or onboarding) with a success toast and the Connected state shown. There is no dead-end callback page. The surface reads the `?gmail=connected` / `?gmail=error` query param the server redirect appended, shows the matching toast, then clears the param from the URL.
5. **Label-dropdown mapping table:** Given a Gmail-connected user, when they manage label mappings, then a mapping table (Add / Edit / Delete rows) is shown where the **label** is chosen from a dropdown populated by `GET /api/onboarding/gmail/labels` and the **status** from `MESSAGE_TYPES` — mirroring the IMAP folder-mapping table. The dropdown shows and submits the label **name** (per the 45.3 name→id contract). Saving a row PUTs the full set to `PUT /api/config/gmail-mappings`.
6. **Onboarding email step is an either/or, still skippable:** Given the onboarding email step (step 2), when it renders, then it presents an either/or choice between "Connect Gmail" (OAuth, `return=onboarding`) and "Use IMAP" (the existing manual-credentials form), and the step remains skippable / soft-gated exactly as it is today (the "Skip for now" / "Continue" buttons still work, and Anthropic-key step gating is unchanged).
7. **Gmail and IMAP coexist per user:** Given a user who has Gmail connected, when they view the IMAP form, then the IMAP form still functions and connecting Gmail does not remove IMAP configuration (and vice versa) — the two coexist per user; no UI action clears the other provider.
8. **Connected UI driven by `hasGmail` from `/status`:** Given the connected UI in both surfaces, when it decides what to show (Connect button vs. Connected badge + mapping table), then it is driven by `hasGmail` from `GET /api/onboarding/status`. To show the address in the badge (AC 3), `/status` is extended to also return `gmailAddress` (decrypted from the stored `gmail_address` secret, or `null` when not connected).

## Tasks / Subtasks

- [x] **Task 1 — Surface `hasGmail` + `gmailAddress` on the status endpoint and type** `src/server/routes/api-onboarding.ts`, `src/shared/schemas.ts` (AC: 3, 8)
  - [x] In `src/shared/schemas.ts`, extend the `OnboardingStatusResponse` type (currently lines ~344-350) to add `hasGmail: boolean` and `gmailAddress: string | null`. The server already returns `hasGmail`; the type is **stale** and omits it — add both fields so the client is typed.
  - [x] In `api-onboarding.ts` `GET /status` (lines 13-27): the handler already computes `hasGmail`. Additionally read the `gmail_address` secret and decrypt it: select `keyName` **and** `ciphertext` (or do a targeted `.get()` for `keyName === 'gmail_address'`), and set `gmailAddress = row ? decrypt(row.ciphertext) : null`. Wrap the decrypt in try/catch → on failure return `gmailAddress: null` (never throw from `/status`). `decrypt` is already imported in this file. Add `gmailAddress` to the returned JSON. Do NOT log the address as a token — it is a plain email, but keep logging out of the happy path entirely.
  - [x] Per project rule, `null` (never `undefined`) for the not-connected case.
  - [x] **Test** `src/server/routes/api-onboarding.test.ts`: add cases — (a) connected user (seed `gmail_refresh_token` + `gmail_address` secrets via real `encrypt(...)`) → `GET /status` returns `hasGmail: true` and `gmailAddress` equal to the decrypted address; (b) not-connected user → `hasGmail: false`, `gmailAddress: null`. Assert HTTP 200 and exact shape. Follow the file's existing in-memory-DB + raw-SQL DDL + `c.set('userId', …)` harness pattern.

- [x] **Task 2 — Client data hooks for Gmail (labels, mappings, connect/disconnect)** `src/client/hooks/` (AC: 2, 3, 5)
  - [x] `useGmailLabelsQuery.ts` — `useQuery({ queryKey: ['gmail-labels'], queryFn, enabled })`. `queryFn` GETs `/api/onboarding/gmail/labels` via `apiFetch`; on `!res.ok` throw `Error` (the page swallows it into an empty dropdown + inline hint). Returns `Array<{ id: string; name: string }>`. Pass `enabled: hasGmail` from the caller so it is not fetched when disconnected (avoids the 503). Do NOT mark labels stale-forever; default caching is fine.
  - [x] `useGmailMappingsQuery.ts` — mirror `useInboxMappingsQuery.ts`: `useQuery({ queryKey: ['gmail-mappings'], queryFn })` GET `/api/config/gmail-mappings` → `GmailLabelMapping[]` (import the type from `@shared/schemas`). Export a `fetchGmailMappings` fn (for the route loader, mirroring `fetchInboxMappings`).
  - [x] `useGmailMappingsMutation.ts` — mirror `useInboxMappingsMutation.ts`: `useMutation` PUT `/api/config/gmail-mappings` with `GmailLabelMappingInput` (`{ label, jobStatus }[]`); `onSuccess` invalidate `['gmail-mappings']`; `onError` `toast.error(err.message)`. The server's 400 message includes `'Duplicate label'` — surface it verbatim.
  - [x] **Connect/disconnect** can live as small inline helpers in the components (mirroring how `handleSaveImap` lives inline) OR a tiny `useGmailConnection.ts` — your call, but keep it minimal:
    - **Connect:** `const res = await apiFetch('/api/onboarding/gmail/connect?return=config')` (or `?return=onboarding`); `if (res.ok) { const { url } = await res.json(); window.location.href = url } else { toast.error((await res.json()).error) }`. A 503 here means Gmail isn't configured by the operator — show the returned error.
    - **Disconnect:** `await apiFetch('/api/onboarding/gmail', { method: 'DELETE' })`; then `queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })` and `['gmail-mappings']`; `toast.success('Gmail disconnected')`.

- [x] **Task 3 — Config inbox-mapping page: add Gmail section** `src/client/routes/config/profile-inbox-mapping.tsx` (AC: 1, 2, 3, 4, 5, 7)
  - [x] Add a new `<section>` to this page (keep the existing IMAP Connection section and Folder Mappings table fully intact — AC 1/7). Place the Gmail section so both providers are clearly visible (e.g. a "Gmail" section above or below "IMAP Connection").
  - [x] **Header + badge** mirror the IMAP pattern (lines 118-125): a `Connected` (emerald) badge when `status?.hasGmail`, else `Not connected` (zinc). When connected, render `status?.gmailAddress` next to/inside the badge.
  - [x] **Not connected:** render a Google-branded "Connect Gmail" button (white/light surface, Google "G" mark, "Sign in with Google"-style; see Dev Notes "Google branding"). On click → connect helper with `return=config`.
  - [x] **Connected:** show the connected address + a "Disconnect" button (`variant="outline"` or ghost, destructive affordance) → disconnect helper. After disconnect, status refetch flips back to not-connected and the mapping table hides.
  - [x] **Label mapping table:** when `status?.hasGmail`, render a table that mirrors the existing Folder Mappings table (lines 163-241) — Add / Edit / Delete rows, status `<select>` over `MESSAGE_TYPES` — BUT the first column is a **label dropdown** instead of a free-text input. Populate the dropdown `<option>`s from `useGmailLabelsQuery({ enabled: hasGmail })` (value = label **name**). If the labels query errors (revoked token → 502, or not connected → 503), show an inline hint ("Couldn't load Gmail labels — try reconnecting") and leave the dropdown empty; do not crash the page. Save via `useGmailMappingsMutation` (full-set PUT, same `saveAll` pattern as IMAP).
  - [x] Reuse the IMAP table's editing-state machine (`rows` / `editingIndex` / `draft` / `handleAddRow` / `handleSaveRow` / `handleDelete` / `handleEdit` / `handleCancel`) — copy its shape with `label` in place of `folderPath`. Sync `rows` from the `gmail-mappings` query the same way the IMAP table syncs from `mappings` (the `useEffect` guarded by `editingIndex === null`).
  - [x] **Callback toast (AC 4):** on mount, read `new URLSearchParams(window.location.search).get('gmail')`. If `'connected'` → `toast.success('Gmail connected')` and `queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })`; if `'error'` → `toast.error('Could not connect Gmail — please try again')`. Then strip the param: `window.history.replaceState({}, '', window.location.pathname)` so a refresh doesn't re-toast. Do this once (guard with a `useRef` or run-once `useEffect` with empty deps).
  - [x] Update the route loader for `/config/profile/inbox-mapping` in `src/client/lib/router.ts` (lines 223-229) to also `ensureQueryData` for `['gmail-mappings']` (so the table opens with data, parity with `['inbox-mappings']`). Labels are loaded lazily by the component (`enabled`), not in the loader (they hit the network/Google and may 502).

- [x] **Task 4 — Onboarding email step: either/or Gmail vs IMAP + OAuth-return handling** `src/client/routes/onboarding.tsx`, `src/client/lib/router.ts` (AC: 4, 6, 7)
  - [x] In step 2 ("Email Setup", lines 149-198): add the either/or. Keep the existing IMAP form as the "Use IMAP" path. Add a Google-branded "Connect Gmail" button (connect helper with `return=onboarding`). Make the two options visually distinct (e.g. "Connect Gmail" first, then a divider/"or", then the existing IMAP form). The step stays skippable: the existing `Back` / `Skip for now` / `Continue` buttons are unchanged (AC 6).
  - [x] Show the Gmail Connected state in-step when `hasGmail` (use `useOnboardingStatusQuery()` — already a query; the onboarding route currently doesn't call the hook, add it). When connected, show the connected address + a note, and let the user `Continue`.
  - [x] **CRITICAL — OAuth return to onboarding:** the Gmail consent flow does a **full browser redirect** away and back to `/onboarding?gmail=connected`. The onboarding route **loader** (`router.ts:110-125`) throws `redirect({ to: '/' })` when `onboardingComplete` is true — and `onboardingComplete === hasAnthropicKey`, which is **already true** by the time the user reaches step 2 (testing the Anthropic key in step 1 PERSISTS it). So without a guard, the returning OAuth user is bounced to the dashboard and never sees the success state. **Fix:** in the onboarding loader, skip the `redirect({ to: '/' })` when the return URL carries a Gmail callback param — e.g. `if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('gmail')) { /* allow render */ } else if (status.onboardingComplete) throw redirect({ to: '/' })`. Keep the existing redirect for the normal completed-onboarding case.
  - [x] **On return:** in `OnboardingRoute`, on mount read `?gmail=`; if present, jump to `setStep(2)` and show the toast (`connected` → success, `error` → error), then strip the param via `window.history.replaceState`. The user resumes onboarding at the email step with Gmail shown as Connected. (The component already manages `step` via `useState`; initialize from the param.)
  - [x] Do not alter the Anthropic step (step 1) gating or the `StepIndicator` total (still 4). IMAP coexistence: connecting Gmail must not clear IMAP and vice versa (AC 7) — neither button touches the other provider's secrets.

- [x] **Task 5 — Verify, typecheck, test**
  - [x] `bunx tsc --noEmit` clean for all touched production files (the new `OnboardingStatusResponse` fields must typecheck across both surfaces).
  - [x] `bun test src/server/routes/api-onboarding.test.ts` passes (new `gmailAddress` cases + existing).
  - [x] Manual/visual check via `bun run dev`: (1) Config page shows Connect Gmail alongside IMAP; (2) connected badge shows address + Disconnect; (3) label dropdown populates from real labels; (4) onboarding step 2 shows the either/or and survives the OAuth round-trip without bouncing to `/`. (Full Gmail OAuth needs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set — if absent, Connect shows the 503 "not configured" toast, which is itself a valid state to confirm.)
  - [x] Full `bun test` carries documented pre-existing unrelated failures (≈43, incl. obsolete LinkedIn + api-ingest archived-field) — do not treat as regressions and do not add to them.

## Dev Notes

### This is the UI-only story for Epic 45 — the server is already built
Stories 45.1–45.3 shipped the entire server side. **Everything you call already exists** (verified):
- `GET /api/onboarding/gmail/connect?return=config|onboarding` → `{ url }` (JSON, not a redirect). 503 `{ error }` if `GOOGLE_CLIENT_*` unset. [api-onboarding.ts:181-194]
- `GET /api/onboarding/gmail/callback` → server-side; redirects the browser to `/config/profile/inbox-mapping?gmail=connected|error` or `/onboarding?gmail=connected|error`. **You do not build a callback page** — you read the `?gmail=` param on the surface it lands on. [api-onboarding.ts:196-246]
- `GET /api/onboarding/gmail/labels` → `Array<{ id, name }>`; 503 if not connected, 502 if token revoked/expired. [api-onboarding.ts:248-271]
- `DELETE /api/onboarding/gmail` → revokes + clears `gmail_refresh_token`, `gmail_address`, and all `gmail_label_mappings`. Returns `{ ok: true }`. [api-onboarding.ts:273-295]
- `GET/PUT /api/config/gmail-mappings` → list / replace-all. PUT body `{ label, jobStatus }[]`, `jobStatus ∈ MESSAGE_TYPES`, duplicate-label → 400 `{ error: 'Duplicate label' }`. [api-config-gmail-mappings.ts]
- `GET /api/onboarding/status` → returns `hasGmail` (already). **Does NOT yet return `gmailAddress`** — Task 1 adds it (the only server change in this story, and it's a 3-line read+decrypt). [api-onboarding.ts:13-27]

### The two non-obvious gaps you MUST close (don't skip these)
1. **`gmailAddress` is not exposed.** The Connected badge (AC 3) must show the linked address, but `/status` only returns `hasGmail`. The address is stored encrypted as the `gmail_address` user-secret. Task 1 decrypts it into `/status`. Without this, you cannot satisfy AC 3 and would be tempted to invent a new endpoint — don't; extend `/status` (AC 8 says the UI is "driven by `hasGmail` from `/status`", so the address belongs there too). Also the `OnboardingStatusResponse` **type is stale** — it omits `hasGmail` entirely; add both fields.
2. **Onboarding OAuth round-trip bounces to `/`.** `onboardingComplete === hasAnthropicKey`, and the Anthropic key is persisted the moment it's tested in step 1 [api-onboarding.ts:74-82]. The onboarding loader [router.ts:110-125] redirects to `/` whenever `onboardingComplete` is true. The Gmail consent flow is a **full page navigation** away and back, so the loader re-runs on return and bounces the user to the dashboard — they never see the connected state. Task 4 guards the loader: skip the redirect when the URL carries `?gmail=`. This is the single most likely thing to get silently wrong.

### Mirror the IMAP UI — copy structure, swap the source (do NOT reinvent)
The Config page `profile-inbox-mapping.tsx` is your template for BOTH the connection badge and the mapping table:
- **Badge** (lines 118-125): emerald `Connected` vs zinc `Not connected`, driven by `status?.hasImap`. Do the Gmail badge identically off `status?.hasGmail`, plus the address text.
- **Mapping table** (lines 163-241): full Add/Edit/Delete row machine with `rows` / `editingIndex` / `draft` and the `useEffect`-sync-from-query (lines 38-43, guarded by `editingIndex === null`). Copy it wholesale; the only difference is the **first column** — IMAP uses a free-text `<Input value={draft.folderPath}>`, Gmail uses a `<select>` populated from the labels query (value = label **name**). The status `<select>` over `MESSAGE_TYPES` (lines 200-208) is identical.
- **Mutation pattern**: `saveAll(updated)` builds the full array and calls `mutation.mutate(payload)` — full-set replace, same as IMAP. The Gmail PUT is replace-all too.
- **Hooks**: `useGmailMappingsQuery`/`useGmailMappingsMutation` are line-for-line analogs of `useInboxMappingsQuery`/`useInboxMappingsMutation` (just different URL + `['gmail-mappings']` key + `GmailLabelMapping` type).

### Label name vs id (the 45.3 contract — get this right)
`gmail_label_mappings.label` stores the label **NAME** (e.g. `"Jobs"`), NOT the Gmail label id (`Label_1`). The dropdown is populated from `GET /gmail/labels` which returns `{ id, name }`, but you **submit the `name`** as the mapping value (the sync service resolves name→id at fetch time). So: `<option value={label.name}>{label.name}</option>`. [45.3 Dev Notes "Label name→id contract"]

### Connect flow (exact sequence)
`Connect` button → `apiFetch('/api/onboarding/gmail/connect?return=config')` → `{ url }` → `window.location.href = url`. The browser leaves the SPA, hits Google, Google redirects to `…/gmail/callback`, the server stores tokens + address and redirects back to `/config/profile/inbox-mapping?gmail=connected`. Your page reads `?gmail=`, toasts, invalidates `['onboarding-status']`, strips the param. **Use `return=config` from Config and `return=onboarding` from onboarding** — that's what controls where the callback sends the user back.

### Google branding (UX-DR1)
The "Connect Gmail" button should be Google-branded per the consent-screen convention: light/white button surface, the multicolor Google "G" mark, label like "Connect Gmail" or "Sign in with Google". Tailwind is available (`@/components/ui/button` `variant="outline"` on a white-ish surface, or a custom button). Keep it visually distinct from the app's dark zinc buttons so it reads as a third-party auth action. Do not over-engineer — a clean branded button is enough; no new icon library, inline the G SVG if needed.

### Project conventions to honor (from project-context.md)
- **Never `fetch('/api/...')` directly in components** — use hooks from `src/client/hooks/` (one hook per file, `useCamelCase.ts`). The inline `handleTestImap`/`handleSaveImap` in the IMAP page predate this and use `apiFetch` directly; for new Gmail data access prefer hooks, but the small connect/disconnect imperative actions may use `apiFetch` inline (mirroring the existing IMAP page) — keep them minimal.
- **Server state in TanStack Query only** — labels, mappings, status all via `useQuery`; never mirror into `useState` except the editable `rows` draft (which is the established IMAP table pattern).
- **Query keys**: `['gmail-labels']`, `['gmail-mappings']`, reuse `['onboarding-status']`. Invalidate `['onboarding-status']` after connect/disconnect so the badge flips.
- **Error shape**: server returns `{ error }`; read `data.error` and toast it. Never expect `{ message }`.
- **Components `PascalCase.tsx`, hooks `useCamelCase.ts`, server/util `kebab-case.ts`.** shadcn `ui/` components are generated — don't hand-edit; compose them.
- **`null` not `undefined`** for the missing-address case in the API.
- **No comments unless non-obvious; no speculative abstractions; no backwards-compat shims.**
- **Multi-user hosted platform** — all reads/writes are already `userId`-scoped server-side; the UI carries the session cookie via `apiFetch` (which also adds the CSRF header on mutating verbs). Nothing extra needed client-side.

### Out of scope for THIS story (do not build ahead)
- No new server route, no migration, no new `user_secrets` key, no change to the sync service or `/sync` endpoint (45.3 done). The ONLY server edit is adding `gmailAddress` to `/status` (Task 1).
- No background polling, no token-refresh UI, no "reconnect" automation beyond the existing Disconnect→Connect loop (the revoked-token reconnect prompt surfaces as the labels/sync 502 error text).
- No changes to the IMAP form behavior or the Messages view (Gmail rows already behave identically per 45.3).
- No new icon/asset dependency — inline the Google "G" SVG if you want the branded mark.

### Project Structure Notes
- **Edited (server):** `src/server/routes/api-onboarding.ts` (`/status` returns `gmailAddress`), `src/shared/schemas.ts` (`OnboardingStatusResponse` += `hasGmail`, `gmailAddress`), `src/server/routes/api-onboarding.test.ts` (status cases).
- **New (client hooks):** `src/client/hooks/useGmailLabelsQuery.ts`, `useGmailMappingsQuery.ts`, `useGmailMappingsMutation.ts` (analogs of the inbox-mapping hooks). Optional `useGmailConnection.ts` for connect/disconnect.
- **Edited (client):** `src/client/routes/config/profile-inbox-mapping.tsx` (Gmail section), `src/client/routes/onboarding.tsx` (either/or + return handling), `src/client/lib/router.ts` (inbox-mapping loader += `['gmail-mappings']`; onboarding loader `?gmail=` guard).
- Routes/mounts already exist (`/api/onboarding/*`, `/api/config/gmail-mappings` in `src/index.ts:109-111`); the Config and onboarding routes are already registered in `router.ts`. No new route registration.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 45.4 (lines 245-283)] — the 8 ACs, UX-DR1–UX-DR5, FR3/FR4/FR5/FR8
- [Source: job-hunt-dashboard/src/client/routes/config/profile-inbox-mapping.tsx] — IMAP badge (118-125) + mapping table (163-241) to mirror exactly
- [Source: job-hunt-dashboard/src/client/routes/onboarding.tsx:149-198] — step 2 email setup to extend with the either/or
- [Source: job-hunt-dashboard/src/client/hooks/useInboxMappingsQuery.ts, useInboxMappingsMutation.ts, useOnboardingStatusQuery.ts] — hook templates to copy
- [Source: job-hunt-dashboard/src/server/routes/api-onboarding.ts:13-27,181-295] — `/status`, gmail connect/callback/labels/disconnect (already built)
- [Source: job-hunt-dashboard/src/server/routes/api-config-gmail-mappings.ts] — gmail-mappings GET/PUT shape + duplicate-label 400
- [Source: job-hunt-dashboard/src/shared/schemas.ts:71,87-102,344-350] — `MESSAGE_TYPES`, `gmailLabelMapping*` types, stale `OnboardingStatusResponse` to extend
- [Source: job-hunt-dashboard/src/client/lib/router.ts:110-125,223-229] — onboarding loader redirect (the bounce hazard) + inbox-mapping loader
- [Source: job-hunt-dashboard/src/client/lib/api.ts] — `apiFetch` (adds CSRF header on mutating verbs)
- [Source: job-hunt-dashboard/src/client/main.tsx:17] — global `<Toaster />` (sonner) covers both surfaces
- [Source: _bmad-output/implementation-artifacts/45-3-gmail-sync-into-messages-view.md] — label name→id contract; provider coexistence; 502 reconnect semantics
- [Source: _bmad-output/project-context.md] — hooks-not-fetch, TanStack Query rules, error shape, naming, null-not-undefined, multi-user

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- **Task 1 — `/status` extended:** `GET /api/onboarding/status` now selects `ciphertext` alongside `keyName`, decrypts the `gmail_address` secret into `gmailAddress` (try/catch → `null` on any decrypt failure, never throws), and returns it in the JSON. `OnboardingStatusResponse` in `src/shared/schemas.ts` was stale (omitted `hasGmail`) — added both `hasGmail: boolean` and `gmailAddress: string | null`. Two new tests cover connected (decrypted address) and not-connected (`null`) cases; both pass.
- **Task 2 — Client hooks:** Added `useGmailLabelsQuery` (enabled-gated so it never hits the 503 when disconnected; throws on `!ok` so the page can show an inline hint), `useGmailMappingsQuery` (+ exported `fetchGmailMappings` for the loader), `useGmailMappingsMutation` (full-set PUT, surfaces the server's verbatim `error` incl. `Duplicate label`), and `useGmailConnection` (shared `connect(returnTo)` / `disconnect()` helpers). Added a `GoogleConnectButton` component with an inline multicolor Google "G" SVG (no new dependency).
- **Task 3 — Config page:** Added a "Gmail" section to `profile-inbox-mapping.tsx` below the IMAP form/folder table (both kept fully intact — AC 1/7). Connected/Not-connected badge mirrors the IMAP pattern off `status.hasGmail`; connected shows `gmailAddress` + Disconnect; not-connected shows the branded Connect button. Label-mapping table is a clone of the IMAP table's row state machine with `label` (a `<select>` over the labels query, value = label **name** per the 45.3 contract) replacing the free-text folder input. Run-once `useEffect` reads `?gmail=`, toasts, invalidates `['onboarding-status']`, and strips the param. Loader now also prefetches `['gmail-mappings']`.
- **Task 4 — Onboarding:** Step 2 now presents Connect Gmail (or a connected-state Alert) above an "or use IMAP" divider and the existing IMAP form; Back/Skip/Continue unchanged (AC 6). Loader bounce hazard fixed: the `redirect({ to: '/' })` is skipped when the return URL carries `?gmail=`. `step` initializes to 2 when returning from the OAuth round-trip, and a run-once effect toasts + strips the param.
- **Task 5 — Verify:** `bunx tsc --noEmit` reports zero errors in any touched file (remaining errors are pre-existing in untouched files). `bun test src/server/routes/api-onboarding.test.ts src/server/routes/api-config-gmail-mappings.test.ts` → 46 pass / 5 fail (the 5 are pre-existing obsolete `/linkedin` route tests, confirmed present on the unmodified tree). Full `bun test` → 407 pass / 43 fail, matching the documented pre-existing baseline (no new regressions). Live Gmail OAuth round-trip not exercised headlessly (requires `GOOGLE_CLIENT_ID`/`SECRET` + a browser); all server endpoints it relies on are covered by 45.1–45.3 tests.

### File List

- `job-hunt-dashboard/src/shared/schemas.ts` (modified — `OnboardingStatusResponse` += `hasGmail`, `gmailAddress`)
- `job-hunt-dashboard/src/server/routes/api-onboarding.ts` (modified — `/status` decrypts + returns `gmailAddress`)
- `job-hunt-dashboard/src/server/routes/api-onboarding.test.ts` (modified — `gmailAddress` status cases)
- `job-hunt-dashboard/src/client/hooks/useGmailLabelsQuery.ts` (new)
- `job-hunt-dashboard/src/client/hooks/useGmailMappingsQuery.ts` (new)
- `job-hunt-dashboard/src/client/hooks/useGmailMappingsMutation.ts` (new)
- `job-hunt-dashboard/src/client/hooks/useGmailConnection.ts` (new)
- `job-hunt-dashboard/src/client/components/onboarding/GoogleConnectButton.tsx` (new)
- `job-hunt-dashboard/src/client/routes/config/profile-inbox-mapping.tsx` (modified — Gmail section)
- `job-hunt-dashboard/src/client/routes/onboarding.tsx` (modified — either/or + OAuth return)
- `job-hunt-dashboard/src/client/lib/router.ts` (modified — inbox-mapping loader += gmail-mappings; onboarding loader `?gmail=` guard)

### Change Log

- 2026-06-16: Implemented Story 45.4 — Connect Gmail UI on Config & onboarding surfaces. Server: `/status` now returns `gmailAddress`. Client: Gmail connect/disconnect, label-dropdown mapping table, onboarding either/or with OAuth round-trip handling. Status → review.

### Review Findings (code review 2026-06-16)

Adversarial review: Blind Hunter + Edge Case Hunter + Acceptance Auditor (all 8 ACs verified MET). 2 patch, 4 defer, 7 dismissed as noise.

**Patches (open):**

- [x] [Review][Patch] `disconnect()` toasts "Gmail disconnected" even when the DELETE fails server-side — `res.ok` is never checked; also never invalidates `['gmail-labels']`, so a reconnect to a different account can briefly show the old account's labels [job-hunt-dashboard/src/client/hooks/useGmailConnection.ts:17] — FIXED: checks `res.ok`, toasts "Could not disconnect Gmail" on failure, and now invalidates `['gmail-labels']`
- [x] [Review][Patch] `connect()` has no try/catch — a network error on the `apiFetch` rejects unhandled with no user feedback (the IMAP handlers catch and toast "Could not reach the server") [job-hunt-dashboard/src/client/hooks/useGmailConnection.ts:6] — FIXED: wrapped in try/catch, toasts "Could not reach the server"

**Deferred (pre-existing / out-of-scope / mirrored pattern):**

- [x] [Review][Defer] Server Gmail-route error handling — `gmail/labels` parses `res.json()` outside the try/catch (malformed 200 → 500 instead of 502); callback on expired/foreign state returns raw JSON 403 instead of redirecting to the surface with `?gmail=error` [job-hunt-dashboard/src/server/routes/api-onboarding.ts] — deferred, pre-existing (belongs to stories 45.1/45.2, already reviewed)
- [x] [Review][Defer] Failed `PUT /api/config/gmail-mappings` (e.g. duplicate-label 400) leaves the local table diverged — `onError` toasts but never resyncs rows from the server [job-hunt-dashboard/src/client/hooks/useGmailMappingsMutation.ts] — deferred, mirrors the existing IMAP mutation pattern
- [x] [Review][Defer] Editing a mapping whose Gmail label was deleted upstream shows a blank `<select>` (saved value has no matching `<option>`) and a save can drop the original label [job-hunt-dashboard/src/client/routes/config/profile-inbox-mapping.tsx:362] — deferred, edge
- [x] [Review][Defer] "Add mapping" stays enabled when the labels query errored / list is empty; the new row's Save is disabled and Cancel removes it, so it's recoverable but not blocked up front [job-hunt-dashboard/src/client/routes/config/profile-inbox-mapping.tsx:332] — deferred, minor UX
