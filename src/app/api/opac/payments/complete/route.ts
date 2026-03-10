import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";
import { getPaymentConfig } from "@/lib/payments/types";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { errorResponse, successResponse, serverErrorResponse, getRequestMeta } from "@/lib/api";
import {
  getActiveOpacPaymentSession,
  markOpacPaymentSessionConsumed,
} from "@/lib/db/opac-payment-sessions";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Zod schema for POST body
// ---------------------------------------------------------------------------

const completePaymentSchema = z.object({
  provider: z.enum(["square", "paypal"]),
  intentId: z.string().min(1, "intentId is required"),
  token: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Square: create provider payment from a StacksOS checkout session
// ---------------------------------------------------------------------------

async function completeSquarePayment(
  patronId: number,
  intentId: string,
  token: string | undefined
): Promise<{ success: boolean; receiptUrl?: string; error?: string }> {
  if (!token) {
    return { success: false, error: "Card token is required for Square payments" };
  }

  const session = await getActiveOpacPaymentSession(intentId, patronId, "square");
  if (!session) {
    return { success: false, error: "Payment session is missing, expired, or already used" };
  }

  const config = getPaymentConfig();
  const baseUrl =
    config.squareEnvironment === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com";
  const accessToken = process.env.STACKSOS_SQUARE_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("STACKSOS_SQUARE_ACCESS_TOKEN is not configured");
  }

  const headers: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Square-Version": "2024-01-18",
  };

  const createBody = {
    idempotency_key: session.id,
    source_id: token,
    amount_money: {
      amount: session.amountCents,
      currency: session.currency.toUpperCase(),
    },
    location_id: config.squareLocationId,
    autocomplete: true,
    note: `patronId:${session.patronId}|fineIds:${session.fineIds.join(",")}`,
  };

  const createRes = await fetch(`${baseUrl}/v2/payments`, {
    method: "POST",
    headers,
    body: JSON.stringify(createBody),
  });

  const createData = await createRes.json();

  if (!createRes.ok) {
    const errMsg = createData?.errors?.[0]?.detail || "Square payment failed";
    return { success: false, error: errMsg };
  }

  const status = String(createData.payment?.status || "");
  if (status === "FAILED" || status === "CANCELED") {
    return {
      success: false,
      error: createData?.errors?.[0]?.detail || `Square payment status: ${status}`,
    };
  }

  await markOpacPaymentSessionConsumed({
    sessionId: session.id,
    providerPaymentId: createData.payment?.id,
  });

  return {
    success: true,
    receiptUrl: createData.payment?.receipt_url,
  };
}

// ---------------------------------------------------------------------------
// PayPal: capture the approved order
// ---------------------------------------------------------------------------

async function completePayPalPayment(
  intentId: string
): Promise<{ success: boolean; receiptUrl?: string; error?: string }> {
  const config = getPaymentConfig();
  const baseUrl =
    config.paypalEnvironment === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  const clientId = config.paypalClientId;
  const clientSecret = process.env.STACKSOS_PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured");
  }

  // Get access token
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`PayPal OAuth2 error: ${tokenRes.status} - ${errText}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Capture the order
  const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${intentId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  const captureData = await captureRes.json();

  if (!captureRes.ok) {
    const errMsg =
      captureData?.details?.[0]?.description || captureData?.message || "PayPal capture failed";
    return { success: false, error: errMsg };
  }

  const succeeded = captureData.status === "COMPLETED";

  return {
    success: succeeded,
    error: succeeded ? undefined : `Order status: ${captureData.status}`,
  };
}

// ---------------------------------------------------------------------------
// POST /api/opac/payments/complete
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  // Rate limit: 10 requests per 5 minutes per IP
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
    endpoint: "opac-payments-complete",
  });
  if (!rate.allowed) {
    return errorResponse("Too many payment requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { patronId } = await requirePatronSession();

    // Validate body
    const rawBody = await req.json();
    const parsed = completePaymentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorResponse(
        "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", "),
        400
      );
    }

    const { provider, intentId, token } = parsed.data;

    // Verify configured provider matches the request
    const config = getPaymentConfig();
    if (config.provider !== provider) {
      return errorResponse(
        `Payment provider mismatch: configured=${config.provider}, requested=${provider}`,
        400
      );
    }

    let result: { success: boolean; receiptUrl?: string; error?: string };

    switch (provider) {
      case "square":
        result = await completeSquarePayment(patronId, intentId, token);
        break;
      case "paypal":
        result = await completePayPalPayment(intentId);
        break;
      default:
        return errorResponse(`Unsupported provider: ${provider}`, 400);
    }

    // Audit log
    await logAuditEvent({
      action: "opac.payment.complete",
      entity: "payment_intent",
      entityId: intentId,
      status: result.success ? "success" : "failure",
      actor: { id: patronId },
      ip,
      userAgent,
      requestId,
      details: { provider, intentId, receiptUrl: result.receiptUrl },
      error: result.error,
    }).catch((err) => {
      logger.warn({ error: String(err) }, "Failed to write payment complete audit log");
    });

    if (!result.success) {
      return errorResponse(result.error || "Payment failed", 400);
    }

    return successResponse({
      success: true,
      receiptUrl: result.receiptUrl,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Authentication required", 401);
    }

    logger.error({ requestId, error: String(error) }, "Payment completion failed");

    await logAuditEvent({
      action: "opac.payment.complete",
      entity: "payment_intent",
      status: "failure",
      actor: undefined,
      ip,
      userAgent,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {});

    return serverErrorResponse(error, "Failed to complete payment", req);
  }
}
