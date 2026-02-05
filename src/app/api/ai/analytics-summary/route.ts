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
      if (msg.toLowerCase().includes("ai is disabled")) {
        return errorResponse("AI is disabled for this tenant", 503);
      }
      if (msg.toLowerCase().includes("not configured") || msg.toLowerCase().includes("misconfigured")) {
        return errorResponse("AI is not configured", 501);
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
