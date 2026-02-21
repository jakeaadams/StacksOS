import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  isOpenSRFEvent,
  getErrorMessage,
  getRequestMeta,
  parseJsonBodyWithSchema,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateAiJson, safeUserText } from "@/lib/ai";
import { buildSemanticRerankPrompt } from "@/lib/ai/prompts";

const semanticRerankSchema = z.object({
  ranked: z
    .array(
      z.object({
        id: z.number().int().positive(),
        score: z.number().min(0).max(1),
        reason: z.string().min(1),
      })
    )
    .min(1),
});

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
    case "create_date":
      // Evergreen search supports sorting by record-entry create date on many installs.
      // If unsupported, the call will still succeed but the sort may be ignored.
      return ["create_date", "desc"];
    case "title":
    case "title_asc":
      return ["titlesort", "asc"];
    case "title_desc":
      return ["titlesort", "desc"];
    case "author":
    case "author_asc":
      return ["authorsort", "asc"];
    case "author_desc":
      return ["authorsort", "desc"];
    case "pubdate":
    case "date_desc":
      return ["pubdate", "desc"];
    case "pubdate_asc":
    case "date_asc":
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
    const typeCode = leader!.charAt(6);
    const bibLevel = leader!.charAt(7);

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
    if (f007!.startsWith("v")) return "DVD";
    if (f007!.startsWith("s")) return "CD";
    if (f007!.startsWith("c") && f007!.charAt(1) === "r") return "eBook";
  }

  return "Book";
}

