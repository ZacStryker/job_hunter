# Core Experience Deep Dive

## Defining Experience

**"Click a job row, read the AI's verdict, decide in 10 seconds."**

The defining interaction is the triage loop: scan → click → read → decide. If this feels fast,
clean, and trustworthy, everything else follows. If it feels slow, cluttered, or uncertain,
the product fails its core purpose regardless of other features.

## User Mental Model

**Current state (problem being solved):**
Job hunting currently requires context-switching across multiple tools — Sheets for raw data,
job postings for descriptions, email for status. The user must assemble the picture before
every decision. This is cognitively expensive and creates fatigue.

**Mental shift this product creates:**
The dashboard delivers *conclusions*, not datasets. The user arrives at a pre-assembled
recommendation (score + gaps + reasoning) and decides whether they agree. The job is
not "research this opportunity" — it is "confirm or override this assessment."

This is a significant mental model shift that the UI must support by presenting the AI's
recommendation as the primary visual entry point, not the job title or company name.

## Success Criteria

The core triage loop is successful when:
- The user makes a decision (skip / investigate / apply) without scrolling in the drawer
- The fit score badge is the first visual element the eye lands on when the drawer opens
- Applied toggle confirmation is visible within 200ms of clicking
- Closing the drawer and opening the next record feels like flipping a card, not navigating
- The user never thinks about the mechanism — only the decision

## Novel UX Patterns

**Pattern 1 — Pre-scored dossier (novel):**
The AI recommendation is surfaced *first* in the drawer layout — before the job title is
prominently displayed, before the description is shown. This is backwards from conventional
job browsing. It must feel like a trusted advisor presenting a briefing, not a spoiler
disrupting the user's own evaluation. Implementation: score + recommendation chip appear at
the top of the drawer; job description is below the fold.

**Pattern 2 — Visual aging as passive state (novel):**
Row opacity decays over time without any explicit "ghosted" status field. First-time users
may not immediately understand why rows look different. Mitigation: hover tooltip on any
row reveals "Applied N days ago" regardless of opacity level. The pattern teaches itself
within one session.

**Pattern 3 — Established: table + right-side panel:**
Row click → Sheet slide from the right. Context (table) remains visible behind the panel.
Users already understand this from n8n, Linear, and similar tools. No education needed.

## Experience Mechanics

**The triage loop in detail:**

**1. Initiation — Table scan**
- User opens `localhost:3000`; Pipeline view loads
- TanStack Query fetches all jobs; table renders with color-coded fit score badges
- Eye is drawn to green badges (≥80) before any text is processed
- Action chip (skip/investigate/apply) is visible in the same row — the AI has already voted

**2. Interaction — Drawer open**
- User clicks anywhere on a row
- shadcn `Sheet` slides in from the right at ~300ms transition
- Data is already in TanStack Query cache — no loading state, no spinner
- Drawer layout top-to-bottom: fit score badge (large) → recommendation chip → score
  breakdown (reqs met/missed) → Claude's explanation → job description → source URL →
  applied toggle → status override → status timeline (post-MVP)

**3. Decision and feedback**
- User reads score breakdown and Claude's explanation — the two most decision-relevant items
- User either:
  - Toggles **Applied** → toggle animates to checked state immediately (optimistic update);
    drawer remains open; row in background table gains an "applied" visual indicator
  - Sets **Status Override** (skip/investigate) → select updates immediately; row action
    chip updates in background table
  - Closes drawer without action → no state change; row unchanged

**4. Completion — Next record**
- User closes drawer (click outside, Escape key, or explicit close button)
- Table is visible, unchanged except for the row just acted on
- User scrolls to next row of interest and repeats
- Session ends when user has processed the rows they care about — no "done" state needed
