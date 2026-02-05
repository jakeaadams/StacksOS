import crypto from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/provider";
import { scheduledReportRunDurationSeconds, scheduledReportRunsTotal } from "@/lib/metrics";
import {
  claimDueScheduledReportSchedules,
  computeNextRunAt,
  createScheduledReportRun,
  finishScheduledReportRun,
  readRunDownload,
  updateScheduleAfterRun,
  type ScheduledReportScheduleRow,
} from "@/lib/db/scheduled-reports";
import { generateScheduledReport } from "@/lib/reports/scheduled-reports";

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function generateDownloadToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: sha256Hex(token) };
}

function getPublicBaseUrl(): string {
  const raw = String(process.env.STACKSOS_PUBLIC_BASE_URL || "").trim();
  if (raw) return raw.replace(/\/+$/, "");
  const fallback = String(process.env.BASE_URL || "http://127.0.0.1:3000").trim();
  return fallback.replace(/\/+$/, "");
}

function buildDownloadUrl(runId: number, token: string): string {
  const base = getPublicBaseUrl();
  return `${base}/api/reports/scheduled/runs/${runId}/download?token=${encodeURIComponent(token)}`;
}

function formatRecipientList(recipients: string[]): string {
  return recipients.map((r) => r.trim()).filter(Boolean).join(", ");
}

export async function runScheduledReportOnce(args: {
  schedule: ScheduledReportScheduleRow;
  requestedBy?: { id?: number; username?: string } | null;
  requestId?: string | null;
}): Promise<{ runId: number; status: "success" | "failure" }> {
  const schedule = args.schedule;
  const startedAt = new Date();
  const startedNs = process.hrtime.bigint();
  let metricsOutcome: "success" | "failure" = "failure";

  const run = await createScheduledReportRun({
    scheduleId: schedule.id,
    status: "running",
    startedAt,
  });

  const log = logger.child({
    component: "scheduled_reports",
    requestId: args.requestId ?? undefined,
    actor: args.requestedBy ?? undefined,
  });

  log.info(
    { scheduleId: schedule.id, reportKey: schedule.report_key, orgId: schedule.org_id ?? undefined },
    "Scheduled report run started"
  );

  try {
    const orgId = typeof schedule.org_id === "number" ? schedule.org_id : 1;
    const limit = schedule.report_key === "overdue_items" ? 200 : undefined;

    const report = await generateScheduledReport({
      reportKey: schedule.report_key,
      orgId,
      limit,
    });

    const compressed = gzipSync(report.bytes);
    const { token, hash } = generateDownloadToken();
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
    const recipients = schedule.recipients || [];

    const downloadUrl = buildDownloadUrl(run.id, token);

    const subject = `StacksOS Scheduled Report: ${schedule.name} (${report.summary})`;
    const html = `
      <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height:1.4">
        <h2 style="margin:0 0 8px 0;">${escapeHtml(schedule.name)}</h2>
        <div style="color:#555; margin:0 0 12px 0;">${escapeHtml(report.summary)}</div>
        <div style="margin:0 0 12px 0;">
          <a href="${escapeHtml(downloadUrl)}">Download report</a>
          <span style="color:#777;">(link expires ${expires.toISOString().split("T")[0]})</span>
        </div>
        <div style="color:#777; font-size:12px;">
          Delivered to: ${escapeHtml(formatRecipientList(recipients) || "—")}
        </div>
      </div>
    `.trim();

    const delivered: string[] = [];
    for (const email of recipients) {
      const trimmed = String(email || "").trim();
      if (!trimmed) continue;
      await sendEmail({
        to: { email: trimmed },
        subject,
        html,
        text: `Download: ${downloadUrl}\nExpires: ${expires.toISOString().split("T")[0]}\n`,
      });
      delivered.push(trimmed);
    }

    await finishScheduledReportRun({
      id: run.id,
      status: "success",
      finishedAt: new Date(),
      outputFilename: report.filename,
      outputContentType: report.contentType,
      outputBytes: compressed,
      outputEncoding: "gzip",
      outputSizeBytes: compressed.length,
      downloadTokenHash: hash,
      downloadExpiresAt: expires,
      deliveredTo: delivered,
    });

    const nextRunAt = schedule.enabled
      ? computeNextRunAt(schedule.cadence, schedule.time_of_day, { dayOfWeek: schedule.day_of_week, dayOfMonth: schedule.day_of_month }, new Date())
      : null;

    await updateScheduleAfterRun({ scheduleId: schedule.id, lastRunAt: new Date(), nextRunAt });

    log.info({ scheduleId: schedule.id, runId: run.id, delivered: delivered.length }, "Scheduled report run finished");
    metricsOutcome = "success";
    return { runId: run.id, status: "success" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishScheduledReportRun({
      id: run.id,
      status: "failure",
      finishedAt: new Date(),
      error: message,
      outputBytes: null,
      outputEncoding: null,
      outputSizeBytes: null,
      downloadTokenHash: null,
      downloadExpiresAt: null,
      deliveredTo: null,
    });
    log.error({ scheduleId: schedule.id, runId: run.id, error: message }, "Scheduled report run failed");
    metricsOutcome = "failure";
    return { runId: run.id, status: "failure" };
  } finally {
    const durationSeconds = Number(process.hrtime.bigint() - startedNs) / 1e9;
    try {
      scheduledReportRunsTotal.inc({ report_key: schedule.report_key, outcome: metricsOutcome });
      scheduledReportRunDurationSeconds.observe(
        { report_key: schedule.report_key, outcome: metricsOutcome },
        durationSeconds
      );
    } catch {
      // Metrics must never break production traffic.
    }
  }
}

export async function runDueScheduledReports(args?: { limit?: number; requestId?: string | null }) {
  const limit = Math.min(50, Math.max(1, args?.limit ?? 10));
  const due = await claimDueScheduledReportSchedules(limit);

  let processed = 0;
  let success = 0;
  let failure = 0;

  for (const s of due) {
    processed += 1;
    const result = await runScheduledReportOnce({ schedule: s, requestedBy: null, requestId: args?.requestId ?? null });
    if (result.status === "success") success += 1;
    else failure += 1;
  }

  return { processed, success, failure };
}

export function isValidDownloadToken(args: { token: string; tokenHash: string }): boolean {
  const computed = sha256Hex(args.token);
  return timingSafeEqual(computed, args.tokenHash);
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function readRunOutputBytes(runId: number): Promise<{
  filename: string | null;
  contentType: string | null;
  bytes: Buffer | null;
}> {
  const r = await readRunDownload({ runId });
  if (!r.outputBytes) return { filename: null, contentType: null, bytes: null };

  const encoding = r.outputEncoding || "";
  const raw = Buffer.isBuffer(r.outputBytes) ? r.outputBytes : Buffer.from(r.outputBytes);
  const bytes = encoding === "gzip" ? gunzipSync(raw) : raw;
  return { filename: r.outputFilename, contentType: r.outputContentType, bytes };
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
