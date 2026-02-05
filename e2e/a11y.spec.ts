import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const authFile = "e2e/.auth/staff.json";

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
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
  });
});
