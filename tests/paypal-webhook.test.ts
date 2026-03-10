/**
 * PayPal Webhook Endpoint Unit Tests
 *
 * Tests PayPal signature verification (via PayPal's API), event routing,
 * and Evergreen recording for the PayPal webhook handler at
 * POST /api/opac/payments/webhook/paypal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/payments/record-payment", () => ({
  recordPaymentInEvergreen: vi.fn().mockResolvedValue(undefined),
  logPaymentFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/payments/types", () => ({
  getPaymentConfig: vi.fn().mockReturnValue({
    provider: "paypal",
    publicKey: "",
    currency: "usd",
    minimumAmount: 100,
    allowPartialPayment: true,
    paypalClientId: "test-client-id",
    paypalEnvironment: "sandbox",
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const PAYPAL_WEBHOOK_ID = "WH-TEST-123";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.STACKSOS_PAYPAL_WEBHOOK_ID = PAYPAL_WEBHOOK_ID;
  process.env.STACKSOS_PAYPAL_CLIENT_ID = "test-client-id";
  process.env.STACKSOS_PAYPAL_CLIENT_SECRET = "test-client-secret";
  process.env.STACKSOS_PAYPAL_ENVIRONMENT = "sandbox";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAYPAL_HEADERS: Record<string, string> = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123",
  "paypal-transmission-id": "trans-id-123",
  "paypal-transmission-sig": "sig-abc123",
  "paypal-transmission-time": "2026-03-01T00:00:00Z",
  "content-type": "application/json",
};

function buildRequest(body: string, headers: Record<string, string> = PAYPAL_HEADERS): Request {
  return new Request("http://localhost/api/opac/payments/webhook/paypal", {
    method: "POST",
    headers,
    body,
  });
}

/**
 * Set up mockFetch to return an OAuth token, then a successful verification,
 * in the order: OAuth -> verify-webhook-signature.
 */
function mockVerificationSuccess() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "test-token", expires_in: 3600 }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ verification_status: "SUCCESS" }),
    } as Response);
}

/**
 * Set up mockFetch to return an OAuth token, then a FAILURE verification.
 */
function mockVerificationFailure() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "test-token", expires_in: 3600 }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ verification_status: "FAILURE" }),
    } as Response);
}

function makeCaptureCompletedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "WH-EVT-001",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource_type: "capture",
    resource: {
      id: "CAP-123",
      status: "COMPLETED",
      amount: { value: "10.50", currency_code: "USD" },
      custom_id: "42",
      invoice_id: "10,20,30",
    },
    summary: "Payment capture completed",
    create_time: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function makeOrderCompletedEvent() {
  return {
    id: "WH-EVT-002",
    event_type: "CHECKOUT.ORDER.COMPLETED",
    resource_type: "checkout-order",
    resource: {
      id: "ORDER-456",
      status: "COMPLETED",
      purchase_units: [
        {
          amount: { value: "25.00", currency_code: "USD" },
          custom_id: "99",
          reference_id: "5,6",
          payments: {
            captures: [
              {
                id: "CAP-789",
                status: "COMPLETED",
                amount: { value: "25.00", currency_code: "USD" },
              },
            ],
          },
        },
      ],
    },
    summary: "Checkout order completed",
    create_time: "2026-03-01T00:00:00Z",
  };
}

