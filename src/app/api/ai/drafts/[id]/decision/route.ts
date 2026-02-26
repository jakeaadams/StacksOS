import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { decideAiDraft } from "@/lib/db/ai";

const bodySchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  reason: z.string().trim().max(500).optional(),
  suggestionId: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "ai-draft-decision",
  });
  if (!rate.allowed) {
    return errorResponse("Too many AI requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { id } = await ctx.params;
    if (!id || typeof id !== "string") {
      return errorResponse("draft id required", 400);
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("Invalid request body", 400, parsed.error.flatten());
    }

    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    await decideAiDraft({
      id,
      decision: parsed.data.decision,
      decidedBy: actor?.id,
      reason: parsed.data.reason || null,
      suggestionId: parsed.data.suggestionId || null,
    });

    await logAuditEvent({
      action: `ai.suggestion.${parsed.data.decision}`,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        draftId: id,
        suggestionId: parsed.data.suggestionId || null,
        reason: parsed.data.reason || null,
      },
    });

    return successResponse({ ok: true, draftId: id, decision: parsed.data.decision });
  } catch (error) {
    return serverErrorResponse(error, "AI Draft Decision", req);
  }
}
