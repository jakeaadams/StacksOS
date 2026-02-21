import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { upsertOpacPatronPrefs } from "@/lib/db/opac";

type HoldErrorDetails = {
  code: string;
  nextSteps: string[];
};

function normalizeEventCode(value: unknown): string {
  const raw = typeof value === "string" ? value : value != null ? String(value) : "";
  const code = raw.trim().toUpperCase();
  return code || "HOLD_ERROR";
}

function buildHoldErrorDetails(
  event: any,
  opts?: { action?: "place" | "cancel" | "update" }
): { message: string; details: HoldErrorDetails } {
  const code = normalizeEventCode(event?.textcode || event?.code);
  const desc = typeof event?.desc === "string" ? event.desc.trim() : "";

  const details: HoldErrorDetails = { code, nextSteps: [] };

  const nextSteps = (steps: string[]) => {
    details.nextSteps = steps.filter((s) => typeof s === "string" && s.trim().length > 0);
  };

  switch (code) {
    case "PATRON_EXPIRED":
      nextSteps([
        "Contact the library to renew your card (or update your expiration date).",
        "Try again after your account is renewed.",
      ]);
      return {
        message: "Your library account is expired, so you can’t place holds right now.",
        details,
      };
    case "PATRON_BARRED":
    case "PATRON_BLOCKED":
    case "PATRON_INACTIVE":
      nextSteps([
        "Contact the library to resolve account blocks and confirm your account status.",
        "If you believe this is a mistake, ask staff to review your account permissions/penalties.",
      ]);
      return {
        message: "Your account is currently blocked from placing holds.",
        details,
      };
    case "MAX_HOLDS":
    case "MAX_HOLDS_REACHED":
    case "MAX_HOLDS_FOR_RECORD":
      nextSteps([
        "Cancel an existing hold to free up space, then try again.",
        "If you think your limit is incorrect, contact the library.",
      ]);
      return {
        message: "You’ve reached your hold limit.",
        details,
      };
    case "HOLD_EXISTS":
      nextSteps([
        "Go to My Account → Holds to see your existing hold and its status.",
        "If you want a different pickup location, use “Change pickup” on that hold.",
      ]);
      return {
        message: "You already have a hold on this title.",
        details,
      };
    case "ITEM_NOT_HOLDABLE":
    case "COPY_NOT_HOLDABLE":
    case "HOLD_NOT_ALLOWED":
      nextSteps([
        "Try another format or edition (e.g., eBook vs print).",
        "If you think this item should be holdable, contact the library.",
      ]);
      return {
        message: "This item isn’t eligible for holds.",
        details,
      };
    case "NO_HOLDABLE_COPIES":
    case "NO_HOLDABLE_COPY":
      nextSteps([
        "Try again later, or choose a different edition/format.",
        "If this keeps happening, contact the library for help.",
      ]);
      return {
        message: "No holdable copies are currently available for this title.",
        details,
      };
    case "BAD_PARAMS":
    case "INVALID_REQUEST":
      nextSteps([
        "Refresh the page and try again.",
        "If the problem persists, contact your library’s system administrator.",
      ]);
      return {
        message: "We couldn’t place that hold because the request was invalid.",
        details,
      };
    default: {
      nextSteps([
        "Try again in a moment.",
        "If this continues, contact the library for help.",
      ]);
      const fallback =
        opts?.action === "cancel"
          ? "We couldn’t cancel that hold."
          : opts?.action === "update"
            ? "We couldn’t update that hold."
            : "We couldn’t place that hold.";
      const message = desc || fallback;
      return { message, details };
    }
  }
}

/**
 * OPAC Patron Holds
 * GET /api/opac/holds - Get patron holds
 * POST /api/opac/holds - Place a new hold
 */
