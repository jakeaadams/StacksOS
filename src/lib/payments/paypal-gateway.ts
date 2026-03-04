/**
 * PayPal payment gateway implementation using the PayPal Orders API v2.
 * No PayPal SDK dependency — all calls use `fetch`.
 */

import { logger } from "@/lib/logger";
import type { PaymentGateway, PaymentIntent, PaymentResult } from "./types";

function getBaseUrl(): string {
  const env = process.env.STACKSOS_PAYPAL_ENVIRONMENT || "sandbox";
  return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function getClientId(): string {
  const id = process.env.STACKSOS_PAYPAL_CLIENT_ID;
  if (!id) throw new Error("STACKSOS_PAYPAL_CLIENT_ID is not configured");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.STACKSOS_PAYPAL_CLIENT_SECRET;
  if (!secret) throw new Error("STACKSOS_PAYPAL_CLIENT_SECRET is not configured");
  return secret;
}

// ---------------------------------------------------------------------------
// OAuth2 token caching — singleton promise to avoid races
// ---------------------------------------------------------------------------

let _cachedToken: { token: string; expiresAt: number } | null = null;
let _tokenPromise: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.token;
  }

  // Avoid concurrent token requests
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

      const data = (await response.json()) as { access_token: string; expires_in: number };
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

function mapPayPalStatus(status: string): PaymentIntent["status"] {
  switch (status) {
    case "CREATED":
    case "SAVED":
      return "pending";
    case "APPROVED":
    case "PAYER_ACTION_REQUIRED":
      return "processing";
    case "COMPLETED":
      return "succeeded";
    case "VOIDED":
      return "cancelled";
    default:
      return "failed";
  }
}

interface PayPalOrder {
  id: string;
  status: string;
  create_time?: string;
  purchase_units?: Array<{
    amount?: { value?: string; currency_code?: string };
    custom_id?: string;
    reference_id?: string;
    payments?: {
      captures?: Array<{ id: string; status: string; amount?: { value?: string } }>;
    };
  }>;
}

interface PayPalErrorResponse {
  message?: string;
  details?: Array<{ description?: string }>;
}

function extractPayPalError(data: PayPalErrorResponse): string {
  return data.details?.[0]?.description || data.message || "PayPal API error";
}

export class PayPalGateway implements PaymentGateway {
  private currency: string;

  constructor(currency = "USD") {
    this.currency = currency.toUpperCase();
  }

  async createPaymentIntent(params: {
    amount: number;
    patronId: number;
    fineIds: number[];
    description: string;
  }): Promise<PaymentIntent> {
    const baseUrl = getBaseUrl();
    const token = await getAccessToken();

    // PayPal works with decimal amounts (e.g. "5.00"), not cents
    const decimalAmount = (params.amount / 100).toFixed(2);

    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: this.currency,
            value: decimalAmount,
          },
          description: params.description,
          custom_id: String(params.patronId),
          reference_id: params.fineIds.join(","),
        },
      ],
    };

    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "PayPal-Request-Id": `stacksos-${Date.now()}-${params.patronId}`,
      },
      body: JSON.stringify(body),
    });

    const data: PayPalOrder = await response.json();
    if (!response.ok) {
      logger.error({ paypalError: data }, "PayPal createPaymentIntent failed");
      throw new Error(extractPayPalError(data as unknown as PayPalErrorResponse));
    }

    const unit = data.purchase_units?.[0];
    return {
      id: data.id,
      provider: "paypal",
      amount: params.amount,
      currency: (unit?.amount?.currency_code ?? this.currency).toLowerCase(),
      status: mapPayPalStatus(data.status),
      patronId: params.patronId,
      fineIds: params.fineIds,
      createdAt: data.create_time || new Date().toISOString(),
    };
  }

  async confirmPayment(intentId: string): Promise<PaymentResult> {
    const baseUrl = getBaseUrl();
    const token = await getAccessToken();

    const response = await fetch(`${baseUrl}/v2/checkout/orders/${intentId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data: PayPalOrder = await response.json();
    if (!response.ok) {
      logger.error({ paypalError: data }, "PayPal confirmPayment failed");
      return {
        success: false,
        amount: 0,
        error: extractPayPalError(data as unknown as PayPalErrorResponse),
      };
    }

    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    const succeeded = data.status === "COMPLETED";
    const captureAmount = capture?.amount?.value
      ? Math.round(parseFloat(capture.amount.value) * 100)
      : 0;

    return {
      success: succeeded,
      transactionId: capture?.id || data.id,
      amount: captureAmount,
      error: succeeded ? undefined : `Order status: ${data.status}`,
    };
  }

  async refundPayment(transactionId: string, amount?: number): Promise<PaymentResult> {
    const baseUrl = getBaseUrl();
    const token = await getAccessToken();

    // transactionId here is the capture ID
    const body =
      amount !== undefined
        ? { amount: { value: (amount / 100).toFixed(2), currency_code: this.currency } }
        : {};

    const response = await fetch(`${baseUrl}/v2/payments/captures/${transactionId}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "PayPal-Request-Id": `stacksos-refund-${Date.now()}`,
      },
      body: JSON.stringify(body),
    });

    interface PayPalRefundResponse {
      id?: string;
      status?: string;
      amount?: { value?: string };
    }

    const data: PayPalRefundResponse = await response.json();
    if (!response.ok) {
      logger.error({ paypalError: data }, "PayPal refundPayment failed");
      return {
        success: false,
        amount: 0,
        error: extractPayPalError(data as unknown as PayPalErrorResponse),
      };
    }

    const succeeded = data.status === "COMPLETED";
    const refundedAmount = data.amount?.value
      ? Math.round(parseFloat(data.amount.value) * 100)
      : (amount ?? 0);

    return {
      success: succeeded,
      transactionId: data.id,
      amount: refundedAmount,
      error: succeeded ? undefined : `Refund status: ${data.status}`,
    };
  }

  async getPaymentStatus(intentId: string): Promise<PaymentIntent> {
    const baseUrl = getBaseUrl();
    const token = await getAccessToken();

    const response = await fetch(`${baseUrl}/v2/checkout/orders/${intentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data: PayPalOrder = await response.json();
    if (!response.ok) {
      logger.error({ paypalError: data }, "PayPal getPaymentStatus failed");
      throw new Error(extractPayPalError(data as unknown as PayPalErrorResponse));
    }

    const unit = data.purchase_units?.[0];
    const patronId = parseInt(unit?.custom_id || "0", 10);
    const fineIds = (unit?.reference_id || "")
      .split(",")
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    const amountValue = unit?.amount?.value ? Math.round(parseFloat(unit.amount.value) * 100) : 0;

    return {
      id: data.id,
      provider: "paypal",
      amount: amountValue,
      currency: (unit?.amount?.currency_code ?? this.currency).toLowerCase(),
      status: mapPayPalStatus(data.status),
      patronId,
      fineIds,
      createdAt: data.create_time || new Date().toISOString(),
    };
  }
}
