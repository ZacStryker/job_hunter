# Story 40.1: Spike — Validate @xenova/transformers under Bun

Status: done

## Story

As the development team,
I want to validate that `@xenova/transformers` (via onnxruntime-node) can load and run the all-MiniLM-L6-v2 ONNX model inside the project's Bun 1.3.x runtime,
so that the team has a definitive decision on which embedding path to implement (in-process 40.3A vs. Python sidecar 40.3B) before any production code is written.

## Acceptance Criteria

**Given** the project's current Bun version (1.3.x)
**When** a spike script runs `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')` and embeds the string `"Software Engineer"`
**Then** the script exits with code 0 and logs a float array of length 384
**And** the outcome is documented with Bun version, `@xenova/transformers` version, and onnxruntime-node version

**Given** the spike exits successfully (in-process path viable)
**When** the decision is recorded
**Then** story 40.3A is marked **proceed** and story 40.3B is marked **skip — spike validated in-process path**

**Given** the spike fails with a native binding or ONNX error
**When** the decision is recorded
**Then** story 40.3B is marked **proceed** and story 40.3A is marked **skip — spike failed, sidecar path required**

**Given** the spike script
**When** the repo is inspected
**Then** the script lives at `job-hunt-dashboard/spike/test-xenova-bun.ts` and is NOT imported by any production file

## Tasks / Subtasks

- [x] Install `@xenova/transformers` as a dev/spike dependency (AC: 1)
  - [x] `cd job-hunt-dashboard && mkdir -p spike`
  - [x] `bun add @xenova/transformers`
- [x] Write spike script at `job-hunt-dashboard/spike/test-xenova-bun.ts` (AC: 4)
- [x] Run spike: `bun run spike/test-xenova-bun.ts` from inside `job-hunt-dashboard/` (AC: 1)
- [x] Record result as a comment in this story file (AC: 1)
  - [x] Include: Bun version (`bun --version`), `@xenova/transformers` version, onnxruntime-node version from `node_modules/@xenova/transformers/package.json` deps
  - [x] Include: exit code, actual output, or exact error if it failed
- [x] Update story status for 40.3A and 40.3B based on outcome (AC: 2 or 3)

## Dev Notes

### This Is a Spike — No Production Code

This story produces **one file** (`spike/test-xenova-bun.ts`) and **one decision**. The spike script must never be imported by any production file. No Drizzle schema changes, no API routes, no UI changes.

### Spike Script

Create `job-hunt-dashboard/spike/test-xenova-bun.ts` with exactly this content:

```ts
import { pipeline } from '@xenova/transformers'
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
const result = await extractor('Software Engineer', { pooling: 'mean', normalize: true })
const vec: number[] = Array.from(result.data as Float32Array)
console.log(`OK — length=${vec.length} sample=${JSON.stringify(vec.slice(0, 3))}`)
```

Run it from the `job-hunt-dashboard/` directory:

```bash
cd job-hunt-dashboard
bun run spike/test-xenova-bun.ts
```

### Success Criteria

The spike **passes** if and only if:
- Process exits with code 0
- Output contains `OK — length=384`
- The sample values are non-zero floats (e.g., `[0.123, -0.045, 0.078]`)

### Failure Modes to Watch For

| Symptom | Verdict |
|---|---|
| `Error: Cannot find module 'onnxruntime-node'` | FAIL — native binding missing |
| WASM fallback warning + very slow execution | INVESTIGATE — check vector length; if length ≠ 384 → FAIL |
| WASM fallback + correct output (length=384, non-zero) | PASS (slower but functional) |
| `Error: /lib/x86_64-linux-gnu/libc.so.6: version 'GLIBC_2.xx' not found` | FAIL — glibc version mismatch |
| Segfault or Bun crash | FAIL |

> If WASM fallback loads (no native binding crash) but the output length is 384 with valid floats, treat as a **conditional pass** and note the WASM path in the decision. Story 40.3A can still proceed, but note that the model runs in WASM mode (slower startup, no GPU).

### Decision After Running the Spike

**If spike passes:** Add a comment here with the result, then in `_bmad-output/planning-artifacts/epics/epic-40-relevance-pre-scoring.md` mark story 40.3A as **proceed** and 40.3B as **skip**.

**If spike fails:** Add a comment here with the error, then mark story 40.3B as **proceed** and 40.3A as **skip**.

### Capturing the Decision Comment

Paste the following into the **Dev Agent Record > Completion Notes** section (fill in actual values):

```
SPIKE RESULT: [PASS|FAIL]
Bun version: x.x.x
@xenova/transformers version: x.x.x
onnxruntime-node version: x.x.x (or "WASM fallback — no native binding")
Output: OK — length=384 sample=[...]
Decision: Story 40.3A → [proceed|skip]; Story 40.3B → [proceed|skip]
```

### Project Structure Notes

- Spike script location: `job-hunt-dashboard/spike/test-xenova-bun.ts` — `spike/` is a throwaway directory, not part of `src/`
- `@xenova/transformers` goes into `dependencies` (not `devDependencies`) because story 40.3A will use it in production if the spike passes
- Working directory for `bun run` must be `job-hunt-dashboard/` — the package.json is there

### TypeScript Strict Mode Note

The spike script uses top-level `await`. Bun supports this natively. TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`) applies to `src/` files, not to `spike/`. The spike script does not need a separate tsconfig entry.

### @xenova/transformers Version Note

At time of writing, `@xenova/transformers` is at v2.x. The model `Xenova/all-MiniLM-L6-v2` is a ONNX-converted checkpoint served from Hugging Face. First run will download the model weights to a cache directory (`~/.cache/huggingface/` or similar). This download requires internet access.

### No Tests for a Spike

This is a spike — no `bun:test` tests are written. The script itself is the test. The outcome is observed by running it and reading stdout/stderr.

### References

- Epic 40 full spec: `_bmad-output/planning-artifacts/epics/epic-40-relevance-pre-scoring.md`
- Architecture patterns: `_bmad-output/planning-artifacts/architecture-distillate.md`
- Project context (stack rules): `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

SPIKE RESULT: PASS
Bun version: 1.3.11
@xenova/transformers version: 2.17.2
onnxruntime-node version: 1.14.0 (native binding loaded — not WASM fallback)
Output: OK — length=384 sample=[-0.0648588314652443,0.027113834396004677,0.006188503932207823]
Exit code: 0
Decision: Story 40.3A → proceed; Story 40.3B → skip — spike validated in-process path

### File List

- job-hunt-dashboard/spike/test-xenova-bun.ts (created)
- job-hunt-dashboard/package.json (modified — added @xenova/transformers 2.17.2)
- job-hunt-dashboard/bun.lock (modified — lockfile updated)

### Review Findings

- [x] [Review][Defer] `onnxruntime-web@1.14.0` transitive dep — vintage CVEs [job-hunt-dashboard/bun.lock] — deferred, pre-existing: transitive dep pinned by `@xenova/transformers@2.17.2`; revisit when upgrading the package or implementing 40.3A
- [x] [Review][Defer] Docker image strategy for `@xenova/transformers` — model cache path and image size not yet addressed [job-hunt-dashboard/Dockerfile] — deferred, pre-existing: proper work for 40.3A implementation

## Change Log

- 2026-05-27: Spike implemented and executed. @xenova/transformers 2.17.2 + onnxruntime-node 1.14.0 run successfully under Bun 1.3.11. In-process path (40.3A) confirmed viable; Python sidecar (40.3B) skipped.
