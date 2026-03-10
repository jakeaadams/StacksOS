import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

import { logger } from "@/lib/logger";
import { recordPaymentInEvergreen, logPaymentFailure } from "@/lib/payments/record-payment";

/**
 * POST /api/opac/payments/webhook
 *
 * Stripe webhook endpoint. Verifies the Stripe-Signature header using
 * HMAC-SHA256 (no Stripe SDK) and handles payment lifecycle events.
 */

function getWebhookSecret(): string {
  return process.env.STACKSOS_PAYMENT_WEBHOOK_SECRET || "";
}

function verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {
  if (!secret || !sigHeader) return false;

  // Parse Stripe signature header: t=timestamp,v1=sig1,v1=sig2,...
  const parts: Record<string, string[]> = {};
  for (const item of sigHeader.split(",")) {
    const [key, ...rest] = item.split("=");
    if (!key || rest.length === 0) continue;
    const value = rest.join("=");
    if (!parts[key]) parts[key] = [];
    parts[key].push(value);
  }

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return false;

  // Reject events older than 5 minutes or more than 30s in the future (replay protection)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (!Number.isFinite(age) || age > 300 || age < -30) return false;

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  // Constant-time compare against each provided v1 signature
  const expectedBuf = Buffer.from(expected, "hex");
  for (const sig of signatures) {
    try {
      const sigBuf = Buffer.from(sig, "hex");
      if (sigBuf.length === expectedBuf.length && timingSafeEqual(expectedBuf, sigBuf)) {
        return true;
      }
    } catch {
      // Invalid hex — skip
    }
  }

  return false;
}

interface StripeEventObject {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  metadata?: Record<string, string>;
  charges?: { data?: Array<{ receipt_url?: string }> };
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeEventObject };
}

async function handlePaymentSucceeded(intent: StripeEventObject): Promise<void> {
  const patronId = parseInt(intent.metadata?.patronId ?? "0", 10);
  const fineIds = (intent.metadata?.fineIds ?? "")
    .split(",")
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isFinite(id) && id > 0);
  const receiptUrl = intent.charges?.data?.[0]?.receipt_url ?? undefined;
  const amount = intent.amount ?? 0;

  await recordPaymentInEvergreen({
    provider: "stripe",
    paymentId: intent.id || "",
    patronId,
    fineIds,
    amount,
    currency: intent.currency,
    receiptUrl,
  });
}

async function handlePaymentFailed(intent: StripeEventObject): Promise<void> {
  const patronId = parseInt(intent.metadata?.patronId ?? "0", 10);

  await logPaymentFailure({
    provider: "stripe",
    paymentId: intent.id,
    patronId,
    status: intent.status,
  });
}

export async function POST(req: NextRequest) {
  const secret = getWebhookSecret();
  if (!secret) {
    logger.warn(
      {},
      "Stripe webhook received but STACKSOS_PAYMENT_WEBHOOK_SECRET is not configured"
    );
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Must read raw body for signature verification
  const body = await req.text();
  const sigHeader = req.headers.get("stripe-signature") || "";

  if (!verifyStripeSignature(body, sigHeader, secret)) {
    logger.warn({}, "Stripe webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(body) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info({ eventId: event.id, type: event.type }, "Stripe webhook event received");

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      default:
        logger.info({ type: event.type }, "Stripe webhook: unhandled event type");
    }
  } catch (error) {
    // Log but still return 200 — don't cause Stripe to retry
    logger.error(
      { error: String(error), eventId: event.id, type: event.type },
      "Stripe webhook: error processing event"
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
