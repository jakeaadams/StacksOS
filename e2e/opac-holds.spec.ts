import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { getStaffCredentials } from "./helpers";

function loadDemoData(): any | null {
  try {
    const p = path.resolve("audit", "demo_data.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

test.describe("OPAC Holds (mutating)", () => {
  test.skip(process.env.E2E_MUTATE !== "1", "E2E_MUTATE!=1 (skipping mutating OPAC hold workflow)");

  test("place hold → change pickup → cancel", async ({ page, request }) => {
    const demo = loadDemoData();
    const patronBarcode = process.env.E2E_PATRON_BARCODE || demo?.demoPatronBarcode;
    const patronPin = process.env.E2E_PATRON_PIN || demo?.demoPatronPin || "DEMO1234";

    test.skip(!patronBarcode, "Missing E2E_PATRON_BARCODE (or audit/demo_data.json demoPatronBarcode)");

    // Ensure the demo patron PIN is deterministic for OPAC login.
    // This keeps the E2E flow stable even if the patron already existed.
    const { username: staffUser, password: staffPass } = getStaffCredentials();
    const csrfResp = await request.get("/api/csrf-token");
    const csrfJson = await csrfResp.json();
    const csrfToken = csrfJson?.token;
    if (!csrfToken) {
      throw new Error("Failed to obtain CSRF token for patron PIN reset");
    }

    await request.post("/api/evergreen/auth", {
      headers: { "x-csrf-token": csrfToken, "x-forwarded-for": `e2e-opac-holds-staff-${Date.now()}` },
      data: { username: staffUser, password: staffPass },
    });

    const patronLookup = await request.get(`/api/evergreen/patrons?barcode=${encodeURIComponent(String(patronBarcode))}`);
    const patronData = await patronLookup.json();
    const patronId = patronData?.patron?.id;
    if (!patronId) {
      throw new Error("Failed to resolve demo patron id for OPAC hold workflow");
    }

    await request.put("/api/evergreen/patrons", {
      headers: { "x-csrf-token": csrfToken, "x-forwarded-for": `e2e-opac-holds-pin-${Date.now()}` },
      data: { id: patronId, password: patronPin },
    });

    const titleQuery = "StacksOS Demo Book 001";

    await page.goto(`/opac/login?redirect=${encodeURIComponent(`/opac/search?q=${encodeURIComponent(titleQuery)}`)}`);
    await page.locator("input#cardNumber").fill(String(patronBarcode));
    await page.locator("input#pin").fill(String(patronPin));
    await page.getByRole("button", { name: /^Sign In$/i }).click();

    await page.waitForURL(/\/opac\/search/, { timeout: 15000 });

    // Switch to list view for stable selectors.
    await page.getByRole("button", { name: /list view/i }).click();

    const resultLink = page.getByRole("link", { name: new RegExp(titleQuery, "i") }).first();
    await expect(resultLink).toBeVisible({ timeout: 15000 });
    await resultLink.click();

    await page.waitForURL(/\/opac\/record\//, { timeout: 15000 });

    await page.getByRole("button", { name: /^Place Hold$/i }).click();
    await expect(page.getByRole("heading", { name: /place hold/i })).toBeVisible();

    const pickupSelect = page.locator("select").first();
    await pickupSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: /confirm hold/i }).click();

    const holdPlacedButton = page.getByRole("button", { name: /hold placed/i });
    const holdExistsError = page.getByText(/already have a hold/i);

    const outcome = await Promise.race([
      holdPlacedButton
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => "placed" as const)
        .catch(() => null),
      holdExistsError
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => "exists" as const)
        .catch(() => null),
    ]);

    if (!outcome) {
      // Surface any error message that might have rendered.
      const bodyText = (await page.locator("body").textContent().catch(() => "")) || "";
      throw new Error(`Hold placement did not complete (no success or known error). Body excerpt: ${bodyText.slice(0, 240)}`);
    }

    if (outcome === "exists") {
      // Close the modal if a hold already exists; we'll manage it from My Holds.
      await page.getByRole("button", { name: /^Cancel$/i }).click();
    } else {
      await expect(page.getByRole("heading", { name: /place hold/i })).toBeHidden({ timeout: 15000 });
    }

    await page.goto("/opac/account/holds");
    await expect(page.getByRole("heading", { name: /my holds/i })).toBeVisible({ timeout: 15000 });

    const holdCard = page.locator("div.bg-card").filter({ hasText: titleQuery }).first();
    await expect(holdCard).toBeVisible({ timeout: 15000 });

    const changePickup = holdCard.getByRole("button", { name: /change pickup/i });
    const canChangePickup = await changePickup.isVisible().catch(() => false);
    if (canChangePickup) {
      await changePickup.click();
      await expect(page.getByRole("heading", { name: /change pickup location/i })).toBeVisible({ timeout: 15000 });

      const pickupModalSelect = page.locator("select").first();
      const options = await pickupModalSelect.locator("option").all();
      const index = options.length >= 3 ? 2 : 1;
      await pickupModalSelect.selectOption({ index });

      await page.getByRole("button", { name: /^Save$/i }).click();
      await expect(page.getByRole("heading", { name: /change pickup location/i })).toBeHidden({ timeout: 15000 });
    }

    await holdCard.getByRole("button", { name: /^Cancel$/i }).click();
    await page.getByRole("button", { name: /cancel hold/i }).click();

    // Expect the hold to disappear from the list after the mutation + refresh.
    await expect(holdCard).toBeHidden({ timeout: 15000 });
  });
});
