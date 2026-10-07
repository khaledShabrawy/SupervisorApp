import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const approved = new Set(['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js',
  '@tanstack/react-query', 'vite', 'typescript', 'tailwindcss', 'vite-plugin-pwa',
  '@types/node', '@types/react', '@types/react-dom',
  // Beat Plan interactive map (BeatMap.tsx — dynamic import to keep the initial bundle small).
  'leaflet', '@types/leaflet',
  // Android APK shell (WebView wrapper around the same web build — see docs/mydan-roadmap-to-apk.md).
  '@capacitor/core', '@capacitor/android', '@capacitor/cli']);
const webScripts = { dev: 'vite', build: 'vite build', preview: 'vite preview' };
const apkScripts = { 'cap:sync': 'vite build && cap sync android', 'cap:open': 'cap open android',
  'apk:debug': 'vite build && cap sync android && cd android && gradlew.bat assembleDebug' };
const root = new URL('../../../', import.meta.url);
const app = new URL('../', import.meta.url);
test('both manifests use only approved web packages and standard Vite scripts', () => {
  for (const base of [root, app]) {
    const pkg = JSON.parse(readFileSync(new URL('package.json', base), 'utf8'));
    assert.deepEqual(pkg.scripts, base === app ? { ...webScripts, ...apkScripts } : webScripts);
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      assert.ok(approved.has(name), `Unexpected dependency: ${name}`);
    }
  }
  assert.equal(existsSync(new URL('artifacts/mobile', root)), false);
  assert.doesNotMatch(readFileSync(new URL('pnpm-lock.yaml', root), 'utf8'),
    /(?:^\s+(?:['"]?(?:@expo\/|expo(?:-|:)|react-native(?:-|:)|@react-native\/)))/m);
});
test('browser entry remains Arabic RTL with Cairo and safe-area viewport', () => {
  const html = readFileSync(new URL('index.html', app), 'utf8');
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /fonts\.googleapis\.com.*Cairo/);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /src="\/src\/main\.tsx"/);
});
test('registration uses the browser API rather than native or helper packages', () => {
  const registration = readFileSync(new URL('src/lib/pwa.ts', app), 'utf8');
  assert.match(registration, /navigator\.serviceWorker\.register/);
  assert.doesNotMatch(registration, /workbox-window|\bexpo\b|react-native/);
  const client = readFileSync(new URL('src/lib/supabase.ts', app), 'utf8');
  assert.match(client, /VITE_SUPABASE_URL/);
  assert.match(client, /VITE_SUPABASE_ANON_KEY/);
});