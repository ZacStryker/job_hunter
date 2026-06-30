---
stepsCompleted: [1, 2, 3, 4]
workflow_completed: true
session_active: false
inputDocuments: []
session_topic: 'Reworking the Config menu and child pages for cohesion; top-nav user menu + Notifications dropdown replacing Configured/Incomplete badges'
session_goals: 'Generate ideas for a cohesive config IA, user menu pattern, and a setup-status Notifications system'
selected_approach: 'user-selected (progressive flow)'
techniques_used: ['Mind Mapping', 'Resource Constraints', 'Solution Matrix', 'Six Thinking Hats']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Stryker
**Date:** 2026-06-29

## Session Overview

**Topic:** Cohesive rework of the Config menu and child pages — top-nav user menu + Notifications dropdown replacing the Configured/Incomplete badges, restructured Config IA.

**Goals:** IA/structure, concrete UI patterns, notification logic/states, and edge cases.

**Visual target:** Plex-style settings UI — top-right icon cluster with dropdowns, grouped sidenav with section headers + inline status indicators, flowing grouped content area with quiet per-field Edit affordances. Top-right icon trio: Activity (exists), Notifications (new), User (new).

**Constraints:** Config page structure is flexible (open to restructuring).

## Technique Selection

**Approach:** User-Selected — Progressive Flow

1. **Mind Mapping** — lay out the full Config IA, surface natural groupings.
2. **Resource Constraints** — force prioritization (what earns a slot in the user menu / nav).
3. **Solution Matrix** — map setup tasks × states × surfaces (notification logic).
4. **Six Thinking Hats** — stress-test the design, with Black Hat for edge cases.

**Rationale:** Diverge (IA) → prioritize → systematize (state logic) → harden (edge cases). Mirrors the session's all-of-the-above + edge-cases goal.

## Technique 1 — Mind Mapping (IA + User menu)

**Current state (the trunk):** Config groups by feature area — Profile (Candidate Info, API Keys, Inbox Mapping, Privacy), Job Sources (Auth Setup/LinkedIn, Searches, Blacklist), Prompts (Analyze, Cover Letter, Resume), Logs. Disjointedness: connections are scattered (Inbox under Profile, LinkedIn under Job Sources); the 5 setup tasks span 3 branches.

### Ideas generated

