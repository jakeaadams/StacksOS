/**
 * Square Payment Gateway Unit Tests
 *
 * Tests the Square payment gateway with mocked fetch calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearTenantConfigCache } from "@/lib/tenant/config";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { createOpacPaymentSession } = vi.hoisted(() => ({
  createOpacPaymentSession: vi.fn(),
}));

vi.mock("@/lib/db/opac-payment-sessions", () => ({
  createOpacPaymentSession,
}));

import { SquareGateway } from "@/lib/payments/square-gateway";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.STACKSOS_SQUARE_ACCESS_TOKEN = "test-square-token";
  process.env.STACKSOS_SQUARE_APPLICATION_ID = "sandbox-sq0idb-test";
  process.env.STACKSOS_SQUARE_LOCATION_ID = "test-location-id";
  process.env.STACKSOS_SQUARE_ENVIRONMENT = "sandbox";
  process.env.STACKSOS_PAYMENT_PROVIDER = "square";
  vi.stubGlobal("fetch", vi.fn());
  createOpacPaymentSession.mockResolvedValue({
    id: "sq-session-123",
    provider: "square",
    patronId: 42,
    amountCents: 500,
    currency: "usd",
    fineIds: [10, 20],
    description: "Fine payment",
    metadata: { source: "square-web-payments-sdk" },
    createdAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-01-01T00:30:00Z",
    consumedAt: null,
    providerPaymentId: null,
  });
  clearTenantConfigCache();
});

afterEach(() => {
  process.env = { ...originalEnv };
  clearTenantConfigCache();
  vi.restoreAllMocks();
});

describe("SquareGateway", () => {
  describe("createPaymentIntent", () => {
    it("should create a StacksOS payment session for browser tokenization", async () => {
      const gateway = new SquareGateway("USD");

      const result = await gateway.createPaymentIntent({
        amount: 500,
        patronId: 42,
        fineIds: [10, 20],
        description: "Fine payment",
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(createOpacPaymentSession).toHaveBeenCalledTimes(1);
      expect(createOpacPaymentSession.mock.calls[0]![0]).toMatchObject({
        provider: "square",
        patronId: 42,
        amountCents: 500,
        currency: "USD",
        fineIds: [10, 20],
      });

      expect(result).toMatchObject({
        id: "sq-session-123",
        provider: "square",
        amount: 500,
        currency: "usd",
        status: "pending",
        patronId: 42,
        fineIds: [10, 20],
      });
    });

    it("should throw when Square returns non-ok response", async () => {
      const gateway = new SquareGateway();
      createOpacPaymentSession.mockRejectedValueOnce(new Error("Square session bootstrap failed"));

      await expect(
        gateway.createPaymentIntent({
          amount: 500,
          patronId: 1,
          fineIds: [1],
          description: "test",
        })
      ).rejects.toThrow("Square session bootstrap failed");
    });
  });

  describe("getPaymentStatus — status mapping", () => {
    async function setupStatusTest(squareStatus: string) {
      const gateway = new SquareGateway();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payment: {
            id: "sq-pay-100",
            amount_money: { amount: 300, currency: "USD" },
            status: squareStatus,
            created_at: "2026-01-01T00:00:00Z",
            note: "patronId:5|fineIds:1,2",
          },
        }),
      } as Response);
      return gateway.getPaymentStatus("sq-pay-100");
    }

    it("should map PENDING to pending", async () => {
      const result = await setupStatusTest("PENDING");
      expect(result.status).toBe("pending");
    });

    it("should map APPROVED to pending", async () => {
      const result = await setupStatusTest("APPROVED");
      expect(result.status).toBe("pending");
    });

    it("should map COMPLETED to succeeded", async () => {
      const result = await setupStatusTest("COMPLETED");
      expect(result.status).toBe("succeeded");
    });

    it("should map CANCELED to cancelled", async () => {
      const result = await setupStatusTest("CANCELED");
      expect(result.status).toBe("cancelled");
    });

    it("should map FAILED to failed", async () => {
      const result = await setupStatusTest("FAILED");
      expect(result.status).toBe("failed");
    });

    it("should map unknown status to pending", async () => {
      const result = await setupStatusTest("SOMETHING_UNKNOWN");
      expect(result.status).toBe("pending");
    });
  });

  describe("parseNote (via getPaymentStatus)", () => {
    it("should correctly extract patronId and fineIds from note field", async () => {
      const gateway = new SquareGateway();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payment: {
            id: "sq-pay-200",
            amount_money: { amount: 1000, currency: "USD" },
            status: "COMPLETED",
            created_at: "2026-01-01T00:00:00Z",
            note: "patronId:123|fineIds:5,10,15",
          },
        }),
      } as Response);

      const result = await gateway.getPaymentStatus("sq-pay-200");
      expect(result.patronId).toBe(123);
      expect(result.fineIds).toEqual([5, 10, 15]);
    });

    it("should handle missing note gracefully", async () => {
      const gateway = new SquareGateway();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payment: {
            id: "sq-pay-300",
            amount_money: { amount: 200, currency: "USD" },
            status: "COMPLETED",
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      } as Response);

      const result = await gateway.getPaymentStatus("sq-pay-300");
      expect(result.patronId).toBe(0);
      expect(result.fineIds).toEqual([]);
    });
  });
});
