---
title: 'Insert Gmail Label Mappings step into onboarding flow'
type: 'feature'
created: '2026-06-29'
status: 'done'
context: ['{project-root}/_bmad-output/project-context.md']
baseline_commit: 'f47a310a30d0b2785253e03a998f3936568e6837'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After a user connects Gmail during onboarding, the flow drops them straight onto the "Your account is ready" screen and then the dashboard, so the only place to map Gmail labels → job statuses is buried later in Config. New users never see label mapping when it matters most.

**Approach:** Insert one new onboarding step ("Gmail Label Mappings") between the Email Setup step and the Ready step, shown **only when Gmail is connected**. After the OAuth return (`/onboarding?gmail=connected`) the user lands on this step, can add/edit/delete label→status mappings (reusing the exact UI/logic already in `profile-inbox-mapping.tsx`), then continues to the Ready screen. Users who use IMAP or skip email entirely keep today's flow with no extra step.

## Boundaries & Constraints

**Always:**
- Reuse the Gmail label-mapping UI + logic from `profile-inbox-mapping.tsx` verbatim where practical: `useGmailLabelsQuery({ enabled: hasGmail })`, `useGmailMappingsQuery`, `useGmailMappingsMutation`, the `gmailRows`/`gmailDraft`/`gmailEditingIndex` state, the `handleGmail*` handlers, and the select-based table editor (Label `<select>` from labels + Job Status `<select>` from `MESSAGE_TYPES`).
- Mappings are optional — the user can advance with zero mappings.
- Keep StepIndicator `totalSteps` and the current-step index correct in every flow variant (no-email, IMAP-only, Gmail-connected).
- Match existing onboarding styling (zinc dark theme; `Button`/`Input`/`Label`/`Alert` from `@/components/ui`; same className idioms already in `onboarding.tsx`).
- Preserve the existing focus-management pattern (per-step heading ref with `tabIndex={-1}`, focused in the `useEffect`).

**Ask First:**
- (none — scope is self-contained)

**Never:**
- Do NOT change server routes, the OAuth callback, or shared schemas — `gmail/callback` already redirects to `/onboarding?gmail=connected` for `return=onboarding`, and the mappings API already exists.
- Do NOT hand-edit generated `components/ui/` files.
- Do NOT add the extra step for users who only use IMAP or skip email.
- Do NOT batch-save behind a new button — mappings persist per-row via the existing mutation, exactly as in Config.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gmail connected during onboarding | OAuth return `/onboarding?gmail=connected`, `emailEnabled` true | Lands on the new Label Mappings step (not Email, not Ready); success toast fires; onboarding-status invalidated | N/A |
| Add/edit/delete a mapping | User edits a row and saves | Row persists via `useGmailMappingsMutation` (visible later in Config → Inbox Mapping) | Mutation error → existing toast from the mutation hook |
| Continue with zero mappings | No rows configured, click Continue | Advances to Ready step | N/A |
| Gmail labels fail to load | `useGmailLabelsQuery` errors | Show "Couldn't load Gmail labels — try reconnecting." (amber), step still usable | Non-blocking message only |
| OAuth error return | `/onboarding?gmail=error` | Stay on Email Setup step (current behavior), error toast | Existing error toast |
| IMAP-only / skip email | Gmail not connected | No Label Mappings step; Email → Ready exactly as today | N/A |
| `emailFeatures` disabled | `emailEnabled` false | 3-step flow unchanged; no Email or Label step | N/A |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/client/routes/onboarding.tsx` -- PRIMARY: add the new step, step-index/total math, post-connect routing, gmail mapping state/handlers/effects
- `job-hunt-dashboard/src/client/routes/config/profile-inbox-mapping.tsx` -- REFERENCE: source of the Gmail `<section>`, `gmail*` state, `handleGmail*` handlers, sync effect, and table editor JSX to port
- `job-hunt-dashboard/src/client/components/onboarding/StepIndicator.tsx` -- consumer of `currentStep`/`totalSteps` (no change; just pass correct values)
- `job-hunt-dashboard/src/client/hooks/useGmailLabelsQuery.ts` / `useGmailMappingsQuery.ts` / `useGmailMappingsMutation.ts` -- hooks reused as-is
- `job-hunt-dashboard/src/shared/schemas.ts` -- `MESSAGE_TYPES`, `GmailLabelMappingInput` types (import only)
- `job-hunt-dashboard/src/server/routes/api-onboarding.ts` -- CONTEXT only: confirms `gmail/callback` → `/onboarding?gmail=connected`; do not edit

## Tasks & Acceptance

**Execution:**
- [x] `onboarding.tsx` -- Add imports (`useGmailLabelsQuery`, `useGmailMappingsQuery`, `useGmailMappingsMutation`, `MESSAGE_TYPES`, type `GmailLabelMappingInput`) and local types `MessageType` / `GmailMappingRow` -- needed for the new step
- [x] `onboarding.tsx` -- Derive step math: `hasGmail = status?.hasGmail ?? false`; `showLabelStep = emailEnabled && hasGmail`; `labelStep = 3`; `readyStep = emailEnabled ? (hasGmail ? 4 : 3) : 2`; `totalSteps = emailEnabled ? (hasGmail ? 5 : 4) : 3` -- keeps indicator/index correct across all variants
- [x] `onboarding.tsx` -- Initialize `step` from the `gmail` query param: `connected` → `labelStep` (3), `error` → Email step (2), else 0 -- routes the OAuth return to the new step
- [x] `onboarding.tsx` -- Port the Gmail mapping state (`gmailRows`/`gmailEditingIndex`/`gmailDraft`), the server-sync `useEffect`, and the `handleGmail*` + `saveAllGmail` handlers from `profile-inbox-mapping.tsx` -- powers add/edit/delete
- [x] `onboarding.tsx` -- Render the Label Mappings step block (heading w/ `labelStepRef` + `tabIndex={-1}`, optional description noting it's optional, `gmailLabelsError` amber notice, empty state, the select-based table editor, and a full-width `Continue` → `setStep(readyStep)`); gate render on `showLabelStep && step === labelStep` -- the new screen
- [x] `onboarding.tsx` -- Update the focus `useEffect` to focus `labelStepRef` when on the label step; route the Email step's "Skip for now"/"Continue" to `showLabelStep ? labelStep : readyStep`; refresh the Email step's Gmail-connected alert copy so it no longer says mapping is "Config only" -- consistency + focus

**Acceptance Criteria:**
- Given `emailFeatures` is on and a user completes Gmail OAuth from onboarding, when they return to `/onboarding?gmail=connected`, then they see the "Gmail Label Mappings" step (not Ready, not dashboard).
- Given the user is on the Label Mappings step, when they add/edit/delete a mapping, then it persists via the mappings mutation and is visible later in Config → Inbox Mapping.
- Given the user is on the Label Mappings step (with or without mappings), when they click Continue, then they reach "Your account is ready" → "Go to Dashboard".
- Given any flow variant (no-email, IMAP-only, Gmail-connected), when the user progresses, then `StepIndicator` shows the correct total and current step.
- Given a user uses IMAP or skips email, when they progress, then no extra step appears and the flow matches today.

## Design Notes

Step index map (when `emailEnabled`): `0` Welcome · `1` Anthropic · `2` Email Setup · `3` Label Mappings (only if `hasGmail`) · Ready = `4` if `hasGmail` else `3`. Because `labelStep` is `3` and `readyStep` collapses to `3` when `!hasGmail`, step index `3` renders the label block only when `showLabelStep` is true and otherwise renders Ready — keep both render guards explicit (`showLabelStep && step === labelStep` for the label block; `step === readyStep` for Ready) so they never both match.

`status`/`featureSettings` load async, so on the OAuth return `totalSteps` may briefly settle (3→4→5) and the label block paints once `hasGmail` resolves — this mirrors the existing `emailEnabled ? 4 : 3` transient and is acceptable. `useGmailLabelsQuery` is already gated by `{ enabled: hasGmail }`, so labels only fetch once connected.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bunx tsc --noEmit` -- expected: no new errors beyond the known baseline
- `cd job-hunt-dashboard && bun run build` -- expected: Vite build succeeds

