# Review 3 — Acceptance Auditor (diff + spec + context docs + project read)

Run this in a fresh session (ideally a different LLM) with **read access to the project**.
Paste findings back here.

You are auditing a change against its spec and the project's rules. Read these first:

1. **Spec:** `_bmad-output/implementation-artifacts/spec-manual-status-dropdown.md`
   (especially the `<frozen-after-approval>` Intent, Boundaries & Constraints, I/O matrix,
   Tasks & Acceptance, and Design Notes).
2. **Context doc (from spec frontmatter `context`):** `_bmad-output/project-context.md` —
   the project's rules and conventions, which override general defaults.

## How to get the diff

From repo root:

```
git --no-pager diff d83494212c9c7d0bef8707dc2c45b13e51265000 -- job-hunt-dashboard/
```

## What to audit

Check the diff for violations of:

- **Acceptance Criteria** in the spec (each of the four bullets — verify the select→PATCH
  mapping, the funnel counting for `interview`, the 400 on `withdrawn`, and the test suite).
- **Boundaries & Constraints** (Always / Ask First / Never) — e.g. exact option set & order,
  lowercase stored values, no DB migration, `stageAging` untouched, message `type` values
  untouched, reuse of `components/ui/select.tsx` without hand-editing generated ui.
- **Design Notes** — `other` sets `applied:true` but is excluded from response/interview/offer
  buckets; response statuses set `applied:true` to preserve funnel nesting.
- **project-context.md rules & conventions** — anything the change violates.

For each finding: cite the spec/rule clause, the diff location, and classify your confidence.
Flag any acceptance criterion that is NOT demonstrably satisfied by the change.
