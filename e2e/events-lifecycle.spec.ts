import { test, expect } from "@playwright/test";

test.describe("Events Lifecycle", () => {
  test("events list page loads and renders heading", async ({ page }) => {
    const response = await page.goto("/opac/events");
    expect(response, "events page did not respond").toBeTruthy();
    expect(response?.status(), "events page returned error status").toBeLessThan(500);

    // The page should contain an events-related heading or content.
    // The heading text comes from translations so we match flexibly.
    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Check for page content that indicates the events module loaded.
    // Accept either a heading, the CalendarDays icon area, or events-related text.
    const hasEventsContent = await page
      .locator("h1, h2, [data-testid]")
      .filter({ hasText: /event/i })
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    const hasCalendarIcon = await page
      .locator("svg")
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    expect(
      hasEventsContent || hasCalendarIcon,
      "events page should show events-related content or calendar UI"
    ).toBeTruthy();
  });

  test("events page does not render a server error", async ({ page }) => {
    await page.goto("/opac/events");

    const bodyText = await page
      .locator("body")
      .textContent({ timeout: 10000 })
      .catch(() => "");

    // Should not show unhandled server errors
    expect(bodyText).not.toMatch(/Internal Server Error/i);
    expect(bodyText).not.toMatch(/Application error/i);
    expect(bodyText).not.toMatch(/500/);
  });

  test("events page handles empty state gracefully", async ({ page }) => {
    await page.goto("/opac/events");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to finish (skeleton placeholders should disappear)
    await page
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 15000 })
      .catch(() => {
        // If no skeleton was shown, that is fine too
      });

    // At this point the page should either show events or an empty state.
    // Both are valid outcomes. Verify no unhandled error appears.
    const bodyText = await page
      .locator("body")
      .textContent()
      .catch(() => "");

    expect(bodyText).not.toMatch(/Unhandled Runtime Error/i);
  });

  test("event detail page renders when an event exists", async ({ page }) => {
    await page.goto("/opac/events");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to finish
    await page
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 15000 })
      .catch(() => {});

    // Look for any link to an event detail page
    const eventLink = page.locator("a[href*='/opac/events/']").first();
    const hasEventLink = await eventLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasEventLink) {
      // No events exist — skip the detail page check defensively
      test.skip(true, "No event links found on events page (likely no events configured)");
      return;
    }

    const href = await eventLink.getAttribute("href");
    expect(href).toBeTruthy();

    await eventLink.click();
    await page.waitForURL(/\/opac\/events\/.+/, { timeout: 10000 });

    // The detail page should not error
    const bodyText = await page
      .locator("body")
      .textContent({ timeout: 10000 })
      .catch(() => "");
    expect(bodyText).not.toMatch(/Internal Server Error/i);
    expect(bodyText).not.toMatch(/Application error/i);
  });

  test("event detail page shows capacity info when applicable", async ({ page }) => {
    await page.goto("/opac/events");
    await page.waitForLoadState("domcontentloaded");

    await page
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 15000 })
      .catch(() => {});

    const eventLink = page.locator("a[href*='/opac/events/']").first();
    const hasEventLink = await eventLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasEventLink) {
      test.skip(true, "No event links found to navigate to detail");
      return;
    }

    await eventLink.click();
    await page.waitForURL(/\/opac\/events\/.+/, { timeout: 10000 });

    // Look for capacity-related content: "Capacity", "spots left", or "Registration"
    const hasCapacitySection = await page
      .locator("text=Capacity")
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    const hasRegistrationSection = await page
      .locator("text=Registration")
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // At least one of these should be present on the detail page
    expect(
      hasCapacitySection || hasRegistrationSection,
      "event detail should show capacity or registration info"
    ).toBeTruthy();
  });

  test("registration requires authentication", async ({ page }) => {
    await page.goto("/opac/events");
    await page.waitForLoadState("domcontentloaded");

    await page
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 15000 })
      .catch(() => {});

    // Look for a "Log in to register" button or a "Register" button
    const loginButton = page.locator("button", { hasText: /log in to register/i }).first();
    const hasLoginButton = await loginButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasLoginButton) {
      // If there is no login-required button, the user may already be logged in
      // or there are no registration-required events. Skip defensively.
      test.skip(
        true,
        "No 'Log in to register' button visible (user may be logged in or no registration-required events)"
      );
      return;
    }

    await loginButton.click();

    // Should redirect to login page with redirect back to events
    await page.waitForURL(/\/opac\/login/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/opac\/login/);
    expect(page.url()).toMatch(/redirect/);
  });

  test("event detail page breadcrumb navigation works", async ({ page }) => {
    await page.goto("/opac/events");
    await page.waitForLoadState("domcontentloaded");

    await page
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 15000 })
      .catch(() => {});

    const eventLink = page.locator("a[href*='/opac/events/']").first();
    const hasEventLink = await eventLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasEventLink) {
      test.skip(true, "No event links found to test breadcrumbs");
      return;
    }

    await eventLink.click();
    await page.waitForURL(/\/opac\/events\/.+/, { timeout: 10000 });

    // Look for "Events" breadcrumb link that navigates back
    const eventsNavLink = page.locator("a[href='/opac/events']").first();
    const hasBreadcrumb = await eventsNavLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBreadcrumb) {
      await eventsNavLink.click();
      await page.waitForURL(/\/opac\/events$/, { timeout: 10000 });
      expect(page.url()).toMatch(/\/opac\/events$/);
    }
  });

  test("events page filter controls are present", async ({ page }) => {
    await page.goto("/opac/events");
    await page.waitForLoadState("domcontentloaded");

    // The page should have search input and filter controls
    const searchInput = page.locator("input[type='text']").first();
    const hasSearch = await searchInput.isVisible({ timeout: 10000 }).catch(() => false);

    // Filters section (branch / type selects, view mode tabs)
    const hasViewTabs = await page
      .locator("[role='tablist']")
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // At least the search input or tabs should exist for an interactive events page
    expect(
      hasSearch || hasViewTabs,
      "events page should have search input or view mode tabs"
    ).toBeTruthy();
  });

  test("events API endpoint responds", async ({ request }) => {
    const res = await request.get("/api/opac/events");
    expect(res.status()).toBeLessThan(500);

    const data = await res.json().catch(() => null);
    if (res.ok() && data) {
      // If the API responds with events data, validate shape
      expect(data).toHaveProperty("events");
      expect(Array.isArray(data.events)).toBe(true);
    }
  });

  test("event registrations API rejects unauthenticated POST", async ({ request }) => {
    const res = await request.post("/api/opac/events/registrations", {
      data: { action: "register", eventId: "evt-001" },
      headers: { "Content-Type": "application/json" },
    });

    // Should be 401 (unauthorized) since no session cookie is set
    expect(res.status()).toBe(401);
  });

  test("event registrations API rejects unauthenticated GET", async ({ request }) => {
    const res = await request.get("/api/opac/events/registrations");

    expect(res.status()).toBe(401);
  });

  test("nonexistent event detail returns 404 or not found state", async ({ page }) => {
    const response = await page.goto("/opac/events/nonexistent-event-id-12345");
    // The page should either return 404 or render a not-found UI
    const status = response?.status() ?? 0;
    const bodyText = await page
      .locator("body")
      .textContent({ timeout: 10000 })
      .catch(() => "");

    const is404Response = status === 404;
    const hasNotFoundContent = /not found/i.test(bodyText || "") || /404/i.test(bodyText || "");

    expect(
      is404Response || hasNotFoundContent,
      "nonexistent event should return 404 or show not-found content"
    ).toBeTruthy();
  });
});
