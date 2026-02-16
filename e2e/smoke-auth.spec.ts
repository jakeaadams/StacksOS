import { test, expect } from "@playwright/test";

import { hasStaffCredentials, loginAsStaff } from "./helpers";

test.describe("Authenticated Smoke", () => {
  test.skip(!hasStaffCredentials(), "Set E2E_STAFF_USER/E2E_STAFF_PASS to run auth smoke.");

  test("staff login succeeds and dashboard loads", async ({ page }) => {
    await loginAsStaff(page);
    await expect(page).toHaveURL(/\/staff/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("core staff workflows load after authentication", async ({ page }) => {
    await loginAsStaff(page);

    const routeChecks = [
      { route: "/staff/circulation/checkout", heading: /check out/i },
      { route: "/staff/circulation/checkin", heading: /check in/i },
      { route: "/staff/patrons", heading: /patron search/i },
      { route: "/staff/catalog", heading: /catalog/i },
      { route: "/staff/catalog/record/1", heading: /record|bibliographic details/i },
      { route: "/staff/ill", heading: /interlibrary loan|ill requests/i },
      { route: "/staff/reports/my-reports", heading: /my reports/i },
    ];

    for (const check of routeChecks) {
      await page.goto(check.route);
      await expect(page.getByRole("heading", { name: check.heading }).first()).toBeVisible();
      await expect(page.getByText(/CSRF token validation failed/i)).toHaveCount(0);
    }
  });
});
