// End-to-end test of the live Lumen Studio page, driven through the real UI.
// Runs on the laptop with Microsoft Edge via playwright-core (no browser download):
//   cd %TEMP%\lumen-e2e && npm i playwright-core && node e2e.js [jobs...] [--shots]
// jobs: image upscale edit voice music   (default: all, in that order)
// --shots: also take desktop + iPhone screenshots of every tab, archive and lightbox.
const { chromium, devices } = require('playwright-core');
const fs = require('fs'), path = require('path');

const URL = process.env.LUMEN_URL || (() => { throw new Error('Set LUMEN_URL to your Lumen address, e.g. https://your-desktop.your-tailnet.ts.net/'); })();
const OUT = process.env.LUMEN_SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots');
const ALL = ['image', 'upscale', 'edit', 'voice', 'music'];   // video was cut 2026-11-15
const jobs = args.filter(a => !a.startsWith('--'));
const run = jobs.length ? jobs : (SHOTS ? [] : ALL);
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const errors = [];

async function savedCount(page) {
  return page.evaluate(() => fetch('/gw/status', { cache: 'no-store' }).then(r => r.json()).then(s => s.saved));
}
async function newest(page) {
  return page.evaluate(() => fetch('/gw/gallery', { cache: 'no-store' }).then(r => r.json()).then(g => (g.items || g)[0]));
}
async function waitSaved(page, before, label, maxSec) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxSec) {
    await page.waitForTimeout(3000);
    let n; try { n = await savedCount(page); } catch { continue; }
    if (n > before) {
      const it = await newest(page);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      log(`OK   ${label}: ${sec}s ->`, JSON.stringify({ id: it.id, kind: it.kind, file: it.file, w: it.width, h: it.height, model: it.model, duration: it.duration }));
      return it;
    }
    const sleep = await page.$eval('#sleep', e => e.classList.contains('on') ? e.innerText.replace(/\s+/g, ' ').slice(0, 160) : '').catch(() => '');
    if (/error|failed|couldn/i.test(sleep)) { log(`FAIL ${label}: overlay says: ${sleep}`); return null; }
  }
  log(`FAIL ${label}: nothing saved after ${maxSec}s`); return null;
}
async function openNewest(page, kind) {   // click the archive tile of the newest item of a kind
  const id = await page.evaluate(k => fetch('/gw/gallery', { cache: 'no-store' }).then(r => r.json()).then(g => {
    const ok = it => { const f = (it.file || '').toLowerCase();
      return k === 'image' ? /\.(png|jpe?g|webp)$/.test(f) : k === 'video' ? /\.(webm|mp4)$/.test(f) : /\.(mp3|wav|flac|ogg)$/.test(f); };
    const it = (g.items || g).find(ok); return it && it.id; }), kind);
  if (!id) return false;
  const t = page.locator(`#grid .tile[data-id="${id}"]`);
  await t.scrollIntoViewIfNeeded(); await t.click(); await page.waitForTimeout(1200); return true;
}
async function tab(page, name) { await page.click(`#modes button:has-text("${name}")`); await page.waitForTimeout(400); }
async function seg(page, id, text) { await page.click(`#${id} button:has-text("${text}")`); }
async function go(page, label, maxSec) {
  const before = await savedCount(page);
  await page.click('#goBtn');
  log(`...  ${label} started`);
  const it = await waitSaved(page, before, label, maxSec);
  await page.screenshot({ path: path.join(OUT, `e2e-${label}.png`) });
  return it;
}
async function checkFile(page, it) {
  if (!it) return;
  const r = await page.evaluate(async f => {
    const res = await fetch('/gw/file/' + f, { headers: { Range: 'bytes=0-99' } });
    return { status: res.status, range: res.headers.get('content-range'), type: res.headers.get('content-type') };
  }, it.file);
  log(`     file ${it.file}: ${r.status} ${r.type} ${r.range || ''}`);
}

const JOBS = {
  async image(page) {
    await tab(page, 'Image'); await seg(page, 'imgModel', 'Turbo');   // 'Fast' until the 2026-11-18 rename
    await page.fill('#imgPrompt', 'A red fox standing in fresh snow at golden hour, shallow depth of field, photograph');
    return go(page, 'image', 300);
  },
  async upscale(page) {
    await page.reload(); await page.waitForTimeout(2500);
    await openNewest(page, 'image');
    const before = await savedCount(page);
    await page.click('#lbActions button:has-text("Upscale")');
    await page.click('#lbClose').catch(() => {});
    log('...  upscale started');
    return waitSaved(page, before, 'upscale', 300);
  },
  async edit(page) {
    await page.reload(); await page.waitForTimeout(2500);
    await openNewest(page, 'image');
    await page.click('#lbActions button:has-text("Edit")');
    await page.waitForTimeout(800);
    await page.fill('#editPrompt', 'Make it night time with heavy falling snow and a warm lantern glow');
    await seg(page, 'editSizes', 'Small');
    return go(page, 'edit', 600);
  },
  async voice(page) {
    await tab(page, 'Voice');
    await page.fill('#voiceText', 'Welcome to Lumen Studio. Everything you make here stays on your own desktop. [chuckle] Pretty neat, right?');
    await page.click('#voices button:has-text("Default")').catch(() => {});
    return go(page, 'voice', 400);
  },
  async music(page) {
    await tab(page, 'Music');
    await page.fill('#musicPrompt', 'upbeat synthwave, driving bassline, bright analog leads, 110 bpm');
    if (await page.$eval('#musicInstr', e => e.checked)) await page.click('label:has(#musicInstr)');
    if (!(await page.$eval('#musicAuto', e => e.checked))) await page.click('label:has(#musicAuto)');
    await page.$eval('#musicDur', e => { e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    return go(page, 'music', 900);
  }
};

async function shots(browser) {
  for (const [name, opts] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', devices['iPhone 14']]]) {
    const ctx = await browser.newContext({ ...opts, colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
    for (const t of ['Image', 'Edit', 'Voice', 'Music']) {
      await tab(page, t); await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `${name}-${t.toLowerCase()}.png`), fullPage: name === 'phone' });
    }
    await page.locator('#archive').scrollIntoViewIfNeeded();   // the header link is hidden on phones
    await page.waitForTimeout(1500);
    await page.locator('#archive').screenshot({ path: path.join(OUT, `${name}-archive.png`) });
    for (const kind of ['image', 'video', 'audio']) {
      if (!(await openNewest(page, kind))) continue;
      await page.screenshot({ path: path.join(OUT, `${name}-lb-${kind}.png`) });
      await page.click('#lbClose'); await page.waitForTimeout(300);
    }
    // horizontal overflow check
    if (name === 'phone') {   // viewport shots: sticky Go button in place, top of composer, archive
      await tab(page, 'Image');
      await page.locator('.composer').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, 'phone-view-composer.png') });
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, 'phone-view-top.png') });
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    log(`${name}: horizontal overflow ${over}px`);
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    if (SHOTS) await shots(browser);
    if (run.length) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
      for (const j of run) {
        try { const it = await JOBS[j](page); await checkFile(page, it); }
        catch (e) { log(`FAIL ${j}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `e2e-${j}-fail.png`) }).catch(() => {}); }
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  log(errors.length ? 'page errors:\n  ' + errors.join('\n  ') : 'no page errors');
})();
