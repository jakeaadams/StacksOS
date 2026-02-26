import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { generateAiJson, promptMetadata, redactAiInput } from "@/lib/ai";
import { buildAdminCopilotPrompt } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";
import { publishDeveloperEvent } from "@/lib/developer/webhooks";

const alertSchema = z.object({
  type: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["critical", "warning", "info"]),
});

const requestSchema = z.object({
  orgId: z.number().int().positive(),
  metrics: z.object({
    circulationToday: z.number().int().min(0),
    circulationWeek: z.number().int().min(0),
    overdueRate: z.number().min(0).max(100),
    holdFillRate: z.number().min(0).max(100),
    activePatrons: z.number().int().min(0),
    collectionSize: z.number().int().min(0),
    newAcquisitionsMonth: z.number().int().min(0).optional(),
  }),
  alerts: z.array(alertSchema).optional(),
});

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

type AdminCopilotRequest = z.infer<typeof requestSchema>;
type AdminCopilotResponse = z.infer<typeof responseSchema>;
type AiErrorClass = "disabled" | "misconfigured" | "transient" | "unknown";

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function toRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function classifyAiError(message: string): AiErrorClass {
  const m = message.toLowerCase();
  if (m.includes("ai is disabled")) return "disabled";
  if (
    m.includes("not configured") ||
    m.includes("misconfigured") ||
    (m.includes("missing") && m.includes("api_key"))
  ) {
    return "misconfigured";
  }
  if (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("aborted") ||
    m.includes("fetch failed") ||
    m.includes("econnreset") ||
    m.includes("socket hang up") ||
    m.includes("network")
  ) {
    return "transient";
  }
  return "unknown";
}

function deterministicFallback(input: AdminCopilotRequest): AdminCopilotResponse {
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

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-admin-copilot",
  });
  if (!rate.allowed) {
    return errorResponse("Too many AI requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("Invalid request body", 400, parsed.error.flatten());
    }

    const inputRedacted = redactAiInput(parsed.data);
    const prompt = buildAdminCopilotPrompt(inputRedacted);
    const system = prompt.system;
    const user = prompt.user;

    let data: AdminCopilotResponse;
    let completion: { provider: string; model?: string; usage?: unknown } | null = null;
    let config: { model?: string } | null = null;
    let degraded = false;

    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: responseSchema,
        callType: "admin_copilot",
        actorId: actor?.id || null,
        ip,
        userAgent,
        promptTemplateId: prompt.id,
        promptVersion: prompt.version,
      });
      data = out.data;
      completion = out.completion;
      config = out.config;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorClass = classifyAiError(message);
      if (errorClass === "disabled") return errorResponse("AI is disabled for this tenant", 503);
      if (errorClass === "misconfigured") return errorResponse("AI is not configured", 501);
      if (errorClass !== "transient") throw error;

      data = deterministicFallback(parsed.data);
      degraded = true;
      completion = { provider: "fallback", model: "deterministic" };
      config = { model: "deterministic" };
    }

    const meta = promptMetadata(system, user);
    const draftId = await createAiDraft({
      type: "admin_copilot",
      requestId: requestId || undefined,
      actorId: actor?.id,
      provider: completion?.provider || "unknown",
      model: completion?.model || config?.model,
      promptHash: meta.promptHash,
      promptTemplateId: prompt.id,
      promptVersion: prompt.version,
      systemHash: meta.systemHash,
      userHash: meta.userHash,
      inputRedacted,
      output: data,
      userAgent,
      ip,
    });

    await publishDeveloperEvent({
      tenantId: process.env.STACKSOS_TENANT_ID || "default",
      eventType: "ai.admin.copilot.generated",
      actorId: typeof actor?.id === "number" ? actor.id : null,
      requestId,
      payload: {
        orgId: parsed.data.orgId,
        draftId,
        degraded,
        actionCount: data.actions.length,
        highlightCount: data.highlights.length,
      },
    });

    await logAuditEvent({
      action: "ai.suggestion.created",
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        type: "admin_copilot",
        draftId,
        provider: completion?.provider || "unknown",
        model: completion?.model || config?.model || null,
        degraded,
        promptTemplate: prompt.id,
        promptVersion: prompt.version,
      },
    });

    return successResponse({
      draftId,
      response: data,
      meta: {
        provider: completion?.provider || "unknown",
        model: completion?.model || config?.model || null,
        usage: completion?.usage || null,
        promptTemplate: prompt.id,
        promptVersion: prompt.version,
        degraded,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "AI Admin Copilot", req);
  }
}
