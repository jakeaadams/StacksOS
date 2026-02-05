import { NextResponse } from "next/server";

export async function GET() {
  const label = String(process.env.STACKSOS_ENV_LABEL || "").trim();
  const tone = String(process.env.STACKSOS_ENV_TONE || "").trim().toLowerCase();
  const patronBarcodeMode = String(process.env.STACKSOS_PATRON_BARCODE_MODE || "generate")
    .trim()
    .toLowerCase();
  const patronBarcodePrefix = String(process.env.STACKSOS_PATRON_BARCODE_PREFIX || "29").trim() || "29";
  const idleTimeoutMinutesRaw = process.env.STACKSOS_IDLE_TIMEOUT_MINUTES;
  const idleTimeoutMinutes = Number.isFinite(Number(idleTimeoutMinutesRaw))
    ? Math.min(8 * 60, Math.max(1, Number(idleTimeoutMinutesRaw)))
    : null;
  const rbacMode = String(process.env.STACKSOS_RBAC_MODE || "warn").trim().toLowerCase();
  const scheduledReportsRunnerConfigured = Boolean(String(process.env.STACKSOS_SCHEDULED_REPORTS_SECRET || "").trim());
  const publicBaseUrlConfigured = Boolean(String(process.env.STACKSOS_PUBLIC_BASE_URL || "").trim());

  return NextResponse.json({
    ok: true,
    env: {
      label: label || null,
      tone: tone || null,
      patronBarcodeMode: patronBarcodeMode || "generate",
      patronBarcodePrefix,
      idleTimeoutMinutes,
      ipAllowlistEnabled: Boolean(String(process.env.STACKSOS_IP_ALLOWLIST || "").trim()),
      rbacMode,
      scheduledReports: {
        runnerConfigured: scheduledReportsRunnerConfigured,
        publicBaseUrlConfigured,
      },
    },
  });
}
