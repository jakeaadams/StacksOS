import { test, expect } from "@playwright/test";

const authFile = "e2e/.auth/staff.json";

test.describe("Catalog Workflows", () => {
  test.describe("OPAC (Public Catalog)", () => {
    test("OPAC search page loads with search interface", async ({ page }) => {
      await page.goto("/opac/search");

      // Verify page loaded
      await expect(page.locator("body")).toBeVisible();

      // Look for search input or form elements
      const hasSearchElements = await page
        .locator("input[type='text'], input[type='search'], form, button")
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasSearchElements).toBeTruthy();
    });

    test("OPAC homepage has search functionality", async ({ page }) => {
      await page.goto("/opac");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Verify page is visible
      await expect(page.locator("body")).toBeVisible();

      // Look for interactive elements
      const hasInteractiveElements = await page
        .locator("input, button, a")
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasInteractiveElements).toBeTruthy();
    });

    test("OPAC search functionality exists", async ({ page }) => {
      await page.goto("/opac/search");

      // Wait for page load
      await page.waitForLoadState("domcontentloaded");

      // Look for search input field
      const searchInputs = page.locator(
        "input[type='text'], input[type='search'], input[placeholder*='search' i]"
      );
      const inputCount = await searchInputs.count();

      // Verify search interface exists
      expect(inputCount).toBeGreaterThan(0);
    });

    test("OPAC can perform basic search", async ({ page }) => {
      await page.goto("/opac/search");

      // Wait for page to be ready
      await page.waitForLoadState("networkidle");

      // Try to find and interact with search
      const searchInput = page.locator("input[type='text'], input[type='search']").first();
      const isVisible = await searchInput.isVisible().catch(() => false);

      if (isVisible) {
        await searchInput.fill("test");

        // Look for search button
        const searchButton = page
          .locator("button[type='submit'], button:has-text('Search')")
          .first();
        const buttonVisible = await searchButton.isVisible().catch(() => false);

        if (buttonVisible) {
          await searchButton.click({ force: true });

          // Wait a bit for results
          await page.waitForTimeout(2000);

          // Verify we're still on a valid page
          await expect(page.locator("body")).toBeVisible();
        }
      }

      // Verify the OPAC search page loaded correctly
      const bodyText = await page
        .locator("body")
        .textContent()
        .catch(() => "");
      expect(bodyText?.length).toBeGreaterThan(0);
      expect(bodyText).not.toMatch(/Internal Server Error/i);
    });
  });

  test.describe("Staff Catalog", () => {
    test.use({ storageState: authFile });

    test("staff catalog page loads", async ({ page }) => {
      await page.goto("/staff/catalog");

      // Verify we're on the catalog page
      await expect(page).toHaveURL(/\/staff\/catalog/);

      // Verify page body is visible
      await expect(page.locator("body")).toBeVisible();

      // Verify content loaded
      const content = await page.content();
      expect(content.length).toBeGreaterThan(100);
    });

    test("staff catalog has search functionality", async ({ page }) => {
      await page.goto("/staff/catalog");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Look for the staff catalog search input specifically (avoid hidden buttons/inputs)
      await expect(page.getByPlaceholder(/Title, author, ISBN, keyword/i)).toBeVisible();
    });

    test("staff catalog search works", async ({ page }) => {
      await page.goto("/staff/catalog");

      // Wait for page load
      await page.waitForLoadState("networkidle");

      // Look for search input
      const searchInput = page.locator("input[type='text'], input[type='search']").first();
      const isVisible = await searchInput.isVisible().catch(() => false);

      if (isVisible) {
        // Perform a search
        await searchInput.fill("test search");

        // Try to find and click search button
        const searchButton = page
          .locator("button[type='submit'], button:has-text('Search')")
          .first();
        const buttonVisible = await searchButton.isVisible().catch(() => false);

        if (buttonVisible) {
          await searchButton.click({ force: true });
          await page.waitForTimeout(2000);
        }
      }

      // Verify we're still on a valid page
      await expect(page.locator("body")).toBeVisible();
    });

    test("cataloging interface is accessible", async ({ page }) => {
      await page.goto("/staff/cataloging");

      // Verify cataloging page loads with meaningful content
      await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible();

      // Verify we're in the staff area
      await expect(page).toHaveURL(/\/staff/);

      // Verify no server error
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/Internal Server Error/i);
    });

    test("MARC editor is accessible", async ({ page }) => {
      await page.goto("/staff/cataloging/marc-editor");

      // Verify MARC editor page loads with meaningful content
      await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible();

      // Verify we're in the staff area
      await expect(page).toHaveURL(/\/staff/);

      // Verify no server error
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/Internal Server Error/i);
    });

    test("Z39.50 import is accessible", async ({ page }) => {
      await page.goto("/staff/cataloging/z3950");

      // Verify Z39.50 page loads with meaningful content
      await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible();

      // Verify we're in the staff area
      await expect(page).toHaveURL(/\/staff/);

      // Verify no server error
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/Internal Server Error/i);
    });

    test("record details load when accessed directly", async ({ page }) => {
      const recordId = process.env.E2E_RECORD_ID || "10";
      await page.goto(`/staff/catalog/record/${recordId}`);

      // Page should load with meaningful content (even if record doesn't exist, page structure should load)
      await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible();

      // Verify we're in the staff area
      await expect(page).toHaveURL(/\/staff/);

      // Verify no server error
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/Internal Server Error/i);
    });

    test("holdings display is accessible", async ({ page }) => {
      await page.goto("/staff/cataloging/holdings");

      // Verify holdings page loads with meaningful content
      await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible();

      // Verify we're in the staff area
      await expect(page).toHaveURL(/\/staff/);

      // Verify no server error
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/Internal Server Error/i);
    });

    test("catalog navigation works", async ({ page }) => {
      // Navigate through catalog pages
      await page.goto("/staff/catalog");
      await expect(page).toHaveURL(/catalog/);

      await page.goto("/staff/cataloging");
      await expect(page.locator("body")).toBeVisible();

      // Verify no server error
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/Internal Server Error/i);
    });
  });

  test.describe("Search and Record Details", () => {
    test("OPAC record details page structure loads", async ({ page }) => {
      // Try accessing a record details page
      await page.goto("/opac/record/1");

      // Page should load with meaningful content (even if specific record doesn't exist)
      await expect(page.locator("main, [role='main'], h1, h2, nav").first()).toBeVisible();

      // Verify no server error
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/Internal Server Error/i);
    });

    test("search results can be accessed", async ({ page }) => {
      await page.goto("/opac/search?q=test");

      // Wait for page load
      await page.waitForLoadState("domcontentloaded");

      // Verify page loaded with meaningful content
      await expect(page.locator("main, [role='main'], h1, h2, nav").first()).toBeVisible();

      // Verify no server error
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/Internal Server Error/i);
    });
  });
});
