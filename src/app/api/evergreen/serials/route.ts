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
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action") || "";

  try {
    const authtoken = await requireAuthToken();

    if (action === "subscriptions") {
      // Evergreen does not provide a single "list all subscriptions" API that is
      // safe to expose without additional UX (filters, paging, org scoping).
      // We intentionally return an empty result with an explanatory message.
      return successResponse(
        { subscriptions: [] },
        "Serials subscriptions listing is not configured yet. Create subscriptions in Evergreen."
      );
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
        return successResponse(
          { routing: [] },
          "Provide stream_id to load a routing list"
        );
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
      return successResponse(
        { distributions: [] },
        "Serial distributions listing is not configured yet"
      );
    }

    return errorResponse(
      "Invalid action. Use: subscriptions, items, routing, distributions",
      400
    );
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
    const body = await req.json();
    const action = body?.action;

    if (!action) {
      return errorResponse("Action required", 400);
    }

    const { authtoken, actor } = await requirePermissions(["RECEIVE_SERIAL"]);

    const audit = async (status: "success" | "failure", details?: Record<string, any>, error?: string) => {
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

      const response = await callOpenSRF(
        "open-ils.serial",
        "open-ils.serial.receive_items",
        [authtoken, [itemId]]
      );

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
      // Claims are view-only for now - they should be managed through Evergreen
      // The UI shows claimed items but doesn\'t allow creating new claims
      return errorResponse(
        "Claims are managed through Evergreen. Use Evergreen to create and manage serial claims.",
        501
      );
    }

    return errorResponse("Invalid action. Use: receive", 400);
  } catch (error) {
    return serverErrorResponse(error, "Serials POST", req);
  }
}
