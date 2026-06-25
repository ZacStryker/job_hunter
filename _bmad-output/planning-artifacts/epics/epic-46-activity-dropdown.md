# Epic 46: Global Activity Dropdown — Live Workflow Visibility

## Epic Goal

From anywhere in the app, a user can see at a glance whether any background workflow (Discovery, Analysis, Cover Letter, or Resume) is running and how far along it is, via a persistent top-bar "Activity" control that animates while work is in progress and opens a Plex-style dropdown listing each active run with live, per-item progress — delivered by a server-side per-user run registry and a user-scoped SSE push stream, with a standing link out to the full Logs history.

**FRs covered:** FR1–FR15
**NFRs covered:** NFR1–NFR6
**UX-DRs covered:** UX-DR1–UX-DR5

**Out of scope:** No changes to how any of the four workflows do their actual work (discovery, scoring, PDF/LLM generation). No changes to the Logs page (`/config/logs`) itself — the dropdown only links to it. This feature is the live, in-progress view; Logs remains the full workflow history.

**Architecture note (decided):** Live state is delivered via SSE push, not polling. A central in-progress run registry on the server is the single source of truth per user; the four workflows register/report/finalize against it; a `GET /api/activity/stream` endpoint emits a snapshot on connect and pushes on every registry change; a client `useActivityStream` hook backed by `EventSource` drives the top-bar indicator and dropdown. All workflow wiring happens at the route-handler layer (`api-webhooks.ts`, `api-jobs.ts`), so no service internals change.

---

## Story 46.1: In-Progress Run Registry & Shared Activity Types

As a developer building the Activity feature,
I want a single per-user, in-memory registry of currently-active workflow runs with a shared type contract,
So that every workflow can report start/progress/finish to one place and the SSE layer has one source of truth.

**Acceptance Criteria:**

**Given** the shared schema module `src/shared/schemas.ts`
**When** the activity types are defined
**Then** it exports Zod schemas (named `*Schema`) for `activityRunType` (`'discovery' | 'analysis' | 'cover_letter' | 'resume'`), `activityRunState` (`'running' | 'done' | 'failed'`), and `activityRun` (fields: `id` string, `type`, `state`, `startedAt`/`updatedAt` ISO-8601 strings, and a progress payload carrying `count`/`total` for discovery & analysis and `company`/`role` for cover_letter & resume)
**And** the corresponding TypeScript types are exported via `z.infer` — with no inline redefinition of these shapes anywhere else

**Given** a new registry module (e.g. `src/server/services/activity-registry.ts`)
**When** `register({ userId, type, progress })` is called
**Then** it creates a run with a unique `id`, `state: 'running'`, timestamps set, stores it scoped to that `userId` only, and returns the `id`

**Given** an active run id
**When** `progress(id, payload)` is called
**Then** the run's progress payload and `updatedAt` are updated and a change is emitted to subscribers

**Given** an active run id
**When** `finalize(id, 'done')` or `finalize(id, 'failed')` is called
**Then** the run's `state` becomes `done`/`failed`, `updatedAt` is set, a change is emitted, and the run is pruned from the active set after a short retention window so completion is observable before it drops out

**Given** two different users each with active runs
**When** `snapshot(userId)` is called
**Then** it returns only that user's runs as an array — never another user's

**Given** the registry
**When** subscribers register via `subscribe(userId, listener)`
**Then** the listener is invoked on every start/progress/finalize for that user, and `unsubscribe` stops further calls — verified by `bun:test` unit tests co-located beside the module

---

## Story 46.2: User-Scoped SSE Stream Endpoint

As an authenticated user,
I want a server-sent-events stream of my active runs,
So that any open tab can receive live workflow state without polling.

**Acceptance Criteria:**

**Given** a new route module mounted at `/api/activity` in `src/index.ts` (under the existing `app.use('/api/*', authMiddleware)`)
**When** `GET /api/activity/stream` is requested with a valid session cookie
**Then** the response is `Content-Type: text/event-stream` and the user id is taken from `c.get('userId')` — never from the request body or query

**Given** the stream has just connected
**When** the first event is sent
**Then** it is a `snapshot` event whose data is the caller's current active runs (validates against `activityRunSchema[]`)

**Given** the connection is open
**When** the registry emits a change for that user (start, progress, finalize)
**Then** an event is pushed to that client carrying the updated run(s) — and a client of a different user never receives it

**Given** an idle open connection
**When** no changes occur for the keepalive interval
**Then** a heartbeat comment line is written so the connection is not dropped

**Given** the client disconnects (tab closed or navigates away)
**When** the request is aborted
**Then** the endpoint unsubscribes its registry listener and frees the connection — no leaked subscribers (assertable in a contract test)

**Given** an unauthenticated request to `/api/activity/stream`
**When** it is made
**Then** it is rejected by the existing auth middleware with the standard error shape `{ error: string }` and appropriate status — no stream is opened

---

## Story 46.3: Wire Discovery & Analysis Into the Registry

