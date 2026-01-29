import { NextRequest } from "next/server";
import {

    callOpenSRF,
    successResponse,
    errorResponse,
    serverErrorResponse,
    getErrorMessage,
    isSuccessResult,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";



export async function GET(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const searchParams = req.nextUrl.searchParams;

    const action = (searchParams.get("action") || "").trim();

    const patronIdRaw = searchParams.get("patronId") || searchParams.get("patron_id");
    const orgIdRaw = searchParams.get("orgId") || searchParams.get("org_id");
    const titleIdRaw = searchParams.get("titleId") || searchParams.get("title_id");
    const holdIdRaw = searchParams.get("holdId") || searchParams.get("hold_id");

    const limitRaw = searchParams.get("limit");
    const offsetRaw = searchParams.get("offset");

    const parseIntMaybe = (value: string | null): number | null => {
      if (!value) return null;
      const n = parseInt(value, 10);
      return Number.isFinite(n) ? n : null;
    };

    const patronId = parseIntMaybe(patronIdRaw);
    const orgId = parseIntMaybe(orgIdRaw);
    const titleId = parseIntMaybe(titleIdRaw);
    const holdId = parseIntMaybe(holdIdRaw);

    const limit = parseIntMaybe(limitRaw) ?? 50;
    const offset = parseIntMaybe(offsetRaw) ?? 0;

    const defaultOrgId = (actor as any)?.ws_ou ?? (actor as any)?.home_ou ?? 1;

    const normalizeListPayload = (payload: any): any[] => {
      if (!Array.isArray(payload)) return [];
      if (payload.length === 1 && Array.isArray(payload[0])) return payload[0];
      return payload;
    };

    const mapHold = (hold: any, extra: Record<string, any> = {}) => {
      return {
        id: hold?.id,
        holdType: hold?.hold_type,
        target: hold?.target,
        requestTime: hold?.request_time,
        captureTime: hold?.capture_time,
        fulfillmentTime: hold?.fulfillment_time,
        expireTime: hold?.expire_time,
        pickupLib: hold?.pickup_lib,
        frozen: hold?.frozen === "t" || hold?.frozen === true,
        frozenUntil: hold?.thaw_date,
        shelfExpireTime: hold?.shelf_expire_time,
        currentCopy: hold?.current_copy,
        title: hold?.title || hold?.mvr?.title || "Unknown",
        author: hold?.author || hold?.mvr?.author || "",
        status: hold?.status,
        queuePosition: hold?.queue_position,
        potentialCopies: hold?.potential_copies,
        ...extra,
      };
    };

    // Back-compat: support the older query style that omitted `action=`.
    if (!action) {
      if (holdId) {
        const detailsResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.hold.details.retrieve",
          [authtoken, holdId]
        );
        return successResponse({ hold: detailsResponse?.payload?.[0] });
      }

      if (patronId) {
        const holdsResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.holds.retrieve",
          [authtoken, patronId]
        );
        const holds = holdsResponse?.payload?.[0];
        return successResponse({ holds: Array.isArray(holds) ? holds.map((h: any) => mapHold(h)) : [] });
      }

      if (orgId) {
        const shelfResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.captured_holds.on_shelf.retrieve",
          [authtoken, orgId]
        );
        const list = normalizeListPayload(shelfResponse?.payload);
        return successResponse({ holds: list.map((h: any) => mapHold(h)) });
      }

      return errorResponse("Missing action", 400);
    }

    switch (action) {
      case "patron_holds": {
        if (!patronId) {
          return errorResponse("patron_id required", 400);
        }

        const holdsResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.holds.retrieve",
          [authtoken, patronId]
        );
        const holds = holdsResponse?.payload?.[0];

        if (!Array.isArray(holds) || holds.length === 0) {
          return successResponse({ holds: [] });
        }

        // Best-effort enrichment via hold.details.retrieve
        const enrichedHolds = await Promise.all(
          holds.map(async (hold: any) => {
            try {
              const detailsResponse = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.hold.details.retrieve",
                [authtoken, hold.id]
              );
              const details = detailsResponse?.payload?.[0];
              return mapHold(hold, {
                title: details?.title || details?.mvr?.title || "Unknown",
                author: details?.author || details?.mvr?.author || "",
                status: details?.status ?? hold?.status,
                queuePosition: details?.queue_position,
                potentialCopies: details?.potential_copies,
              });
            } catch {
              return mapHold(hold);
            }
          })
        );

        return successResponse({ holds: enrichedHolds });
      }

      case "holds_shelf": {
        const resolvedOrgId = orgId ?? defaultOrgId;

        const shelfResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.captured_holds.on_shelf.retrieve",
          [authtoken, resolvedOrgId]
        );

        const list = normalizeListPayload(shelfResponse?.payload);
        return successResponse({ holds: list.map((h: any) => mapHold(h)) });
      }

      case "expired_holds": {
        const resolvedOrgId = orgId ?? defaultOrgId;

        const expiredResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.captured_holds.expired_on_shelf_or_wrong_shelf.retrieve",
          [authtoken, resolvedOrgId]
        );

        const list = normalizeListPayload(expiredResponse?.payload);
        return successResponse({ holds: list.map((h: any) => mapHold(h)) });
      }

      case "pull_list": {
        // Evergreen determines pull list org from the login session.
        const pullResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.hold_pull_list.fleshed.stream",
          [authtoken, limit, offset]
        );

        const list = normalizeListPayload(pullResponse?.payload);
        return successResponse({ pullList: list });
      }

      case "title_holds": {
        if (!titleId) {
          return errorResponse("title_id required", 400);
        }

        const allResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.holds.retrieve_all_from_title",
          [authtoken, titleId, {}]
        );

        const buckets = allResponse?.payload?.[0] as any;
        const holdIds: number[] = [];

        if (buckets && typeof buckets === "object") {
          for (const value of Object.values(buckets)) {
            if (Array.isArray(value)) {
              for (const id of value) {
                if (typeof id === "number") holdIds.push(id);
              }
            }
          }
        }

        if (holdIds.length === 0) {
          return successResponse({ holds: [] });
        }

        const detailsResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.hold.details.batch.retrieve",
          [authtoken, holdIds.slice(0, limit), {}]
        );

        const list = normalizeListPayload(detailsResponse?.payload);
        return successResponse({ holds: list.map((h: any) => mapHold(h)) });
      }

      case "check_possible": {
        if (!titleId) {
          return errorResponse("title_id required", 400);
        }

        const orgUnit = orgId ?? defaultOrgId;
        const res = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.hold.has_copy_at",
          [authtoken, { hold_type: "T", hold_target: titleId, org_unit: orgUnit }]
        );

        const result = res?.payload?.[0] || {};
        const possible = Boolean((result as any)?.copy);
        return successResponse({ possible, result });
      }

      case "hold_details": {
        if (!holdId) {
          return errorResponse("hold_id required", 400);
        }

        const detailsResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.hold.details.retrieve",
          [authtoken, holdId]
        );

        return successResponse({ hold: detailsResponse?.payload?.[0] });
      }

      default:
        return errorResponse("Invalid action", 400);
    }
  } catch (error) {
    return serverErrorResponse(error, "Holds API GET", req);
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

        const { authtoken, actor } = await requirePermissions(["CREATE_HOLD"]);

        const audit = async (status: "success" | "failure", details?: Record<string, any>, error?: string) => {
            await logAuditEvent({
                action: `holds.${action}`,
                status,
                actor,
                ip,
                userAgent,
                requestId,
                details,
                error: error || null,
            });
        };

        // Create hold
        if (action === "create" || action === "place_hold") {
            const { patronId, holdType, target, targetId, pickupLib } = body;

            const resolvedTarget = target ?? targetId;

            if (!patronId || !holdType || !resolvedTarget || !pickupLib) {
                return errorResponse("patronId, holdType, targetId, and pickupLib required", 400);
            }

            const response = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.holds.test_and_create.batch",
                [
                    authtoken,
                    {
                        patronid: parseInt(patronId),
                        hold_type: holdType,
                        pickup_lib: parseInt(pickupLib),
                    },
                    [parseInt(resolvedTarget)],
                ]
            );

            const result = response?.payload?.[0];

            const createdHoldId =
                typeof result === "number"
                    ? result
                    : (result && typeof result === "object" && typeof (result as any).result === "number")
                      ? (result as any).result
                      : null;

            if (createdHoldId && !(result as any)?.ilsevent) {
                await audit("success", { patronId, holdType, target: resolvedTarget, pickupLib, holdId: createdHoldId });
                return successResponse({ hold: result, holdId: createdHoldId });
            }

            const message = getErrorMessage(result, "Failed to create hold");
            await audit("failure", { patronId, holdType, target, pickupLib }, message);
            return errorResponse(message, 400, result);
        }

        // Cancel hold
        if (action === "cancel" || action === "cancel_hold") {
            const { holdId, cause, reason, note } = body;

            if (!holdId) {
                return errorResponse("holdId required", 400);
            }

            const response = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.hold.cancel",
                [authtoken, parseInt(holdId), (cause || reason || 5), note || null]
            );

            const result = response?.payload?.[0];
            const holdIdNum = parseInt(holdId);

            if (isSuccessResult(result) || result === holdIdNum) {
                await audit("success", { holdId, cause: cause || reason || 5, note: note || null });
                return successResponse({ success: true });
            }

            const message = getErrorMessage(result, "Failed to cancel hold");
            await audit("failure", { holdId }, message);
            return errorResponse(message, 400, result);
        }

        // Freeze hold
        if (action === "freeze") {
            const { holdId, thawDate } = body;

            if (!holdId) {
                return errorResponse("holdId required", 400);
            }

            const response = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.hold.update",
                [authtoken, { id: parseInt(holdId), frozen: true, thaw_date: thawDate || null }]
            );

            const result = response?.payload?.[0];

            if (result && !result.ilsevent) {
                await audit("success", { holdId, thawDate });
                return successResponse({ success: true });
            }

            const message = getErrorMessage(result, "Failed to freeze hold");
            await audit("failure", { holdId }, message);
            return errorResponse(message, 400, result);
        }

        // Thaw (unfreeze) hold
        if (action === "thaw") {
            const { holdId } = body;

            if (!holdId) {
                return errorResponse("holdId required", 400);
            }

            const response = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.hold.update",
                [authtoken, { id: parseInt(holdId), frozen: false, thaw_date: null }]
            );

            const result = response?.payload?.[0];

            if (result && !result.ilsevent) {
                await audit("success", { holdId });
                return successResponse({ success: true });
            }

            const message = getErrorMessage(result, "Failed to thaw hold");
            await audit("failure", { holdId }, message);
            return errorResponse(message, 400, result);
        }

        // Update pickup library
        if (action === "update_pickup_lib") {
            const { holdId, pickupLib } = body;

            if (!holdId || !pickupLib) {
                return errorResponse("holdId and pickupLib required", 400);
            }

            const response = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.hold.update",
                [authtoken, { id: parseInt(holdId), pickup_lib: parseInt(pickupLib) }]
            );

            const result = response?.payload?.[0];

            if (result && !result.ilsevent) {
                await audit("success", { holdId, pickupLib });
                return successResponse({ success: true });
            }

            const message = getErrorMessage(result, "Failed to update pickup library");
            await audit("failure", { holdId, pickupLib }, message);
            return errorResponse(message, 400, result);
        }

        return errorResponse("Invalid action. Use: create/place_hold, cancel/cancel_hold, freeze, thaw, update_pickup_lib", 400);
    } catch (error) {
        return serverErrorResponse(error, "Holds POST", req);
    }
}

export async function PUT(req: NextRequest) {
    // Alias PUT to POST for RESTful compatibility
    return POST(req);
}
