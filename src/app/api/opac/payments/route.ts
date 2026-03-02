import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";
import { getPaymentConfig } from "@/lib/payments/types";
import type { PaymentGateway } from "@/lib/payments/types";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { errorResponse, successResponse, serverErrorResponse, getRequestMeta } from "@/lib/api";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Zod schema for POST body
// ---------------------------------------------------------------------------

const createPaymentSchema = z.object({
  fineIds: z.array(z.number().int().positive()).min(1, "At least one fine ID is required"),
  amount: z.number().int().positive("Amount must be a positive integer (cents)"),
});

// ---------------------------------------------------------------------------
// Resolve the configured gateway at runtime
// ---------------------------------------------------------------------------

async function resolveGateway(provider: string, currency: string): Promise<PaymentGateway> {
  switch (provider) {
    case "stripe": {
      const { StripeGateway } = await import("@/lib/payments/stripe-gateway");
      return new StripeGateway(currency);
    }
    // Future providers can be added here:
    // case "square": { ... }
    // case "paypal": { ... }
    default:
      throw new Error(`Unsupported payment provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// POST /api/opac/payments -- create a payment intent
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  // Rate limit: 10 requests per 5 minutes per IP
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
    endpoint: "opac-payments",
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
    const parsed = createPaymentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorResponse(
        "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", "),
        400
      );
    }

    const { fineIds, amount } = parsed.data;

    // Check payment provider configuration
    const config = getPaymentConfig();

    if (config.provider === "none") {
      return NextResponse.json(
        { ok: false, error: "Online payments are not configured for this library." },
        { status: 501 }
      );
    }

    // Validate minimum amount
    if (amount < config.minimumAmount) {
      return errorResponse(
        `Payment amount must be at least ${config.minimumAmount} cents (${(config.minimumAmount / 100).toFixed(2)} ${config.currency.toUpperCase()}).`,
        400
      );
    }

    // Resolve the appropriate gateway
    const gateway = await resolveGateway(config.provider, config.currency);

    // Create a payment intent
    const intent = await gateway.createPaymentIntent({
      amount,
      patronId,
      fineIds,
      description: `Fine payment for patron ${patronId} — fines: ${fineIds.join(", ")}`,
    });

    // Audit log the payment intent creation
    await logAuditEvent({
      action: "opac.payment.create_intent",
      entity: "payment_intent",
      entityId: undefined,
      status: "success",
      actor: { id: patronId },
      ip,
      userAgent,
      requestId,
      details: {
        provider: config.provider,
        intentId: intent.id,
        amount,
        fineIds,
        currency: config.currency,
      },
    }).catch((err) => {
      logger.warn({ error: String(err) }, "Failed to write payment audit log");
    });

    return successResponse({
      intentId: intent.id,
      clientSecret: intent.clientSecret,
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Authentication required", 401);
    }

    logger.error({ requestId, error: String(error) }, "Payment intent creation failed");

    await logAuditEvent({
      action: "opac.payment.create_intent",
      entity: "payment_intent",
      status: "failure",
      actor: undefined,
      ip,
      userAgent,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {});

    return serverErrorResponse(error, "Failed to create payment intent", req);
  }
}

// ---------------------------------------------------------------------------
// GET /api/opac/payments -- return public payment configuration
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "opac-payments-config",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    await requirePatronSession();

    const config = getPaymentConfig();

    // Return public configuration only — never expose webhookSecret
    return successResponse({
      provider: config.provider,
      publicKey: config.publicKey,
      currency: config.currency,
      minimumAmount: config.minimumAmount,
      allowPartialPayment: config.allowPartialPayment,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Authentication required", 401);
    }
    logger.error({ error: String(error) }, "Payment config GET failed");
    return serverErrorResponse(error, "Failed to retrieve payment configuration", req);
  }
}
