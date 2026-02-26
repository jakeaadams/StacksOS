import { defineConfig, devices } from "@playwright/test";

const basePort = Number(process.env.E2E_PORT || 3001);
const baseURL = process.env.BASE_URL || `http://localhost:${basePort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["smoke-public.spec.ts", "smoke-auth.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "html",

  timeout: 30000,
  expect: {
    timeout: 10000,
  },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: 15000,
    actionTimeout: 10000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
      testIgnore: /.*\.setup\.ts/,
    },
  ],

  webServer: {
    command: `NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/evergreen-192.168.1.232.crt STACKSOS_COOKIE_SECURE=false STACKSOS_E2E_TEST_MODE=1 NEXT_TELEMETRY_DISABLED=1 npm run dev -- -p ${basePort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
