import { defineConfig } from '@playwright/test'

// Node-only unit tests for the server-side modules. No browser, no server.
// Run through `npm run test:unit`, which starts Node with
// `--conditions=react-server` so the `server-only` marker resolves to its
// empty module exactly as it does inside the Next.js server bundle.
export default defineConfig({
  testDir: './tests/unit',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  projects: [{ name: 'unit' }],
})
