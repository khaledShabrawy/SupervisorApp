const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.REVIEW_BASE_URL || 'http://127.0.0.1:4174';
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname), 'A loopback preview is required');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
 const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
 try {
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByTestId('input-email').waitFor();
  const paths = await page.evaluate(async () => ['./', ...(await (await fetch('/asset-manifest.json')).json()).assets]);
  let snapshot;
  for (let attempt = 0; attempt < 60; attempt++) {
    snapshot = await page.evaluate(async ({ base, paths }) => {
      const urls = [];
      for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
      const missing = [];
      for (const path of paths) if (!await caches.match(new URL(path, base).href)) missing.push(path);
      return { controlled: !!navigator.serviceWorker.controller, urls, missing };
    }, { base, paths });
    if (snapshot.controlled && snapshot.urls.length > 10 && snapshot.missing.length === 0) break;
    await page.waitForTimeout(250);
  }
  assert.ok(snapshot.controlled && snapshot.missing.length === 0, 'All versioned shell assets must be cached before going offline');
  const entries = snapshot.urls;
  assert.ok(entries.length > 10, 'The actual built shell assets must be cached');
  assert.ok(entries.every(url => new URL(url).origin === new URL(base).origin && !/\/(rest|auth|storage)\/v1\//.test(url)), 'Private backend data must not enter the shell cache');
  await context.setOffline(true);
  const response = await page.goto(base + '/visits');
  assert.equal(response.status(),200);
  await page.getByTestId('input-email').waitFor();
  assert.equal(errors.length,0,errors.join('\n'));
  const output=process.env.REVIEW_OUTPUT_DIR || '/tmp/mydan-pwa-review';fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:output+'/offline-shell.png',fullPage:true});
  console.log(JSON.stringify({status:'passed',checks:['built service worker activation','public shell cached','no private API cache','offline navigation renders app shell'],cachedEntries:entries.length}));
 } finally {await context.close();await browser.close();}
})().catch(error => { console.error(error); process.exitCode=1; });