**Manual checks:**
- `bun run dev`, run onboarding to the Email step, connect Gmail → confirm you land on Label Mappings, can add a mapping, Continue → Ready → Dashboard; reload Config → Inbox Mapping shows the saved mapping.
- Repeat using IMAP only (or email disabled) → confirm no Label Mappings step appears and StepIndicator dot count is unchanged.

## Suggested Review Order

**Step model & async-return routing (the core design)**

- Variant-aware step math — how the label step slots in only when Gmail is connected.
  [`onboarding.tsx:31`](../../job-hunt-dashboard/src/client/routes/onboarding.tsx#L31)

- Synchronous landing on the label step from the `?gmail=connected` OAuth return.
  [`onboarding.tsx:36`](../../job-hunt-dashboard/src/client/routes/onboarding.tsx#L36)

- Loading gate (post-review): holds a placeholder so the return never flashes Ready or a blank step.
  [`onboarding.tsx:50`](../../job-hunt-dashboard/src/client/routes/onboarding.tsx#L50)

- Clamp effect (post-review): once data resolves, never strands the user on an unavailable label step.
  [`onboarding.tsx:92`](../../job-hunt-dashboard/src/client/routes/onboarding.tsx#L92)

- Email-step nav routes to label step when Gmail connected, else straight to Ready.
  [`onboarding.tsx:324`](../../job-hunt-dashboard/src/client/routes/onboarding.tsx#L324)

**Label-mapping UI (ported from Config)**

- The new step block: gated render, empty state, and the label/status table editor.
  [`onboarding.tsx:330`](../../job-hunt-dashboard/src/client/routes/onboarding.tsx#L330)

- Per-row persistence via the existing mutation (no batch save).
  [`onboarding.tsx:155`](../../job-hunt-dashboard/src/client/routes/onboarding.tsx#L155)

**Supporting**

- StepIndicator now driven by the derived `totalSteps`.
  [`onboarding.tsx:204`](../../job-hunt-dashboard/src/client/routes/onboarding.tsx#L204)

- Focus management extended for the label step heading.
  [`onboarding.tsx:78`](../../job-hunt-dashboard/src/client/routes/onboarding.tsx#L78)
