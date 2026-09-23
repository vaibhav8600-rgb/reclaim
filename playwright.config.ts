import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
/** Browser and test process share a timezone, so "today" and day buckets agree. */
const timezoneId = Intl.DateTimeFormat().resolvedOptions().timeZone

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId,
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Service workers are exercised on purpose in offline.spec; elsewhere they'd cache between tests.
    serviceWorkers: 'block',
  },
  projects: [
    // Safari's engine. Playwright's Windows WebKit port (not Safari itself) crashes while snapshotting
    // View Transitions and its IndexedDB is ~100× slower, so this project runs with Reduce Motion and
    // generous timeouts. Motion is covered by the Chromium project.
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 13'], reducedMotion: 'reduce' },
      timeout: 180_000,
      expect: { timeout: 30_000 },
      // Under parallel load this port can miss short-lived UI (e.g. a 5-second Undo). One retry; retried
      // passes are reported as 'flaky', not hidden.
      retries: 1,
    },
    { name: 'iphone-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  // Test the production build, served the way it will be deployed.
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // A dummy client ID turns on the Google Drive features; tests stub Google itself (e2e/fake-google.ts).
    env: { VITE_GOOGLE_CLIENT_ID: 'e2e-test.apps.googleusercontent.com' },
    timeout: 180_000,
  },
})
