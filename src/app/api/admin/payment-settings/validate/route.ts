import { NextRequest } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireSaaSAccess } from "@/lib/saas-rbac";

const validateSchema = z.object({
  secretKey: z.string().min(8, "Secret key is too short"),
});

/**
 * POST /api/admin/payment-settings/validate
 *
 * Validates a Stripe secret key by calling GET /v1/balance.
 * Does NOT store the key — only checks whether it works.
 */
export async function POST(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 5,
    windowMs: 5 * 60 * 1000,
    endpoint: "admin-payment-validate",
  });
  if (!rate.allowed) {
    return errorResponse("Too many validation attempts. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });

    const body = await parseJsonBodyWithSchema(req, validateSchema);
    if (body instanceof Response) return body;

    const { secretKey } = body;

    // Call Stripe balance endpoint to validate the key
    const response = await fetch("https://api.stripe.com/v1/balance", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message =
        (error as Record<string, any>)?.error?.message || `Stripe returned HTTP ${response.status}`;
      return successResponse({
        valid: false,
        error: message,
      });
    }

    const data = (await response.json()) as { livemode?: boolean };
    const isLive = Boolean(data.livemode);

    return successResponse({
      valid: true,
      mode: isLive ? "live" : "test",
      livemode: isLive,
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/admin/payment-settings/validate", req);
  }
}
