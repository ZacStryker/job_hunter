---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Dashboard redesign — replace low-impact KPIs/charts with high-impact ones; surface usage, pipeline funnel, and time-saved (HITLobster vs manual)'
session_goals: 'Identify high-impact KPIs/visuals to replace vanity metrics; improve dashboard structure; land on a concrete recommended layout + KPI list'
selected_approach: 'progressive-flow'
techniques_used: ['Role Playing', 'Mind Mapping', 'First Principles Thinking', 'Solution Matrix']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Stryker
**Date:** 2026-06-18

## Session Overview

**Topic:** Review dashboard page sections to replace low-impact KPIs/charts with high-impact ones; open to structural improvements. Goal: a dense but clear snapshot of usage, pipelines, and time saved using HITLobster vs manual.

**Goals:** Identify high-impact KPIs/visuals to replace vanity metrics; improve dashboard structure; optionally land on a concrete recommended layout + KPI list.

### Current Dashboard (baseline, from dashboard.tsx + api-stats.ts)

2-column grid of 4 sections, each with 3 stat cards + up to 2 charts; filtered by period (24h/7d/30d/all) and active/archived.

| Section | Stat cards | Chart 1 | Chart 2 |
|---|---|---|---|
| Automations | Workflow Runs · Tokens · Cost | Workflows/day by type | Cost by workflow |
| Jobs | Jobs · Companies · Sources | Jobs/day by source | Source breakdown |
| Matches | Matches · Investigate · Apply | Matches/day by rec | Score breakdown |
| Applications | Applications · Companies · Responses | Apps/day by response type | Status breakdown |

Initial diagnosis: descriptive but not insightful — shows volume per stage, not conversion, velocity, or value delivered. Sections are siloed (no connected funnel). Vanity-ish cards: Tokens, Companies (x2), Sources.

### Session Parameters (user answers)

1. **5-second question:** "How is my job search going?" — the dashboard's north star.
2. **Time-saved baseline:** No baseline yet — derive it during the session.
3. **Structure:** Open to re-architecture (not constrained to the current 4-quadrant grid).
4. **Output:** A concrete recommended layout + KPI list (hand-off ready).

### Hard Constraint — Messages mapping going away

The **messages** section/table is being deprecated for standard users; message-derived application status will be **replaced by manual status toggling from the job drawer** (out of scope for this session, but binds our decisions).

Implications:
- Application status (Submitted/Rejected/Screening/Interview/Offer/Responses) becomes a **manually-maintained job field**, not auto-detected.
- Later-funnel KPIs are only as complete as the user's manual upkeep → dashboard must **degrade gracefully** and likely **nudge** users to update status.
- Don't design KPIs that *assume* rich, auto-populated response data.

### Hard Constraint — Cost must survive the restructure

Some form of **cost info must remain** after the redesign (currently: Cost stat card + Cost-by-workflow bar). Carry forward in the new layout.

## Phase 1 — Expansive Exploration (Role Playing)

### 😰 Anxious Applicant — "Am I doing enough? Am I stalling?"

- **[A1] Days-since-last-application counter** ✅ KEEP — big number, green<3 / amber 3–7 / red>7. Answers "am I stalling?" Fills a current gap.
- **[A2] Activity heatmap** (GitHub-style calendar, intensity = apps + matches reviewed/day) ✅ KEEP — momentum made visceral.
- **[A3] "This week vs. your average" delta chips** ❌ KILL — risks negative validation when a user returns from a break; penalizes time off.
- **[A4] Pipeline freshness** — count of active applications with no movement in 14+ days ✅ KEEP — gentle "follow up or close out" nudge.
- **[A5] "Next action" card** ✅ KEEP (refined) — example "X matches marked Apply still unapplied" is good. The "update status" nudge must include a **reason/guidance** (why this job needs updating), not a bare prompt — otherwise it confuses. Doubles as the manual-status-upkeep nudge.
- **[A6] One-line plain-language reassurance summary** ✅ KEEP — "You've applied to 23 roles across 6 weeks — that's an active search."

### 📈 Optimizer — "Where's my funnel leaking? Next highest-leverage move?"

