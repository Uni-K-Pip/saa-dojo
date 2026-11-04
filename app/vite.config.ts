import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// テストでリポジトリ直下の scripts/lib/schema.mjs を読むとき、zod を app/node_modules から解決する
const zodDir = fileURLToPath(new URL('./node_modules/zod', import.meta.url));

export default defineConfig({
  // GitHub Pages のサブパスで動かす
  base: '/saa-dojo/',
  plugins: [react()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    alias: { zod: zodDir },
    restoreMocks: true,
  },
});
