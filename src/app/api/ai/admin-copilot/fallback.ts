import { z } from "zod";

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

export const responseSchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(highlightSchema).min(1).max(8),
  actions: z.array(actionSchema).min(1).max(8),
  drilldowns: z.array(drilldownSchema).max(8).optional(),
});

export type AdminCopilotResponse = z.infer<typeof responseSchema>;

export type AdminCopilotRequest = {
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

export function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function toRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function deterministicFallback(input: AdminCopilotRequest): AdminCopilotResponse {
  const circulationToday = toNonNegativeInt(input.metrics.circulationToday);
  const circulationWeek = toNonNegativeInt(input.metrics.circulationWeek);
  const overdueRate = toRate(input.metrics.overdueRate);
  const holdFillRate = toRate(input.metrics.holdFillRate);
  const activePatrons = toNonNegativeInt(input.metrics.activePatrons);
  const collectionSize = toNonNegativeInt(input.metrics.collectionSize);

  const highlights: AdminCopilotResponse["highlights"] = [];
  const actions: AdminCopilotResponse["actions"] = [];
  const drilldowns: AdminCopilotResponse["drilldowns"] = [];

  // Circulation trend (simple heuristic: compare daily to weekly average)
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

  // Threshold-based rules
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

  // Process alerts
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

  // Ensure at least one action
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
