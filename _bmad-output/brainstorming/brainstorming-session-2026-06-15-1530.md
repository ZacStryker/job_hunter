---
stepsCompleted: [1]
inputDocuments: []
session_topic: 'Reworking the job-analysis flow: prompt caching and single-query vs 1-to-1 batch'
session_goals: 'Understand constraints, risks, and implications of (a) caching the candidate profile and (b) collapsing the 10-call batch into one query; decide on an architecture'
selected_approach: 'First-principles + pre-mortem (facilitator-led, grounded in current code)'
techniques_used: ['first-principles', 'pre-mortem']
ideas_generated: []
context_file: ''
---

## Session Overview

**Topic:** Reworking the analysis flow to lower cost — prompt caching the candidate profile, and a possible move from 10 independent queries to a single query.

**Goals:** Surface the real constraints and risks; separate the cost goal from the architecture change; decide what to actually build.

### Current architecture (as built — `src/server/services/analysis-service.ts`)

- Sequential loop over up to **10 pending jobs**, `limit(10)`.
- Each job → **one independent** `POST /v1/messages` to `claude-sonnet-4-6`, `max_tokens: 1024`.
- Single user message = candidate name + **full profile JSON** + job preferences + **one** job listing + output-schema instructions (built by `applyAnalysisTemplate`).
- `systemPrompt: null`, **no caching**, raw `fetch` (not the SDK).
- Per-job `try/catch`: one failure is isolated, marked `failed`, others proceed.
- The **candidate profile JSON is re-sent in full on all 10 calls** — the duplication being targeted.

### The key reframe (three architectures, not two)

| | A. Today | B. Cache profile, keep 10 calls | C. Single call, all 10 jobs |
|---|---|---|---|
| Profile tokens / run | 10× full | 1 write (1.25×) + 9 reads (0.1×) ≈ 2.15× | 1× |
| 1-to-1 isolation | ✅ | ✅ (unchanged) | ❌ |
| Error blast radius | 1 job | 1 job | all 10 |
| Cross-job contamination / hallucination | none | none | real risk |

**Caching decouples the cost goal from the architecture change.** B captures ~90% of the available savings with ~0% of the isolation risk the user is worried about. C's *only* incremental win over B is shaving the profile from ~2.15× to 1× per run — negligible in absolute terms — while taking on contamination, position bias, truncation, and all-or-nothing failure.

### Caching mechanics that bind to this code

- **Min cacheable prefix on Sonnet 4.6 = 2048 tokens.** If profile + prefs + schema is under that, caching *silently* won't engage. Verify the prefix clears 2048.
- **Restructure the template:** stable prefix [name + profile + prefs + output schema] → `cache_control` breakpoint → volatile [job listing] last. Today the schema comes *after* the job listing, so it must move ahead of the breakpoint.
- **Sequential loop is cache-friendly:** call 1 writes the cache, calls 2–10 read it (cache is readable only after the first response starts streaming). Do **not** naively parallelize — parallel calls all miss.
- **Cross-run:** 5-min TTL means the cache dies between runs; each run pays one write + nine reads. Still ~78% off the profile-token portion within a run. Default 5-min TTL is right unless runs cluster inside an hour.
- **Prefix must be byte-identical:** profile serialization here is deterministic (fixed key order, no `datetime`/uuid) — good. Keep it that way.
- **Verify hits:** add `usage.cache_read_input_tokens` / `cache_creation_input_tokens` to the token accounting (currently only reads `input_tokens`/`output_tokens`).

### Pre-mortem on Architecture C (single call) — the user's instinct, validated + expanded

1. Cross-job contamination / anchoring — job 7 scored relative to jobs 1–6 instead of on absolute merit.
2. Position bias (primacy/recency) — job 1 vs job 10 treated differently.
3. **Truncation:** `max_tokens: 1024` is fine for one job; ten result objects will blow past it → malformed/truncated JSON.
4. Blast radius — one parse/truncation/API error loses all 10, vs one today.
5. Attribute bleed (true hallucination) — job 3's salary assigned to job 5, merged requirements.
6. Worse observability — per-job tokens/latency/retry all muddier.
7. Fights the incremental `pending` pickup model.

When C *would* be worth it: if the product wanted **comparative ranking** of the 10 against each other — a different feature than today's absolute per-job scoring.

### Orthogonal lever: Batches API

Analysis is a background "run analysis" job with a progress callback — not latency-sensitive. The **Batches API is a flat 50% discount on all tokens** and stacks with caching. Biggest single cost lever, independent of the isolation question.

### Session Setup

Facilitator-led first-principles + pre-mortem, grounded in the actual code. Next: pick a direction (B alone, B+Batches, or pursue C with mitigations).
