# Story 22.1: Add Job by URL with Manual Fallback

**Epic:** 22 — Manual Job Addition  
**Story ID:** 22-1-add-job-by-url  
**Status:** done  
**Date:** 2026-04-21

---

## Story

As a job hunter,
I want to add a job to the Jobs view by pasting a URL (with an attempted Playwright scrape) or by entering details directly,
so that I can track opportunities I discover outside the automated pipeline.

---

## Acceptance Criteria

### AC1 — "Add Job by URL" button in Jobs view action bar
- The Jobs view (`/`, `PipelineRoute`) action bar has an "Add Job by URL" button alongside Discovery and Analysis.
- The button is disabled while any webhook stream (discoveryStream or analysisStream) is pending.

### AC2 — Inline URL input replaces the button
- Clicking "Add Job by URL" toggles the button area into an inline input state:
  - Label: "Job URL:"
  - Text input for the URL
  - "Submit" button
  - "Cancel" button
- Clicking Cancel returns to the default button state with no side effects.

### AC3 — Submit triggers one scrape attempt
- Clicking Submit (non-empty URL) calls `POST /api/jobs/scrape-url` with the URL.
- Exactly one attempt — no retries.
- While pending: Submit is disabled/shows loading; Cancel is disabled.

### AC4 — Scrape success path
- If `POST /api/jobs/scrape-url` returns `{ company, jobTitle, location }`, the client calls `POST /api/jobs` with those values plus `sourceUrl` = entered URL, `source` = "Manual".
- On `POST /api/jobs` success: invalidate `['jobs']`, dismiss the URL input area, Jobs table refreshes.

### AC5 — Scrape failure path
- If `POST /api/jobs/scrape-url` returns any non-2xx status, the inline area transitions to a confirmation prompt: "Unable to scrape, add manually?"
- Two buttons: "Yes" and "No".
- "No": dismiss input area, return to default button state.
- "Yes": open AddJobDrawer with URL pre-filled (see AC6).

### AC6 — AddJobDrawer manual entry form
- AddJobDrawer is a right-side Sheet overlay (same visual style as the existing `JobDrawer`).
- Contains a form with required fields: Company (required), Job Title (required), URL (required); and optional field: Location.
- URL field is pre-filled with the URL entered in the inline input.
- "Add" button is disabled until Company, Job Title, and URL all have non-empty trimmed values.
- X button and overlay click close the drawer without saving.

### AC7 — AddJobDrawer submit
- Clicking "Add" calls `POST /api/jobs` with form values (`location` sent as empty string → stored as null if blank).
- On success: drawer closes, inline URL input is dismissed, `['jobs']` is invalidated, Jobs table refreshes.
- On error (any non-2xx): display inline error text inside the drawer (`text-red-400`); drawer stays open with form values preserved.

### AC8 — New jobs appear in Jobs view
- Inserted job has `source="Manual"`, `fitScore=null`, `archived=false`, `analysisStatus="pending"`.
- It passes the Jobs view filter (`!archived && fitScore == null`) and appears in the table immediately after refresh.

### AC9 — No regressions
- No changes to Matches, Tracker, Applications, Archive, Dashboard, Messages, or Config views.
- `PipelineTable` props are unchanged.
- All existing `api-jobs.test.ts` tests continue to pass.

---

## Tasks / Subtasks

- [x] T1: Extend embedded scraper with `/scrape/job-details` endpoint (AC: 3, 4, 5)
  - [x] T1.1: Add `fetchLinkedInJobDetails(url)` to `scraper/src/scrapers/linkedin.js`
  - [x] T1.2: Add `fetchIndeedJobDetails(url)` to `scraper/src/scrapers/indeed.js`
  - [x] T1.3: Add `fetchIndeedNlJobDetails(url)` to `scraper/src/scrapers/indeed_nl.js`
  - [x] T1.4: Add `POST /scrape/job-details` route to `scraper/src/routes/scrape.js`
