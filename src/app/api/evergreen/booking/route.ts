import { NextRequest } from "next/server";
import {
  callOpenSRF,
  encodeFieldmapper,
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
      const { actor } = await requirePermissions(["STAFF_LOGIN"]);
      const ownerParam = searchParams.get("owner") || searchParams.get("org_id");
      const owner =
        (ownerParam ? parseInt(ownerParam, 10) : NaN) ||
        Number((actor as any)?.ws_ou ?? (actor as any)?.home_ou ?? 1) ||
        1;
      // Prefer PCrud over open-ils.booking helpers: PCrud returns stable results
      // even when booking helper methods are unavailable or partially configured.
      const pcrud = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.brsrc.atomic", [
        authtoken,
        { owner },
        { limit: 50, order_by: { brsrc: "id DESC" } },
      ]);
      const rows = Array.isArray(pcrud?.payload?.[0]) ? (pcrud.payload[0] as any[]) : [];
      if (rows.length > 0) {
        return successResponse({
          resources: rows.map((r: any) => ({
            id: r.id,
            barcode: r.barcode ?? null,
            type: typeof r.type === "object" ? r.type.id : r.type,
            owner: typeof r.owner === "object" ? r.owner.id : r.owner,
            overbook: r.overbook,
          })),
        });
      }

      // Fallback: some Evergreen installs may expose booking helpers even when
      // PCrud is restricted. Keep this best-effort.
      try {
        const resourcesResponse = await callOpenSRF("open-ils.booking", "open-ils.booking.resources.filtered_id_list", [
          authtoken,
          { owner },
        ]);

        const resourceIds = resourcesResponse?.payload?.[0];

        if (Array.isArray(resourceIds) && resourceIds.length > 0) {
          const detailsResponse = await callOpenSRF("open-ils.booking", "open-ils.booking.resources.retrieve", [
            authtoken,
            resourceIds,
          ]);

          const resources = detailsResponse?.payload?.[0];

          if (Array.isArray(resources)) {
            return successResponse({
              resources: resources.map((r: any) => ({
                id: r.id,
                barcode: r.barcode ?? null,
                type: r.type,
                owner: r.owner,
                overbook: r.overbook,
              })),
            });
          }
        }
      } catch {
        // ignore; keep UX stable
      }

      return successResponse({ resources: [] }, "No bookable resources found");
    }

    if (action === "resource_types") {
      const { actor } = await requirePermissions(["STAFF_LOGIN"]);
      const ownerParam = searchParams.get("owner") || searchParams.get("org_id");
      const owner =
        (ownerParam ? parseInt(ownerParam, 10) : NaN) ||
        Number((actor as any)?.ws_ou ?? (actor as any)?.home_ou ?? 1) ||
        1;
      const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.brt.atomic", [
        authtoken,
        { owner },
        { limit: 200, order_by: { brt: "name" } },
      ]);
      const rows = Array.isArray(response?.payload?.[0]) ? (response.payload[0] as any[]) : [];
      const types = rows.map((t: any) => ({
        id: t.id,
        name: t.name,
        owner: typeof t.owner === "object" ? t.owner.id : t.owner,
        catalog_item: t.catalog_item,
        transferable: t.transferable,
      }));

      return successResponse({ types });
    }

    if (action === "reservations") {
      const { actor } = await requirePermissions(["STAFF_LOGIN"]);
      const pickupLibParam = searchParams.get("pickup_lib") || searchParams.get("org_id");
      const pickupLib =
        (pickupLibParam ? parseInt(pickupLibParam, 10) : NaN) ||
        Number((actor as any)?.ws_ou ?? (actor as any)?.home_ou ?? 1) ||
        1;
      const pcrud = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.bresv.atomic", [
        authtoken,
        { pickup_lib: pickupLib },
        { limit: 50, order_by: { bresv: "id DESC" } },
      ]);
      const rows = Array.isArray(pcrud?.payload?.[0]) ? (pcrud.payload[0] as any[]) : [];
      if (rows.length > 0) {
        return successResponse({
          reservations: rows.map((r: any) => ({
            id: r.id,
            usr: typeof r.usr === "object" ? r.usr.id : r.usr,
            target_resource: typeof r.target_resource === "object" ? r.target_resource.id : r.target_resource,
            target_resource_type:
              typeof r.target_resource_type === "object" ? r.target_resource_type.id : r.target_resource_type,
            current_resource: typeof r.current_resource === "object" ? r.current_resource.id : r.current_resource,
            start_time: r.start_time,
            end_time: r.end_time,
            pickup_time: r.pickup_time,
            return_time: r.return_time,
            capture_time: r.capture_time,
            cancel_time: r.cancel_time,
            pickup_lib: typeof r.pickup_lib === "object" ? r.pickup_lib.id : r.pickup_lib,
          })),
        });
      }

      // Fallback to booking helpers if configured.
      try {
        const reservationsResponse = await callOpenSRF(
          "open-ils.booking",
          "open-ils.booking.reservations.filtered_id_list",
          [authtoken, { pickup_lib: pickupLib }]
        );

        const reservationIds = reservationsResponse?.payload?.[0];

        if (Array.isArray(reservationIds) && reservationIds.length > 0) {
          const detailsResponse = await callOpenSRF("open-ils.booking", "open-ils.booking.reservations.retrieve", [
            authtoken,
            reservationIds.slice(0, 50),
          ]);

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
      } catch {
        // ignore
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

    const actionPerms =
      action === "seed_demo_resource"
        ? ["ADMIN_BOOKING_RESOURCE_TYPE", "ADMIN_BOOKING_RESOURCE"]
        : ["ADMIN_BOOKING_RESERVATION"];

    const { authtoken, actor } = await requirePermissions(actionPerms);

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
      const { patron_barcode, resource_id, start_time, end_time, pickup_lib, note } = body;

      if (!patron_barcode || !resource_id || !start_time || !end_time) {
        return errorResponse("patron_barcode, resource_id, start_time, end_time required", 400);
      }

      // Determine booking resource type (brt) for the selected resource (brsrc).
      const brsrcRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.brsrc", [
        authtoken,
        resource_id,
      ]);
      const brsrc = brsrcRes?.payload?.[0];
      if (!brsrc || brsrc.ilsevent) {
        const message = getErrorMessage(brsrc, "Failed to load booking resource");
        await audit("failure", { patron_barcode, resource_id }, message);
        return errorResponse(message, 400, brsrc);
      }

      const brtIdRaw = typeof brsrc.type === "object" ? brsrc.type.id : brsrc.type;
      const brtId = typeof brtIdRaw === "number" ? brtIdRaw : parseInt(String(brtIdRaw ?? ""), 10);
      if (!Number.isFinite(brtId)) {
        const message = "Booking resource type not found for resource";
        await audit("failure", { patron_barcode, resource_id }, message);
        return errorResponse(message, 500);
      }

      const response = await callOpenSRF("open-ils.booking", "open-ils.booking.reservations.create", [
        authtoken,
        patron_barcode,
        [start_time, end_time],
        pickup_lib || 1,
        brtId,
        [resource_id],
        [],
        false,
        note || null,
      ]);

      const payload = response?.payload?.[0];

      if (payload && !payload.ilsevent) {
        const reservations = Array.isArray(payload) ? payload : [payload];
        const reservationId = reservations[0]?.bresv ?? reservations[0]?.id ?? null;
        await audit("success", {
          patron_barcode,
          resource_id,
          start_time,
          end_time,
          pickup_lib: pickup_lib || 1,
          brtId,
          reservation_id: reservationId,
        });
        return successResponse({ reservations, reservation: reservations[0] || null });
      }

      const message = getErrorMessage(payload, "Failed to create reservation");
      await audit("failure", { patron_barcode, resource_id, start_time, end_time, pickup_lib: pickup_lib || 1 }, message);
      return errorResponse(message, 400, payload);
    }

    if (action === "seed_demo_resource") {
      const owner = Number(body?.owner ?? body?.ownerId ?? actor?.ws_ou ?? actor?.home_ou ?? 1) || 1;
      const typeName = String(body?.typeName ?? "StacksOS Demo Room").trim() || "StacksOS Demo Room";
      const barcode = String(body?.barcode ?? "STACKSOS-ROOM-1").trim() || "STACKSOS-ROOM-1";

      const typeSearch = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.brt.atomic", [
        authtoken,
        { owner, name: typeName },
        { limit: 1 },
      ]);
      const typeRows = Array.isArray(typeSearch?.payload?.[0]) ? (typeSearch.payload[0] as any[]) : [];
      const existingType = typeRows[0];

      let resourceTypeId: number | null = null;
      if (existingType?.id) {
        resourceTypeId = Number(existingType.id) || null;
      } else {
        const payload: any = encodeFieldmapper("brt", {
          name: typeName,
          owner,
          fine_amount: 0,
          max_fine: 0,
          catalog_item: "f",
          transferable: "f",
          isnew: 1,
          ischanged: 1,
        });

        const created = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.brt", [authtoken, payload]);
        const result = created?.payload?.[0];
        resourceTypeId =
          typeof result === "number"
            ? result
            : typeof (result as any)?.id === "number"
              ? (result as any).id
              : parseInt(String((result as any)?.id ?? result ?? ""), 10);
      }

      if (!resourceTypeId || !Number.isFinite(resourceTypeId)) {
        await audit("failure", { owner, typeName, barcode }, "Failed to create resource type");
        return errorResponse("Failed to create booking resource type", 400);
      }

      const resourceSearch = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.brsrc.atomic", [
        authtoken,
        { owner, barcode },
        { limit: 1 },
      ]);
      const resourceRows = Array.isArray(resourceSearch?.payload?.[0]) ? (resourceSearch.payload[0] as any[]) : [];
      const existingResource = resourceRows[0];

      let resourceId: number | null = null;
      if (existingResource?.id) {
        resourceId = Number(existingResource.id) || null;
      } else {
        const payload: any = encodeFieldmapper("brsrc", {
          owner,
          type: resourceTypeId,
          overbook: "f",
          barcode,
          deposit: "f",
          deposit_amount: 0,
          user_fee: 0,
          isnew: 1,
          ischanged: 1,
        });

        const created = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.brsrc", [authtoken, payload]);
        const result = created?.payload?.[0];
        resourceId =
          typeof result === "number"
            ? result
            : typeof (result as any)?.id === "number"
              ? (result as any).id
              : parseInt(String((result as any)?.id ?? result ?? ""), 10);
      }

      if (!resourceId || !Number.isFinite(resourceId)) {
        await audit("failure", { owner, resourceTypeId, barcode }, "Failed to create resource");
        return errorResponse("Failed to create booking resource", 400);
      }

      await audit("success", { owner, resourceTypeId, resourceId, barcode });
      return successResponse({ seeded: true, owner, resourceTypeId, resourceId, barcode });
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
