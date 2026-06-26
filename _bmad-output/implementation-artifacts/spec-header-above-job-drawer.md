---
title: 'Keep top nav header visible & usable above the JobDrawer'
type: 'feature'
created: '2026-06-26'
status: 'done'
context: ['{project-root}/_bmad-output/project-context.md']
baseline_commit: '9d72a2b5e58202fd061912cec7f9f7c85930ccdf'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When the JobDrawer (Radix Sheet, `side="right"`) opens, its `z-50` dark overlay and panel cover the top nav header, and Radix's modal mode disables pointer events on the rest of the page — so the header is dimmed, covered, and unclickable while the drawer is open.

**Approach:** Lift the opaque header into its own stacking context above the sheet (`relative z-[60]`), make the JobDrawer's Sheet non-modal so the header stays interactive, and offset the drawer panel to start below the header (56px normally, 96px when the impersonation banner is active). Because Radix renders no `Dialog.Overlay` in non-modal mode (verified at runtime), the dimming backdrop is a **custom element** (a `bg-black/80` div portaled to `body`, `z-40`) that starts at the header's bottom edge, dims the body but never the header, and closes the drawer on click.

## Boundaries & Constraints

**Always:**
- Header must paint above the sheet (`z-50`) and the backdrop, and remain clickable (nav links, logout, ActivityIndicator) while the drawer is open and animating.
- Drawer panel AND the custom backdrop must start at the header's bottom edge: `top: 56px` normally, `top: 96px` when impersonating (banner `h-10`=40px + header `h-14`=56px). Panel height fills the remaining viewport; backdrop fills from the offset down to the bottom, full width.
- Backdrop z-order: above page content but below the panel (`z-50`) and below the header (`z-60`) — so it dims the body without dimming or covering the header.
- Preserve the existing slide-in/out animation, 720px width, and all current JobDrawer styling.
- Preserve close-on-Escape, close-on-click-outside (incl. clicking the backdrop), and the drawer's internal scroll.
- Use the existing offset values already used in `Layout.tsx`: `top-14`/`h-[calc(100vh-56px)]` and `top-24`/`h-[calc(100vh-96px)]`.

**Ask First:**
- (Resolved) Backdrop dimming is kept (chosen over no-dim): implemented as a custom portaled element, since Radix omits its overlay when non-modal. `ui/sheet.tsx` is left untouched (the earlier `overlayClassName` prop was reverted), restoring the "don't hand-edit generated ui/" rule.

