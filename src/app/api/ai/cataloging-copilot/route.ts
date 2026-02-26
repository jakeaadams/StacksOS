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

const requestSchema = z.object({
  marcData: z.object({
    title: z.string().min(1),
    author: z.string().optional(),
    isbn: z.string().optional(),
    publisher: z.string().optional(),
    existingSubjects: z.array(z.string().min(1)).optional(),
    existingClassification: z.string().optional(),
    physicalDescription: z.string().optional(),
  }),
  bibId: z.number().int().positive().optional(),
});

const subjectSuggestionSchema = z.object({
  heading: z.string().min(1),
  source: z.enum(["lcsh", "sears", "fast", "inferred"]),
  confidence: z.enum(["high", "medium", "low"]),
  provenance: z.string().min(1),
});

const metadataImprovementSchema = z.object({
  field: z.string().min(1),
  current: z.string().optional(),
  suggested: z.string().min(1),
  reason: z.string().min(1),
});

const responseSchema = z.object({
  summary: z.string().min(1),
  subjectSuggestions: z.array(subjectSuggestionSchema).min(1).max(10),
  classificationSuggestion: z
    .object({
      ddc: z.string().optional(),
      lcc: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"]),
      provenance: z.string().min(1),
    })
    .optional(),
  metadataImprovements: z.array(metadataImprovementSchema).max(10),
  caveats: z.array(z.string().min(1)).optional(),
});

type CatalogingCopilotRequest = z.infer<typeof requestSchema>;
type CatalogingCopilotResponse = z.infer<typeof responseSchema>;
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

function extractTitleKeywords(title: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "is",
    "it",
    "its",
    "that",
    "this",
    "as",
  ]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

function deterministicFallback(input: CatalogingCopilotRequest): CatalogingCopilotResponse {
  const { marcData, bibId } = input;
  const title = marcData.title || "Untitled";
  const keywords = extractTitleKeywords(title);

  const subjectSuggestions: CatalogingCopilotResponse["subjectSuggestions"] = [];

  // Generate basic LCSH-style headings from title keywords
  if (keywords.length > 0) {
    const primaryHeading = keywords
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" -- ");
    subjectSuggestions.push({
      heading: primaryHeading,
      source: "inferred",
      confidence: "low",
      provenance: "Derived from title keywords (deterministic fallback)",
    });
  }

  if (marcData.author) {
    subjectSuggestions.push({
      heading: `${marcData.author} -- Authorship`,
      source: "inferred",
      confidence: "low",
      provenance: "Derived from author name (deterministic fallback)",
    });
  }

  // Ensure at least one subject suggestion
  if (subjectSuggestions.length === 0) {
    subjectSuggestions.push({
      heading: "General works",
      source: "inferred",
      confidence: "low",
      provenance: "Default heading; insufficient metadata for inference",
    });
  }

  const metadataImprovements: CatalogingCopilotResponse["metadataImprovements"] = [];

  if (!marcData.isbn) {
    metadataImprovements.push({
      field: "020 (ISBN)",
      suggested: "Add ISBN if available from publisher or title page verso",
      reason: "ISBN improves discoverability and deduplication.",
    });
  }

  if (!marcData.publisher) {
    metadataImprovements.push({
      field: "264 (Publication)",
      suggested: "Add publisher name and place of publication",
      reason: "Publication data is required for a complete bibliographic record.",
    });
  }

  if (!marcData.physicalDescription) {
    metadataImprovements.push({
      field: "300 (Physical Description)",
      suggested: "Add pagination and dimensions (e.g., 'xii, 320 pages ; 24 cm')",
      reason: "Physical description helps distinguish editions and formats.",
    });
  }

  if (marcData.existingSubjects && marcData.existingSubjects.length === 0) {
    metadataImprovements.push({
      field: "650 (Subject)",
      suggested: "Add at least 2-3 LCSH subject headings",
      reason: "Subject headings are critical for catalog discovery.",
    });
  }

  const bibLabel = bibId ? ` (bib #${bibId})` : "";

  return {
    summary: `Fallback cataloging copilot analysis for "${title}"${bibLabel}: ${subjectSuggestions.length} subject suggestion(s) and ${metadataImprovements.length} metadata improvement(s) generated deterministically.`,
    subjectSuggestions: subjectSuggestions.slice(0, 10),
    metadataImprovements: metadataImprovements.slice(0, 10),
    caveats: [
      "AI provider was unavailable; these suggestions were generated deterministically from title keywords and metadata presence checks.",
    ],
  };
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
