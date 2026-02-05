import { NextRequest } from "next/server";

import { getRequestMeta } from "@/lib/api";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    // Strip query/fragment to avoid leaking tokens or PII.
    return `${u.origin}${u.pathname}`;
  } catch {
    return trimmed.split("?")[0]?.split("#")[0] || null;
  }
}

function toStringOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t ? t : null;
}

/**
 * CSP violation reporting endpoint (used by Content-Security-Policy-Report-Only).
 *
 * We intentionally return 204 and avoid echoing any report content.
 */
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 120,
    windowMs: 5 * 60 * 1000,
    endpoint: "csp-report",
  });
  if (!rate.allowed) {
    return new Response(null, { status: 204 });
  }

  try {
    const payload = await req.json().catch(() => null);
    const reportBody = (payload as any)?.["csp-report"] || (payload as any)?.body || payload;

    const documentUri = sanitizeUrl((reportBody as any)?.["document-uri"] ?? (reportBody as any)?.documentURI);
    const blockedUri = toStringOrNull((reportBody as any)?.["blocked-uri"] ?? (reportBody as any)?.blockedURL);
    const violatedDirective = toStringOrNull((reportBody as any)?.["violated-directive"]);
    const effectiveDirective = toStringOrNull((reportBody as any)?.["effective-directive"]);
    const disposition = toStringOrNull((reportBody as any)?.disposition);
    const statusCodeRaw = (reportBody as any)?.["status-code"];
    const statusCode = Number.isFinite(Number(statusCodeRaw)) ? Number(statusCodeRaw) : null;

    // Truncate any samples; they can contain page content.
    const sampleRaw =
      (reportBody as any)?.["script-sample"] ??
      (reportBody as any)?.["sample"] ??
      (reportBody as any)?.sample;
    const sample = typeof sampleRaw === "string" ? sampleRaw.slice(0, 120) : null;

    logger.warn(
      {
        requestId,
        ip,
        userAgent,
        csp: {
          documentUri,
          blockedUri,
          violatedDirective,
          effectiveDirective,
          disposition,
          statusCode,
          sample,
        },
      },
      "CSP violation report"
    );
  } catch (error) {
    logger.debug({ requestId, error: String(error) }, "Failed to parse CSP report (ignored)");
  }

  return new Response(null, { status: 204 });
}

