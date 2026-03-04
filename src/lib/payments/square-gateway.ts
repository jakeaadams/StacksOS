/**
 * Square payment gateway implementation using the Square REST API directly.
 * No Square SDK dependency — all calls use `fetch`.
 */

import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import type { PaymentGateway, PaymentIntent, PaymentResult } from "./types";

function getBaseUrl(): string {
  const env = process.env.STACKSOS_SQUARE_ENVIRONMENT || "sandbox";
  return env === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

function getAccessToken(): string {
  const token = process.env.STACKSOS_SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("STACKSOS_SQUARE_ACCESS_TOKEN is not configured");
  return token;
}

function getLocationId(): string {
  const id = process.env.STACKSOS_SQUARE_LOCATION_ID;
  if (!id) throw new Error("STACKSOS_SQUARE_LOCATION_ID is not configured");
  return id;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json",
    "Square-Version": "2024-01-18",
  };
}

function mapSquareStatus(status: string): PaymentIntent["status"] {
  switch (status) {
    case "PENDING":
    case "APPROVED":
      return "pending";
    case "COMPLETED":
      return "succeeded";
    case "CANCELED":
      return "cancelled";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

interface SquarePayment {
  id: string;
  amount_money?: { amount: number; currency: string };
  status: string;
  created_at?: string;
  receipt_url?: string;
  note?: string;
}

interface SquareErrorResponse {
  errors?: Array<{ detail?: string; code?: string }>;
}

function extractSquareError(data: SquareErrorResponse): string {
  return data.errors?.[0]?.detail || data.errors?.[0]?.code || "Square API error";
}

function parseNote(note: string | undefined): { patronId: number; fineIds: number[] } {
  // Note format: "patronId:123|fineIds:1,2,3"
  const patronMatch = note?.match(/patronId:(\d+)/);
  const finesMatch = note?.match(/fineIds:([\d,]+)/);
  return {
    patronId: patronMatch?.[1] ? parseInt(patronMatch[1], 10) : 0,
    fineIds: finesMatch?.[1]
      ? finesMatch[1]
          .split(",")
          .map((id) => parseInt(id, 10))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [],
  };
}

export class SquareGateway implements PaymentGateway {
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
    const idempotencyKey = randomUUID();
    const note = `patronId:${params.patronId}|fineIds:${params.fineIds.join(",")}`;

    const body = {
      idempotency_key: idempotencyKey,
      amount_money: {
        amount: params.amount,
        currency: this.currency,
      },
      location_id: getLocationId(),
      autocomplete: false,
      note,
      source_id: "EXTERNAL", // Placeholder — actual card nonce comes from client
    };

    const response = await fetch(`${baseUrl}/v2/payments`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      logger.error({ squareError: data }, "Square createPaymentIntent failed");
      throw new Error(extractSquareError(data as SquareErrorResponse));
    }

    const payment: SquarePayment = data.payment;
    return {
      id: payment.id,
      provider: "square",
      amount: payment.amount_money?.amount ?? params.amount,
      currency: (payment.amount_money?.currency ?? this.currency).toLowerCase(),
      status: mapSquareStatus(payment.status),
      patronId: params.patronId,
      fineIds: params.fineIds,
      createdAt: payment.created_at || new Date().toISOString(),
    };
  }

  async confirmPayment(intentId: string): Promise<PaymentResult> {
    const baseUrl = getBaseUrl();

    const response = await fetch(`${baseUrl}/v2/payments/${intentId}/complete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    const data = await response.json();
    if (!response.ok) {
      logger.error({ squareError: data }, "Square confirmPayment failed");
      return {
        success: false,
        amount: 0,
        error: extractSquareError(data as SquareErrorResponse),
      };
    }

    const payment: SquarePayment = data.payment;
    const succeeded = payment.status === "COMPLETED";
    return {
      success: succeeded,
      transactionId: succeeded ? payment.id : undefined,
      amount: payment.amount_money?.amount ?? 0,
      error: succeeded ? undefined : `Payment status: ${payment.status}`,
      receiptUrl: payment.receipt_url,
    };
  }

  async refundPayment(transactionId: string, amount?: number): Promise<PaymentResult> {
    const baseUrl = getBaseUrl();
    const idempotencyKey = randomUUID();

    // First, retrieve the payment to get the amount if not specified
    const paymentRes = await fetch(`${baseUrl}/v2/payments/${transactionId}`, {
      method: "GET",
      headers: authHeaders(),
    });
    const paymentData = await paymentRes.json();
    if (!paymentRes.ok) {
      return {
        success: false,
        amount: 0,
        error: extractSquareError(paymentData as SquareErrorResponse),
      };
    }

    const originalPayment: SquarePayment = paymentData.payment;
    const refundAmount = amount ?? (originalPayment.amount_money?.amount || 0);

    const body = {
      idempotency_key: idempotencyKey,
      payment_id: transactionId,
      amount_money: {
        amount: refundAmount,
        currency: originalPayment.amount_money?.currency || this.currency,
      },
    };

    const response = await fetch(`${baseUrl}/v2/refunds`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    interface SquareRefundResponse {
      refund?: { id: string; status: string; amount_money?: { amount: number } };
    }

    const data: SquareRefundResponse = await response.json();
    if (!response.ok) {
      logger.error({ squareError: data }, "Square refundPayment failed");
      return {
        success: false,
        amount: 0,
        error: extractSquareError(data as unknown as SquareErrorResponse),
      };
    }

    const refund = data.refund;
    const succeeded = refund?.status === "COMPLETED" || refund?.status === "PENDING";
    return {
      success: succeeded ?? false,
      transactionId: refund?.id,
      amount: refund?.amount_money?.amount ?? refundAmount,
      error: succeeded ? undefined : `Refund status: ${refund?.status}`,
    };
  }

  async getPaymentStatus(intentId: string): Promise<PaymentIntent> {
    const baseUrl = getBaseUrl();

    const response = await fetch(`${baseUrl}/v2/payments/${intentId}`, {
      method: "GET",
      headers: authHeaders(),
    });

    const data = await response.json();
    if (!response.ok) {
      logger.error({ squareError: data }, "Square getPaymentStatus failed");
      throw new Error(extractSquareError(data as SquareErrorResponse));
    }

    const payment: SquarePayment = data.payment;
    const { patronId, fineIds } = parseNote(payment.note);

    return {
      id: payment.id,
      provider: "square",
      amount: payment.amount_money?.amount ?? 0,
      currency: (payment.amount_money?.currency ?? this.currency).toLowerCase(),
      status: mapSquareStatus(payment.status),
      patronId,
      fineIds,
      createdAt: payment.created_at || new Date().toISOString(),
    };
  }
}
