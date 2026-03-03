import { NextRequest } from "next/server";
import { callOpenSRF, successResponse } from "@/lib/api";
import { payloadFirst } from "@/lib/api/extract-payload";
import { isDemoDataEnabled } from "@/lib/demo-data";
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

const SHOWCASE_NOTES = [
  "A reliable favorite with broad appeal and steady circulation.",
  "Excellent entry point if you are exploring this section for the first time.",
  "Frequently recommended by staff for book groups and community reads.",
  "Strong reader feedback and consistent hold activity.",
  "A standout pick for discovery displays and seasonal promotions.",
  "High re-read and renewal value across patron types.",
];

async function buildShowcaseFallbackPicks(limit: number): Promise<StaffPick[]> {
  const searchResponse = await callOpenSRF(
    "open-ils.search",
    "open-ils.search.biblio.multiclass.query",
    [{ limit: Math.max(limit * 2, 12), sort: ["popularity", "desc"] }, "keyword:*", 1]
  );

  const payload = payloadFirst(searchResponse) as Record<string, any> | null;
  const idsRaw = Array.isArray(payload?.ids) ? payload.ids : [];
  const bibIds = idsRaw
    .map((entry) => (Array.isArray(entry) ? Number(entry[0]) : Number(entry)))
    .filter((id) => Number.isFinite(id) && id > 0)
    .slice(0, Math.max(limit * 2, 12));

  const picks: StaffPick[] = [];
  for (let idx = 0; idx < bibIds.length; idx++) {
    const bibId = bibIds[idx];
    if (!Number.isFinite(bibId) || !bibId) continue;
    try {
      const modsResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.biblio.record.mods_slim.retrieve",
        [bibId]
      );
      const mods = payloadFirst(modsResponse) as Record<string, any> | null;
      if (!mods || mods.ilsevent) continue;
      picks.push({
        id: bibId,
        recordId: bibId,
        title: String(mods.title || "Untitled"),
        author: String(mods.author || ""),
        coverUrl: mods.isbn
          ? `https://covers.openlibrary.org/b/isbn/${mods.isbn}-M.jpg`
          : undefined,
        staffName: "StacksOS Staff",
        staffBranch: "Demo Library",
        review: SHOWCASE_NOTES[idx % SHOWCASE_NOTES.length],
      });
      if (picks.length >= limit) break;
    } catch {
      // best-effort fallback
    }
  }
  return picks;
}

// GET /api/opac/staff-picks - Fetch staff picks from public bookbags
// Returns empty array if staff picks are not configured in Evergreen
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10");

    // Try to fetch public bookbags - this may not be available in all Evergreen installs
    let bookbags: Record<string, any>[] = [];
    try {
      const searchResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.container.retrieve_by_class.atomic",
        [null, null, "biblio", "pub"]
      );
      bookbags = searchResponse?.payload?.[0] || [];
    } catch (error: unknown) {
      // Method may not exist or may require auth.
      // In demo mode, provide deterministic showcase picks from popular records.
      logger.info(
        { error: String(error) },
        "Staff picks not available - method not supported or not configured"
      );
      if (isDemoDataEnabled()) {
        const fallbackPicks = await buildShowcaseFallbackPicks(limit);
        return successResponse({
          picks: fallbackPicks,
          total: fallbackPicks.length,
          source: "demo_fallback",
          message: "Using demo showcase staff picks fallback.",
        });
      }
      return successResponse({
        picks: [],
        message:
          "Staff picks not configured. Create public bookbags with staff pick in the name to enable this feature.",
      });
    }

    if (!Array.isArray(bookbags) || bookbags.length === 0) {
      if (isDemoDataEnabled()) {
        const fallbackPicks = await buildShowcaseFallbackPicks(limit);
        return successResponse({
          picks: fallbackPicks,
          total: fallbackPicks.length,
          source: "demo_fallback",
          message: "Using demo showcase staff picks fallback.",
        });
      }
      return successResponse({
        picks: [],
        message: "No staff picks configured",
      });
    }

    // Filter for staff picks bookbags
    const staffPickBags = bookbags.filter((bag: any) => {
      const name = (bag.name || "").toLowerCase();
      return name.includes("staff pick") || name.includes("staff recommendation");
    });

    if (staffPickBags.length === 0) {
      if (isDemoDataEnabled()) {
        const fallbackPicks = await buildShowcaseFallbackPicks(limit);
        return successResponse({
          picks: fallbackPicks,
          total: fallbackPicks.length,
          source: "demo_fallback",
          message: "Using demo showcase staff picks fallback.",
        });
      }
      return successResponse({
        picks: [],
        message:
          "No staff picks bookbags found. Create public bookbags with staff pick in the name.",
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

        const items = payloadFirst(itemsResponse);
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

            const bib = payloadFirst(bibResponse);
            if (!bib) continue;

            picks.push({
              id: item.id,
              recordId,
              title: bib.title || "Unknown Title",
              author: bib.author || "",
              coverUrl: bib.isbn
                ? `https://covers.openlibrary.org/b/isbn/${bib.isbn}-M.jpg`
                : undefined,
              staffName: bag.owner_name || "Library Staff",
              staffBranch,
              review: item.notes || undefined,
            });
          } catch (_error: unknown) {
            // Skip individual item _errors
          }
        }
      } catch (_error: unknown) {
        // Skip bag _errors
      }
    }

    return successResponse({
      picks: picks.slice(0, limit),
      total: picks.length,
    });
  } catch (error: unknown) {
    logger.error({ error: String(error) }, "Error fetching staff picks");
    // Return empty picks on _error rather than failing
    return successResponse({
      picks: [],
      message: "Unable to fetch staff picks",
    });
  }
}
