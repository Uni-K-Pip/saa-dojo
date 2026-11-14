import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// テストでリポジトリ直下の scripts/（schema.mjs・validate.mjs）を読むとき、zod と yaml を app/node_modules から解決する
// （CI の app ジョブはルートの依存をインストールしない）
const zodDir = fileURLToPath(new URL('./node_modules/zod', import.meta.url));
const yamlDir = fileURLToPath(new URL('./node_modules/yaml', import.meta.url));
// テストでは Service Worker の登録を空の実装に差し替える
const pwaStub = fileURLToPath(new URL('./src/test/pwa-register-stub.ts', import.meta.url));

export default defineConfig({
  // GitHub Pages のサブパスで動かす
  base: '/saa-dojo/',
  plugins: [
    react(),
    VitePWA({
      // 更新があればトーストで知らせ、利用者の操作で再読み込みする
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'SAA Dojo（非公式 AWS SAA 学習アプリ）',
        short_name: 'SAA Dojo',
        description: 'AWS 認定ソリューションアーキテクト – アソシエイト（SAA-C03）の非公式学習アプリ',
        lang: 'ja',
        start_url: '/saa-dojo/',
        scope: '/saa-dojo/',
        display: 'standalone',
        background_color: '#f4f6f9',
        theme_color: '#0a58a8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // アプリ本体と全コンテンツデータを事前キャッシュし、オフラインで使えるようにする
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}', 'data/**/*.json'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    alias: { zod: zodDir, yaml: yamlDir, 'virtual:pwa-register/react': pwaStub },
    restoreMocks: true,
  },
});
