import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

// DELETE /api/opac/lists/[listId]/items/[itemId] - Remove item from list
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string; itemId: string }> }
) {
  try {
    const { listId, itemId } = await params;
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return unauthorizedResponse("Not authenticated");
    }

    // Remove item from the bookbag
    const deleteResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.item.delete",
      [patronToken, "biblio", parseInt(itemId)]
    );

    const result = deleteResponse.payload?.[0];

    if (result?.ilsevent) {
      return errorResponse(result.textcode || "Failed to remove item");
    }

    return successResponse({ success: true, message: "Item removed from list" });
  } catch (error) {
    logger.error({ error: String(error) }, "Error removing item from list");
    return serverErrorResponse(error, "Failed to remove item from list");
  }
}
