import { defineConfig, devices } from '@playwright/test';

// ビルドしたアプリを vite preview で配信して確かめる（npm run build のあとに npm run e2e）
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/saa-dojo/`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/saa-dojo/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
