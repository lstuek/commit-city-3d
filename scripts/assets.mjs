// KTX2 encoding uses the Basis Universal WASM encoder (ktx2-encoder), so no
// native toktx binary is needed locally or in CI.
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { PNG } from 'pngjs';

const decodePng = async (bytes) => {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { data: new Uint8Array(png.data), width: png.width, height: png.height };
};

export async function compressModel(input, output) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(input);
  await doc.transform(
    ktx2({ isUASTC: false, enableDebug: false, generateMipmap: true, imageDecoder: decodePng }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await mkdir(dirname(output), { recursive: true });
  await io.write(output, doc);

  const written = await io.readAsJSON(output);
  const used = written.json.extensionsUsed ?? [];
  const textures = (await io.readJSON(written)).getRoot().listTextures();
  const problems = [];
  if (!used.includes('EXT_meshopt_compression')) problems.push('no EXT_meshopt_compression');
  if (!used.includes('KHR_texture_basisu')) problems.push('no KHR_texture_basisu');
  if (!textures.length || textures.some((t) => t.getMimeType() !== 'image/ktx2')) problems.push('a texture is not KTX2');
  if (problems.length) throw new Error(`asset pipeline: ${output}: ${problems.join(', ')}`);
  return { extensions: used, textures: textures.length };
}

const [input, output] = process.argv.slice(2);
if (input && output) {
  const r = await compressModel(input, output);
  console.log(`assets: ${input} -> ${output} [${r.extensions.join(', ')}], ${r.textures} KTX2 texture(s)`);
}
