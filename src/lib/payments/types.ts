/**
 * Payment gateway abstraction layer.
 * Supports Stripe, Square, and PayPal with a unified interface.
 */

export type PaymentProvider = "stripe" | "square" | "paypal" | "none";

export interface PaymentConfig {
  provider: PaymentProvider;
  publicKey: string;
  webhookSecret?: string;
  currency: string;
  /** Minimum payment amount in cents */
  minimumAmount: number;
  /** Whether to allow partial payments */
  allowPartialPayment: boolean;
}

export interface PaymentIntent {
  id: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "cancelled";
  patronId: number;
  fineIds: number[];
  clientSecret?: string;
  createdAt: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  amount: number;
  error?: string;
  receiptUrl?: string;
}

export interface PaymentGateway {
  createPaymentIntent(params: {
    amount: number;
    patronId: number;
    fineIds: number[];
    description: string;
  }): Promise<PaymentIntent>;

  confirmPayment(intentId: string): Promise<PaymentResult>;

  refundPayment(transactionId: string, amount?: number): Promise<PaymentResult>;

  getPaymentStatus(intentId: string): Promise<PaymentIntent>;
}

export function getPaymentConfig(): PaymentConfig {
  const provider = (process.env.STACKSOS_PAYMENT_PROVIDER || "none") as PaymentProvider;
  return {
    provider,
    publicKey: process.env.STACKSOS_PAYMENT_PUBLIC_KEY || "",
    webhookSecret: process.env.STACKSOS_PAYMENT_WEBHOOK_SECRET,
    currency: process.env.STACKSOS_PAYMENT_CURRENCY || "usd",
    minimumAmount: parseInt(process.env.STACKSOS_PAYMENT_MINIMUM || "100", 10),
    allowPartialPayment: process.env.STACKSOS_PAYMENT_PARTIAL !== "false",
  };
}
