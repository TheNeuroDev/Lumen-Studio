// Live test of the header views (Studio / Chat / Code) on the real page, at desktop and iPhone size.
// Run like e2e.js (from %TEMP%\lumen-e2e with playwright-core and the installed Edge):
//   node chat_e2e.js            screenshots go to LUMEN_SHOTS or tests\shots (chat-*.png, code-*.png); set OCPW for the Code workspace
// Each view switch moves the desktop GPU, so this takes a few minutes; it ends back on Studio.
const { chromium, devices } = require('playwright-core');
const path = require('path');
const URL = process.env.LUMEN_URL || (() => { throw new Error('Set LUMEN_URL to your Lumen address, e.g. https://your-desktop.your-tailnet.ts.net/'); })();
// The Code workspace (OpenCode, behind basic auth). Set OCPW to its password (C:\AI\secrets\opencode-password.txt).
const WS = new globalThis.URL(URL).origin + ':8443';
const OUT = process.env.LUMEN_SHOTS || path.join(__dirname, 'shots');
const t0 = Date.now();
const log = m => console.log(`${new Date().toTimeString().slice(0, 8)} ${m}`);

async function waitBoot(page, label, timeout = 240000) {
  const start = Date.now();
  await page.waitForTimeout(400);
  while (Date.now() - start < timeout) {
    const st = await page.evaluate(() => {
      const b = document.getElementById('boot'), go = document.getElementById('bootGo');
      return { on: b.classList.contains('on'), err: b.classList.contains('error'), go: go && !go.hidden, text: b.innerText.replace(/\s+/g, ' ').slice(0, 200) };
    });
    if (!st.on) { log(`  ${label}: loading screen cleared after ${((Date.now() - start) / 1000).toFixed(1)}s`); return true; }
    if (st.err) throw new Error(`${label}: loading screen error: ${st.text}`);
    if (st.go) { log(`  ${label}: boot asks to confirm (${st.text}) -> clicking`); await page.click('#bootGo'); }
    await page.waitForTimeout(1000);
  }
  throw new Error(`${label}: loading screen still up after ${timeout / 1000}s`);
}

