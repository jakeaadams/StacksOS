import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

/**
 * OPAC Patron Holds
 * GET /api/opac/holds - Get patron holds
 * POST /api/opac/holds - Place a new hold
 */
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return unauthorizedResponse("Please log in to view holds");
    }

    const sessionResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.session.retrieve",
      [patronToken]
    );

    const user = sessionResponse?.payload?.[0];
    if (!user || user.ilsevent) {
      return unauthorizedResponse("Session expired. Please log in again.");
    }

    // Get holds
    const holdsResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.holds.retrieve",
      [patronToken, user.id]
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
    return serverErrorResponse(error, "OPAC Holds GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return unauthorizedResponse("Please log in to place holds");
    }

    const sessionResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.session.retrieve",
      [patronToken]
    );

    const user = sessionResponse?.payload?.[0];
    if (!user || user.ilsevent) {
      return unauthorizedResponse("Session expired. Please log in again.");
    }

    const { recordId, pickupLocation, holdType = "T" } = await req.json();

    if (!recordId || !pickupLocation) {
      return errorResponse("Record ID and pickup location are required", 400);
    }

    // Place the hold
    const holdResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.holds.create",
      [
        patronToken,
        {
          patronid: user.id,
          pickup_lib: pickupLocation,
          hold_type: holdType,
          target: recordId,
        },
      ]
    );

    const result = holdResponse?.payload?.[0];

    if (result?.ilsevent) {
      // Hold failed
      const errorMsg = result.desc || result.textcode || "Failed to place hold";
      return errorResponse(errorMsg, 400);
    }

    // Success - result should be the hold ID
    return successResponse({
      success: true,
      holdId: result,
      message: "Hold placed successfully",
    });
  } catch (error) {
    return serverErrorResponse(error, "OPAC Holds POST", req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return unauthorizedResponse("Please log in to cancel holds");
    }

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
      return errorResponse(result.desc || "Failed to cancel hold", 400);
    }

    return successResponse({
      success: true,
      message: "Hold cancelled successfully",
    });
  } catch (error) {
    return serverErrorResponse(error, "OPAC Holds DELETE", req);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return unauthorizedResponse("Please log in to modify holds");
    }

    const { holdId, action, suspendUntil } = await req.json();

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
    } else {
      return errorResponse("Invalid action", 400);
    }

    const response = result?.payload?.[0];

    if (response?.ilsevent) {
      return errorResponse(response.desc || "Failed to update hold", 400);
    }

    return successResponse({
      success: true,
      message: `Hold ${action === "suspend" ? "suspended" : "activated"} successfully`,
    });
  } catch (error) {
    return serverErrorResponse(error, "OPAC Holds PATCH", req);
  }
}
