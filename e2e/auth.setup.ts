import { test as setup, expect } from "@playwright/test";

import { getStaffCredentials } from "./helpers";

const authFile = "e2e/.auth/staff.json";

setup("authenticate as staff user", async ({ page }) => {
  const { username, password } = getStaffCredentials();
  // Navigate to login page
  await page.goto("/login");

  // Fill in login form
  await page.locator("input#username").fill(username);
  await page.locator("input#password").fill(password);

  // Submit form with force to bypass Next.js dev overlay
  await page.locator("button[type='submit']").click({ force: true });

  // Wait for successful login and redirect
  await page.waitForURL(/\/staff/, { timeout: 15000 });

  // Verify we're logged in
  await expect(page).toHaveURL(/\/staff/);

  // Save authentication state
  await page.context().storageState({ path: authFile });
});
