import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildEvergreenQuery(rawQuery: string, searchType: string) {
  const q = normalizeWhitespace(rawQuery);
  if (!q) return "#available";

  switch (searchType) {
    case "title":
      return `title: ${q}`;
    case "author":
      return `author: ${q}`;
    case "subject":
      return `subject: ${q}`;
    case "isbn": {
      const cleaned = q.replace(/[^0-9Xx]/g, "");
      return cleaned ? `identifier|isbn:${cleaned}` : `identifier|isbn:${q}`;
    }
    case "tcn":
      return `id:${q}`;
    case "series":
      return `series: ${q}`;
    case "keyword":
    default:
      return q;
  }
}

// Map sort parameter to Evergreen sort options
function buildSortOptions(sort: string | null) {
  switch (sort) {
    case "title":
      return ["titlesort", "asc"];
    case "title_desc":
      return ["titlesort", "desc"];
    case "author":
      return ["authorsort", "asc"];
    case "author_desc":
      return ["authorsort", "desc"];
    case "pubdate":
      return ["pubdate", "desc"];
    case "pubdate_asc":
      return ["pubdate", "asc"];
    case "popularity":
      return ["popularity", "desc"];
    case "relevance":
    default:
      return null; // Use default relevance ranking
  }
}

// Determine format from MARC XML
function extractFormatFromMARC(marcXml: string | null): string {
  if (!marcXml) return "Book";

  const leaderMatch = marcXml.match(/<leader>([^<]+)<\/leader>/);
  if (leaderMatch) {
    const leader = leaderMatch[1];
    const typeCode = leader.charAt(6);
    const bibLevel = leader.charAt(7);

    if (typeCode === "a" && bibLevel === "s") return "Serial";
    if (typeCode === "e" || typeCode === "f") return "Map";
    if (typeCode === "c" || typeCode === "d") return "Music Score";
    if (typeCode === "i") return "Audiobook";
    if (typeCode === "j") return "Music Recording";
    if (typeCode === "g") return "Video";
    if (typeCode === "m") return "eBook";
    if (typeCode === "k") return "Image";
  }

  // Check 007 for more specific formats
  const field007Match = marcXml.match(/<controlfield tag="007">([^<]+)<\/controlfield>/);
  if (field007Match) {
    const f007 = field007Match[1];
    if (f007.startsWith("v")) return "DVD";
    if (f007.startsWith("s")) return "CD";
    if (f007.startsWith("c") && f007.charAt(1) === "r") return "eBook";
  }

  return "Book";
}

// Extract audience from MARC 008 position 22 or 521 field
function extractAudienceFromMARC(marcXml: string | null): string {
  if (!marcXml) return "general";

  // Check 521 field first (Target Audience Note)
  const audienceMatch = marcXml.match(/<datafield tag="521"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>/);
  if (audienceMatch) {
    const audience = audienceMatch[1].toLowerCase();
    if (audience.includes("juvenile") || audience.includes("children") || audience.includes("ages 4") || audience.includes("ages 5") || audience.includes("ages 6") || audience.includes("ages 7") || audience.includes("ages 8")) {
      return "juvenile";
    }
    if (audience.includes("young adult") || audience.includes("teen") || audience.includes("ages 12") || audience.includes("ages 13") || audience.includes("ages 14") || audience.includes("ages 15")) {
      return "young_adult";
    }
  }

  // Check 008 position 22 (Target Audience)
  const controlMatch = marcXml.match(/<controlfield tag="008">([^<]+)<\/controlfield>/);
  if (controlMatch && controlMatch[1].length >= 23) {
    const audienceCode = controlMatch[1].charAt(22);
    switch (audienceCode) {
      case "a": // Preschool
      case "b": // Primary
      case "c": // Pre-adolescent
        return "juvenile";
      case "d": // Adolescent
      case "e": // Adult
        return "young_adult";
      case "j": // Juvenile
        return "juvenile";
    }
  }

  return "general";
}