**Never:**
- Do not touch `ui/sheet.tsx` or other Sheet consumers (`AddJobDrawer`, `UserEditDrawer`, `config/profile-resume.tsx`) — the backdrop lives entirely inside `JobDrawer`.
- Do not keep the Sheet modal (modal mode forces `pointer-events:none` on the body, defeating header interactivity).
- Do not use inline styles or `!important`; Tailwind v4 emits `top-*` after `inset-*`, so a `top-*` class reliably overrides the variant's `inset-y-0` top.
- Do not give the backdrop a `z-index` ≥ the panel (`z-50`) or header (`z-60`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Drawer open, no impersonation | `open=true`, `session.impersonating` falsy | Panel + backdrop start at 56px; header (0–56px) fully visible/undimmed/clickable; body below is dimmed | N/A |
| Drawer open, impersonating | `open=true`, `session.impersonating` truthy | Panel + backdrop start at 96px; banner (0–40px) + header (40–96px) visible/undimmed; body below is dimmed | N/A |
| Click a header control (nav / logout / activity) while open | drawer open | Header control responds AND the drawer stays open (header interaction is not treated as a dismiss) | N/A |
| Close affordances | Escape or click the dimmed backdrop | Drawer closes via existing `onClose` | N/A |
| Other Sheet consumers | AddJobDrawer / UserEditDrawer / profile-resume open | Unchanged (full-screen modal overlay) — `sheet.tsx` untouched | N/A |

</frozen-after-approval>

## Code Map

- `src/client/components/shared/Layout.tsx` -- top `<header className="h-14 …">`; needs a stacking context above the sheet. Wrapper `min-h-screen` creates no stacking context, so `relative z-[60]` on the header suffices.
- `src/client/components/detail/JobDrawer.tsx` -- the `<Sheet>` + `<SheetContent side="right" className="w-[720px] …">`; add `modal={false}`, derive impersonation state, offset the panel, and render the custom backdrop via `createPortal`.
- `src/client/components/ui/sheet.tsx` -- reference only; **left untouched** (non-modal `Dialog.Overlay` renders `null`, so a sheet-level prop is useless here).
- `src/client/components/admin/ImpersonationBanner.tsx` -- reference only: `fixed top-0 z-50 h-10`; confirms the 40px/96px offsets.
- `src/client/hooks/useSessionQuery.ts` -- source of `session.impersonating` (already used by Layout & ImpersonationBanner).

## Tasks & Acceptance

**Execution:**
- [x] `src/client/components/shared/Layout.tsx` -- add `relative z-[60]` to the `<header>` className so the opaque header sits above the sheet's `z-50` in both normal and impersonating layouts.
- [x] `src/client/components/detail/JobDrawer.tsx` -- import `useSessionQuery` + `createPortal`; derive `isImpersonating`; set `<Sheet … modal={false}>`; append panel offset to `SheetContent` (`top-14 h-[calc(100vh-56px)]` or `top-24 h-[calc(100vh-96px)]`); render a backdrop `<div onClick={onClose} className="fixed inset-x-0 bottom-0 z-40 bg-black/80 animate-in fade-in-0 … {top-14|top-24}">` via `createPortal(…, document.body)` when `open`.
- [x] `src/client/components/ui/sheet.tsx` -- left untouched (the earlier `overlayClassName` edit was reverted).

**Acceptance Criteria:**
- Given the drawer is open with no impersonation, when the page renders, then the header occupies 0–56px fully visible/undimmed, the panel + backdrop begin at 56px, and the body below 56px is dimmed.
- Given the drawer is open while impersonating, when the page renders, then the banner+header occupy 0–96px visible/undimmed and the panel + backdrop begin at 96px.
- Given the drawer is open, when the user clicks the ActivityIndicator (or other header control), then the control responds AND the drawer stays open.
- Given the drawer is open, when the user presses Escape or clicks the dimmed backdrop, then the drawer closes.
- Given AddJobDrawer, UserEditDrawer, or the profile-resume sheet opens, when rendered, then their behavior is unchanged (`sheet.tsx` was reverted to its original generated form).

## Spec Change Log

### Loop 2 — runtime review (browser verification)
- **Triggering finding:** Browser verification showed `modal={false}` makes Radix render **no** `Dialog.Overlay` at all (not just an offset one). The dark backdrop disappeared entirely and the `overlayClassName` prop added to `ui/sheet.tsx` was dead code. (The adversarial reviewers' fears — header-click and in-drawer `Select` dismissing the drawer — were **disproven** at runtime; do not re-add guards for them.)
- **Human renegotiation:** User chose to keep a dimming backdrop (below the header) over shipping no-dim.
- **Amended:** Frozen Approach/Boundaries/Matrix updated from "offset the Radix overlay via a `sheet.tsx` prop" to "render a custom `z-40` backdrop portaled to `body`, dimming from the header bottom down." `ui/sheet.tsx` reverted to original (restores the "don't hand-edit generated ui/" rule).
- **Known-bad state avoided:** A drawer with no visual backdrop, plus a pointless edit to a generated shadcn component.
- **KEEP (must survive re-derivation):** header `relative z-[60]`; `modal={false}`; panel offset `top-14`/`top-24` + `h-[calc(100vh-56px)]`/`h-[calc(100vh-96px)]` — all verified pixel-correct (panel at 56/96px) and confirmed header stays clickable while the drawer stays open.

## Design Notes

Stacking: the sheet portal renders at `<body>` with `z-50`. The header's only ancestor (`min-h-screen`) sets no `z-index`/transform/opacity, so it creates no stacking context — thus `relative z-[60]` on the header competes directly with the portal at the root and wins. The header `bg-zinc-900` is opaque, so nothing behind it shows through.

Why `modal={false}`: Radix `Dialog` in modal mode applies `pointer-events:none` to the body and only re-enables it on the dialog content — no z-index makes the header clickable. `modal={false}` keeps the body interactive while Radix still fires `onEscapeKeyDown`/`onInteractOutside`, so existing close behavior is preserved. Trade-off: background scroll is no longer locked while the drawer is open (acceptable — the page is meant to stay usable).

Override reliability: `cn`/`tailwind-merge` keeps both `inset-y-0` and `top-14`, and Tailwind v4 emits `.top-*` rules after `.inset-*`, so `top-14`/`top-24` reliably wins. `h-full` is dropped in favor of `h-[calc(...)]` by tailwind-merge.

Backdrop: Radix `Dialog.Overlay` returns `null` when `modal={false}` (confirmed at runtime — no overlay element exists), so the dim must be supplied by JobDrawer itself. It's a `createPortal(…, document.body)` element so `position: fixed` resolves against the viewport (immune to any transformed ancestor) and it lands in the root stacking context, where `z-40` sits below the panel portal (`z-50`) and the header (`z-60`). It uses `inset-x-0 bottom-0` + `top-14`/`top-24`, so it dims from the header bottom down without covering the header. `onClick={onClose}` plus Radix's own outside-dismiss both close the drawer (idempotent). Header controls and the in-drawer status `Select` do NOT dismiss — Radix treats those nested layers as branches (verified at runtime).

## Verification

**Commands:**
- `bunx tsc --noEmit` -- expected: no new type errors.
- `bun run build` -- expected: production build succeeds.

**Manual checks (all confirmed via Playwright on the built app — see Loop 2):**
- Open a job to launch the drawer: header stays fully visible/undimmed and clickable; the body below the header is dimmed; panel + backdrop start at 56px; clicking the ActivityIndicator keeps the drawer open; clicking the backdrop and Escape both close it. (Measured: header `z-60` `top:0 h:56`; backdrop `z-40` `top:56`; panel `z-50` `top:56`.)
- Impersonation: banner (0–40) + header (40–96) stay visible/undimmed; backdrop + panel start at 96px. (Measured: backdrop/panel `top:96`.)
- `sheet.tsx` reverted, so AddJobDrawer / UserEditDrawer / profile-resume are byte-for-byte unaffected.

## Suggested Review Order

**Header stacking (entry point)**

- The whole fix hinges here: opaque header gets its own context above the sheet's `z-50`.
  [`Layout.tsx:31`](../../job-hunt-dashboard/src/client/components/shared/Layout.tsx#L31)

**Drawer behavior & offsets**

- Non-modal makes the header clickable; this is the key behavioral switch (and why Radix drops its overlay).
  [`JobDrawer.tsx:153`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L153)

- Impersonation-aware offsets reuse Layout's exact 56/96px values.
  [`JobDrawer.tsx:101`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L101)

- Panel starts below the header and fills the remaining viewport.
  [`JobDrawer.tsx:156`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L156)

**Custom backdrop (replaces the non-existent Radix overlay)**

- Portaled `z-40` dim from the header bottom down; click-to-close; never covers the header.
  [`JobDrawer.tsx:145`](../../job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx#L145)