**[IA #1]: The Frequency Split** — Config isn't homogeneous. Separate *set-once-and-forget* (API key, LinkedIn, inbox, prompts) from *operational/living* (Searches, Blacklist). Sorting the top layer by interaction frequency is what makes it "flow." (Revised: keep all in Config, but order the sidenav by frequency rather than graduating hot items out.)

**[IA #2]: Profile-first, descending by traffic** — Sidenav order = Profile (most traffic) → Sources (hot) → Connections (setup) → Prompts (cold) → System. Profile confirmed as a pure settings page, not a dashboard/landing.

**[IA #3]: Consolidate "Connections"** — Pull LinkedIn auth out of Job Sources and inbox connect/mapping out of Profile into a single **Connections** section. Makes Notifications a clean mirror of one section. Sources becomes purely the hot operational stuff (Searches + Blacklist).

**[Menu #1]: User menu = full section jump-list** — User dropdown mirrors every Config section (Profile, Sources, Connections, Prompts, Logs) + Logout. The menu *is* the table of contents; no redundant overview/landing page. Config's sidenav = the "you're already here" version of the same list.

**Label decision:** "Job Sources" → **"Sources"** (calm, settings-like, covers both seek + exclude/blacklist).

### Resulting structure

```
CONFIG sidenav          USER ▾ menu          TOP-RIGHT: Activity · Notifications · User
├─ Profile              ├─ [header] avatar
├─ Sources              ├─ Profile
│   ├─ Searches         ├─ Sources
│   └─ Blacklist        ├─ Connections
├─ Connections          ├─ Prompts
│   ├─ LinkedIn         ├─ Logs
│   ├─ Inbox            ├─ ─────────
│   └─ API Key          └─ Log out
├─ Prompts
└─ System (Logs/Privacy)
```

## Technique 2 — Resource Constraints (Notifications dropdown)

Hard limits used to force priorities on the Notifications dropdown.

**[Notif #1]: Priority-ordered, single dependency** — Incomplete tasks listed in fixed priority order: **1) LinkedIn auth → 2) API key → 3) Profile → 4) Inbox connection → 5) Inbox mapping.** Only dependency: mapping requires connection. Doubles as a guided onboarding path.

**[Notif #2]: Badge celebrates, then rests** — Icon badge shows remaining-task **count** (5→0) while incomplete; flips to **✓/dot** "ready to start" state on final completion until acknowledged, then goes quiet.

**[Notif #3]: Strict scope guardrail** — Notifications = **setup tasks only** now, **announcements** later. NOT runs/errors/matches (that's the existing **Activity** dropdown). Three icons, three non-overlapping jobs: Activity = what happened · Notifications = what needs attention · User = who/where.

**[Notif #4]: Profile required-field threshold** — Profile incomplete until **Name, Email, Phone, Location, Summary, Skills** all present (rest optional, never nags). Enables a precise, testable rule; optional progress nudge `Profile · 4/6 → Complete`.

**[Notif #5]: Show the whole road** — Dependent tasks (Inbox mapping) appear **grayed/disabled** while prerequisite unmet, not hidden. Locked affordance + tooltip ("Connect your inbox first"). User sees full journey up front.

**Per-item anatomy:** `[icon] Label ……… one-word Verb →`, whole row deep-links to the fix page. Verbs: LinkedIn→Connect, API key→Add, Profile→Complete, Inbox→Connect, Mapping→Map.

## Technique 3 — Solution Matrix (task × state × surface)

**[Notif #6]: The fourth state — "broken"** — Tasks regress Complete→broken (expired LinkedIn, revoked/401 API key, disconnected inbox, deleted Gmail label). Broken re-opens the dropdown, badge ticks up. "Ready to start" is **not permanent** — the app can fall out of ready. Notifications becomes the single "what needs my attention" hub (within scope: setup + broken-setup; later announcements).

**[Notif #7]: Setup vs. Alert styling** — Two row types: neutral **setup steps** (Connect/Add/Complete) vs. urgent **alerts** (amber/red, Reconnect/Fix). Different alarm levels for "never did this" vs. "this broke, runs failing."

**[Notif #8]: Item-level sidenav propagation, user-menu stays clean** — Status echoes into Config **sidenav at item level** (`LinkedIn ⚠`) + roll-up dot on parent section header (`Connections ⚠`). **User menu stays dot-free** (fast-travel, not status). Rationale: sidenav seen only when fixing (in-context); user menu glanced from everywhere (avoid ambient anxiety); Notifications icon = the one ambient signal.

**[Notif #9]: Ready-state is a launchpad** — Terminal all-clear state is an **action CTA** ("Start hunting →") that launches a first run, not a passive receipt. Acknowledged empty dropdown rests on quiet "✓ All set" that later hosts announcements.

### Consolidated state matrix

```
TASK            │ Not started │ Partial │ Complete │ Broken (alert)    │ Sidenav dot
────────────────┼─────────────┼─────────┼──────────┼───────────────────┼────────────
LinkedIn auth   │ Connect     │   —     │   ✓      │ Reconnect (amber) │ item-level
API key         │ Add         │   —     │   ✓      │ Fix / invalid     │ item-level
Profile         │ Complete    │  n/6    │   ✓      │   —               │ item-level
Inbox connect   │ Connect     │   —     │   ✓      │ Reconnect         │ item-level
Inbox mapping   │ (locked)    │ partial │   ✓      │ folder/label gone │ item-level
```

## Technique 4 — Six Thinking Hats (stress-test + edge cases)

**⬛ Black Hat — edge cases:**

**[Notif #10]: Required vs. Optional tiers** — Required (gate "ready"): LinkedIn, API key, Profile. Optional (feature-gated): Inbox connect + mapping — skippable/**dismissible**, never blocks ready, re-enable from Connections page. Dismiss affordance exists ONLY on optional rows; required can never be dismissed.

**[Notif #11]: Optionals gate the celebration** — Ready-to-start CTA does not appear until every optional is resolved OR dismissed — avoids the "celebrate + still-to-do" hybrid. Flow: clear required → dot reminds of optionals → connect/dismiss each → dropdown flips to clean "Start hunting →" launchpad. Dismissal *earns* the celebration.

**[Notif #2 — REVISED]: Badge is a signal, not a counter** — Badge **never shows a number** (count lives inside the dropdown). Icon carries a **dot**: solid/colored dot = required or broken (urgent); faint dot = optional-only pending; nothing when all resolved (brief ✓ on final completion). Less chrome noise; scales when announcements arrive.

**[Notif #12]: Live + proactive truth** — State is **reactive** (any successful mutation anywhere updates instantly — shared source of truth, no stale phantoms) AND broken-states are **proactively health-checked** in background (periodic validity pings: LinkedIn token, API key, inbox token, mapping target). 2am expiry surfaces before a failed run. Needs: setup-status store the UI subscribes to + background connection-health job.

**🟨 Yellow (payoff):** Kills the "disjointed" problem — 3 icons, 3 non-overlapping jobs; one source of truth for attention; setup becomes a launchpad. Notifications = onboarding + health-monitoring in one low-surface component.

**🟩 Green [REFINED]: Progress meter, setup only** — Slim meter (`Setup 2/3 required`) only for first-time setup (finishable journey). Broken-config alerts get NO meter (discrete fix, not a step).

**🟦 Blue (build sequence):** (1) setup-status store + health checks → (2) Notifications dropdown → (3) 3-icon cluster + User menu → (4) Config IA restructure (Connections consolidation, frequency ordering).

## Idea Organization and Prioritization

### Thematic Organization

**Theme 1 — Information Architecture (the skeleton):** IA #1 frequency split, IA #2 profile-first descending by traffic, IA #3 consolidate Connections, label "Job Sources → Sources."

**Theme 2 — Navigation Surfaces (the chrome):** 3-icon cluster (Activity = what happened · Notifications = what needs you · User = who/where); Menu #1 user menu = full section jump-list + Logout, no status dots; sidenav carries item-level + section roll-up status dots.

**Theme 3 — Notifications Logic (the brain) ⭐:** #1 priority order, #3 strict scope (setup now / announcements later / never runs), #4 profile 6-field threshold, #5 show-the-whole-road (locked dependent rows), #6/#7 broken 4th state + setup-vs-alert styling, #10/#11 required vs optional tiers + optionals gate celebration, #2 badge = dot signal (never a number), #9 ready-state launchpad CTA, Green progress meter (setup only).

**Theme 4 — Implementation Substrate (the plumbing):** #12 reactive state + proactive background health-checks; setup-status store + connection-health job.

### Breakthrough concept

Reframing the **Notifications dropdown** from a one-time onboarding checklist into a **persistent "what needs my attention" hub** — onboarding + connection-health monitoring in one low-surface component. This single shift is what dissolves the "disjointed" feeling: three icons each own one crisp, non-overlapping job.

### Prioritized build sequence (user-confirmed)

1. **Config IA restructure FIRST** — Consolidate Connections (pull LinkedIn auth out of Job Sources, inbox connect/mapping out of Profile), reorder sidenav by frequency (Profile → Sources → Connections → Prompts → System), rename "Job Sources → Sources." *Lowest risk; immediately calms the menu; gives the notification engine a clean Connections section to mirror.*
2. **Setup-status store + proactive health checks** — Reactive shared source of truth + background validity pings (LinkedIn token, API key, inbox token, mapping target).
3. **Notifications dropdown** — Priority-ordered tasks, required/optional tiers, locked dependent rows, setup-vs-alert styling, dot badge, progress meter (setup only), launchpad CTA.
4. **3-icon cluster + User menu** — Activity (exists) · Notifications · User; user menu = section jump-list + Logout; sidenav status-dot propagation (item + section roll-up).

## Session Summary and Insights

**Key achievements:**

- A frequency-ordered, mental-model-based Config IA replacing the feature-area grouping that felt disjointed.
- Three top-right icons with three non-overlapping jobs (eliminating the Configured/Incomplete badges).
- A rigorous Notifications spec covering priority order, a 4th "broken" state, required/optional tiers, dependency locking, dot-only badging, status propagation rules, and a launchpad ready-state.
- A user-confirmed build sequence leading with the low-risk IA restructure.

**Decisions locked this session:**

- "Job Sources" → **"Sources"**; Profile is a pure settings page (most traffic, top of nav).
- User menu mirrors all Config sections + Logout; **no** status dots in the user menu.
- Status dots propagate to the **sidenav at item level** (+ section roll-up), not the user menu.
- Notifications scope = setup tasks now, announcements later; runs/errors stay in **Activity**.
- Required tier (gates "ready"): LinkedIn, API key, Profile (Name/Email/Phone/Location/Summary/Skills). Optional/dismissible: Inbox connect + mapping.
- Badge = dot (never a number); optionals must be resolved/dismissed before the "Start hunting →" CTA appears.
- State derived **reactively**; broken connections **proactively health-checked** in the background.

**Session reflections:** A fast, decisive session — the user's single highest-leverage contribution was introducing the **frequency-of-use axis** ("don't bury Searches/Blacklist beneath Prompts"), which reshaped the entire IA. Each technique handed off cleanly to the next: Mind Mapping set the skeleton, Resource Constraints forced the notification priorities, Solution Matrix exposed the missing "broken" state, and Six Thinking Hats hardened the required/optional tiers and the live/proactive data model.
