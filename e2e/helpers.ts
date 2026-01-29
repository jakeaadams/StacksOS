import { Page } from "@playwright/test";

/**
 * Login helper function for tests that need authentication
 */
export async function loginAsStaff(page: Page, username = "jake", password = "jake") {
  await page.goto("/login");
  await page.locator("input#username").fill(username);
  await page.locator("input#password").fill(password);
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
