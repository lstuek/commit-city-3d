import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { measure } from '../../scripts/check-size.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('first playable size is counted per kind and passes under budget', async () => {
  const report = await measure(fixture('dist-ok'));
  assert.equal(report.over, false);
  assert.equal(report.budget, 15_000_000);
  assert.ok(report.total > 0);
  assert.ok(report.byKind.scripts > 0 && report.byKind.models > 0 && report.byKind.textures > 0);
});

test('an oversized build fails the size check with a non-zero exit', async (t) => {
  // 16 MB model in an otherwise valid build: over the 15 MB first-playable budget.
  const dir = fileURLToPath(new URL('../output/oversized-dist/', import.meta.url));
  await rm(dir, { recursive: true, force: true });
  await mkdir(`${dir}/assets`, { recursive: true });
  await writeFile(`${dir}/index.html`, '<!doctype html><title>x</title>');
  await writeFile(`${dir}/assets/city-Ov3rS1ze.glb`, Buffer.alloc(16_000_000, 1));

  const run = spawnSync(process.execPath, ['scripts/check-size.mjs', dir], { cwd: root, encoding: 'utf8' });
  t.diagnostic(`oversized fixture exit ${run.status}: ${(run.stdout + run.stderr).trim().replace(/\n/g, ' | ')}`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /size check: FAIL first playable 16\.00 MB over budget 15\.00 MB/);
  await rm(dir, { recursive: true, force: true });
});
