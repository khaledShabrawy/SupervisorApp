import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const fromPwa = createRequire(require.resolve('vite-plugin-pwa'));
const fromWorkbox = createRequire(fromPwa.resolve('workbox-build'));
const fromResolver = createRequire(fromWorkbox.resolve('@rollup/plugin-node-resolve'));
const merge = fromResolver('deepmerge');

test('patched deepmerge never assigns attacker-controlled object prototypes', () => {
  const poison = JSON.parse('{"__proto__":{"isAdmin":true}}');
  for (const result of [merge(poison, {}), merge({}, poison), merge({ nested: poison }, {}).nested, merge([poison], [])[0]]) {
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.isAdmin, undefined);
  }
  assert.equal({}.isAdmin, undefined);
  assert.deepEqual(merge({ values: [1], options: { safe: true } }, { values: [2] }), { values: [1,2], options: { safe: true } });
});

test('patched glob retains the sync API Workbox consumes and rimraf removes only its target', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mydan-glob-'));
  try {
    await mkdir(join(directory, 'target'));
    await writeFile(join(directory, 'target', 'asset.js'), 'synthetic');
    await writeFile(join(directory, 'keep.txt'), 'keep');
    const glob = fromWorkbox('glob');
    assert.deepEqual(glob.sync('**/*.js', { cwd: directory, nodir: true }), ['target/asset.js']);
    const fromCapacitor = createRequire(require.resolve('@capacitor/cli/package.json'));
    const { rimraf } = fromCapacitor('rimraf');
    await rimraf(join(directory, 'target'));
    await assert.rejects(access(join(directory, 'target')));
    await access(join(directory, 'keep.txt'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
