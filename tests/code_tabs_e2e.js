// Live test of Code's Artifacts / Preview / Settings tabs on the real page, desktop + iPhone size.
// Run like e2e.js (from %TEMP%\lumen-e2e with playwright-core and the installed Edge):
//   set OCPW=<C:\AI\secrets\opencode-password.txt> & node code_tabs_e2e.js [project]
const { chromium, devices } = require('playwright-core');
const path = require('path');
const URL = process.env.LUMEN_URL || (() => { throw new Error('Set LUMEN_URL to your Lumen address, e.g. https://your-desktop.your-tailnet.ts.net/'); })();
const WS = new globalThis.URL(URL).origin + ':8443';
const OUT = process.env.LUMEN_SHOTS || path.join(__dirname, 'shots');
const PROJECT = process.argv[2] || 'Snake Game';
const log = m => console.log(`${new Date().toTimeString().slice(0, 8)} ${m}`);
async function waitBoot(page, label, timeout = 240000) {
  const start = Date.now(); await page.waitForTimeout(400);
  while (Date.now() - start < timeout) {
    const st = await page.evaluate(() => { const b = document.getElementById('boot'), go = document.getElementById('bootGo');
      return { on: b.classList.contains('on'), err: b.classList.contains('error'), go: go && !go.hidden, text: b.innerText.replace(/\s+/g, ' ').slice(0, 200) }; });
    if (!st.on) { log(`  ${label}: ready after ${((Date.now() - start) / 1000).toFixed(1)}s`); return; }
    if (st.err) throw new Error(`${label}: ${st.text}`);
    if (st.go) await page.click('#bootGo');
    await page.waitForTimeout(1000);
  }
  throw new Error(`${label}: still loading`);
}
async function run(browser, name, opts) {
  const ctx = await browser.newContext({ ...opts, colorScheme: 'dark', httpCredentials: { username: 'opencode', password: process.env.OCPW || '', origin: WS } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(`pageerror: ${e}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|401|ERR_ABORTED|status of 499|CORS policy|ERR_FAILED/.test(m.text())) errs.push(`console: ${m.text()}`); });
  const shot = s => page.screenshot({ path: path.join(OUT, `codetabs-${name}-${s}.png`) });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await waitBoot(page, 'initial');
  const projects = await page.evaluate(() => fetch('/gw/code/projects').then(r => r.json()));
  const p = projects.projects.find(x => x.name === PROJECT);
  if (!p) throw new Error('no project ' + PROJECT);
  const b64 = Buffer.from(p.path, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await page.evaluate(([u]) => { localStorage.setItem('lumen.code.ws', JSON.stringify(u)); localStorage.setItem('lumen.code.state', JSON.stringify('workspace')); }, [WS + '/' + b64 + '/session']);
  await page.click('#views button[data-view="code"]');
  await waitBoot(page, 'code');
  await page.waitForTimeout(2500); await shot('1-workspace');
  await page.click('#wsTabs [data-tab="art"]');
  await page.waitForSelector('#artList .art-row', { timeout: 15000 });
  const rows = await page.$$eval('#artList .art-row .nm', n => n.map(x => x.textContent));
  log(`  [${name}] artifacts: ${JSON.stringify(rows)} meta="${await page.innerText('#artMeta')}"`);
  await shot('2-artifacts');
  await page.click('#artList .art-row:not(.dir)');
  await page.waitForSelector('#prevBody iframe, #prevBody .prev-media, #prevBody pre, #prevBody .prev-md', { timeout: 15000 });
  await page.waitForTimeout(2500);
  const fr = await page.$('#prevBody iframe');
  if (fr) {
    const sb = await fr.getAttribute('sandbox'); const f = await fr.contentFrame();
    log(`  [${name}] preview iframe sandbox="${sb}" url=${f && f.url()}`);
    // The previewed page must not be able to read Lumen's API (opaque origin).
    const leak = await f.evaluate(() => fetch('/gw/status').then(r => r.text()).then(t => 'READ ' + t.slice(0, 40)).catch(e => 'blocked: ' + e.message)).catch(e => 'eval failed: ' + e.message);
    log(`  [${name}] preview -> /gw/status: ${leak}`);
    if (/^READ/.test(leak)) errs.push('preview page could read the gateway API');
  }
  await shot('3-preview');
  await page.click('#wsTabs [data-tab="set"]');
  await page.waitForSelector('#setList .set-row', { timeout: 30000 });
  const sets = await page.$$eval('#setList .set-row', n => n.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  log(`  [${name}] settings: ${JSON.stringify(sets)} | ${await page.innerText('#setMeta')}`);
  await page.click('#setList .set-row input');
  log(`  [${name}] select: "${await page.innerText('#setSel')}" zip=${await page.getAttribute('#setZip', 'href')}`);
  await page.click('#setDel'); await page.waitForTimeout(300);
  log(`  [${name}] confirm: "${await page.innerText('#setConfirmText')}"`);
  await shot('4-settings'); await page.click('#setNo');
  await page.click('#wsTabs [data-tab="ws"]'); await page.waitForTimeout(500);
  log(`  [${name}] errors: ${errs.length ? errs.join(' | ') : 'none'}`);
  await ctx.close(); return errs.length;
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let bad = 0;
  try { bad += await run(browser, 'desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }); bad += await run(browser, 'phone', devices['iPhone 13']); }
  catch (e) { log('FAIL ' + e.message); bad++; }
  await browser.close(); log(bad ? 'FAILED' : 'PASSED'); process.exit(bad ? 1 : 0);
})();
