/**
 * Stripe payment gateway implementation using the Stripe REST API directly.
 * No Stripe SDK dependency -- all calls use `fetch` against https://api.stripe.com/v1.
 */

import { logger } from "@/lib/logger";
import type { PaymentGateway, PaymentIntent, PaymentResult } from "./types";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

function getSecretKey(): string {
  const key = process.env.STACKSOS_STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STACKSOS_STRIPE_SECRET_KEY is not configured");
  }
  return key;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getSecretKey()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

/** Encode a flat object as application/x-www-form-urlencoded, supporting nested metadata keys. */
function encodeForm(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join("&");
}

function mapStripeStatus(status: string): PaymentIntent["status"] {
  switch (status) {
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
      return "pending";
    case "processing":
      return "processing";
    case "succeeded":
      return "succeeded";
    case "canceled":
      return "cancelled";
    default:
      return "failed";
  }
}

interface StripeIntentResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
  client_secret?: string;
  created: number;
  metadata?: Record<string, string>;
  charges?: { data?: Array<{ receipt_url?: string }> };
}

function parseStripeIntent(
  raw: StripeIntentResponse,
  patronId: number,
  fineIds: number[]
): PaymentIntent {
  return {
    id: raw.id,
    provider: "stripe",
    amount: raw.amount,
    currency: raw.currency,
    status: mapStripeStatus(raw.status),
    patronId,
    fineIds,
    clientSecret: raw.client_secret,
    createdAt: new Date(raw.created * 1000).toISOString(),
  };
}

export class StripeGateway implements PaymentGateway {
  private currency: string;
  private libraryName: string;

  constructor(currency = "usd", libraryName = "StacksOS Library") {
    this.currency = currency;
    this.libraryName = libraryName;
  }

  async createPaymentIntent(params: {
    amount: number;
    patronId: number;
    fineIds: number[];
    description: string;
  }): Promise<PaymentIntent> {
    const body = encodeForm({
      amount: params.amount,
      currency: this.currency,
      description: params.description,
      "metadata[patronId]": params.patronId,
      "metadata[fineIds]": params.fineIds.join(","),
      "metadata[library]": this.libraryName,
      "automatic_payment_methods[enabled]": "true",
    });

    const response = await fetch(`${STRIPE_API_BASE}/payment_intents`, {
      method: "POST",
      headers: authHeaders(),
      body,
    });

    const data: StripeIntentResponse = await response.json();
    if (!response.ok) {
      const errBody = data as unknown as { error?: { message?: string } };
      logger.error({ stripeError: errBody }, "Stripe createPaymentIntent failed");
      throw new Error(errBody?.error?.message || "Failed to create payment intent");
    }

    return parseStripeIntent(data, params.patronId, params.fineIds);
  }

  async confirmPayment(intentId: string): Promise<PaymentResult> {
    const response = await fetch(`${STRIPE_API_BASE}/payment_intents/${intentId}/confirm`, {
      method: "POST",
      headers: authHeaders(),
      body: "",
    });

    const data: StripeIntentResponse = await response.json();
    if (!response.ok) {
      const errBody = data as unknown as { error?: { message?: string } };
      logger.error({ stripeError: errBody }, "Stripe confirmPayment failed");
      return {
        success: false,
        amount: 0,
        error: errBody?.error?.message || "Payment confirmation failed",
      };
    }

    const succeeded = data.status === "succeeded";
    return {
      success: succeeded,
      transactionId: succeeded ? data.id : undefined,
      amount: data.amount,
      error: succeeded ? undefined : `Payment status: ${data.status}`,
      receiptUrl: data.charges?.data?.[0]?.receipt_url ?? undefined,
    };
  }

  async refundPayment(transactionId: string, amount?: number): Promise<PaymentResult> {
    const formParams: Record<string, string | number | undefined> = {
      payment_intent: transactionId,
    };
    if (amount !== undefined) {
      formParams.amount = amount;
    }

    const response = await fetch(`${STRIPE_API_BASE}/refunds`, {
      method: "POST",
      headers: authHeaders(),
      body: encodeForm(formParams),
    });

    interface StripeRefundResponse {
      id: string;
      status: string;
      amount: number;
      error?: { message?: string };
    }

    const data: StripeRefundResponse = await response.json();
    if (!response.ok) {
      logger.error({ stripeError: data }, "Stripe refundPayment failed");
      return {
        success: false,
        amount: 0,
        error: data.error?.message || "Refund failed",
      };
    }

    return {
      success: data.status === "succeeded",
      transactionId: data.id,
      amount: data.amount,
      error: data.status === "succeeded" ? undefined : `Refund status: ${data.status}`,
    };
  }

  async getPaymentStatus(intentId: string): Promise<PaymentIntent> {
    const response = await fetch(`${STRIPE_API_BASE}/payment_intents/${intentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
      },
    });

    const data: StripeIntentResponse = await response.json();
    if (!response.ok) {
      const errBody = data as unknown as { error?: { message?: string } };
      logger.error({ stripeError: errBody }, "Stripe getPaymentStatus failed");
      throw new Error(errBody?.error?.message || "Failed to retrieve payment status");
    }

    const patronId = parseInt(data.metadata?.patronId ?? "0", 10);
    const fineIds = (data.metadata?.fineIds ?? "")
      .split(",")
      .map((id: string) => parseInt(id, 10))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    return parseStripeIntent(data, patronId, fineIds);
  }
}
