import { NextRequest } from "next/server";
import {
  parseJsonBodyWithSchema,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getErrorMessage,
  isOpenSRFEvent,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { callOpenSRF } from "@/lib/api/client";
import { requirePermissions } from "@/lib/permissions";
import { isDemoDataEnabled } from "@/lib/demo-data";
import { z } from "zod";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get("q") || "";
  const axis = searchParams.get("axis") || searchParams.get("type") || ""; // author, subject, title, etc.
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

  try {
    if (!query) {
      return errorResponse("Query required", 400);
    }

    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);
    const requestId = req.headers.get("x-request-id") || null;

    logger.debug({ requestId, route: "api.evergreen.authority", query, axis }, "Authority search");

    // Use open-ils.search for authority browse
    // The browse method returns authority headings matching the search term
    let response: any;
    try {
      response = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.authority.simple_heading.browse",
        [
          authtoken,
          query,
          axis || null, // authority type filter (author, subject, title, etc.)
          limit, // limit results
          offset, // offset
        ]
      );
    } catch (error: any) {
      // Evergreen installs vary; many don't expose authority browse in OpenSRF.
      // Fall back to searching authority.record_entry via PCrud (no direct DB access required).
      if (
        error &&
        typeof error === "object" &&
        (error as Record<string, any>).code === "OSRF_METHOD_NOT_FOUND"
      ) {
        response = null;
      } else {
        throw error;
      }
    }

    const authorities = response?.payload || [];

    // Transform results to a consistent format
    const results = authorities.map((auth: any, index: number) => {
      // Handle both simple string results and complex objects
      if (typeof auth === "string") {
        return {
          id: index,
          heading: auth,
          type: axis || "unknown",
          linkedBibs: 0,
        };
      }

      return {
        id: auth?.id || index,
        heading: auth?.heading || auth?.main_heading || auth?.value || String(auth),
        type: auth?.type || axis || "unknown",
        see_also: auth?.see_also || [],
        see_from: auth?.see_from || [],
        linkedBibs: typeof auth?.linkedBibs === "number" ? auth.linkedBibs : 0,
      };
    });

    if (results.length > 0) {
      return successResponse({
        count: results.length,
        authorities: results,
        query,
        axis: axis || null,
        warning: null,
        message: null,
      });
    }

    const term = escapeRegex(query);
    const pcrud = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.are.atomic", [
      authtoken,
      {
        deleted: "f",
        "-or": [{ heading: { "~*": term } }, { simple_heading: { "~*": term } }],
      },
      { limit, offset, order_by: { are: "heading" } },
    ]);
    const rows = Array.isArray(pcrud?.payload?.[0])
      ? (pcrud.payload[0] as Record<string, any>[])
      : [];
    const fallback = rows.map((r) => ({
      id: r.id,
      heading: r.heading || r.simple_heading || "",
      type: axis || "main",
      linkedBibs: 0,
    }));

    return successResponse({
      count: fallback.length,
      authorities: fallback,
      query,
      axis: axis || null,
      warning: response
        ? "OpenSRF authority browse returned no results; using authority record search."
        : "Authority browse is not available via OpenSRF on this Evergreen server; using authority record search.",
      message: null,
    });
  } catch (error: any) {
    return serverErrorResponse(error, "Authority GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isDemoDataEnabled()) {
      return errorResponse(
        "Authority demo seeding is disabled. Set STACKSOS_ALLOW_DEMO_DATA=1 only for sandbox environments.",
        403
      );
    }

    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          action: z.enum(["seed"] as const),
          headings: z.array(z.string().trim().min(1).max(255)).min(1).max(25),
        })
        .strict()
    );
    if (body instanceof Response) return body;

    const { authtoken, actor } = await requirePermissions([
      "CREATE_AUTHORITY_RECORD",
      "IMPORT_MARC",
    ]);
    const actorId =
      typeof actor?.id === "number" ? actor.id : parseInt(String(actor?.id ?? ""), 10);
    const owner = Number(actor?.ws_ou ?? actor?.home_ou ?? 1) || 1;

    const created: Array<{ id: number; heading: string }> = [];
    for (const heading of body.headings) {
      // Idempotency: if record_entry already includes this heading, skip create.
      try {
        const exact = `^${escapeRegex(heading)}$`;
        const existing = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.are.atomic", [
          authtoken,
          { deleted: "f", simple_heading: { "~*": exact } },
          { limit: 1 },
        ]);
        const rows = Array.isArray(existing?.payload?.[0])
          ? (existing.payload[0] as Record<string, any>[])
          : [];
        if (rows.length > 0) {
          continue;
        }
      } catch {
        // ignore; proceed with create
      }

      const control = `STACKSOS-DEMO-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const safeHeading = String(heading)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      const marc =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<record xmlns="http://www.loc.gov/MARC21/slim">` +
        `<leader>00000nz  a2200000 a 4500</leader>` +
        `<controlfield tag="001">${control}</controlfield>` +
        `<controlfield tag="008">      ||||||||||||||||||||||||||||||||||</controlfield>` +
        `<datafield tag="040" ind1=" " ind2=" "><subfield code="a">StacksOS</subfield><subfield code="c">StacksOS</subfield></datafield>` +
        `<datafield tag="150" ind1=" " ind2=" "><subfield code="a">${safeHeading}</subfield></datafield>` +
        `</record>`;

      const res = await callOpenSRF("open-ils.cat", "open-ils.cat.authority.record.import", [
        authtoken,
        marc,
        "StacksOS Demo",
      ]);
      const row = res?.payload?.[0];
      if (!row || isOpenSRFEvent(row) || (row as Record<string, any>)?.ilsevent) {
        const msg = getErrorMessage(row, "Failed to import authority record");
        logger.warn({ heading, owner, actorId, msg }, "Authority import failed");
        continue;
      }

      const id =
        typeof (row as Record<string, any>)?.id === "number"
          ? (row as Record<string, any>).id
          : parseInt(String((row as Record<string, any>)?.id ?? ""), 10);
      if (Number.isFinite(id) && id > 0) created.push({ id, heading });
    }

    return successResponse({ created, count: created.length });
  } catch (error: any) {
    return serverErrorResponse(error, "Authority POST", req);
  }
}
