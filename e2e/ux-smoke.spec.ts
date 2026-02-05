import { test, expect, type Page } from "@playwright/test";

import { getStaffCredentials } from "./helpers";

async function expectNoCsrfBanner(page: Page) {
  // Give client-side requests a beat to surface any error banners/toasts.
  await page.waitForTimeout(1500);
  await expect(page.getByText(/CSRF token validation failed/i)).toHaveCount(0);
}

test.describe("UX smoke (CSRF)", () => {
  test("core routes load without CSRF banners", async ({ page }) => {
    const { username, password } = getStaffCredentials();

    await page.goto("/login");
    await page.locator("input#username").fill(username);
    await page.locator("input#password").fill(password);
    await page.locator("button[type='submit']").click({ force: true });
    await page.waitForURL(/\/staff/, { timeout: 15000 });
    await expectNoCsrfBanner(page);

    await page.goto("/staff/circulation/checkout");
    await expect(page.getByRole("heading", { name: /check out/i })).toBeVisible();
    await expectNoCsrfBanner(page);

    await page.goto("/staff/circulation/checkin");
    await expect(page.getByRole("heading", { name: /check in/i })).toBeVisible();
    await expectNoCsrfBanner(page);

    await page.goto("/staff/patrons");
    await expect(page.getByRole("heading", { name: /patron search/i })).toBeVisible();
    await expectNoCsrfBanner(page);

    await page.goto("/opac/search?q=test");
    await expect(page.locator("input[name='q']")).toBeVisible();
    await expectNoCsrfBanner(page);
  });
});
