import { NextRequest } from "next/server";
import {

  callOpenSRF,
  requireAuthToken,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getErrorMessage,
  getRequestMeta,
} from "@/lib/api";

import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action") || "";
  const authtoken = await requireAuthToken();

  try {
    if (action === "resources") {
      const resourcesResponse = await callOpenSRF(
        "open-ils.booking",
        "open-ils.booking.resources.filtered_id_list",
        [authtoken, { owner: 1 }]
      );

      const resourceIds = resourcesResponse?.payload?.[0];

      if (Array.isArray(resourceIds) && resourceIds.length > 0) {
        const detailsResponse = await callOpenSRF(
          "open-ils.booking",
          "open-ils.booking.resources.retrieve",
          [authtoken, resourceIds]
        );

        const resources = detailsResponse?.payload?.[0];

        if (Array.isArray(resources)) {
          return successResponse({
            resources: resources.map((r: any) => ({
              id: r.id,
              barcode: r.barcode,
              type: r.type,
              owner: r.owner,
              overbook: r.overbook,
            })),
          });
        }
      }

      return successResponse({ resources: [] }, "No bookable resources found");
    }

    if (action === "resource_types") {
      // Booking resource type retrieval is not wired yet (requires pcrud/cstore
      // access patterns). Avoid returning 500s until we implement it.
      return successResponse({ types: [] }, "No resource types configured");
    }

    if (action === "reservations") {
      const reservationsResponse = await callOpenSRF(
        "open-ils.booking",
        "open-ils.booking.reservations.filtered_id_list",
        [authtoken, { pickup_lib: 1 }]
      );

      const reservationIds = reservationsResponse?.payload?.[0];

      if (Array.isArray(reservationIds) && reservationIds.length > 0) {
        const detailsResponse = await callOpenSRF(
          "open-ils.booking",
          "open-ils.booking.reservations.retrieve",
          [authtoken, reservationIds.slice(0, 50)]
        );

        const reservations = detailsResponse?.payload?.[0];

        if (Array.isArray(reservations)) {
          return successResponse({
            reservations: reservations.map((r: any) => ({
              id: r.id,
              usr: r.usr,
              target_resource: r.target_resource,
              target_resource_type: r.target_resource_type,
              current_resource: r.current_resource,
              start_time: r.start_time,
              end_time: r.end_time,
              pickup_time: r.pickup_time,
              return_time: r.return_time,
              capture_time: r.capture_time,
              cancel_time: r.cancel_time,
              pickup_lib: r.pickup_lib,
            })),
          });
        }
      }

      return successResponse({ reservations: [] });
    }

    return errorResponse("Invalid action. Use: resources, resource_types, reservations", 400);
  } catch (error) {
    return serverErrorResponse(error, "Booking GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return errorResponse("Action required", 400);
    }

    const { authtoken, actor } = await requirePermissions(["ADMIN_BOOKING_RESERVATION"]);

    const audit = async (status: "success" | "failure", details?: Record<string, any>, error?: string) => {
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

    if (action === "create") {
      const { patron_barcode, resource_id, start_time, end_time, pickup_lib } = body;

      const response = await callOpenSRF("open-ils.booking", "open-ils.booking.reservations.create", [
        authtoken,
        patron_barcode,
        [resource_id],
        start_time,
        end_time,
        pickup_lib || 1,
        null,
      ]);

      const result = response?.payload?.[0];

      if (result && !result.ilsevent) {
        await audit("success", { patron_barcode, resource_id, start_time, end_time, pickup_lib: pickup_lib || 1, reservation_id: result?.id || null });
        return successResponse({ reservation: result });
      }

      const message = getErrorMessage(result, "Failed to create reservation");
      await audit("failure", { patron_barcode, resource_id, start_time, end_time, pickup_lib: pickup_lib || 1 }, message);
      return errorResponse(message, 400);
    }

    if (action === "cancel") {
      const { reservation_id } = body;

      const response = await callOpenSRF("open-ils.booking", "open-ils.booking.reservations.cancel", [
        authtoken,
        [reservation_id],
      ]);

      const result = response?.payload?.[0];

      if (result && !result.ilsevent) {
        await audit("success", { reservation_id });
        return successResponse({ result });
      }

      const message = getErrorMessage(result, "Failed to cancel reservation");
      await audit("failure", { reservation_id }, message);
      return errorResponse(message, 400);
    }

    if (action === "capture") {
      const { resource_barcode } = body;

      const response = await callOpenSRF(
        "open-ils.booking",
        "open-ils.booking.resources.capture_for_reservation",
        [authtoken, resource_barcode]
      );

      const result = response?.payload?.[0];

      if (result && !result.ilsevent) {
        await audit("success", { resource_barcode });
        return successResponse({ result });
      }

      const message = getErrorMessage(result, "Failed to capture resource");
      await audit("failure", { resource_barcode }, message);
      return errorResponse(message, 400);
    }

    if (action === "pickup") {
      const { reservation_id } = body;

      const response = await callOpenSRF("open-ils.booking", "open-ils.booking.reservations.pickup", [
        authtoken,
        reservation_id,
      ]);

      const result = response?.payload?.[0];

      if (result && !result.ilsevent) {
        await audit("success", { reservation_id });
        return successResponse({ result });
      }

      const message = getErrorMessage(result, "Failed to pickup reservation");
      await audit("failure", { reservation_id }, message);
      return errorResponse(message, 400);
    }

    if (action === "return") {
      const { resource_barcode } = body;

      const response = await callOpenSRF("open-ils.booking", "open-ils.booking.resources.return", [
        authtoken,
        resource_barcode,
      ]);

      const result = response?.payload?.[0];

      if (result && !result.ilsevent) {
        await audit("success", { resource_barcode });
        return successResponse({ result });
      }

      const message = getErrorMessage(result, "Failed to return resource");
      await audit("failure", { resource_barcode }, message);
      return errorResponse(message, 400);
    }

    return errorResponse("Invalid action", 400);
  } catch (error) {
    return serverErrorResponse(error, "Booking POST", req);
  }
}
