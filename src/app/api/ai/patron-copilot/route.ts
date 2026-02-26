import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { generateAiJson, promptMetadata, redactAiInput } from "@/lib/ai";
import { buildPatronCopilotPrompt } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";
import { publishDeveloperEvent } from "@/lib/developer/webhooks";

const requestSchema = z.object({
  patronId: z.number().int().positive(),
  checkoutsCount: z.number().int().min(0),
  holdsCount: z.number().int().min(0),
  overdueCount: z.number().int().min(0),
  balanceOwed: z.number().min(0),
  alertCount: z.number().int().min(0),
  active: z.boolean(),
  barred: z.boolean(),
  profileGroup: z.string().optional(),
});

const guidanceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
  impact: z.enum(["high", "medium", "low"]),
  steps: z.array(z.string().min(1)).min(1).max(6),
  deepLink: z.string().min(1),
});

const responseSchema = z.object({
  summary: z.string().min(1),
  riskFactors: z.array(z.string().min(1)).max(6),
  guidance: z.array(guidanceSchema).min(1).max(6),
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

type PatronCopilotRequest = z.infer<typeof requestSchema>;
type PatronCopilotResponse = z.infer<typeof responseSchema>;
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

function deterministicFallback(input: PatronCopilotRequest): PatronCopilotResponse {
  const overdueCount = toNonNegativeInt(input.overdueCount);
  const balanceOwed = typeof input.balanceOwed === "number" ? input.balanceOwed : 0;
  const alertCount = toNonNegativeInt(input.alertCount);
  const holdsCount = toNonNegativeInt(input.holdsCount);
  const checkoutsCount = toNonNegativeInt(input.checkoutsCount);

  const riskFactors: string[] = [];
  const guidance: PatronCopilotResponse["guidance"] = [];

  if (input.barred) {
    riskFactors.push("Patron is barred. Resolve the underlying block before proceeding.");
    guidance.push({
      id: "resolve-barred",
      title: "Resolve barred status",
      why: "Barred patrons cannot checkout or place holds until the block is resolved.",
      impact: "high",
      steps: [
        "Review standing penalties and blocks on the patron record.",
        "Determine the cause of the bar (outstanding fines, lost items, etc.).",
        "Remove the bar if conditions are met per library policy.",
      ],
      deepLink: `/staff/patrons/${input.patronId}`,
    });
  }

  if (!input.active) {
    riskFactors.push("Patron account is inactive.");
    guidance.push({
      id: "reactivate-account",
      title: "Review inactive account",
      why: "Inactive accounts cannot be used for circulation until reactivated.",
      impact: "high",
      steps: [
        "Verify patron identity and confirm reactivation request.",
        "Check for expired library card or unresolved issues.",
        "Reactivate the account via the Edit dialog.",
      ],
      deepLink: `/staff/patrons/${input.patronId}`,
    });
  }

  if (overdueCount > 0) {
    riskFactors.push(`${overdueCount} overdue items need follow-up.`);
    guidance.push({
      id: "overdue-followup",
      title: "Address overdue items",
      why: "Resolving overdue items prevents further fines and improves collection availability.",
      impact: overdueCount > 5 ? "high" : "medium",
      steps: [
        "Review overdue items in the patron's checkout list.",
        "Contact patron about outstanding items if needed.",
        "Process returns or renewals as appropriate.",
      ],
      deepLink: `/staff/patrons/${input.patronId}`,
    });
  }

  if (balanceOwed > 0) {
    riskFactors.push(`Outstanding balance of $${balanceOwed.toFixed(2)}.`);
    guidance.push({
      id: "balance-review",
      title: "Review outstanding balance",
      why: "Outstanding balances may block circulation privileges depending on policy.",
      impact: balanceOwed > 25 ? "high" : "medium",
      steps: [
        "Open the patron's bills and review outstanding charges.",
        "Collect payment or apply waivers as appropriate.",
        "Verify circulation privileges are restored after payment.",
      ],
      deepLink: `/staff/circulation/bills?patron=${input.patronId}`,
    });
  }

  if (alertCount > 0) {
    riskFactors.push(`${alertCount} active alerts/penalties on this account.`);
  }

  if (riskFactors.length === 0) {
    riskFactors.push("No risk factors detected. Patron account is in good standing.");
    guidance.push({
      id: "standard-service",
      title: "Proceed with standard service",
      why: "Patron has no outstanding issues; standard workflows apply.",
      impact: "low",
      steps: [
        "Assist the patron with their request (checkout, hold, etc.).",
        `${checkoutsCount} active checkouts and ${holdsCount} active holds on file.`,
        "No special handling required.",
      ],
      deepLink: `/staff/patrons/${input.patronId}`,
    });
  }

  return {
    summary: `Fallback patron guidance for patron #${input.patronId}: ${checkoutsCount} checkouts, ${holdsCount} holds, ${overdueCount} overdue, $${balanceOwed.toFixed(2)} owed.`,
    riskFactors: riskFactors.slice(0, 6),
    guidance: guidance.slice(0, 6),
    caveats: [
      "AI provider was unavailable; this guidance was generated deterministically from patron summary data.",
    ],
    drilldowns: [
      { label: "Patron Detail", url: `/staff/patrons/${input.patronId}` },
      { label: "Checkout", url: `/staff/circulation/checkout` },
      { label: "Bills", url: `/staff/circulation/bills` },
      { label: "Holds", url: `/staff/circulation/holds-management` },
    ],
  };
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-patron-copilot",
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
    const prompt = buildPatronCopilotPrompt(inputRedacted);
    const system = prompt.system;
    const user = prompt.user;

    let data: PatronCopilotResponse;
    let completion: { provider: string; model?: string; usage?: unknown } | null = null;
    let config: { model?: string } | null = null;
    let degraded = false;

    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: responseSchema,
        callType: "patron_copilot",
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
      type: "patron_copilot",
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
      eventType: "ai.patron.copilot.generated",
      actorId: typeof actor?.id === "number" ? actor.id : null,
      requestId,
      payload: {
        patronId: parsed.data.patronId,
        draftId,
        degraded,
        guidanceCount: data.guidance.length,
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
        type: "patron_copilot",
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
    return serverErrorResponse(error, "AI Patron Copilot", req);
  }
}
