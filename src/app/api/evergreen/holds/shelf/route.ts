/**
 * Holds Shelf API Route
 * GET: Fetch captured holds on shelf
 * POST: Clear expired holds from shelf
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
import { differenceInDays, parseISO } from "date-fns";

interface ShelfHoldRaw {
  id?: number;
  hold_id?: number;
  title?: string;
  author?: string;
  patron_name?: string;
  usr_first_given_name?: string;
  usr_family_name?: string;
  patron_barcode?: string;
  capture_time?: string;
  shelf_expire_time?: string;
  shelf_location?: string;
  barcode?: string;
  call_number?: string;
  current_copy?: number;
  pickup_lib?: number;
}

interface MappedShelfHold {
  id: number;
  holdId: number;
  title: string;
  author: string;
  patronName: string;
  patronBarcode: string;
  pickupDate: string;
  expireDate: string;
  shelfLocation: string;
  barcode: string;
  callNumber: string;
  daysOnShelf: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

function mapShelfHold(item: ShelfHoldRaw): MappedShelfHold {
  const now = new Date();
  const captureTime = item.capture_time ? parseISO(item.capture_time) : null;
  const expireTime = item.shelf_expire_time
    ? parseISO(item.shelf_expire_time)
    : null;

  const daysOnShelf = captureTime ? differenceInDays(now, captureTime) : 0;
  const daysUntilExpire = expireTime ? differenceInDays(expireTime, now) : 999;

  const isExpired = daysUntilExpire < 0;
  const isExpiringSoon = !isExpired && daysUntilExpire <= 2;

  const patronName =
    item.patron_name ||
    [item.usr_first_given_name, item.usr_family_name].filter(Boolean).join(" ") ||
    "Unknown Patron";

  return {
    id: item.id ?? item.hold_id ?? 0,
    holdId: item.hold_id ?? item.id ?? 0,
    title: item.title ?? "Unknown Title",
    author: item.author ?? "",
    patronName,
    patronBarcode: item.patron_barcode ?? "",
    pickupDate: item.capture_time ?? "",
    expireDate: item.shelf_expire_time ?? "",
    shelfLocation: item.shelf_location ?? "",
    barcode: item.barcode ?? "",
    callNumber: item.call_number ?? "",
    daysOnShelf,
    isExpired,
    isExpiringSoon,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const searchParams = req.nextUrl.searchParams;

    const orgIdRaw = searchParams.get("org_id") || searchParams.get("orgId");
    const orgId = orgIdRaw
      ? parseInt(orgIdRaw, 10)
      : (actor as Record<string, number>)?.ws_ou ??
        (actor as Record<string, number>)?.home_ou ??
        1;

    // Fetch captured holds on shelf
    const shelfResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.captured_holds.on_shelf.retrieve",
      [authtoken, orgId]
    );

    const payload = shelfResponse?.payload;
    let items: ShelfHoldRaw[] = [];

    if (Array.isArray(payload)) {
      if (payload.length === 1 && Array.isArray(payload[0])) {
        items = payload[0];
      } else {
        items = payload;
      }
    }

    const shelfHolds = items
      .filter((item): item is ShelfHoldRaw => item !== null && typeof item === "object")
      .map(mapShelfHold)
      .sort((a, b) => {
        // Sort expired first, then by days on shelf descending
        if (a.isExpired && !b.isExpired) return -1;
        if (!a.isExpired && b.isExpired) return 1;
        return b.daysOnShelf - a.daysOnShelf;
      });

    const expiredCount = shelfHolds.filter((h) => h.isExpired).length;
    const expiringSoonCount = shelfHolds.filter(
      (h) => h.isExpiringSoon && !h.isExpired
    ).length;

    return successResponse({
      shelfHolds,
      orgId,
      count: shelfHolds.length,
      expiredCount,
      expiringSoonCount,
    });
  } catch (error) {
    return serverErrorResponse(error, "Holds Shelf GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const body = await req.json();
    const { action, orgId: bodyOrgId } = body;

    if (!action) {
      return errorResponse("Action required", 400);
    }

    const orgId =
      bodyOrgId ??
      (actor as Record<string, number>)?.ws_ou ??
      (actor as Record<string, number>)?.home_ou ??
      1;

    if (action === "clear_expired") {
      // Use clear_shelf.process to handle expired holds
      const clearResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.hold.clear_shelf.process",
        [authtoken, orgId]
      );

      const result = clearResponse?.payload?.[0];

      // The clear_shelf.process returns info about what was cleared
      if (isSuccessResult(result) || Array.isArray(result) || typeof result === "object") {
        const clearedCount = Array.isArray(result)
          ? result.length
          : typeof result === "object" && result !== null
            ? Object.keys(result).length
            : 0;

        return successResponse({
          success: true,
          clearedCount,
          message: "Cleared " + clearedCount + " expired hold(s)",
        });
      }

      const message = getErrorMessage(result, "Failed to clear expired holds");
      return errorResponse(message, 400, result);
    }

    return errorResponse("Invalid action. Use: clear_expired", 400);
  } catch (error) {
    return serverErrorResponse(error, "Holds Shelf POST", req);
  }
}
