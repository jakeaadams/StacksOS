/**
 * Record Payment Module Unit Tests
 *
 * Tests the shared Evergreen payment recording logic used by all webhook
 * handlers (Stripe, Square, PayPal) at src/lib/payments/record-payment.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCallOpenSRF = vi.fn();
const mockLogAuditEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", () => ({
  callOpenSRF: mockCallOpenSRF,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.STACKSOS_SERVICE_ACCOUNT_BARCODE = "svc-barcode";
  process.env.STACKSOS_SERVICE_ACCOUNT_PIN = "svc-pin";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recordPaymentInEvergreen", () => {
  it("should call OpenSRF auth init, auth complete, and money.payment in correct order", async () => {
    const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

    // Mock auth init -> returns nonce
    mockCallOpenSRF.mockResolvedValueOnce({
      payload: ["test-nonce-123"],
    });

    // Mock auth complete -> returns authtoken
    mockCallOpenSRF.mockResolvedValueOnce({
      payload: [{ payload: { authtoken: "auth-token-abc" } }],
    });

    // Mock money.payment -> success (no ilsevent)
    mockCallOpenSRF.mockResolvedValueOnce({
      payload: [{ payments: [1, 2, 3] }],
    });

    await recordPaymentInEvergreen({
      provider: "square",
      paymentId: "sq-pay-100",
      patronId: 42,
      fineIds: [10, 20],
      amount: 1000,
      currency: "USD",
    });

    // Verify call order: auth.init -> auth.complete -> money.payment -> session.delete
    expect(mockCallOpenSRF).toHaveBeenCalledTimes(4);

    const initCall = mockCallOpenSRF.mock.calls[0]!;
    expect(initCall[0]).toBe("open-ils.auth");
    expect(initCall[1]).toBe("open-ils.auth.authenticate.init");
    expect(initCall[2]).toEqual(["svc-barcode"]);

    const completeCall = mockCallOpenSRF.mock.calls[1]!;
    expect(completeCall[0]).toBe("open-ils.auth");
    expect(completeCall[1]).toBe("open-ils.auth.authenticate.complete");

    const payCall = mockCallOpenSRF.mock.calls[2]!;
    expect(payCall[0]).toBe("open-ils.circ");
    expect(payCall[1]).toBe("open-ils.circ.money.payment");
    expect(payCall[2]![0]).toBe("auth-token-abc");
    expect(payCall[2]![1]).toMatchObject({
      userid: 42,
      payment_type: "credit_card_payment",
    });
    expect(payCall[2]![2]).toBe(42);

    // Verify session cleanup
    const deleteCall = mockCallOpenSRF.mock.calls[3]!;
    expect(deleteCall[0]).toBe("open-ils.auth");
    expect(deleteCall[1]).toBe("open-ils.auth.session.delete");
    expect(deleteCall[2]).toEqual(["auth-token-abc"]);
  });

  it("should return early without calling OpenSRF when patronId is 0", async () => {
    const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

    await recordPaymentInEvergreen({
      provider: "paypal",
      paymentId: "pp-pay-100",
      patronId: 0,
      fineIds: [1, 2],
      amount: 500,
    });

    expect(mockCallOpenSRF).not.toHaveBeenCalled();
  });

  it("should return early without calling OpenSRF when fineIds is empty", async () => {
    const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

    await recordPaymentInEvergreen({
      provider: "stripe",
      paymentId: "pi-100",
      patronId: 42,
      fineIds: [],
      amount: 500,
    });

    expect(mockCallOpenSRF).not.toHaveBeenCalled();
  });

  it("should log warning and return when service account env vars are missing", async () => {
    delete process.env.STACKSOS_SERVICE_ACCOUNT_BARCODE;
    delete process.env.STACKSOS_SERVICE_ACCOUNT_PIN;

    const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");
    const { logger } = await import("@/lib/logger");

    await recordPaymentInEvergreen({
      provider: "square",
      paymentId: "sq-pay-200",
      patronId: 42,
      fineIds: [1],
      amount: 500,
    });

    expect(mockCallOpenSRF).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("should log error and not throw when auth init returns no nonce", async () => {
    const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");
    const { logger } = await import("@/lib/logger");

    // Auth init returns empty payload (no nonce)
    mockCallOpenSRF.mockResolvedValueOnce({ payload: [] });

    // Should not throw
    await expect(
      recordPaymentInEvergreen({
        provider: "square",
        paymentId: "sq-pay-300",
        patronId: 42,
        fineIds: [1],
        amount: 500,
      })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
    // Only auth init was called, not auth complete or money.payment
    expect(mockCallOpenSRF).toHaveBeenCalledTimes(1);
  });

  it("should log error and not throw when payment recording returns ilsevent error", async () => {
    const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");
    const { logger } = await import("@/lib/logger");

    // Auth init -> nonce
    mockCallOpenSRF.mockResolvedValueOnce({ payload: ["nonce-abc"] });

    // Auth complete -> token
    mockCallOpenSRF.mockResolvedValueOnce({
      payload: [{ payload: { authtoken: "token-xyz" } }],
    });

    // money.payment -> ilsevent error
    mockCallOpenSRF.mockResolvedValueOnce({
      payload: [{ ilsevent: 5000, textcode: "INTERNAL_SERVER_ERROR", desc: "fail" }],
    });

    await expect(
      recordPaymentInEvergreen({
        provider: "paypal",
        paymentId: "pp-pay-400",
        patronId: 42,
        fineIds: [1],
        amount: 500,
      })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
  });

  describe("amount distribution", () => {
    it("should distribute 1000 cents across 3 fines as [334, 333, 333]", async () => {
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      mockCallOpenSRF
        .mockResolvedValueOnce({ payload: ["nonce"] })
        .mockResolvedValueOnce({
          payload: [{ payload: { authtoken: "tok" } }],
        })
        .mockResolvedValueOnce({ payload: [{ payments: [1, 2, 3] }] });

      await recordPaymentInEvergreen({
        provider: "square",
        paymentId: "sq-dist-1",
        patronId: 10,
        fineIds: [100, 200, 300],
        amount: 1000,
      });

      const payCall = mockCallOpenSRF.mock.calls[2]!;
      const payments = payCall[2]![1].payments as [number, number][];

      // First fine gets the remainder: floor(1000/3) = 333, remainder = 1
      expect(payments).toEqual([
        [100, 334],
        [200, 333],
        [300, 333],
      ]);

      // Verify total equals original amount
      const total = payments.reduce((sum: number, p: [number, number]) => sum + p[1], 0);
      expect(total).toBe(1000);
    });

    it("should distribute 100 cents across 1 fine as [100]", async () => {
      const { recordPaymentInEvergreen } = await import("@/lib/payments/record-payment");

      mockCallOpenSRF
        .mockResolvedValueOnce({ payload: ["nonce"] })
        .mockResolvedValueOnce({
          payload: [{ payload: { authtoken: "tok" } }],
        })
        .mockResolvedValueOnce({ payload: [{ payments: [1] }] });

      await recordPaymentInEvergreen({
        provider: "stripe",
        paymentId: "pi-dist-1",
        patronId: 10,
        fineIds: [50],
        amount: 100,
      });

      const payCall = mockCallOpenSRF.mock.calls[2]!;
      const payments = payCall[2]![1].payments as [number, number][];

      expect(payments).toEqual([[50, 100]]);
    });
  });
});

describe("logPaymentFailure", () => {
  it("should call logAuditEvent with correct params", async () => {
    const { logPaymentFailure } = await import("@/lib/payments/record-payment");

    await logPaymentFailure({
      provider: "square",
      paymentId: "sq-fail-1",
      patronId: 42,
      status: "FAILED",
    });

    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockLogAuditEvent.mock.calls[0]![0]).toMatchObject({
      action: "opac.payment.webhook_failed",
      entity: "payment_intent",
      entityId: "sq-fail-1",
      status: "failure",
      details: {
        provider: "square",
        patronId: 42,
        status: "FAILED",
      },
    });
  });
});
