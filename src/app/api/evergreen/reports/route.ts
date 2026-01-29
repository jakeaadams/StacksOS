import { NextRequest } from "next/server";
import {
  callOpenSRF,
  requireAuthToken,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { query } from "@/lib/db/evergreen";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action") || "dashboard";
  const orgId = parseInt(searchParams.get("org") || "1", 10);

  try {
    const authtoken = await requireAuthToken();
    const today = new Date().toISOString().split("T")[0];
    const todayStart = `${today}T00:00:00`;

    const computePickupHoldsSummary = async (pickupLib: number) => {
      const holdsResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.holds.retrieve_by_pickup_lib",
        [authtoken, pickupLib]
      );

      const holds = holdsResponse?.payload?.[0];
      const list = Array.isArray(holds) ? holds : [];

      const available = list.filter((h: any) => {
        const pickup = h?.pickup_lib;
        const shelf = h?.current_shelf_lib;
        return pickup != null && shelf != null && String(pickup) === String(shelf);
      }).length;

      const inTransit = list.filter((h: any) => {
        const transit = h?.transit;
        if (!transit) return false;
        if (typeof transit !== "object") return true;
        const cancelTime = (transit as any).cancel_time ?? (transit as any).cancelTime;
        const destRecv = (transit as any).dest_recv_time ?? (transit as any).destRecvTime;
        return !cancelTime && !destRecv;
      }).length;

      const total = list.length;
      const pending = Math.max(0, total - available - inTransit);

      return { available, pending, in_transit: inTransit, total };
    };

    const getOverdueCount = async (lib: number) => {
      try {
        const response = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.overdue_items_by_circ_lib",
          [authtoken, lib]
        );
        const items = response?.payload?.[0];
        return Array.isArray(items) ? items.length : 0;
      } catch (error) {
        logger.error({ error: String(error) }, "Error getting overdue count");
        return null;
      }
    };

    const getOrgStats = async (lib: number) => {
      try {
        const response = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.user.org_unit_opt_in.check_all",
          [authtoken, lib]
        );
        return response?.payload?.[0] || null;
      } catch {
        return null;
      }
    };

    if (action === "dashboard" || action === "stats") {
      // Fetch all dashboard metrics in parallel
      const [
        holdsSummary,
        overdueCount,
        checkoutsToday,
        checkinsToday,
        finesCollectedToday,
        newPatronsToday,
      ] = await Promise.all([
        computePickupHoldsSummary(orgId),
        getOverdueCount(orgId),
        // Checkouts today - count circulations created today for this org
        query<{ count: string }>(
          `SELECT COUNT(*) FROM action.circulation 
           WHERE circ_lib = $1 
           AND xact_start::date = $2::date`,
          [orgId, today]
        ).then(rows => parseInt(rows[0]?.count || "0", 10)).catch(() => null),
        // Checkins today - count circulations with checkin_time today for this org
        query<{ count: string }>(
          `SELECT COUNT(*) FROM action.circulation 
           WHERE circ_lib = $1 
           AND checkin_time::date = $2::date`,
          [orgId, today]
        ).then(rows => parseInt(rows[0]?.count || "0", 10)).catch(() => null),
        // Fines collected today - sum of payments made today for this org
        query<{ total: string }>(
          `SELECT COALESCE(SUM(amount), 0) as total 
           FROM money.payment 
           WHERE payment_ts::date = $1::date`,
          [today]
        ).then(rows => parseFloat(rows[0]?.total || "0")).catch(() => null),
        // New patrons today - count users created today for this org
        query<{ count: string }>(
          `SELECT COUNT(*) FROM actor.usr 
           WHERE home_ou = $1 
           AND create_date::date = $2::date 
           AND NOT deleted`,
          [orgId, today]
        ).then(rows => parseInt(rows[0]?.count || "0", 10)).catch(() => null),
      ]);

      return successResponse({
        stats: {
          checkouts_today: checkoutsToday,
          checkins_today: checkinsToday,
          active_holds: holdsSummary.total,
          holds_ready: holdsSummary.available,
          holds_in_transit: holdsSummary.in_transit,
          overdue_items: overdueCount,
          fines_collected_today: finesCollectedToday,
          new_patrons_today: newPatronsToday,
        },
        date: today,
        org_id: orgId,
        message: "Dashboard KPIs powered by Evergreen database queries",
      });
    }

    if (action === "holds") {
      const holdsSummary = await computePickupHoldsSummary(orgId);
      return successResponse({ holds: holdsSummary });
    }

    if (action === "overdue") {
      try {
        const response = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.overdue_items_by_circ_lib",
          [authtoken, orgId]
        );
        const items = response?.payload?.[0];
        
        if (!Array.isArray(items)) {
          return successResponse({ overdue: [], count: 0 });
        }

        // Get details for each overdue item
        const overdueDetails = await Promise.all(
          items.slice(0, 50).map(async (circ: any) => {
            try {
              const copyId = circ.target_copy || circ.copy;
              if (!copyId) return null;

              const copyResponse = await callOpenSRF(
                "open-ils.search",
                "open-ils.search.asset.copy.fleshed2.retrieve",
                [copyId]
              );
              const copy = copyResponse?.payload?.[0];
              
              return {
                circ_id: circ.id,
                due_date: circ.due_date,
                patron_id: circ.usr,
                barcode: copy?.barcode,
                title: copy?.call_number?.record?.simple_record?.title || "Unknown",
                call_number: copy?.call_number?.label,
              };
            } catch (error) {
              return null;
            }
          })
        );

        return successResponse({
          overdue: overdueDetails.filter(Boolean),
          count: items.length,
        });
      } catch (error) {
        logger.error({ error: String(error) }, "Error fetching overdue items");
        return successResponse({ overdue: [], count: 0, message: "Could not retrieve overdue items" });
      }
    }

    if (action === "patrons") {
      return successResponse({ patrons: null }, "Patron reporting requires Reporter templates");
    }

    if (action === "top_items") {
      return successResponse({ top_items: [] }, "Top items requires Reporter templates");
    }

    return errorResponse(
      "Invalid action. Use: dashboard, holds, patrons, top_items, overdue",
      400
    );
  } catch (error) {
    return serverErrorResponse(error, "Reports GET", req);
  }
}
