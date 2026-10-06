import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import tailwindcss from 'tailwindcss';
import { VitePWA } from 'vite-plugin-pwa';

const root = fileURLToPath(new URL('.', import.meta.url));
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  root,
  base,
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(root, 'src') }, dedupe: ['react', 'react-dom'] },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 5173),
    strictPort: true,
    allowedHosts: true,
  },
  preview: { host: '0.0.0.0', port: Number(process.env.PORT || 4173), allowedHosts: true },
  css: { postcss: { plugins: [tailwindcss({ config: path.resolve(root, 'tailwind.config.ts') })] } },
  build: { outDir: 'dist/public', emptyOutDir: true },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectRegister: false,
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mydan', short_name: 'Mydan',
        description: 'نظام إدارة المشرفين الميدانيين',
        lang: 'ar', dir: 'rtl',
        theme_color: '#1A56DB', background_color: '#F8FAFC',
        display: 'standalone', orientation: 'portrait',
        id: base, start_url: base, scope: base,
        icons: [192, 512].map(size => ({
          src: `${base}icons/icon-${size}.png`, sizes: `${size}x${size}`,
          type: 'image/png', purpose: 'any maskable',
        })),
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
        globIgnores: ['**/sw.js', '**/asset-manifest.json'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
    {
      name: 'mydan-shell-manifest',
      generateBundle(_, bundle) {
        const assets = Object.keys(bundle).filter(name => name.startsWith('assets/')).sort();
        const hash = createHash('sha256').update(assets.join('|'));
        for (const file of ['index.html', 'public/manifest.webmanifest', 'public/sw.js',
          'public/icons/icon.svg', 'public/icons/icon-192.png', 'public/icons/icon-512.png']) {
          hash.update(readFileSync(path.resolve(root, file)));
        }
        this.emitFile({
          type: 'asset', fileName: 'asset-manifest.json',
          source: JSON.stringify({ version: hash.digest('hex').slice(0, 16), assets }),
        });
      },
    },
  ],
});