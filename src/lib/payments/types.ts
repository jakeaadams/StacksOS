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

/** Customization options for receipts and branding. */
export interface PaymentCustomization {
  /** Appears on patron card statements (max 22 chars). */
  statementDescriptor: string;
  /** Support email shown on receipts. */
  supportEmail: string;
  /** Custom message appended to payment receipts. */
  receiptMessage: string;
}

/** Full admin-facing payment settings. */
export interface PaymentSettings {
  provider: PaymentProvider;
  publicKey: string;
  secretKeyConfigured: boolean;
  secretKeyLast4: string;
  webhookSecretConfigured: boolean;
  mode: "test" | "live";
  currency: string;
  minimumAmount: number;
  allowPartialPayment: boolean;
  customization: PaymentCustomization;
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

export function getPaymentCustomization(): PaymentCustomization {
  return {
    statementDescriptor: (
      process.env.STACKSOS_PAYMENT_STATEMENT_DESCRIPTOR || "Library Payment"
    ).slice(0, 22),
    supportEmail: process.env.STACKSOS_PAYMENT_SUPPORT_EMAIL || "",
    receiptMessage: process.env.STACKSOS_PAYMENT_RECEIPT_MESSAGE || "",
  };
}

/** Derive mode (test or live) from the publishable key prefix. */
export function getPaymentMode(): "test" | "live" {
  const pk = process.env.STACKSOS_PAYMENT_PUBLIC_KEY || "";
  return pk.startsWith("pk_live") ? "live" : "test";
}

/** Build the full admin-visible settings (never exposes full secrets). */
export function getPaymentSettings(): PaymentSettings {
  const config = getPaymentConfig();
  const customization = getPaymentCustomization();
  const sk = process.env.STACKSOS_STRIPE_SECRET_KEY || "";
  const ws = config.webhookSecret || "";
  return {
    provider: config.provider,
    publicKey: config.publicKey,
    secretKeyConfigured: sk.length > 8,
    secretKeyLast4: sk.length > 4 ? sk.slice(-4) : "",
    webhookSecretConfigured: ws.length > 8,
    mode: getPaymentMode(),
    currency: config.currency,
    minimumAmount: config.minimumAmount,
    allowPartialPayment: config.allowPartialPayment,
    customization,
  };
}
