---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Locally hosted job hunt tracking dashboard using Google Sheets and email as data sources, with n8n integration'
session_goals: 'Identify best tech stack(s), data flow patterns, UI/UX approaches, and integration strategies'
selected_approach: 'user-selected'
techniques_used: ['Mind Mapping']
ideas_generated: 44
context_file: ''
session_active: false
workflow_completed: true
---

# Brainstorming Session Results

**Facilitator:** Stryker
**Date:** 2026-03-26

## Session Overview

**Topic:** Locally hosted job hunt tracking dashboard using Google Sheets and email as data sources, with n8n integration
**Goals:** Identify best tech stack(s), data flow patterns, UI/UX approaches, and integration strategies

### Session Setup

_Fresh session. User has a clear concept: a locally hosted web dashboard that reads job data from Google Sheets, searches email for application status, displays a detail view per record, and integrates with n8n to trigger a cover letter workflow. Open to tech stack exploration._

## Technique Selection

**Approach:** User-Selected Techniques
**Selected Techniques:**

- **Mind Mapping**: Branch ideas visually from "Job Hunt Dashboard" as the central concept to discover connections, relationships, and opportunities across data, UI, tech stack, and integrations.

**Selection Rationale:** Mind Mapping chosen to get a comprehensive lay of the land before diving deeper — surfaces the full problem space including data flow, UI concepts, stack options, and integration patterns.

## Technique Execution Results

**Mind Mapping — Job Hunt Dashboard**

- **Interactive Focus:** Branched systematically across Data Model, Architecture, Tech Stack, UI/Layout, Detail View, Cover Letter Integration, Sheets Sync, and Local Runtime
- **Key Breakthroughs:** Pre-scored dossier framing; compound key email matching; mutable field ownership boundary between Sheets and SQLite; visual aging as implicit ghosting signal; n8n as universal intake boundary
- **Energy Level:** Focused and decisive — user locked in key decisions cleanly throughout

### Creative Facilitation Narrative

_Stryker arrived with a clear product vision and sharp instincts. The session moved efficiently from data model discovery through architecture decisions to UI and integration patterns. Key creative moments: reframing the dashboard as a "decision surface on top of already-intelligent data" (not a tracker), identifying IMAP polling as a simplification rather than a limitation, and the visual aging concept for the Tracker view. Stack decisions were made confidently and early, freeing the rest of the session to focus on UX and integration design._

### Session Highlights

**User Creative Strengths:** Clear product thinking, strong instincts on data ownership, decisive on tradeoffs
**AI Facilitation Approach:** Question-driven branch exploration, progressive locking of decisions, explicit inventory of remaining territory
**Breakthrough Moments:** Compound key email matching; mutable fields protection; visual ghosting via row aging; n8n `/ingest` as universal intake
**Energy Flow:** High focus throughout, clean decisive responses, no backtracking

## Idea Organization and Prioritization

### Theme 1: Data Model & Intelligence Layer
*The schema and state machine that drives everything*

- **Pre-Scored Job Dossier** — Claude's fit score, reqs met/missed, and skip/investigate/apply recommendation baked into every record before it hits the UI. The dashboard is a decision surface, not a decision maker.
- **Dual-Source Status Layer** — Applied (boolean) + Status (email-detected, manually overridable). Two write paths, one source of truth in SQLite.
- **Compound Key Email Matching** — `[company + job title + applied date]` ties email events to job records. Simple, robust, no UUID needed. Consider ±1 day fuzzy window for edge cases.
- **Mutable Fields Protection** — Sheets owns scraped/scored columns. SQLite owns `applied`, `status`, `status_override`, `cover_letter_sent_at`. Sync never clobbers dashboard state.

### Theme 2: Architecture & Data Flow
*How data moves through the system*

