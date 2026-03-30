# Executive Summary

## Project Vision

Job Hunt Dashboard is a personal decision surface for job hunting — not a tracker, not a data entry
tool. Every record arrives pre-scored from an upstream Google Sheets + Claude pipeline. The dashboard's
sole UX responsibility is to surface that intelligence efficiently so the user can make fast, confident
triage decisions without opening any other tool.

The defining UX principle: **the AI has already decided — the interface presents the conclusion.**

## Target Users

**Primary User: Stryker (single user)**
- Technically fluent; comfortable with dense, information-rich interfaces
- Experiences decision fatigue during active job searching
- Works exclusively on desktop (Firefox); no mobile consideration needed
- Has an existing technical workflow (Google Sheets + Claude pipeline); this dashboard is the
  consumption layer for that investment
- Values speed and signal over polish and hand-holding

## Key Design Challenges

1. **Density vs scanability** — The pipeline table must hold enough records to review in one session
   without becoming a wall of noise. Fit score and action chip must communicate intent before a
   single text label is read.

2. **The drawer as decision moment** — When a user opens a drawer, they are in the act of deciding.
   The drawer layout must answer "should I apply?" in a single visual pass: score → gaps → Claude's
   reasoning → apply action. Nothing should be buried.

3. **Visual aging calibration** — Opacity/color decay must feel like natural information, not a UI
   glitch. Old applications should feel aged; the effect must be smooth and purposeful.

## Design Opportunities

1. **Fit score color as pre-attentive signal** — Red/yellow/green badges communicate quality
   distribution across the entire table before any text is processed. The column becomes a
   heat map of opportunity.

2. **Action chip as AI voice** — The `skip / investigate / apply` chip is the most powerful
   affordance in the UI: it translates a numeric score into a direct recommendation. This chip
   should be visually prominent and styled to feel like a recommendation, not a label.

3. **Zero-friction decision capture** — The applied toggle should be a single-click interaction
   with immediate visual confirmation. The drawer should remain open post-toggle so the user
   retains context and can review what they just committed to.
