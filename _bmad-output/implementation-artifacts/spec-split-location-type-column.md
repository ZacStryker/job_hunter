---
title: 'Split Location Column into Place and Type'
type: 'feature'
created: '2026-06-12'
status: 'done'
context: []
baseline_commit: '4c035ac318e996737bc3db0768a0e52506344f3c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Location column on Jobs, Matches, Applications, and Archive views mixes the place name with the work arrangement type (Remote / Hybrid / On-site) in a single string, making both pieces of information harder to scan.

**Approach:** Parse the existing `location` string at render time — no DB migration. Extract the type keyword (Remote, Hybrid, On-site) and the remaining place name into two separate table columns. All parsing lives in a shared utility so both `PipelineTable` and `TrackerTable` use the same logic.

## Boundaries & Constraints

**Always:**
- Parsing is display-only — the `location` DB column and all API shapes remain unchanged.
- Type values are exactly: `On-site` | `Hybrid` | `Remote` | `—` (null/unknown).
- Place renders `—` when the location string is purely a type keyword (e.g., "Remote" with no city).
- The `locationType` column appears immediately after `location` in every affected view.

**Ask First:**
- If location strings in production contain formats not handled by the parser (unexpected patterns seen during verification).

**Never:**
- Add a `locationType` DB column or change any API/schema file.
- Change the `location` field stored in or returned by the server.

## I/O & Edge-Case Matrix

| Scenario | Input `location` | `place` | `type` |
|---|---|---|---|
| Pure remote | `"Remote"` | `—` | `Remote` |
| City + parens type | `"New York, NY (Hybrid)"` | `New York, NY` | `Hybrid` |
| City + dash type | `"Austin, TX - Remote"` | `Austin, TX` | `Remote` |
| Type prefix | `"Hybrid - San Francisco, CA"` | `San Francisco, CA` | `Hybrid` |
| On-site with hyphen | `"Denver, CO (On-site)"` | `Denver, CO` | `On-site` |
| No type keyword | `"Chicago, IL"` | `Chicago, IL` | `—` |
| Null input | `null` | `—` | `—` |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/src/client/utils/parseLocation.ts` -- new utility: parse raw location string into `{ place, type }`
- `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx` -- split `location` column; add `locationType` display column
- `job-hunt-dashboard/src/client/routes/index.tsx` -- add `locationType` to Jobs fixedColumns
- `job-hunt-dashboard/src/client/routes/matches.tsx` -- add `locationType` to Matches fixedColumns
- `job-hunt-dashboard/src/client/routes/archived.tsx` -- add `locationType` to Archive fixedColumns
- `job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx` -- split location column; add locationType column

## Tasks & Acceptance

**Execution:**
- [x] `job-hunt-dashboard/src/client/utils/parseLocation.ts` -- CREATE -- export `parseLocation(raw: string | null): { place: string | null; type: 'On-site' | 'Hybrid' | 'Remote' | null }`. Strip type keyword and surrounding noise chars from the place string.
- [x] `job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx` -- MODIFY -- update `location` accessor cell to render `parseLocation(v).place`; add a second `location` accessor with `id: 'locationType'`, header `'Type'`, cell renders `parseLocation(v).type`. Place `locationType` immediately after `location` in `staticColumns`.
- [x] `job-hunt-dashboard/src/client/routes/index.tsx` -- MODIFY -- insert `'locationType'` after `'location'` in fixedColumns.
- [x] `job-hunt-dashboard/src/client/routes/matches.tsx` -- MODIFY -- insert `'locationType'` after `'location'` in fixedColumns.
- [x] `job-hunt-dashboard/src/client/routes/archived.tsx` -- MODIFY -- insert `'locationType'` after `'location'` in fixedColumns.
- [x] `job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx` -- MODIFY -- update `location` column cell to render `parseLocation(v).place`; add `locationType` column (second `location` accessor with `id: 'locationType'`) immediately after, rendering the type string.

**Acceptance Criteria:**
- Given any job with `location = "New York, NY (Hybrid)"`, when viewing Jobs/Matches/Applications/Archive, then the Location column shows `New York, NY` and the Type column shows `Hybrid`.
- Given a job with `location = "Remote"`, when viewing any of the four views, then Location shows `—` and Type shows `Remote`.
- Given a job with `location = "Chicago, IL"` (no keyword), when viewing any of the four views, then Location shows `Chicago, IL` and Type shows `—`.
- Given a job with `location = null`, when viewing any view, then both Location and Type show `—`.

## Design Notes

Parsing strategy — strip the type keyword then clean surrounding noise characters:

```typescript
const place = raw
  .replace(/\b(remote|hybrid|on-?site)\b/gi, '')
  .replace(/[\s,\-–()/]+$/g, '')   // trailing noise
  .replace(/^[\s,\-–()/]+/g, '')   // leading noise
  .replace(/\s{2,}/g, ' ')
  .trim() || null
```

The `locationType` column in `PipelineTable` reuses the `location` accessor with a distinct `id: 'locationType'` so TanStack Table tracks it as a separate column for visibility management.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun run typecheck` -- expected: zero type errors

**Manual checks (if no CLI):**
- Open Jobs view: Location column shows city/state only; Type column shows work arrangement or `—`
- Open Matches, Applications, Archive — same split visible in all four views

## Suggested Review Order

**Parsing logic**

- Core parse function — type detection order (Remote > Hybrid > On-site) and strip regexes
  [`parseLocation.ts:1`](../../job-hunt-dashboard/src/client/components/../../../src/client/utils/parseLocation.ts#L1)

**PipelineTable column wiring (Jobs, Matches, Archive)**

- Location cell now shows parsed place; locationType column added immediately after
  [`PipelineTable.tsx:68`](../../job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx#L68)

**TrackerTable column wiring (Applications)**

- Same split applied to the separate TrackerTable component
  [`TrackerTable.tsx:43`](../../job-hunt-dashboard/src/client/components/tracker/TrackerTable.tsx#L43)

**View fixedColumns**

- Jobs view: locationType inserted after location
  [`routes/index.tsx:254`](../../job-hunt-dashboard/src/client/routes/index.tsx#L254)
- Matches view: locationType inserted after location
  [`routes/matches.tsx:42`](../../job-hunt-dashboard/src/client/routes/matches.tsx#L42)
- Archive view: locationType inserted after location
  [`routes/archived.tsx:36`](../../job-hunt-dashboard/src/client/routes/archived.tsx#L36)
