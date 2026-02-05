import { test, expect } from "@playwright/test";

import { getStaffCredentials } from "./helpers";

const authFile = "e2e/.auth/staff.json";

test.describe("Keyboard-only smoke", () => {
  test("login works with keyboard only", async ({ page }) => {
    const { username, password } = getStaffCredentials();

    await page.goto("/login");

    // Focus username via tabbing (no mouse).
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.locator("input#username").evaluate((el) => el === document.activeElement).catch(() => false);
      if (focused) break;
    }
    await expect(page.locator("input#username")).toBeFocused();
    await page.keyboard.type(username);

    await page.keyboard.press("Tab");
    await expect(page.locator("input#password")).toBeFocused();
    await page.keyboard.type(password);

    // Submit via Enter (form submit).
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/staff/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/staff/);
  });

  test.describe("authenticated navigation", () => {
    test.use({ storageState: authFile });

    test("sidebar navigation works from focused links", async ({ page }) => {
      await page.goto("/staff");

      const checkoutLink = page.getByRole("link", { name: /^check out$/i });
      await checkoutLink.focus();
      await expect(checkoutLink).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/staff\/circulation\/checkout/);

      const patronsLink = page.getByRole("link", { name: /search patrons/i });
      await patronsLink.focus();
      await expect(patronsLink).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/staff\/patrons/);
    });
  });
});
