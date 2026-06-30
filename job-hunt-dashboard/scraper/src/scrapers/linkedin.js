import { withFirefoxPage, scrapeWithRetry } from './base.js';

// A logged-out / expired LinkedIn session lands on an auth-wall, login, or
// checkpoint page instead of the jobs search results.
const AUTH_WALL_PATTERNS = ['/authwall', '/login', '/uas/login', '/checkpoint'];
const isAuthWall = (currentUrl) => AUTH_WALL_PATTERNS.some((p) => currentUrl.includes(p));

export async function searchLinkedIn({ query, location = 'Remote', maxResults = 25, storageStatePath = null }) {
  return scrapeWithRetry('linkedin', () => {
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&sortBy=DD&f_TPR=r86400`;
    return withFirefoxPage(storageStatePath, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      if (isAuthWall(page.url())) return { results: [], sessionInvalid: true };

      try {
        await page.waitForSelector('div[data-job-id]', { timeout: 80000 });
      } catch (err) {
        // Distinguish a sign-in interstitial (session invalid) from a generic
        // failure (inconclusive — must not flip LinkedIn health).
        const signedOut = isAuthWall(page.url())
          || await page.$('input[name="session_key"], .authwall, form.login__form').then((el) => Boolean(el)).catch(() => false);
        if (signedOut) return { results: [], sessionInvalid: true };
        throw err;
      }
      await page.waitForTimeout(2000 + Math.random() * 2000);

      const results = await page.evaluate((max) => {
        const cards = [...document.querySelectorAll('div[data-job-id]')].slice(0, max);
        return cards.map(card => {
          const timeEl = card.querySelector('time[datetime]');
          return {
            id: card.getAttribute('data-job-id'),
            title: card.querySelector('a.job-card-list__title--link')?.getAttribute('aria-label')?.replace(/ with verification$/, '').trim() ?? null,
            company: card.querySelector('.artdeco-entity-lockup__subtitle span')?.innerText?.trim() ?? null,
            location: card.querySelector('.job-card-container__metadata-wrapper li span')?.innerText?.trim() ?? null,
            url: (() => { const a = card.querySelector('a.job-card-container__link'); return a ? 'https://www.linkedin.com' + a.getAttribute('href').split('?')[0] : null; })(),
            snippet: null,
            postedAt: timeEl?.getAttribute('datetime') ?? null,
          };
        });
      }, maxResults);
      return { results, sessionInvalid: false };
    });
  }, 1);
}

export async function fetchLinkedInListing(url, storageStatePath = null) {
  return scrapeWithRetry('linkedin', () =>
    withFirefoxPage(storageStatePath, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[data-testid="expandable-text-box"]', { timeout: 20000 });
      return page.evaluate(() =>
        document.querySelector('[data-testid="expandable-text-box"]')?.innerText?.trim() ?? ''
      );
    })
  );
}

export async function fetchLinkedInJobDetails(url, storageStatePath = null) {
  return scrapeWithRetry('linkedin', () =>
    withFirefoxPage(storageStatePath, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
    }), 0);
}
