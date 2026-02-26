import { NextRequest } from "next/server";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { listAiDrafts, getAiDraftWithDecisions } from "@/lib/db/ai";

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
    await requirePermissions(["STAFF_LOGIN"]);

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || undefined;
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const draftId = url.searchParams.get("draftId") || undefined;
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");

    // Single draft detail mode
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

    // List mode with filtering
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
      drafts: result.drafts,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    return serverErrorResponse(error, "AI Audit", req);
  }
}
