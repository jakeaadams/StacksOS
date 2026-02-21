import { NextRequest } from "next/server";
import { callOpenSRF, successResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import { z } from "zod";

// GET /api/opac/public-lists - List public bookbags (shareable lists)
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    let bookbags: Record<string, unknown>[] = [];
    try {
      const searchResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.container.retrieve_by_class.atomic",
        [null, null, "biblio", "pub"]
      );
      bookbags = searchResponse?.payload?.[0] || [];
    } catch (error: any) {
      logger.info({ error: String(error) }, "Public lists not available - method not supported");
      return successResponse({ lists: [], message: "Public lists are not available on this Evergreen install." });
    }

    const lists = Array.isArray(bookbags)
      ? bookbags.slice(0, limit).map((bag: any) => ({
          id: bag.id,
          name: bag.name || "Untitled list",
          description: bag.description || "",
          ownerName: bag.owner_name || null,
          createTime: bag.create_time || null,
          editTime: bag.edit_time || null,
          itemCount:
            typeof bag.item_count === "number"
              ? bag.item_count
              : typeof bag.items?.length === "number"
                ? bag.items.length
                : null,
        }))
      : [];

    return successResponse({ lists });
  } catch (error: any) {
    logger.error({ error: String(error) }, "Error fetching public lists");
    return successResponse({ lists: [], message: "Unable to fetch public lists" });
  }
}

