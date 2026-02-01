import { test, expect } from "@playwright/test";

const authFile = "e2e/.auth/staff.json";

test.describe("Patron UX", () => {
  test.use({ storageState: authFile });

  test("results badge appears only after search; cockpit + full record show photo", async ({ page }) => {
    const patronId = 123;
    const photoDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABJzQnCgAAAABJRU5ErkJggg==";

    await page.route("**/api/evergreen/patrons**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());

      if (req.method() === "GET") {
        const id = url.searchParams.get("id");
        const q = url.searchParams.get("q");

        if (id) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              patron: {
                id: patronId,
                barcode: "39000000001235",
                first_given_name: "Jake",
                family_name: "Adams",
                email: "jake@example.com",
                day_phone: "555-0100",
                home_ou: 1,
                profile: { name: "Staff" },
                active: true,
                barred: false,
                expire_date: null,
                standing_penalties: [],
              },
            }),
          });
        }

        if (q) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              patrons: [
                {
                  id: patronId,
                  barcode: "39000000001235",
                  firstName: "Jake",
                  lastName: "Adams",
                  email: "jake@example.com",
                  phone: "555-0100",
                  homeLibrary: 1,
                  patronType: "Staff",
                  isActive: true,
                },
              ],
            }),
          });
        }
      }

      if (req.method() === "PATCH") {
        const body = req.postData();
        let parsed: any = null;
        try {
          parsed = body ? JSON.parse(body) : null;
        } catch {
          parsed = null;
        }

        if (parsed?.action === "getNotes") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, notes: [] }),
          });
        }

        if (parsed?.action === "getPenaltyTypes") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, penaltyTypes: [] }),
          });
        }
      }

      return route.continue();
    });

    await page.route("**/api/evergreen/circulation**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const action = url.searchParams.get("action");

      if (req.method() !== "GET") {
        return route.continue();
      }

      if (action === "holds") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, holds: [] }),
        });
      }

      if (action === "bills") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, bills: [] }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          checkouts: {
            out: [],
            overdue: [],
            claims_returned: [],
            lost: [],
            long_overdue: [],
          },
        }),
      });
    });

    await page.route("**/api/upload-patron-photo**", async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, url: photoDataUrl }),
        });
      }

      return route.continue();
    });

    await page.goto("/staff/patrons");

    await expect(page.getByTestId("patron-search-results")).toHaveCount(0);

    const searchInput = page.getByPlaceholder("Name, barcode, email, phone...");
    await searchInput.fill("jake adams");
    await searchInput.press("Enter");

    await expect(page.getByTestId("patron-search-results")).toHaveText("Results: 1");
    await page.getByText("Adams, Jake").click();

    await expect(page.getByText("Patron Quick View")).toBeVisible();
    await expect(page.getByTestId("patron-cockpit-photo-image")).toHaveAttribute(
      "src",
      /data:image\/png;base64/i
    );

    await page.getByRole("link", { name: /full record/i }).click();
    await page.waitForURL(new RegExp(`/staff/patrons/${patronId}.*`));

    await expect(page.getByTestId("patron-card-photo-image").first()).toHaveAttribute(
      "src",
      /data:image\/png;base64/i
    );
  });
});