- [x] T2: `POST /api/jobs/scrape-url` server endpoint (AC: 3, 4, 5)
  - [x] T2.1: Implement in `api-jobs.ts` — detect source from URL hostname, call `SCRAPER_URL/scrape/job-details`
  - [x] T2.2: Add tests to `api-jobs.test.ts`
- [x] T3: `POST /api/jobs` server endpoint (AC: 4, 7)
  - [x] T3.1: Add `manualJobSchema` and handler in `api-jobs.ts`
  - [x] T3.2: Check for existing job (company+jobTitle) → 409; else insert → 201
  - [x] T3.3: Add tests to `api-jobs.test.ts`
- [x] T4: `useAddJobMutation` hook (AC: 4, 7)
  - [x] T4.1: Create `src/client/hooks/useAddJobMutation.ts`
- [x] T5: `AddJobDrawer` component (AC: 6, 7)
  - [x] T5.1: Create `src/client/components/pipeline/AddJobDrawer.tsx`
  - [x] T5.2: Company + Job Title required, Location optional, URL required; inline error on submit failure
- [x] T6: Integrate into `PipelineRoute` (AC: 1, 2, 3, 4, 5)
  - [x] T6.1: Add `AddJobMode` state + `addJobUrl` + `isAddJobDrawerOpen` to `index.tsx`
  - [x] T6.2: Add "Add Job by URL" button and inline URL input to action bar JSX
  - [x] T6.3: Wire scrape call, success/failure state transitions, AddJobDrawer open
  - [x] T6.4: Mount `<AddJobDrawer>` in `PipelineRoute` return

---

## Technical Design

### 1. Scraper Extension — `scraper/src/` (plain JS, no TypeScript)

**`scraper/src/scrapers/linkedin.js`** — add alongside existing `fetchLinkedInListing`:

```javascript
export async function fetchLinkedInJobDetails(url) {
  return scrapeWithRetry('linkedin', () =>
    withPage(AUTH_PATH, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait for either the unified top card or the legacy topcard
      await page.waitForSelector(
        '.job-details-jobs-unified-top-card__job-title, h1.topcard__title',
        { timeout: 20000 }
      );
      return page.evaluate(() => {
        const jobTitle =
          document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.innerText?.trim()
          ?? document.querySelector('h1.topcard__title')?.innerText?.trim()
          ?? null;
        const company =
          document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.innerText?.trim()
          ?? document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText?.trim()
          ?? document.querySelector('a.topcard__org-name-link')?.innerText?.trim()
          ?? null;
        const location =
          document.querySelector('.job-details-jobs-unified-top-card__bullet')?.innerText?.trim()
          ?? document.querySelector('.topcard__flavor--bullet')?.innerText?.trim()
          ?? null;
        return { jobTitle, company, location };
      });
    })
  );
}
```

**`scraper/src/scrapers/indeed.js`** — add alongside existing `fetchIndeedListing`:

```javascript
export async function fetchIndeedJobDetails(url) {
  return scrapeWithRetry('indeed', () =>
    withPage(null, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('h1', { timeout: 15000 });
      return page.evaluate(() => {
        const jobTitle =
          document.querySelector('h1[data-testid="jobTitle"]')?.innerText?.trim()
          ?? document.querySelector('h1.jobsearch-JobInfoHeader-title')?.innerText?.trim()
          ?? document.querySelector('h1')?.innerText?.trim()
          ?? null;
        const company =
          document.querySelector('[data-testid="inlineHeader-companyName"] a')?.innerText?.trim()
          ?? document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim()
          ?? null;
        const location =
          document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText?.trim()
          ?? null;
        return { jobTitle, company, location };
      });
    })
  );
}
```

**`scraper/src/scrapers/indeed_nl.js`** — add alongside existing `fetchIndeedNlListing` (same selectors as Indeed US):

