import { withPage, scrapeWithRetry, parseRelativeDate } from './base.js';

export async function searchIndeed({ query, location = 'remote', maxResults = 25 }) {
  return scrapeWithRetry('indeed', async () => {
    const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&sort=date&fromage=1`;
    return withPage(null, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const hasResults = await page.waitForSelector('a[data-jk]', { timeout: 15000 }).catch(() => null);
      if (!hasResults) return [];
      await page.waitForTimeout(1000 + Math.random() * 1500);

      const jobs = await page.evaluate((max) => {
        const links = [...document.querySelectorAll('a[data-jk]')].slice(0, max);
        return links.map(link => {
          const card = link.closest('.job_seen_beacon');
          const jk = link.getAttribute('data-jk');
          return {
            id: jk,
            title: link.querySelector(`span[id^="jobTitle-"]`)?.innerText?.trim() ?? null,
            company: card?.querySelector('[data-testid="company-name"]')?.innerText?.trim() ?? null,
            location: card?.querySelector('[data-testid="text-location"]')?.innerText?.trim() ?? null,
            url: `https://www.indeed.com/viewjob?jk=${jk}`,
            snippet: card?.querySelector('[data-testid="attribute_snippet_testid"]')?.innerText?.trim() ?? null,
            _postedText: card?.querySelector('[data-testid="myJobsStateDate"]')?.innerText?.trim() ?? null,
          };
        });
      }, maxResults);

      return jobs.map(({ _postedText, ...job }) => ({
        ...job,
        postedAt: parseRelativeDate(_postedText),
      }));
    });
  });
}

export async function fetchIndeedListing(url) {
  return scrapeWithRetry('indeed', () =>
    withPage(null, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#jobDescriptionText', { timeout: 15000 });
      return page.evaluate(() =>
        document.querySelector('#jobDescriptionText')?.innerText?.trim() ?? ''
      );
    })
  );
}