- **[O1] Horizontal funnel bar (HERO viz)** ✅ KEEP — Scraped → Matched → Applied → Response → Interview → Offer, count + conversion % between stages. Connects the 4 siloed sections into one story. Directly answers the north star.
- **[O2] Match quality rate** ✅ KEEP — % of scraped jobs that became Apply-grade. Signals sourcing on-target vs. noise. Upgrades vanity "Sources".
- **[O3] Apply→Response rate** ✅ KEEP — display with honest denominator phrased as **"of 12 replies"**. Depends on manual status.
- **[O4] Fit-score vs. outcome overlay** ✅ KEEP — do high-fit-score matches convert better? Validates the AI scoring is predictive = strong HITLobster credibility metric. Upgrades static score-bucket bar.
- **[O5] Stage-aging / time-in-stage** ✅ KEEP (with data caveat) — median days per stage. NOTE: full per-stage aging needs per-stage timestamps; with messages gone we likely only have dateScraped + dateApplied, so may reduce to "days since applied with no response." Confirm in Phase 3.
- **[O6] "Biggest leak" callout** ❌ KILL — naming the worst stage is discouraging; conflicts with reassurance goal.
- **[O7] Source effectiveness (conversion, not count)** ✅ KEEP — which source yields best Apply-rate / response-rate, so user knows where to spend sourcing energy. Upgrades vanity "Source breakdown".

### 💸 ROI Skeptic — "Is HITLobster worth it vs. manual?"

- **[R1] "Time saved" hero stat** ✅ KEEP — Σ(runs/workflow × manual-min/task) → "≈ 38 hours saved." The headline time-saved ask. Manual-min derivation in Phase 3.
- **[R2] Time-saved vs. cost side-by-side** ✅ KEEP — "38 hrs saved · $4.20 spent." Reframes cost as the price of time; satisfies the cost-survival constraint.
- **[R3] Effective hourly rate / leverage ratio** ❌ KILL.
- **[R4] Cumulative time-saved area chart** ✅ KEEP — compounding value up-and-to-the-right; replaces tokens trend.
- **[R5] Time-saved breakdown by workflow** ✅ KEEP — evolved form of current "cost by workflow" bar; shows which automation earns its keep.
- **[R6] "Manual equivalent" reframe on volume stats** ❌ KILL.
- **[R7] Demote tokens** ✅ KEEP — tokens is a vanity/eng metric; fold behind a data toggle or drop. Cost stays.
- **[R8] Cost-per-outcome** ✅ KEEP — $ ÷ applications (or ÷ responses): "each application cost $0.18 of AI." Ties spend to results.

**Phase 1 running total (personas): 21 ideas, 15 kept.** Manual-minutes-per-task numbers (for R1) still TBD → Phase 3.

### Structural / IA lens

- **[S1] Inverted pyramid (headline → evidence → detail)** ✅ KEEP — chosen top-level frame. Hero answers on top, supporting KPIs middle, detailed per-day charts collapsed at bottom.
- **[S2] Funnel-as-spine** ❌ KILL.
- **[S3] Persona tabs (Momentum/Pipeline/Value)** ❌ KILL — hides data, fights dense-snapshot goal.
- **[S4] One "answer sentence" hero** ✅ KEEP — full-width natural-language status line synthesizing momentum + funnel + time-saved. Literally answers "how's it going?" before any chart.
- **[S5] Stat card + inline sparkline** ✅ KEEP — density without separate full charts; lets many per-day charts retire.
- **[S6] Period filter folded into the hero headline** ✅ KEEP — "…this month" as part of the answer, not a separate button row.

### "What's missing" sweep

- **[M1] Goal / target setting** ❌ KILL.
- **[M2] Interview/offer celebration moment** ✅ KEEP — mark the win, emotional payoff.
- **[M3] "Matches waiting for you" CTA** ✅ KEEP — unreviewed Apply-grade matches = highest-leverage unstarted work; drives core loop.
- **[M4] Empty / early-state design** ✅ KEEP — day-one "how's it going?" = onboarding nudge, not sad zeros.

