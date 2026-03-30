# User Journey Flows

## Journey 1: Daily Triage

The primary loop. Entry is the Pipeline view; the exit is either a decision recorded or the tab closed.

```mermaid
flowchart TD
    A([Open localhost:3000]) --> B[Pipeline view loads\nall jobs visible]
    B --> C{Scan fit score column\ncolor = instant signal}
    C -->|Red badges| D[Skip — no click needed\nrow already communicates outcome]
    C -->|Green / Yellow| E[Click row]
    E --> F[Drawer slides open\n480px right panel]
    F --> G[Read: role_fit\nOverall verdict]
    G --> H[Read: requirements_met\nrequirements_missed\nred_flags]
    H --> I{Decision}
    I -->|Apply| J[Toggle Applied ON\nStatus auto-sets to Applied]
    I -->|Skip| K[Set status_override = Skip\nor close without action]
    I -->|Investigate| L[Open source_url\nin new tab]
    J --> M[Close drawer]
    K --> M
    L --> M
    M --> C
    D --> C
```

**Flow optimizations:**
- Score badge color resolves most decisions before the drawer opens — the drawer is for confirmation, not discovery
- Applied toggle is at the bottom of the drawer; user reads the full record before the action is reachable
- Closing the drawer without action is a valid non-decision — no forced choice

## Journey 2: Manual Sync

Triggered by the Sync button. Two branches: success and auth/network failure.

```mermaid
flowchart TD
    A([Click Sync button]) --> B[Button enters loading state\nspinner + disabled]
    B --> C[Fetch OAuth token\nfrom env config]
    C --> D{Token valid?}
    D -->|No| E[Show error banner:\n'Sync failed — OAuth token expired.\nNo data was modified.']
    D -->|Yes| F[Fetch all rows\nfrom Google Sheets API v4]
    F --> G{Fetch succeeded?}
    G -->|No| H[Show error banner:\n'Sync failed — reason.\nNo data was modified.']
    G -->|Yes| I[POST rows to /api/ingest\nupsert with mutable field protection]
    I --> J{Upsert succeeded?}
    J -->|No| K[Show error banner:\n'Sync failed — write error.\nNo data was modified.']
    J -->|Yes| L[Invalidate jobs query cache\nTable re-renders with new data]
    L --> M[Show success banner:\n'X records added, Y updated']
    M --> N([Button returns to idle])
    E --> N
    H --> N
    K --> N
```

**Flow optimizations:**
- Every failure path guarantees no partial writes — atomic-or-nothing semantics
- Success banner shows counts (not just "done") — gives confidence the sync was meaningful
- Second sync immediately after is safe; idempotent result shown

## Journey 3: First-Run Setup

Single-session bootstrap from clone to live data.

```mermaid
flowchart TD
    A([Clone repo]) --> B[cp .env.example .env\nFill OAuth creds + sheet ID]
    B --> C[bun install && bun start]
    C --> D[Boot: run SQLite migrations\nTerminal: Migrations OK. Server on :3000]
    D --> E[Open localhost:3000\nEmpty Pipeline table visible]
    E --> F[Click Sync]
    F --> G{OAuth token present?}
    G -->|No| H[Error: Missing OAuth credentials\nEdit .env and restart]
    G -->|Yes| I[Sync runs — jobs populate\nBadges and chips appear]
    I --> J[Toggle optional columns\nColumn visibility saves to localStorage]
    J --> K([Dashboard ready for daily use])
    H --> B
```

## Journey Patterns

**Decision before action:** Every state-changing action (applied toggle, status override) is positioned below the full record in the drawer. The user reads before they act — layout enforces this.

**Non-action is valid:** Closing the drawer without toggling anything is a valid "investigate later" signal. No forced confirmation dialogs.

**Error isolation:** All sync errors include "No data was modified" — removes anxiety about running sync repeatedly.

**Score-first scanning:** The leftmost prominent column is always the fit score badge. Color is absorbed before text is read in any view.

## Flow Optimization Principles

- **Reduce time-to-first-decision:** Score color resolves ~60% of records without opening a drawer
- **Drawer = confirmation, not discovery:** The user already suspects "apply" or "skip" before clicking — the drawer provides evidence, not the verdict
- **No modals, no confirmations:** Applied toggle and status override are direct writes; undo is just toggling back
- **Sync is always safe to re-run:** Idempotent upsert removes hesitation about hitting Sync more than once

---
