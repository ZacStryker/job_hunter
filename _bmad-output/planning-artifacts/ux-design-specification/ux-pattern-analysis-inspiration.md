# UX Pattern Analysis & Inspiration

## Inspiring Products Analysis

**GitHub (Issues / Pull Requests)**
- Dense tabular list with compact rows — status, labels, and metadata visible without expanding
- Color-coded label system communicates category and priority before text is read
- Inline state transitions (close, merge, react) without leaving list context
- Detail view hierarchy: title → status → metadata → body → timeline — everything has a defined place
- Keyboard navigation and shortcuts respected throughout

**n8n (Workflow Editor)**
- Right-side configuration panel slides in on node click — context (canvas) remains visible
- Muted/neutral base palette; color appears only where it carries semantic meaning (node execution state)
- Node status badges: color + icon communicate state before label is read (green = success, red = error)
- Panel sections are clearly separated; most important controls are highest in the layout

## Transferable UX Patterns

**Navigation Patterns:**
- **Right-side slide panel (n8n)** — row click opens detail panel from the right; main list remains
  visible and oriented; directly maps to our JobDrawer pattern
- **List-stays-visible on detail open** — the user never loses their place in the table when
  reviewing a job record

**Interaction Patterns:**
- **Inline state transitions (GitHub)** — applied toggle and status override live in the drawer,
  not on a separate edit page; state changes without navigation
- **Compact row with pre-attentive signals (GitHub issues)** — fit score badge + action chip
  communicate the essential information before any text label is processed

**Visual Patterns:**
- **Semantic color only (n8n)** — muted neutral base; color reserved for fit score badges
  (green/yellow/red) and action chip styling; never decorative
- **Badge-first status communication (GitHub labels)** — colored badges carry meaning before
  text; the table column becomes a visual heat map

## Anti-Patterns to Avoid

- **Text-heavy detail views (GitHub issue body)** — the drawer must be scannable, not readable;
  structured sections and short labels, not prose paragraphs
- **Badge proliferation** — the fit score badge is the primary signal; avoid multiplying badge
  types (don't add separate "urgent" or "new" badges that dilute the score's prominence)
- **Panel complexity creep (n8n node config)** — the drawer should surface the most important
  information immediately; don't expose every field at equal visual weight
- **Navigation away for routine actions** — applying to a job, overriding a status — these must
  never require leaving the current context

## Design Inspiration Strategy

**Adopt directly:**
- n8n's right-side panel slide pattern for JobDrawer
- n8n's "color only where it means something" palette rule
- GitHub's compact row density with pre-attentive badge signals
- GitHub's inline state change pattern (no separate edit pages)

**Adapt:**
- GitHub's detail view top-to-bottom priority hierarchy → drawer layout: score breakdown →
  requirements met/missed → Claude explanation → action controls
- GitHub's label color semantics → fit score badge: ≥80 green, 60–79 yellow, <60 red

**Avoid:**
- Prose-heavy detail sections — use structured data, not paragraphs, in the drawer
- Decorative color — every color used must carry information
- Any interaction that navigates away from the table for a routine triage decision
