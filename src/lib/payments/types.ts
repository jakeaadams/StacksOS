/**
 * Payment gateway abstraction layer.
 * Supports Stripe, Square, and PayPal with a unified interface.
 */

import { getTenantConfig } from "@/lib/tenant/config";

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
  squareLocationId?: string;
  squareEnvironment?: "sandbox" | "production";
  paypalClientId?: string;
  paypalEnvironment?: "sandbox" | "live";
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
  squareLocationId: string;
  squareEnvironment: "sandbox" | "production";
  paypalClientId: string;
  paypalEnvironment: "sandbox" | "live";
}

function resolveProvider(): PaymentProvider {
  const tenant = getTenantConfig();
  const provider = tenant.payment?.provider || tenant.integrations?.paymentProvider || "none";
  return provider;
}

function getStripePublicKey(): string {
  const tenant = getTenantConfig();
  return tenant.payment?.stripe?.publicKey || "";
}

function getSquareLocationId(): string {
  const tenant = getTenantConfig();
  return tenant.payment?.square?.locationId || "";
}

function getSquareEnvironment(): "sandbox" | "production" {
  const tenant = getTenantConfig();
  return tenant.payment?.square?.environment || "sandbox";
}

function getPayPalClientId(): string {
  const tenant = getTenantConfig();
  return tenant.payment?.paypal?.clientId || "";
}

function getPayPalEnvironment(): "sandbox" | "live" {
  const tenant = getTenantConfig();
  return tenant.payment?.paypal?.environment || "sandbox";
}

export function getPaymentConfig(): PaymentConfig {
  const tenant = getTenantConfig();
  const payment = tenant.payment;
  const provider = resolveProvider();
  return {
    provider,
    publicKey: getStripePublicKey(),
    webhookSecret: process.env.STACKSOS_PAYMENT_WEBHOOK_SECRET,
    currency: payment?.currency || "usd",
    minimumAmount: payment?.minimumAmount ?? 100,
    allowPartialPayment: payment?.allowPartialPayment ?? true,
    squareLocationId: getSquareLocationId(),
    squareEnvironment: getSquareEnvironment(),
    paypalClientId: getPayPalClientId(),
    paypalEnvironment: getPayPalEnvironment(),
  };
}

export function getPaymentCustomization(): PaymentCustomization {
  const payment = getTenantConfig().payment;
  return {
    statementDescriptor: (payment?.customization?.statementDescriptor || "Library Payment").slice(
      0,
      22
    ),
    supportEmail: payment?.customization?.supportEmail || "",
    receiptMessage: payment?.customization?.receiptMessage || "",
  };
}

/** Derive mode (test or live) from the provider-specific configuration. */
export function getPaymentMode(): "test" | "live" {
  const provider = resolveProvider();

  switch (provider) {
    case "stripe": {
      const pk = getStripePublicKey();
      return pk.startsWith("pk_live") ? "live" : "test";
    }
    case "square":
      return getSquareEnvironment() === "production" ? "live" : "test";
    case "paypal":
      return getPayPalEnvironment() === "live" ? "live" : "test";
    default:
      return "test";
  }
}

/** Get the provider-specific secret key for admin status display. */
function getProviderSecretKey(): string {
  const provider = resolveProvider();

  switch (provider) {
    case "stripe":
      return process.env.STACKSOS_STRIPE_SECRET_KEY || "";
    case "square":
      return process.env.STACKSOS_SQUARE_ACCESS_TOKEN || "";
    case "paypal":
      return process.env.STACKSOS_PAYPAL_CLIENT_SECRET || "";
    default:
      return "";
  }
}

/** Build the full admin-visible settings (never exposes full secrets). */
export function getPaymentSettings(): PaymentSettings {
  const config = getPaymentConfig();
  const customization = getPaymentCustomization();
  const sk = getProviderSecretKey();
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
    squareLocationId: config.squareLocationId || "",
    squareEnvironment: config.squareEnvironment || "sandbox",
    paypalClientId: config.paypalClientId || "",
    paypalEnvironment: config.paypalEnvironment || "sandbox",
  };
}
