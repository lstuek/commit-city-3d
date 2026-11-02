import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listFiles } from './files.mjs';

export const FIRST_PLAYABLE_BUDGET = 15_000_000;

const KINDS = [
  ['decoders', /(basis_transcoder|draco|meshopt)[^/]*$|\.wasm$/i],
  ['scripts', /\.(m?js)$/i],
  ['textures', /\.(ktx2|png|jpe?g|webp|avif|hdr|exr)$/i],
  ['models', /\.(glb|gltf|bin)$/i],
  ['audio', /\.(mp3|ogg|opus|m4a|aac|wav|flac)$/i],
];

export async function measure(dir, budget = FIRST_PLAYABLE_BUDGET) {
  const byKind = { scripts: 0, decoders: 0, textures: 0, models: 0, audio: 0, other: 0 };
  let total = 0;
  for (const file of await listFiles(dir)) {
    const { size } = await stat(join(dir, file));
    const kind = KINDS.find(([, re]) => re.test(file))?.[0] ?? 'other';
    byKind[kind] += size;
    total += size;
  }
  return { total, budget, over: total > budget, byKind };
}

const mb = (n) => `${(n / 1_000_000).toFixed(2)} MB`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await measure(process.argv[2] ?? 'dist');
  const kinds = Object.entries(r.byKind).map(([k, v]) => `${k} ${mb(v)}`).join(', ');
  console.log(`size check: ${kinds}`);
  if (r.over) {
    console.error(`size check: FAIL first playable ${mb(r.total)} over budget ${mb(r.budget)}`);
    process.exit(1);
  }
  console.log(`size check: ok first playable ${mb(r.total)} of ${mb(r.budget)}`);
}
