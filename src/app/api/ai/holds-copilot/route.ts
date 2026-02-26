import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { generateAiJson, promptMetadata, redactAiInput } from "@/lib/ai";
import { buildHoldsCopilotPrompt } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";
import { publishDeveloperEvent } from "@/lib/developer/webhooks";

const requestSchema = z.object({
  orgId: z.number().int().positive(),
  holds: z.object({
    available: z.number().int().min(0),
    pending: z.number().int().min(0),
    in_transit: z.number().int().min(0),
    total: z.number().int().min(0),
    expired: z.number().int().min(0).optional(),
  }),
  pullListSize: z.number().int().min(0).optional(),
  shelfSize: z.number().int().min(0).optional(),
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

type HoldsCopilotRequest = z.infer<typeof requestSchema>;
type HoldsCopilotResponse = z.infer<typeof responseSchema>;
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

function deterministicFallback(input: HoldsCopilotRequest): HoldsCopilotResponse {
  const available = toNonNegativeInt(input.holds.available);
  const pending = toNonNegativeInt(input.holds.pending);
  const inTransit = toNonNegativeInt(input.holds.in_transit);
  const total = toNonNegativeInt(input.holds.total);
  const pullListSize = toNonNegativeInt(input.pullListSize);
  const shelfSize = toNonNegativeInt(input.shelfSize);

  const highlights: string[] = [];
  const actions: HoldsCopilotResponse["actions"] = [];

  if (pending > available) {
    highlights.push(
      `Pending holds (${pending}) exceed available shelf holds (${available}); prioritize pull-list execution.`
    );
    actions.push({
      id: "holds-backlog-priority",
      title: "Process pull list backlog",
      why: "Reducing pending holds lowers patron wait time and follow-up load.",
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

  if (inTransit > 0) {
    highlights.push(`${inTransit} holds are in transit; verify branch handoffs.`);
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

  if (pullListSize && pullListSize > 20) {
    highlights.push(`Pull list has ${pullListSize} items; consider batch processing.`);
    actions.push({
      id: "batch-pull",
      title: "Batch process pull list",
      why: "Large pull lists slow down hold fulfillment if not addressed promptly.",
      impact: "high",
      etaMinutes: 30,
      steps: [
        "Sort pull list by hold age and priority.",
        "Pull items in batch and route to holds shelf.",
        "Update hold statuses after processing.",
      ],
      deepLink: "/staff/circulation/pull-list",
    });
  }

  if (shelfSize && shelfSize > 50) {
    highlights.push(`Holds shelf has ${shelfSize} items; review for expired holds.`);
    actions.push({
      id: "shelf-cleanup",
      title: "Clean up holds shelf",
      why: "Shelf congestion delays new hold captures and confuses pickup workflows.",
      impact: "medium",
      etaMinutes: 15,
      steps: [
        "Review holds shelf for expired or uncollected items.",
        "Clear expired holds and return items to circulation.",
        "Notify patrons of upcoming expirations.",
      ],
      deepLink: "/staff/circulation/holds-shelf",
    });
  }

  if (highlights.length === 0) {
    highlights.push("Hold queues are stable; no high-risk imbalances detected.");
    actions.push({
      id: "steady-state-monitoring",
      title: "Maintain steady-state monitoring",
      why: "Keep hold queues healthy while no immediate action is needed.",
      impact: "low",
      etaMinutes: 10,
      steps: [
        "Monitor holds management dashboard.",
        "Verify no new exception alerts.",
        "Refresh metrics in 30 minutes.",
      ],
      deepLink: "/staff/circulation/holds-management",
    });
  }

  return {
    summary: `Fallback holds copilot brief for org ${input.orgId}: ${total} total holds, ${pending} pending, ${available} available, ${inTransit} in transit.`,
    highlights: highlights.slice(0, 8),
    actions: actions.slice(0, 6),
    caveats: [
      "AI provider was unavailable; this recommendation set was generated deterministically from live metrics.",
    ],
    drilldowns: [
      { label: "Holds Management", url: "/staff/circulation/holds-management" },
      { label: "Pull List", url: "/staff/circulation/pull-list" },
      { label: "Holds Shelf", url: "/staff/circulation/holds-shelf" },
      { label: "Transits", url: "/staff/circulation/transits" },
    ],
  };
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-holds-copilot",
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
    const prompt = buildHoldsCopilotPrompt(inputRedacted);
    const system = prompt.system;
    const user = prompt.user;

    let data: HoldsCopilotResponse;
    let completion: { provider: string; model?: string; usage?: unknown } | null = null;
    let config: { model?: string } | null = null;
    let degraded = false;

    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: responseSchema,
        callType: "holds_copilot",
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
      type: "holds_copilot",
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
      eventType: "ai.holds.copilot.generated",
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
        type: "holds_copilot",
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
    return serverErrorResponse(error, "AI Holds Copilot", req);
  }
}
