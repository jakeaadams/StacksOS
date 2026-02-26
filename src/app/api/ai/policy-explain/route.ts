import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import {
  generateAiJson,
  type PolicyExplainResponse,
  policyExplainResponseSchema,
  promptMetadata,
  redactAiInput,
} from "@/lib/ai";
import { buildPolicyExplainPrompt } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";

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

const requestSchema = z.object({
  action: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).optional(),
  desc: z.string().trim().min(1).optional(),
  overrideEligible: z.boolean().optional(),
  overridePerm: z.string().trim().min(1).optional(),
  orgId: z.number().int().positive().optional(),
  workstation: z.string().trim().min(1).optional(),
  // Keep raw context optional; redact before storing/sending to a model.
  context: z.record(z.string(), z.unknown()).optional(),
});

type PolicyExplainRequest = z.infer<typeof requestSchema>;

function deterministicFallback(input: PolicyExplainRequest): PolicyExplainResponse {
  const parts: string[] = [];
  if (input.action) parts.push(`action: ${input.action}`);
  if (input.code) parts.push(`code: ${input.code}`);
  if (input.desc) parts.push(`description: ${input.desc}`);

  const briefSummary = parts.length > 0 ? parts.join(", ") : "no details provided";

  return {
    explanation: `This circulation event could not be analyzed by AI at this time. The event details are: ${briefSummary}. Please consult your library's circulation policy manual or contact a supervisor for guidance.`,
    nextSteps: [
      "Review the circulation policy manual for the relevant policy code.",
      "Contact a supervisor if the situation requires an immediate override decision.",
    ],
    requiresConfirmation: true,
  };
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-policy-explain",
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

    const prompt = buildPolicyExplainPrompt(inputRedacted);
    const system = prompt.system;
    const user = prompt.user;

    let data: PolicyExplainResponse;
    let completion: { provider: string; model?: string; usage?: unknown } | null = null;
    let config: { model?: string } | null = null;
    let degraded = false;

    try {
      const out = await generateAiJson({
        requestId: requestId || undefined,
        system,
        user,
        schema: policyExplainResponseSchema,
        callType: "policy_explain",
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

      data = deterministicFallback(bodyParsed.data);
      degraded = true;
      completion = { provider: "fallback", model: "deterministic" };
      config = { model: "deterministic" };
    }

    const meta = promptMetadata(system, user);

    const draftId = await createAiDraft({
      type: "policy_explain",
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
        type: "policy_explain",
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
    return serverErrorResponse(error, "AI Policy Explain", req);
  }
}
