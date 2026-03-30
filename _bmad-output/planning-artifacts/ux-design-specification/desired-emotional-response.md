# Desired Emotional Response

## Primary Emotional Goals

**Primary: Calm, focused control.**
Job hunting is inherently stressful — sustained uncertainty and decision fatigue are the backdrop
for every session. The dashboard must work against that context. The user should arrive, see the
situation clearly, act decisively, and leave feeling like they accomplished something real.
Not anxious. Not overwhelmed. In command.

**Secondary: Sharp efficiency.**
Every interaction should feel clean and fast. The user should feel like they are cutting through
noise, not wading through it. Completing 9 triage decisions in 8 minutes should feel satisfying,
not exhausting.

## Emotional Journey Mapping

| Stage | Desired Emotion | Trigger |
|---|---|---|
| App opens | Oriented, clear | Color-coded scores visible before reading labels |
| During triage | Sharp, efficient | Action chip removes ambiguity; one-click decisions |
| After applying | Momentum, progress | Applied toggle confirmation; task was completed |
| After sync | Trust, relief | Applied states survived; clear success message |
| Error state | Informed, not alarmed | Clear error message; explicit "no data was modified" |
| Returning user | Familiarity, routine | Same layout, same behavior — no surprises |

## Micro-Emotions

- **Confidence** — color-coding tells the user where to look before a label is read; no guessing
- **Clarity** — the action chip translates a score into a recommendation; the user decides if they
  agree, not what the score means
- **Satisfaction** — decision volume (X decisions in Y minutes) is the product's primary reward
- **Trust** — user-owned fields survive every sync; the tool is predictable and safe
- **Relief** — error messages explicitly confirm data was not modified; no "did it break something?"

## Emotions to Avoid

- **Anxiety** about data loss — sync must feel atomic and safe by design
- **Overwhelm** from visual noise — density must always feel organized, never chaotic
- **Uncertainty** about next action — action chip and clear visual hierarchy eliminate this
- **Friction frustration** — no confirmation dialogs for routine low-stakes decisions

## Design Implications

| Emotional Goal | UX Design Approach |
|---|---|
| Calm, focused control | Muted/neutral base palette; reserved colors carry meaning (score badges only) |
| Sharp efficiency | Tight row height; no wasted whitespace; keyboard-navigable table rows |
| Momentum after applying | Subtle toggle confirmation animation; applied count visible in header/status bar |
| Trust from sync | Sync result message persists until dismissed (not auto-dismissing toast) |
| Informed error handling | Error banner explicitly states "no data was modified" — not just the error type |

## Emotional Design Principles

1. **Reduce ambient anxiety** — every design choice that could introduce uncertainty (ambiguous
   labels, unclear sync state, data loss risk) must be resolved in favor of clarity and safety
2. **Reward decisiveness** — small moments of feedback after each decision (toggle confirms,
   count updates) reinforce that the user is making progress
3. **Never alarm unnecessarily** — visual changes (row aging, color badges) communicate passively;
   they should never feel like warnings or alerts
4. **Familiarity as comfort** — a consistent, predictable layout means the returning user feels
   at home immediately; no relearning, no surprises
