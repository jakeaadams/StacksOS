import { NextRequest } from "next/server";
import { callOpenSRF, successResponse, notFoundResponse, serverErrorResponse } from "@/lib/api";
import { logger } from "@/lib/logger";

type CopyCountsSummary = { total: number; available: number };
const AVAILABLE_COPY_STATUS_IDS = new Set(["0", "7"]);

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseCopyDepth(value: string | null, fallback: number): number {
  const parsed = parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(99, parsed));
}

function collectAllowedOrgIds(tree: unknown, scopeOrgId: number, maxDepth: number): Set<number> {
  const allowed = new Set<number>();

  const walk = (node: unknown, depthFromScope: number | null) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, any>;
    const id = typeof record.id === "number" ? record.id : parseInt(String(record.id ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) return;

    const isScopeRoot = id === scopeOrgId;
    const nextDepth = depthFromScope === null ? (isScopeRoot ? 0 : null) : depthFromScope;

    if (nextDepth !== null && nextDepth <= maxDepth) {
      allowed.add(id);
    }

    const children = Array.isArray(record.children) ? record.children : [];
    for (const child of children) {
      const childDepth = nextDepth === null ? null : nextDepth >= maxDepth ? null : nextDepth + 1;
      walk(child, childDepth);
    }
  };

  walk(tree, null);
  return allowed;
}

function parseCopyCountsSummary(raw: unknown): CopyCountsSummary | null {
  let total = 0;
  let available = 0;
  let hasData = false;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, any>;
    const totalRaw = obj.total ?? obj.count ?? obj.copy_count ?? 0;
    const availableRaw = obj.available ?? obj.available_count ?? 0;
    const totalParsed =
      typeof totalRaw === "number" ? totalRaw : parseInt(String(totalRaw ?? ""), 10);
    const availableParsed =
      typeof availableRaw === "number" ? availableRaw : parseInt(String(availableRaw ?? ""), 10);
    if (Number.isFinite(totalParsed)) total += totalParsed;
    if (Number.isFinite(availableParsed)) available += availableParsed;
    hasData = true;
  }

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const obj = entry as Record<string, any>;
        const totalRaw =
          obj.count ?? obj.total ?? obj.copy_count ?? obj.total_count ?? obj.copies ?? 0;
        const availableRaw =
          obj.available ?? obj.available_count ?? obj.count_available ?? obj.avail ?? 0;
        const totalParsed =
          typeof totalRaw === "number" ? totalRaw : parseInt(String(totalRaw ?? ""), 10);
        const availableParsed =
          typeof availableRaw === "number"
            ? availableRaw
            : parseInt(String(availableRaw ?? ""), 10);
        if (Number.isFinite(totalParsed)) total += totalParsed;
        if (Number.isFinite(availableParsed)) available += availableParsed;
        hasData = true;
        continue;
      }

      if (Array.isArray(entry)) {
        let statusMap: Record<string, any> | null = null;
        for (let i = entry.length - 1; i >= 0; i -= 1) {
          const value = entry[i];
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const candidates = Object.values(value as Record<string, any>);
          if (candidates.some((candidate) => typeof candidate === "number")) {
            statusMap = value as Record<string, any>;
            break;
          }
        }

        if (statusMap) {
          let localTotal = 0;
          let localAvailable = 0;
          for (const [statusCode, statusCount] of Object.entries(statusMap)) {
            if (typeof statusCount !== "number") continue;
            localTotal += statusCount;
            if (AVAILABLE_COPY_STATUS_IDS.has(String(statusCode))) {
              localAvailable += statusCount;
            }
          }
          total += localTotal;
          available += localAvailable;
          hasData = true;
        }
      }
    }
  }

  if (!hasData) return null;
  return { total, available };
}

interface CatalogCopy {
  id: number;
  barcode: string;
  call_number: string;
  status: number;
  status_name: string;
  location_name: string;
  circ_lib_name: string;
  circ_lib: number | string;
  holdable: boolean;
  due_date: string | null;
  is_available: boolean;
}

function isOpacVisibleValue(value: unknown): boolean {
  if (value === "f" || value === false || value === 0 || value === "0") return false;
  return true;
}

