import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listFiles } from './files.mjs';

const FIXED_NAMES = new Set(['index.html']);
const HASHED = /-(?![a-z]{8}\.)[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;
const HTML_REF = /\s(?:src|href)\s*=\s*["']([^"']+)["']/g;
const ASSET_REF = /["'`(]((?:\.{0,2}\/)?assets\/[^"'`)\s?#]+)/g;
const SITE = 'https://lstuek.github.io';

export async function checkDist(dir) {
  const files = await listFiles(dir);
  const present = new Set(files);
  const errors = [];
  let references = 0;

  for (const file of files) {
    if (!FIXED_NAMES.has(file) && !HASHED.test(file)) errors.push(`not hashed: ${file}`);
  }

  for (const file of files.filter((f) => /\.(html|js|css)$/.test(f))) {
    const text = await readFile(join(dir, file), 'utf8');
    const refs = new Set();
    if (file.endsWith('.html')) {
      for (const [, url] of text.matchAll(HTML_REF)) {
        if (url.startsWith(SITE)) refs.add(url.slice(SITE.length) || '/');
        else if (/^[a-z]+:/i.test(url) || url.startsWith('//')) {
          if (!/^(data|mailto):/i.test(url)) errors.push(`external: ${url} (in ${file})`);
        } else refs.add(url);
      }
    }
    for (const [, url] of text.matchAll(ASSET_REF)) refs.add(url);
    for (const url of refs) {
      references++;
      const path = url.replace(/^(\.{0,2}\/)+/, '').split(/[?#]/)[0] || 'index.html';
      if (!present.has(path)) errors.push(`unresolved: ${url} (in ${file})`);
    }
  }
  return { files: files.length, references, errors };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? 'dist';
  const { files, references, errors } = await checkDist(dir);
  for (const e of errors) console.error(`hash check: ${e}`);
  console.log(`hash check: ${files} files, ${references} references, ${errors.length} errors`);
  process.exit(errors.length ? 1 : 0);
}