**Phase 1 GRAND TOTAL: 31 ideas, 22 kept.** Resolved structural frame = S1 inverted pyramid.

## Phase 2 — Pattern Recognition (Mind Mapping)

Branches off "How is my job search going?":

- **MOMENTUM** (active?) — A1 days-since-last-app, A2 heatmap, A4 freshness/stale → **Tier 0 fuel** (feeds Hero Sentence + Next-Action), not its own Tier-1 section.
- **NEXT-ACTION** (do what?) — merged A5 + M3 → **Next-Action card** with "X matches waiting" as top line.
- **FUNNEL & CONVERSION** — O1 funnel (HERO), O2 match-quality, O3 apply→response, O5 stage-aging, O7 source-effectiveness.
- **MATCH QUALITY / AI CREDIBILITY** — O4 fit-score vs outcome (O2 doubles here).
- **VALUE / ROI** — R1 time-saved (HERO), R2 time-vs-cost, R4 cumulative, R5 by-workflow, R8 cost-per-outcome, R7 demote tokens.
- **EMOTION** — M2 celebrate win.
- **CROSS-CUTTING PRESENTATION** — S1 pyramid, S4 answer-sentence, S5 sparklines, S6 filter-in-hero, M4 empty-state.

**Merges (confirmed):**
1. A6 + S4 → **Hero Sentence** (one full-width plain-language synthesis line).
2. A5 + M3 → **Next-Action card** ("X matches waiting" = top item).
3. O2 counted once (in Funnel), doubles as AI-credibility next to O4.

**Emergent pyramid tiers:**
- **Tier 0 (the answer):** Hero Sentence + Next-Action card (fed by Momentum signals A1/A2/A4).
- **Tier 1 (the evidence):** Funnel [O1] + Time-Saved [R1/R2] — the two big questions.
- **Tier 2 (the detail):** O3, O4, O5, O7, R4, R5, R8, A2 heatmap — drillable.

## Phase 3 — Idea Development (First Principles Thinking)

### Data feasibility findings (grounded in schema.ts)

- **`statusEvents` table** `{jobId, status, timestamp, source:'manual'}` records per-status timestamps from manual toggles → resolves prior caveats:
  - **O5 stage-aging FULLY VIABLE** (true time-in-stage from statusEvents, not messages).
  - **Funnel late stages survive messages deprecation** (jobs.status + statusEvents are user-owned).
  - **O4 fit-vs-outcome viable** (fitScore + final status both present).
- Time-saved has two data sources: artifact-level (`dateAnalyzed`, `coverLetters` rows, `resumeGeneratedAt`) for *time*; `webhookRuns` for *cost*. Use both.
- Relevant jobs fields: dateScraped, dateAnalyzed, fitScore, recommendation, applied, status, statusOverride, dateApplied, coverLetterSentAt, resumeGeneratedAt, archived.

### Time-Saved model — CONFIRMED

- **Method: NET** (manual baseline − residual review effort). No qualifying tooltip needed; number stands alone.
- Formula: `time_saved = Σ (count_task × net_minutes_task)`

| Task | Manual | Residual | **Net/task** | Count source |
|---|---|---|---|---|
| Source/triage | 3 | 0 | **3 min** | jobs scraped |
| Analyze fit | 5 | 1 | **4 min** | dateAnalyzed set |
| Cover letter | 5 | 0.25 | **4.75 min** | coverLetters rows |
| Resume | 15 | 0.75 | **14.25 min** | resumeGeneratedAt set |

Sanity (300/200/40/25): 900+800+190+356 = 2,246 min ≈ **37.4 hrs net**. Cost (R2) shown beside it.

## Phase 4 — Action Planning (Solution Matrix → final design)

Scored on Impact / Data-reliability (★ system-owned, ▲ depends on manual status) / Effort.

**Reliability-gating rule (emergent, important):** every ▲ metric (anything needing manual status — funnel late stages, O3, O4, O5, O7, A4) shows only when enough status data exists; otherwise a gentle *"Set application statuses to unlock conversion/response insights"* nudge. This turns the messages-deprecation risk into the **driver of manual-status adoption** and is the honest rationale behind the A5 nudge.

