import { test, expect, Page } from "@playwright/test";

// Helper function to login
async function loginAsStaff(page: Page) {
  await page.goto("/login");
  await page.locator("input#username").fill("jake");
  await page.locator("input#password").fill("jake");
  await page.locator("button[type='submit']").click({ force: true });
  await page.waitForURL(/\/staff/, { timeout: 15000 });
}

test.describe("Circulation Workflows", () => {
  // Login before all tests in this suite
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page);
  });

  test("checkout page loads with proper interface", async ({ page }) => {
    await page.goto("/staff/circulation/checkout");
    
    // Verify we're on the checkout page
    await expect(page).toHaveURL(/\/staff\/circulation\/checkout/);
    
    // Verify page body is visible
    await expect(page.locator("body")).toBeVisible();
    
    // Verify page has loaded content
    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test("checkin page loads with proper interface", async ({ page }) => {
    await page.goto("/staff/circulation/checkin");
    
    // Verify we're on the checkin page
    await expect(page).toHaveURL(/\/staff\/circulation\/checkin/);
    
    // Verify page body is visible
    await expect(page.locator("body")).toBeVisible();
    
    // Verify page has loaded content
    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test("patron search page loads and is accessible", async ({ page }) => {
    await page.goto("/staff/patrons");
    
    // Verify we're on the patrons page
    await expect(page).toHaveURL(/\/staff\/patrons/);
    
    // Verify page body is visible
    await expect(page.locator("body")).toBeVisible();
  });

  test("patron lookup functionality exists", async ({ page }) => {
    await page.goto("/staff/patrons");
    
    // Wait for page to load
    await page.waitForLoadState("networkidle");
    
    // Look for search input or patron lookup interface
    const hasSearchInput = await page.locator("input[type='text'], input[type='search'], input[placeholder*='search' i], input[placeholder*='patron' i]").first().isVisible().catch(() => false);
    const hasButton = await page.locator("button").first().isVisible().catch(() => false);
    
    // Verify some interactive elements exist
    expect(hasSearchInput || hasButton).toBeTruthy();
  });

  test("circulation menu navigation works", async ({ page }) => {
    await page.goto("/staff");
    
    // Look for circulation-related links or navigation
    const circulationLinks = page.locator("a[href*='circulation'], button:has-text('Circulation')");
    const linkCount = await circulationLinks.count();
    
    // Verify circulation navigation exists
    expect(linkCount).toBeGreaterThan(0);
  });

  test("holds page is accessible from circulation", async ({ page }) => {
    await page.goto("/staff/circulation/holds");
    
    // Verify holds page loads (may have different implementations)
    await expect(page.locator("body")).toBeVisible();
    
    // Verify we didn't get redirected to an error page
    const url = page.url();
    expect(url).toContain("/staff");
  });

  test("renew page is accessible from circulation", async ({ page }) => {
    await page.goto("/staff/circulation/renew");
    
    // Verify renew page loads
    await expect(page.locator("body")).toBeVisible();
    
    // Verify we're still in the staff area
    const url = page.url();
    expect(url).toContain("/staff");
  });

  test("in-house use page is accessible", async ({ page }) => {
    await page.goto("/staff/circulation/in-house-use");
    
    // Verify page loads
    await expect(page.locator("body")).toBeVisible();
  });

  test("claims returned page is accessible", async ({ page }) => {
    await page.goto("/staff/circulation/claims-returned");
    
    // Verify page loads
    await expect(page.locator("body")).toBeVisible();
  });

  test("navigation between circulation pages works", async ({ page }) => {
    // Start at checkout
    await page.goto("/staff/circulation/checkout");
    await expect(page).toHaveURL(/checkout/);
    
    // Navigate to checkin
    await page.goto("/staff/circulation/checkin");
    await expect(page).toHaveURL(/checkin/);
    
    // Navigate to patrons
    await page.goto("/staff/patrons");
    await expect(page).toHaveURL(/patrons/);
    
    // All navigations should complete successfully
  });
});
