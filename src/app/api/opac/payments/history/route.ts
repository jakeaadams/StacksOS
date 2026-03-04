import { NextRequest } from "next/server";

import {
  callOpenSRF,
  errorResponse,
  getRequestMeta,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";

/**
 * GET /api/opac/payments/history
 *
 * Returns the patron's payment history from Evergreen.
 */
export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "opac-payment-history",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { patronId, patronToken } = await requirePatronSession();

    // Fetch payment history from Evergreen
    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.user.payments.retrieve", [
      patronToken,
      patronId,
      { limit: 50, offset: 0 },
    ]);

    const rawPayments = response?.payload?.[0];
    const payments: Array<{
      id: number;
      date: string;
      amount: number;
      method: string;
      note: string;
    }> = [];

    if (Array.isArray(rawPayments)) {
      for (const p of rawPayments) {
        const id = typeof p.id === "number" ? p.id : parseInt(String(p.id ?? ""), 10);
        if (!Number.isFinite(id) || id <= 0) continue;

        payments.push({
          id,
          date: String(p.payment_ts || p.create_date || ""),
          amount: parseFloat(String(p.amount || "0")),
          method: String(p.payment_type || "unknown"),
          note: String(p.note || ""),
        });
      }
    }

    return successResponse({
      payments,
      count: payments.length,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(error, "GET /api/opac/payments/history", req);
  }
}
