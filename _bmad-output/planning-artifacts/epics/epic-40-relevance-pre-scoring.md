# Epic 40: Relevance Pre-Scoring in Discovery Pipeline

Users can pre-screen newly discovered jobs against their resume before running expensive AI analysis. Each job gets a lightweight relevance score at discovery time — obvious mismatches (wrong tech stack, wrong language) are flagged immediately so users can archive them first, saving Anthropic API tokens.

**Source:** User request 2026-05-27
**Priority:** Medium — token-cost optimization and discovery UX improvement

**Dependency chain:** 40.1 → 40.3A or 40.3B (parallel with 40.2) → 40.4 → 40.5

---

## Story 40.1: Spike — Validate @xenova/transformers under Bun

As the development team,
I want to validate that `@xenova/transformers` (via onnxruntime-node) can load and run the all-MiniLM-L6-v2 ONNX model inside the project's Bun 1.3.x runtime,
So that the team has a definitive, documented decision on which embedding path to implement (in-process 40.3A vs. Python sidecar 40.3B) before any production code is written.

**Acceptance Criteria:**

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

> **Dev note:**
>
> ```bash
> cd job-hunt-dashboard
> mkdir -p spike
> bun add @xenova/transformers
> ```
>
> `spike/test-xenova-bun.ts`:
> ```ts
> import { pipeline } from '@xenova/transformers'
> const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
> const result = await extractor('Software Engineer', { pooling: 'mean', normalize: true })
> const vec: number[] = Array.from(result.data as Float32Array)
> console.log(`OK — length=${vec.length} sample=${vec.slice(0,3)}`)
> ```
>
> Run: `bun run spike/test-xenova-bun.ts`
>
> Expected success output: `OK — length=384 sample=[...]`
>
> Common failure: `Error: Cannot find module 'onnxruntime-node'` or a WASM fallback warning that produces wrong dimensions — both are failures. If the WASM fallback loads (no native error but very slow), test output quality rather than path.
>
> Record the result as a comment on this story before closing it.

---

## Story 40.2: Data Model — relevanceScore Column & Resume Embedding Cache

As the system,
I want the `jobs` table to carry a nullable `relevanceScore` column and a `user_embeddings` table to exist for caching per-user resume embeddings,
So that relevance scores can be stored per job and resume embeddings can be reused across discovery runs without recomputation.

**Acceptance Criteria:**

**Given** the database migration runs at `bun start`
**When** the runner completes
**Then** the `jobs` table has a `relevance_score REAL` nullable column
**And** a `user_embeddings` table exists with columns: `user_id INTEGER PRIMARY KEY`, `embedding TEXT NOT NULL`, `profile_hash TEXT NOT NULL`

**Given** `GET /api/jobs` is called after the migration
**When** the response body is inspected
**Then** each job record includes `relevanceScore: null | number` (never `undefined`)

**Given** `jobSchema` in `src/shared/schemas.ts`
**When** it is inspected
**Then** `relevanceScore: z.number().nullable()` is present (not optional — the field is always present in the API response, value is `null` when unscored)

**Given** a job that existed before the migration
**When** its record is read after the migration
**Then** `relevanceScore` is `null`

**Given** an INSERT into `user_embeddings` for a given `userId`
**When** a second INSERT is made for the same `userId` with different embedding data
**Then** the row is replaced (upsert on conflict of `user_id`)

