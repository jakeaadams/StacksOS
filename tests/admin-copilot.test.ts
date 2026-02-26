/**
 * Admin Copilot Unit Tests
 *
 * Tests deterministic fallback output against the response schema,
 * threshold-based rules, and rate limiting.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";

// Mirror the response schema from the admin-copilot route
const highlightSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  trend: z.enum(["up", "down", "flat"]),
});

const actionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  category: z.string().min(1),
  deepLink: z.string().optional(),
});

const drilldownSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
});

const responseSchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(highlightSchema).min(1).max(8),
  actions: z.array(actionSchema).min(1).max(8),
  drilldowns: z.array(drilldownSchema).max(8).optional(),
});

type AdminInput = {
  orgId: number;
  metrics: {
    circulationToday: number;
    circulationWeek: number;
    overdueRate: number;
    holdFillRate: number;
    activePatrons: number;
    collectionSize: number;
    newAcquisitionsMonth?: number;
  };
  alerts?: Array<{ type: string; message: string; severity: "critical" | "warning" | "info" }>;
};

// Replicates the deterministic fallback logic for testing
function deterministicFallback(input: AdminInput) {
  const circulationToday = Math.max(0, Math.round(input.metrics.circulationToday));
  const circulationWeek = Math.max(0, Math.round(input.metrics.circulationWeek));
  const overdueRate = Math.max(0, Math.min(100, input.metrics.overdueRate));
  const holdFillRate = Math.max(0, Math.min(100, input.metrics.holdFillRate));
  const activePatrons = Math.max(0, Math.round(input.metrics.activePatrons));
  const collectionSize = Math.max(0, Math.round(input.metrics.collectionSize));

  const highlights: z.infer<typeof highlightSchema>[] = [];
  const actions: z.infer<typeof actionSchema>[] = [];
  const drilldowns: z.infer<typeof drilldownSchema>[] = [];

  const weeklyAvg = circulationWeek > 0 ? Math.round(circulationWeek / 7) : 0;
  const circTrend: "up" | "down" | "flat" =
    weeklyAvg > 0 && circulationToday > weeklyAvg * 1.1
      ? "up"
      : weeklyAvg > 0 && circulationToday < weeklyAvg * 0.9
        ? "down"
        : "flat";

  highlights.push({
    label: "Circulation Today",
    value: String(circulationToday),
    trend: circTrend,
  });

  highlights.push({
    label: "Overdue Rate",
    value: `${overdueRate.toFixed(1)}%`,
    trend: overdueRate > 15 ? "up" : overdueRate < 5 ? "down" : "flat",
  });

  highlights.push({
    label: "Hold Fill Rate",
    value: `${holdFillRate.toFixed(1)}%`,
    trend: holdFillRate < 60 ? "down" : holdFillRate > 80 ? "up" : "flat",
  });

  highlights.push({
    label: "Active Patrons",
    value: String(activePatrons),
    trend: "flat",
  });

  if (overdueRate > 15) {
    actions.push({
      title: "Review overdue collection practices",
      description: `Overdue rate is ${overdueRate.toFixed(1)}% which exceeds the 15% threshold. Consider reviewing notice schedules, extending loan periods for high-demand items, or initiating a targeted overdue outreach campaign.`,
      priority: "high",
      category: "Collection Management",
      deepLink: "/staff/reports",
    });
    drilldowns.push({
      label: "Overdue Analysis",
      description:
        "Review overdue patterns by item type, patron group, and branch to identify systemic issues.",
    });
  }

  if (holdFillRate < 60) {
    actions.push({
      title: "Rebalance acquisitions for hold demand",
      description: `Hold fill rate is ${holdFillRate.toFixed(1)}%, below the 60% target. Review high-demand titles with unfilled holds and consider purchasing additional copies or exploring consortial borrowing.`,
      priority: "high",
      category: "Acquisitions",
      deepLink: "/staff/circulation/holds-management",
    });
    drilldowns.push({
      label: "Hold Demand Report",
      description: "Identify titles with the highest hold-to-copy ratios for targeted purchasing.",
    });
  }

  if (circTrend === "down") {
    actions.push({
      title: "Review programming and outreach",
      description: `Weekly circulation is trending down (today: ${circulationToday}, weekly avg: ${weeklyAvg}). Consider reviewing program effectiveness, updating displays, or launching targeted outreach to inactive patrons.`,
      priority: "medium",
      category: "Programming",
      deepLink: "/staff/reports",
    });
    drilldowns.push({
      label: "Circulation Trends",
      description:
        "Analyze circulation trends by format, subject, and time period to identify declining areas.",
    });
  }

  if (input.alerts && input.alerts.length > 0) {
    const criticalAlerts = input.alerts.filter((a) => a.severity === "critical");
    if (criticalAlerts.length > 0) {
      actions.push({
        title: "Address critical system alerts",
        description: `${criticalAlerts.length} critical alert(s) require immediate attention: ${criticalAlerts.map((a) => a.message).join("; ")}`,
        priority: "high",
        category: "Operations",
        deepLink: "/staff/admin/ops",
      });
    }
  }

  if (actions.length === 0) {
    actions.push({
      title: "Continue monitoring operations",
      description:
        "All key metrics are within normal ranges. Continue monitoring dashboards and address any emerging trends proactively.",
      priority: "low",
      category: "Operations",
      deepLink: "/staff/admin",
    });
  }

  return {
    summary: `Fallback admin copilot brief for org ${input.orgId}: ${circulationToday} circ today, ${overdueRate.toFixed(1)}% overdue rate, ${holdFillRate.toFixed(1)}% hold fill rate, ${activePatrons} active patrons across ${collectionSize} items.`,
    highlights: highlights.slice(0, 8),
    actions: actions.slice(0, 8),
    drilldowns: drilldowns.length > 0 ? drilldowns.slice(0, 8) : undefined,
  };
}

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
