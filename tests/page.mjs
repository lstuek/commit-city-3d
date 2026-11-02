// Headless page test: serves the built site, opens it with the fixture city
// data file in headless Chromium (headless shell), and fails on any console
// error, page error, failed request or HTTP error. Always closes the browser.
// Usage: node tests/page.mjs <dist dir>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = resolve(process.argv[2] ?? 'dist');
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.png': 'image/png',
};

// Static server like Pages: "/" -> index.html; /__fixtures/ serves test data.
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const [base, rel] = path.startsWith('/__fixtures/') ? [fixtures, path.slice(12)] : [dist, path.slice(1) || 'index.html'];
  const file = normalize(join(base, rel));
  if (!file.startsWith(normalize(base))) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const problems = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('console', (m) => m.type() === 'error' && problems.push(`console error: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));

  await page.goto(`${origin}/?data=/__fixtures/city.json`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 30_000 })
    .catch(() => problems.push('page never drew 3 frames'));
  const state = await page.evaluate(() => ({ ...document.body.dataset, canvas: !!document.querySelector('canvas') }));
  const gl = await page.evaluate(() => {
    const ctx = document.querySelector('canvas')?.getContext('webgl2');
    const info = ctx?.getExtension('WEBGL_debug_renderer_info');
    return info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  if (state.model !== 'loaded') problems.push('pipeline model did not load');
  if (state.cityData !== '2026-10-28T06:00:00Z') problems.push(`fixture city data not read (got ${state.cityData})`);
  console.log(`page test: ${browser.version()} | renderer ${gl} | model ${state.model} | city data ${state.cityData}`);

  // --- Movement (#5): each mode switches and moves the camera under keyboard, then touch. ---
  const MODES = ['first-person', 'walk', 'drive', 'drone', 'orbit'];
  const ORBIT_CENTER = [0, 2, 0];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // Orbit glides on its own, so its input check is the change in radius (zoom).
  const moved = (mode, idle, before, after) => mode === 'orbit'
    ? Math.abs(dist(after, ORBIT_CENTER) - dist(before, ORBIT_CENTER))
    : dist(before, after) - idle;
  async function checkModes(p, how, hold) {
    const cam = () => p.evaluate(() => document.body.dataset.camera.split(',').map(Number));
    const out = [];
    for (const mode of MODES) {
      await p.click(`button[data-mode="${mode}"]`);
      await p.waitForTimeout(250);
      const a = await cam();
      await p.waitForTimeout(400);
      const b = await cam();
      await hold();
      const c = await cam();
      const active = await p.evaluate(() => document.body.dataset.mode);
      const m = moved(mode, dist(a, b), b, c);
      out.push(`${mode} ${m.toFixed(2)} m`);
      if (active !== mode) problems.push(`${how}: switch to ${mode} left mode ${active}`);
      if (!(m > 0.5)) problems.push(`${how}: ${mode} camera moved only ${m.toFixed(3)} m under input`);
    }
    console.log(`page test: movement ${how}: ${out.join(' | ')}`);
  }

  await page.waitForTimeout(2700); // the fly-in ends
  await checkModes(page, 'keyboard', async () => {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
  });

  // Touch: a phone-like context, reduced motion on (no fly-in), virtual stick on the left half.
  const touchContext = await browser.newContext({ viewport: { width: 960, height: 540 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const touchPage = await touchContext.newPage();
  touchPage.on('console', (m) => m.type() === 'error' && problems.push(`touch console error: ${m.text()}`));
  touchPage.on('pageerror', (e) => problems.push(`touch page error: ${e.message}`));
  await touchPage.goto(`${origin}/?data=/__fixtures/city.json`);
  await touchPage.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 30_000 });
  const cdp = await touchContext.newCDPSession(touchPage);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await checkModes(touchPage, 'touch', async () => {
    await touch('touchStart', 200, 400);
    for (let i = 1; i <= 7; i++) {
      await touch('touchMove', 200, 400 - i * 10); // stick pushed forward, 70 px = full
      await touchPage.waitForTimeout(100);
    }
    await touch('touchEnd');
  });
  await touchContext.close();
  // --- end movement ---
} catch (e) {
  problems.push(`runner: ${e.message}`);
} finally {
  await browser?.close();
  server.close();
}

for (const p of problems) console.error(`page test: ${p}`);
console.log(`page test: ${problems.length ? 'FAIL' : 'ok'} (${problems.length} problems)`);
process.exit(problems.length ? 1 : 0);
