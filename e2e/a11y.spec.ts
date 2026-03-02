import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const authFile = "e2e/.auth/staff.json";

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Radix UI Select renders a hidden native <select> for form-submission
    // compatibility.  The visible trigger button already carries the
    // accessible name, so we exclude the Radix internal element.
    .exclude("[data-radix-select-viewport]")
    .analyze();

  const serious = results.violations.filter((v) => {
    if (v.impact !== "critical" && v.impact !== "serious") return false;
    // Additionally filter out violations on aria-hidden elements which are
    // internal to UI library implementations (Radix BubbleSelect, etc.)
    const allHidden = v.nodes.every((node) => node.html.includes("aria-hidden"));
    return !allHidden;
  });
  expect(serious).toEqual([]);
}

test.describe("Accessibility (axe)", () => {
  test("login page has no serious violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /stacksos/i })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test.describe("staff pages", () => {
    test.use({ storageState: authFile });

    test("staff home has no serious violations", async ({ page }) => {
      await page.goto("/staff");
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test("checkout page has no serious violations", async ({ page }) => {
      await page.goto("/staff/circulation/checkout");
      await expect(page.getByRole("heading", { name: /check out/i })).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test("checkin page has no serious violations", async ({ page }) => {
      await page.goto("/staff/circulation/checkin");
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test("patron search has no serious violations", async ({ page }) => {
      await page.goto("/staff/patrons");
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test("catalog page has no serious violations", async ({ page }) => {
      await page.goto("/staff/catalog");
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test("cataloging page has no serious violations", async ({ page }) => {
      await page.goto("/staff/cataloging");
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test("admin page has no serious violations", async ({ page }) => {
      await page.goto("/staff/admin");
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test("acquisitions orders has no serious violations", async ({ page }) => {
      await page.goto("/staff/acquisitions/orders");
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test("reports page has no serious violations", async ({ page }) => {
      await page.goto("/staff/reports");
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test("circulation bills page has no serious violations", async ({ page }) => {
      await page.goto("/staff/circulation/bills");
      await expect(page.locator("body")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });
  });
});

test.describe("OPAC public pages", () => {
  test("OPAC search has no serious violations", async ({ page }) => {
    await page.goto("/opac/search");
    await expect(page.locator("body")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("OPAC home has no serious violations", async ({ page }) => {
    await page.goto("/opac");
    await expect(page.locator("body")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("OPAC advanced search has no serious violations", async ({ page }) => {
    await page.goto("/opac/advanced-search");
    await expect(page.locator("body")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