// Build cover image URL (using Open Library as fallback)
function getCoverUrl(isbn: string | null, bibId: number): string | null {
  if (isbn) {
    const cleanIsbn = isbn.replace(/[^0-9Xx]/g, "");
    if (cleanIsbn) {
      // Open Library covers API
      return `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`;
    }
  }
  // Could add more cover sources here (LibraryThing, Google Books, etc.)
  return null;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action") || "search";
  const query = searchParams.get("q") || "";
  const searchType = searchParams.get("type") || "keyword";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const bibId = searchParams.get("id");
  const sort = searchParams.get("sort");

  // Facet filters
  const formatFilter = searchParams.get("format");
  const audienceFilter = searchParams.get("audience");
  const availableOnly = searchParams.get("available") === "true";
  const languageFilter = searchParams.get("language");

  try {
    // Get a specific bib record
    if (action === "record" && bibId) {
      const requestId = req.headers.get("x-request-id") || null;
      logger.debug(
        { requestId, route: "api.evergreen.catalog", action: "record", bibId },
        "Catalog record fetch"
      );

      const modsResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.biblio.record.mods_slim.retrieve",
        [parseInt(bibId)]
      );

      const mods = modsResponse?.payload?.[0];
      if (!mods || mods.ilsevent) {
        return notFoundResponse("Record not found");
      }

      const marcResponse = await callOpenSRF(
        "open-ils.supercat",
        "open-ils.supercat.record.marcxml.retrieve",
        [parseInt(bibId)]
      );

      const marcXml = marcResponse?.payload?.[0];
      const format = extractFormatFromMARC(typeof marcXml === "string" ? marcXml : null);
      const coverUrl = getCoverUrl(mods.isbn, parseInt(bibId));

      return successResponse({
        record: {
          id: bibId,
          tcn: mods.tcn || `bib${bibId}`,
          title: mods.title || "Unknown Title",
          author: mods.author || "",
          pubdate: mods.pubdate || "",
          publisher: mods.publisher || "",
          isbn: mods.isbn || "",
          edition: mods.edition || "",
          physical_description: mods.physical_description || "",
          format,
          coverUrl,
          marc_xml: typeof marcXml === "string" ? marcXml : null,
        },
      });
    }

    // Get holdings for a bib record
    if (action === "holdings" && bibId) {
      const bibNumeric = parseInt(bibId, 10);
      if (!Number.isFinite(bibNumeric)) {
        return errorResponse("Invalid bib id", 400);
      }

      const holdingsResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.biblio.copy_counts.location.summary.retrieve",
        [bibNumeric, 1, 0]
      );

      const counts = holdingsResponse?.payload?.[0];

      const treeResponse = await callOpenSRF(
        "open-ils.cat",
        "open-ils.cat.asset.copy_tree.global.retrieve",
        [null, bibNumeric]
      );

      const tree = treeResponse?.payload?.[0];
      const volumes = Array.isArray(tree) ? tree : [];

      const copyIds: number[] = [];
      const callNumberByCopyId = new Map<number, string>();

      for (const volume of volumes) {
        const prefix =
          volume?.prefix && typeof volume.prefix === "object"
            ? volume.prefix.label || ""
            : "";
        const suffix =
          volume?.suffix && typeof volume.suffix === "object"
            ? volume.suffix.label || ""
            : "";
        const label = volume?.label || "";
        const callNumber =
          [prefix, label, suffix].filter((v: string) => v).join(" ").trim() ||
          label;

        const copies = Array.isArray(volume?.copies) ? volume.copies : [];
        for (const copy of copies) {
          const idRaw = copy?.id;
          const id = typeof idRaw === "number" ? idRaw : parseInt(String(idRaw || ""), 10);
          if (!Number.isFinite(id)) continue;
          copyIds.push(id);
          callNumberByCopyId.set(id, callNumber);
        }
      }

      if (copyIds.length === 0) {
        return successResponse({ bibId, copyCounts: counts, copies: [], summary: [] });
      }

      const fleshedResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.asset.copy.fleshed.batch.retrieve",
        [copyIds]
      );

      const fleshed = fleshedResponse?.payload?.[0];
      const fleshedCopies = Array.isArray(fleshed) ? fleshed : [];

      const holdings = fleshedCopies.map((copy: any) => {
        const statusObj = copy.status && typeof copy.status === "object" ? copy.status : null;
        const locObj = copy.location && typeof copy.location === "object" ? copy.location : null;
        const circObj =
          copy.circ_lib && typeof copy.circ_lib === "object" ? copy.circ_lib : null;

        const copyId = typeof copy.id === "number" ? copy.id : parseInt(String(copy.id || ""), 10);

        return {
          id: copyId,
          barcode: copy.barcode || "",
          callNumber:
            callNumberByCopyId.get(copyId) ||
            copy.call_number_label ||
            copy.call_number ||
            "",
          status: statusObj?.name || "Unknown",
          statusId: statusObj?.id ?? copy.status,
          location: locObj?.name || "",
          circLib: circObj?.shortname || circObj?.name || "",
          createDate: copy.create_date || "",
          price: copy.price ? parseFloat(copy.price) : 0,
          circCount: copy.total_circ_count ?? copy.circ_count ?? 0,
        };
      });

      return successResponse({ bibId, copyCounts: counts, copies: holdings, summary: [] });
    }

    // Search for bib records
    // Search for bib records - allow empty query for browse    const isEmptySearch = !query || query.trim() === "";

    const requestId = req.headers.get("x-request-id") || null;
    const evergreenQuery = buildEvergreenQuery(query, searchType);
    const sortOptions = buildSortOptions(sort);

    logger.debug(
      {
        requestId,
        route: "api.evergreen.catalog",
        action: "search",
        searchType,
        query: evergreenQuery,
        sort,
        filters: { format: formatFilter, audience: audienceFilter, available: availableOnly },
      },
      "Catalog search"
    );

    // Build search options
    const searchOpts: any = { limit: limit * 2, offset }; // Fetch extra for filtering
    // Add sort if specified - separate sort and sort_dir
    if (sortOptions) {
      const [sortField, sortDir] = sortOptions;
      searchOpts.sort = sortField;
      searchOpts.sort_dir = sortDir;
    }

    const searchResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.multiclass.query",
      [searchOpts, evergreenQuery, 1]
    );

    const results = searchResponse?.payload?.[0];
    const facetCounts = {
      formats: {} as Record<string, number>,
      audiences: {} as Record<string, number>,
      languages: {} as Record<string, number>,
    };

    if (results && results.ids) {
      const bibRecords = [];
      let processedCount = 0;

      for (const idArray of results.ids) {
        if (bibRecords.length >= limit) break;

        const id = Array.isArray(idArray) ? idArray[0] : idArray;

        const modsResponse = await callOpenSRF(
          "open-ils.search",
          "open-ils.search.biblio.record.mods_slim.retrieve",
          [id]
        );

        const mods = modsResponse?.payload?.[0];
        if (!mods || mods.ilsevent) continue;

        // Get MARC for format/audience detection
        let marcXml: string | null = null;
        let format = "Book";
        let audience = "general";

        // Only fetch MARC if we need to filter or for facets
        if (formatFilter || audienceFilter || true) { // Always get for facets
          const marcResponse = await callOpenSRF(
            "open-ils.supercat",
            "open-ils.supercat.record.marcxml.retrieve",
            [id]
          );
          marcXml = marcResponse?.payload?.[0];
          format = extractFormatFromMARC(typeof marcXml === "string" ? marcXml : null);
          audience = extractAudienceFromMARC(typeof marcXml === "string" ? marcXml : null);
        }

        // Update facet counts
        facetCounts.formats[format] = (facetCounts.formats[format] || 0) + 1;
        facetCounts.audiences[audience] = (facetCounts.audiences[audience] || 0) + 1;

        // Apply filters
        if (formatFilter && format.toLowerCase() !== formatFilter.toLowerCase()) {
          continue;
        }
        if (audienceFilter && audience !== audienceFilter) {
          continue;
        }

        // Check availability if required
        const availability = { total: 0, available: 0 };
        if (availableOnly || true) { // Always get availability
          const countsResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.biblio.copy_counts.location.summary.retrieve",
            [id, 1, 0]
          );
          const counts = countsResponse?.payload?.[0];
          if (Array.isArray(counts)) {
            for (const location of counts) {
              // counts structure: [orgId, orgName, callNumber, prefix, location, statusMap]
              // statusMap is at index 5: {"0": availableCount, "7": reshelvingCount, ...}
              if (Array.isArray(location) && location.length > 5) {
                const statusMap = location[5];
                if (statusMap && typeof statusMap === "object") {
                  // Sum all status counts for total
                  for (const count of Object.values(statusMap)) {
                    availability.total += (typeof count === "number" ? count : 0);
                  }
                  // Status ID "0" means Available
                  availability.available += (statusMap["0"] || 0);
                }
              }
            }
          }

          if (availableOnly && availability.available === 0) {
            continue;
          }
        }

        const coverUrl = getCoverUrl(mods.isbn, id);

        bibRecords.push({
          id,
          tcn: mods.tcn || `bib${id}`,
          title: mods.title || "Unknown Title",
          author: mods.author || "Unknown Author",
          pubdate: mods.pubdate || "",
          publisher: mods.publisher || "",
          isbn: mods.isbn || "",
          edition: mods.edition || "",
          physical_description: mods.physical_description || "",
          format,
          audience,
          coverUrl,
          availability,
        });

        processedCount++;
      }

      return successResponse({
        count: results.count || bibRecords.length,
        records: bibRecords,
        facets: facetCounts,
        filters: {
          format: formatFilter,
          audience: audienceFilter,
          available: availableOnly,
          sort,
        },
      });
    }

    return successResponse({ count: 0, records: [], facets: facetCounts });
  } catch (error) {
    return serverErrorResponse(error, "Catalog GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();

    if (action === "create") {
      return errorResponse("Record creation requires MARC XML - use MARC editor", 501);
    }

    return errorResponse("Invalid action", 400);
  } catch (error) {
    return serverErrorResponse(error, "Catalog POST", req);
  }
}