- **IMAP Polling via n8n** — Standard IMAP credentials, n8n's native email trigger node. No OAuth, no Pub/Sub, no public endpoint needed. privateemail.com simplifies everything.
- **Event-Triggered Polling (hybrid)** — n8n wakes up a poller on webhook rather than processing raw events. Near-real-time without full event-driven complexity.
- **IMAP IDLE upgrade path** — Persistent TCP connection for push-like behavior. Small custom script if n8n doesn't support it natively. Optional future enhancement.
- **On-Demand Sheets Sync** — Manual "Sync" button triggers Sheets API → SQLite upsert. Simple and intentional.
- **Google Sheets Change Trigger** — Apps Script fires on row edit, POSTs to n8n webhook, which forwards to Hono `/ingest`. Near-real-time sync for free.
- **n8n `/ingest` as Universal Intake** — Any source that can POST JSON can feed the dashboard. Future-proofed intake boundary.

### Theme 3: Tech Stack
*Locked decisions*

- **Bun runtime** — Single runtime for everything. Native SQLite, native `.env`, native bundler.
- **Hono API server** — Ultralight, Bun-native, RPC mode for end-to-end type safety.
- **React + Vite + shadcn/ui + Tailwind v4** — Modern, well-documented, component-rich.
- **SQLite via `bun:sqlite` + Drizzle ORM** — SQL-first, fully typed, single file on disk.
- **Hono serves static bundle** — One process, one port in production. `bun start` = entire app.
- **SQLite migration on boot** — Self-bootstrapping. `bun install && bun start` = full setup.
- **`.env` config** — IMAP creds, Sheets API key, n8n webhook URL, callback secret. Bun loads natively.

### Theme 4: UI & Layout
*What Stryker actually looks at*

- **Triage Table (Pipeline view)** — Dense TanStack Table. Columns: Score · Action · Company · Title · Source · Posted Date · Age. Color-coded fit score badge (red/yellow/green). shadcn/ui + TanStack Table.
- **Fit Score as Ambient Signal** — Colored left border or badge. You absorb the signal before reading. Full-red = skip without thinking.
- **Claude Action Chip** — `skip | investigate | apply` as colored chip alongside score. AI recommendation visible at a glance.
- **Tracker View** — Swaps Action column for Status, adds Applied Date + Days Since Apply. Jobs age visually — no explicit "ghosted" status needed, entropy communicates it.
- **Cover Letter Status Icon** — Small envelope icon in table row. Present = letter generated. Absent = not yet. Clicking opens drawer to cover letter section.
- **Column Visibility Toggle** — Hidden by default: Reqs Met count, Reqs Missed count, Notes. Saved to localStorage.

### Theme 5: Detail Drawer
*The single-record deep dive*

- **Right-Side Drawer (shadcn `<Sheet>`)** — Slides open on row click. Table stays visible and in context. Zero custom work.
- **Drawer Contents** — Fit score breakdown, reqs met/missed lists, Claude's explanation, job description, source URL, status timeline, email matches, Generate Cover Letter button.
- **Status Timeline** — Vertical timeline of events: source (email vs. manual) + timestamp. Auditable, overridable. Makes email detection tangible.

### Theme 6: Cover Letter Integration
*The n8n workflow*

- **Webhook Trigger** — Dashboard POSTs job record JSON to n8n webhook. Clean separation — dashboard doesn't know how generation works.
- **4-Stage n8n Pipeline** — Webhook → Claude extracts/normalizes job data to JSON → Claude generates letter (experience in prompt) → Email letter to Stryker.
- **Pass Pre-Extracted Data** — Send existing Sheets analysis to n8n instead of raw text. Avoids paying Claude twice for the same extraction.
- **Synchronous Fire-and-Wait** — Simplest pattern. n8n holds HTTP response open until done. Totally sufficient for a personal tool.
- **SSE Streaming upgrade path** — Hono `streamSSE` + n8n callback for token-by-token rendering. Future enhancement if spinner feels too passive.
- **Cover Letter Persistence** — Store generated letter in SQLite against the job record. Regenerate button. Version history optional.
- **n8n Callback to Hono** — After emailing, n8n POSTs `{ jobId, generatedAt, status: "sent" }` to Hono. Dashboard updates record, shows "✉ sent Mar 26" in drawer and row.
- **Email as Body + Attachment** — Letter in body for mobile reading, `.md` attachment for submitting. Subject: `[Cover Letter] Acme Corp — Senior Engineer`.

