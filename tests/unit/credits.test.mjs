import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { listFiles } from '../../scripts/files.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Every place an audio file can enter the build: imported assets and public/.
const AUDIO_DIRS = ['src', 'public'];
const AUDIO = /\.(mp3|ogg|opus|m4a|aac|wav|flac|webm)$/i;

async function unlistedAudio(dir, credits) {
  const missing = [];
  for (const base of AUDIO_DIRS) {
    const path = `${dir}/${base}`;
    if (!existsSync(path)) continue;
    for (const file of await listFiles(path)) {
      const name = file.split('/').pop();
      if (AUDIO.test(name) && !credits.includes(name)) missing.push(`${base}/${file}`);
    }
  }
  return missing;
}

test('every audio file in the build is listed in CREDITS.md', async () => {
  const credits = await readFile(`${root}/CREDITS.md`, 'utf8');
  assert.deepEqual(await unlistedAudio(root, credits), []);
});

test('the credits check fails on an unlisted audio file', async () => {
  const dir = fileURLToPath(new URL('../output/credits-unlisted/', import.meta.url));
  await rm(dir, { recursive: true, force: true });
  await mkdir(`${dir}/src/assets/audio`, { recursive: true });
  await writeFile(`${dir}/src/assets/audio/listed.mp3`, 'x');
  await writeFile(`${dir}/src/assets/audio/sneaky.ogg`, 'x');
  const missing = await unlistedAudio(dir, '| listed.mp3 | Someone | CC0 |');
  await rm(dir, { recursive: true, force: true });
  assert.deepEqual(missing, ['src/assets/audio/sneaky.ogg']);
});
