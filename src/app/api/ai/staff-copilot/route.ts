import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { generateAiJson, promptMetadata, redactAiInput } from "@/lib/ai";
import { buildStaffCopilotPrompt } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";
import { publishDeveloperEvent } from "@/lib/developer/webhooks";

const requestSchema = z.object({
  orgId: z.number().int().positive(),
  stats: z.record(z.string(), z.number().nullable()),
  holds: z.object({
    available: z.number().int().min(0),
    pending: z.number().int().min(0),
    in_transit: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
});

const actionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
  impact: z.enum(["high", "medium", "low"]),
  etaMinutes: z.number().int().min(1).max(240),
  steps: z.array(z.string().min(1)).min(1).max(6),
  deepLink: z.string().min(1),
});

const responseSchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(z.string().min(1)).min(1).max(8),
  actions: z.array(actionSchema).min(1).max(6),
  caveats: z.array(z.string().min(1)).optional(),
  drilldowns: z
    .array(
      z.object({
        label: z.string().min(1),
        url: z.string().min(1),
      })
    )
    .min(1)
    .max(8),
});

type StaffCopilotRequest = z.infer<typeof requestSchema>;
type StaffCopilotResponse = z.infer<typeof responseSchema>;
type AiErrorClass = "disabled" | "misconfigured" | "transient" | "unknown";

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
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

function deterministicFallback(input: StaffCopilotRequest): StaffCopilotResponse {
  const checkouts = toNonNegativeInt(input.stats.checkouts_today);
  const checkins = toNonNegativeInt(input.stats.checkins_today);
  const activeHolds = toNonNegativeInt(input.stats.active_holds);
  const overdueItems = toNonNegativeInt(input.stats.overdue_items);
  const holdsAvailable = toNonNegativeInt(input.holds.available);
  const holdsPending = toNonNegativeInt(input.holds.pending);
  const holdsInTransit = toNonNegativeInt(input.holds.in_transit);

  const highlights: string[] = [];
  const actions: StaffCopilotResponse["actions"] = [];

  if (holdsPending > holdsAvailable) {
    highlights.push(
      `Pending holds (${holdsPending}) exceed available shelf holds (${holdsAvailable}); prioritize pull-list execution.`
    );
    actions.push({
      id: "holds-backlog-priority",
      title: "Prioritize pending holds queue",
      why: "Reducing pending holds first lowers patron wait time and follow-up load.",
      impact: "high",
      etaMinutes: 25,
      steps: [
        "Open pull list and process highest-priority requests.",
        "Push in-transit items to destination branches immediately.",
        "Refresh holds management and verify pending queue reduction.",
      ],
      deepLink: "/staff/circulation/pull-list",
    });
  }

  if (overdueItems > 0) {
    highlights.push(`Overdue queue has ${overdueItems} items requiring follow-up.`);
    actions.push({
      id: "overdue-followup",
      title: "Run overdue recovery pass",
      why: "Proactive recovery reduces loss risk and improves circulation turnover.",
      impact: overdueItems > 100 ? "high" : "medium",
      etaMinutes: 20,
      steps: [
        "Open reports and filter high-risk overdue cohorts.",
        "Queue notices/callbacks for longest-overdue accounts.",
        "Escalate unresolved high-value items.",
      ],
      deepLink: "/staff/reports",
    });
  }

  if (checkouts > checkins) {
    highlights.push(`Checkouts (${checkouts}) are currently ahead of checkins (${checkins}).`);
    actions.push({
      id: "checkin-balance",
      title: "Balance check-in throughput",
      why: "Reducing check-in lag improves item availability and hold fulfillment.",
      impact: "medium",
      etaMinutes: 15,
      steps: [
        "Open check-in workflow and clear current return queue.",
        "Resolve exception statuses before routing.",
        "Confirm hold shelf updates post-checkin.",
      ],
      deepLink: "/staff/circulation/checkin",
    });
  }

  if (holdsInTransit > 0) {
    highlights.push(`${holdsInTransit} holds are in transit; verify branch handoffs.`);
    actions.push({
      id: "transit-review",
      title: "Review transit queue",
      why: "Transit delays directly impact patron pickup SLA.",
      impact: "medium",
      etaMinutes: 10,
      steps: [
        "Open transits queue and check stalled shipments.",
        "Prioritize same-day pickup requests.",
        "Escalate unresolved transit blockers.",
      ],
      deepLink: "/staff/circulation/transits",
    });
  }

  if (highlights.length === 0) {
    highlights.push("Operational indicators are stable; no high-risk queue imbalances detected.");
    actions.push({
      id: "steady-state-monitoring",
      title: "Maintain steady-state monitoring",
      why: "Keep desk throughput stable while queues are healthy.",
      impact: "low",
      etaMinutes: 10,
      steps: [
        "Monitor circulation and holds dashboards.",
        "Verify no new exception alerts in patron and item workflows.",
        "Refresh workbench metrics in 30 minutes.",
      ],
      deepLink: "/staff",
    });
  }

  return {
    summary: `Fallback staff copilot brief for org ${input.orgId}: ${activeHolds} active holds, ${overdueItems} overdue items, ${checkouts}/${checkins} checkout-checkin flow.`,
    highlights: highlights.slice(0, 8),
    actions: actions.slice(0, 6),
    caveats: [
      "AI provider was unavailable; this recommendation set was generated deterministically from live metrics.",
    ],
    drilldowns: [
      { label: "Staff Workbench", url: "/staff" },
      { label: "Circulation Desk", url: "/staff/circulation" },
      { label: "Holds Management", url: "/staff/circulation/holds-management" },
      { label: "Patrons", url: "/staff/patrons" },
      { label: "Reports", url: "/staff/reports" },
    ],
  };
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-staff-copilot",
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
    const prompt = buildStaffCopilotPrompt(inputRedacted);
    const system = prompt.system;
    const user = prompt.user;

    let data: StaffCopilotResponse;
    let completion: { provider: string; model?: string; usage?: unknown } | null = null;
    let config: { model?: string } | null = null;
    let degraded = false;

    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: responseSchema,
        callType: "staff_copilot",
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
      type: "staff_copilot",
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
      eventType: "ai.staff.copilot.generated",
      actorId: typeof actor?.id === "number" ? actor.id : null,
      requestId,
      payload: {
        orgId: parsed.data.orgId,
        draftId,
        degraded,
        actionCount: data.actions.length,
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
        type: "staff_copilot",
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
    return serverErrorResponse(error, "AI Staff Copilot", req);
  }
}
