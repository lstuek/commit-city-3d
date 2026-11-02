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

  // --- Gate 2: city data and landmarks (#4) ---
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
    const p = await page.evaluate((k) => window.commitCity.landmarkPoint(k), key);
    await page.mouse.click(p.x, p.y);
    const opened = await page.waitForFunction((k) => {
      const el = document.getElementById('landmark-panel');
      return el && !el.hidden && el.dataset.landmark === k;
    }, key, { timeout: 2000 }).then(() => true, () => false);
    if (!opened) { problems.push(`click on ${key} did not open its panel`); continue; }
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
} catch (e) {
  problems.push(`runner: ${e.message}`);
} finally {
  await browser?.close();
  server.close();
}

for (const p of problems) console.error(`page test: ${p}`);
console.log(`page test: ${problems.length ? 'FAIL' : 'ok'} (${problems.length} problems)`);
process.exit(problems.length ? 1 : 0);
