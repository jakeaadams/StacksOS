import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

export default async function globalSetup(config: FullConfig) {
  const authFile = path.resolve("e2e/.auth/staff.json");
  await fs.mkdir(path.dirname(authFile), { recursive: true });

  const baseURL =
    process.env.BASE_URL ||
    (config.projects[0]?.use as { baseURL?: string } | undefined)?.baseURL ||
    "http://localhost:3001";

  const username = process.env.E2E_STAFF_USER || "jake";
  const password = process.env.E2E_STAFF_PASS || "jake";

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-forwarded-for": `e2e-global-setup-${Date.now()}` },
  });

  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("input#username").fill(username);
  await page.locator("input#password").fill(password);
  await page.locator("button[type='submit']").click({ force: true });
  await page.waitForURL(/\/staff/, { timeout: 15000 });

  await context.storageState({ path: authFile });
  await browser.close();
}
