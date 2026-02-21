import { NextRequest } from "next/server";
import {
  callOpenSRF,
  encodeFieldmapper,
  errorResponse,
  getErrorMessage,
  isOpenSRFEvent,
  parseJsonBodyWithSchema,
  requireAuthToken,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

function toString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export async function GET(_req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.ccm.atomic", [
      authtoken,
      { code: { "!=": null } },
      { order_by: { ccm: "code" }, limit: 500 },
    ]);

    const rows = Array.isArray(response?.payload?.[0]) ? (response.payload[0] as Record<string, unknown>[]) : [];
    const modifiers = rows
      .map((row) => ({
        code: toString(row?.code).trim(),
        name: toString(row?.name || row?.code).trim(),
        description: toString(row?.description || "").trim(),
        sip2MediaType: toString(row?.sip2_media_type || "").trim(),
        magneticMedia: row?.magnetic_media === true || row?.magnetic_media === "t",
        avgWaitTime: row?.avg_wait_time ?? null,
      }))
      .filter((m) => m.code.length > 0);

    return successResponse({ modifiers });
  } catch (error) {
    return serverErrorResponse(error, "Circ modifiers GET", _req);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          code: z.string().trim().min(1).max(64),
          name: z.string().trim().min(1).max(255),
          description: z.string().trim().min(1).max(1000),
          sip2MediaType: z.string().trim().min(1).max(255).optional(),
          magneticMedia: z.boolean().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const { authtoken } = await requirePermissions(["ADMIN_CIRC_MOD"]);

    // If it already exists, treat as success (seed scripts should be idempotent).
    try {
      const existing = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.ccm", [authtoken, body.code]);
      const row = existing?.payload?.[0];
      if (row && !isOpenSRFEvent(row) && !(row as Record<string, unknown>)?.ilsevent) {
        return successResponse({ created: false, code: body.code });
      }
    } catch {
      // ignore and try to create
    }

    const payload: unknown = encodeFieldmapper("ccm", {
      code: body.code,
      name: body.name,
      description: body.description,
      sip2_media_type: body.sip2MediaType || "book",
      magnetic_media: body.magneticMedia === true ? "t" : "f",
      isnew: 1,
      ischanged: 1,
    });

    const createResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.ccm", [authtoken, payload]);
    const resultRow = createResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to create circ modifier"), 400, resultRow);
    }

    return successResponse({ created: true, code: body.code });
  } catch (error) {
    return serverErrorResponse(error, "Circ modifiers POST", req);
  }
}