> **Dev note:**
>
> **Migration file** (`bun run db:generate`, then edit the generated SQL if needed):
>
> ```sql
> ALTER TABLE jobs ADD COLUMN relevance_score REAL;
>
> CREATE TABLE IF NOT EXISTS user_embeddings (
>   user_id   INTEGER PRIMARY KEY NOT NULL REFERENCES users(id),
>   embedding TEXT    NOT NULL,
>   profile_hash TEXT NOT NULL
> );
> ```
>
> **`src/db/schema.ts`** — add to `jobs` table:
> ```ts
> relevanceScore: real('relevance_score'),
> ```
>
> Add new table export:
> ```ts
> export const userEmbeddings = sqliteTable('user_embeddings', {
>   userId:      integer('user_id').primaryKey().notNull().references(() => users.id),
>   embedding:   text('embedding').notNull(),
>   profileHash: text('profile_hash').notNull(),
> })
> ```
>
> **`src/shared/schemas.ts`** — add to `jobSchema`:
> ```ts
> relevanceScore: z.number().nullable(),
> ```
>
> **`profile_hash` note:** The profile table has no `updatedAt` column. Use a SHA-256 content hash of the concatenated resume text (`[summary, experience, skills].filter(Boolean).join('\n')`) as the invalidation key. Bun provides `crypto.subtle.digest` natively. Helper:
> ```ts
> async function hashText(text: string): Promise<string> {
>   const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
>   return Buffer.from(buf).toString('hex')
> }
> ```
>
> **Data ownership:** `relevanceScore` is scraper-owned (discovery pipeline sets it). Ensure it does NOT appear in `api-ingest.ts` `onConflictDoUpdate.set` block and NOT in the `PATCH /api/jobs/:id` allowlist.

---

## Story 40.3A: Embedding Service — In-Process via @xenova/transformers [PROCEED — spike validated in-process path]

As the discovery pipeline,
I want an in-process embedding service that loads all-MiniLM-L6-v2 once at startup and exposes `embed(text)` and `cosineSimilarity(a, b)` functions, with a resume embedding cache backed by `user_embeddings`,
So that job titles can be compared to a user's resume without any external service dependency.

**Prerequisite:** Story 40.1 spike confirmed in-process path is viable.

**Acceptance Criteria:**

**Given** the embedding service module is imported
**When** `embed('Software Engineer')` is awaited
**Then** it returns a `number[]` of length 384 (all-MiniLM-L6-v2 output dimension)

**Given** two float vectors computed from identical input
**When** `cosineSimilarity(a, a)` is called
**Then** the return value is ≥ 0.999

**Given** two orthogonal unit vectors `[1, 0, ...0]` and `[0, 1, ...0]`
**When** `cosineSimilarity` is called
**Then** the return value is ≈ 0.0 (within float precision)

**Given** the server starts
**When** the first `embed()` call is made
**Then** the ONNX model has been loaded once and is reused for subsequent calls (no per-request reload)

**Given** `getOrComputeResumeEmbedding(userId, resumeText, profileHash)` is called for the first time
**When** the function completes
**Then** the embedding is stored in `user_embeddings` (userId, embedding as JSON string, profileHash) and returned

**Given** the same `userId` and same `profileHash` are passed again
**When** `getOrComputeResumeEmbedding` is called
**Then** the cached embedding is returned without calling `embed()` again (no model inference)

**Given** the same `userId` but a different `profileHash` (profile content changed)
**When** `getOrComputeResumeEmbedding` is called
**Then** the embedding is recomputed via `embed()` and the `user_embeddings` row is replaced

> **Dev note:**
>
> Install: `bun add @xenova/transformers`
>
> **`src/server/services/embedding-service.ts`:**
> ```ts
> import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'
>
> let _extractor: FeatureExtractionPipeline | null = null
>
> async function getExtractor(): Promise<FeatureExtractionPipeline> {
>   if (!_extractor) {
>     _extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
>   }
>   return _extractor
> }
>
> export async function embed(text: string): Promise<number[]> {
>   const extractor = await getExtractor()
>   const result = await extractor(text, { pooling: 'mean', normalize: true })
>   return Array.from(result.data as Float32Array)
> }
>
> export function cosineSimilarity(a: number[], b: number[]): number {
>   // Vectors are already normalized (all-MiniLM-L6-v2 + normalize:true)
>   // so cosine similarity = dot product
>   let dot = 0
>   for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
>   return dot
> }
> ```
>
> **`src/server/services/resume-embedding-cache.ts`:**
> ```ts
> import { and, eq } from 'drizzle-orm'
> import { db } from '../../db/client'
> import { userEmbeddings } from '../../db/schema'
> import { embed } from './embedding-service'
>
> export async function getOrComputeResumeEmbedding(
>   userId: number,
>   resumeText: string,
>   profileHash: string,
> ): Promise<number[]> {
>   const cached = db.select().from(userEmbeddings).where(eq(userEmbeddings.userId, userId)).get()
>   if (cached?.profileHash === profileHash) {
>     return JSON.parse(cached.embedding) as number[]
>   }
>   const embedding = await embed(resumeText)
>   const embeddingJson = JSON.stringify(embedding)
>   db.insert(userEmbeddings)
>     .values({ userId, embedding: embeddingJson, profileHash })
>     .onConflictDoUpdate({
>       target: [userEmbeddings.userId],
>       set: { embedding: embeddingJson, profileHash },
>     })
>     .run()
>   return embedding
> }
> ```
>
> **Tests** — `src/server/services/embedding-service.test.ts`:
> - `cosineSimilarity` unit tests (pure math, no model needed)
> - Integration test: `embed('test')` returns array of length 384
> - `getOrComputeResumeEmbedding` tests: mock `embed` to avoid model in tests; assert cache hit skips embed; assert cache miss calls embed and writes to DB

