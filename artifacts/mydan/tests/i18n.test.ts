import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN } from '../src/i18n/en.ts';
import { t } from '../src/i18n/index.ts';

const src = fileURLToPath(new URL('../src', import.meta.url));
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'i18n' ? [] : files(join(dir, e.name))) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
}
const keys = new Set(files(src).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\bt\('([^']*)'/g)].map((m) => m[1])));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every UI string passed to t() has an English translation', () => {
  const missing = [...keys].filter((k) => /[؀-ۿ]/.test(k) && !(k in EN));
  assert.deepEqual(missing, []);
});
test('English strings keep the same {placeholders} as the Arabic key', () => {
  for (const [ar, en] of Object.entries(EN)) assert.deepEqual(placeholders(en), placeholders(ar), ar);
});
test('t() falls back to Arabic and fills placeholders (default language is Arabic)', () => {
  assert.equal(t('حفظ'), 'حفظ');
  assert.equal(t('{n} وحدة', { n: 3 }), '3 وحدة');
  assert.equal(t('نص غير مترجم'), 'نص غير مترجم');
});
test('the app is branded Mydan', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>Mydan /);
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'Mydan');
});