// Extract audience from MARC 008 position 22 or 521 field
function extractAudienceFromMARC(marcXml: string | null): string {
  if (!marcXml) return "general";

  // Check 521 field first (Target Audience Note)
  const audienceMatch = marcXml.match(/<datafield tag="521"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>/);
  if (audienceMatch) {
    const audience = audienceMatch[1]!.toLowerCase();
    if (audience.includes("juvenile") || audience.includes("children") || audience.includes("ages 4") || audience.includes("ages 5") || audience.includes("ages 6") || audience.includes("ages 7") || audience.includes("ages 8")) {
      return "juvenile";
    }
    if (audience.includes("young adult") || audience.includes("teen") || audience.includes("ages 12") || audience.includes("ages 13") || audience.includes("ages 14") || audience.includes("ages 15")) {
      return "young_adult";
    }
  }

  // Check 008 position 22 (Target Audience)
  const controlMatch = marcXml.match(/<controlfield tag="008">([^<]+)<\/controlfield>/);
  if (controlMatch && controlMatch[1]!.length >= 23) {
    const audienceCode = controlMatch[1]!.charAt(22);
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

const languageAliases: Record<string, string> = {
  en: "eng",
  eng: "eng",
  english: "eng",
  es: "spa",
  spa: "spa",
  spanish: "spa",
  fr: "fre",
  fra: "fre",
  fre: "fre",
  french: "fre",
  de: "ger",
  deu: "ger",
  ger: "ger",
  german: "ger",
  it: "ita",
  ita: "ita",
  italian: "ita",
  pt: "por",
  por: "por",
  portuguese: "por",
  nl: "dut",
  nld: "dut",
  dut: "dut",
  dutch: "dut",
  ru: "rus",
  rus: "rus",
  russian: "rus",
  zh: "chi",
  zho: "chi",
  chi: "chi",
  chinese: "chi",
  ja: "jpn",
  jpn: "jpn",
  japanese: "jpn",
  ko: "kor",
  kor: "kor",
  korean: "kor",
  ar: "ara",
  ara: "ara",
  arabic: "ara",
  hi: "hin",
  hin: "hin",
  hindi: "hin",
};

function normalizeLanguageFilter(value: string | null): string | null {
  const v = (value || "").trim().toLowerCase();
  if (!v) return null;
  return languageAliases[v] ?? v;
}

function parseMultiParam(value: string | null): string[] {
  const raw = (value || "").trim();
  if (!raw) return [];
  return raw
    .split(/[,\n]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function extractLanguageFromMARC(marcXml: string | null): string | null {
  if (!marcXml) return null;
  const controlMatch = marcXml.match(/<controlfield tag="008">([^<]+)<\/controlfield>/);
  if (controlMatch && controlMatch[1]!.length >= 38) {
    const code = controlMatch[1]!.slice(35, 38).trim().toLowerCase();
    if (code && code !== "|||" && code !== "   ") return code;
  }
  return null;
}

// Build cover image URL (using Open Library as fallback)
function getCoverUrl(isbn: string | null): string | null {
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) break;
      results[current] = await fn(items[current]!, current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function parseCopyCountsLocationSummary(
  raw: unknown,
  locationFilter: number | null
): { total: number; available: number } {
  const availability = { total: 0, available: 0 };
  if (!Array.isArray(raw)) {
    if (raw && typeof raw === "object" && locationFilter === null) {
      const countRaw = (raw as Record<string, unknown>).total ?? (raw as Record<string, unknown>).count ?? (raw as Record<string, unknown>).copy_count ?? 0;
      const availRaw = (raw as Record<string, unknown>).available ?? (raw as Record<string, unknown>).available_count ?? 0;
      const countParsed = typeof countRaw === "number" ? countRaw : parseInt(String(countRaw ?? ""), 10);
      const availParsed = typeof availRaw === "number" ? availRaw : parseInt(String(availRaw ?? ""), 10);
      return {
        total: Number.isFinite(countParsed) ? countParsed : 0,
        available: Number.isFinite(availParsed) ? availParsed : 0,
      };
    }
    return availability;
  }

  for (const entry of raw) {
    let orgId: number | null = null;
    let total: number | null = null;
    let available: number | null = null;

    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const orgRaw = (entry as Record<string, unknown>).org_unit ?? (entry as Record<string, unknown>).orgId ?? (entry as Record<string, unknown>).org_id ?? (entry as Record<string, unknown>).org;
      const orgParsed = typeof orgRaw === "number" ? orgRaw : parseInt(String(orgRaw ?? ""), 10);
      orgId = Number.isFinite(orgParsed) ? orgParsed : null;

      const countRaw =
        (entry as Record<string, unknown>).count ??
        (entry as Record<string, unknown>).total ??
        (entry as Record<string, unknown>).copy_count ??
        (entry as Record<string, unknown>).copies ??
        (entry as Record<string, unknown>).total_count;
      const availRaw =
        (entry as Record<string, unknown>).available ??
        (entry as Record<string, unknown>).available_count ??
        (entry as Record<string, unknown>).avail ??
        (entry as Record<string, unknown>).count_available;

      const countParsed = typeof countRaw === "number" ? countRaw : parseInt(String(countRaw ?? ""), 10);
      const availParsed = typeof availRaw === "number" ? availRaw : parseInt(String(availRaw ?? ""), 10);
      total = Number.isFinite(countParsed) ? countParsed : null;
      available = Number.isFinite(availParsed) ? availParsed : null;
    } else if (Array.isArray(entry)) {
      const orgRaw = entry[0];
      const orgParsed = typeof orgRaw === "number" ? orgRaw : parseInt(String(orgRaw ?? ""), 10);
      orgId = Number.isFinite(orgParsed) ? orgParsed : null;

      let statusMap: Record<string, unknown> | null = null;
      for (let i = entry.length - 1; i >= 0; i -= 1) {
        const v = entry[i];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const values = Object.values(v as Record<string, unknown>);
          if (values.some((x) => typeof x === "number")) {
            statusMap = v as Record<string, unknown>;
            break;
          }
        }
      }

      if (statusMap) {
        let totalCount = 0;
        for (const v of Object.values(statusMap)) {
          if (typeof v === "number") totalCount += v;
        }
        total = totalCount;

        const avail =
          typeof (statusMap as Record<string, unknown>)["0"] === "number"
            ? (statusMap as Record<string, unknown>)["0"] as number
            : typeof (statusMap as Record<string, unknown>)[0] === "number"
              ? (statusMap as Record<string, unknown>)[0] as number
              : 0;
        available = avail;
      }
    }

    if (locationFilter !== null) {
      if (orgId === null || orgId !== locationFilter) continue;
    }

    if (typeof total === "number") availability.total += total;
    if (typeof available === "number") availability.available += available;
  }

  return availability;
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
  const orderDir = (searchParams.get("order") || searchParams.get("sort_dir") || "").toLowerCase();
  const semantic = ["1", "true", "yes"].includes(String(searchParams.get("semantic") || "").toLowerCase());

  // Facet filters
  const formatFilters = parseMultiParam(searchParams.get("format")).map((v) => v.toLowerCase());
  const audienceFilters = parseMultiParam(searchParams.get("audience")).map((v) => v.toLowerCase());
  const availableOnly = searchParams.get("available") === "true";
  const languageFilters = parseMultiParam(searchParams.get("language"))
    .map((v) => normalizeLanguageFilter(v))
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase());
  const locationFilterRaw = searchParams.get("location") || null;
  const locationParsed = locationFilterRaw ? parseInt(locationFilterRaw, 10) : NaN;
  const locationFilter = Number.isFinite(locationParsed) && locationParsed > 0 ? locationParsed : null;
  const pubdateFromRaw = searchParams.get("pubdate_from") || searchParams.get("pubdateFrom") || "";
  const pubdateToRaw = searchParams.get("pubdate_to") || searchParams.get("pubdateTo") || "";
  const pubdateFromParsed = pubdateFromRaw ? parseInt(pubdateFromRaw, 10) : NaN;
  const pubdateToParsed = pubdateToRaw ? parseInt(pubdateToRaw, 10) : NaN;
  const pubdateFrom = Number.isFinite(pubdateFromParsed) ? pubdateFromParsed : null;
  const pubdateTo = Number.isFinite(pubdateToParsed) ? pubdateToParsed : null;

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
      const coverUrl = getCoverUrl(mods.isbn);

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
    // Get copy locations for the Add Item dialog
    if (action === "copy_locations") {
      const locResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.asset.copy_location.retrieve.all",
        []
      );
      const locations = (locResponse?.payload || [])// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Evergreen location data
      .filter((loc) => !loc.ilsevent).map((loc) => ({
        id: loc.id,
        name: loc.name,
        owningLib: loc.owning_lib,
        holdable: loc.holdable === "t",
        opacVisible: loc.opac_visible === "t",
      }));
      return successResponse({ ok: true, locations });
    }

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Evergreen fleshed copy data
      const holdings = fleshedCopies.map((copy) => {
        const statusObj = copy.status && typeof copy.status === "object" ? copy.status : null;
        const locObj = copy.location && typeof copy.location === "object" ? copy.location : null;
        const circObj =
          copy.circ_lib && typeof copy.circ_lib === "object" ? copy.circ_lib : null;

        const copyId = typeof copy.id === "number" ? copy.id : parseInt(String(copy.id || ""), 10);

        const isAvailable =
          statusObj?.is_available === true ||
          statusObj?.is_available === "t" ||
          statusObj?.name === "Available" ||
          statusObj?.id === 0 ||
          copy.status === 0;

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
          isAvailable,
        };
      });

      const summaryMap = new Map<
        string,
        { library: string; location: string; call_number: string; copy_count: number; available_count: number }
      >();
      for (const c of holdings) {
        const library = c.circLib || "—";
        const location = c.location || "—";
        const callNumber = c.callNumber || "—";
        const key = `${library}||${location}||${callNumber}`;
        const existing =
          summaryMap.get(key) || {
            library,
            location,
            call_number: callNumber,
            copy_count: 0,
            available_count: 0,
          };
        existing.copy_count += 1;
        if (c.isAvailable) existing.available_count += 1;
        summaryMap.set(key, existing);
      }

      const summary = Array.from(summaryMap.values()).sort((a, b) => {
        const libCmp = a.library.localeCompare(b.library);
        if (libCmp !== 0) return libCmp;
        const locCmp = a.location.localeCompare(b.location);
        if (locCmp !== 0) return locCmp;
        return a.call_number.localeCompare(b.call_number);
      });

      const copies = holdings.map(({ isAvailable: _isAvailable, ...rest }) => rest);
      return successResponse({ bibId, copyCounts: counts, copies, summary });
    }

    // Search for bib records
    // Search for bib records - allow empty query for browse    const isEmptySearch = !query || query.trim() === "";

    const { ip, userAgent, requestId } = getRequestMeta(req);
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
	        filters: {
	          format: formatFilters,
	          audience: audienceFilters,
	          language: languageFilters,
	          available: availableOnly,
	          location: locationFilter,
	          pubdateFrom,
	          pubdateTo,
	        },
	      },
	      "Catalog search"
	    );

    const hasLocalFilters =
      formatFilters.length > 0 ||
      audienceFilters.length > 0 ||
      languageFilters.length > 0 ||
      availableOnly ||
      locationFilter !== null ||
      pubdateFrom !== null ||
      pubdateTo !== null;

    // Build search options
    // If local facet filters are active, over-fetch from Evergreen and apply our own pagination after filtering.
    const searchOpts: Record<string, unknown> = {
      limit: hasLocalFilters
        ? Math.min(500, Math.max(limit * 10, offset + limit * 5))
        : limit * 2,
      offset: hasLocalFilters ? 0 : offset,
    };
    // Add sort if specified - separate sort and sort_dir
    if (sortOptions) {
      const [sortField, defaultSortDir] = sortOptions;
      let sortDir = defaultSortDir;
      if (orderDir === "asc" || orderDir === "desc") {
        sortDir = orderDir;
      }
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

    if (results && Array.isArray(results.ids)) {
      const candidateIds = results.ids
        .map((idArray: unknown) => (Array.isArray(idArray) ? idArray[0] : idArray))
        .map((id: unknown) => (typeof id === "number" ? id : parseInt(String(id ?? ""), 10)))
        .filter((id: number) => Number.isFinite(id) && id > 0);

      const processed = await mapWithConcurrency(candidateIds, 6, async (id) => {
        try {
          const [modsResponse, marcResponse] = await Promise.all([
            callOpenSRF(
              "open-ils.search",
              "open-ils.search.biblio.record.mods_slim.retrieve",
              [id]
            ),
            callOpenSRF(
              "open-ils.supercat",
              "open-ils.supercat.record.marcxml.retrieve",
              [id]
            ),
          ]);

          const mods = modsResponse?.payload?.[0];
          if (!mods || mods.ilsevent) return null;

          const marcXml = marcResponse?.payload?.[0];
          const marcString = typeof marcXml === "string" ? marcXml : null;

          const format = extractFormatFromMARC(marcString);
          const audience = extractAudienceFromMARC(marcString);
          const language = extractLanguageFromMARC(marcString);

          // Apply filters
          const formatKey = format.toLowerCase();
          const audienceKey = String(audience || "").toLowerCase();
          const languageKey = language ? language.toLowerCase() : null;

          if (formatFilters.length > 0 && !formatFilters.includes(formatKey)) return null;
          if (audienceFilters.length > 0 && !audienceFilters.includes(audienceKey)) return null;
          if (languageFilters.length > 0 && (!languageKey || !languageFilters.includes(languageKey))) return null;

          const pubYear = parseInt(String(mods.pubdate || ""), 10);
          if ((pubdateFrom !== null || pubdateTo !== null) && !Number.isFinite(pubYear)) return null;
          if (pubdateFrom !== null && pubYear < pubdateFrom) return null;
          if (pubdateTo !== null && pubYear > pubdateTo) return null;

          const countsResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.biblio.copy_counts.location.summary.retrieve",
            [id, 1, 0]
          );

          const counts = countsResponse?.payload?.[0];
          const availability = parseCopyCountsLocationSummary(counts, locationFilter);

          if (availableOnly && availability.available === 0) return null;
          if (locationFilter !== null && availability.total === 0) return null;

          const coverUrl = getCoverUrl(mods.isbn);

          return {
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
            language,
            coverUrl,
            availability,
          };
        } catch {
          return null;
        }
      });

      const filtered = processed.filter(Boolean) as Record<string, unknown>[];

      for (const r of filtered) {
        const format = String(r.format || "");
        const audience = String(r.audience || "");
        const language = r.language ? String(r.language) : null;

        if (format) facetCounts.formats[format] = (facetCounts.formats[format] || 0) + 1;
        if (audience) facetCounts.audiences[audience] = (facetCounts.audiences[audience] || 0) + 1;
        if (language) facetCounts.languages[language] = (facetCounts.languages[language] || 0) + 1;
      }

      // Apply pagination after filtering when local filters are active.
      const paged = hasLocalFilters
        ? filtered.slice(offset, offset + limit)
        : filtered.slice(0, limit);

      // Optional semantic rerank (hybrid retrieval): keyword retrieval + AI reranking.
      // This runs only when explicitly requested (semantic=1) to avoid surprising behavior/cost.
      const bibRecords = paged;
      let rankingMode: "keyword" | "hybrid" = "keyword";
      if (semantic && query.trim().length >= 3 && bibRecords.length > 1) {
        const rate = await checkRateLimit(ip || "unknown", {
          maxAttempts: 60,
          windowMs: 5 * 60 * 1000,
          endpoint: "opac-semantic-search",
        });
        if (rate.allowed) {
          try {
            const candidates = bibRecords.slice(0, Math.min(40, bibRecords.length)).map((r) => ({
              id: r.id as number,
              title: r.title as string,
              author: r.author as string | undefined,
              format: r.format as string | undefined,
              audience: r.audience as string | undefined,
              pubdate: r.pubdate as string | undefined,
              publisher: r.publisher as string | undefined,
              isbn: r.isbn as string | undefined,
            }));

            const prompt = buildSemanticRerankPrompt({
              query: safeUserText(query),
              candidates,
            });

            const out = await generateAiJson({
              requestId: requestId || undefined,
              system: prompt.system,
              user: prompt.user,
              schema: semanticRerankSchema,
              callType: "discovery_rerank",
              actorId: null,
              ip,
              userAgent,
              promptTemplateId: prompt.id,
              promptVersion: prompt.version,
            });

            const ranked = Array.isArray((out.data as Record<string, unknown>)?.ranked) ? ((out.data as Record<string, unknown>).ranked as Record<string, unknown>[]) : [];
            const order = new Map<number, { score: number; reason: string }>();
            for (const entry of ranked) {
              if (!entry || typeof entry.id !== "number") continue;
              order.set(entry.id as number, { score: entry.score as number, reason: entry.reason as string });
            }

            if (order.size > 0) {
              rankingMode = "hybrid";
              bibRecords.sort((a, b) => {
                const ra = order.get(a.id as number);
                const rb = order.get(b.id as number);
                if (ra && rb) return rb.score - ra.score;
                if (ra && !rb) return -1;
                if (!ra && rb) return 1;
                return 0;
              });

              for (const r of bibRecords) {
                const meta = order.get(r.id as number);
                if (meta) {
                  (r as Record<string, unknown>).ranking = {
                    mode: "hybrid",
                    semanticScore: meta.score,
                    semanticReason: meta.reason,
                  };
                }
              }
            }
          } catch {
            // Best-effort: fall back to keyword ranking if AI is disabled/misconfigured/fails.
          }
        }
      }

      const resultsCountParsed =
        typeof results.count === "number"
          ? results.count
          : parseInt(String(results.count ?? ""), 10);
      const count =
        hasLocalFilters
          ? filtered.length
          : Number.isFinite(resultsCountParsed)
            ? resultsCountParsed
            : bibRecords.length;

      return successResponse({
        count,
        records: bibRecords,
	        facets: facetCounts,
	        rankingMode,
	        filters: {
	          available: availableOnly,
	          format: formatFilters,
	          audience: audienceFilters,
	          language: languageFilters,
	          location: locationFilter,
	          pubdateFrom,
	          pubdateTo,
	          sort,
	        },
	      });
    }

    return successResponse({ count: 0, records: [], facets: facetCounts });
  } catch (error) {
    return serverErrorResponse(error, "Catalog GET", req);
  }
}

