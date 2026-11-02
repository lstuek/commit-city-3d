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
} catch (e) {
  problems.push(`runner: ${e.message}`);
} finally {
  await browser?.close();
  server.close();
}

for (const p of problems) console.error(`page test: ${p}`);
console.log(`page test: ${problems.length ? 'FAIL' : 'ok'} (${problems.length} problems)`);
process.exit(problems.length ? 1 : 0);
