import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  parseJsonBody,
  encodeFieldmapper,
  getErrorMessage,
  isOpenSRFEvent,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/evergreen/items/[id]
 * Update a copy (asset.copy / acp)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_COPY"]);
    const { id } = await params;
    const copyId = parseInt(id, 10);

    if (!Number.isFinite(copyId)) {
      return errorResponse("Invalid copy ID", 400);
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    if (body instanceof Response) return body;

    const barcode =
      body.barcode !== undefined && body.barcode !== null
        ? String(body.barcode).trim()
        : undefined;

    const alertMessageRaw =
      body.alert_message !== undefined
        ? body.alert_message
        : body.alertMessage !== undefined
          ? body.alertMessage
          : undefined;

    const priceRaw = body.price;
    const holdableRaw = body.holdable;
    const circulateRaw = body.circulate;
    const opacVisibleRaw =
      body.opac_visible !== undefined ? body.opac_visible : body.opacVisible !== undefined ? body.opacVisible : undefined;

    if (barcode !== undefined && !barcode) {
      return errorResponse("Barcode cannot be empty", 400);
    }

    const fetchResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.acp", [
      authtoken,
      copyId,
    ]);

    const existing = fetchResponse?.payload?.[0];
    if (!existing || (existing as any)?.ilsevent) {
      return notFoundResponse("Item not found");
    }

    const updateData: Record<string, any> = { ...(existing as any) };

    if (barcode !== undefined) updateData.barcode = barcode;

    if (priceRaw !== undefined) {
      if (priceRaw === null || priceRaw === "") {
        updateData.price = null;
      } else {
        const priceNum = parseFloat(String(priceRaw));
        if (!Number.isFinite(priceNum) || priceNum < 0) {
          return errorResponse("Invalid price", 400);
        }
        updateData.price = priceNum;
      }
    }

    if (holdableRaw !== undefined) updateData.holdable = holdableRaw === true ? "t" : "f";
    if (circulateRaw !== undefined) updateData.circulate = circulateRaw === true ? "t" : "f";
    if (opacVisibleRaw !== undefined) updateData.opac_visible = opacVisibleRaw === true ? "t" : "f";

    if (alertMessageRaw !== undefined) {
      updateData.alert_message =
        alertMessageRaw === null || alertMessageRaw === undefined || String(alertMessageRaw).trim() === ""
          ? null
          : String(alertMessageRaw).trim();
    }

    // Keep required fields intact and record the editing user when possible.
    updateData.id = copyId;
    if ((actor as any)?.id) {
      updateData.editor = (actor as any).id;
    }

    updateData.ischanged = 1;
    const payload: any = encodeFieldmapper("acp", updateData);

    const updateResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.acp", [
      authtoken,
      payload,
    ]);

    const result = updateResponse?.payload?.[0];
    if (isOpenSRFEvent(result) || (result as any)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to update item"), 400, result);
    }

    return successResponse({ updated: true, id: copyId });
  } catch (error) {
    return serverErrorResponse(error, "Items PATCH", req);
  }
}