```javascript
export async function fetchIndeedNlJobDetails(url) {
  return scrapeWithRetry('indeed_nl', () =>
    withPage(null, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('h1', { timeout: 15000 });
      return page.evaluate(() => {
        const jobTitle =
          document.querySelector('h1[data-testid="jobTitle"]')?.innerText?.trim()
          ?? document.querySelector('h1')?.innerText?.trim()
          ?? null;
        const company =
          document.querySelector('[data-testid="inlineHeader-companyName"] a')?.innerText?.trim()
          ?? document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim()
          ?? null;
        const location =
          document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText?.trim()
          ?? null;
        return { jobTitle, company, location };
      });
    })
  );
}
```

**`scraper/src/routes/scrape.js`** — add `JobDetailsSchema` and new route:

```javascript
import { fetchLinkedInJobDetails } from '../scrapers/linkedin.js';
import { fetchIndeedJobDetails } from '../scrapers/indeed.js';
import { fetchIndeedNlJobDetails } from '../scrapers/indeed_nl.js';

const JobDetailsSchema = z.object({
  source: z.enum(['linkedin', 'indeed', 'indeed_nl']),
  url: z.string().url(),
});

// Add inside scrapeRoutes():
fastify.post('/scrape/job-details', async (request, reply) => {
  const body = JobDetailsSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send(body.error);

  const { source, url } = body.data;
  const fetchers = {
    linkedin: fetchLinkedInJobDetails,
    indeed: fetchIndeedJobDetails,
    indeed_nl: fetchIndeedNlJobDetails,
  };
  const result = await fetchers[source](url);
  // result: { jobTitle, company, location }
  return { source, url, ...result, extractedAt: new Date().toISOString() };
});
```

**Note on DOM selectors**: LinkedIn and Indeed update their markup periodically. The selectors above target the most current structure (as of April 2026) with legacy fallbacks. If scraping returns `null` for all fields, the server-side endpoint returns a 422 and the client falls through to the manual form — no dev panic needed.

### 2. `POST /api/jobs/scrape-url` — New Server Endpoint

**File:** `src/server/routes/api-jobs.ts`

Source detection from URL hostname:
- `linkedin.com` → `linkedin`
- `indeed.com` (but NOT `nl.indeed.com`) → `indeed`
- `nl.indeed.com` → `indeed_nl`
- Anything else → 422 (unsupported source → triggers manual form)

```typescript
const scrapeUrlSchema = z.object({ url: z.string().url() })

function detectSource(rawUrl: string): 'linkedin' | 'indeed' | 'indeed_nl' | null {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, '')
    if (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')) return 'linkedin'
    if (hostname === 'nl.indeed.com') return 'indeed_nl'
    if (hostname === 'indeed.com' || hostname.endsWith('.indeed.com')) return 'indeed'
    return null
  } catch { return null }
}

app.post('/scrape-url', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = scrapeUrlSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid URL' }, 400)

  const { url } = parsed.data

  const scraperUrl = process.env.SCRAPER_URL
  if (!scraperUrl) return c.json({ error: 'Scraper not available' }, 503)

  const source = detectSource(url)
  if (!source) return c.json({ error: 'Unsupported URL source' }, 422)

  try {
    const res = await fetch(`${scraperUrl}/scrape/job-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, url }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return c.json({ error: 'Scrape failed' }, 502)

    const data = await res.json() as { company: string | null; jobTitle: string | null; location: string | null }
    if (!data.company || !data.jobTitle) return c.json({ error: 'Could not extract job details' }, 422)

    return c.json({ company: data.company, jobTitle: data.jobTitle, location: data.location ?? null })
  } catch {
    return c.json({ error: 'Scrape failed' }, 502)
  }
})
```

**Route order**: Register `app.post('/scrape-url', ...)` BEFORE `app.post('/', ...)` in the file.

### 3. `POST /api/jobs` — New Server Endpoint

**File:** `src/server/routes/api-jobs.ts` (add before `app.patch('/:id', ...)`)

```typescript
const manualJobSchema = z.object({
  company: z.string().min(1),
  jobTitle: z.string().min(1),
  location: z.string().optional(),   // optional — stored as null if absent or blank
  sourceUrl: z.string().url(),
})