/**
 * Create a new bibliographic record
 * Accepts either MARC XML or a simplified form
 */
export async function POST(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const bodyParsed = await parseJsonBodyWithSchema(
      req,
      z.object({
        action: z.literal("create"),
        marcXml: z.string().min(1).optional(),
        simplified: z
          .object({
            title: z.string().trim().min(1),
            author: z.string().trim().optional(),
            isbn: z.string().trim().optional(),
            publisher: z.string().trim().optional(),
            pubYear: z.string().trim().optional(),
            subjects: z.array(z.string()).optional(),
            format: z.string().trim().optional(),
          })
          .optional(),
      })
        .refine((b) => Boolean(b.marcXml) || Boolean(b.simplified), {
          message: "Either marcXml or simplified form data required",
          path: ["marcXml"],
        })
        .passthrough()
    );
    if (bodyParsed instanceof Response) return bodyParsed;

    const { action, marcXml, simplified } = bodyParsed;

    const { authtoken, actor } = await requirePermissions(["CREATE_BIB_RECORD"]);

    if (action === "create") {
      let finalMarcXml: string;

      if (marcXml) {
        // Use provided MARC XML directly
        finalMarcXml = marcXml;
      } else if (simplified) {
        // Generate MARC XML from simplified form
        const { title, author, isbn, publisher, pubYear, subjects, format } = simplified;

        if (!title) {
          return errorResponse("Title is required", 400);
        }

        // Build minimal MARC21 XML
        finalMarcXml = buildSimpleMarcXml({
          title,
          author,
          isbn,
          publisher,
          pubYear,
          subjects: subjects || [],
          format: format || "book",
        });
      } else {
        return errorResponse("Either marcXml or simplified form data required", 400);
      }

      // Validate MARC XML has required fields
      if (!finalMarcXml.includes("<datafield tag=\"245\"")) {
        return errorResponse("MARC record must include 245 (title) field", 400);
      }

      // Create the record via pcrud
      const createResponse = await callOpenSRF(
        "open-ils.cat",
        "open-ils.cat.biblio.record.xml.create",
        [authtoken, finalMarcXml, 1] // source = 1 (native catalog)
      );

      const result = createResponse?.payload?.[0];

      if (isOpenSRFEvent(result) || result?.ilsevent) {
        const errMsg = getErrorMessage(result, "Failed to create record");
        logger.error({ requestId, result }, errMsg);
        return errorResponse(errMsg, 400, result);
      }

      const recordId = typeof result === "number" ? result : result?.id;

      logger.info({ requestId, recordId, actor: actor?.id }, "Created bibliographic record");

      return successResponse({ 
        id: recordId, 
        message: "Record created successfully" 
      });
    }

    return errorResponse("Invalid action. Use: create", 400);
  } catch (error) {
    return serverErrorResponse(error, "Catalog POST", req);
  }
}

