import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDist } from '../../scripts/check-hash.mjs';

const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('a built site with index.html and hashed, resolving assets passes', async () => {
  const result = await checkDist(fixture('dist-ok'));
  assert.deepEqual(result.errors, []);
  assert.equal(result.files, 5);
  assert.equal(result.references, 4);
});

test('an asset without a content hash in its name fails', async () => {
  const result = await checkDist(fixture('dist-unhashed'));
  assert.deepEqual(result.errors, ['not hashed: assets/main.js']);
});

test('a plain word after a dash is not a content hash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'check-hash-'));
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), '<script src="/assets/city-buildings.js"></script>');
  await writeFile(join(dir, 'assets', 'city-buildings.js'), '');
  const result = await checkDist(dir);
  await rm(dir, { recursive: true, force: true });
  assert.deepEqual(result.errors, ['not hashed: assets/city-buildings.js']);
});

test('a reference to a file missing from the build fails', async () => {
  const result = await checkDist(fixture('dist-missing'));
  assert.deepEqual(result.errors, ['unresolved: /assets/gone-Mn45Bv67.glb (in assets/index-Ab3_x9Zq.js)']);
});
