import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
const logAuditEvent = vi.fn();
const requirePatronSession = vi.fn();
const getPaymentConfig = vi.fn();
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};
const createPaymentIntent = vi.fn();

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/audit", () => ({ logAuditEvent }));
vi.mock("@/lib/opac-auth", () => ({
  PatronAuthError: class PatronAuthError extends Error {},
  requirePatronSession,
}));
vi.mock("@/lib/payments/types", () => ({ getPaymentConfig }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/payments/stripe-gateway", () => ({
  StripeGateway: class StripeGateway {
    createPaymentIntent = createPaymentIntent;
  },
}));

describe("opac payments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ allowed: true, resetIn: 0 });
    requirePatronSession.mockResolvedValue({ patronId: 123 });
    logAuditEvent.mockResolvedValue(undefined);
  });

  it("returns publishable key for Stripe embedded checkout", async () => {
    getPaymentConfig.mockReturnValue({
      provider: "stripe",
      publicKey: "pk_test_123",
      currency: "usd",
      minimumAmount: 100,
      allowPartialPayment: true,
    });
    createPaymentIntent.mockResolvedValue({
      id: "pi_123",
      clientSecret: "pi_secret_123",
      amount: 500,
      currency: "usd",
      status: "pending",
    });

    const { POST } = await import("@/app/api/opac/payments/route");
    const response = await POST(
      new Request("http://localhost/api/opac/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fineIds: [1], amount: 500 }),
      }) as any
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.clientSecret).toBe("pi_secret_123");
    expect(data.publishableKey).toBe("pk_test_123");
  });

  it("rejects non-Stripe patron checkout with a truthful error", async () => {
    getPaymentConfig.mockReturnValue({
      provider: "paypal",
      publicKey: "",
      currency: "usd",
      minimumAmount: 100,
      allowPartialPayment: true,
    });

    const { POST } = await import("@/app/api/opac/payments/route");
    const response = await POST(
      new Request("http://localhost/api/opac/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fineIds: [1], amount: 500 }),
      }) as any
    );
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(String(data.error || "")).toContain("PayPal checkout is configured");
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });
});
