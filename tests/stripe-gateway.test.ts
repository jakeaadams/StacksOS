import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.STACKSOS_STRIPE_SECRET_KEY = "sk_test_123456789";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("StripeGateway", () => {
  it("creates a payment intent with expected metadata", async () => {
    const { StripeGateway } = await import("@/lib/payments/stripe-gateway");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "pi_123",
        amount: 750,
        currency: "usd",
        status: "requires_payment_method",
        client_secret: "pi_123_secret_abc",
        created: 1_700_000_000,
      }),
    } as Response);

    const gateway = new StripeGateway("usd", "Demo Library");
    const result = await gateway.createPaymentIntent({
      amount: 750,
      patronId: 42,
      fineIds: [1, 2],
      description: "Fine payment",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect(options?.method).toBe("POST");
    const body = String(options?.body || "");
    expect(body).toContain("amount=750");
    expect(body).toContain("metadata%5BpatronId%5D=42");
    expect(body).toContain("metadata%5BfineIds%5D=1%2C2");
    expect(result.clientSecret).toBe("pi_123_secret_abc");
    expect(result.status).toBe("pending");
  });

  it("returns an error result when confirmation fails", async () => {
    const { StripeGateway } = await import("@/lib/payments/stripe-gateway");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Card declined" } }),
    } as Response);

    const gateway = new StripeGateway();
    const result = await gateway.confirmPayment("pi_123");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Card declined");
  });

  it("parses patron and fine metadata when loading payment status", async () => {
    const { StripeGateway } = await import("@/lib/payments/stripe-gateway");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "pi_123",
        amount: 1200,
        currency: "usd",
        status: "succeeded",
        created: 1_700_000_000,
        metadata: {
          patronId: "99",
          fineIds: "10,20,30",
        },
      }),
    } as Response);

    const gateway = new StripeGateway();
    const result = await gateway.getPaymentStatus("pi_123");
    expect(result.patronId).toBe(99);
    expect(result.fineIds).toEqual([10, 20, 30]);
    expect(result.status).toBe("succeeded");
  });

  it("rejects invalid Stripe IDs before making network calls", async () => {
    const { StripeGateway } = await import("@/lib/payments/stripe-gateway");
    const gateway = new StripeGateway();
    await expect(gateway.getPaymentStatus("not-a-stripe-id")).rejects.toThrow(
      "Invalid Stripe payment intent ID: not-a-stripe-id"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