As a user who started Discovery or Analysis,
I want those runs to report live counts to the registry,
So that the Activity dropdown shows "N jobs discovered/analyzed so far" from any page.

**Acceptance Criteria:**

**Given** `POST /api/webhooks/discovery` in `api-webhooks.ts`
**When** the run starts
**Then** a `discovery` run is registered before `runDiscovery(...)` is invoked, and the existing per-request `stream(...)` / `recordRun(...)` behavior is unchanged

**Given** Discovery's existing `(count, source)` jobs-ready callback
**When** it fires during the run
**Then** the registry run's progress `count` reflects the running total of inserted jobs across sources (live)

**Given** `POST /api/webhooks/analysis`
**When** it starts and emits `Analyzing ${i} / ${total}: …` progress messages
**Then** an `analysis` run is registered on start and its progress `count`/`total` are derived from those existing messages — with no change to `runAnalysis`'s own logic or signature

**Given** either run reaches completion
**When** it succeeds
**Then** the registry run is finalized `done`

**Given** either run throws
**When** the catch block runs (the same place `recordRun(..., success:false)` is called)
**Then** the registry run is finalized `failed`

---

## Story 46.4: Wire Cover Letter & Resume Into the Registry

As a user generating documents,
I want each cover-letter and resume generation tracked as its own busy run,
So that several concurrent generations each appear and clear independently.

**Acceptance Criteria:**

**Given** `POST /api/jobs/:id/generate-cover-letter` in `api-jobs.ts`
**When** generation starts
**Then** a `cover_letter` run is registered with the job's `company` and `jobTitle` (as role) before `generateCoverLetter(...)` is awaited

**Given** `POST /api/jobs/:id/generate-resume`
**When** generation starts
**Then** a `resume` run is registered with the job's `company` and role before `generateResume(...)` is awaited

**Given** a generation succeeds
**When** the existing success `recordRun(...)` path runs
**Then** the corresponding registry run is finalized `done`

**Given** a generation throws
**When** any existing failure `recordRun(..., success:false)` path runs
**Then** the corresponding registry run is finalized `failed`

**Given** the same user fires two cover-letter generations for different jobs at once
**When** both are in flight
**Then** the registry holds two distinct `cover_letter` runs, each carrying its own company·role, finalizing independently

---

## Story 46.5: `useActivityStream` Client Hook

As the front-end,
I want a hook that maintains the live active-runs list over an EventSource connection,
So that the top-bar control renders from one push-driven source with no polling.

**Acceptance Criteria:**

**Given** a new hook `src/client/hooks/useActivityStream.ts`
**When** it mounts
**Then** it opens a browser `EventSource('/api/activity/stream')` (cookies sent automatically) and exposes `{ runs, isActive }`, where `runs` is the parsed active-runs array and `isActive` is true when any run is `running`

**Given** a `snapshot` or update event arrives
**When** it is received
**Then** its data is validated against the shared `activityRun` schema and the hook's runs list is replaced/merged accordingly — the runs list lives only here (no duplicate copy in component `useState`, no `fetch`/polling)

**Given** the EventSource errors or the connection closes unexpectedly
**When** the failure is observed
**Then** the hook retries with capped backoff and resumes updating once reconnected

**Given** the hook unmounts
**When** cleanup runs
**Then** the `EventSource` is closed and no further reconnects are scheduled

---

## Story 46.6: Top-Bar Activity Indicator & Dropdown

As a user anywhere in the app,
I want an Activity control in the top bar that animates while work runs and opens a panel of live runs,
So that I can monitor progress without returning to the page that started it.

**Acceptance Criteria:**

**Given** the top bar in `Layout.tsx`
**When** it renders
**Then** an "Activity" control (waveform/pulse glyph) appears to the left of the existing logout button, matching the zinc-900 header styling

**Given** no run is active (`isActive` false)
**When** I view the control
**Then** it shows a plain static icon

**Given** at least one run is active
**When** I view the control
**Then** the icon gains an animated spinner ring / pulse (Plex pattern), and returns to the plain idle state once nothing is running

**Given** I click the control
**When** the dropdown opens (shadcn dropdown/popover, dark low-chrome panel anchored under the icon)
**Then** each active run is a row showing a workflow-name title and a status line: Discovery → "N jobs discovered so far"; Analysis → "N jobs analyzed so far"; Cover Letter → "Generating cover letter — {Company} · {Role}"; Resume → "Generating resume — {Company} · {Role}"

**Given** a running row
**When** it renders
**Then** it shows a circular spinner on its right edge; multiple concurrent runs each render as their own row

**Given** a run finalizes
**When** its state becomes `done` or `failed`
**Then** the row reflects completion / a clear failed state, then drops out per the registry retention window

**Given** the dropdown is open
**When** I look at the bottom
**Then** there is a persistent footer row — present even when no runs are active — using a TanStack Router `<Link to="/config/logs">`; clicking it navigates to Logs and closes the dropdown

**Given** the dropdown's data source
**When** it renders
**Then** it reads exclusively from `useActivityStream` (no page-local state), so the activity shown is app/session-wide regardless of the current route
