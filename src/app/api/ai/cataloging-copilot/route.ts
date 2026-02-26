import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { generateAiJson, promptMetadata, redactAiInput } from "@/lib/ai";
import { buildCatalogingCopilotPrompt } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";
import { publishDeveloperEvent } from "@/lib/developer/webhooks";
import { deterministicFallback, responseSchema, type CatalogingCopilotResponse } from "./fallback";

const requestSchema = z.object({
  marcData: z.object({
    title: z.string().min(1).max(500),
    author: z.string().max(200).optional(),
    isbn: z.string().max(200).optional(),
    publisher: z.string().max(200).optional(),
    existingSubjects: z.array(z.string().min(1).max(200)).max(50).optional(),
    existingClassification: z.string().max(100).optional(),
    physicalDescription: z.string().max(200).optional(),
  }),
  bibId: z.number().int().positive().optional(),
});

type CatalogingCopilotRequest = z.infer<typeof requestSchema>;
type AiErrorClass = "disabled" | "misconfigured" | "transient" | "unknown";

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

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-cataloging-copilot",
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
    const prompt = buildCatalogingCopilotPrompt(inputRedacted);
    const system = prompt.system;
    const user = prompt.user;

    let data: CatalogingCopilotResponse;
    let completion: { provider: string; model?: string; usage?: unknown } | null = null;
    let config: { model?: string } | null = null;
    let degraded = false;

    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: responseSchema,
        callType: "cataloging_copilot",
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
      type: "cataloging_copilot",
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
      eventType: "ai.cataloging.copilot.generated",
      actorId: typeof actor?.id === "number" ? actor.id : null,
      requestId,
      payload: {
        bibId: parsed.data.bibId || null,
        draftId,
        degraded,
        subjectCount: data.subjectSuggestions.length,
        improvementCount: data.metadataImprovements.length,
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
        type: "cataloging_copilot",
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
    return serverErrorResponse(error, "AI Cataloging Copilot", req);
  }
}
