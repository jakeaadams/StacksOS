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

// GET /api/opac/lists/[listId] - Get list details with items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return unauthorizedResponse("Not authenticated");
    }

    // Get the bookbag contents
    const bagResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.flesh",
      [patronToken, "biblio", parseInt(listId)]
    );

    const bag = bagResponse.payload?.[0];
    
    if (!bag || bag.ilsevent) {
      return errorResponse("List not found", 404);
    }

    // Get bib details for each item
    const items = await Promise.all(
      (bag.items || []).map(async (item: any) => {
        try {
          const bibResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.biblio.record.mods_slim.retrieve",
            [item.target_biblio_record_entry]
          );
          
          const bib = bibResponse.payload?.[0];
          
          return {
            id: item.id,
            bibId: item.target_biblio_record_entry,
            title: bib?.title || "Unknown Title",
            author: bib?.author || "",
            coverUrl: bib?.isbn ? `https://covers.openlibrary.org/b/isbn/${bib.isbn}-M.jpg` : undefined,
            dateAdded: item.create_time,
            notes: item.notes || "",
          };
        } catch {
          return {
            id: item.id,
            bibId: item.target_biblio_record_entry,
            title: "Unknown Title",
            author: "",
            dateAdded: item.create_time,
            notes: item.notes || "",
          };
        }
      })
    );

    return successResponse({
      id: bag.id,
      name: bag.name,
      description: bag.description || "",
      visibility: bag.pub === "t" ? "public" : "private",
      itemCount: items.length,
      items,
      createdAt: bag.create_time,
      updatedAt: bag.edit_time || bag.create_time,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching list details");
    return serverErrorResponse(error, "Failed to fetch list details");
  }
}

// PATCH /api/opac/lists/[listId] - Update list
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return unauthorizedResponse("Not authenticated");
    }

    const { name, description, visibility } = await req.json();

    // Update the bookbag
    const updateResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.update",
      [
        patronToken,
        "biblio",
        {
          id: parseInt(listId),
          name: name?.trim(),
          description: description || "",
          pub: visibility === "public" ? "t" : "f",
        },
      ]
    );

    const result = updateResponse.payload?.[0];

    if (result?.ilsevent) {
      return errorResponse(result.textcode || "Failed to update list");
    }

    return successResponse({ success: true, message: "List updated" });
  } catch (error) {
    logger.error({ error: String(error) }, "Error updating list");
    return serverErrorResponse(error, "Failed to update list");
  }
}

// DELETE /api/opac/lists/[listId] - Delete list
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return unauthorizedResponse("Not authenticated");
    }

    // Delete the bookbag
    const deleteResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.full_delete",
      [patronToken, "biblio", parseInt(listId)]
    );

    const result = deleteResponse.payload?.[0];

    if (result?.ilsevent) {
      return errorResponse(result.textcode || "Failed to delete list");
    }

    return successResponse({ success: true, message: "List deleted" });
  } catch (error) {
    logger.error({ error: String(error) }, "Error deleting list");
    return serverErrorResponse(error, "Failed to delete list");
  }
}
