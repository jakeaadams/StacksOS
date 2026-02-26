import { defineConfig, devices } from "@playwright/test";

const basePort = Number(process.env.E2E_PORT || 3001);
const baseURL = process.env.BASE_URL || `http://localhost:${basePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Run tests sequentially to avoid auth conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: "html",
  globalSetup: "./e2e/global-setup.ts",

  // Global timeout settings
  timeout: 30000,
  expect: {
    timeout: 10000,
  },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    // Increase navigation timeout
    navigationTimeout: 15000,
    actionTimeout: 10000,
  },

  projects: [
    // Chromium tests without auth setup dependency
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
      // Exclude setup files from regular test runs
      testIgnore: /.*\.setup\.ts/,
    },
  ],

  // Start dev server before tests
  webServer: {
    command: `NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/evergreen-192.168.1.232.crt STACKSOS_COOKIE_SECURE=false STACKSOS_E2E_TEST_MODE=1 NEXT_TELEMETRY_DISABLED=1 npm run dev -- -p ${basePort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
