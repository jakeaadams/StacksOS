import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { generateAiJson, promptMetadata, redactAiInput } from "@/lib/ai";
import { buildOpsPlaybooksPrompt } from "@/lib/ai/prompts";
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
  actions: z.array(actionSchema).min(1).max(6),
  caveats: z.array(z.string().min(1)).optional(),
});

type OpsPlaybookRequest = z.infer<typeof requestSchema>;
type OpsPlaybookResponse = z.infer<typeof responseSchema>;

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

function fallbackActions(input: OpsPlaybookRequest): OpsPlaybookResponse {
  const checkouts = toNonNegativeInt(input.stats.checkouts_today);
  const checkins = toNonNegativeInt(input.stats.checkins_today);
  const _activeHolds = toNonNegativeInt(input.stats.active_holds);
  const overdueItems = toNonNegativeInt(input.stats.overdue_items);
  const holdsAvailable = toNonNegativeInt(input.holds.available);
  const holdsPending = toNonNegativeInt(input.holds.pending);
  const holdsInTransit = toNonNegativeInt(input.holds.in_transit);

  const actions: OpsPlaybookResponse["actions"] = [];

  if (holdsPending > holdsAvailable) {
    actions.push({
      id: "holds-pull-priority",
      title: "Clear pending holds queue first",
      why: `Pending holds (${holdsPending}) exceed available shelf holds (${holdsAvailable}).`,
      impact: "high",
      etaMinutes: 25,
      steps: [
        "Open pull list and process top pending requests.",
        "Route in-transit copies to pickup locations first.",
        "Re-check hold queue after first pass.",
      ],
      deepLink: "/staff/circulation/pull-list",
    });
  }

  if (overdueItems > 0) {
    actions.push({
      id: "overdue-recovery-pass",
      title: "Run overdue recovery pass",
      why: `${overdueItems} overdue items need follow-up to reduce loss risk.`,
      impact: overdueItems > 100 ? "high" : "medium",
      etaMinutes: 20,
      steps: [
        "Open reports and filter overdue cohorts.",
        "Prioritize highest-value and longest-overdue groups.",
        "Queue outbound notices and staff callbacks.",
      ],
      deepLink: "/staff/reports",
    });
  }

  if (checkouts > checkins) {
    actions.push({
      id: "checkin-backlog",
      title: "Run check-in backlog sweep",
      why: `Checkouts (${checkouts}) are outpacing checkins (${checkins}).`,
      impact: "medium",
      etaMinutes: 15,
      steps: [
        "Open check-in station and process returns in scan order.",
        "Resolve exception states before routing.",
        "Confirm hold shelf and transit queues are updated.",
      ],
      deepLink: "/staff/circulation/checkin",
    });
  }

  if (holdsInTransit > 0) {
    actions.push({
      id: "transit-balance",
      title: "Balance in-transit holds",
      why: `${holdsInTransit} holds are currently in transit.`,
      impact: "medium",
      etaMinutes: 10,
      steps: [
        "Review transit queue and branch destination mix.",
        "Prioritize same-day pickup requests.",
        "Escalate stalled transits older than SLA.",
      ],
      deepLink: "/staff/circulation/transits",
    });
  }

  if (!actions.length) {
    actions.push({
      id: "steady-state-monitoring",
      title: "Maintain steady-state desk flow",
      why: "Current queue metrics are stable.",
      impact: "low",
      etaMinutes: 10,
      steps: [
        "Keep circulation and hold dashboards visible.",
        "Run a quick integrity check on holds shelf.",
        "Refresh metrics in 30 minutes.",
      ],
      deepLink: "/staff/circulation",
    });
  }

  return {
    summary: `Fallback playbooks for org ${input.orgId}: ${actions.length} action(s) generated from live queue metrics.`,
    actions: actions.slice(0, 6),
    caveats: [
      "AI provider is temporarily unavailable; these playbooks are deterministic fallback actions.",
    ],
  };
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-ops-playbooks",
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

    const prompt = buildOpsPlaybooksPrompt(redactAiInput(parsed.data));
    const system = prompt.system;
    const user = prompt.user;

    let responseData: OpsPlaybookResponse;
    let completion: { provider: string; model?: string; usage?: unknown } | null = null;
    let config: { model?: string } | null = null;
    let degraded = false;

    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: responseSchema,
        callType: "ops_playbooks",
        actorId: typeof actor?.id === "number" ? actor.id : null,
        ip,
        userAgent,
        promptTemplateId: prompt.id,
        promptVersion: prompt.version,
      });
      responseData = out.data;
      completion = out.completion;
      config = out.config;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorClass = classifyAiError(message);
      if (errorClass === "disabled") return errorResponse("AI is disabled for this tenant", 503);
      if (errorClass === "misconfigured") return errorResponse("AI is not configured", 501);
      if (errorClass !== "transient") throw error;

      responseData = fallbackActions(parsed.data);
      degraded = true;
      completion = { provider: "fallback", model: "deterministic" };
      config = { model: "deterministic" };
    }

    const metadata = promptMetadata(system, user);
    const draftId = await createAiDraft({
      type: "ops_playbooks",
      requestId: requestId || undefined,
      actorId: actor?.id,
      provider: completion?.provider || "unknown",
      model: completion?.model || config?.model,
      promptHash: metadata.promptHash,
      promptTemplateId: prompt.id,
      promptVersion: prompt.version,
      systemHash: metadata.systemHash,
      userHash: metadata.userHash,
      inputRedacted: redactAiInput(parsed.data),
      output: responseData,
      userAgent,
      ip,
    });

    await publishDeveloperEvent({
      tenantId: process.env.STACKSOS_TENANT_ID || "default",
      eventType: "ai.ops.playbook.generated",
      actorId: typeof actor?.id === "number" ? actor.id : null,
      requestId,
      payload: {
        orgId: parsed.data.orgId,
        draftId,
        degraded,
        actionCount: responseData.actions.length,
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
        type: "ops_playbooks",
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
      response: responseData,
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
    return serverErrorResponse(error, "AI Ops Playbooks", req);
  }
}
