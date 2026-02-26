#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT_DIR = process.cwd();
const OUT_DIR = path.join(ROOT_DIR, "audit", "task-benchmark");
const REPORT_JSON = path.join(OUT_DIR, "report.json");
const SUMMARY_TSV = path.join(OUT_DIR, "summary.tsv");
const REPORT_MD = path.join(OUT_DIR, "REPORT.md");
const BASELINE_FILE = path.join(OUT_DIR, "baseline.json");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const ITERATIONS = Number.parseInt(process.env.TASK_BENCH_ITERATIONS || "3", 10);
const STAFF_ITERATIONS = Number.parseInt(process.env.TASK_BENCH_STAFF_ITERATIONS || "1", 10);
const QUERY = process.env.TASK_BENCH_QUERY || "harry potter";
const RECORD_ID_FALLBACK = process.env.E2E_RECORD_ID || "1";
const ENFORCE = process.env.TASK_BENCH_ENFORCE === "1";
const MAX_P95_REGRESSION_PCT = Number.parseFloat(process.env.TASK_BENCH_MAX_P95_REGRESSION_PCT || "20");

const STAFF_USER =
  process.env.TASK_BENCH_STAFF_USER ||
  process.env.STACKSOS_BENCH_STAFF_USER ||
  process.env.E2E_STAFF_USER ||
  "";
const STAFF_PASS =
  process.env.TASK_BENCH_STAFF_PASS ||
  process.env.STACKSOS_BENCH_STAFF_PASS ||
  process.env.E2E_STAFF_PASS ||
  "";
const REQUIRE_STAFF = process.env.TASK_BENCH_REQUIRE_STAFF === "1";
const STAFF_CREDS_AVAILABLE = Boolean(STAFF_USER && STAFF_PASS);

const BUDGETS_MS = {
  opac_search: Number.parseInt(process.env.TASK_BENCH_BUDGET_OPAC_SEARCH_MS || "4000", 10),
  opac_record_open: Number.parseInt(process.env.TASK_BENCH_BUDGET_OPAC_RECORD_OPEN_MS || "3500", 10),
  staff_login: Number.parseInt(process.env.TASK_BENCH_BUDGET_STAFF_LOGIN_MS || "7000", 10),
  staff_checkout_open: Number.parseInt(process.env.TASK_BENCH_BUDGET_STAFF_CHECKOUT_OPEN_MS || "3500", 10),
};

const updateBaseline = process.argv.includes("--update-baseline");

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower);
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}

function roundPct(value) {
  return Math.round(value * 100) / 100;
}

