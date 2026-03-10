/**
 * Square Webhook Endpoint Unit Tests
 *
 * Tests signature verification, event routing, and Evergreen recording
 * for the Square webhook handler at POST /api/opac/payments/webhook/square.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/lib/payments/record-payment", () => ({
  recordPaymentInEvergreen: vi.fn().mockResolvedValue(undefined),
  logPaymentFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const WEBHOOK_SIGNATURE_KEY = "test-square-webhook-key";
const WEBHOOK_URL = "https://example.com/api/opac/payments/webhook/square";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.STACKSOS_SQUARE_WEBHOOK_SIGNATURE_KEY = WEBHOOK_SIGNATURE_KEY;
  process.env.STACKSOS_SQUARE_WEBHOOK_URL = WEBHOOK_URL;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeSignature(body: string): string {
  return createHmac("sha256", WEBHOOK_SIGNATURE_KEY)
    .update(WEBHOOK_URL + body, "utf8")
    .digest("base64");
}

function makeSquareEvent(overrides: Record<string, unknown> = {}) {
  return {
    merchant_id: "M-TEST",
    type: "payment.completed",
    event_id: "evt-123",
    created_at: "2026-03-01T00:00:00Z",
    data: {
      type: "payment",
      id: "data-id-1",
      object: {
        payment: {
          id: "sq-pay-500",
          amount_money: { amount: 1050, currency: "USD" },
          status: "COMPLETED",
          note: "patronId:42|fineIds:10,20,30",
          receipt_url: "https://squareup.com/receipt/123",
        },
      },
    },
    ...overrides,
  };
}

function buildRequest(body: string, signature?: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== null && signature !== undefined) {
    headers["x-square-hmacsha256-signature"] = signature;
  }
  return new Request("http://localhost/api/opac/payments/webhook/square", {
    method: "POST",
    headers,
    body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Square webhook endpoint", () => {
  describe("signature verification", () => {
    it("should accept a valid signature and process payment.completed", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      const event = makeSquareEvent();
      const body = JSON.stringify(event);
      const sig = computeSignature(body);

      const response = await POST(buildRequest(body, sig) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(recordPaymentInEvergreen).toHaveBeenCalledTimes(1);
      expect(vi.mocked(recordPaymentInEvergreen).mock.calls[0]![0]).toMatchObject({
        provider: "square",
        paymentId: "sq-pay-500",
        patronId: 42,
        fineIds: [10, 20, 30],
        amount: 1050,
        currency: "USD",
        receiptUrl: "https://squareup.com/receipt/123",
      });
    });

    it("should reject an invalid signature with 400", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      const body = JSON.stringify(makeSquareEvent());
      const response = await POST(buildRequest(body, "bad-signature") as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid signature");
      expect(recordPaymentInEvergreen).not.toHaveBeenCalled();
    });

    it("should reject a request with missing signature header with 400", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");

      const body = JSON.stringify(makeSquareEvent());
      const response = await POST(buildRequest(body, null) as any);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid signature");
    });
  });

  describe("environment configuration", () => {
    it("should return 500 when webhook signature key env var is missing", async () => {
      delete process.env.STACKSOS_SQUARE_WEBHOOK_SIGNATURE_KEY;

      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");

      const body = JSON.stringify(makeSquareEvent());
      const response = await POST(buildRequest(body, "any-sig") as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Webhook not configured");
    });

    it("should return 500 when webhook URL env var is missing", async () => {
      delete process.env.STACKSOS_SQUARE_WEBHOOK_URL;

      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");

      const body = JSON.stringify(makeSquareEvent());
      const response = await POST(buildRequest(body, "any-sig") as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Webhook not configured");
    });
  });

  describe("note parsing", () => {
    it("should correctly parse patronId and fineIds from valid note format", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      const event = makeSquareEvent();
      (event.data.object.payment as any).note = "patronId:123|fineIds:1,2,3";
      const body = JSON.stringify(event);
      const sig = computeSignature(body);

      await POST(buildRequest(body, sig) as any);

      expect(vi.mocked(recordPaymentInEvergreen).mock.calls[0]![0]).toMatchObject({
        patronId: 123,
        fineIds: [1, 2, 3],
      });
    });

    it("should handle missing note gracefully with patronId=0 and empty fineIds", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      const event = makeSquareEvent();
      delete (event.data.object.payment as any).note;
      const body = JSON.stringify(event);
      const sig = computeSignature(body);

      await POST(buildRequest(body, sig) as any);

      expect(vi.mocked(recordPaymentInEvergreen).mock.calls[0]![0]).toMatchObject({
        patronId: 0,
        fineIds: [],
      });
    });

    it("should handle malformed note field gracefully", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      const event = makeSquareEvent();
      (event.data.object.payment as any).note = "garbage-data-no-pipes";
      const body = JSON.stringify(event);
      const sig = computeSignature(body);

      await POST(buildRequest(body, sig) as any);

      expect(vi.mocked(recordPaymentInEvergreen).mock.calls[0]![0]).toMatchObject({
        patronId: 0,
        fineIds: [],
      });
    });
  });

  describe("event routing", () => {
    it("should call logPaymentFailure for payment.failed events", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");
      const { logPaymentFailure, recordPaymentInEvergreen } =
        await import("@/lib/payments/record-payment");

      const event = makeSquareEvent({
        type: "payment.failed",
      });
      (event.data.object.payment as any).status = "FAILED";
      const body = JSON.stringify(event);
      const sig = computeSignature(body);

      const response = await POST(buildRequest(body, sig) as any);

      expect(response.status).toBe(200);
      expect(logPaymentFailure).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logPaymentFailure).mock.calls[0]![0]).toMatchObject({
        provider: "square",
        paymentId: "sq-pay-500",
        status: "FAILED",
      });
      expect(recordPaymentInEvergreen).not.toHaveBeenCalled();
    });

    it("should return 200 for unknown event types without processing", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");
      const { recordPaymentInEvergreen, logPaymentFailure } =
        await import("@/lib/payments/record-payment");

      const event = makeSquareEvent({ type: "refund.created" });
      const body = JSON.stringify(event);
      const sig = computeSignature(body);

      const response = await POST(buildRequest(body, sig) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(recordPaymentInEvergreen).not.toHaveBeenCalled();
      expect(logPaymentFailure).not.toHaveBeenCalled();
    });
  });

  describe("body parsing", () => {
    it("should return 400 for invalid JSON body", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");

      // Compute a valid signature for the non-JSON body so we pass signature check
      const body = "this is not json {{{";
      const sig = computeSignature(body);

      const response = await POST(buildRequest(body, sig) as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid JSON");
    });

    it("should return 400 for empty body (fails signature check)", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/square/route");

      const response = await POST(buildRequest("", "") as any);

      expect(response.status).toBe(400);
    });
  });
});
