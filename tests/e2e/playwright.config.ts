import { defineConfig } from '@playwright/test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  retries: 0,
  use: {
    headless: true,
    baseURL: 'http://localhost:5555',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: `bun ${resolve(repoRoot, 'tests/e2e/server/mock-feedback-api.ts')}`,
      port: 4444,
      reuseExistingServer: true,
    },
    {
      command: `python3 -m http.server 5555 --directory ${resolve(repoRoot, 'tests/e2e/fixtures/vanilla-host')}`,
      port: 5555,
      reuseExistingServer: true,
    },
  ],
})