function deltaPct(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function loadBaseline() {
  try {
    const raw = await fs.readFile(BASELINE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveBaseline(payload) {
  await fs.writeFile(BASELINE_FILE, JSON.stringify(payload, null, 2), "utf8");
}

async function run() {
  await ensureDir(OUT_DIR);
  const baseline = await loadBaseline();
  const runRows = [];

  const browser = await chromium.launch({ headless: true });
  try {
    for (let i = 1; i <= ITERATIONS; i += 1) {
      // Public OPAC tasks.
      {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          await page.goto(`${BASE_URL}/opac/search`, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForSelector("input", { timeout: 10000 });

          const searchInput = page.locator("input[type='search'], input[placeholder*='search' i], input[type='text']").first();
          await searchInput.fill(QUERY);

          const searchStart = performance.now();
          const submitButton = page.locator("button[type='submit']").first();
          if (await submitButton.isVisible().catch(() => false)) {
            await submitButton.click();
          } else {
            await searchInput.press("Enter");
          }
          await page.waitForLoadState("domcontentloaded");
          await Promise.race([
            page.waitForURL(/\/opac\/search/, { timeout: 15000 }),
            page.waitForSelector("a[href*='/opac/record/']", { timeout: 15000 }),
          ]);
          const searchMs = performance.now() - searchStart;
          runRows.push({ task: "opac_search", iteration: i, ok: true, skipped: false, ms: searchMs, note: "" });

          const recordStart = performance.now();
          const firstRecordLink = page.locator("a[href*='/opac/record/']").first();
          if (await firstRecordLink.isVisible().catch(() => false)) {
            await firstRecordLink.click();
          } else {
            await page.goto(`${BASE_URL}/opac/record/${RECORD_ID_FALLBACK}`, { waitUntil: "domcontentloaded", timeout: 15000 });
          }
          await page.waitForURL(/\/opac\/record\//, { timeout: 15000 });
          await page.waitForSelector("h1, h2", { timeout: 10000 });
          const recordMs = performance.now() - recordStart;
          runRows.push({ task: "opac_record_open", iteration: i, ok: true, skipped: false, ms: recordMs, note: "" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          runRows.push({ task: "opac_search", iteration: i, ok: false, skipped: false, ms: null, note: message });
          runRows.push({
            task: "opac_record_open",
            iteration: i,
            ok: false,
            skipped: true,
            ms: null,
            note: "Skipped because OPAC search failed.",
          });
        } finally {
          await context.close();
        }
      }

      // Authenticated staff tasks.
      if (STAFF_CREDS_AVAILABLE && i <= STAFF_ITERATIONS) {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.locator("input#username").fill(STAFF_USER);
          await page.locator("input#password").fill(STAFF_PASS);
          const loginStart = performance.now();
          await page.locator("button[type='submit']").click({ force: true });

          let loginCompleted = false;
          try {
            await Promise.race([
              page.waitForURL(/\/staff/, { timeout: 20000, waitUntil: "domcontentloaded" }),
              page.waitForFunction(() => window.location.pathname.startsWith("/staff"), { timeout: 20000 }),
            ]);
            loginCompleted = true;
          } catch {
            // Fallback: if navigation timing is noisy, verify the server session directly.
            const sessionResponse = await page.request.get(`${BASE_URL}/api/evergreen/auth`);
            if (sessionResponse.ok()) {
              const sessionData = await sessionResponse.json().catch(() => null);
              loginCompleted = Boolean(sessionData?.authenticated);
            }
          }

          if (!loginCompleted) {
            const uiError =
              (await page
                .locator("text=/too many login attempts|authentication failed|invalid/i")
                .first()
                .textContent()
                .catch(() => null)) || "";
            const normalized = uiError.trim();
            throw new Error(
              normalized ? `Staff login did not complete (${normalized})` : "Staff login did not complete within timeout."
            );
          }
          if (!page.url().includes("/staff")) {
            await page.goto(`${BASE_URL}/staff`, { waitUntil: "domcontentloaded", timeout: 30000 });
          }
          const loginMs = performance.now() - loginStart;
          runRows.push({ task: "staff_login", iteration: i, ok: true, skipped: false, ms: loginMs, note: "" });

          const checkoutStart = performance.now();
          await page.goto(`${BASE_URL}/staff/circulation/checkout`, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.getByRole("heading", { name: /check out/i }).first().waitFor({ timeout: 15000 });
          const checkoutMs = performance.now() - checkoutStart;
          runRows.push({ task: "staff_checkout_open", iteration: i, ok: true, skipped: false, ms: checkoutMs, note: "" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const lockout = /too many login attempts|try again in/i.test(message);
          runRows.push({ task: "staff_login", iteration: i, ok: false, skipped: lockout, ms: null, note: message });
          runRows.push({
            task: "staff_checkout_open",
            iteration: i,
            ok: false,
            skipped: true,
            ms: null,
            note: lockout ? "Skipped because staff account is currently rate-limited." : "Skipped because staff login failed.",
          });
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const taskNames = Array.from(new Set(runRows.map((row) => row.task)));
  taskNames.sort();

  const summary = {};
  for (const task of taskNames) {
    const rows = runRows.filter((row) => row.task === task);
    const skippedCount = rows.filter((row) => row.skipped).length;
    const evaluatedRows = rows.filter((row) => !row.skipped);
    const successful = evaluatedRows.filter((row) => row.ok && Number.isFinite(row.ms));
    const durations = successful.map((row) => row.ms);
    const failures = evaluatedRows.length - successful.length;
    const successRate = evaluatedRows.length ? successful.length / evaluatedRows.length : null;
    const p50 = durations.length ? percentile(durations, 0.5) : null;
    const p95 = durations.length ? percentile(durations, 0.95) : null;
    const budgetMs = BUDGETS_MS[task] ?? null;
    const budgetPass =
      evaluatedRows.length === 0 ? null : budgetMs === null || (p95 !== null && p95 <= budgetMs);

    const baselineTask = baseline?.tasks?.[task] ?? null;
    const p50DeltaPct = baselineTask ? deltaPct(p50, baselineTask.p50Ms) : null;
    const p95DeltaPct = baselineTask ? deltaPct(p95, baselineTask.p95Ms) : null;

    summary[task] = {
      iterations: rows.length,
      successes: successful.length,
      failures,
      skipped: skippedCount,
      successRate,
      p50Ms: p50,
      p95Ms: p95,
      budgetMs,
      budgetPass,
      baseline: baselineTask,
      p50DeltaPct,
      p95DeltaPct,
      regression: p95DeltaPct !== null ? p95DeltaPct > MAX_P95_REGRESSION_PCT : false,
    };
  }

  const failedBudgets = Object.entries(summary).filter(([, row]) => row.budgetPass === false);
  const failedReliability = Object.entries(summary).filter(([, row]) => row.successRate !== null && row.successRate < 1);
  const failedRegression = Object.entries(summary).filter(([, row]) => row.regression);
  const requiredStaffTasks = ["staff_login", "staff_checkout_open"];
  const missingStaffMetrics =
    REQUIRE_STAFF && STAFF_ITERATIONS > 0
      ? requiredStaffTasks.filter((task) => {
          const row = summary[task];
          if (!row) return true;
          return row.successes < STAFF_ITERATIONS || row.failures > 0 || row.skipped > 0;
        })
      : [];

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    iterations: ITERATIONS,
    staffIterations: STAFF_ITERATIONS,
    query: QUERY,
    enforce: ENFORCE,
    requireStaff: REQUIRE_STAFF,
    staffCredsProvided: STAFF_CREDS_AVAILABLE,
    budgetsMs: BUDGETS_MS,
    threshold: {
      maxP95RegressionPct: MAX_P95_REGRESSION_PCT,
    },
    summary,
    rows: runRows.map((row) => ({
      ...row,
      ms: row.ms === null ? null : roundMs(row.ms),
    })),
  };

  if (updateBaseline) {
    const baselinePayload = {
      generatedAt: reportPayload.generatedAt,
      baseUrl: BASE_URL,
      iterations: ITERATIONS,
      tasks: Object.fromEntries(
        Object.entries(summary).map(([task, row]) => [
          task,
          {
            p50Ms: row.p50Ms === null ? null : roundMs(row.p50Ms),
            p95Ms: row.p95Ms === null ? null : roundMs(row.p95Ms),
            successRate: row.successRate === null ? null : roundPct(row.successRate * 100),
          },
        ])
      ),
    };
    await saveBaseline(baselinePayload);
  }

  const tsvRows = [
    [
      "task",
      "iterations",
      "successes",
      "failures",
      "skipped",
      "success_rate_pct",
      "p50_ms",
      "p95_ms",
      "budget_ms",
      "budget_pass",
      "baseline_p50_delta_pct",
      "baseline_p95_delta_pct",
      "regression",
    ].join("\t"),
  ];

  for (const task of taskNames) {
    const row = summary[task];
    tsvRows.push(
      [
        task,
        row.iterations,
        row.successes,
        row.failures,
        row.skipped,
        row.successRate === null ? "" : roundPct(row.successRate * 100),
        row.p50Ms === null ? "" : roundMs(row.p50Ms),
        row.p95Ms === null ? "" : roundMs(row.p95Ms),
        row.budgetMs ?? "",
        row.budgetPass === null ? "SKIP" : row.budgetPass ? "PASS" : "FAIL",
        row.p50DeltaPct === null ? "" : roundPct(row.p50DeltaPct),
        row.p95DeltaPct === null ? "" : roundPct(row.p95DeltaPct),
        row.regression ? "YES" : "NO",
      ].join("\t")
    );
  }

  const mdLines = [];
  mdLines.push("# Task Benchmark Report");
  mdLines.push("");
  mdLines.push(`Generated: ${reportPayload.generatedAt}`);
  mdLines.push("");
  mdLines.push("## Run Context");
  mdLines.push("");
  mdLines.push(`- Base URL: \`${BASE_URL}\``);
  mdLines.push(`- Iterations per task: \`${ITERATIONS}\``);
  mdLines.push(`- Staff login iterations: \`${STAFF_ITERATIONS}\``);
  mdLines.push(`- Query: \`${QUERY}\``);
  mdLines.push(`- Staff credentials provided: \`${STAFF_CREDS_AVAILABLE}\``);
  mdLines.push(`- Enforcement mode: \`${ENFORCE}\``);
  mdLines.push("");
  mdLines.push("## Summary");
  mdLines.push("");
  mdLines.push("| Task | Success Rate | Skipped | p50 (ms) | p95 (ms) | Budget (ms) | Budget | Baseline p95 Δ |");
  mdLines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const task of taskNames) {
    const row = summary[task];
    mdLines.push(
      `| ${task} | ${row.successRate === null ? "n/a" : `${roundPct(row.successRate * 100)}%`} | ${row.skipped} | ${row.p50Ms === null ? "n/a" : roundMs(row.p50Ms)} | ${row.p95Ms === null ? "n/a" : roundMs(row.p95Ms)} | ${row.budgetMs ?? "n/a"} | ${row.budgetPass === null ? "SKIP" : row.budgetPass ? "PASS" : "FAIL"} | ${row.p95DeltaPct === null ? "n/a" : `${roundPct(row.p95DeltaPct)}%`} |`
    );
  }
  mdLines.push("");
  mdLines.push("## Notes");
  mdLines.push("");
  mdLines.push("- This harness measures actual browser task completion, not API-only latency.");
  mdLines.push("- Baseline comparison is enabled when `audit/task-benchmark/baseline.json` exists.");
  mdLines.push("- Use `npm run audit:task-benchmark:update-baseline` to lock in a new baseline after approved improvements.");
  mdLines.push("- Set `TASK_BENCH_ENFORCE=1` to make budget/regression failures exit non-zero.");

  await fs.writeFile(REPORT_JSON, JSON.stringify(reportPayload, null, 2), "utf8");
  await fs.writeFile(SUMMARY_TSV, `${tsvRows.join("\n")}\n`, "utf8");
  await fs.writeFile(REPORT_MD, `${mdLines.join("\n")}\n`, "utf8");

  const hasFailures = failedBudgets.length > 0 || failedReliability.length > 0 || failedRegression.length > 0;
  if (ENFORCE && (hasFailures || missingStaffMetrics.length > 0)) {
    const messages = [];
    if (failedBudgets.length) messages.push(`budget failures: ${failedBudgets.map(([task]) => task).join(", ")}`);
    if (failedReliability.length) messages.push(`success-rate failures: ${failedReliability.map(([task]) => task).join(", ")}`);
    if (failedRegression.length) messages.push(`p95 regression failures: ${failedRegression.map(([task]) => task).join(", ")}`);
    if (missingStaffMetrics.length) messages.push(`staff benchmark gaps: ${missingStaffMetrics.join(", ")}`);
    throw new Error(messages.join(" | "));
  }

  // eslint-disable-next-line no-console
  console.log(`Task benchmark complete: ${REPORT_MD}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`Task benchmark failed: ${message}`);
  process.exit(1);
});
