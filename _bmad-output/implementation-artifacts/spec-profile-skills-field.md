---
title: 'Re-add Skills plain-text field to profile'
type: 'feature'
created: '2026-06-11'
status: 'done'
baseline_commit: 'bf7c9308891a9d21398cc89a10de627e5a0ca1c2'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `skills` field was dropped from the profile during Epic 43's migration to structured `ProfileData`. The profile form has no way to enter skills, the LLM prompt instructs the model to populate skill groups "from the profile" but the profile contains no skills, and `index.tsx` still references the dead `profile?.skills` property.

**Approach:** Add `skills: z.string().nullable()` to `profilePersonalSchema` (saves via the existing Personal section Save button — no changes to experience mutation calls), wire it through all server consumers, and add a Textarea below Summary in the Personal section.

## Boundaries & Constraints

**Always:**
- `skills` lives in `profilePersonalSchema` so `buildPersonal()` picks it up automatically and all existing mutation calls remain unchanged.
- Both `resume-service.ts` and `cover-letter-service.ts` `buildProfileText` must include a `Skills:` line when non-null/non-empty (both are exact duplicates; both must be updated).
- `EMPTY_PROFILE_DATA.personal` in all four server files gains `skills: null`.
- The field is nullable — empty textarea saves as `null`, not an empty string.

**Ask First:** None anticipated.

**Never:**
- Do not use structured skill groups — it's a plain text blob; the LLM decides how to group and filter.
- Do not add a DB migration — `skills` lives inside the `profile_data` JSON column.
- Do not refactor or deduplicate `buildProfileText` across services (pre-existing deferred item).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Profile with skills saved, resume generated | `personal.skills: "TypeScript, Go, Python, React"` in stored JSON | `buildProfileText` emits `Skills: TypeScript, Go, Python, React` in LLM prompt | N/A |
| Profile with no skills (null) | `personal.skills: null` | `buildProfileText` omits the Skills line entirely | N/A |
| User clears the skills textarea and saves | Empty string submitted | `buildPersonal()` maps `''` → `null`; null stored in JSON | Server error → toast |

</frozen-after-approval>

## Code Map

- `src/shared/schemas.ts` — add `skills: z.string().nullable().default(null)` to `profilePersonalSchema`
- `src/server/routes/api-profile.ts` — add `skills: null` to `EMPTY_PROFILE_DATA.personal`
- `src/server/services/resume-service.ts` — add `skills: null` to `EMPTY_PROFILE_DATA.personal`; update `buildProfileText` to include `Skills:` line
- `src/server/services/cover-letter-service.ts` — same changes as resume-service.ts
- `src/server/services/analysis-service.ts` — add `skills: null` to `EMPTY_PROFILE_DATA.personal`; add `Skills: profileData.personal.skills` to `profileJson`
- `src/client/routes/config/profile-resume.tsx` — add `skills` state; update `buildPersonal()` to include `skills: skills || null`; add Skills Textarea below Summary in the Personal section
- `src/client/routes/index.tsx` — fix dead `profile?.summary || profile?.experience || profile?.skills` to `profile?.personal.summary || profile?.experience.jobs.length || profile?.personal.skills`

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/schemas.ts` -- add `skills: z.string().nullable().default(null)` to `profilePersonalSchema` -- TypeScript enforces downstream EMPTY_PROFILE_DATA constants immediately
- [x] `src/server/routes/api-profile.ts` -- add `skills: null` to `EMPTY_PROFILE_DATA.personal` -- matches updated ProfileData type
- [x] `src/server/services/resume-service.ts` -- add `skills: null` to `EMPTY_PROFILE_DATA.personal`; append `pd.personal.skills ? \`Skills: ${pd.personal.skills}\` : null` to `buildProfileText` return array -- LLM receives skills
- [x] `src/server/services/cover-letter-service.ts` -- same two changes as resume-service.ts -- both buildProfileText implementations stay in sync
- [x] `src/server/services/analysis-service.ts` -- add `skills: null` to `EMPTY_PROFILE_DATA.personal`; add `Skills: profileData.personal.skills` to the `profileJson` object -- analysis LLM sees candidate skills
- [x] `src/client/routes/config/profile-resume.tsx` -- add `const [skills, setSkills] = useState(profileData.personal.skills ?? '')`; update `buildPersonal()` to include `skills: skills || null`; add a Skills Textarea below Summary in the Personal section -- profile form has skills entry
- [x] `src/client/routes/index.tsx` -- replace `Boolean(profile?.summary || profile?.experience || profile?.skills)` with `Boolean(profile?.personal.summary || profile?.experience.jobs.length || profile?.personal.skills)` -- removes three dead property references

**Acceptance Criteria:**
- Given the profile form loads, when the user scrolls to the Personal section, then a "Skills" label and Textarea appear below Summary.
- Given the user types skills into the Textarea and clicks Save, then the value persists across page reloads.
- Given the profile has skills saved, when resume or cover letter generation runs, then the LLM prompt includes `Skills: {text}` in the candidate profile block.
- Given the user clears the Skills Textarea and saves, then `personal.skills` is stored as `null` and the Skills line is omitted from future LLM prompts.
- Given `bun tsc --noEmit`, then zero TypeScript errors.
- Given `bun test`, then all existing tests pass with no new failures.

## Verification

**Commands:**
- `cd job-hunt-dashboard && bun tsc --noEmit` -- expected: zero errors
- `cd job-hunt-dashboard && bun test` -- expected: all tests pass

## Suggested Review Order

**Schema anchor**

- New `skills` field on `profilePersonalSchema`; `.default(null)` enables backward compat with stored profiles
  [`schemas.ts:221`](../../job-hunt-dashboard/src/shared/schemas.ts#L221)

**Server consumers — LLM prompt wiring**

- `buildProfileText` appends `Skills:` line; conditional prevents null from reaching LLM
  [`resume-service.ts:43`](../../job-hunt-dashboard/src/server/services/resume-service.ts#L43)

- Same guard in the duplicate `buildProfileText`; both files kept in sync
  [`cover-letter-service.ts:41`](../../job-hunt-dashboard/src/server/services/cover-letter-service.ts#L41)

- Analysis service uses object spread to omit the key entirely when null (not a text block)
  [`analysis-service.ts:150`](../../job-hunt-dashboard/src/server/services/analysis-service.ts#L150)

**UI binding**

- `skills` state initialized from `profileData.personal.skills`; empty string → null on save
  [`profile-resume.tsx:50`](../../job-hunt-dashboard/src/client/routes/config/profile-resume.tsx#L50)

- `buildPersonal()` includes `skills: skills || null`; picked up by all existing mutation calls for free
  [`profile-resume.tsx:95`](../../job-hunt-dashboard/src/client/routes/config/profile-resume.tsx#L95)

- Skills Textarea rendered below Summary in the Personal section
  [`profile-resume.tsx:439`](../../job-hunt-dashboard/src/client/routes/config/profile-resume.tsx#L439)

**Dead reference fix**

- `hasResumeText` corrected to use actual `ProfileData` shape; optional chaining extended for safety
  [`index.tsx:83`](../../job-hunt-dashboard/src/client/routes/index.tsx#L83)
