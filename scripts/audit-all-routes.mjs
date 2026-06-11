#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT = process.cwd();
const APP_ROOT = path.join(ROOT, "src", "app");
const OUT_DIR = path.join(ROOT, "audit", "all-routes");
const SCREENSHOT_DIR = path.join(OUT_DIR, "screenshots");
const REPORT_JSON = path.join(OUT_DIR, "report.json");
const REPORT_MD = path.join(OUT_DIR, "REPORT.md");
const ROUTES_TSV = path.join(OUT_DIR, "routes.tsv");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const STAFF_USER = process.env.STACKSOS_AUDIT_STAFF_USERNAME || process.env.E2E_STAFF_USER || "";
const STAFF_PASS = process.env.STACKSOS_AUDIT_STAFF_PASSWORD || process.env.E2E_STAFF_PASS || "";
const OPAC_BARCODE = process.env.STACKSOS_AUDIT_PATRON_BARCODE || process.env.E2E_PATRON_BARCODE || "";
const OPAC_PIN = process.env.STACKSOS_AUDIT_PATRON_PIN || process.env.E2E_PATRON_PIN || "";
const LIMIT = Number.parseInt(process.env.AUDIT_ROUTE_LIMIT || "0", 10);
const VIEWPORTS = (process.env.AUDIT_VIEWPORTS || "desktop")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const VIEWPORT_CONFIG = {
  desktop: { width: 1512, height: 945 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
};

const ISSUE_TEXT_RE =
  /\b(?:coming soon|not implemented|placeholder ui|todo\b|lorem ipsum|mock data|sample data|demo only|dummy data)\b/i;

function normalizeRoute(route) {
  return route === "" ? "/" : route;
}

function routeFromPageFile(filePath) {
  const rel = path.relative(APP_ROOT, filePath).split(path.sep).join("/");
  return normalizeRoute(`/${rel.replace(/(^|\/)page\.tsx$/, "")}`);
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name === "page.tsx") {
      files.push(full);
    }
  }
  return files;
}

async function readJson(url, context) {
  try {
    const res = context ? await context.request.get(url) : await fetch(url);
    if (!res.ok()) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchCsrfToken(context) {
  const res = await context.request.get(`${BASE_URL}/api/csrf-token`);
  if (!res.ok()) {
    throw new Error(`CSRF token request returned HTTP ${res.status()}`);
  }
  const data = await res.json().catch(() => null);
  const token = typeof data?.token === "string" ? data.token : "";
  if (!token) throw new Error("CSRF token response did not include a token");

  // APIRequestContext cookie persistence can differ across Playwright versions.
  // Seed the double-submit cookie explicitly so API login behaves like the UI.
  await context.addCookies([
    {
      name: "_csrf_token",
      value: token,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Strict",
      secure: BASE_URL.startsWith("https://"),
    },
  ]);
  return token;
}

async function persistSetCookiesForLocalAudit(context, setCookieHeader) {
  if (!setCookieHeader) return;
  const cookieNames = new Set(["authtoken", "stacksos_session_id", "_csrf_token"]);
  const cookies = String(setCookieHeader)
    .split(/,(?=\s*[^;,\s]+=)/)
    .map((part) => part.trim())
    .map((part) => {
      const pair = part.split(";")[0] || "";
      const idx = pair.indexOf("=");
      if (idx <= 0) return null;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!cookieNames.has(name) || !value) return null;
      return {
        name,
        value,
        url: BASE_URL,
        httpOnly: true,
        sameSite: name === "_csrf_token" ? "Strict" : "Lax",
        secure: BASE_URL.startsWith("https://"),
      };
    })
    .filter(Boolean);
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }
}

function firstNumber(...values) {
  for (const value of values) {
    const n = Number.parseInt(String(value ?? ""), 10);
    if (Number.isFinite(n) && n > 0) return String(n);
  }
  return "";
}

