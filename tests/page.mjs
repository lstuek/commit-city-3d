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
