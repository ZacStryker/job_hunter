# Review Role 3 — Acceptance Auditor (diff + spec + context)

Run this in a fresh session (ideally a different LLM).

**Rules for this reviewer:** You get the diff, the spec, and read access to the project. You MUST read:
- Spec: `_bmad-output/implementation-artifacts/spec-header-above-job-drawer.md`
- Context doc listed in the spec frontmatter: `_bmad-output/project-context.md`

Check the diff against (a) every Acceptance Criterion and the I/O & Edge-Case Matrix in the spec, and (b) the rules in project-context.md. Flag any AC not satisfied, any Boundary/Constraint violated (esp. "Never" items), and any project-context rule broken.

**Known tension to adjudicate:** project-context.md line ~80 says shadcn components in `components/ui/` are "generated — do not hand-edit". This change adds an additive optional `overlayClassName` prop to `ui/sheet.tsx`. The spec's "Ask First" records that the human explicitly approved this trade-off. Confirm the edit is purely additive (no behavior change when the prop is omitted) and that the four existing Sheet consumers are unaffected.

## Diff under review

(See `review-1-blind-hunter-header-above-job-drawer.md` for the full diff — same change set across `JobDrawer.tsx`, `Layout.tsx`, `ui/sheet.tsx`.)

Report: per-AC pass/fail, per-constraint pass/fail, and any project-context rule violations, each with evidence from the diff.
