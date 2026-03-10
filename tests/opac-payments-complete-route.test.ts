import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
const logAuditEvent = vi.fn();
const requirePatronSession = vi.fn();
const getPaymentConfig = vi.fn();
const getActiveOpacPaymentSession = vi.fn();
const markOpacPaymentSessionConsumed = vi.fn();
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/audit", () => ({ logAuditEvent }));
vi.mock("@/lib/opac-auth", () => ({
  PatronAuthError: class PatronAuthError extends Error {},
  requirePatronSession,
}));
vi.mock("@/lib/payments/types", () => ({ getPaymentConfig }));
vi.mock("@/lib/db/opac-payment-sessions", () => ({
  getActiveOpacPaymentSession,
  markOpacPaymentSessionConsumed,
}));
vi.mock("@/lib/logger", () => ({ logger }));

describe("opac payments complete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env.STACKSOS_SQUARE_ACCESS_TOKEN = "test-square-token";
    checkRateLimit.mockResolvedValue({ allowed: true, resetIn: 0 });
    requirePatronSession.mockResolvedValue({ patronId: 123 });
    logAuditEvent.mockResolvedValue(undefined);
    getPaymentConfig.mockReturnValue({
      provider: "square",
      squareEnvironment: "sandbox",
      squareLocationId: "L-TEST-01",
      paypalEnvironment: "sandbox",
      paypalClientId: "",
    });
  });

  it("creates the Square payment directly from a StacksOS session", async () => {
    getActiveOpacPaymentSession.mockResolvedValue({
      id: "sq-session-1",
      provider: "square",
      patronId: 123,
      amountCents: 875,
      currency: "usd",
      fineIds: [10, 20],
      description: "Fine payment",
      metadata: {},
      createdAt: "2026-03-10T00:00:00Z",
      expiresAt: "2026-03-10T00:30:00Z",
      consumedAt: null,
      providerPaymentId: null,
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        payment: {
          id: "sq-pay-1",
          status: "COMPLETED",
          receipt_url: "https://squareup.com/receipt/1",
        },
      }),
    } as Response);

    const { POST } = await import("@/app/api/opac/payments/complete/route");
    const response = await POST(
      new Request("http://localhost/api/opac/payments/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "square",
          intentId: "sq-session-1",
          token: "cnon:card-token",
        }),
      }) as any
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://connect.squareupsandbox.com/v2/payments");
    expect(options?.method).toBe("POST");
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      idempotency_key: "sq-session-1",
      source_id: "cnon:card-token",
      location_id: "L-TEST-01",
      note: "patronId:123|fineIds:10,20",
      amount_money: {
        amount: 875,
        currency: "USD",
      },
    });
    expect(markOpacPaymentSessionConsumed).toHaveBeenCalledWith({
      sessionId: "sq-session-1",
      providerPaymentId: "sq-pay-1",
    });
  });

  it("rejects Square completion without a token", async () => {
    const { POST } = await import("@/app/api/opac/payments/complete/route");
    const response = await POST(
      new Request("http://localhost/api/opac/payments/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "square",
          intentId: "sq-session-1",
        }),
      }) as any
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Card token is required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects expired or consumed Square sessions", async () => {
    getActiveOpacPaymentSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/opac/payments/complete/route");
    const response = await POST(
      new Request("http://localhost/api/opac/payments/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "square",
          intentId: "sq-session-1",
          token: "cnon:card-token",
        }),
      }) as any
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Payment session is missing, expired, or already used");
    expect(fetch).not.toHaveBeenCalled();
  });
});
