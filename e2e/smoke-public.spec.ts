import { test, expect } from "@playwright/test";

test.describe("Public Smoke", () => {
  test("root page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/StacksOS/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("public OPAC routes respond and render", async ({ page }) => {
    const routes = ["/opac", "/opac/help", "/opac/terms", "/opac/mobile", "/opac/search?q=test"];

    for (const route of routes) {
      const response = await page.goto(route);
      expect(response, `no response for ${route}`).toBeTruthy();
      expect(response?.status(), `bad status for ${route}`).toBeLessThan(400);
      await expect(page.locator("body"), `body missing on ${route}`).toBeVisible();
    }
  });

  test("staff login page renders required controls", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("form")).toBeVisible();
    await expect(page.locator("input#username")).toBeVisible();
    await expect(page.locator("input#password")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("health endpoints respond", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBeLessThan(500);

    const evergreenPing = await request.get("/api/evergreen/ping");
    expect(evergreenPing.status()).toBeLessThan(500);
  });
});
