import { NextRequest } from "next/server";
import {
  callOpenSRF,
  requireAuthToken,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getErrorMessage,
  isOpenSRFEvent,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

function normalizeSerialItem(i: any) {
  return {
    id: i?.id,
    issuance: i?.issuance,
    stream: i?.stream,
    date_expected: i?.date_expected,
    date_received: i?.date_received,
    status: i?.status,
    unit: i?.unit,
  };
}

/**
 * GET /api/evergreen/serials
 *
 * Handles serial-related read operations
 *
 * Actions:
 * - subscriptions: List all subscriptions (currently not configured)
 * - items: List receivable items for a subscription (requires subscription_id param)
 * - routing: Get routing list for a stream (requires stream_id param)
 * - distributions: List distributions (currently not configured)
 */
const serialsPostSchema = z
  .object({
    action: z.string().trim().min(1),
    item_id: z.coerce.number().int().positive().optional(),
    item_ids: z.array(z.coerce.number().int().positive()).max(500).optional(),
    claim_type: z.coerce.number().int().positive().optional(),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action") || "";

  try {
    const authtoken = await requireAuthToken();

    if (action === "subscriptions") {
      // Fetch serial subscriptions for the user's working org unit
      const { actor } = await requirePermissions(["STAFF_LOGIN"]);
      const orgId = actor?.ws_ou ?? actor?.home_ou ?? 1;
      const limit = parseInt(searchParams.get("limit") || "50", 10);
      const offset = parseInt(searchParams.get("offset") || "0", 10);

      const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.ssub.atomic", [
        authtoken,
        { owning_lib: orgId },
        {
          flesh: 2,
          flesh_fields: {
            ssub: ["owning_lib", "record_entry"],
            aou: ["name"],
            bre: ["simple_record"],
          },
          limit,
          offset,
          order_by: { ssub: "start_date DESC" },
        },
      ]);

      const subscriptions = (response?.payload?.[0] || []).map((sub: any) => ({
        id: sub?.id,
        start_date: sub?.start_date,
        end_date: sub?.end_date,
        expected_date_offset: sub?.expected_date_offset,
        owning_lib: sub?.owning_lib?.id || sub?.owning_lib,
        owning_lib_name: sub?.owning_lib?.name || null,
        record_entry: sub?.record_entry?.id || sub?.record_entry,
        title: sub?.record_entry?.simple_record?.title || null,
      }));

      return successResponse({ subscriptions, count: subscriptions.length, orgId });
    }

    if (action === "items" || action === "issues") {
      const subscriptionId = searchParams.get("subscription_id");
      if (!subscriptionId) {
        return successResponse(
          { items: [] },
          "Provide subscription_id to load receivable serial items"
        );
      }

      const itemsResponse = await callOpenSRF(
        "open-ils.serial",
        "open-ils.serial.items.receivable.by_subscription",
        [authtoken, parseInt(subscriptionId, 10)]
      );

      const items = itemsResponse?.payload?.[0];
      const list = Array.isArray(items) ? items : [];

      return successResponse({ items: list.map(normalizeSerialItem) });
    }

    if (action === "routing") {
      const streamId = searchParams.get("stream_id");
      if (!streamId) {
        return successResponse({ routing: [] }, "Provide stream_id to load a routing list");
      }

      const routingResponse = await callOpenSRF(
        "open-ils.serial",
        "open-ils.serial.routing_list_users.fleshed_and_ordered",
        [authtoken, parseInt(streamId, 10)]
      );

      // This method is streamed; the gateway returns a single list in payload[0].
      const routing = routingResponse?.payload?.[0];
      return successResponse({ routing: Array.isArray(routing) ? routing : [] });
    }

    if (action === "distributions") {
      const subscriptionId = searchParams.get("subscription_id");
      if (!subscriptionId) {
        return successResponse(
          { distributions: [] },
          "Provide subscription_id to load distributions"
        );
      }

      const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.sdist.atomic", [
        authtoken,
        { subscription: parseInt(subscriptionId, 10) },
        {
          flesh: 1,
          flesh_fields: { sdist: ["holding_lib"] },
          order_by: { sdist: "label" },
        },
      ]);

      const distributions = (response?.payload?.[0] || []).map((dist: any) => ({
        id: dist?.id,
        label: dist?.label,
        holding_lib: dist?.holding_lib?.id || dist?.holding_lib,
        holding_lib_name: dist?.holding_lib?.name || null,
        receive_call_number: dist?.receive_call_number,
        receive_unit_template: dist?.receive_unit_template,
      }));

      return successResponse({ distributions, count: distributions.length });
    }

    return errorResponse("Invalid action. Use: subscriptions, items, routing, distributions", 400);
  } catch (error) {
    return serverErrorResponse(error, "Serials GET", req);
  }
}

/**
 * POST /api/evergreen/serials
 *
 * Handles serial-related write operations
 *
 * Actions:
 * - receive: Mark serial items as received (requires item_id in body)
 * - claim: Claim serial items (currently view-only, managed in Evergreen)
 */
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const body = serialsPostSchema.parse(await req.json());
    const action = body?.action;

    if (!action) {
      return errorResponse("Action required", 400);
    }

    const { authtoken, actor } = await requirePermissions(["RECEIVE_SERIAL"]);

    const audit = async (
      status: "success" | "failure",
      details?: Record<string, any>,
      error?: string
    ) => {
      await logAuditEvent({
        action: `serials.${action}`,
        status,
        actor,
        ip,
        userAgent,
        requestId,
        details,
        error: error || null,
      });
    };

    if (action === "receive") {
      const itemId = body?.item_id;
      if (!itemId) {
        await audit("failure", { itemId }, "Missing item_id");
        return errorResponse("item_id required", 400);
      }

      const response = await callOpenSRF("open-ils.serial", "open-ils.serial.receive_items", [
        authtoken,
        [itemId],
      ]);

      const result = response?.payload?.[0];
      if (isOpenSRFEvent(result) || result?.ilsevent) {
        const errMsg = getErrorMessage(result, "Failed to receive item");
        await audit("failure", { itemId, result }, errMsg);
        return errorResponse(errMsg, 400, result);
      }

      await audit("success", { itemId, result });
      return successResponse({ result }, "Item received successfully");
    }

    if (action === "claim") {
      // Create serial claims for missing/late items
      const itemIds = body?.item_ids;
      const claimType = body?.claim_type || 1;
      const note = body?.note || "";

      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        await audit("failure", { itemIds }, "Missing or invalid item_ids array");
        return errorResponse("item_ids array required", 400);
      }

      const results = [];
      for (const itemId of itemIds) {
        try {
          const claimResponse = await callOpenSRF(
            "open-ils.serial",
            "open-ils.serial.claim.create",
            [authtoken, itemId, claimType, note]
          );

          const result = claimResponse?.payload?.[0];
          if (isOpenSRFEvent(result) || result?.ilsevent) {
            results.push({
              itemId,
              success: false,
              error: getErrorMessage(result, "Failed to create claim"),
            });
          } else {
            results.push({ itemId, success: true, claimId: result });
          }
        } catch (err) {
          results.push({
            itemId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      await audit("success", {
        itemIds,
        claimType,
        note,
        successCount,
        failureCount,
        results,
      });

      return successResponse(
        {
          results,
          successCount,
          failureCount,
        },
        `Created ${successCount} claim(s), ${failureCount} failed`
      );
    }

    return errorResponse("Invalid action. Use: receive", 400);
  } catch (error) {
    return serverErrorResponse(error, "Serials POST", req);
  }
}
