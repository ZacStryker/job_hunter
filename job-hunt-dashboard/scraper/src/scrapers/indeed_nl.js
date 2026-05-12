import { withFirefoxPage, scrapeWithRetry, parseRelativeDate } from './base.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

const SESSION_PATH = resolve(process.cwd(), 'sessions/indeed_nl.json');
const sessionPath = () => (existsSync(SESSION_PATH) ? SESSION_PATH : null);

export async function searchIndeedNl({ query, location = '', maxResults = 25 }) {
  return scrapeWithRetry('indeed_nl', async () => {
    const url = `https://nl.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&sort=date&fromage=3`;
    return withFirefoxPage(sessionPath(), async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Cloudflare challenge — wait for it to resolve before looking for results
      await page.waitForFunction(
        () => !document.title.includes('Even geduld') && !document.title.includes('Just a moment'),
        { timeout: 20000 }
      ).catch(() => {});

      const hasResults = await page.waitForSelector('a[data-jk]', { timeout: 15000 }).catch(() => null);
      if (!hasResults) {
        const title = await page.title();
        console.warn(`[indeed_nl] no a[data-jk] found — page title: "${title}" url: ${url}`);
        return [];
      }
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
            url: `https://nl.indeed.com/viewjob?jk=${jk}`,
            snippet: card?.querySelector('[data-testid="attribute_snippet_testid"]')?.innerText?.trim() ?? null,
            _postedText: card?.querySelector('[data-testid="myJobsStateDate"]')?.innerText?.trim() ?? null,
          };
        });
      }, maxResults);

      return jobs.map(({ _postedText, ...job }) => ({
        ...job,
        postedAt: parseRelativeDate(_postedText),
      }));
    }, { locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
  });
}

export async function fetchIndeedNlListing(url) {
  return scrapeWithRetry('indeed_nl', () =>
    withFirefoxPage(sessionPath(), async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#jobDescriptionText', { timeout: 15000 });
      return page.evaluate(() =>
        document.querySelector('#jobDescriptionText')?.innerText?.trim() ?? ''
      );
    }, { locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' })
  );
}

export async function fetchIndeedNlJobDetails(url) {
  return scrapeWithRetry('indeed_nl', () =>
    withFirefoxPage(sessionPath(), async (page) => {
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
    }, { locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' }), 0);
}
