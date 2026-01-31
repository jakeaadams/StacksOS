import { test, expect } from "@playwright/test";

const authFile = "e2e/.auth/staff.json";

test.describe("Item Detail", () => {
  test.use({ storageState: authFile });

  test("opens item detail from a record barcode link", async ({ page }) => {
    const recordId = process.env.E2E_RECORD_ID || "10";

    await page.goto(`/staff/catalog/record/${recordId}`);
    await page.waitForLoadState("networkidle");

    const firstBarcodeLink = page.locator("a[href^='/staff/catalog/item/']").first();
    const hasAny = (await firstBarcodeLink.count()) > 0;
    test.skip(!hasAny, `No item links found on /staff/catalog/record/${recordId}`);

    const barcode = (await firstBarcodeLink.textContent())?.trim();
    await firstBarcodeLink.click();
    await page.waitForURL(/\/staff\/catalog\/item\//, { timeout: 15000 });

    if (barcode) {
      await expect(page.getByText(barcode).first()).toBeVisible();
    }
    await expect(page.getByText(/barcode is required/i)).toHaveCount(0);

    // Cover picker should be available for bib-backed items.
    const changeCoverButton = page.getByRole("button", { name: /change cover/i }).first();
    if (await changeCoverButton.isVisible().catch(() => false)) {
      await changeCoverButton.click({ force: true });
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByText(/choose cover art/i)).toBeVisible();
    }
  });
});
