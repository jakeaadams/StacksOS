import { NextRequest } from "next/server";
import {
  callOpenSRF,
  getErrorMessage,
  getRequestMeta,
  isOpenSRFEvent,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { checkRateLimit } from "@/lib/rate-limit";

// DELETE /api/opac/lists/[listId]/items/[itemId] - Remove item from list
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string; itemId: string }> }
) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 40,
    windowMs: 5 * 60 * 1000,
    endpoint: "opac-list-remove-item",
  });
  if (!rate.allowed) {
    return errorResponse("Too many list requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { listId, itemId } = await params;
    const listNumeric = Number.parseInt(String(listId || ""), 10);
    const itemNumeric = Number.parseInt(String(itemId || ""), 10);
    if (!Number.isFinite(listNumeric) || listNumeric <= 0) {
      return errorResponse("Invalid list id", 400);
    }
    if (!Number.isFinite(itemNumeric) || itemNumeric <= 0) {
      return errorResponse("Invalid item id", 400);
    }

    const { patronToken } = await requirePatronSession();

    // Remove item from the bookbag
    const deleteResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.item.delete",
      [patronToken, "biblio", itemNumeric]
    );

    const result = deleteResponse.payload?.[0];

    if (!result || isOpenSRFEvent(result) || (result as Record<string, any>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to remove item from list"), 400, result);
    }

    await logAuditEvent({
      action: "opac.list.remove_item",
      entity: "bookbag_item",
      entityId: itemNumeric,
      status: "success",
      actor: null,
      ip,
      userAgent,
      requestId,
      details: {
        listId: listNumeric,
        itemId: itemNumeric,
      },
    });

    return successResponse({ success: true, message: "Item removed from list" });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      logger.warn(
        { error: String(error) },
        "Route /api/opac/lists/[listId]/items/[itemId] auth failed"
      );
      return errorResponse("Authentication required", 401);
    }
    logger.error({ error: String(error) }, "Error removing item from list");
    return serverErrorResponse(error, "Failed to remove item from list", req);
  }
}
