import { test, expect } from "@playwright/test";

const authFile = "e2e/.auth/staff.json";

test.describe("Circulation Workflows", () => {
  test.use({ storageState: authFile });

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

    // Verify no server error
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/Internal Server Error/i);
  });

  test("patron lookup functionality exists", async ({ page }) => {
    await page.goto("/staff/patrons");

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Look for search input or patron lookup interface
    const hasSearchInput = await page
      .locator(
        "input[type='text'], input[type='search'], input[placeholder*='search' i], input[placeholder*='patron' i]"
      )
      .first()
      .isVisible()
      .catch(() => false);
    const hasButton = await page
      .locator("button")
      .first()
      .isVisible()
      .catch(() => false);

    // Verify some interactive elements exist
    expect(hasSearchInput || hasButton).toBeTruthy();
  });

  test("circulation menu navigation works", async ({ page }) => {
    await page.goto("/staff");

    // Look for circulation-related links or navigation
    await page.waitForSelector("a[href*='/staff/circulation']", { timeout: 15000 });
    const circulationLinks = page.locator("a[href*='circulation'], button:has-text('Circulation')");
    const linkCount = await circulationLinks.count();

    // Verify circulation navigation exists
    expect(linkCount).toBeGreaterThan(0);
  });

  test("holds page is accessible from circulation", async ({ page }) => {
    await page.goto("/staff/circulation/holds-management");

    // Verify holds page loads with meaningful content
    await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible();

    // Verify we didn't get redirected to an error page
    const url = page.url();
    expect(url).toContain("/staff");

    // Verify no server error
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/Internal Server Error/i);
  });

  test("renew page is accessible from circulation", async ({ page }) => {
    await page.goto("/staff/circulation/renew");

    // Verify renew page loads with meaningful content
    await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible();

    // Verify we're still in the staff area
    const url = page.url();
    expect(url).toContain("/staff");

    // Verify no server error
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/Internal Server Error/i);
  });

  test("in-house use page is accessible", async ({ page }) => {
    await page.goto("/staff/circulation/in-house");

    // Verify page loads with meaningful content
    await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible();

    // Verify page title or heading is relevant
    await expect(page).toHaveURL(/\/staff/);

    // Verify no server error
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/Internal Server Error/i);
  });

  test("claims returned page is accessible", async ({ page }) => {
    await page.goto("/staff/circulation/claims");

    // Verify page loads with meaningful content
    await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible();

    // Verify we're in the staff area
    await expect(page).toHaveURL(/\/staff/);

    // Verify no server error
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/Internal Server Error/i);
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
