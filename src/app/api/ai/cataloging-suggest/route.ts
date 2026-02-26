import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import {
  catalogingSuggestResponseSchema,
  type CatalogingSuggestResponse,
  generateAiJson,
  promptMetadata,
  redactAiInput,
} from "@/lib/ai";
import { buildCatalogingSuggestPrompt } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";

const requestSchema = z.object({
  recordId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).optional(),
  author: z.string().trim().min(1).optional(),
  isbn: z.string().trim().min(6).optional(),
  marcXml: z.string().trim().min(1).optional(),
  allowExternalLookups: z.boolean().optional().default(false),
});

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

function deterministicFallback(): CatalogingSuggestResponse {
  return {
    suggestions: [],
  };
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-cataloging-suggest",
  });
  if (!rate.allowed) {
    return errorResponse("Too many AI requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const bodyParsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!bodyParsed.success) {
      return errorResponse("Invalid request body", 400, bodyParsed.error.flatten());
    }

    const inputRedacted = redactAiInput(bodyParsed.data);

    const prompt = buildCatalogingSuggestPrompt(inputRedacted);
    const system = prompt.system;
    const user = prompt.user;

    let data: CatalogingSuggestResponse;
    let completion: { provider: string; model?: string; usage?: unknown } | null = null;
    let config: { model?: string } | null = null;
    let degraded = false;

    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: catalogingSuggestResponseSchema,
        callType: "cataloging_suggest",
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
      if (errorClass === "disabled") return errorResponse("AI is disabled for this tenant", 503);
      if (errorClass === "misconfigured") return errorResponse("AI is not configured", 501);
      if (errorClass !== "transient") throw e;

      data = deterministicFallback();
      degraded = true;
      completion = { provider: "fallback", model: "deterministic" };
      config = { model: "deterministic" };
    }

    const meta = promptMetadata(system, user);

    const draftId = await createAiDraft({
      type: "cataloging_suggest",
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

    await logAuditEvent({
      action: "ai.suggestion.created",
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        type: "cataloging_suggest",
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
        promptHash: meta.promptHash,
        promptTemplate: prompt.id,
        promptVersion: prompt.version,
        degraded,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "AI Cataloging Suggest", req);
  }
}
