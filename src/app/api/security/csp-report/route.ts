import { NextRequest } from "next/server";

import { getRequestMeta } from "@/lib/api";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

type CspReportBody = {
  "blocked-uri"?: string;
  "violated-directive"?: string;
  "document-uri"?: string;
  "original-policy"?: string;
  "effective-directive"?: string;
  disposition?: string;
  referrer?: string;
  "script-sample"?: string;
  sample?: string;
  "source-file"?: string;
  "status-code"?: number;
  "line-number"?: number;
  "column-number"?: number;
  blockedURL?: string;
  documentURI?: string;
  [key: string]: unknown;
};

type CspPayload = {
  "csp-report"?: CspReportBody;
  body?: CspReportBody;
  [key: string]: unknown;
};

const cspReportSchema = z
  .object({
    "csp-report": z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

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
    const rawPayload: unknown = await req.json().catch(() => null);
    const payload = rawPayload
      ? ((cspReportSchema.safeParse(rawPayload).data ?? rawPayload) as CspPayload)
      : null;
    const reportBody: CspReportBody | null =
      payload?.["csp-report"] || payload?.body || (payload as CspReportBody | null);

    const documentUri = sanitizeUrl(reportBody?.["document-uri"] ?? reportBody?.documentURI);
    const blockedUri = toStringOrNull(reportBody?.["blocked-uri"] ?? reportBody?.blockedURL);
    const violatedDirective = toStringOrNull(reportBody?.["violated-directive"]);
    const effectiveDirective = toStringOrNull(reportBody?.["effective-directive"]);
    const disposition = toStringOrNull(reportBody?.disposition);
    const statusCodeRaw = reportBody?.["status-code"];
    const statusCode = Number.isFinite(Number(statusCodeRaw)) ? Number(statusCodeRaw) : null;

    // Truncate any samples; they can contain page content.
    const sampleRaw = reportBody?.["script-sample"] ?? reportBody?.["sample"] ?? reportBody?.sample;
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
  } catch (error: unknown) {
    logger.debug({ requestId, error: String(error) }, "Failed to parse CSP report (ignored)");
  }

  return new Response(null, { status: 204 });
}
