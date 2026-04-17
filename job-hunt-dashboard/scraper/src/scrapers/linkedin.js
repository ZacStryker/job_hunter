import path from 'path';
import { withPage, scrapeWithRetry } from './base.js';

const AUTH_PATH = path.resolve(process.env.AUTH_DIR, 'linkedin.json');

export async function searchLinkedIn({ query, location = 'Remote', maxResults = 25 }) {
  return scrapeWithRetry('linkedin', () => {
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&sortBy=DD&f_TPR=r86400`;
    return withPage(AUTH_PATH, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('div[data-job-id]', { timeout: 20000 });
      await page.waitForTimeout(2000 + Math.random() * 2000);

      return page.evaluate((max) => {
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
    });
  });
}

export async function fetchLinkedInListing(url) {
  return scrapeWithRetry('linkedin', () =>
    withPage(AUTH_PATH, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[data-testid="expandable-text-box"]', { timeout: 20000 });
      return page.evaluate(() =>
        document.querySelector('[data-testid="expandable-text-box"]')?.innerText?.trim() ?? ''
      );
    })
  );
}