---

## Story 40.3B: Embedding Service — Python FastAPI Sidecar (fallback) [SKIP — spike validated in-process path; 40.3A proceeds instead]

As the discovery pipeline,
I want a Python FastAPI sidecar service that provides text embeddings over HTTP using all-MiniLM-L6-v2, with the TypeScript server consuming it and caching resume embeddings in `user_embeddings`,
So that relevance scoring can work even when the in-process ONNX path is not viable under Bun.

**Prerequisite:** Story 40.1 spike confirmed in-process path is NOT viable.

**Acceptance Criteria:**

**Given** the embedding sidecar is running
**When** `POST /embed` is called with `{ "text": "Software Engineer" }`
**Then** the response is `{ "embedding": [...] }` with an array of exactly 384 floats

**Given** the Docker Compose configuration
**When** `docker compose up` is run
**Then** the embedding sidecar starts and is reachable from the main app at `http://embedding-sidecar:8000`

**Given** `embed('Software Engineer')` is called from the TypeScript service
**When** the function resolves
**Then** it returns a `number[]` of length 384 (fetched via HTTP from the sidecar)

**Given** the sidecar is unavailable (e.g., not running during a test)
**When** `embed()` is called
**Then** it throws an error; calling code catches it and sets `relevanceScore: null` for the affected job (no crash)

**Given** cosine similarity
**When** `cosineSimilarity(a, a)` is called in TypeScript (same pure math as 40.3A)
**Then** the result is ≥ 0.999

**Given** resume embedding cache behavior
**When** `getOrComputeResumeEmbedding(userId, resumeText, profileHash)` is used
**Then** caching behavior is identical to 40.3A (cache hit avoids HTTP call; cache miss calls sidecar and writes to `user_embeddings`)

> **Dev note:**
>
> **`embedding-sidecar/` directory** (at project root, sibling to `job-hunt-dashboard/`):
>
> `embedding-sidecar/requirements.txt`:
> ```
> fastapi==0.115.0
> uvicorn[standard]==0.30.0
> sentence-transformers==3.0.1
> ```
>
> `embedding-sidecar/main.py`:
> ```python
> from fastapi import FastAPI
> from pydantic import BaseModel
> from sentence_transformers import SentenceTransformer
>
> app = FastAPI()
> model = SentenceTransformer('all-MiniLM-L6-v2')
>
> class EmbedRequest(BaseModel):
>     text: str
>
> @app.post('/embed')
> def embed(req: EmbedRequest):
>     embedding = model.encode(req.text, normalize_embeddings=True).tolist()
>     return {'embedding': embedding}
> ```
>
> `embedding-sidecar/Dockerfile`:
> ```dockerfile
> FROM python:3.11-slim
> WORKDIR /app
> COPY requirements.txt .
> RUN pip install --no-cache-dir -r requirements.txt
> RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
> COPY . .
> CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
> ```
>
> **`docker-compose.yml`** — add service:
> ```yaml
> embedding-sidecar:
>   build: ./embedding-sidecar
>   restart: unless-stopped
>   networks:
>     - internal
> ```
>
> **`.env.example`** — add: `EMBEDDING_SERVICE_URL=http://embedding-sidecar:8000`
>
> **`src/server/services/embedding-service.ts`** (sidecar version):
> ```ts
> export async function embed(text: string): Promise<number[]> {
>   const url = process.env.EMBEDDING_SERVICE_URL
>   if (!url) throw new Error('EMBEDDING_SERVICE_URL not configured')
>   const res = await fetch(`${url}/embed`, {
>     method: 'POST',
>     headers: { 'Content-Type': 'application/json' },
>     body: JSON.stringify({ text }),
>     signal: AbortSignal.timeout(30_000),
>   })
>   if (!res.ok) throw new Error(`Embedding sidecar error ${res.status}`)
>   const data = await res.json() as { embedding: number[] }
>   return data.embedding
> }
>
> export function cosineSimilarity(a: number[], b: number[]): number {
>   let dot = 0
>   for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
>   return dot
> }
> ```
>
> `resume-embedding-cache.ts` is identical to 40.3A.

