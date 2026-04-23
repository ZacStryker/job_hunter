import { getPage, getFirefoxPage, releasePage } from '../browser/pool.js';
import PQueue from 'p-queue';
import retry from 'p-retry';

// Parses relative date strings like "2 hours ago", "1 day ago", "Just posted" into ISO timestamps.
export function parseRelativeDate(text) {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  const now = Date.now();

  if (/just|today|\bmoment\b/.test(t)) return new Date(now).toISOString();

  const m = t.match(/(\d+)\s*(minute|hour|day|week|month)/);
  if (!m) return null;

  const n = parseInt(m[1]);
  const ms = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000 };
  return new Date(now - n * (ms[m[2]] ?? 0)).toISOString();
}

export function isWithin24Hours(isoString) {
  if (!isoString) return false;
  return Date.now() - new Date(isoString).getTime() <= 86_400_000;
}

// Per-source throttle queues
export const queues = {
  indeed:    new PQueue({ concurrency: 1, interval: 4000, intervalCap: 1 }),
  indeed_nl: new PQueue({ concurrency: 1, interval: 4000, intervalCap: 1 }),
  linkedin:  new PQueue({ concurrency: 1, interval: 7000, intervalCap: 1 }),
  arc:       new PQueue({ concurrency: 1, interval: 3000, intervalCap: 1 }),
};

export async function withFirefoxPage(storageStatePath, fn, contextOverrides = {}) {
  const { page, context } = await getFirefoxPage(storageStatePath, contextOverrides);
  try {
    return await fn(page);
  } finally {
    await releasePage(context);
  }
}

export async function withPage(storageStatePath, fn, contextOverrides = {}) {
  const { page, context } = await getPage(storageStatePath, contextOverrides);
  try {
    // Simulate human: random scroll + wait before extracting
    page.on('load', async () => {
      await page.evaluate(() =>
        window.scrollTo(0, Math.random() * 300)
      ).catch(() => {});
    });
    return await fn(page);
  } finally {
    await releasePage(context);
  }
}

export async function scrapeWithRetry(source, fn, retries = 3) {
  return queues[source].add(() =>
    retry(fn, {
      retries,
      minTimeout: 2000,
      onFailedAttempt: err =>
        console.warn(`[${source}] attempt ${err.attemptNumber} failed: ${err.message}`)
    })
  );
}
