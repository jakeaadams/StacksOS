import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,  // Run tests sequentially to avoid auth conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: "html",
  
  // Global timeout settings
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
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
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
