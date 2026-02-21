import { NextRequest } from "next/server";
import {

  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getErrorMessage,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";


/**
 * POST - Booking workflow actions: capture, pickup, return
 */
const bookingActionsPostSchema = z.object({
  action: z.string().trim().min(1),
}).passthrough();

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const body = bookingActionsPostSchema.parse(await req.json());
    const { action } = body;

    if (!action) {
      return errorResponse("Action required", 400);
    }

    const { authtoken, actor } = await requirePermissions(["ADMIN_BOOKING_RESERVATION"]);

    const audit = async (
      status: "success" | "failure",
      details?: Record<string, unknown>,
      error?: string
    ) => {
      await logAuditEvent({
        action: `booking.${action}`,
        status,
        actor,
        ip,
        userAgent,
        requestId,
        details,
        error: error || null,
      });
    };

    if (action === "capture") {
      const { resource_barcode } = body;

      if (!resource_barcode) {
        return errorResponse("resource_barcode required", 400);
      }

      const response = await callOpenSRF(
        "open-ils.booking",
        "open-ils.booking.resources.capture_for_reservation",
        [authtoken, resource_barcode]
      );

      const result = response?.payload?.[0];

      if (result && !result.ilsevent) {
        const reservation = result.reservation || result;
        await audit("success", {
          resource_barcode,
          reservation_id: reservation?.id || null,
        });

        return successResponse({
          captured: true,
          reservation: {
            id: reservation?.id,
            usr: reservation?.usr,
            start_time: reservation?.start_time,
            end_time: reservation?.end_time,
            pickup_lib: reservation?.pickup_lib,
            target_resource_type: reservation?.target_resource_type,
          },
          resource: {
            barcode: resource_barcode,
          },
        });
      }

      const message = getErrorMessage(result, "No reservation found for this resource");
      await audit("failure", { resource_barcode }, message);
      return errorResponse(message, 400);
    }

    if (action === "pickup") {
      const { reservation_id, patron_barcode } = body;

      if (!reservation_id) {
        return errorResponse("reservation_id required", 400);
      }

      const response = await callOpenSRF(
        "open-ils.booking",
        "open-ils.booking.reservations.pickup",
        [authtoken, reservation_id]
      );

      const result = response?.payload?.[0];

      if (result && !result.ilsevent) {
        await audit("success", { reservation_id, patron_barcode });
        return successResponse({
          picked_up: true,
          reservation_id,
          pickup_time: new Date().toISOString(),
        });
      }

      const message = getErrorMessage(result, "Failed to process pickup");
      await audit("failure", { reservation_id, patron_barcode }, message);
      return errorResponse(message, 400);
    }

    if (action === "return") {
      const { resource_barcode } = body;

      if (!resource_barcode) {
        return errorResponse("resource_barcode required", 400);
      }

      const response = await callOpenSRF(
        "open-ils.booking",
        "open-ils.booking.resources.return",
        [authtoken, resource_barcode]
      );

      const result = response?.payload?.[0];

      if (result && !result.ilsevent) {
        await audit("success", { resource_barcode });
        return successResponse({
          returned: true,
          resource_barcode,
          return_time: new Date().toISOString(),
        });
      }

      const message = getErrorMessage(result, "Failed to return resource");
      await audit("failure", { resource_barcode }, message);
      return errorResponse(message, 400);
    }

    if (action === "ready_for_pickup") {
      const { org_id } = body;
      const orgId = org_id || 1;

      const response = await callOpenSRF(
        "open-ils.booking",
        "open-ils.booking.reservations.filtered_id_list",
        [authtoken, { pickup_lib: orgId, capture_time: { "!": null }, pickup_time: null }]
      );

      const reservationIds = response?.payload?.[0];

      if (Array.isArray(reservationIds) && reservationIds.length > 0) {
        const detailsResponse = await callOpenSRF(
          "open-ils.booking",
          "open-ils.booking.reservations.retrieve",
          [authtoken, reservationIds.slice(0, 50)]
        );

        const reservations = detailsResponse?.payload?.[0];

        if (Array.isArray(reservations)) {
          return successResponse({
            reservations: reservations.map((r) => ({
              id: r.id,
              usr: r.usr,
              target_resource: r.target_resource,
              target_resource_type: r.target_resource_type,
              current_resource: r.current_resource,
              start_time: r.start_time,
              end_time: r.end_time,
              capture_time: r.capture_time,
              pickup_lib: r.pickup_lib,
            })),
          });
        }
      }

      return successResponse({ reservations: [] });
    }

    return errorResponse("Invalid action. Use: capture, pickup, return, ready_for_pickup", 400);
  } catch (error) {
    return serverErrorResponse(error, "Booking Actions POST", req);
  }
}
