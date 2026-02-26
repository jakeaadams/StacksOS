/**
 * Admin Copilot Unit Tests
 *
 * Tests deterministic fallback output against the response schema,
 * threshold-based rules, and rate limiting.
 *
 * Imports production functions directly from the fallback module
 * instead of maintaining local copies.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { deterministicFallback, responseSchema } from "@/app/api/ai/admin-copilot/fallback";

describe("Admin Copilot", () => {
  describe("Deterministic fallback produces schema-valid output", () => {
    it("should produce valid output for normal metrics", () => {
      const result = deterministicFallback({
        orgId: 1,
        metrics: {
          circulationToday: 150,
          circulationWeek: 1000,
          overdueRate: 8,
          holdFillRate: 75,
          activePatrons: 5000,
          collectionSize: 50000,
        },
      });
      const parsed = responseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
      expect(result.highlights.length).toBeGreaterThanOrEqual(4);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
    });

    it("should produce valid output for zero metrics", () => {
      const result = deterministicFallback({
        orgId: 1,
        metrics: {
          circulationToday: 0,
          circulationWeek: 0,
          overdueRate: 0,
          holdFillRate: 0,
          activePatrons: 0,
          collectionSize: 0,
        },
      });
      const parsed = responseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should produce valid output with alerts", () => {
      const result = deterministicFallback({
        orgId: 1,
        metrics: {
          circulationToday: 100,
          circulationWeek: 700,
          overdueRate: 5,
          holdFillRate: 80,
          activePatrons: 3000,
          collectionSize: 40000,
        },
        alerts: [
          { type: "system", message: "Database backup failed", severity: "critical" },
          { type: "patron", message: "High hold queue on fiction", severity: "warning" },
        ],
      });
      const parsed = responseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
      expect(result.actions.some((a) => a.title.includes("critical"))).toBe(true);
    });
  });

  describe("Threshold-based rules generate correct actions", () => {
    it("should suggest collection review when overdueRate > 15%", () => {
      const result = deterministicFallback({
        orgId: 1,
        metrics: {
          circulationToday: 100,
          circulationWeek: 700,
          overdueRate: 20,
          holdFillRate: 80,
          activePatrons: 3000,
          collectionSize: 40000,
        },
      });
      const overduAction = result.actions.find((a) => a.title.toLowerCase().includes("overdue"));
      expect(overduAction).toBeDefined();
      expect(overduAction!.priority).toBe("high");
      expect(overduAction!.category).toBe("Collection Management");
    });

    it("should suggest acquisition rebalance when holdFillRate < 60%", () => {
      const result = deterministicFallback({
        orgId: 1,
        metrics: {
          circulationToday: 100,
          circulationWeek: 700,
          overdueRate: 5,
          holdFillRate: 45,
          activePatrons: 3000,
          collectionSize: 40000,
        },
      });
      const holdAction = result.actions.find(
        (a) =>
          a.title.toLowerCase().includes("rebalance") ||
          a.title.toLowerCase().includes("acquisition")
      );
      expect(holdAction).toBeDefined();
      expect(holdAction!.priority).toBe("high");
      expect(holdAction!.category).toBe("Acquisitions");
    });

    it("should suggest programming review when circulation is trending down", () => {
      const result = deterministicFallback({
        orgId: 1,
        metrics: {
          circulationToday: 50,
          circulationWeek: 700,
          overdueRate: 5,
          holdFillRate: 80,
          activePatrons: 3000,
          collectionSize: 40000,
        },
      });
      const progAction = result.actions.find(
        (a) =>
          a.title.toLowerCase().includes("programming") ||
          a.title.toLowerCase().includes("outreach")
      );
      expect(progAction).toBeDefined();
      expect(progAction!.priority).toBe("medium");
      expect(progAction!.category).toBe("Programming");
    });

    it("should generate a steady-state action when all metrics are healthy", () => {
      const result = deterministicFallback({
        orgId: 1,
        metrics: {
          circulationToday: 100,
          circulationWeek: 700,
          overdueRate: 5,
          holdFillRate: 85,
          activePatrons: 3000,
          collectionSize: 40000,
        },
      });
      // Circ trend is flat (100 ~ 700/7=100), overdue OK, hold fill OK
      expect(result.actions.some((a) => a.priority === "low")).toBe(true);
    });

    it("should generate multiple actions for multiple threshold breaches", () => {
      const result = deterministicFallback({
        orgId: 1,
        metrics: {
          circulationToday: 30,
          circulationWeek: 700,
          overdueRate: 25,
          holdFillRate: 40,
          activePatrons: 3000,
          collectionSize: 40000,
        },
      });
      // overdueRate > 15 + holdFillRate < 60 + circ trending down = 3 actions
      expect(result.actions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Rate limiting", () => {
    const testIp = "admin-copilot-test-ip";
    const endpoint = "ai-admin-copilot";

    beforeEach(async () => {
      await clearRateLimit(testIp, endpoint);
    });

    it("should allow requests within the limit (20 per 5 min)", async () => {
      for (let i = 0; i < 20; i++) {
        const result = await checkRateLimit(testIp, {
          maxAttempts: 20,
          windowMs: 5 * 60 * 1000,
          endpoint,
        });
        expect(result.allowed).toBe(true);
      }
    });

    it("should reject requests after exceeding the threshold", async () => {
      for (let i = 0; i < 20; i++) {
        await checkRateLimit(testIp, {
          maxAttempts: 20,
          windowMs: 5 * 60 * 1000,
          endpoint,
        });
      }

      const blocked = await checkRateLimit(testIp, {
        maxAttempts: 20,
        windowMs: 5 * 60 * 1000,
        endpoint,
      });
      expect(blocked.allowed).toBe(false);

      await clearRateLimit(testIp, endpoint);
    });
  });
});
