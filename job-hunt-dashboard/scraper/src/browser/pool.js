import { firefox } from 'playwright';

const FIREFOX_POOL_SIZE = 2;
let firefoxBrowsers = [];

export async function initPool() {
  firefoxBrowsers = await Promise.all(
    Array.from({ length: FIREFOX_POOL_SIZE }, () =>
      firefox.launch({ headless: true })
    )
  );
  console.log(`Browser pool initialized (${FIREFOX_POOL_SIZE} Firefox)`);
}

export async function releasePage(context) {
  await context.close();
}

export async function getFirefoxPage(storageStatePath = null, contextOverrides = {}) {
  const browser = firefoxBrowsers[Math.floor(Math.random() * firefoxBrowsers.length)];
  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ...contextOverrides,
  };
  if (storageStatePath) contextOptions.storageState = storageStatePath;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return { page, context };
}

export async function destroyPool() {
  await Promise.all(firefoxBrowsers.map(b => b.close()));
}
