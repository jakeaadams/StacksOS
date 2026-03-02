import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { errorResponse, getRequestMeta, successResponse, serverErrorResponse } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { runDueScheduledReports } from "@/lib/reports/scheduled-runner";
import { z as _z } from "zod";

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: NextRequest) {
  const { ip, requestId } = getRequestMeta(req);

  try {
    const secret = String(process.env.STACKSOS_SCHEDULED_REPORTS_SECRET || "").trim();
    if (!secret) {
      return errorResponse(
        "Scheduled reports runner is not configured (STACKSOS_SCHEDULED_REPORTS_SECRET missing)",
        501
      );
    }

    const provided = String(req.headers.get("x-stacksos-cron-secret") || "").trim();
    if (!provided || !constantTimeEqual(provided, secret)) {
      return errorResponse("Forbidden", 403);
    }

    const rate = await checkRateLimit(ip || "unknown", {
      maxAttempts: 5,
      windowMs: 5 * 60 * 1000,
      endpoint: "reports-run-due",
    });
    if (!rate.allowed) {
      return errorResponse("Too many requests. Please try again later.", 429, {
        retryAfter: Math.ceil(rate.resetIn / 1000),
      });
    }

    const { searchParams } = new URL(req.url);
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;

    const result = await runDueScheduledReports({ limit, requestId });
    return successResponse({ ...result });
  } catch (error) {
    return serverErrorResponse(error, "Scheduled reports run-due POST", req);
  }
}
