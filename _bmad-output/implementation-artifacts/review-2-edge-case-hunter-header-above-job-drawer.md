# Review Role 2 — Edge Case Hunter (diff + project read access)

Run this in a fresh session (ideally a different LLM). Invoke the `bmad-review-edge-case-hunter` skill.

**Rules for this reviewer:** You get the diff below AND read access to the project at `job-hunt-dashboard/`. Walk every branching path and boundary condition the change introduces or touches; report ONLY unhandled edge cases. Do not critique style.

**Specific surfaces worth probing (non-exhaustive):**
- `modal={false}` on the JobDrawer `<Sheet>`: focus trapping, body scroll lock removal, Escape / outside-click dismissal, interaction with other portaled UI opened from inside the drawer (Select, Tabs, Tooltip), and the header's ActivityIndicator dropdown z-order.
- The 56px / 96px offset: any layout other than "normal" and "impersonating" (e.g. impersonation toggling while the drawer is open; session still loading so `session` is undefined).
- `relative z-[60]` header vs other portaled overlays in the app (toasts/sonner, other Sheets, dropdowns) — does anything now render under or over the header unexpectedly?
- The new optional `overlayClassName` on `SheetContent` — other consumers: `AddJobDrawer`, `UserEditDrawer`, `config/profile-resume.tsx`.

## Diff under review

(See `review-1-blind-hunter-header-above-job-drawer.md` for the full diff — same change set across `JobDrawer.tsx`, `Layout.tsx`, `ui/sheet.tsx`.)

Report: unhandled edge cases only, each with the triggering condition and the observable bad outcome.
