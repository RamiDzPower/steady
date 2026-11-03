import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const sw = read('sw.js');
const assets = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]).filter((p) => p !== './');

// sw.js caches with addAll, which fails as a whole if one file is missing, and a module it does not cache breaks the app offline.
test('every cached file exists and every module the app loads is cached', () => {
  for (const p of assets) assert.ok(existsSync(new URL(`../${p.slice(2)}`, import.meta.url)), `${p} is listed in sw.js but missing`);
  for (const f of ['app.js', 'logic.js', 'plan.js', 'pdf.js', 'icons.js']) {
    for (const [, dep] of read(f).matchAll(/from '\.\/([^']+)'/g)) assert.ok(assets.includes(`./${dep}`), `${f} imports ./${dep}, which sw.js does not cache`);
  }
  for (const f of ['index.html']) {
    for (const [, src] of read(f).matchAll(/(?:src|href)="([^":]+\.(?:js|css|png|webmanifest))"/g)) assert.ok(assets.includes(`./${src}`), `${f} loads ${src}, which sw.js does not cache`);
  }
});
