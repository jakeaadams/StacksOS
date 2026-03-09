/**
 * PayPal Payment Gateway Unit Tests
 *
 * Tests the PayPal payment gateway with mocked fetch calls,
 * including OAuth token caching and amount conversion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  process.env.STACKSOS_PAYPAL_CLIENT_ID = "test-client-id";
  process.env.STACKSOS_PAYPAL_CLIENT_SECRET = "test-client-secret";
  process.env.STACKSOS_PAYPAL_ENVIRONMENT = "sandbox";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  // Reset module state (cached token) between tests
  vi.resetModules();
});

/** Helper to mock the OAuth token response, then the real API response. */
function mockOAuthThenApi(apiResponse: object, apiOk = true) {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "test-paypal-token", expires_in: 3600 }),
    } as Response)
    .mockResolvedValueOnce({
      ok: apiOk,
      json: async () => apiResponse,
      text: async () => JSON.stringify(apiResponse),
    } as Response);
}

describe("PayPalGateway", () => {
  describe("OAuth token caching", () => {
    it("should reuse cached token on second call (only one OAuth fetch)", async () => {
      const { PayPalGateway } = await import("@/lib/payments/paypal-gateway");
      const gateway = new PayPalGateway("USD");

      // First call: OAuth + API
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "cached-token", expires_in: 3600 }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "ORDER-1",
            status: "CREATED",
            create_time: "2026-01-01T00:00:00Z",
            purchase_units: [
              {
                amount: { value: "5.00", currency_code: "USD" },
                custom_id: "1",
                reference_id: "1",
              },
            ],
          }),
        } as Response)
        // Second call: only API (cached token)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "ORDER-2",
            status: "CREATED",
            create_time: "2026-01-01T00:00:00Z",
            purchase_units: [
              {
                amount: { value: "3.00", currency_code: "USD" },
                custom_id: "2",
                reference_id: "2",
              },
            ],
          }),
        } as Response);

      await gateway.createPaymentIntent({
        amount: 500,
        patronId: 1,
        fineIds: [1],
        description: "test",
      });

      await gateway.createPaymentIntent({
        amount: 300,
        patronId: 2,
        fineIds: [2],
        description: "test 2",
      });

      // 3 total fetches: 1 OAuth + 2 API calls (not 2 OAuth + 2 API)
      expect(fetch).toHaveBeenCalledTimes(3);
      // First call was OAuth
      const firstCallUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
      expect(firstCallUrl).toContain("/v1/oauth2/token");
      // Second call was the first API call (not another OAuth)
      const secondCallUrl = vi.mocked(fetch).mock.calls[1]![0] as string;
      expect(secondCallUrl).toContain("/v2/checkout/orders");
    });
  });

  describe("createPaymentIntent", () => {
    it("should make correct API call to PayPal", async () => {
      const { PayPalGateway } = await import("@/lib/payments/paypal-gateway");
      const gateway = new PayPalGateway("USD");

      mockOAuthThenApi({
        id: "PP-ORDER-123",
        status: "CREATED",
        create_time: "2026-01-01T00:00:00Z",
        purchase_units: [
          {
            amount: { value: "5.00", currency_code: "USD" },
            custom_id: "42",
            reference_id: "10,20",
          },
        ],
      });

      const result = await gateway.createPaymentIntent({
        amount: 500,
        patronId: 42,
        fineIds: [10, 20],
        description: "Fine payment",
      });

      // Verify the orders API call (second fetch)
      const [url, options] = vi.mocked(fetch).mock.calls[1]!;
      expect(url).toContain("/v2/checkout/orders");
      expect(options?.method).toBe("POST");
      expect((options?.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer test-paypal-token"
      );

      const body = JSON.parse(options?.body as string);
      expect(body.intent).toBe("CAPTURE");
      expect(body.purchase_units[0].amount.value).toBe("5.00");
      expect(body.purchase_units[0].custom_id).toBe("42");

      expect(result).toMatchObject({
        id: "PP-ORDER-123",
        provider: "paypal",
        amount: 500,
        currency: "usd",
        status: "pending",
        patronId: 42,
        fineIds: [10, 20],
      });
    });

    it("should convert cents to decimal dollars correctly", async () => {
      const { PayPalGateway } = await import("@/lib/payments/paypal-gateway");
      const gateway = new PayPalGateway("USD");

      mockOAuthThenApi({
        id: "PP-ORDER-456",
        status: "CREATED",
        create_time: "2026-01-01T00:00:00Z",
        purchase_units: [
          { amount: { value: "12.75", currency_code: "USD" }, custom_id: "1", reference_id: "1" },
        ],
      });

      await gateway.createPaymentIntent({
        amount: 1275,
        patronId: 1,
        fineIds: [1],
        description: "test",
      });

      const body = JSON.parse(vi.mocked(fetch).mock.calls[1]![1]?.body as string);
      expect(body.purchase_units[0].amount.value).toBe("12.75");
    });

    it("should throw when PayPal returns non-ok response", async () => {
      const { PayPalGateway } = await import("@/lib/payments/paypal-gateway");
      const gateway = new PayPalGateway();

      mockOAuthThenApi(
        { message: "VALIDATION_ERROR", details: [{ description: "Invalid amount" }] },
        false
      );

      await expect(
        gateway.createPaymentIntent({
          amount: 500,
          patronId: 1,
          fineIds: [1],
          description: "test",
        })
      ).rejects.toThrow("Invalid amount");
    });
  });

  describe("status mapping (via getPaymentStatus)", () => {
    async function setupStatusTest(paypalStatus: string) {
      const { PayPalGateway } = await import("@/lib/payments/paypal-gateway");
      const gateway = new PayPalGateway();

      mockOAuthThenApi({
        id: "PP-STATUS-TEST",
        status: paypalStatus,
        create_time: "2026-01-01T00:00:00Z",
        purchase_units: [
          { amount: { value: "5.00", currency_code: "USD" }, custom_id: "1", reference_id: "1" },
        ],
      });

      return gateway.getPaymentStatus("PP-STATUS-TEST");
    }

    it("should map CREATED to pending", async () => {
      const result = await setupStatusTest("CREATED");
      expect(result.status).toBe("pending");
    });

    it("should map SAVED to pending", async () => {
      const result = await setupStatusTest("SAVED");
      expect(result.status).toBe("pending");
    });

    it("should map APPROVED to processing", async () => {
      const result = await setupStatusTest("APPROVED");
      expect(result.status).toBe("processing");
    });

    it("should map COMPLETED to succeeded", async () => {
      const result = await setupStatusTest("COMPLETED");
      expect(result.status).toBe("succeeded");
    });

    it("should map VOIDED to cancelled", async () => {
      const result = await setupStatusTest("VOIDED");
      expect(result.status).toBe("cancelled");
    });

    it("should map unknown status to failed", async () => {
      const result = await setupStatusTest("UNKNOWN");
      expect(result.status).toBe("failed");
    });
  });
});
