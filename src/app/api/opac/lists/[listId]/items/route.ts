import { NextRequest } from "next/server";
import {
  callOpenSRF,
  encodeFieldmapper,
  errorResponse,
  getErrorMessage,
  getRequestMeta,
  isOpenSRFEvent,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

// POST /api/opac/lists/[listId]/items - Add an item to a list (bookbag)
const addListItemSchema = z
  .object({
    recordId: z.coerce.number().int().positive().optional(),
    bibId: z.coerce.number().int().positive().optional(),
  })
  .passthrough();

export async function POST(req: NextRequest, { params }: { params: Promise<{ listId: string }> }) {
  const { ip } = getRequestMeta(req);

  try {
    const { patronToken } = await requirePatronSession();
    const { listId } = await params;

    const listNumeric = parseInt(String(listId || ""), 10);
    if (!Number.isFinite(listNumeric) || listNumeric <= 0) {
      return errorResponse("Invalid list id", 400);
    }

    const body = addListItemSchema.parse(await req.json().catch(() => ({})));
    const bibIdRaw = (body as Record<string, any>)?.bibId;
    const bibId = typeof bibIdRaw === "number" ? bibIdRaw : parseInt(String(bibIdRaw ?? ""), 10);
    if (!Number.isFinite(bibId) || bibId <= 0) {
      return errorResponse("bibId is required", 400);
    }

    const notes =
      typeof (body as Record<string, any>)?.notes === "string"
        ? String((body as Record<string, any>).notes)
        : "";

    const addRes = await callOpenSRF("open-ils.actor", "open-ils.actor.container.item.create", [
      patronToken,
      "biblio",
      encodeFieldmapper("cbrebi", {
        bucket: listNumeric,
        target_biblio_record_entry: bibId,
        notes,
        isnew: 1,
        ischanged: 1,
      }),
    ]);

    const result = addRes?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || (result as Record<string, any>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to add item to list"), 400, result);
    }

    await logAuditEvent({
      action: "opac.list.add_item",
      entity: "bookbag_item",
      entityId: result,
      status: "success",
      actor: null,
      ip,
      details: { listId: listNumeric, bibId },
    });

    return successResponse({ itemId: result });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      logger.warn({ error: String(error) }, "Route /api/opac/lists/[listId]/items auth failed");
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(error, "OPAC Lists Add Item", req);
  }
}
