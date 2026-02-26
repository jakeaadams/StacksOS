import { getRequestMeta, successResponse, withErrorHandling } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { z as _z } from "zod";
import { getTenantConfig } from "@/lib/tenant/config";

export const GET = withErrorHandling(async (req: Request) => {
  await requirePermissions(["STAFF_LOGIN"]);

  const tenant = getTenantConfig();
  const label = String(process.env.STACKSOS_ENV_LABEL || "").trim();
  const tone = String(process.env.STACKSOS_ENV_TONE || "")
    .trim()
    .toLowerCase();
  const patronBarcodeMode = String(process.env.STACKSOS_PATRON_BARCODE_MODE || "generate")
    .trim()
    .toLowerCase();
  const patronBarcodePrefix =
    String(process.env.STACKSOS_PATRON_BARCODE_PREFIX || "29").trim() || "29";
  const idleTimeoutMinutesRaw = process.env.STACKSOS_IDLE_TIMEOUT_MINUTES;
  const idleTimeoutMinutes = Number.isFinite(Number(idleTimeoutMinutesRaw))
    ? Math.min(8 * 60, Math.max(1, Number(idleTimeoutMinutesRaw)))
    : null;
  const rbacMode = String(process.env.STACKSOS_RBAC_MODE || "warn")
    .trim()
    .toLowerCase();
  const scheduledReportsRunnerConfigured = Boolean(
    String(process.env.STACKSOS_SCHEDULED_REPORTS_SECRET || "").trim()
  );
  const publicBaseUrlConfigured = Boolean(
    String(process.env.STACKSOS_PUBLIC_BASE_URL || "").trim()
  );

  const baseUrl = String(process.env.STACKSOS_BASE_URL || "").trim() || null;
  const cookieSecureRaw = String(process.env.STACKSOS_COOKIE_SECURE || "")
    .trim()
    .toLowerCase();
  const cookieSecureExplicit =
    cookieSecureRaw === "true" ? true : cookieSecureRaw === "false" ? false : null;

  const meta = getRequestMeta(req);

  return successResponse({
    env: {
      label: label || null,
      tone: tone || null,
      patronBarcodeMode: patronBarcodeMode || "generate",
      patronBarcodePrefix,
      idleTimeoutMinutes,
      ipAllowlistEnabled: Boolean(String(process.env.STACKSOS_IP_ALLOWLIST || "").trim()),
      rbacMode,
      baseUrl,
      cookieSecureExplicit,
      requestMeta: {
        ip: meta.ip,
        requestId: meta.requestId,
      },
      scheduledReports: {
        runnerConfigured: scheduledReportsRunnerConfigured,
        publicBaseUrlConfigured,
      },
      tenant: {
        tenantId: tenant.tenantId,
        displayName: tenant.displayName,
        profile: tenant.profile?.type || "public",
        region: tenant.region || null,
      },
    },
  });
}, "Env GET");
