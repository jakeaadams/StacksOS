import { NextRequest } from "next/server";
import { callOpenSRF, errorResponse, serverErrorResponse, successResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import { z } from "zod";

// GET /api/opac/public-lists/[listId] - Fetch a public bookbag and its items (no auth)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const listNumeric = parseInt(String(listId || ""), 10);
    if (!Number.isFinite(listNumeric) || listNumeric <= 0) {
      return errorResponse("Invalid list id", 400);
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    // Verify the list is public by scanning the public bookbags.
    let publicBags: Record<string, unknown>[] = [];
    try {
      const searchResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.container.retrieve_by_class.atomic",
        [null, null, "biblio", "pub"]
      );
      publicBags = searchResponse?.payload?.[0] || [];
    } catch (error) {
      logger.info({ error: String(error) }, "Public list detail not available - method not supported");
      return successResponse({ list: null, items: [], message: "Public lists are not available on this Evergreen install." });
    }

    const bag = Array.isArray(publicBags) ? publicBags.find((b: any) => Number(b.id) === listNumeric) : null;
    if (!bag) {
      return errorResponse("List not found", 404);
    }

    const itemsResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.item.retrieve_by_container.atomic",
      [null, listNumeric, { limit }]
    );

    const rawItems = itemsResponse?.payload?.[0];
    const itemsArr = Array.isArray(rawItems) ? rawItems : [];

    const bibIds: number[] = [];
    for (const item of itemsArr) {
      const idRaw = item?.target_biblio_record_entry || item?.record;
      const id = typeof idRaw === "number" ? idRaw : parseInt(String(idRaw ?? ""), 10);
      if (Number.isFinite(id) && id > 0) bibIds.push(id);
    }

    // Fetch bib details for each item (best-effort).
    const bibDetails = await Promise.all(
      bibIds.slice(0, limit).map(async (bibId) => {
        try {
          const bibResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.biblio.record.mods_slim.retrieve",
            [bibId]
          );
          const bib = bibResponse?.payload?.[0];
          return {
            bibId,
            title: bib?.title || "Unknown Title",
            author: bib?.author || "",
            coverUrl: bib?.isbn ? `https://covers.openlibrary.org/b/isbn/${bib.isbn}-M.jpg` : undefined,
            isbn: bib?.isbn || undefined,
          };
        } catch {
          return { bibId, title: "Unknown Title", author: "" };
        }
      })
    );

    return successResponse({
      list: {
        id: bag.id,
        name: bag.name || "Untitled list",
        description: bag.description || "",
        ownerName: bag.owner_name || null,
        createTime: bag.create_time || null,
        editTime: bag.edit_time || null,
      },
      items: bibDetails,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching public list detail");
    return serverErrorResponse(error, "OPAC Public List Detail", req);
  }
}

