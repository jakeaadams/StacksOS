import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

import { callOpenSRF } from "@/lib/api";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit";

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

  // Reject events older than 5 minutes (replay protection)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (!Number.isFinite(age) || age > 300) return false;

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

  if (!patronId || fineIds.length === 0) {
    logger.warn(
      { intentId: intent.id, patronId, fineIds },
      "Webhook: payment_intent.succeeded missing metadata"
    );
    return;
  }

  logger.info(
    { intentId: intent.id, patronId, fineIds, amount },
    "Webhook: recording payment in Evergreen"
  );

  // Record payment in Evergreen via service account
  try {
    await logAuditEvent({
      action: "opac.payment.webhook_succeeded",
      entity: "payment_intent",
      entityId: intent.id,
      status: "success",
      details: { patronId, fineIds, amount, currency: intent.currency, receiptUrl },
    }).catch(() => {});

    const serviceBarcode = process.env.STACKSOS_SERVICE_ACCOUNT_BARCODE;
    const servicePin = process.env.STACKSOS_SERVICE_ACCOUNT_PIN;

    if (!serviceBarcode || !servicePin) {
      logger.warn(
        { intentId: intent.id },
        "Webhook: STACKSOS_SERVICE_ACCOUNT_BARCODE/PIN not configured, skipping Evergreen recording"
      );
      return;
    }

    // Authenticate as service account
    const initRes = await callOpenSRF("open-ils.auth", "open-ils.auth.authenticate.init", [
      serviceBarcode,
    ]);
    const nonce = initRes?.payload?.[0];
    if (!nonce) throw new Error("Auth init returned no nonce");

    const { createHash } = await import("node:crypto");
    const hashedPin = createHash("md5")
      .update(nonce + createHash("md5").update(servicePin).digest("hex"))
      .digest("hex");

    const authRes = await callOpenSRF("open-ils.auth", "open-ils.auth.authenticate.complete", [
      { username: serviceBarcode, password: hashedPin, type: "staff" },
    ]);
    const authPayload = authRes?.payload?.[0];
    const serviceToken = authPayload?.payload?.authtoken;
    if (!serviceToken) throw new Error("Service account auth failed");

    // Record the payment via open-ils.circ.money.payment
    const payments = fineIds.map((id) => [id, amount / fineIds.length]);
    const payResult = await callOpenSRF("open-ils.circ", "open-ils.circ.money.payment", [
      serviceToken,
      {
        userid: patronId,
        payments,
        payment_type: "credit_card_payment",
        note: `Stripe payment ${intent.id || ""}`.trim(),
      },
      patronId,
    ]);

    const payPayload = payResult?.payload?.[0];
    if (payPayload && typeof payPayload === "object" && "ilsevent" in payPayload) {
      logger.error(
        { intentId: intent.id, ilsevent: payPayload },
        "Webhook: Evergreen payment recording returned an event error"
      );
    } else {
      logger.info(
        { intentId: intent.id, patronId, fineIds },
        "Webhook: payment recorded in Evergreen"
      );
    }
  } catch (error) {
    // Log but don't fail — we still return 200 to Stripe.
    // The audit trail allows manual reconciliation if needed.
    logger.error(
      { error: String(error), intentId: intent.id },
      "Webhook: failed to record payment in Evergreen"
    );
  }
}

async function handlePaymentFailed(intent: StripeEventObject): Promise<void> {
  const patronId = parseInt(intent.metadata?.patronId ?? "0", 10);

  await logAuditEvent({
    action: "opac.payment.webhook_failed",
    entity: "payment_intent",
    entityId: intent.id,
    status: "failure",
    details: {
      patronId,
      status: intent.status,
    },
  }).catch(() => {});

  logger.warn(
    { intentId: intent.id, patronId, status: intent.status },
    "Webhook: payment_intent.payment_failed"
  );
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

  return NextResponse.json({ received: true }, { status: 200 });
}