async function loginStaff(page) {
  if (!STAFF_USER || !STAFF_PASS) {
    return { ok: false, note: "Staff credentials were not provided." };
  }

  const csrfToken = await fetchCsrfToken(page.context());
  const login = await page.context().request.post(`${BASE_URL}/api/evergreen/auth`, {
    data: { username: STAFF_USER, password: STAFF_PASS },
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
  });
  if (!login.ok()) {
    const body = await login.json().catch(() => null);
    return {
      ok: false,
      note: body?.error || `Staff auth API returned HTTP ${login.status()}`,
    };
  }
  const setCookieHeader =
    typeof login.headerValue === "function"
      ? await login.headerValue("set-cookie")
      : login.headers()["set-cookie"];
  await persistSetCookiesForLocalAudit(page.context(), setCookieHeader);

  const session = await page.context().request.get(`${BASE_URL}/api/evergreen/auth`).catch(() => null);
  if (!session?.ok()) return { ok: false, note: "Staff auth session check failed." };
  const data = await session.json().catch(() => null);
  return data?.authenticated
    ? { ok: true, note: "" }
    : { ok: false, note: "Staff auth did not create an authenticated session." };
}

async function loginOpac(page) {
  if (!OPAC_BARCODE || !OPAC_PIN) {
    return { ok: false, note: "Patron barcode/PIN were not provided; account routes are redirect-checked only." };
  }

  await page.goto(`${BASE_URL}/opac/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const inputs = page.locator("input");
  if ((await inputs.count()) < 2) return { ok: false, note: "OPAC login inputs not found." };
  await inputs.nth(0).fill(OPAC_BARCODE);
  await inputs.nth(1).fill(OPAC_PIN);
  await Promise.all([
    page
      .waitForURL((url) => !url.pathname.includes("/opac/login"), {
        timeout: 15000,
        waitUntil: "domcontentloaded",
      })
      .catch(() => null),
    page.locator("button[type='submit']").click({ force: true }),
  ]);
  const session = await page.request.get(`${BASE_URL}/api/opac/session`).catch(() => null);
  if (!session?.ok()) return { ok: false, note: "OPAC session check failed." };
  const data = await session.json().catch(() => null);
  return data?.authenticated
    ? { ok: true, note: "" }
    : { ok: false, note: "OPAC patron auth did not create a session." };
}

async function resolveFixtures(staffContext) {
  const fixtures = {
    bibId: "6",
    patronId: "93",
    patronBarcode: "29000000010013",
    itemId: "4",
    fundId: "1",
    eventId: "evt-demo",
    listId: "1",
  };

  const catalog = await readJson(`${BASE_URL}/api/evergreen/catalog?q=mockingbird`, staffContext);
  const record = Array.isArray(catalog?.records) ? catalog.records[0] : null;
  fixtures.bibId = firstNumber(record?.id, fixtures.bibId) || fixtures.bibId;

  const patron = await readJson(
    `${BASE_URL}/api/evergreen/patrons?barcode=${encodeURIComponent(fixtures.patronBarcode)}`,
    staffContext
  );
  fixtures.patronId = firstNumber(patron?.patron?.id, patron?.id, fixtures.patronId) || fixtures.patronId;

  const holdings = await readJson(`${BASE_URL}/api/evergreen/catalog?action=holdings&id=${fixtures.bibId}`, staffContext);
  const copy = Array.isArray(holdings?.copies) ? holdings.copies[0] : null;
  fixtures.itemId = firstNumber(copy?.id, copy?.copyId, copy?.copy_id, fixtures.itemId) || fixtures.itemId;

  const funds = await readJson(`${BASE_URL}/api/evergreen/acquisitions/funds?limit=1`, staffContext);
  const fund = Array.isArray(funds?.funds) ? funds.funds[0] : Array.isArray(funds?.items) ? funds.items[0] : null;
  fixtures.fundId = firstNumber(fund?.id, fund?.fundId, fixtures.fundId) || fixtures.fundId;

  const events = await readJson(`${BASE_URL}/api/opac/events?limit=1`, staffContext);
  const event = Array.isArray(events?.events) ? events.events[0] : Array.isArray(events?.items) ? events.items[0] : null;
  if (event?.id) fixtures.eventId = String(event.id);

  const lists = await readJson(`${BASE_URL}/api/opac/public-lists?limit=1`, staffContext);
  const list = Array.isArray(lists?.lists) ? lists.lists[0] : Array.isArray(lists?.items) ? lists.items[0] : null;
  fixtures.listId = String(list?.id || list?.listId || fixtures.listId);

  return fixtures;
}

function concreteRoute(route, fixtures) {
  let out = route;
  if (out.includes("/staff/patrons/[id]")) out = out.replace("[id]", fixtures.patronId);
  if (out.includes("/staff/catalog/item/[id]")) out = out.replace("[id]", fixtures.itemId);
  if (out.includes("/staff/catalog/record/[id]")) out = out.replace("[id]", fixtures.bibId);
  if (out.includes("/staff/acquisitions/funds/[id]")) out = out.replace("[id]", fixtures.fundId);
  if (out.includes("/opac/events/[id]")) out = out.replace("[id]", fixtures.eventId);
  if (out.includes("/opac/lists/[listId]")) out = out.replace("[listId]", fixtures.listId);
  if (out.includes("/opac/kids/record/[id]")) out = out.replace("[id]", fixtures.bibId);
  if (out.includes("/opac/record/[id]")) out = out.replace("[id]", fixtures.bibId);
  return out;
}

function routeWithQuery(route, fixtures) {
  const q = "mockingbird";
  if (route === "/opac/search" || route === "/opac/kids/search" || route === "/opac/teens/search") {
    return `${route}?q=${encodeURIComponent(q)}`;
  }
  if (route === "/staff/cataloging/holdings" || route === "/staff/cataloging/marc-editor") {
    return `${route}?id=${encodeURIComponent(fixtures.bibId)}`;
  }
  if (route === "/staff/circulation/checkout" || route === "/staff/circulation/bills" || route === "/staff/circulation/renew") {
    return `${route}?patron=${encodeURIComponent(fixtures.patronBarcode)}`;
  }
  return route;
}

function isStaffRoute(route) {
  return route.startsWith("/staff");
}

function isOpacAccountRoute(route) {
  return route.startsWith("/opac/account") || route.startsWith("/opac/kids/account");
}

function ignoreRequestFailure(url, failureText) {
  return (
    failureText === "net::ERR_ABORTED" ||
    url.includes("_rsc=") ||
    url.includes("/_next/static/") ||
    url.includes("/favicon")
  );
}

function ignoreBadResponse(url, status) {
  if (status < 400) return true;
  return url.includes("/_next/static/") || url.includes("/favicon") || url.endsWith("/robots.txt");
}

function routeSlug(viewport, route) {
  return `${viewport}-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 120) || "root"}`;
}

async function scanDom(page) {
  return page.evaluate((issueTextSource) => {
    const issueTextRe = new RegExp(issueTextSource, "i");
    const isVisible = (el) => {
      if (el.getAttribute("aria-hidden") === "true" || el.closest("[aria-hidden='true']")) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const clipped =
        style.clip !== "auto" ||
        style.clipPath !== "none" ||
        (style.position === "absolute" && el.getAttribute("tabindex") === "-1" && rect.width <= 1 && rect.height <= 1);
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0 && !clipped;
    };
    const labelFor = (el) => {
      const id = el.getAttribute("id");
      if (id) {
        const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (explicit?.textContent?.trim()) return explicit.textContent.trim();
      }
      const implicit = el.closest("label");
      if (implicit?.textContent?.trim()) return implicit.textContent.trim();
      return "";
    };
    const labelledByText = (el) => {
      const labelledBy = el.getAttribute("aria-labelledby");
      if (!labelledBy) return "";
      return labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() || "")
        .filter(Boolean)
        .join(" ")
        .trim();
    };
    const buttonLabel = (el) =>
      (el.textContent || "").trim() ||
      el.getAttribute("aria-label") ||
      labelledByText(el) ||
      labelFor(el) ||
      el.getAttribute("title") ||
      el.getAttribute("data-testid") ||
      "";

    const headings = Array.from(document.querySelectorAll("h1,h2"))
      .filter(isVisible)
      .map((el) => ({ tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 160) }))
      .filter((h) => h.text);
    const visibleButtons = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(isVisible)
      .map((el) => ({
        text: buttonLabel(el).trim().replace(/\s+/g, " ").slice(0, 120),
        disabled: Boolean(el.disabled || el.getAttribute("aria-disabled") === "true"),
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        classes: String(el.getAttribute("class") || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180),
        html: el.outerHTML.replace(/\s+/g, " ").slice(0, 220),
      }));
    const unlabeledButtonDetails = visibleButtons.filter((b) => !b.text).slice(0, 20);
    const unlabeledButtons = visibleButtons.filter((b) => !b.text).length;
    const deadLinks = Array.from(document.querySelectorAll("a[href]"))
      .filter(isVisible)
      .map((el) => ({ text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120), href: el.getAttribute("href") || "" }))
      .filter((a) => a.href === "#" || a.href.toLowerCase().startsWith("javascript:"));
    const unlabeledInputDetails = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea, select"))
      .filter(isVisible)
      .filter((el) => {
        const name =
          labelFor(el) ||
          el.getAttribute("aria-label") ||
          el.getAttribute("placeholder") ||
          el.getAttribute("title") ||
          "";
        return !name.trim();
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        classes: String(el.getAttribute("class") || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180),
        html: el.outerHTML.replace(/\s+/g, " ").slice(0, 220),
      }))
      .slice(0, 20);
    const unlabeledInputs = unlabeledInputDetails.length;
    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ");
    const issueTextMatch = bodyText.match(issueTextRe);
    const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 8;

    return {
      title: document.title,
      headings,
      visibleButtonCount: visibleButtons.length,
      disabledButtonCount: visibleButtons.filter((b) => b.disabled).length,
      sampleButtons: visibleButtons.slice(0, 20),
      unlabeledButtons,
      unlabeledButtonDetails,
      unlabeledInputs,
      unlabeledInputDetails,
      deadLinks: deadLinks.slice(0, 20),
      issueText: issueTextMatch ? issueTextMatch[0] : "",
      horizontalOverflow,
      bodyTextLength: bodyText.length,
    };
  }, ISSUE_TEXT_RE.source);
}

function classify(row) {
  const issues = [];
  if (row.mainStatus >= 500 || row.mainStatus === 0) issues.push("page_load_failed");
  if (row.mainStatus >= 400 && row.mainStatus < 500) issues.push("page_4xx");
  if (row.pageErrors.length) issues.push("page_error");
  if (row.consoleErrors.length) issues.push("console_error");
  if (row.badResponses.length) issues.push("bad_response");
  if (row.requestFailures.length) issues.push("request_failure");
  if (row.dom.unlabeledButtons > 0) issues.push("unlabeled_button");
  if (row.dom.unlabeledInputs > 0) issues.push("unlabeled_input");
  if (row.dom.deadLinks.length) issues.push("dead_link");
  if (row.dom.issueText) issues.push("unfinished_copy");
  if (row.dom.horizontalOverflow) issues.push("horizontal_overflow");
  if (!row.dom.headings.some((h) => h.tag === "h1") && row.route !== "/") issues.push("missing_h1");
  if (row.authExpected && row.finalPath.includes("/login")) issues.push("unexpected_auth_redirect");
  return issues;
}

async function auditRoute(context, route, viewportName, fixtures, options = {}) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  const requestFailures = [];
  let mainStatus = 0;

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    consoleErrors.push(msg.text().slice(0, 600));
  });
  page.on("pageerror", (err) => {
    pageErrors.push(String(err?.message || err).slice(0, 600));
  });
  page.on("response", (res) => {
    const status = res.status();
    const url = res.url();
    if (!ignoreBadResponse(url, status)) {
      badResponses.push({ status, url: url.replace(BASE_URL, "") });
    }
  });
  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText || "";
    const url = req.url();
    if (!ignoreRequestFailure(url, failure)) {
      requestFailures.push({ failure, url: url.replace(BASE_URL, "") });
    }
  });

  const concrete = routeWithQuery(concreteRoute(route, fixtures), fixtures);
  const url = `${BASE_URL}${concrete}`;
  let dom = {
    title: "",
    headings: [],
    visibleButtonCount: 0,
    disabledButtonCount: 0,
    sampleButtons: [],
    unlabeledButtons: 0,
    unlabeledInputs: 0,
    deadLinks: [],
    issueText: "",
    horizontalOverflow: false,
    bodyTextLength: 0,
  };
  let finalUrl = url;

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    mainStatus = response?.status() || 0;
    await page.waitForTimeout(options.settleMs || 900);
    finalUrl = page.url();
    dom = await scanDom(page);
  } catch (error) {
    pageErrors.push(error instanceof Error ? error.message.slice(0, 600) : String(error).slice(0, 600));
  }

  const finalPath = (() => {
    try {
      return new URL(finalUrl).pathname;
    } catch {
      return "";
    }
  })();
  const row = {
    route,
    concrete,
    viewport: viewportName,
    mainStatus,
    finalUrl,
    finalPath,
    authExpected: Boolean(options.authExpected),
    pageErrors,
    consoleErrors,
    badResponses: badResponses.slice(0, 20),
    requestFailures: requestFailures.slice(0, 20),
    dom,
    issues: [],
    screenshot: "",
  };
  row.issues = classify(row);

  if (row.issues.length) {
    const fileName = `${routeSlug(viewportName, route)}.png`;
    const screenshotPath = path.join(SCREENSHOT_DIR, fileName);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);
    row.screenshot = path.relative(ROOT, screenshotPath).split(path.sep).join("/");
  }

  await page.close().catch(() => null);
  return row;
}

function mdTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

async function writeReport(payload) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(
    ROUTES_TSV,
    [
      "viewport\troute\tconcrete\tstatus\tfinal_path\tissues\tscreenshot",
      ...payload.rows.map((r) =>
        [r.viewport, r.route, r.concrete, r.mainStatus, r.finalPath, r.issues.join(","), r.screenshot].join("\t")
      ),
    ].join("\n") + "\n",
    "utf8"
  );

  const issueRows = payload.rows
    .filter((r) => r.issues.length)
    .map((r) => [
      r.viewport,
      `\`${r.route}\``,
      String(r.mainStatus),
      r.issues.join(", "),
      r.screenshot ? `\`${r.screenshot}\`` : "",
    ]);
  const md = [
    "# All Routes UX Audit",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `Base URL: \`${payload.baseUrl}\``,
    `Routes: \`${payload.routeCount}\``,
    `Viewports: \`${payload.viewports.join(", ")}\``,
    `Staff auth: \`${payload.staffAuth.ok ? "ok" : "failed"}\`${payload.staffAuth.note ? ` - ${payload.staffAuth.note}` : ""}`,
    `OPAC auth: \`${payload.opacAuth.ok ? "ok" : "not active"}\`${payload.opacAuth.note ? ` - ${payload.opacAuth.note}` : ""}`,
    "",
    "## Summary",
    "",
    mdTable(
      ["Metric", "Count"],
      [
        ["Route visits", String(payload.rows.length)],
        ["Routes with issues", String(payload.rows.filter((r) => r.issues.length).length)],
        ["Page errors", String(payload.rows.reduce((sum, r) => sum + r.pageErrors.length, 0))],
        ["Console errors", String(payload.rows.reduce((sum, r) => sum + r.consoleErrors.length, 0))],
        ["Bad responses", String(payload.rows.reduce((sum, r) => sum + r.badResponses.length, 0))],
        ["Unlabeled buttons", String(payload.rows.reduce((sum, r) => sum + r.dom.unlabeledButtons, 0))],
        ["Unlabeled inputs", String(payload.rows.reduce((sum, r) => sum + r.dom.unlabeledInputs, 0))],
        ["Dead links", String(payload.rows.reduce((sum, r) => sum + r.dom.deadLinks.length, 0))],
        ["Unfinished-copy flags", String(payload.rows.filter((r) => r.dom.issueText).length)],
      ]
    ),
    "",
    "## Routes With Issues",
    "",
    issueRows.length ? mdTable(["Viewport", "Route", "Status", "Issues", "Screenshot"], issueRows) : "None.",
    "",
    "## Artifacts",
    "",
    `- \`${path.relative(ROOT, REPORT_JSON).split(path.sep).join("/")}\``,
    `- \`${path.relative(ROOT, ROUTES_TSV).split(path.sep).join("/")}\``,
    `- \`${path.relative(ROOT, SCREENSHOT_DIR).split(path.sep).join("/")}/\``,
    "",
  ].join("\n");

  await fs.writeFile(REPORT_MD, md, "utf8");
}

