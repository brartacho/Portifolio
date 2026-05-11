const { defineConfig, devices } = require('@playwright/test');

// BASE_URL=http://localhost:3000 npx playwright test  → testa localmente (vercel dev)
// sem BASE_URL                                        → testa produção (artacho.dev)
const BASE_URL = process.env.BASE_URL || 'https://artacho.dev';

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 2,
  timeout: 30_000,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'pt-BR',
    extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      testMatch: '**/responsive.spec.js',
    },
  ],
  outputDir: 'test-results/artifacts',
});