function makeCaptureDeniedEvent() {
  return {
    id: "WH-EVT-003",
    event_type: "PAYMENT.CAPTURE.DENIED",
    resource_type: "capture",
    resource: {
      id: "CAP-DENIED-1",
      status: "DENIED",
      amount: { value: "5.00", currency_code: "USD" },
      custom_id: "77",
    },
    summary: "Payment capture denied",
    create_time: "2026-03-01T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PayPal webhook endpoint", () => {
  describe("signature verification", () => {
    it("should accept a valid webhook and process PAYMENT.CAPTURE.COMPLETED", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      mockVerificationSuccess();

      const event = makeCaptureCompletedEvent();
      const body = JSON.stringify(event);
      const response = await POST(buildRequest(body) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(recordPaymentInEvergreen).toHaveBeenCalledTimes(1);
      expect(vi.mocked(recordPaymentInEvergreen).mock.calls[0]![0]).toMatchObject({
        provider: "paypal",
        paymentId: "CAP-123",
        patronId: 42,
        fineIds: [10, 20, 30],
        amount: 1050,
        currency: "usd",
      });
    });

    it("should reject when PayPal verification returns FAILURE", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      mockVerificationFailure();

      const body = JSON.stringify(makeCaptureCompletedEvent());
      const response = await POST(buildRequest(body) as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid signature");
      expect(recordPaymentInEvergreen).not.toHaveBeenCalled();
    });

    it("should return 400 when PayPal verification API returns non-ok response", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "test-token", expires_in: 3600 }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => "Service Unavailable",
        } as Response);

      const body = JSON.stringify(makeCaptureCompletedEvent());
      const response = await POST(buildRequest(body) as any);

      expect(response.status).toBe(400);
    });
  });

  describe("environment configuration", () => {
    it("should return 500 when PayPal webhook ID env var is missing", async () => {
      delete process.env.STACKSOS_PAYPAL_WEBHOOK_ID;

      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");

      const body = JSON.stringify(makeCaptureCompletedEvent());
      const response = await POST(buildRequest(body) as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Webhook not configured");
    });
  });

  describe("event routing", () => {
    it("should correctly process PAYMENT.CAPTURE.COMPLETED with custom_id patron mapping", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      mockVerificationSuccess();

      const event = makeCaptureCompletedEvent();
      (event.resource as any).custom_id = "55";
      (event.resource as any).invoice_id = "7,8";
      const body = JSON.stringify(event);

      await POST(buildRequest(body) as any);

      const callArgs = vi.mocked(recordPaymentInEvergreen).mock.calls[0]![0];
      expect(callArgs.patronId).toBe(55);
      expect(callArgs.fineIds).toEqual([7, 8]);
    });

    it("should correctly process CHECKOUT.ORDER.COMPLETED with purchase_units data", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      mockVerificationSuccess();

      const event = makeOrderCompletedEvent();
      const body = JSON.stringify(event);

      await POST(buildRequest(body) as any);

      expect(recordPaymentInEvergreen).toHaveBeenCalledTimes(1);
      expect(vi.mocked(recordPaymentInEvergreen).mock.calls[0]![0]).toMatchObject({
        provider: "paypal",
        paymentId: "CAP-789",
        patronId: 99,
        fineIds: [5, 6],
        amount: 2500,
        currency: "usd",
      });
    });

    it("should call logPaymentFailure for PAYMENT.CAPTURE.DENIED events", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");
      const { logPaymentFailure, recordPaymentInEvergreen } =
        await import("@/lib/payments/record-payment");

      mockVerificationSuccess();

      const event = makeCaptureDeniedEvent();
      const body = JSON.stringify(event);
      const response = await POST(buildRequest(body) as any);

      expect(response.status).toBe(200);
      expect(logPaymentFailure).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logPaymentFailure).mock.calls[0]![0]).toMatchObject({
        provider: "paypal",
        paymentId: "CAP-DENIED-1",
        patronId: 77,
        status: "DENIED",
      });
      expect(recordPaymentInEvergreen).not.toHaveBeenCalled();
    });

    it("should return 200 for unknown event types without processing", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");
      const { recordPaymentInEvergreen, logPaymentFailure } =
        await import("@/lib/payments/record-payment");

      mockVerificationSuccess();

      const event = {
        id: "WH-EVT-999",
        event_type: "BILLING.SUBSCRIPTION.CREATED",
        resource: { id: "SUB-1", status: "ACTIVE" },
      };
      const body = JSON.stringify(event);
      const response = await POST(buildRequest(body) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(recordPaymentInEvergreen).not.toHaveBeenCalled();
      expect(logPaymentFailure).not.toHaveBeenCalled();
    });
  });

  describe("amount conversion", () => {
    it("should convert PayPal dollar string '10.50' to 1050 cents", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      mockVerificationSuccess();

      const event = makeCaptureCompletedEvent();
      (event.resource as any).amount = { value: "10.50", currency_code: "USD" };
      const body = JSON.stringify(event);

      await POST(buildRequest(body) as any);

      const callArgs = vi.mocked(recordPaymentInEvergreen).mock.calls[0]![0];
      expect(callArgs.amount).toBe(1050);
    });
  });

  describe("header validation", () => {
    it("should return 400 when required PayPal signature headers are missing", async () => {
      const { POST } = await import("@/app/api/opac/payments/webhook/paypal/route");

      // No OAuth or verify calls should be made
      const body = JSON.stringify(makeCaptureCompletedEvent());
      const response = await POST(
        buildRequest(body, { "content-type": "application/json" }) as any
      );

      expect(response.status).toBe(400);
    });
  });
});
