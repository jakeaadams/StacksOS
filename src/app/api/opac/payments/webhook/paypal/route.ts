import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getPaymentConfig } from "@/lib/payments/types";
import { recordPaymentInEvergreen, logPaymentFailure } from "@/lib/payments/record-payment";

/**
 * POST /api/opac/payments/webhook/paypal
 *
 * PayPal webhook endpoint. Verifies the webhook signature via PayPal's
 * verify-webhook-signature API and handles payment lifecycle events.
 *
 * No PayPal SDK dependency -- all calls use `fetch`.
 */

// ---------------------------------------------------------------------------
// PayPal OAuth & helpers (mirrors paypal-gateway.ts patterns)
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  const env = getPaymentConfig().paypalEnvironment || "sandbox";
  return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function getClientId(): string {
  const id = getPaymentConfig().paypalClientId;
  if (!id) throw new Error("STACKSOS_PAYPAL_CLIENT_ID is not configured");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.STACKSOS_PAYPAL_CLIENT_SECRET;
  if (!secret) throw new Error("STACKSOS_PAYPAL_CLIENT_SECRET is not configured");
  return secret;
}

function getWebhookId(): string {
  return process.env.STACKSOS_PAYPAL_WEBHOOK_ID || "";
}

// Singleton-cached OAuth2 token (same pattern as paypal-gateway.ts)
let _cachedToken: { token: string; expiresAt: number } | null = null;
let _tokenPromise: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.token;
  }

  if (_tokenPromise) return _tokenPromise;

  _tokenPromise = (async () => {
    try {
      const baseUrl = getBaseUrl();
      const credentials = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64");

      const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: "grant_type=client_credentials",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PayPal OAuth2 error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };
      _cachedToken = {
        token: data.access_token,
        expiresAt: now + data.expires_in * 1000,
      };

      return data.access_token;
    } finally {
      _tokenPromise = null;
    }
  })();

  return _tokenPromise;
}

// ---------------------------------------------------------------------------
// Signature verification via PayPal API
// ---------------------------------------------------------------------------

async function verifyWebhookSignature(headers: Headers, body: string): Promise<boolean> {
  const webhookId = getWebhookId();
  if (!webhookId) {
    logger.warn({}, "PayPal webhook: STACKSOS_PAYPAL_WEBHOOK_ID is not configured");
    return false;
  }

  const authAlgo = headers.get("paypal-auth-algo") || "";
  const certUrl = headers.get("paypal-cert-url") || "";
  const transmissionId = headers.get("paypal-transmission-id") || "";
  const transmissionSig = headers.get("paypal-transmission-sig") || "";
  const transmissionTime = headers.get("paypal-transmission-time") || "";

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    logger.warn({}, "PayPal webhook: missing one or more required PayPal signature headers");
    return false;
  }

  try {
    const baseUrl = getBaseUrl();
    const token = await getAccessToken();

    let webhookEvent: unknown;
    try {
      webhookEvent = JSON.parse(body);
    } catch {
      logger.warn({}, "PayPal webhook: body is not valid JSON for verification");
      return false;
    }

    const verifyBody = {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    };

    const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(verifyBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, error: errorText },
        "PayPal webhook: verify-webhook-signature API error"
      );
      return false;
    }

    const result = (await response.json()) as {
      verification_status: string;
    };

    if (result.verification_status !== "SUCCESS") {
      logger.warn(
        { verificationStatus: result.verification_status },
        "PayPal webhook: signature verification failed"
      );
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ error: String(error) }, "PayPal webhook: signature verification threw an error");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Order lookup for capture events that lack purchase_unit metadata
// ---------------------------------------------------------------------------

async function fetchOrder(orderId: string): Promise<PayPalOrder | null> {
  try {
    const baseUrl = getBaseUrl();
    const token = await getAccessToken();

    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      logger.warn(
        { orderId, status: response.status },
        "PayPal webhook: failed to fetch order for metadata lookup"
      );
      return null;
    }

    return (await response.json()) as PayPalOrder;
  } catch (error) {
    logger.warn({ orderId, error: String(error) }, "PayPal webhook: error fetching order");
    return null;
  }
}

// ---------------------------------------------------------------------------
// PayPal event types
// ---------------------------------------------------------------------------

interface PayPalAmount {
  value?: string;
  currency_code?: string;
}

interface PayPalCapture {
  id: string;
  status: string;
  amount?: PayPalAmount;
}

