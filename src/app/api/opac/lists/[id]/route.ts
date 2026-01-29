import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

// DELETE /api/opac/lists/[id] - Delete a list
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return errorResponse("Not authenticated", 401);
    }

    const listId = parseInt(id);
    if (!Number.isFinite(listId)) {
      return errorResponse("Invalid list ID");
    }

    const deleteResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.delete",
      [patronToken, "biblio", listId]
    );

    const result = deleteResponse.payload?.[0];

    if (result?.ilsevent) {
      return errorResponse(result.textcode || "Failed to delete list" );
    }

    return successResponse({ success: true });
  } catch (error) {
    logger.error({ error: String(error) }, "Error deleting list");
    return serverErrorResponse(error, "Failed to delete list");
  }
}

// PATCH /api/opac/lists/[id] - Update a list
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return errorResponse("Not authenticated", 401);
    }

    const listId = parseInt(id);
    if (!Number.isFinite(listId)) {
      return errorResponse("Invalid list ID");
    }

    const { name, description, visibility } = await req.json();

    const updateResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.update",
      [
        patronToken,
        "biblio",
        {
          id: listId,
          name,
          description,
          pub: visibility === "public" ? "t" : "f",
        },
      ]
    );

    const result = updateResponse.payload?.[0];

    if (result?.ilsevent) {
      return errorResponse(result.textcode || "Failed to update list" );
    }

    return successResponse({ success: true });
  } catch (error) {
    logger.error({ error: String(error) }, "Error updating list");
    return serverErrorResponse(error, "Failed to update list");
  }
}

// POST /api/opac/lists/[id] - Add item to list
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return errorResponse("Not authenticated", 401);
    }

    const listId = parseInt(id);
    if (!Number.isFinite(listId)) {
      return errorResponse("Invalid list ID");
    }

    const { bibId, notes } = await req.json();

    if (!bibId) {
      return errorResponse("Bib ID required");
    }

    const addResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.item.create",
      [
        patronToken,
        "biblio",
        {
          bucket: listId,
          target_biblio_record_entry: bibId,
          notes: notes || "",
        },
      ]
    );

    const result = addResponse.payload?.[0];

    if (result?.ilsevent) {
      return errorResponse(result.textcode || "Failed to add item" );
    }

    return successResponse({ 
      success: true,
      itemId: result,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error adding item to list");
    return serverErrorResponse(error, "Failed to add item to list");
  }
}