### Theme 7: Runtime & Local Hosting
*How the app lives on your machine*

- **`bun start` = everything** — Hono serves both API and built React bundle. One port, one process, one bookmark.
- **`bun run dev` = split processes** — Vite dev server + Hono API for development. Hot reload on both sides.
- **pm2 for always-on** — Optional. Only needed if you want n8n callbacks to land when the dashboard isn't open. `pm2 start bun -- start`.

---

## Prioritization Results

**Top Priority — Core loop (build first):**
1. Bun + Hono + SQLite + Drizzle scaffold
2. Google Sheets sync → SQLite ingest via `/ingest` endpoint
3. Pipeline table view with color-coded score/action chips
4. Detail drawer with full job record
5. Manual applied flag + status field with override

**Quick Wins — High value, low effort:**
- Fit score color-coded badge (CSS only)
- Visual row aging in Tracker view (CSS + date math)
- Column visibility toggle (TanStack Table built-in)

**Breakthrough Concepts — After core works:**
- Google Sheets Apps Script change trigger for near-real-time sync
- n8n IMAP polling → compound key matching → status update pipeline
- Cover letter n8n workflow with Hono callback and drawer status update

---

## Action Planning

### Phase 1: Scaffold (Day 1)
1. `bun create` new project, install Hono, Drizzle, React, Vite, shadcn/ui, Tailwind v4
2. Define SQLite schema: `jobs` table (Sheets columns + `applied`, `status`, `status_override`, `cover_letter_sent_at`)
3. Drizzle migrations on boot
4. `.env.example` with all config keys documented
5. Hono `/ingest` endpoint accepting job JSON array, upsert logic with mutable field protection

### Phase 2: Data In (Day 1–2)
1. Google Sheets API integration — fetch all rows, map to job schema, POST to `/ingest`
2. "Sync" button in dashboard header
3. Verify upsert doesn't clobber applied/status fields

### Phase 3: Pipeline View (Day 2–3)
1. TanStack Table with shadcn/ui styling
2. Color-coded fit score badge component
3. Action chip component (skip/investigate/apply)
4. Column visibility toggle saved to localStorage
5. Row click opens shadcn `<Sheet>` drawer

### Phase 4: Detail Drawer (Day 3)
1. Drawer layout: score breakdown, reqs met/missed, explanation, job description, source URL
2. Applied toggle (writes to SQLite)
3. Status field with manual override
4. Status timeline component

### Phase 5: n8n Integrations (Day 4–5)
1. IMAP email trigger in n8n → compound key matching → POST status to Hono `/status` endpoint
2. Cover letter webhook in n8n — 4-stage pipeline (receive → extract → generate → email)
3. n8n callback to Hono `/cover-letter-sent` endpoint
4. Dashboard reflects cover letter status in drawer and table row

---

## Session Summary and Insights

**Key Achievements:**
- 44 ideas generated and organized across 7 themes
- Full stack decided: Bun + Hono + React + shadcn/ui + SQLite + Drizzle
- Complete data flow mapped from Google Sheets → SQLite → UI → n8n → email
- Clear 5-phase build plan with day estimates

**Key Insights:**
- The dashboard is a *decision surface on pre-scored data*, not a scoring tool — this shapes the entire UI philosophy
- IMAP on privateemail.com is simpler than Gmail integration, not harder — no OAuth, no cloud setup
- The mutable/immutable field ownership boundary between Sheets and SQLite is the most important architectural decision — get this right and syncing is safe forever
- Visual aging (row opacity/color over time) eliminates the need for an explicit "ghosted" status — design communicates state passively

**Next Recommended BMad Skill:** `bmad-create-prd` — use this session document as grounding context to produce a full Product Requirements Document for the dashboard.