interface PayPalPurchaseUnit {
  amount?: PayPalAmount;
  custom_id?: string;
  reference_id?: string;
  payments?: {
    captures?: PayPalCapture[];
  };
}

interface PayPalOrder {
  id: string;
  status: string;
  purchase_units?: PayPalPurchaseUnit[];
}

interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource_type?: string;
  resource: {
    id?: string;
    status?: string;
    amount?: PayPalAmount;
    custom_id?: string;
    invoice_id?: string;
    purchase_units?: PayPalPurchaseUnit[];
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
      };
    };
  };
  summary?: string;
  create_time?: string;
}

// ---------------------------------------------------------------------------
// Helpers to extract patron/fine metadata
// ---------------------------------------------------------------------------

function parseFineIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function parsePatronId(raw: string | undefined): number {
  return parseInt(raw || "0", 10) || 0;
}

function convertAmount(value: string | undefined): number {
  if (!value) return 0;
  return Math.round(parseFloat(value) * 100);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCaptureCompleted(event: PayPalWebhookEvent): Promise<void> {
  const resource = event.resource;

  // For capture events, custom_id is directly on the resource
  let patronId = parsePatronId(resource.custom_id);
  let fineIds: number[] = [];
  const amount = convertAmount(resource.amount?.value);
  const currency = resource.amount?.currency_code || "USD";
  const captureId = resource.id || event.id;

  // Try to get fineIds from invoice_id (comma-separated IDs)
  fineIds = parseFineIds(resource.invoice_id);

  // If metadata is missing on the capture, look up the original order
  if ((!patronId || fineIds.length === 0) && resource.supplementary_data?.related_ids?.order_id) {
    const orderId = resource.supplementary_data.related_ids.order_id;
    logger.info({ captureId, orderId }, "PayPal webhook: capture missing metadata, fetching order");

    const order = await fetchOrder(orderId);
    if (order?.purchase_units?.[0]) {
      const unit = order.purchase_units[0];
      if (!patronId) {
        patronId = parsePatronId(unit.custom_id);
      }
      if (fineIds.length === 0) {
        fineIds = parseFineIds(unit.reference_id);
      }
    }
  }

  await recordPaymentInEvergreen({
    provider: "paypal",
    paymentId: captureId,
    patronId,
    fineIds,
    amount,
    currency: currency.toLowerCase(),
  });
}

async function handleOrderCompleted(event: PayPalWebhookEvent): Promise<void> {
  const resource = event.resource;
  const unit = resource.purchase_units?.[0];

  const patronId = parsePatronId(unit?.custom_id);
  const fineIds = parseFineIds(unit?.reference_id);
  const capture = unit?.payments?.captures?.[0];
  const amount = convertAmount(capture?.amount?.value || unit?.amount?.value);
  const currency = unit?.amount?.currency_code || "USD";
  const paymentId = capture?.id || resource.id || event.id;

  await recordPaymentInEvergreen({
    provider: "paypal",
    paymentId,
    patronId,
    fineIds,
    amount,
    currency: currency.toLowerCase(),
  });
}

async function handleCaptureDenied(event: PayPalWebhookEvent): Promise<void> {
  const resource = event.resource;
  const patronId = parsePatronId(resource.custom_id);

  await logPaymentFailure({
    provider: "paypal",
    paymentId: resource.id,
    patronId,
    status: resource.status,
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const webhookId = getWebhookId();
  if (!webhookId) {
    logger.warn({}, "PayPal webhook received but STACKSOS_PAYPAL_WEBHOOK_ID is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Read raw body for signature verification
  const body = await req.text();

  const verified = await verifyWebhookSignature(req.headers, body);
  if (!verified) {
    logger.warn({}, "PayPal webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(body) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info({ eventId: event.id, type: event.event_type }, "PayPal webhook event received");

  try {
    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED":
        await handleCaptureCompleted(event);
        break;

      case "CHECKOUT.ORDER.COMPLETED":
        await handleOrderCompleted(event);
        break;

      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED":
        await handleCaptureDenied(event);
        break;

      default:
        logger.info({ type: event.event_type }, "PayPal webhook: unhandled event type");
    }
  } catch (error) {
    // Log but always return 200 to PayPal to prevent retries
    logger.error(
      { error: String(error), eventId: event.id, type: event.event_type },
      "PayPal webhook: error processing event"
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
