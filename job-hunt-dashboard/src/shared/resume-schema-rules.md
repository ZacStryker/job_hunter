# Resume Schema — Prose Rules

Rules that mechanical JSON Schema cannot enforce. Both the LLM prompt and any human reviewer must follow these.

---

## Field Rules

**`title_02`**
Must not contain "and" or "&". The template header renders `title_01 and title_02`, so `title_02` is already preceded by "and". Including it again produces e.g. "Engineer and Systems Engineer and Architect".

**`experience`**
Entries must be ordered most-recent first (descending by start date).

**Skill strings (within `skill_groups`)**
The "/" separator is only allowed when one skill is a direct subset, implementation, or prerequisite of the other. Examples:
- ✅ `TypeScript/JavaScript` — TypeScript is a strict superset of JavaScript
- ✅ `React/Next.js` — Next.js is a React framework
- ❌ `Python/SQL` — unrelated technologies; list as separate skills

---

## String Value Rules

No em-dashes (`—`) in any string value. Use a regular hyphen (`-`) or restructure the sentence.

---

## Section Presence

`skill_groups`, `education`, and `projects` may be empty arrays (`[]`) to omit their sections from the rendered template entirely. `experience` requires at least one entry (`minItems: 1`).

---

## Content Limits

| Field | Limit |
|---|---|
| `skill_groups` count | 0 or 3–6 (use `[]` to omit section) |
| `skills` per group | 3–5 items |
| `projects` count | 0 or 1–4 (use `[]` to omit section) |
| `bullets` per experience | 3–5 bullets |
| Individual bullet length | ~140–170 characters |
