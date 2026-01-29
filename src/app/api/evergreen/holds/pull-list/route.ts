/**
 * Pull List API Route
 * GET: Fetch holds pull list from Evergreen
 * POST: Mark items as captured
 */

import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getErrorMessage,
  isSuccessResult,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";

interface PullListRawItem {
  hold_id?: number;
  id?: number;
  copy_id?: number;
  current_copy?: number;
  title?: string;
  author?: string;
  call_number?: string;
  barcode?: string;
  shelving_location?: string;
  location?: string;
  patron_barcode?: string;
  usr?: number;
  pickup_lib?: number;
  pickup_lib_name?: string;
  request_time?: string;
  request_date?: string;
  status?: string;
}

interface MappedPullListItem {
  holdId: number;
  copyId: number;
  title: string;
  author: string;
  callNumber: string;
  barcode: string;
  shelvingLocation: string;
  patronBarcode: string;
  pickupLib: number;
  pickupLibName: string;
  requestDate: string;
  status: "pending" | "in-transit" | "ready";
}

function mapPullListItem(item: PullListRawItem): MappedPullListItem {
  return {
    holdId: item.hold_id ?? item.id ?? 0,
    copyId: item.copy_id ?? item.current_copy ?? 0,
    title: item.title ?? "Unknown Title",
    author: item.author ?? "",
    callNumber: item.call_number ?? "",
    barcode: item.barcode ?? "",
    shelvingLocation: item.shelving_location ?? item.location ?? "",
    patronBarcode: item.patron_barcode ?? "",
    pickupLib: item.pickup_lib ?? 0,
    pickupLibName: item.pickup_lib_name ?? "",
    requestDate: item.request_time ?? item.request_date ?? "",
    status: "pending",
  };
}

export async function GET(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const searchParams = req.nextUrl.searchParams;

    const limitRaw = searchParams.get("limit");
    const offsetRaw = searchParams.get("offset");

    const limit = limitRaw ? parseInt(limitRaw, 10) : 100;
    const offset = offsetRaw ? parseInt(offsetRaw, 10) : 0;

    const defaultOrgId =
      (actor as Record<string, number>)?.ws_ou ??
      (actor as Record<string, number>)?.home_ou ??
      1;

    // Use the fleshed stream method for enriched pull list data
    const pullResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.hold_pull_list.fleshed.stream",
      [authtoken, limit, offset]
    );

    const payload = pullResponse?.payload;
    let items: PullListRawItem[] = [];

    if (Array.isArray(payload)) {
      if (payload.length === 1 && Array.isArray(payload[0])) {
        items = payload[0];
      } else {
        items = payload;
      }
    }

    const pullList = items
      .filter((item): item is PullListRawItem => item !== null && typeof item === "object")
      .map(mapPullListItem);

    return successResponse({
      pullList,
      orgId: defaultOrgId,
      count: pullList.length,
    });
  } catch (error) {
    return serverErrorResponse(error, "Pull List GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);
    const body = await req.json();
    const { action, barcode, holdId } = body;

    if (!action) {
      return errorResponse("Action required", 400);
    }

    if (action === "capture") {
      if (!barcode) {
        return errorResponse("Barcode required for capture", 400);
      }

      // Use checkin to capture the hold
      const checkinResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.checkin",
        [
          authtoken,
          {
            barcode,
            hold_as_transit: false,
            noop: false,
          },
        ]
      );

      const result = checkinResponse?.payload?.[0];

      if (isSuccessResult(result) || result?.route_to) {
        return successResponse({
          success: true,
          holdId,
          barcode,
          routeTo: result?.route_to,
          message: result?.route_to
            ? "Item captured - route to: " + result.route_to
            : "Item captured successfully",
        });
      }

      const message = getErrorMessage(result, "Failed to capture item");
      return errorResponse(message, 400, result);
    }

    return errorResponse("Invalid action. Use: capture", 400);
  } catch (error) {
    return serverErrorResponse(error, "Pull List POST", req);
  }
}
