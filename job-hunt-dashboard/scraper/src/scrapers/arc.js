import { withFirefoxPage, scrapeWithRetry, parseRelativeDate, isWithin24Hours } from './base.js';

export async function fetchArcListing(url, storageStatePath = null) {
  return scrapeWithRetry('arc', () =>
    withFirefoxPage(null, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[aria-label="job-detail-content"]', { timeout: 20000 });
      return page.evaluate(() =>
        document.querySelector('[aria-label="job-detail-content"]')?.innerText?.trim() ?? ''
      );
    })
  );
}

export async function searchArc({ query, maxResults = 25 }) {
  return scrapeWithRetry('arc', () => {
    const url = `https://arc.dev/remote-jobs?search=${encodeURIComponent(query)}`;
    return withFirefoxPage(null, async (page) => {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('.job-card', { timeout: 15000 });
      await page.waitForTimeout(1500 + Math.random() * 1000);

      const jobs = await page.evaluate((max) => {
        const cards = [...document.querySelectorAll('.job-card')].slice(0, max);
        return cards.map(card => {
          const titleLink = card.querySelector('a.job-title');
          const timeEl = card.querySelector('time[datetime]');
          const postedText = timeEl?.getAttribute('datetime')
            ?? timeEl?.innerText?.trim()
            ?? card.querySelector('[class*="date"], [class*="posted"], [class*="time"]')?.innerText?.trim()
            ?? null;
          return {
            id: card.getAttribute('data-job-random-key') ?? null,
            title: titleLink?.innerText?.trim() ?? null,
            company: card.querySelector('.company-name')?.innerText?.trim() ?? null,
            location: 'Remote',
            url: titleLink ? 'https://arc.dev' + titleLink.getAttribute('href') : null,
            snippet: null,
            _postedText: postedText,
          };
        });
      }, maxResults);

      return jobs
        .map(({ _postedText, ...job }) => ({
          ...job,
          postedAt: parseRelativeDate(_postedText) ?? _postedText,
        }))
        .filter(job => !job.postedAt || isWithin24Hours(job.postedAt));
    });
  });
}
