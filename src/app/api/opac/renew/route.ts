import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

// POST /api/opac/renew - Renew a single item
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;
    const patronId = cookieStore.get("patron_id")?.value;

    if (!patronToken || !patronId) {
      return errorResponse("Not authenticated", 401);
    }

    const { copyBarcode, circId } = await req.json();

    if (!copyBarcode && !circId) {
      return errorResponse("Copy barcode or circulation ID required");
    }

    // Renew by barcode or circ ID
    const renewParams: any = {};
    if (copyBarcode) {
      renewParams.copy_barcode = copyBarcode;
    } else {
      renewParams.circ = circId;
    }

    const renewResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.renew",
      [patronToken, renewParams]
    );

    const result = renewResponse.payload?.[0];

    // Check for errors
    if (result?.ilsevent) {
      // Common renewal failure reasons
      const errorMessages: Record<string, string> = {
        MAX_RENEWALS_REACHED: "Maximum renewals reached for this item",
        CIRC_CLAIMS_RETURNED: "This item was marked as claimed returned",
        COPY_IS_MARKED_LOST: "This item is marked as lost",
        COPY_NEEDED_FOR_HOLD: "This item is needed to fill a hold",
        PATRON_EXCEEDS_FINES: "Your fines exceed the renewal limit",
        PATRON_EXCEEDS_OVERDUE_COUNT: "Too many overdue items to renew",
        ITEM_NOT_CATALOGED: "Item not found in catalog",
      };

      const textcode = result.textcode || "UNKNOWN_ERROR";
      const message = errorMessages[textcode] || result.desc || "Renewal failed";

      return errorResponse(message);

    }

    // Success - get new due date
    const newDueDate = result?.circ?.due_date || result?.due_date;

    return successResponse({
      success: true,
      message: "Item renewed successfully",
      newDueDate,
      renewalsRemaining: result?.circ?.renewal_remaining,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error renewing item");
    return serverErrorResponse(error, "Failed to renew item");
  }
}
