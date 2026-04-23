import { Database } from 'bun:sqlite';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

const FIREFOX_COOKIES = '/home/zac/snap/firefox/common/.mozilla/firefox/gis9hy19.default/cookies.sqlite';
const SESSION_PATH = resolve(process.cwd(), process.argv[2] ?? 'sessions/indeed_nl.json');

// Build Firefox UA from installed version so cf_clearance stays valid
const ffVersion = execSync('firefox --version 2>/dev/null || /snap/bin/firefox --version').toString().match(/(\d+\.\d+[\.\d]*)/)?.[1] ?? '149.0';
const major = ffVersion.split('.')[0];
const userAgent = `Mozilla/5.0 (X11; Linux x86_64; rv:${major}.0) Gecko/20100101 Firefox/${ffVersion}`;

// Copy the DB first — Firefox holds a write lock on the live file
const tmp = `${tmpdir()}/firefox-cookies-${Date.now()}.sqlite`;
copyFileSync(FIREFOX_COOKIES, tmp);

const db = new Database(tmp, { readonly: true });
const rows = db.query(
  `SELECT name, value, host, path, expiry, isHttpOnly, isSecure, sameSite
   FROM moz_cookies
   WHERE host LIKE '%indeed.com'`
).all();
db.close();

const SAME_SITE = { 0: 'None', 1: 'Lax', 2: 'Strict' };

const cookies = rows.map((r) => ({
  name: r.name,
  value: r.value,
  domain: r.host,
  path: r.path,
  expires: r.expiry,
  httpOnly: r.isHttpOnly === 1,
  secure: r.isSecure === 1,
  sameSite: SAME_SITE[r.sameSite] ?? 'None',
}));

mkdirSync('sessions', { recursive: true });
Bun.write(SESSION_PATH, JSON.stringify({ cookies, origins: [], userAgent }, null, 2));

console.log(`Saved ${cookies.length} indeed.com cookies to ${SESSION_PATH}`);
console.log(`User-Agent: ${userAgent}`);
