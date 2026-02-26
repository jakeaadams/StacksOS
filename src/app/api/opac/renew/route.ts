import { NextRequest } from "next/server";
import { callOpenSRF, successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { z } from "zod";

// POST /api/opac/renew - Renew a single item
const renewPostSchema = z
  .object({
    copyBarcode: z.string().trim().optional(),
    circId: z.coerce.number().int().positive().optional(),
    checkoutId: z.coerce.number().int().positive().optional(),
  })
  .refine((b) => Boolean(b.copyBarcode) || Boolean(b.circId) || Boolean(b.checkoutId), {
    message: "copyBarcode, circId, or checkoutId required",
  });

export async function POST(req: NextRequest) {
  try {
    const { patronToken } = await requirePatronSession();

    const { copyBarcode, circId, checkoutId } = renewPostSchema.parse(await req.json());
    const resolvedCircId = circId ?? checkoutId;

    if (!copyBarcode && !resolvedCircId) {
      return errorResponse("Copy barcode or circulation ID required");
    }

    // Renew by barcode or circ ID
    const renewParams: Record<string, any> = {};
    if (copyBarcode) {
      renewParams.copy_barcode = copyBarcode;
    } else {
      renewParams.circ = resolvedCircId;
    }

    const renewResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.renew", [
      patronToken,
      renewParams,
    ]);

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
    if (error instanceof PatronAuthError) {
      logger.warn({ error: String(error) }, "Route /api/opac/renew auth failed");
      return errorResponse("Authentication required", 401);
    }
    logger.error({ error: String(error) }, "Error renewing item");
    return serverErrorResponse(error, "Failed to renew item", req);
  }
}
