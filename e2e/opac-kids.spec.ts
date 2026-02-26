import { test, expect } from "@playwright/test";

test.describe("OPAC Kids", () => {
  test("kids home route loads", async ({ page }) => {
    await page.goto("/opac/kids");

    await expect(page.locator("body")).toBeVisible();

    const disabled = page.getByText(/kids catalog is disabled/i);
    const isDisabled = await disabled.isVisible().catch(() => false);

    if (isDisabled) {
      await expect(disabled).toBeVisible();
      await expect(page.getByRole("link", { name: /back to opac/i })).toBeVisible();
      return;
    }

    // Enabled posture: should render the kids layout header branding.
    await expect(page.getByRole("link", { name: /Kids Zone/i }).first()).toBeVisible();
  });
});
