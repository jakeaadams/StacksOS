import { NextRequest } from "next/server";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { listAiDrafts, getAiDraftWithDecisions } from "@/lib/db/ai";

/**
 * Redact sensitive operational fields from draft list responses.
 * Full detail (including ip, user_agent, raw output) is only available
 * in single-draft detail mode, which is already admin-gated.
 */
function redactDraftForList(draft: Record<string, any>): Record<string, any> {
  const { ip, user_agent, output, input_redacted, ...safe } = draft;
  return {
    ...safe,
    // Show presence of output without full content in list view
    hasOutput: output !== null && output !== undefined,
    hasInput: input_redacted !== null && input_redacted !== undefined,
  };
}

export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 60,
    windowMs: 60 * 1000,
    endpoint: "ai-audit",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    // Require admin-level permission — AI audit contains model outputs and actor metadata
    await requirePermissions(["ADMIN_LOGIN"]);

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || undefined;
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const draftId = url.searchParams.get("draftId") || undefined;
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");

    // Single draft detail mode — full detail for admins
    if (draftId) {
      const result = await getAiDraftWithDecisions(draftId);
      if (!result) {
        return errorResponse("Draft not found", 404);
      }
      return successResponse({
        draft: result.draft,
        decisions: result.decisions,
      });
    }

    // List mode with filtering — redact sensitive fields
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;
    const offset = offsetParam ? Math.max(parseInt(offsetParam, 10) || 0, 0) : 0;

    const result = await listAiDrafts({
      type,
      dateFrom,
      dateTo,
      limit,
      offset,
    });

    return successResponse({
      drafts: result.drafts.map(redactDraftForList),
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    return serverErrorResponse(error, "AI Audit", req);
  }
}
