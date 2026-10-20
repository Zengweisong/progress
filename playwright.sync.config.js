import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/sync-browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4183', channel: 'msedge', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/run-sync-server.mjs', url: 'http://127.0.0.1:4183/api/health', reuseExistingServer: false },
});