// GET /api/evergreen/catalog/[id] - Get a specific bib record with full details
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bibId = parseInt(id);

  if (!Number.isFinite(bibId)) {
    return notFoundResponse("Invalid record ID");
  }

  const requestId = req.headers.get("x-request-id") || null;
  const scopeOrgId = parsePositiveInt(req.nextUrl.searchParams.get("scope_org"));
  const copyDepth = parseCopyDepth(req.nextUrl.searchParams.get("copy_depth"), 99);
  const countsScopeOrgId = scopeOrgId || 1;
  const countsDepth = scopeOrgId ? copyDepth : 99;
  logger.debug(
    { requestId, route: "api.evergreen.catalog.id", bibId, scopeOrgId, copyDepth: countsDepth },
    "Catalog record detail fetch"
  );

  try {
    // Fetch MODS data for basic metadata
    const modsResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.record.mods_slim.retrieve",
      [bibId]
    );

    const mods = modsResponse?.payload?.[0];
    if (!mods || mods.ilsevent) {
      return notFoundResponse("Record not found");
    }

    // Fetch MARC XML for detailed metadata
    const marcResponse = await callOpenSRF(
      "open-ils.supercat",
      "open-ils.supercat.record.marcxml.retrieve",
      [bibId]
    );

    const marcXml = marcResponse?.payload?.[0];

    // Parse MARC for additional fields
    let subjects: string[] = [];
    let genres: string[] = [];
    let series = "";
    let summary = "";
    let contents: string[] = [];
    let notes: string[] = [];
    let targetAudience = "";
    let language = "";

    if (typeof marcXml === "string") {
      // Extract 650 (subjects)
      const subjectMatches = marcXml.match(
        /<datafield tag="650"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>[\s\S]*?<\/datafield>/g
      );
      if (subjectMatches) {
        subjects = subjectMatches
          .map((m) => {
            const match = m.match(/<subfield code="a">([^<]+)<\/subfield>/);
            return match ? match[1]!.replace(/\.$/, "") : "";
          })
          .filter(Boolean);
      }

      // Extract 655 (genres)
      const genreMatches = marcXml.match(
        /<datafield tag="655"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>[\s\S]*?<\/datafield>/g
      );
      if (genreMatches) {
        genres = genreMatches
          .map((m) => {
            const match = m.match(/<subfield code="a">([^<]+)<\/subfield>/);
            return match ? match[1]!.replace(/\.$/, "") : "";
          })
          .filter(Boolean);
      }

      // Extract 490/830 (series)
      const seriesMatch = marcXml.match(
        /<datafield tag="(?:490|830)"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>/
      );
      if (seriesMatch) {
        series = seriesMatch[1]!.replace(/[;,.]$/, "").trim();
      }

      // Extract 520 (summary)
      const summaryMatch = marcXml.match(
        /<datafield tag="520"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>/
      );
      if (summaryMatch) {
        summary = summaryMatch[1]!;
      }

      // Extract 505 (contents)
      const contentsMatch = marcXml.match(
        /<datafield tag="505"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>/
      );
      if (contentsMatch) {
        contents = contentsMatch[1]!.split(/\s*--\s*/).filter(Boolean);
      }

      // Extract 500 (notes)
      const noteMatches = marcXml.match(
        /<datafield tag="500"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>[\s\S]*?<\/datafield>/g
      );
      if (noteMatches) {
        notes = noteMatches
          .map((m) => {
            const match = m.match(/<subfield code="a">([^<]+)<\/subfield>/);
            return match ? match[1]! : "";
          })
          .filter(Boolean);
      }

      // Extract 521 (target audience)
      const audienceMatch = marcXml.match(
        /<datafield tag="521"[^>]*>[\s\S]*?<subfield code="a">([^<]+)<\/subfield>/
      );
      if (audienceMatch) {
        targetAudience = audienceMatch[1]!;
      }

      // Extract 008 position 35-37 (language)
      const controlMatch = marcXml.match(/<controlfield tag="008">([^<]+)<\/controlfield>/);
      if (controlMatch && controlMatch[1]!.length >= 38) {
        language = controlMatch[1]!.substring(35, 38);
      }
    }

    // Get copy/holdings counts
    const countsResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.copy_counts.location.summary.retrieve",
      [bibId, countsScopeOrgId, countsDepth]
    );
    const copyCountsRaw = countsResponse?.payload?.[0];

    let allowedOrgIds: Set<number> | null = null;
    if (scopeOrgId) {
      try {
        const orgTreeResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.org_tree.retrieve"
        );
        const orgTree = orgTreeResponse?.payload?.[0];
        allowedOrgIds = collectAllowedOrgIds(orgTree, scopeOrgId, countsDepth);
      } catch {
        allowedOrgIds = null;
      }
    }

    // =========================================================================
    // FETCH ACTUAL COPIES (not just counts) - needed for OPAC display
    // =========================================================================
    const treeResponse = await callOpenSRF(
      "open-ils.cat",
      "open-ils.cat.asset.copy_tree.global.retrieve",
      [null, bibId]
    );

    const tree = treeResponse?.payload?.[0];
    const volumes = Array.isArray(tree) ? tree : [];

    const copyIds: number[] = [];
    const callNumberByCopyId = new Map<number, string>();

    for (const volume of volumes) {
      const prefix =
        volume?.prefix && typeof volume.prefix === "object" ? volume.prefix.label || "" : "";
      const suffix =
        volume?.suffix && typeof volume.suffix === "object" ? volume.suffix.label || "" : "";
      const label = volume?.label || "";
      const callNumber =
        [prefix, label, suffix]
          .filter((v: string) => v)
          .join(" ")
          .trim() || label;

      const copies = Array.isArray(volume?.copies) ? volume.copies : [];
      for (const copy of copies) {
        const idRaw = copy?.id;
        const copyId = typeof idRaw === "number" ? idRaw : parseInt(String(idRaw || ""), 10);
        if (!Number.isFinite(copyId)) continue;
        copyIds.push(copyId);
        callNumberByCopyId.set(copyId, callNumber);
      }
    }

    // Fetch fleshed copy details if we have copies
    let copiesArray: CatalogCopy[] = [];
    if (copyIds.length > 0) {
      const fleshedResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.asset.copy.fleshed.batch.retrieve",
        [copyIds]
      );

      const fleshed = fleshedResponse?.payload?.[0];
      const fleshedCopies = Array.isArray(fleshed) ? fleshed : [];

      copiesArray = fleshedCopies
        .map((copy) => {
          const statusObj = copy.status && typeof copy.status === "object" ? copy.status : null;
          const locObj = copy.location && typeof copy.location === "object" ? copy.location : null;
          const circObj = copy.circ_lib && typeof copy.circ_lib === "object" ? copy.circ_lib : null;
          const copyId =
            typeof copy.id === "number" ? copy.id : parseInt(String(copy.id || ""), 10);
          const copyOpacVisible = isOpacVisibleValue(copy.opac_visible);
          const locationOpacVisible = isOpacVisibleValue(locObj?.opac_visible);
          const statusOpacVisible = isOpacVisibleValue(statusObj?.opac_visible);
          if (!copyOpacVisible || !locationOpacVisible || !statusOpacVisible) {
            return null;
          }

          return {
            id: copyId,
            barcode: copy.barcode || "",
            call_number: callNumberByCopyId.get(copyId) || copy.call_number_label || "",
            status:
              (typeof statusObj?.id === "number"
                ? statusObj.id
                : parseInt(String(copy.status ?? "0"), 10)) || 0,
            status_name: statusObj?.name || "Unknown",
            location_name: locObj?.name || "",
            circ_lib_name: circObj?.shortname || circObj?.name || "",
            circ_lib: circObj?.id || copy.circ_lib,
            holdable: copy.holdable !== "f" && copy.holdable !== false,
            due_date: copy.due_date || null,
            is_available:
              statusObj?.is_available === true ||
              statusObj?.is_available === "t" ||
              statusObj?.name === "Available" ||
              statusObj?.id === 0 ||
              statusObj?.id === 7 ||
              copy.status === 0 ||
              copy.status === 7,
          };
        })
        .filter((copy): copy is CatalogCopy => Boolean(copy));

      if (allowedOrgIds && allowedOrgIds.size > 0) {
        copiesArray = copiesArray.filter((copy) => {
          const orgId =
            typeof copy.circ_lib === "number"
              ? copy.circ_lib
              : parseInt(String(copy.circ_lib ?? ""), 10);
          return Number.isFinite(orgId) && allowedOrgIds.has(orgId);
        });
      }
    }

    const derivedCopyCounts: CopyCountsSummary = {
      total: copiesArray.length,
      available: copiesArray.filter((copy) => copy.is_available).length,
    };
    const parsedCopyCounts = parseCopyCountsSummary(copyCountsRaw);
    const normalizedCopyCounts =
      derivedCopyCounts.total > 0 ? derivedCopyCounts : parsedCopyCounts || derivedCopyCounts;
    const responseCopies = copiesArray.map(({ is_available: _isAvailable, ...copy }) => copy);

    // Determine format from MARC leader and 007
    let format = "Book";
    if (typeof marcXml === "string") {
      const leaderMatch = marcXml.match(/<leader>([^<]+)<\/leader>/);
      if (leaderMatch) {
        const leader = leaderMatch[1];
        const typeCode = leader!.charAt(6);
        const bibLevel = leader!.charAt(7);

        if (typeCode === "a" && bibLevel === "s") format = "Serial";
        else if (typeCode === "e" || typeCode === "f") format = "Map";
        else if (typeCode === "c" || typeCode === "d") format = "Music Score";
        else if (typeCode === "i") format = "Audiobook";
        else if (typeCode === "j") format = "Music Recording";
        else if (typeCode === "g") format = "Video";
        else if (typeCode === "m") format = "Electronic Resource";
        else if (typeCode === "k") format = "Image";
      }

      // Check 007 for more specific formats
      const field007Match = marcXml.match(/<controlfield tag="007">([^<]+)<\/controlfield>/);
      if (field007Match) {
        const f007 = field007Match[1];
        if (f007!.startsWith("v")) format = "DVD/Video";
        else if (f007!.startsWith("s")) format = "CD/Audio";
        else if (f007!.startsWith("c") && f007!.charAt(1) === "r") format = "eBook";
      }
    }

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
        physicalDescription: mods.physical_description || "",
        format,
        language,
        subjects,
        genres,
        series,
        summary,
        contents,
        notes,
        targetAudience,
        copyCounts: {
          total: normalizedCopyCounts.total,
          available: normalizedCopyCounts.available,
        },
        marcXml: typeof marcXml === "string" ? marcXml : null,
      },
      // Add copies array for OPAC display
      copies: responseCopies,
      copy_counts: {
        total: normalizedCopyCounts.total,
        available: normalizedCopyCounts.available,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "Catalog record detail GET", req);
  }
}
