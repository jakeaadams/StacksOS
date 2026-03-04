import { NextRequest } from "next/server";
import { z } from "zod";

import { getRequestMeta } from "@/lib/api";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const clientErrorSchema = z.object({
  level: z.enum(["error", "warn"]).default("error"),
  message: z.string().max(2000),
  stack: z.string().max(4000).optional(),
  url: z.string().max(500).optional(),
  component: z.string().max(100).optional(),
  digest: z.string().max(100).optional(),
});

/**
 * POST /api/client-errors
 *
 * Accepts client-side errors for server-side logging.
 * No authentication required — fire-and-forget from the browser.
 * Rate limited to 30 requests per 5 minutes per IP.
 */
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "client-errors",
  });
  if (!rate.allowed) {
    return new Response(null, { status: 204 });
  }

  try {
    const rawBody: unknown = await req.json().catch(() => null);
    if (!rawBody) {
      return new Response(null, { status: 204 });
    }

    const parsed = clientErrorSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(null, { status: 204 });
    }

    const { level, message, stack, url, component, digest } = parsed.data;

    const logPayload = {
      component: "client-error",
      clientComponent: component,
      requestId,
      ip,
      userAgent,
      url,
      digest,
      message,
      stack: stack?.slice(0, 2000),
    };

    if (level === "warn") {
      logger.warn(logPayload, `Client warning: ${message.slice(0, 120)}`);
    } else {
      logger.error(logPayload, `Client error: ${message.slice(0, 120)}`);
    }
  } catch {
    // Silently ignore malformed payloads
  }

  return new Response(null, { status: 204 });
}