### Final tier assignment

- **Tier 0 — The Answer:** Hero Sentence (A6+S4, period folded in via S6) · Next-Action card (A5+M3).
- **Tier 1 — The Evidence:** Funnel (O1, full-width spine) · Value panel = Time-Saved (R1) + Cost (R2) · **Fit-score-vs-outcome (O4) — PROMOTED to Tier 1** as the AI-credibility proof (gated) · stat-card row w/ sparklines (S5): Days-since-last-app (A1), Match-quality rate (O2), Cost-per-application (R8).
- **Tier 2 — The Detail (collapsed/drillable):** Apply→response (O3, gated) · Source effectiveness (O7, gated) · Stage-aging (O5, gated) · Activity heatmap (A2) · Cumulative time-saved (R4) · Time-saved by workflow (R5).
- **Behaviors:** inverted pyramid (S1) · empty/early-state (M4) · interview/offer celebration (M2) · tokens demoted behind a "data" toggle (R7).

### Recommended layout (inverted pyramid)

```
TIER 0 — THE ANSWER                                   [period: month ▾]  (S6)
  🟢 Hero Sentence (S4+A6): "Active search — 4 applications this month.
     Pipeline converting at 18%. HITLobster saved you ~37 hrs ($4.20)."
  ▶ Next-Action (A5+M3): "3 Apply-grade matches waiting · 2 apps idle 14d+"

TIER 1 — THE EVIDENCE
  [ Funnel (O1) — Scraped→Matched→Applied→Response→Interview→Offer + conv % ]  (full width)
  [ Value: ⏱37.4 hrs saved · 💸$4.20 (R1+R2) ]  [ Fit-score vs outcome (O4, gated) ]
  [ Days-since-app (A1) | Match-quality (O2) | Cost/app (R8) ]  + sparklines (S5)

TIER 2 — THE DETAIL (collapsed)
  Apply→response (O3) · Source effectiveness (O7) · Stage-aging (O5) ·
  Activity heatmap (A2) · Cumulative saved (R4) · Time-saved by workflow (R5)

Behaviors: empty-state (M4) · win celebration (M2) · tokens behind data toggle (R7)
```

### Retired from today's dashboard
Tokens card (demoted) · raw Companies×2 & Sources counts (→ conversion-grade metrics) · the four siloed per-day stacked-area charts (→ Tier-2 drill-ins / sparklines) · the flat 4-quadrant grid (→ inverted pyramid).

### Final KPI list (hand-off)

**Tier 0**
1. Hero Sentence — NL synthesis of activity + conversion + time-saved (★ degrades gracefully)
2. Next-Action card — unreviewed Apply matches + idle/stale applications, each with a reason (★)

**Tier 1**
3. Funnel with stage conversion % — Scraped→Matched→Applied→Response→Interview→Offer (★ early / ▲ late, gated)
4. Time-Saved (net hrs) + Cost, side by side (★)
5. Fit-score vs outcome — does higher fit convert better? AI-credibility proof (▲ gated)
6. Days-since-last-application — green<3 / amber 3–7 / red>7 (★)
7. Match-quality rate — % scraped that became Apply-grade (★)
8. Cost-per-application (★)

**Tier 2 (drill-in)**
9. Apply→response rate ("of N replies") (▲ gated)
10. Source effectiveness — conversion by source (▲ gated)
11. Stage-aging — median days in stage, from statusEvents (▲ gated)
12. Activity heatmap — calendar intensity (★)
13. Cumulative time-saved over time (★)
14. Time-saved by workflow (★)

**Time-Saved model:** NET. Per-task net minutes — source 3 · analyze 4 · cover letter 4.75 · resume 14.25. Counts from jobs scraped / dateAnalyzed / coverLetters rows / resumeGeneratedAt. Cost from webhookRuns.

**Cross-cutting:** reliability-gating on all ▲ metrics (doubles as manual-status adoption driver); inverted-pyramid IA; sparklines for density; empty/early state; interview/offer celebration; tokens demoted.
