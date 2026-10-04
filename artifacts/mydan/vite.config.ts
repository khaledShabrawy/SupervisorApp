import path from 'path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectRegister: false,
      registerType: 'autoUpdate',
      manifest: {
        name: 'ميدان', short_name: 'ميدان',
        description: 'نظام إدارة المشرفين الميدانيين',
        lang: 'ar', dir: 'rtl',
        theme_color: '#1A56DB', background_color: '#F8FAFC',
        display: 'standalone', orientation: 'portrait',
        id: basePath, start_url: basePath, scope: basePath,
        icons: [192, 512].map(size => ({
          src: `${basePath}icons/icon-${size}.png`, sizes: `${size}x${size}`,
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
      name: 'mydan-prefixed-dev-tools',
      enforce: 'pre',
      configureServer(server) {
        // Replit tool middleware is registered before Vite strips its base.
        server.middlewares.use((request, _response, next) => {
          if (request.url?.startsWith(`${basePath}@replit/`)) {
            request.url = request.url.slice(basePath.length - 1);
          }
          next();
        });
      },
      transformIndexHtml: {
        order: 'post',
        handler: html => html.replace(/((?:src|href)=["'])\/@replit\//g, `$1${basePath}@replit/`),
      },
    },
    {
      name: 'mydan-shell-manifest',
      generateBundle(_, bundle) {
        const assets = Object.keys(bundle).filter(name => name.startsWith('assets/'));
        const hash = createHash('sha256').update(assets.sort().join('|'));
        for (const file of ['index.html', 'public/manifest.webmanifest', 'public/sw.js', 'public/icons/icon.svg',
          'public/icons/icon-192.png', 'public/icons/icon-512.png']) {
          hash.update(readFileSync(path.resolve(import.meta.dirname, file)));
        }
        const version = hash.digest('hex').slice(0, 16);
        this.emitFile({ type: 'asset', fileName: 'asset-manifest.json',
          source: JSON.stringify({ version, assets }) });
      },
    },
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase';
          if (/\/node_modules\/(react-router|react-router-dom|@remix-run\/router)\//.test(id)) return 'vendor-router';
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
