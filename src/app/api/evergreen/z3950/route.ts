import { NextRequest } from "next/server";
import {
  callOpenSRF,
  requireAuthToken,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getErrorMessage,
  isOpenSRFEvent,
  parseJsonBodyWithSchema,
  getRequestMeta,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const ImportSchema = z
  .object({
    marcxml: z.string().min(1).optional(),
    marcXml: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    auto_tcn: z.boolean().optional(),
    autoTcn: z.boolean().optional(),
  })
  .passthrough()
  .refine((b) => Boolean(b.marcxml) || Boolean(b.marcXml), {
    message: "marcxml is required",
    path: ["marcxml"],
  });

function normalizeServices(payload: any[]) {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload).map(([name, info]) => ({
    name,
    label: (info as any)?.label || name,
    host: (info as any)?.host,
    port: (info as any)?.port,
    db: (info as any)?.db,
    attrs: (info as any)?.attrs || {},
  }));
}

function normalizeResults(payload: any) {
  const results = Array.isArray(payload) ? payload : payload ? [payload] : [];
  return results.map((result: any, idx: number) => {
    const service = result?.service || result?.source || "unknown";
    const records = Array.isArray(result?.records) ? result.records : [];
    const mapped = records.map((record: any, recIndex: number) => {
      const mvr = record?.mvr || {};
      return {
        id: `${service}-${mvr?.tcn || mvr?.doc_id || recIndex}-${idx}`,
        service,
        title: mvr?.title || "Untitled",
        author: mvr?.author || "",
        pubdate: mvr?.pubdate || "",
        isbn: mvr?.isbn || "",
        publisher: mvr?.publisher || "",
        marcxml: record?.marcxml || "",
        raw: record,
      };
    });

    return {
      service,
      count: result?.count || mapped.length,
      records: mapped,
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action") || "search";

    if (action === "services") {
      const servicesResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.z3950.retrieve_services",
        [authtoken]
      );

      const payload = servicesResponse?.payload?.[0];
      if (isOpenSRFEvent(payload) || payload?.ilsevent) {
        return errorResponse(getErrorMessage(payload, "Failed to load Z39.50 services"), 400, payload);
      }

      const services = normalizeServices(payload);

      if (!services.length) {
        return successResponse({ services }, "No Z39.50 services configured");
      }

      return successResponse({ services });
    }

    const query = searchParams.get("q") || "";
    if (!query.trim()) {
      return errorResponse("Search query is required", 400);
    }

    const serviceParam = searchParams.get("service") || "loc";
    const services = serviceParam === "all"
      ? undefined
      : serviceParam.split(",").map((s) => s.trim()).filter(Boolean);

    const searchType = (searchParams.get("type") || "title").toLowerCase();
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const search: Record<string, string> = { [searchType]: query };

    const args: Record<string, any> = {
      service: services || "loc",
      search,
      limit,
      offset,
    };

    const searchResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.z3950.search_class",
      [authtoken, args]
    );

    const payload = searchResponse?.payload?.[0];
    if (isOpenSRFEvent(payload) || payload?.ilsevent) {
      return errorResponse(getErrorMessage(payload, "Z39.50 search failed"), 400, payload);
    }

    const results = normalizeResults(payload);

    return successResponse({
      query,
      results,
      total: results.reduce((sum, res) => sum + (res.count || 0), 0),
    });
  } catch (error) {
    return serverErrorResponse(error, "Z3950 GET", req);
  }
}

/**
 * POST - Import a Z39.50 record directly into Evergreen
 * This is a convenience endpoint that combines Z39.50 search and MARC import
 */
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const body = await parseJsonBodyWithSchema(req, ImportSchema);
    if (body instanceof NextResponse) return body as any;

    const { authtoken, actor } = await requirePermissions(["CREATE_MARC", "IMPORT_MARC"]);

    const marcxml = body.marcxml || body.marcXml;
    if (!marcxml || typeof marcxml !== "string") {
      return errorResponse("marcxml is required", 400);
    }

    const source = body.source || "Z39.50";
    const autoTcn = body.auto_tcn !== false && body.autoTcn !== false;

    // Import the MARC record using Evergreen bib import method
    const response = await callOpenSRF(
      "open-ils.cat",
      "open-ils.cat.biblio.record.xml.import",
      [authtoken, marcxml, source, autoTcn]
    );

    const result = response?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || result?.ilsevent) {
      const message = getErrorMessage(result, "Z39.50 import failed");
      await logAuditEvent({
        action: "z3950.import",
        status: "failure",
        actor,
        ip,
        userAgent,
        requestId,
        details: { source },
        error: message,
      });
      return errorResponse(message, 400, result);
    }

    const recordId = result?.id || result?.__p?.[0];

    await logAuditEvent({
      action: "z3950.import",
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: { recordId, source },
      error: null,
    });

    return successResponse({
      record: {
        id: recordId,
        tcn: result?.tcn_value || result?.tcn || "",
        source: result?.source || source,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "Z3950 POST", req);
  }
}
