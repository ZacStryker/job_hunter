import { chromium } from 'playwright-extra';
import { firefox } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const POOL_SIZE = 2;
let browsers = [];
let firefoxBrowser = null;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

export async function initPool() {
  [browsers, firefoxBrowser] = await Promise.all([
    Promise.all(
      Array.from({ length: POOL_SIZE }, () =>
        chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      )
    ),
    firefox.launch({ headless: true }),
  ]);
  console.log(`Browser pool initialized (${POOL_SIZE} Chromium + 1 Firefox)`);
}

export async function getPage(storageStatePath = null, contextOverrides = {}) {
  const browser = browsers[Math.floor(Math.random() * browsers.length)];
  const contextOptions = {
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ...contextOverrides,
  };
  if (storageStatePath) {
    contextOptions.storageState = storageStatePath;
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return { page, context };
}

export async function releasePage(context) {
  await context.close();
}

export async function getFirefoxPage(storageStatePath = null, contextOverrides = {}) {
  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
    ...contextOverrides,
  };
  if (storageStatePath) contextOptions.storageState = storageStatePath;
  const context = await firefoxBrowser.newContext(contextOptions);
  const page = await context.newPage();
  return { page, context };
}

export async function destroyPool() {
  await Promise.all([...browsers.map(b => b.close()), firefoxBrowser?.close()]);
}
