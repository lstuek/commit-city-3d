// Headless page test: serves the built site, opens it with the fixture city
// data file in headless Chromium (headless shell), and fails on any console
// error, page error, failed request or HTTP error. Always closes the browser.
// Also: a forced graphics context loss recovers to a drawing scene, and a short
// benchmark run (?bench=1&benchSeconds=2) writes its JSON report.
// Usage: node tests/page.mjs <dist dir>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const dist = resolve(process.argv[2] ?? 'dist');
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.png': 'image/png', '.mp3': 'audio/mpeg',
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

// Share of canvas pixels the scene drew over (any colour away from the 0x05060a background).
async function litShare(page) {
  const shot = PNG.sync.read(await page.locator('canvas').screenshot());
  let lit = 0;
  for (let i = 0; i < shot.data.length; i += 4) {
    if (Math.abs(shot.data[i] - 5) + Math.abs(shot.data[i + 1] - 6) + Math.abs(shot.data[i + 2] - 10) > 8) lit++;
  }
  return lit / (shot.width * shot.height);
}
const pct = (share) => `${(share * 100).toFixed(2)}%`;

const problems = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('console', (m) => m.type() === 'error' && problems.push(`console error: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));

  // Record every AudioContext the page makes, to prove none runs before Enter.
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    window.__audioContexts = [];
    window.AudioContext = class extends Base {
      constructor(...args) { super(...args); window.__audioContexts.push(this); }
    };
  });
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
  // Sound (#6): silent before the first click, running after Enter, mute zeroes the master gain.
  const running = () => page.evaluate(() => window.__audioContexts.filter((c) => c.state === 'running').length);
  if (await running()) problems.push('an AudioContext runs before the Enter click');
  await page.click('#enter');
  await page.waitForFunction(() => document.body.dataset.audio === 'running', null, { timeout: 10_000 })
    .catch(() => problems.push('sound did not start on the Enter click'));
  if ((await running()) !== 1) problems.push('Enter did not leave exactly one running AudioContext');
  await page.click('#mute');
  const sound = await page.evaluate(() => ({ ...document.body.dataset }));
  if (sound.masterGain !== '0' || sound.muted !== 'true') problems.push(`mute did not zero the master gain (${sound.masterGain})`);
  await page.waitForLoadState('networkidle');
  await page.reload();
  const remembered = await page.evaluate(() => document.body.dataset.muted);
  if (remembered !== 'true') problems.push(`mute not remembered after reload (${remembered})`);
  console.log(`page test: sound | before click none running | after Enter ${sound.audio} | muted gain ${sound.masterGain} | after reload muted ${remembered}`);
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
  // --- Gate 2: city data and landmarks (#4) ---
  await page.goto(`${origin}/?data=/__fixtures/city.json`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 30_000 });
  await page.waitForTimeout(2700);
  const stat = (name) => page.locator(`#stats [data-stat="${name}"]`).textContent();
  const statsWant = { tokens: '123,456,789', commits: '4,321', top_language: 'TypeScript', as_of: '2026-10-28' };
  for (const [name, want] of Object.entries(statsWant)) {
    const got = await stat(name);
    if (got !== want) problems.push(`stats ${name}: want ${want}, got ${got}`);
  }
  const statsEl = page.locator('#stats');
  if (await statsEl.getAttribute('data-source') !== 'live') problems.push('stats not from the fixture');
  if (await statsEl.getAttribute('data-stale') !== 'true') problems.push('2026-10-28 data not shown as stale');

  const SITES = {
    portfolio: 'https://lincolnstuek.com/', 'new-era': 'https://new-era-design.com/', 'bionic-wave': 'https://bionicwave.ai/',
    'ka-tech': 'https://katechairsoft.com/', 'ka-ops': null, aios: null, crm: null, systemselect: null,
  };
  for (const [key, site] of Object.entries(SITES)) {
    const p = await page.evaluate((k) => {
      const pt = window.commitCity.landmarkPoint(k);
      document.querySelector('canvas').dispatchEvent(new MouseEvent('click', { clientX: pt.x, clientY: pt.y, bubbles: true }));
      return pt;
    }, key);
    if (p.x < 0 || p.y < 0 || p.x > 960 || p.y > 540) problems.push(`${key} is off screen at ${Math.round(p.x)},${Math.round(p.y)}`);
    const opened = await page.waitForFunction((k) => {
      const el = document.getElementById('landmark-panel');
      return el && !el.hidden && el.dataset.landmark === k;
    }, key, { timeout: 2000 }).then(() => true, () => false);
    if (!opened) {
      const where = await page.evaluate(() => `${document.body.dataset.mode} cam ${document.body.dataset.camera} open ${document.getElementById('landmark-panel')?.dataset.landmark}`);
      problems.push(`click on ${key} at ${Math.round(p.x)},${Math.round(p.y)} did not open its panel (${where})`);
      continue;
    }
    const panel = await page.evaluate(() => {
      const el = document.getElementById('landmark-panel');
      const f = (n) => el.querySelector(`[data-field="${n}"]`)?.textContent ?? null;
      return { name: f('name'), line: f('line'), commits: f('commits'), commits30d: f('commits30d'), lastUpdate: f('lastUpdate'),
        language: f('language'), links: [...el.querySelectorAll('a')].map((a) => a.href) };
    });
    if (!panel.name || !panel.line || !panel.commits || !panel.lastUpdate || !panel.language) problems.push(`${key} panel missing a field`);
    const wantLinks = site ? [site] : [];
    if (JSON.stringify(panel.links) !== JSON.stringify(wantLinks)) problems.push(`${key} links: want ${wantLinks}, got ${panel.links}`);
    if (panel.links.some((h) => /github/i.test(h))) problems.push(`${key} links to a repo`);
    if (key === 'crm' && (panel.commits30d !== '—' || panel.lastUpdate !== '—')) problems.push('crm nulls not shown as a dash');
  }

  // A malformed data file falls back to the bundled copy.
  await page.goto(`${origin}/?data=/__fixtures/city-malformed.json`);
  await page.waitForSelector('#stats', { timeout: 30_000 });
  if (await page.locator('#stats').getAttribute('data-source') !== 'fallback') problems.push('malformed data did not fall back');
  if ((await stat('commits')) === '0') problems.push('fallback shows 0 for an unknown');
  console.log('page test: stats, 8 landmark panels and fallback checked');
  // --- end Gate 2 (#4) ---
  // Context loss: lose and restore through WEBGL_lose_context; the scene must draw again.
  if (!state.tier) problems.push('no quality tier set');
  const before = await litShare(page);
  await page.evaluate(() => {
    window.__lose = document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
    window.__lose.loseContext();
  });
  await page.waitForFunction(() => document.body.dataset.context === 'lost', null, { timeout: 5_000 })
    .catch(() => problems.push('context loss was not seen'));
  await page.evaluate(() => window.__lose.restoreContext());
  await page.waitForFunction(() => document.body.dataset.context === 'drawing', null, { timeout: 10_000 })
    .catch(() => problems.push('scene did not draw after context restore'));
  const after = await litShare(page);
  if (after < before * 0.5 || after < 0.002) problems.push(`scene is blank after context restore (${pct(after)} drawn, ${pct(before)} before)`);
  console.log(`page test: context loss | tier ${state.tier} | drawn ${pct(before)} before, ${pct(after)} after restore`);

  // Benchmark: a 2-second run on a pinned tier writes its report with every field.
  await page.goto(`${origin}/?data=/__fixtures/city.json&bench=1&benchSeconds=2&tier=desktop-full`);
  await page.waitForFunction(() => document.body.dataset.bench === 'running', null, { timeout: 30_000 }).catch(() => {});
  const moveA = await page.evaluate(() => document.body.dataset.camera);
  await page.waitForTimeout(500);
  const moveB = await page.evaluate(() => document.body.dataset.camera);
  if (moveA !== moveB) problems.push(`movement drove the camera during the benchmark (${moveA} -> ${moveB})`);
  await page.waitForFunction(() => document.body.dataset.bench === 'done', null, { timeout: 30_000 })
    .catch(() => problems.push('benchmark did not finish'));
  const report = JSON.parse((await page.locator('#bench-report').textContent({ timeout: 1_000 }).catch(() => null)) ?? '{}');
  for (const key of ['p50Ms', 'p95Ms', 'p99Ms', 'maxMs', 'drawCalls', 'triangles', 'frames']) {
    if (!(report[key] > 0)) problems.push(`benchmark report ${key} missing or zero (${report[key]})`);
  }
  if (report.tier !== 'desktop-full') problems.push(`benchmark tier flag not pinned (got ${report.tier})`);
  if (!report.renderer || report.renderer === 'unknown') problems.push('benchmark report has no renderer string');
  console.log(`page test: benchmark ${JSON.stringify(report)}`);
} catch (e) {
  problems.push(`runner: ${e.message}`);
} finally {
  await browser?.close();
  server.close();
}

for (const p of problems) console.error(`page test: ${p}`);
console.log(`page test: ${problems.length ? 'FAIL' : 'ok'} (${problems.length} problems)`);
process.exit(problems.length ? 1 : 0);