app.post('/', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = manualJobSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400)

  const { company, jobTitle, location, sourceUrl } = parsed.data
  const locationValue = location?.trim() || null

  const existing = db.select({ id: jobs.id }).from(jobs)
    .where(and(eq(jobs.company, company), eq(jobs.jobTitle, jobTitle))).get()
  if (existing) return c.json({ error: 'Job already exists' }, 409)

  const dateScraped = new Date().toISOString()
  db.insert(jobs).values({
    company, jobTitle,
    location: locationValue,
    sourceUrl,
    source: 'Manual',
    analysisStatus: 'pending',
    dateScraped,
  }).run()

  const created = db.select().from(jobs)
    .where(and(eq(jobs.company, company), eq(jobs.jobTitle, jobTitle))).get()!
  return c.json({ job: created }, 201)
})
```

**Why check-first instead of `onConflictDoNothing().returning()`**: With bun:sqlite + Drizzle, `returning()` on `onConflictDoNothing()` returns nothing on conflict — no way to distinguish insert vs. silently ignored. The explicit check gives a clear 409.

### 4. `useAddJobMutation` Hook

**File:** `src/client/hooks/useAddJobMutation.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface AddJobInput {
  company: string
  jobTitle: string
  location: string | null
  sourceUrl: string
}

export function useAddJobMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: AddJobInput) => {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        throw new Error(err.error ?? 'Failed to add job')
      }
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}
```

### 5. `AddJobDrawer` Component

**File:** `src/client/components/pipeline/AddJobDrawer.tsx`

```typescript
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { Button } from '../ui/button'
import { useAddJobMutation } from '../../hooks/useAddJobMutation'

interface AddJobDrawerProps {
  open: boolean
  prefillUrl: string
  onClose: () => void
  onSuccess: () => void
}

