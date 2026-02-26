import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { generateAiJson, promptMetadata, redactAiInput } from "@/lib/ai";
import { buildAcquisitionsCopilotPrompt } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";
import { publishDeveloperEvent } from "@/lib/developer/webhooks";

const fundSummarySchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().max(500),
  code: z.string().max(100),
  year: z.number().int(),
  currency: z.string().max(10),
});

const requestSchema = z.object({
  orgId: z.number().int().positive(),
  funds: z.array(fundSummarySchema),
  orderCounts: z.object({
    total: z.number().int().min(0),
    pending: z.number().int().min(0),
    onOrder: z.number().int().min(0),
    received: z.number().int().min(0),
  }),
  vendorCount: z.number().int().min(0),
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

type AcquisitionsCopilotRequest = z.infer<typeof requestSchema>;
type AcquisitionsCopilotResponse = z.infer<typeof responseSchema>;
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

function deterministicFallback(input: AcquisitionsCopilotRequest): AcquisitionsCopilotResponse {
  const totalOrders = toNonNegativeInt(input.orderCounts.total);
  const pendingOrders = toNonNegativeInt(input.orderCounts.pending);
  const onOrderCount = toNonNegativeInt(input.orderCounts.onOrder);
  const receivedCount = toNonNegativeInt(input.orderCounts.received);
  const fundCount = input.funds.length;
  const vendorCount = toNonNegativeInt(input.vendorCount);

  const highlights: string[] = [];
  const actions: AcquisitionsCopilotResponse["actions"] = [];

  if (pendingOrders > 0) {
    highlights.push(`${pendingOrders} pending purchase orders require review or activation.`);
    actions.push({
      id: "pending-orders-review",
      title: "Review pending purchase orders",
      why: "Pending orders delay material acquisition and budget commitment tracking.",
      impact: pendingOrders > 10 ? "high" : "medium",
      etaMinutes: 20,
      steps: [
        "Open purchase orders and filter by pending status.",
        "Review line items and pricing for accuracy.",
        "Activate approved orders to commit fund allocations.",
      ],
      deepLink: "/staff/acquisitions",
    });
  }

  if (onOrderCount > 0) {
    highlights.push(`${onOrderCount} orders are on-order; monitor for receiving readiness.`);
    actions.push({
      id: "monitor-on-order",
      title: "Monitor on-order items",
      why: "Tracking on-order items ensures timely receiving and cataloging.",
      impact: "medium",
      etaMinutes: 15,
      steps: [
        "Check expected delivery dates for on-order items.",
        "Follow up with vendors on delayed shipments.",
        "Prepare receiving workflows for imminent deliveries.",
      ],
      deepLink: "/staff/acquisitions/receiving",
    });
  }

  if (fundCount === 0) {
    highlights.push("No fund accounts configured; acquisitions tracking is limited.");
    actions.push({
      id: "configure-funds",
      title: "Set up fund accounts",
      why: "Fund accounts are required for proper budget tracking and encumbrance management.",
      impact: "high",
      etaMinutes: 30,
      steps: [
        "Review the Evergreen acquisitions setup guide.",
        "Create fund accounts for the current fiscal year.",
        "Assign fund allocations per collection area.",
      ],
      deepLink: "/staff/acquisitions",
    });
  }

  if (highlights.length === 0) {
    highlights.push("Acquisitions workflow is stable; no immediate budget actions needed.");
    actions.push({
      id: "steady-state-acquisitions",
      title: "Maintain acquisitions monitoring",
      why: "Regular review keeps budget tracking accurate and vendor relationships current.",
      impact: "low",
      etaMinutes: 10,
      steps: [
        "Review fund balances and spending rates.",
        "Check for any vendor communication or invoice updates.",
        "Refresh acquisitions dashboard periodically.",
      ],
      deepLink: "/staff/acquisitions",
    });
  }

  return {
    summary: `Fallback acquisitions copilot brief for org ${input.orgId}: ${totalOrders} orders (${pendingOrders} pending, ${onOrderCount} on-order, ${receivedCount} received), ${fundCount} funds, ${vendorCount} vendors.`,
    highlights: highlights.slice(0, 8),
    actions: actions.slice(0, 6),
    caveats: [
      "AI provider was unavailable; this recommendation set was generated deterministically from acquisitions data.",
    ],
    drilldowns: [
      { label: "Acquisitions", url: "/staff/acquisitions" },
      { label: "Purchase Orders", url: "/staff/acquisitions/orders" },
      { label: "Receiving", url: "/staff/acquisitions/receiving" },
      { label: "Reports", url: "/staff/reports" },
    ],
  };
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-acquisitions-copilot",
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
    const prompt = buildAcquisitionsCopilotPrompt(inputRedacted);
    const system = prompt.system;
    const user = prompt.user;

    let data: AcquisitionsCopilotResponse;
    let completion: { provider: string; model?: string; usage?: unknown } | null = null;
    let config: { model?: string } | null = null;
    let degraded = false;

    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: responseSchema,
        callType: "acquisitions_copilot",
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
      type: "acquisitions_copilot",
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
      eventType: "ai.acquisitions.copilot.generated",
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
        type: "acquisitions_copilot",
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
    return serverErrorResponse(error, "AI Acquisitions Copilot", req);
  }
}
