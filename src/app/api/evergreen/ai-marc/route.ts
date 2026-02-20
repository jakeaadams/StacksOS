import { NextRequest } from "next/server";
import { z } from "zod";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { generateAiJson, safeUserText, redactAiInput, promptMetadata } from "@/lib/ai";
import { buildMarcGenerationPrompt } from "@/lib/ai/prompts";
import type { MarcGenInput } from "@/lib/ai/prompts";
import { createAiDraft } from "@/lib/db/ai";

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const marcGenRequestSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  author: z.string().trim().max(300).optional(),
  isbn: z.string().trim().max(20).optional(),
  publisher: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
  format: z
    .enum(["book", "ebook", "audiobook", "dvd", "serial", "music_score", "map"])
    .optional()
    .default("book"),
});

// ---------------------------------------------------------------------------
// Response schema for the AI-generated MARC record
// ---------------------------------------------------------------------------

const marcFieldSchema = z.object({
  tag: z.string().min(3).max(3),
  ind1: z.string().max(1).default(" "),
  ind2: z.string().max(1).default(" "),
  subfields: z.array(
    z.object({
      code: z.string().min(1).max(1),
      value: z.string().min(1),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

const marcGenerationResponseSchema = z.object({
  leader: z.string().min(24).max(24),
  field_008: z.string().min(40).max(40),
  fields: z.array(marcFieldSchema).min(1),
});

// ---------------------------------------------------------------------------
// POST /api/evergreen/ai-marc
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // Require staff cataloging permissions
    const { actor } = await requirePermissions(["CREATE_MARC", "UPDATE_MARC"]);
    const actorId =
      typeof actor?.id === "number" ? actor.id : parseInt(String(actor?.id ?? ""), 10) || undefined;

    const body = await parseJsonBodyWithSchema(req, marcGenRequestSchema);
    if (body instanceof Response) return body;

    const meta = getRequestMeta(req);

    const input: MarcGenInput = {
      title: body.title,
      author: body.author,
      isbn: body.isbn,
      publisher: body.publisher,
      description: body.description,
      format: body.format,
    };

    // Redact PII from input before sending to AI
    const safeInput: MarcGenInput = {
      title: safeUserText(input.title),
      author: input.author ? safeUserText(input.author) : undefined,
      isbn: input.isbn,
      publisher: input.publisher ? safeUserText(input.publisher) : undefined,
      description: input.description ? safeUserText(input.description) : undefined,
      format: input.format,
    };

    const prompt = buildMarcGenerationPrompt(safeInput);

    const { data: marcRecord, completion } = await generateAiJson({
      requestId: meta.requestId || undefined,
      system: prompt.system,
      user: prompt.user,
      schema: marcGenerationResponseSchema,
      callType: "marc_generation",
      actorId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      promptTemplateId: prompt.id,
      promptVersion: prompt.version,
    });

    logger.info(
      {
        route: "api.evergreen.ai-marc",
        title: input.title,
        fieldCount: marcRecord.fields.length,
      },
      "AI MARC record generated"
    );

    // Compute confidence scores per field based on available input
    const fieldsWithConfidence = marcRecord.fields.map((field) => {
      // Override confidence based on how much input data was available
      let computedConfidence = field.confidence;

      // Fields directly derived from provided input get high confidence
      if (field.tag === "245" && input.title) computedConfidence = "high";
      if (field.tag === "100" && input.author) computedConfidence = "high";
      if (field.tag === "020" && input.isbn) computedConfidence = "high";
      if ((field.tag === "260" || field.tag === "264") && input.publisher)
        computedConfidence = "high";

      // Fields inferred from description get medium
      if (field.tag === "520" && input.description) computedConfidence = "high";
      if (field.tag === "520" && !input.description) computedConfidence = "low";

      // Classification and subjects are always medium unless we have rich input
      if (field.tag === "082" || field.tag === "050") {
        computedConfidence = input.description ? "medium" : "low";
      }
      if (field.tag === "650" || field.tag === "655") {
        computedConfidence = input.description ? "medium" : "low";
      }

      return {
        ...field,
        confidence: computedConfidence,
      };
    });

    // Store the draft in ai_drafts for governance/audit
    const redactedInput = redactAiInput(input);
    const pMeta = promptMetadata(prompt.system, prompt.user);

    let draftId: string | null = null;
    try {
      draftId = await createAiDraft({
        type: "marc_generation",
        requestId: meta.requestId || undefined,
        actorId,
        provider: completion.provider,
        model: completion.model,
        promptHash: pMeta.promptHash,
        promptTemplateId: prompt.id,
        promptVersion: prompt.version,
        systemHash: pMeta.systemHash,
        userHash: pMeta.userHash,
        inputRedacted: redactedInput,
        output: {
          leader: marcRecord.leader,
          field_008: marcRecord.field_008,
          fields: fieldsWithConfidence,
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    } catch (err) {
      logger.warn({ err: String(err) }, "Failed to store AI MARC draft (non-fatal)");
    }

    return successResponse({
      draftId,
      leader: marcRecord.leader,
      field_008: marcRecord.field_008,
      fields: fieldsWithConfidence,
      provider: completion.provider,
      model: completion.model,
    });
  } catch (err) {
    logger.error({ route: "api.evergreen.ai-marc", err: String(err) }, "AI MARC generation failed");
    return serverErrorResponse(err, "api.evergreen.ai-marc", req);
  }
}
