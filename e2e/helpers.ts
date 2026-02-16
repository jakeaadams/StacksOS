import { Page } from "@playwright/test";

export function hasStaffCredentials(): boolean {
  return Boolean(process.env.E2E_STAFF_USER && process.env.E2E_STAFF_PASS);
}

export function getStaffCredentials(): { username: string; password: string } {
  const username = process.env.E2E_STAFF_USER;
  const password = process.env.E2E_STAFF_PASS;

  if (!hasStaffCredentials() || !username || !password) {
    throw new Error("Missing E2E_STAFF_USER/E2E_STAFF_PASS for staff-authenticated E2E tests.");
  }

  return { username, password };
}

/**
 * Login helper function for tests that need authentication
 */
export async function loginAsStaff(page: Page, username?: string, password?: string) {
  const creds = username && password ? { username, password } : getStaffCredentials();
  await page.goto("/login");
  await page.locator("input#username").fill(creds.username);
  await page.locator("input#password").fill(creds.password);
  await page.locator("button[type='submit']").click();
  await page.waitForURL(/\/staff/, { timeout: 15000 });
}

/**
 * Wait for API call to complete
 */
export async function waitForAPI(page: Page, urlPattern: string | RegExp) {
  return page.waitForResponse((response) => {
    const url = response.url();
    if (typeof urlPattern === "string") {
      return url.includes(urlPattern);
    }
    return urlPattern.test(url);
  });
}

/**
 * Check if element exists without throwing
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  try {
    const element = page.locator(selector).first();
    return await element.isVisible({ timeout: 5000 });
  } catch {
    return false;
  }
}

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle");
}

/**
 * Get page text content safely
 */
export async function getPageText(page: Page): Promise<string> {
  try {
    return await page.locator("body").textContent() || "";
  } catch {
    return "";
  }
}

/**
 * Check if we're still authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const url = page.url();
  return !url.includes("/login") && url.includes("/staff");
}
