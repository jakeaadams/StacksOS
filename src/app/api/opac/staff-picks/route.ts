import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";

interface StaffPick {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
  staffName: string;
  staffBranch: string;
  review?: string;
  recordId: number;
}

// GET /api/opac/staff-picks - Fetch staff picks from public bookbags
// Returns empty array if staff picks are not configured in Evergreen
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10");

    // Try to fetch public bookbags - this may not be available in all Evergreen installs
    let bookbags: any[] = [];
    try {
      const searchResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.container.retrieve_by_class.atomic",
        [null, null, "biblio", "pub"]
      );
      bookbags = searchResponse?.payload?.[0] || [];
    } catch (error) {
      // Method may not exist or may require auth - return empty picks
      logger.info({ error: String(error) }, "Staff picks not available - method not supported or not configured");
      return successResponse({ 
        picks: [], 
        message: "Staff picks not configured. Create public bookbags with staff pick in the name to enable this feature." 
      });
    }

    if (!Array.isArray(bookbags) || bookbags.length === 0) {
      return successResponse({ 
        picks: [], 
        message: "No staff picks configured" 
      });
    }

    // Filter for staff picks bookbags
    const staffPickBags = bookbags.filter((bag: any) => {
      const name = (bag.name || "").toLowerCase();
      return name.includes("staff pick") || name.includes("staff recommendation");
    });

    if (staffPickBags.length === 0) {
      return successResponse({ 
        picks: [], 
        message: "No staff picks bookbags found. Create public bookbags with staff pick in the name." 
      });
    }

    const picks: StaffPick[] = [];
    
    for (const bag of staffPickBags.slice(0, 5)) {
      try {
        const itemsResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.container.item.retrieve_by_container.atomic",
          [null, bag.id, { limit }]
        );

        const items = itemsResponse?.payload?.[0];
        if (!Array.isArray(items)) continue;

        const bagName = bag.name || "Staff Picks";
        const branchMatch = bagName.match(/[-–]\s*(.+)$/);
        const staffBranch = branchMatch ? branchMatch[1].trim() : "Library Staff";

        for (const item of items.slice(0, limit)) {
          const recordId = item.target_biblio_record_entry || item.record;
          if (!recordId) continue;

          try {
            const bibResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.biblio.record.mods_slim.retrieve",
              [recordId]
            );

            const bib = bibResponse?.payload?.[0];
            if (!bib) continue;

            picks.push({
              id: item.id,
              recordId,
              title: bib.title || "Unknown Title",
              author: bib.author || "",
              coverUrl: bib.isbn ? `https://covers.openlibrary.org/b/isbn/${bib.isbn}-M.jpg` : undefined,
              staffName: bag.owner_name || "Library Staff",
              staffBranch,
              review: item.notes || undefined,
            });
          } catch (_error) {
            // Skip individual item _errors
          }
        }
      } catch (_error) {
        // Skip bag _errors
      }
    }

    return successResponse({
      picks: picks.slice(0, limit),
      total: picks.length,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching staff picks");
    // Return empty picks on _error rather than failing
    return successResponse({ 
      picks: [], 
      message: "Unable to fetch staff picks" 
    });
  }
}
