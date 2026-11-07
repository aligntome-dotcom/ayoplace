import { defineConfig } from '@playwright/test'

// Runs against the production build: `npm run build` first, then `npm test`.
// Uses the Chrome already installed on the machine (no browser download).
export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**'], // node-only unit tests run via playwright.unit.config.ts
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
    // APP_ORIGIN lets the Origin checks pass for same-origin requests.
    // XANO_BASE_URL is deliberately NOT set: no instance exists, so the e2e
    // suite proves the handlers fail safely without a backend. Live Xano
    // flows are unit-tested with a mocked transport instead.
    env: { APP_ORIGIN: 'http://localhost:3000' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ],
})
