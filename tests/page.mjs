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
} catch (e) {
  problems.push(`runner: ${e.message}`);
} finally {
  await browser?.close();
  server.close();
}

for (const p of problems) console.error(`page test: ${p}`);
console.log(`page test: ${problems.length ? 'FAIL' : 'ok'} (${problems.length} problems)`);
process.exit(problems.length ? 1 : 0);
