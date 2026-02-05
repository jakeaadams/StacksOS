import { test, expect } from "@playwright/test";

const authFile = "e2e/.auth/staff.json";

test.describe("Staff Activity Log", () => {
  test.use({ storageState: authFile });

  test("activity log page loads (no error boundary)", async ({ page }) => {
    await page.goto("/staff/activity");

    await expect(page).toHaveURL(/\/staff\/activity/);
    await expect(page.locator("body")).toBeVisible();

    // If the route crashes, Next will render the global error boundary.
    await expect(page.getByRole("heading", { name: /something went wrong/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /activity log/i })).toBeVisible();
  });
});