---

## Story 40.4: Discovery Pipeline Integration — Score Jobs at Insert Time

As the system running discovery for a user,
I want each newly inserted job to receive a relevance score computed from the cosine similarity between the job title embedding and the user's cached resume embedding,
So that relevance scores are available immediately after discovery without requiring any additional user action.

**Acceptance Criteria:**

**Given** a user with a profile containing at least one of `summary`, `experience`, or `skills`
**When** the discovery pipeline inserts new jobs for that user
**Then** each newly inserted job has `relevanceScore` set to the cosine similarity between its title and the user's resume text (value in the range -1.0 to 1.0)

**Given** the same user runs discovery again without modifying their profile
**When** the relevance scoring step executes
**Then** the resume embedding is fetched from `user_embeddings` cache (not recomputed)

**Given** a user with no profile row, or a profile with all text fields null/empty
**When** the discovery pipeline runs
**Then** jobs are inserted with `relevanceScore: null` (no error thrown; discovery completes normally)

**Given** the embedding service throws an error for one job title
**When** that job is scored
**Then** `relevanceScore` for that job stays `null`; the remaining jobs in the batch are scored as normal; the discovery run is not aborted

**Given** a job that already existed before this discovery run (filtered by `existingIds`)
**When** the discovery pipeline processes the search results
**Then** its `relevanceScore` is NOT modified (jobs are filtered before scoring, consistent with `onConflictDoNothing` behavior)

**Given** `GET /api/jobs` is called after a discovery run
**When** newly discovered jobs are inspected
**Then** `relevanceScore` is a number (not null) for jobs where the user has a profile with resume text

> **Dev note — hook point in `src/server/services/discovery-service.ts`:**
>
> After the existing transaction block (lines 226–245, `db.transaction(...)`), add a relevance scoring pass:
>
> ```ts
> if (userId !== undefined && newJobs.length > 0) {
>   const profileRow = db.select().from(profile)
>     .where(eq(profile.userId, userId)).get()
>
>   const resumeText = profileRow
>     ? [profileRow.summary, profileRow.experience, profileRow.skills]
>         .filter(Boolean).join('\n')
>     : ''
>
>   if (resumeText) {
>     try {
>       const profileHash = await hashText(resumeText) // from crypto.subtle
>       const resumeEmbedding = await getOrComputeResumeEmbedding(userId, resumeText, profileHash)
>
>       for (const job of newJobs) {
>         try {
>           const titleEmbedding = await embed(job.title)
>           const score = cosineSimilarity(resumeEmbedding, titleEmbedding)
>           db.update(jobs)
>             .set({ relevanceScore: score })
>             .where(and(eq(jobs.userId, userId), eq(jobs.externalJobId, job.id)))
>             .run()
>         } catch {
>           // best-effort; job stays with null relevanceScore
>         }
>       }
>     } catch {
>       // resume embed failed; entire batch stays with null relevanceScore
>     }
>   }
> }
> ```
>
> Add `hashText` helper at the top of the file (or import from a shared lib):
> ```ts
> async function hashText(text: string): Promise<string> {
>   const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
>   return Buffer.from(buf).toString('hex')
> }
> ```
>
> Add imports: `{ profile }` from schema, `getOrComputeResumeEmbedding` from `resume-embedding-cache`, `embed, cosineSimilarity` from `embedding-service`.
>
> **Tests** — `src/server/services/discovery-service.test.ts`:
> - Mock `embed` and `getOrComputeResumeEmbedding`; assert `relevanceScore` is set on new jobs when profile exists
> - Assert `relevanceScore` stays null when profile is absent
> - Assert embed errors per-job do not abort the discovery run

