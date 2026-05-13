---
title: 'Fix Indeed scraper stale DOM selectors'
type: 'bugfix'
created: '2026-05-13'
status: 'done'
baseline_commit: '21e0497e6ddaa4fb40cec01c79c75dd98afc119a'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Indeed (and indeed_nl) scraper's `searchIndeed` function returns 0 jobs during discovery because the `span[id^="jobTitle-"]` title selector no longer matches Indeed's current DOM — job titles now live in the `title` attribute of a `span[title]` element — causing every job to have `title: null` and be silently dropped by discovery-service.ts:147.

**Approach:** Update the title selector in both `indeed.js` and `indeed_nl.js` to use `span[title]` with `.getAttribute('title')` → `.innerText` fallback, and add a defensive fallback chain for the card container (`job_seen_beacon → td.resultContent → [data-testid="slider_item"]`) in case that class has shifted too.

## Boundaries & Constraints

**Always:**
- Keep the `{ id, title, company, location, url, postedAt }` return shape identical — discovery-service.ts depends on it
- `a[data-jk]` remains the correct loop anchor; do not change the outer selector
- `[data-testid="company-name"]` and `[data-testid="text-location"]` are stable; leave them as-is
- Apply identical fixes to both `indeed.js` and `indeed_nl.js`

**Ask First:**
- If, after the selector fix, the card container fallback chain still returns null for all cards and company stays null, halt and report before attempting a deeper DOM or JSON-extraction refactor

**Never:**
- Do not switch to JSON extraction from `window.mosaic.providerData` — that is a larger separate refactor
- Do not touch `fetchIndeedListing` or `fetchIndeedJobDetails` — they use different selectors unrelated to discovery

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Span has `title` attribute | `<span title="Software Engineer">…</span>` inside `a[data-jk]` | `title` = `"Software Engineer"` from `.getAttribute('title')` | N/A |
| Span lacks `title` attr but has innerText | `<span>Software Engineer</span>` | `title` = `"Software Engineer"` from `.innerText` fallback | N/A |
| `.job_seen_beacon` absent | card class changed on Indeed | Falls through to `td.resultContent` then `[data-testid="slider_item"]` | Returns null for company/location; does not throw |
| No `a[data-jk]` found | Bot-blocked or page not loaded | `hasResults` guard returns `[]` early | Already handled by existing guard |

</frozen-after-approval>

## Code Map

- `job-hunt-dashboard/scraper/src/scrapers/indeed.js` -- Primary fix target: `searchIndeed` title selector and card container fallback
- `job-hunt-dashboard/scraper/src/scrapers/indeed_nl.js` -- Identical selector code; same fix required
- `job-hunt-dashboard/src/server/services/discovery-service.ts:147` -- Filter dropping rows with null title/company (reference only — no change needed)

## Tasks & Acceptance

**Execution:**
- [x] `job-hunt-dashboard/scraper/src/scrapers/indeed.js` -- In `searchIndeed`, replace `link.querySelector('span[id^="jobTitle-"]')?.innerText` with a `span[title]` → `span` fallback using `.getAttribute('title') || .innerText`; replace `link.closest('.job_seen_beacon')` with a three-way fallback chain -- Ensures title and company are non-null so rows survive the discovery-service filter
- [x] `job-hunt-dashboard/scraper/src/scrapers/indeed_nl.js` -- Apply the identical title selector and card container changes -- Keeps indeed_nl parity with indeed

**Acceptance Criteria:**
- Given a live Indeed search page with job listings, when `searchIndeed` runs, then the returned array items have non-null `title` and `company` values
- Given the title selector logic, when evaluating a `a[data-jk]` link, then `span[title]` with `.getAttribute('title')` is tried first, `.innerText` as fallback — `span[id^="jobTitle-"]` is not referenced anywhere
- Given the card lookup, when `.job_seen_beacon` is absent from the ancestor chain, then `td.resultContent` and `[data-testid="slider_item"]` are tried before returning null

## Spec Change Log

## Design Notes

The job title in Indeed's current DOM is stored as the `title` attribute on a `<span[title]>` inside the `a[data-jk]` anchor. The `title` attribute (browser tooltip text) is the stable contract; innerText is kept as a secondary fallback in case the attribute is present but empty. The generic `span` fallback was dropped after review — it was too broad and would silently match badge/screen-reader spans. Final pattern:

```js
const titleEl = link.querySelector('span[title]');
const title = titleEl?.getAttribute('title')?.trim() || titleEl?.innerText?.trim() || null;
```

`[data-testid="slider_item"]` was also removed from the card fallback chain after review — it is a multi-job carousel container, not a single-card wrapper, and would cause title/company mismatches.

## Verification

**Manual checks (if no CLI):**
- Trigger a discovery run and confirm server logs show `[DISCOVERY] ← indeed results: N jobs` with N > 0
- In browser devtools on `indeed.com/jobs?q=software+engineer`, verify `[...document.querySelectorAll('a[data-jk]')][0].querySelector('span[title]')?.getAttribute('title')` returns the job title string

## Suggested Review Order

- Entry point: new `span[title]` title selector replacing stale `span[id^="jobTitle-"]`
  [`indeed.js:29`](../../job-hunt-dashboard/scraper/src/scrapers/indeed.js#L29)

- Title resolution: `getAttribute('title')` → `innerText` fallback chain
  [`indeed.js:30`](../../job-hunt-dashboard/scraper/src/scrapers/indeed.js#L30)

- Card container fallback: `.job_seen_beacon` → `td.resultContent`
  [`indeed.js:27`](../../job-hunt-dashboard/scraper/src/scrapers/indeed.js#L27)

- Parity fix for Dutch Indeed (identical changes)
  [`indeed_nl.js:31`](../../job-hunt-dashboard/scraper/src/scrapers/indeed_nl.js#L31)
