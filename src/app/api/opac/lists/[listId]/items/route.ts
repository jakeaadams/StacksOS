import { NextRequest } from "next/server";
import {
  callOpenSRF,
  encodeFieldmapper,
  errorResponse,
  getErrorMessage,
  isOpenSRFEvent,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";

// POST /api/opac/lists/[listId]/items - Add an item to a list (bookbag)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { patronToken } = await requirePatronSession();
    const { listId } = await params;

    const listNumeric = parseInt(String(listId || ""), 10);
    if (!Number.isFinite(listNumeric) || listNumeric <= 0) {
      return errorResponse("Invalid list id", 400);
    }

    const body = await req.json().catch(() => ({}));
    const bibIdRaw = (body as any)?.bibId;
    const bibId = typeof bibIdRaw === "number" ? bibIdRaw : parseInt(String(bibIdRaw ?? ""), 10);
    if (!Number.isFinite(bibId) || bibId <= 0) {
      return errorResponse("bibId is required", 400);
    }

    const notes = typeof (body as any)?.notes === "string" ? String((body as any).notes) : "";

    const addRes = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.item.create",
      [
        patronToken,
        "biblio",
        encodeFieldmapper("cbrebi", {
          bucket: listNumeric,
          target_biblio_record_entry: bibId,
          notes,
          isnew: 1,
          ischanged: 1,
        }),
      ]
    );

    const result = addRes?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || (result as any)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to add item to list"), 400, result);
    }

    return successResponse({ itemId: result });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse(error.message, error.status);
    }
    return serverErrorResponse(error, "OPAC Lists Add Item", req);
  }
}