---

## Story 40.5: UX — Relevance Column, Drawer Layout & Discover Button Guard

As a user reviewing discovered jobs,
I want to see a relevance score in the pipeline table and job drawer, and be clearly told when discovery requires a profile to be set up first,
So that I can quickly spot and archive irrelevant jobs before running analysis, and understand what each score means.

**Acceptance Criteria:**

**Given** the pipeline Jobs table
**When** the user views it
**Then** a "Relevance" column is present, positioned after the "Source" column, showing `relevanceScore` formatted as a 2-decimal value (e.g., `0.82`) or `—` when null

**Given** the "Relevance" column header
**When** the user clicks it once
**Then** rows sort descending by `relevanceScore` (nulls last)

**Given** the "Relevance" column header is clicked once (descending)
**When** clicked again
**Then** rows sort ascending by `relevanceScore` (nulls last)

**Given** the column visibility toggle
**When** opened
**Then** "Relevance" is listed as a toggleable column; its visibility state is persisted to the existing `"job-hunt-column-visibility"` localStorage key

**Given** the job detail drawer
**When** a user opens any job
**Then** Relevance Score and Fit Score are displayed as two sibling cards in a single horizontal row, not stacked

**Given** the Relevance Score card in the drawer
**When** the user hovers its info icon
**Then** the tooltip reads: "Similarity between this job title and your resume, scored at discovery using a self-hosted embedding model"

**Given** the Fit Score card in the drawer
**When** the user hovers its info icon
**Then** the tooltip reads: "AI analysis score based on the full job description and your resume"

**Given** the job drawer for a job with `relevanceScore: null`
**When** the Relevance Score card is shown
**Then** the score displays `—` (no crash, no placeholder text like "N/A" or "undefined")

**Given** the user has no profile configured (profile is absent or has no resume text)
**When** the Discover button is rendered
**Then** it is visually disabled and shows a tooltip: "Profile & resume required to run discovery"

**Given** the disabled Discover button tooltip
**When** inspected
**Then** it contains a link or button that navigates to `/config/profile`

**Given** the user has a complete profile with resume text
**When** the Discover button is rendered
**Then** it is enabled (existing behavior unchanged)

> **Dev note:**
>
> **Relevance column** — `src/client/components/pipeline/PipelineTable.tsx`:
> Add a new column definition after the `source` column:
> ```ts
> columnHelper.accessor('relevanceScore', {
>   header: 'Relevance',
>   cell: (info) => {
>     const v = info.getValue()
>     return v != null ? v.toFixed(2) : '—'
>   },
>   sortingFn: (rowA, rowB) => {
>     const a = rowA.original.relevanceScore ?? -Infinity
>     const b = rowB.original.relevanceScore ?? -Infinity
>     return a - b
>   },
>   enableSorting: true,
> })
> ```
>
> **Drawer score cards** — `src/client/components/detail/JobDrawer.tsx` (or `FitBreakdown.tsx`):
> Wrap Relevance Score and Fit Score cards in a flex row (`flex flex-row gap-4`).
> Add a Tooltip (shadcn `<Tooltip>`) with an info icon (`lucide-react` `Info`) next to each score label.
>
> **Discover button guard** — locate the Discover button (likely in `src/client/routes/index.tsx` or `components/pipeline/`).
> Check profile existence via `useQuery` on `GET /api/profile` (or `GET /api/onboarding/status`).
> Profile is considered absent if the response is 404 or if `summary`, `experience`, and `skills` are all null/empty.
> Use shadcn `<TooltipProvider>` wrapping a disabled `<Button>` with tooltip — note: shadcn tooltip requires a non-disabled trigger; wrap the button in a `<span>` to allow tooltip on disabled state.
> The tooltip action link: `<Link to="/config/profile">Configure profile →</Link>` (TanStack Router `Link`).
