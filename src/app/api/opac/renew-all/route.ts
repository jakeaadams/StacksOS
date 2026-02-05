import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";

// POST /api/opac/renew-all - Renew all eligible items
export async function POST(req: NextRequest) {
  try {
    const { patronToken, patronId } = await requirePatronSession();

    // First, get all current checkouts
    const checkoutsResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.checked_out",
      [patronToken, patronId]
    );

    const checkoutData = checkoutsResponse.payload?.[0] || {};
    const allCircIds = [
      ...(checkoutData.out || []),
      ...(checkoutData.overdue || []),
    ];

    if (allCircIds.length === 0) {
      return successResponse({
        success: true,
        message: "No items to renew",
        results: {
          renewed: [],
          failed: [],
          totalRenewed: 0,
          totalFailed: 0,
        },
      });
    }

    // Get circ details to get copy barcodes
    const circDetailsPromises = allCircIds.map((circId: number) =>
      callOpenSRF("open-ils.circ", "open-ils.circ.retrieve", [
        patronToken,
        circId,
      ])
    );

    const circDetails = await Promise.all(circDetailsPromises);

    // Attempt to renew each item
    const results = {
      renewed: [] as any[],
      failed: [] as any[],
    };

    for (let i = 0; i < circDetails.length; i++) {
      const circ = circDetails[i].payload?.[0];
      if (!circ) continue;

      try {
        // Get copy barcode
        const copyResponse = await callOpenSRF(
          "open-ils.search",
          "open-ils.search.asset.copy.retrieve",
          [circ.target_copy]
        );
        const copy = copyResponse.payload?.[0];
        const barcode = copy?.barcode;

        if (!barcode) {
          results.failed.push({
            circId: circ.id,
            error: "Could not find item barcode",
          });
          continue;
        }

        // Attempt renewal
        const renewResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.renew",
          [patronToken, { copy_barcode: barcode }]
        );

        const result = renewResponse.payload?.[0];

        if (result?.ilsevent) {
          // Renewal failed
          const errorMessages: Record<string, string> = {
            MAX_RENEWALS_REACHED: "Maximum renewals reached",
            COPY_NEEDED_FOR_HOLD: "Needed for hold",
            PATRON_EXCEEDS_FINES: "Fines too high",
            PATRON_EXCEEDS_OVERDUE_COUNT: "Too many overdue items",
          };

          results.failed.push({
            circId: circ.id,
            barcode,
            error: errorMessages[result.textcode] || result.desc || "Renewal failed",
            code: result.textcode,
          });
        } else {
          // Renewal succeeded
          results.renewed.push({
            circId: circ.id,
            barcode,
            newDueDate: result?.circ?.due_date || result?.due_date,
            renewalsRemaining: result?.circ?.renewal_remaining,
          });
        }
      } catch {
        results.failed.push({
          circId: circ.id,
          _error: "Renewal request failed",
        });
      }
    }

    const totalRenewed = results.renewed.length;
    const totalFailed = results.failed.length;

    let message = "";
    if (totalRenewed > 0 && totalFailed === 0) {
      message = `Successfully renewed all ${totalRenewed} item${totalRenewed > 1 ? "s" : ""}`;
    } else if (totalRenewed > 0 && totalFailed > 0) {
      message = `Renewed ${totalRenewed} item${totalRenewed > 1 ? "s" : ""}, ${totalFailed} could not be renewed`;
    } else if (totalRenewed === 0 && totalFailed > 0) {
      message = `Could not renew any items`;
    }

    return successResponse({
      success: totalRenewed > 0,
      message,
      results: {
        ...results,
        totalRenewed,
        totalFailed,
      },
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse(error.message, error.status);
    }
    logger.error({ error: String(error) }, "Error renewing all items");
    return serverErrorResponse(error, "Failed to renew items", req);
  }
}
