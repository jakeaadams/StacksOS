import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { generateAiJson, promptMetadata, redactAiInput } from "@/lib/ai";
import { buildAnalyticsSummaryPrompt } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";

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

const responseSchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(z.string().min(1)).min(1),
  caveats: z.array(z.string().min(1)).optional(),
  drilldowns: z
    .array(
      z.object({
        label: z.string().min(1),
        url: z.string().min(1),
      })
    )
    .min(1),
});

type AnalyticsSummaryRequest = z.infer<typeof requestSchema>;
type AnalyticsSummaryResponse = z.infer<typeof responseSchema>;

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

function buildDeterministicFallbackSummary(
  input: AnalyticsSummaryRequest
): AnalyticsSummaryResponse {
  const checkouts = toNonNegativeInt(input.stats.checkouts_today);
  const checkins = toNonNegativeInt(input.stats.checkins_today);
  const activeHolds = toNonNegativeInt(input.stats.active_holds);
  const overdueItems = toNonNegativeInt(input.stats.overdue_items);
  const finesCollected = toNonNegativeInt(input.stats.fines_collected_today);
  const newPatrons = toNonNegativeInt(input.stats.new_patrons_today);

  const holdsAvailable = toNonNegativeInt(input.holds.available);
  const holdsPending = toNonNegativeInt(input.holds.pending);
  const holdsInTransit = toNonNegativeInt(input.holds.in_transit);
  const holdsTotal = toNonNegativeInt(input.holds.total);

  const highlights: string[] = [];

  if (holdsPending > holdsAvailable) {
    highlights.push(
      `Pending holds (${holdsPending}) exceed available shelf holds (${holdsAvailable}); prioritize pull-list and transit processing.`
    );
  }

  if (overdueItems > Math.max(checkouts, 1) * 0.5) {
    highlights.push(
      `Overdue load is elevated (${overdueItems}); run overdue outreach and queue high-risk accounts for staff follow-up.`
    );
  }

  if (checkins < checkouts && holdsInTransit > 0) {
    highlights.push(
      `Outbound circulation is ahead of returns (${checkouts} vs ${checkins}); in-transit queue (${holdsInTransit}) may need redistribution support.`
    );
  }

  if (newPatrons > 0) {
    highlights.push(
      `New patron registrations (${newPatrons}) are active; ensure onboarding and card-activation workflows stay staffed.`
    );
  }

  if (finesCollected > 0) {
    highlights.push(
      `Fines collected today: ${finesCollected}. Review payment-channel throughput before closing.`
    );
  }

  if (highlights.length === 0) {
    highlights.push("Core circulation and holds indicators are stable for this shift.");
  }

  const caveats: string[] = [
    "AI provider is temporarily unavailable; this is a deterministic fallback generated from live metrics.",
  ];

  if (holdsTotal === 0 && activeHolds > 0) {
    caveats.push("Holds snapshot appears incomplete; verify reports endpoint and org scoping.");
  }

  const summary = `Fallback operations brief for org ${input.orgId}: ${checkouts} checkouts, ${checkins} checkins, ${activeHolds} active holds, ${overdueItems} overdue.`;

  return {
    summary,
    highlights,
    caveats,
    drilldowns: [
      { label: "Circulation Workbench", url: "/staff/circulation" },
      { label: "Holds Queue", url: `/staff/circulation/holds?org=${input.orgId}` },
      { label: "Patron Search", url: "/staff/patrons" },
      { label: "Analytics Reports", url: `/staff/reports?org=${input.orgId}` },
    ],
  };
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-analytics-summary",
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

    const prompt = buildAnalyticsSummaryPrompt(inputRedacted);
    const system = prompt.system;
    const user = prompt.user;

    let data;
    let completion;
    let config;
    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: responseSchema,
        callType: "analytics_summary",
        actorId: actor?.id || null,
        ip,
        userAgent,
        promptTemplateId: prompt.id,
        promptVersion: prompt.version,
      });
      data = out.data;
      completion = out.completion;
      config = out.config;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const errorClass = classifyAiError(msg);

      if (errorClass === "disabled") {
        return errorResponse("AI is disabled for this tenant", 503);
      }
      if (errorClass === "misconfigured") {
        return errorResponse("AI is not configured", 501);
      }
      if (errorClass === "transient") {
        const fallback = buildDeterministicFallbackSummary(parsed.data);

        await logAuditEvent({
          action: "ai.suggestion.created",
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
          details: {
            type: "analytics_summary",
            provider: "fallback",
            reason: "transient_provider_failure",
            error: msg.slice(0, 300),
            degraded: true,
            promptTemplate: prompt.id,
            promptVersion: prompt.version,
          },
        });

        return successResponse({
          draftId: null,
          response: fallback,
          meta: {
            provider: "fallback",
            model: "deterministic",
            usage: null,
            degraded: true,
            reason: "ai_provider_timeout_or_transient_error",
          },
        });
      }
      throw e;
    }

    const meta = promptMetadata(system, user);
    const draftId = await createAiDraft({
      type: "analytics_summary",
      requestId: requestId || undefined,
      actorId: actor?.id,
      provider: completion.provider,
      model: completion.model || config.model,
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

    await logAuditEvent({
      action: "ai.suggestion.created",
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        type: "analytics_summary",
        draftId,
        provider: completion.provider,
        model: completion.model || config.model,
        promptHash: meta.promptHash,
        promptTemplate: prompt.id,
        promptVersion: prompt.version,
      },
    });

    return successResponse({
      draftId,
      response: data,
      meta: {
        provider: completion.provider,
        model: completion.model || config.model,
        usage: completion.usage || null,
        promptHash: meta.promptHash,
        promptTemplate: prompt.id,
        promptVersion: prompt.version,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "AI Analytics Summary", req);
  }
}