export function AddJobDrawer({ open, prefillUrl, onClose, onSuccess }: AddJobDrawerProps) {
  const [company, setCompany] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [location, setLocation] = useState('')
  const [url, setUrl] = useState(prefillUrl)
  const mutation = useAddJobMutation()

  // Company, Job Title, and URL are required; Location is optional
  const isValid = company.trim().length > 0 && jobTitle.trim().length > 0 && url.trim().length > 0

  function handleSubmit() {
    mutation.mutate(
      {
        company: company.trim(),
        jobTitle: jobTitle.trim(),
        location: location.trim() || null,
        sourceUrl: url.trim(),
      },
      {
        onSuccess: () => {
          onSuccess()
          onClose()
        },
      }
    )
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add Job</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Company *</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Acme Corp"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Job Title *</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              placeholder="Senior Software Engineer"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Location</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Remote (optional)"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">URL *</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>

          {mutation.isError && (
            <p className="text-xs text-red-400">{mutation.error?.message ?? 'Failed to add job'}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!isValid || mutation.isPending}
            className="mt-2"
          >
            {mutation.isPending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

**Form state reset**: Pass `key={addJobUrl}` (or a counter) on `<AddJobDrawer>` so form resets each time it opens for a new URL:
```tsx
<AddJobDrawer key={addJobUrl} open={isAddJobDrawerOpen} prefillUrl={addJobUrl} ... />
```

### 6. `PipelineRoute` State Changes

**File:** `src/client/routes/index.tsx`

```typescript
type AddJobMode = 'idle' | 'url-input' | 'scraping' | 'scrape-failed'

// Add inside PipelineRoute:
const [addJobMode, setAddJobMode] = useState<AddJobMode>('idle')
const [addJobUrl, setAddJobUrl] = useState('')
const [isAddJobDrawerOpen, setIsAddJobDrawerOpen] = useState(false)
const queryClient = useQueryClient()   // from '@tanstack/react-query'

async function handleScrapeSubmit() {
  setAddJobMode('scraping')
  try {
    const scrapeRes = await fetch('/api/jobs/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: addJobUrl }),
    })
    if (scrapeRes.ok) {
      const scraped = await scrapeRes.json() as { company: string; jobTitle: string; location: string | null }
      const createRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: scraped.company, jobTitle: scraped.jobTitle, location: scraped.location, sourceUrl: addJobUrl }),
      })
      if (createRes.ok) {
        await queryClient.invalidateQueries({ queryKey: ['jobs'] })
        setAddJobMode('idle')
        setAddJobUrl('')
        return
      }
    }
  } catch { /* network error — fall through to scrape-failed */ }
  setAddJobMode('scrape-failed')
}
```

**Action bar JSX additions:**

```tsx
{/* In the action bar div, alongside Discovery/Analysis buttons: */}
{addJobMode === 'idle' && (
  <Button
    variant="outline"
    size="sm"
    disabled={discoveryStream.isPending || analysisStream.isPending}
    onClick={() => setAddJobMode('url-input')}
  >
    Add Job by URL
  </Button>
)}

{addJobMode === 'url-input' && (
  <div className="flex items-center gap-2">
    <span className="text-sm text-zinc-400">Job URL:</span>
    <input
      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-64"
      value={addJobUrl}
      onChange={e => setAddJobUrl(e.target.value)}
      placeholder="https://..."
      autoFocus
    />
    <Button size="sm" variant="outline" onClick={handleScrapeSubmit} disabled={!addJobUrl.trim()}>
      Submit
    </Button>
    <Button size="sm" variant="ghost" onClick={() => { setAddJobMode('idle'); setAddJobUrl('') }}>
      Cancel
    </Button>
  </div>
)}

{addJobMode === 'scraping' && (
  <div className="flex items-center gap-2">
    <span className="text-sm text-zinc-400">Job URL:</span>
    <input className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-64" value={addJobUrl} disabled />
    <Button size="sm" variant="outline" disabled>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scraping…
    </Button>
    <Button size="sm" variant="ghost" disabled>Cancel</Button>
  </div>
)}

{addJobMode === 'scrape-failed' && (
  <div className="flex items-center gap-2">
    <span className="text-sm text-zinc-400">Unable to scrape, add manually?</span>
    <Button size="sm" variant="outline" onClick={() => { setIsAddJobDrawerOpen(true) }}>Yes</Button>
    <Button size="sm" variant="ghost" onClick={() => { setAddJobMode('idle'); setAddJobUrl('') }}>No</Button>
  </div>
)}
```

**Mount the drawer** (add alongside `<JobDrawer>`):
```tsx
<AddJobDrawer
  key={addJobUrl}
  open={isAddJobDrawerOpen}
  prefillUrl={addJobUrl}
  onClose={() => { setIsAddJobDrawerOpen(false); setAddJobMode('idle'); setAddJobUrl('') }}
  onSuccess={() => { /* invalidation handled inside useAddJobMutation.onSuccess */ }}
/>
```

### 7. Testing

**File:** `src/server/routes/api-jobs.test.ts`

The existing `CREATE_JOBS_TABLE` SQL may be missing newer columns (e.g., `date_analyzed TEXT`). Verify the DDL matches all columns Drizzle's SELECT references; add missing columns or the test suite will throw "no such column" errors at runtime.

New test cases:

```
describe('POST /api/jobs'):
  - creates job with source=Manual, analysisStatus=pending → 201
  - returns 409 if same company+jobTitle already exists
  - returns 400 for missing company
  - returns 400 for missing jobTitle
  - returns 400 for non-URL sourceUrl
  - stores null location when location omitted

describe('POST /api/jobs/scrape-url'):
  - returns 400 for invalid (non-URL) input
  - returns 503 when SCRAPER_URL env var is not set
  - returns 422 for an unrecognized URL hostname (e.g. greenhouse.io)
  - returns { company, jobTitle, location } on successful scraper response (mock SCRAPER_URL fetch)
  - returns 502 when the scraper endpoint returns non-2xx (mock)
  - returns 422 when scraper returns null company or jobTitle (mock)
```

For `POST /api/jobs/scrape-url` tests: mock `globalThis.fetch` to simulate scraper responses; restore in `afterEach`.

---

## Dev Notes

### Files to create

| File | Purpose |
|------|---------|
| `src/client/hooks/useAddJobMutation.ts` | `POST /api/jobs` TanStack mutation hook |
| `src/client/components/pipeline/AddJobDrawer.tsx` | Manual job entry Sheet overlay |

### Files to modify

| File | Change |
|------|--------|
| `scraper/src/scrapers/linkedin.js` | Add `fetchLinkedInJobDetails(url)` export |
| `scraper/src/scrapers/indeed.js` | Add `fetchIndeedJobDetails(url)` export |
| `scraper/src/scrapers/indeed_nl.js` | Add `fetchIndeedNlJobDetails(url)` export |
| `scraper/src/routes/scrape.js` | Add `POST /scrape/job-details` route |
| `src/server/routes/api-jobs.ts` | Add `POST /scrape-url` and `POST /` endpoints |
| `src/server/routes/api-jobs.test.ts` | Add tests; verify CREATE TABLE DDL completeness |
| `src/client/routes/index.tsx` | URL input state machine, button, `AddJobDrawer` mount |

### Critical project rules

1. **Error shape**: `{ error: string }` only — never `{ message }`, never envelopes
2. **Route mounting**: `api-jobs.ts` mounted at `/api/jobs` → `app.post('/')` = `POST /api/jobs`; `app.post('/scrape-url')` = `POST /api/jobs/scrape-url`
3. **Route order in `api-jobs.ts`**: `POST /scrape-url` must be registered BEFORE `POST /` to avoid Hono matching `/scrape-url` as an `:id` param route. (Current `GET /:id` is a GET; the conflict is with `POST /` vs `POST /scrape-url` — Hono routes by method+path, so no actual conflict. Still, ordering `/scrape-url` first is clearest.)
4. **Unique constraint** `(company, job_title)`: check-first + 409; do NOT use `onConflictDoNothing().returning()` — unreliable for detecting conflicts with bun:sqlite
5. **Data ownership**: `company`, `jobTitle`, `location`, `sourceUrl`, `source`, `dateScraped`, `analysisStatus` set on create — never writable via PATCH
6. **TanStack Query key**: `['jobs']` — invalidate via `useQueryClient().invalidateQueries` after any successful mutation
7. **UI state only in useState**: `addJobMode`, `addJobUrl`, `isAddJobDrawerOpen` are pure UI — `useState` is correct; no Query cache involvement
8. **No toasts**: inline `text-red-400` error text, same pattern as `JobDrawer`
9. **Sheet imports**: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `../ui/sheet`
10. **Drawer is not a route**: `AddJobDrawer` is a Sheet overlay, same as `JobDrawer`
11. **Scraper JS is CommonJS-style ESM** (`.js` files using `import`/`export`, no TypeScript) — do not add types or `.ts` extensions in scraper files
12. **TypeScript strict**: no `_` prefix suppression; no unused vars; no inline type redefinitions — import `Job` from `@shared/schemas` if needed

### Scraper DOM selector fragility

LinkedIn and Indeed change their markup. The selectors provided target the current structure (April 2026) with legacy fallbacks. If all selectors return `null`, `fetchLinkedInJobDetails` / `fetchIndeedJobDetails` returns `{ jobTitle: null, company: null, location: null }` — the server-side endpoint returns 422 — the client shows "Unable to scrape, add manually?". This is the correct graceful-degradation path.

### Arc URLs

Arc (arc.dev) has no listing fetcher and is not supported by `/scrape/job-details`. `detectSource('https://arc.dev/...')` returns `null` → 422 → client shows manual form. This is acceptable.

### `SCRAPER_URL` availability

`SCRAPER_URL` is set dynamically by `startScraperProcess()` in `src/server/services/scraper-process.ts` at app startup. In production it is always set. In tests, it may be absent — the `POST /api/jobs/scrape-url` handler checks and returns 503 if missing.

---

## Review Findings

- [x] [Review][Decision] POST /api/jobs non-2xx in auto-scrape path shows misleading "Unable to scrape, add manually?" — Fixed: 409 now transitions to `job-exists` mode showing "This job already exists." inline; other create failures still fall through to `scrape-failed`. [src/client/routes/index.tsx]
- [x] [Review][Patch] Non-null assertion `!` on post-insert re-select will throw runtime error if row not found [src/server/routes/api-jobs.ts] — Fixed: null check added, returns 500 on miss.
- [x] [Review][Patch] AbortSignal.timeout(30_000) equals scraper's own 30 s page.goto timeout — upstream fetch aborts before scraper completes a single attempt [src/server/routes/api-jobs.ts] — Fixed: increased to 40_000.
- [x] [Review][Patch] data.location from scraper may be `undefined` (not null) [src/server/routes/api-jobs.ts] — Dismissed: `?? null` handles both null and undefined in JS.
- [x] [Review][Defer] detectSource maps all *.indeed.com subdomains (ca, uk, de, etc.) to `indeed` scraper — wrong selectors for country domains; graceful degradation (422 → manual form) mitigates [src/server/routes/api-jobs.ts] — deferred, pre-existing
- [x] [Review][Defer] scrapeWithRetry error in /scrape/job-details unhandled — propagates as generic Fastify 500 with no structured error; pre-existing pattern in scraper codebase [scraper/src/routes/scrape.js] — deferred, pre-existing
- [x] [Review][Defer] AUTH_DIR/AUTH_PATH assumption in linkedin.js — pre-existing; new function inherits same setup [scraper/src/scrapers/linkedin.js] — deferred, pre-existing
- [x] [Review][Defer] page.evaluate uses innerText (layout-dependent) instead of textContent — pre-existing pattern in scraper codebase [scraper/src/scrapers/linkedin.js, indeed.js, indeed_nl.js] — deferred, pre-existing

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `fetchLinkedInJobDetails`, `fetchIndeedJobDetails`, `fetchIndeedNlJobDetails` in respective scraper files using Playwright page evaluation with current (April 2026) selectors and legacy fallbacks.
- Added `POST /scrape/job-details` Fastify route to scraper with `JobDetailsSchema` validation.
- Added `POST /api/jobs/scrape-url` to `api-jobs.ts`: detects source from URL hostname (`linkedin.com` → linkedin, `nl.indeed.com` → indeed_nl, `*.indeed.com` → indeed; else 422), proxies to scraper, validates extracted fields.
- Added `POST /api/jobs` to `api-jobs.ts`: `manualJobSchema` validates required fields, check-first 409 for duplicate company+jobTitle, inserts with `source=Manual`, `analysisStatus=pending`.
- Added `date_analyzed TEXT` column to `CREATE_JOBS_TABLE` DDL in `api-jobs.test.ts` (was missing, per story guidance).
- Created `useAddJobMutation` hook; invalidates `['jobs']` on success.
- Created `AddJobDrawer` Sheet overlay; Company/JobTitle/URL required, Location optional; inline `text-red-400` error on failure; `key={addJobUrl}` ensures form resets each open.
- Updated `PipelineRoute` with `AddJobMode` state machine (`idle → url-input → scraping → scrape-failed`); "Add Job by URL" button disabled during webhook streams; drawer mounted in both the populated and empty-state return paths.
- All 45 tests in `api-jobs.test.ts` pass (12 new tests added for `POST /api/jobs` and `POST /api/jobs/scrape-url`).
- Build succeeds with no new TypeScript errors.

### File List

- `scraper/src/scrapers/linkedin.js` — added `fetchLinkedInJobDetails`
- `scraper/src/scrapers/indeed.js` — added `fetchIndeedJobDetails`
- `scraper/src/scrapers/indeed_nl.js` — added `fetchIndeedNlJobDetails`
- `scraper/src/routes/scrape.js` — added `POST /scrape/job-details` route
- `src/server/routes/api-jobs.ts` — added `POST /scrape-url` and `POST /` endpoints
- `src/server/routes/api-jobs.test.ts` — added `date_analyzed` to DDL; added 12 new tests
- `src/client/hooks/useAddJobMutation.ts` — new file
- `src/client/components/pipeline/AddJobDrawer.tsx` — new file
- `src/client/routes/index.tsx` — `AddJobMode` state machine, URL input UI, `AddJobDrawer` mount