async function run(browser, name, opts) {
  const ctx = await browser.newContext({ ...opts, colorScheme: 'dark', httpCredentials: { username: 'opencode', password: process.env.OCPW || '', origin: WS } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(`pageerror: ${e}`));
  page.on('console', m => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
  const shot = s => page.screenshot({ path: path.join(OUT, `chat-${name}-${s}.png`) });
  log(`[${name}] open ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await waitBoot(page, 'initial');

  await page.click('#views button[data-view="chat"]');
  await page.waitForTimeout(300); await shot('1-chat-loading');
  await waitBoot(page, 'chat');
  await page.fill('#chatInput', 'Say hello in five words.');
  const before = await page.locator('.msg.assistant').count();
  const sent = Date.now();
  await page.click('#sendBtn');
  await page.waitForFunction(n => {
    const m = document.querySelectorAll('.msg.assistant');
    if (m.length <= n) return false;
    const last = m[m.length - 1], b = last.querySelector('.body');
    // While the answer streams, the send button turns into Stop.
    return b && b.innerText.trim().length > 0 && document.getElementById('sendBtn').getAttribute('aria-label') !== 'Stop';
  }, before, { timeout: 180000 });
  await page.waitForTimeout(800);
  const reply = await page.locator('.msg.assistant .body').last().innerText();
  log(`  chat reply in ${((Date.now() - sent) / 1000).toFixed(1)}s: ${JSON.stringify(reply.trim().slice(0, 200))}`);
  await shot('2-chat-reply');

  await page.click('#views button[data-view="code"]');
  await page.waitForTimeout(300); await shot('3-code-loading');
  await waitBoot(page, 'code');
  await page.waitForSelector('#codeView', { state: 'visible', timeout: 20000 });
  // Code opens the embedded OpenCode workspace (an iframe under the Lumen header).
  const cshot = s => page.screenshot({ path: path.join(OUT, `code-${name}-${s}.png`) });
  const wsFrame = () => page.frames().find(f => f.url().startsWith(WS));
  if (await page.getAttribute('#codeView', 'data-state') !== 'workspace') await page.click('#codeOpen');
  await page.waitForFunction(ws => [...document.querySelectorAll('#wsStage iframe')].some(f => f.src.startsWith(ws)), WS, { timeout: 30000 });
  await page.waitForTimeout(5000);
  let wf = wsFrame();
  log(`  code workspace: ${wf && wf.url()} title=${wf && await wf.title()} sign-in card=${await page.isVisible('#wsAuth')}`);
  await wf.evaluate(() => { window.__lumenMark = 1; });
  await cshot('1-workspace');
  await page.click('#views button[data-view="chat"]');
  await waitBoot(page, 'chat (from code)');
  await cshot('2-chat');
  await page.click('#views button[data-view="code"]');
  await waitBoot(page, 'code again');
  await page.waitForTimeout(800);
  wf = wsFrame();
  const kept = wf && (await wf.evaluate(() => window.__lumenMark)) === 1;
  log(`  code again: iframes=${await page.locator('#wsStage iframe').count()} same document (not reloaded)=${kept}`);
  if (!kept) errs.push('workspace iframe was reloaded on view switch');
  await cshot('3-workspace-again');
  log(`  pill in Code: "${(await page.innerText('#engineText')).trim()}"`);
  if (!/Code/.test(await page.innerText('#engineText'))) errs.push('engine pill does not say Code');
  // Import a small public repo, then upload a small folder into it.
  await page.click('#wsProjects'); await page.click('#codeNew'); await page.click('#projKind [data-kind="github"]');
  await page.fill('#projGh', 'octocat/Hello-World'); await page.fill('#projName', `e2e-hello-${name}`);
  const ti = Date.now(); await page.click('#projCreate');
  await page.waitForFunction(() => !document.getElementById('projSheet').open, null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  wf = wsFrame();
  log(`  imported octocat/Hello-World in ${((Date.now() - ti) / 1000).toFixed(1)}s -> bar="${await page.innerText('#wsName')}" frame=${wf && wf.url()}`);
  await cshot('4-imported');
  const dir = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'lumen-e2e-'));
  const sub = path.join(dir, 'assets'); require('fs').mkdirSync(path.join(sub, 'img'), { recursive: true });
  require('fs').writeFileSync(path.join(sub, 'readme.txt'), 'uploaded by chat_e2e.js');
  require('fs').writeFileSync(path.join(sub, 'img', 'pixel.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  await page.click('#wsUpload');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#wsUpMenu [data-pick="' + (name === 'phone' ? 'files' : 'dir') + '"]')]);
  if (name === 'phone') await fc.setFiles([path.join(sub, 'readme.txt')]); else await fc.setFiles(sub);   // iPhone has no folder picker
  await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some(t => /Uploaded|Upload failed|over 2 GB/.test(t.textContent)), null, { timeout: 60000 });
  log(`  upload: ${await page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).filter(t => /Upload/.test(t)).join(' | '))}`);
  await cshot('5-uploaded');
  await page.click('#wsProjects'); await page.waitForTimeout(800);
  const projs = await page.evaluate(() => [...document.querySelectorAll('#projGrid a, #projGrid .proj')].map(a => (a.innerText.split('\n')[0] || '') + ' -> ' + (a.getAttribute('href') || '')));
  log(`  code projects: ${JSON.stringify(projs)}`);
  await shot('4-code-projects');

  await page.click('#views button[data-view="studio"]');
  await page.waitForTimeout(300); await shot('5-studio-loading');
  await waitBoot(page, 'studio');
  await page.waitForTimeout(800); await shot('6-studio');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  log(`  horizontal overflow: ${overflow}px`);
  log(`  page errors: ${errs.length ? errs.join(' || ') : 'none'}`);
  await ctx.close();
  return errs.length;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let bad = 0;
  for (const [name, opts] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', devices['iPhone 14']]]) {
    try { bad += await run(browser, name, opts); } catch (e) { bad++; log(`[${name}] FAIL ${e.message}`); }
  }
  await browser.close();
  log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${bad ? 'with problems' : 'all ok'}`);
  process.exit(bad ? 1 : 0);
})();