async function main() {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  await fs.rm(SCREENSHOT_DIR, { recursive: true, force: true });
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const pageFiles = await walk(APP_ROOT);
  let routes = pageFiles.map(routeFromPageFile).sort((a, b) => a.localeCompare(b));
  if (LIMIT > 0) routes = routes.slice(0, LIMIT);

  const browser = await chromium.launch({ headless: true });
  const rows = [];
  let staffAuth = { ok: false, note: "" };
  let opacAuth = { ok: false, note: "" };
  let fixtures = {};

  try {
    const staffContext = await browser.newContext({ viewport: VIEWPORT_CONFIG.desktop, colorScheme: "dark" });
    const staffLoginPage = await staffContext.newPage();
    staffAuth = await loginStaff(staffLoginPage).catch((error) => ({
      ok: false,
      note: error instanceof Error ? error.message : String(error),
    }));
    await staffLoginPage.close().catch(() => null);
    fixtures = await resolveFixtures(staffContext);

    const opacContext = await browser.newContext({ viewport: VIEWPORT_CONFIG.desktop, colorScheme: "light" });
    const opacLoginPage = await opacContext.newPage();
    opacAuth = await loginOpac(opacLoginPage).catch((error) => ({
      ok: false,
      note: error instanceof Error ? error.message : String(error),
    }));
    await opacLoginPage.close().catch(() => null);

    for (const viewportName of VIEWPORTS) {
      const viewport = VIEWPORT_CONFIG[viewportName] || VIEWPORT_CONFIG.desktop;
      const staffViewportContext = await browser.newContext({
        storageState: await staffContext.storageState(),
        viewport,
        colorScheme: "dark",
      });
      const publicViewportContext = await browser.newContext({
        storageState: opacAuth.ok ? await opacContext.storageState() : undefined,
        viewport,
        colorScheme: "light",
      });

      for (const route of routes) {
        const context = isStaffRoute(route) ? staffViewportContext : publicViewportContext;
        const authExpected = isStaffRoute(route) || (opacAuth.ok && isOpacAccountRoute(route));
        rows.push(await auditRoute(context, route, viewportName, fixtures, { authExpected }));
      }

      await staffViewportContext.close().catch(() => null);
      await publicViewportContext.close().catch(() => null);
    }

    await staffContext.close().catch(() => null);
    await opacContext.close().catch(() => null);
  } finally {
    await browser.close().catch(() => null);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    routeCount: routes.length,
    viewports: VIEWPORTS,
    fixtures,
    staffAuth,
    opacAuth,
    rows,
  };

  await writeReport(payload);

  const issueCount = rows.filter((r) => r.issues.length).length;
  // eslint-disable-next-line no-console
  console.log(`All-route audit complete: ${REPORT_MD}`);
  if (issueCount > 0 && process.env.AUDIT_ALL_ROUTES_ENFORCE === "1") {
    throw new Error(`${issueCount} route visit(s) had issues. See ${REPORT_MD}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`All-route audit failed: ${message}`);
  process.exit(1);
});