/**
 * Build simple MARC21 XML from form data
 */
function buildSimpleMarcXml(data: {
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  pubYear?: string;
  subjects?: string[];
  format?: string;
}): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  const lines: string[] = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<record xmlns=\"http://www.loc.gov/MARC21/slim\">",
    "  <leader>00000nam a2200000 a 4500</leader>",
  ];

  // 008 - Fixed length data
  const year = data.pubYear || new Date().getFullYear().toString();
  const date008 = new Date().toISOString().slice(2, 8).replace(/-/g, "");
  lines.push(`  <controlfield tag="008">${date008}s${year}    xx            000 0 eng d</controlfield>`);

  // 020 - ISBN
  if (data.isbn) {
    lines.push(`  <datafield tag="020" ind1=" " ind2=" ">`);
    lines.push(`    <subfield code="a">${escape(data.isbn)}</subfield>`);
    lines.push("  </datafield>");
  }

  // 100 - Author
  if (data.author) {
    lines.push(`  <datafield tag="100" ind1="1" ind2=" ">`);
    lines.push(`    <subfield code="a">${escape(data.author)}</subfield>`);
    lines.push("  </datafield>");
  }

  // 245 - Title (required)
  lines.push(`  <datafield tag=\"245\" ind1="${data.author ? "1" : "0"}" ind2="0">`);
  lines.push(`    <subfield code="a">${escape(data.title)}</subfield>`);
  lines.push("  </datafield>");

  // 260/264 - Publication info
  if (data.publisher || data.pubYear) {
    lines.push(`  <datafield tag="264" ind1=" " ind2="1">`);
    if (data.publisher) {
      lines.push(`    <subfield code="b">${escape(data.publisher)}</subfield>`);
    }
    if (data.pubYear) {
      lines.push(`    <subfield code="c">${escape(data.pubYear)}</subfield>`);
    }
    lines.push("  </datafield>");
  }

  // 650 - Subjects
  for (const subject of data.subjects || []) {
    if (subject.trim()) {
      lines.push(`  <datafield tag="650" ind1=" " ind2="0">`);
      lines.push(`    <subfield code="a">${escape(subject.trim())}</subfield>`);
      lines.push("  </datafield>");
    }
  }

  lines.push("</record>");
  return lines.join("\n");
}