export async function GET(req: NextRequest) {
  try {
    const { patronToken, patronId } = await requirePatronSession();

    // Get holds
    const holdsResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.holds.retrieve",
      [patronToken, patronId]
    );

    const holdsData = holdsResponse?.payload?.[0];
    const holds = Array.isArray(holdsData) ? holdsData : [];

    // Get detailed info for each hold
    const detailedHolds = await Promise.all(
      holds.map(async (hold: any) => {
        try {
          let title = "Unknown Title";
          let author = "";
          let isbn = null;
          let recordId = hold.target;

          // Get bib info based on hold type
          if (hold.hold_type === "T") {
            // Title-level hold
            const bibResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.biblio.record.mods_slim.retrieve",
              [hold.target]
            );

            const bib = bibResponse?.payload?.[0];
            if (bib) {
              title = bib.title || "Unknown Title";
              author = bib.author || "";
              isbn = bib.isbn;
            }
          } else if (hold.hold_type === "V") {
            // Volume-level hold
            const volumeResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.asset.call_number.retrieve",
              [hold.target]
            );

            const volume = volumeResponse?.payload?.[0];
            if (volume?.record) {
              recordId = volume.record;
              const bibResponse = await callOpenSRF(
                "open-ils.search",
                "open-ils.search.biblio.record.mods_slim.retrieve",
                [volume.record]
              );

              const bib = bibResponse?.payload?.[0];
              if (bib) {
                title = bib.title || "Unknown Title";
                author = bib.author || "";
                isbn = bib.isbn;
              }
            }
          } else if (hold.hold_type === "C") {
            // Copy-level hold
            const copyResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.asset.copy.retrieve",
              [hold.target]
            );

            const copy = copyResponse?.payload?.[0];
            if (copy?.call_number) {
              const volumeResponse = await callOpenSRF(
                "open-ils.search",
                "open-ils.search.asset.call_number.retrieve",
                [copy.call_number]
              );

              const volume = volumeResponse?.payload?.[0];
              if (volume?.record) {
                recordId = volume.record;
                const bibResponse = await callOpenSRF(
                  "open-ils.search",
                  "open-ils.search.biblio.record.mods_slim.retrieve",
                  [volume.record]
                );

                const bib = bibResponse?.payload?.[0];
                if (bib) {
                  title = bib.title || "Unknown Title";
                  author = bib.author || "";
                  isbn = bib.isbn;
                }
              }
            }
          }

          // Determine hold status
          let status = "pending";
          if (hold.cancel_time) {
            status = "cancelled";
          } else if (hold.fulfillment_time) {
            status = "fulfilled";
          } else if (hold.shelf_time) {
            status = "ready";
          } else if (hold.capture_time) {
            status = "in_transit";
          } else if (hold.frozen === "t" || hold.frozen === true) {
            status = "suspended";
          }

          // Skip holds that are no longer actionable in OPAC.
          if (status === "cancelled" || status === "fulfilled") {
            return null;
          }

          // Get pickup location name
          let pickupLocationName = "Library";
          if (hold.pickup_lib) {
            const orgResponse = await callOpenSRF(
              "open-ils.actor",
              "open-ils.actor.org_unit.retrieve",
              [hold.pickup_lib]
            );
            const org = orgResponse?.payload?.[0];
            if (org) {
              pickupLocationName = org.name || org.shortname || "Library";
            }
          }

          return {
            id: hold.id,
            recordId,
            title,
            author,
            isbn,
            status,
            holdType: hold.hold_type,
            queuePosition: hold.queue_position,
            totalHolds: hold.total_holds,
            requestDate: hold.request_time,
            captureDate: hold.capture_time,
            shelfDate: hold.shelf_time,
            shelfExpireDate: hold.shelf_expire_time,
            expireDate: hold.expire_time,
            pickupLocation: hold.pickup_lib,
            pickupLocationName,
            isSuspended: hold.frozen === "t" || hold.frozen === true,
            suspendUntil: hold.thaw_date,
            notesForPatron: hold.hold_notes?.filter((n: any) => n.pub === "t") || [],
          };
        } catch (error) {
          logger.error({ error: String(error) }, "Error fetching hold details");
          return null;
        }
      })
    );

    const validHolds = detailedHolds.filter(Boolean);

    return successResponse({
      holds: validHolds,
      total: validHolds.length,
      readyCount: validHolds.filter((h: any) => h.status === "ready").length,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      console.error("Route /api/opac/holds GET auth failed:", error);
      return unauthorizedResponse();
    }
    return serverErrorResponse(error, "OPAC Holds GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { patronToken, patronId } = await requirePatronSession();

    const { recordId, pickupLocation, holdType = "T" } = await req.json();

    if (!recordId || !pickupLocation) {
      return errorResponse("Record ID and pickup location are required", 400);
    }

    const pickupId = typeof pickupLocation === "number" ? pickupLocation : parseInt(String(pickupLocation), 10);
    if (!Number.isFinite(pickupId) || pickupId <= 0) {
      return errorResponse("Invalid pickup location", 400);
    }

    // Place the hold
    const holdResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.holds.create",
      [
        patronToken,
        {
          patronid: patronId,
          pickup_lib: pickupId,
          hold_type: holdType,
          target: recordId,
        },
      ]
    );

    const result = holdResponse?.payload?.[0];

    if (result?.ilsevent) {
      // Hold failed
      const mapped = buildHoldErrorDetails(result, { action: "place" });
      return errorResponse(mapped.message, 400, mapped.details);
    }

    // Success - result should be the hold ID
    try {
      await upsertOpacPatronPrefs(patronId, { defaultPickupLocation: pickupId });
    } catch {
      // Preference write must never break the request path.
    }

    return successResponse({
      success: true,
      holdId: result,
      message: "Hold placed successfully",
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      console.error("Route /api/opac/holds POST auth failed:", error);
      return unauthorizedResponse();
    }
    return serverErrorResponse(error, "OPAC Holds POST", req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { patronToken } = await requirePatronSession();

    const { holdId } = await req.json();

    if (!holdId) {
      return errorResponse("Hold ID is required", 400);
    }

    // Cancel the hold
    const cancelResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.hold.cancel",
      [patronToken, holdId, 6] // 6 = patron requested cancellation
    );

    const result = cancelResponse?.payload?.[0];

    if (result?.ilsevent) {
      const mapped = buildHoldErrorDetails(result, { action: "cancel" });
      return errorResponse(mapped.message || "Failed to cancel hold", 400, mapped.details);
    }

    return successResponse({
      success: true,
      message: "Hold cancelled successfully",
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      console.error("Route /api/opac/holds DELETE auth failed:", error);
      return unauthorizedResponse();
    }
    return serverErrorResponse(error, "OPAC Holds DELETE", req);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { patronToken, patronId } = await requirePatronSession();

    const { holdId, action, suspendUntil, pickupLocation } = await req.json();

    if (!holdId || !action) {
      return errorResponse("Hold ID and action are required", 400);
    }

    let result;

    if (action === "suspend") {
      // Suspend/freeze the hold
      result = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.hold.update",
        [patronToken, { id: holdId, frozen: "t", thaw_date: suspendUntil || null }]
      );
    } else if (action === "activate") {
      // Activate/thaw the hold
      result = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.hold.update",
        [patronToken, { id: holdId, frozen: "f", thaw_date: null }]
      );
    } else if (action === "change_pickup") {
      const pickupId = typeof pickupLocation === "number" ? pickupLocation : parseInt(String(pickupLocation ?? ""), 10);
      if (!Number.isFinite(pickupId) || pickupId <= 0) {
        return errorResponse("pickupLocation is required", 400);
      }
      result = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.hold.update",
        [patronToken, { id: holdId, pickup_lib: pickupId }]
      );

      try {
        await upsertOpacPatronPrefs(patronId, { defaultPickupLocation: pickupId });
      } catch {
        // Ignore preference write errors.
      }
    } else {
      return errorResponse("Invalid action", 400);
    }

    const response = result?.payload?.[0];

    if (response?.ilsevent) {
      const mapped = buildHoldErrorDetails(response, { action: "update" });
      return errorResponse(mapped.message || "Failed to update hold", 400, mapped.details);
    }

    return successResponse({
      success: true,
      message:
        action === "suspend"
          ? "Hold suspended successfully"
          : action === "activate"
            ? "Hold activated successfully"
            : "Hold updated successfully",
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      console.error("Route /api/opac/holds PATCH auth failed:", error);
      return unauthorizedResponse();
    }
    return serverErrorResponse(error, "OPAC Holds PATCH", req);
  }
}
