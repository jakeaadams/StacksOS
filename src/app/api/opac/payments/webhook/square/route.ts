import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

import { logger } from "@/lib/logger";
import { recordPaymentInEvergreen, logPaymentFailure } from "@/lib/payments/record-payment";

/**
 * POST /api/opac/payments/webhook/square
 *
 * Square webhook endpoint. Verifies the x-square-hmacsha256-signature header
 * using HMAC-SHA256 and handles payment lifecycle events.
 *
 * Square computes the signature as:
 *   Base64(HMAC-SHA256(webhookSignatureKey, notificationUrl + body))
 *
 * Environment variables:
 *   STACKSOS_SQUARE_WEBHOOK_SIGNATURE_KEY — the signing key from Square
 *   STACKSOS_SQUARE_WEBHOOK_URL           — the notification URL configured in Square
 */

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function getSquareConfig(): { signatureKey: string; notificationUrl: string } {
  return {
    signatureKey: process.env.STACKSOS_SQUARE_WEBHOOK_SIGNATURE_KEY || "",
    notificationUrl: process.env.STACKSOS_SQUARE_WEBHOOK_URL || "",
  };
}

/**
 * Verify Square webhook signature using constant-time comparison.
 *
 * Square signs the concatenation of the notification URL and the raw request
 * body with HMAC-SHA256, then base64-encodes the result.
 */
function verifySquareSignature(
  body: string,
  signatureHeader: string,
  signatureKey: string,
  notificationUrl: string
): boolean {
  if (!signatureKey || !signatureHeader || !notificationUrl) return false;

  try {
    const expected = createHmac("sha256", signatureKey)
      .update(notificationUrl + body, "utf8")
      .digest("base64");

    const expectedBuf = Buffer.from(expected, "base64");
    const receivedBuf = Buffer.from(signatureHeader, "base64");

    if (expectedBuf.length !== receivedBuf.length) return false;

    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Square event types
// ---------------------------------------------------------------------------

interface SquareAmountMoney {
  amount: number;
  currency: string;
}

interface SquarePaymentObject {
  id: string;
  amount_money: SquareAmountMoney;
  status: string;
  note?: string;
  receipt_url?: string;
}

interface SquareEventData {
  type: string;
  id: string;
  object: {
    payment: SquarePaymentObject;
  };
}

interface SquareEvent {
  merchant_id: string;
  type: string;
  event_id: string;
  created_at: string;
  data: SquareEventData;
}

// ---------------------------------------------------------------------------
// Note field parsing
// ---------------------------------------------------------------------------

/**
 * Parse patron and fine IDs from the Square payment note field.
 *
 * Expected format: `patronId:123|fineIds:1,2,3`
 */
function parsePaymentNote(note: string | undefined): {
  patronId: number;
  fineIds: number[];
} {
  if (!note) return { patronId: 0, fineIds: [] };

  const parts = note.split("|");
  let patronId = 0;
  let fineIds: number[] = [];

  for (const part of parts) {
    const [key, ...valueParts] = part.split(":");
    const value = valueParts.join(":");

    if (key === "patronId") {
      patronId = parseInt(value, 10);
      if (!Number.isFinite(patronId) || patronId <= 0) patronId = 0;
    } else if (key === "fineIds") {
      fineIds = value
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => Number.isFinite(id) && id > 0);
    }
  }

  return { patronId, fineIds };
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handlePaymentCompleted(payment: SquarePaymentObject): Promise<void> {
  const { patronId, fineIds } = parsePaymentNote(payment.note);

  await recordPaymentInEvergreen({
    provider: "square",
    paymentId: payment.id,
    patronId,
    fineIds,
    amount: payment.amount_money.amount,
    currency: payment.amount_money.currency,
    receiptUrl: payment.receipt_url,
  });
}

async function handlePaymentFailed(payment: SquarePaymentObject): Promise<void> {
  const { patronId } = parsePaymentNote(payment.note);

  await logPaymentFailure({
    provider: "square",
    paymentId: payment.id,
    patronId,
    status: payment.status,
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { signatureKey, notificationUrl } = getSquareConfig();

  if (!signatureKey || !notificationUrl) {
    logger.warn(
      {},
      "Square webhook received but STACKSOS_SQUARE_WEBHOOK_SIGNATURE_KEY or STACKSOS_SQUARE_WEBHOOK_URL is not configured"
    );
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Read raw body for signature verification
  const body = await req.text();
  const signatureHeader = req.headers.get("x-square-hmacsha256-signature") || "";

  if (!verifySquareSignature(body, signatureHeader, signatureKey, notificationUrl)) {
    logger.warn({}, "Square webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: SquareEvent;
  try {
    event = JSON.parse(body) as SquareEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info(
    { eventId: event.event_id, type: event.type, merchantId: event.merchant_id },
    "Square webhook event received"
  );

  // Reject events older than 10 minutes (replay protection)
  if (event.created_at) {
    const eventAge = Date.now() - new Date(event.created_at).getTime();
    if (eventAge > 10 * 60 * 1000 || eventAge < -60_000) {
      logger.warn(
        { eventId: event.event_id, age: eventAge },
        "Square webhook: event too old or future-dated, ignoring"
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }
  }

  // Always return 200 to prevent Square from retrying and creating duplicates.
  // Errors in processing are logged for manual reconciliation via the audit trail.
  try {
    switch (event.type) {
      case "payment.completed":
        await handlePaymentCompleted(event.data.object.payment);
        break;
      case "payment.failed":
        await handlePaymentFailed(event.data.object.payment);
        break;
      default:
        logger.info({ type: event.type }, "Square webhook: unhandled event type");
    }
  } catch (error) {
    logger.error(
      { error: String(error), eventId: event.event_id, type: event.type },
      "Square webhook: error processing event"
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
