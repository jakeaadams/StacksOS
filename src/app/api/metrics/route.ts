import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, serverErrorResponse } from "@/lib/api";
import { getMetricsRegistry } from "@/lib/metrics";
import { z } from "zod";

export const runtime = "nodejs";

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function GET(req: NextRequest) {
  try {
    const secret = String(process.env.STACKSOS_METRICS_SECRET || "").trim();

    if (!secret && process.env.NODE_ENV === "production") {
      return errorResponse("Metrics endpoint is not configured (STACKSOS_METRICS_SECRET missing)", 501);
    }

    if (secret) {
      const headerSecret = String(req.headers.get("x-stacksos-metrics-secret") || "").trim();
      const authorization = String(req.headers.get("authorization") || "").trim();
      const bearerSecret = authorization.toLowerCase().startsWith("bearer ")
        ? authorization.slice("bearer ".length).trim()
        : "";
      const provided = headerSecret || bearerSecret;
      if (!provided || !constantTimeEqual(provided, secret)) {
        return errorResponse("Forbidden", 403);
      }
    }

    const registry = getMetricsRegistry();
    const body = await registry.metrics();
    return new NextResponse(body, {
      status: 200,
      headers: { "content-type": registry.contentType },
    });
  } catch (error) {
    return serverErrorResponse(error, "Metrics GET", req);
  }
}
