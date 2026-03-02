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

    const computePickupHoldsSummary = async (pickupLib: number) => {
      const holdsResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.holds.retrieve_by_pickup_lib",
        [authtoken, pickupLib]
      );

      const holds = holdsResponse?.payload?.[0];
      const list = Array.isArray(holds) ? holds : [];

      const available = list.filter((h) => {
        const pickup = h?.pickup_lib;
        const shelf = h?.current_shelf_lib;
        return pickup != null && shelf != null && String(pickup) === String(shelf);
      }).length;

      const inTransit = list.filter((h) => {
        const transit = h?.transit;
        if (!transit) return false;
        if (typeof transit !== "object") return true;
        const cancelTime =
          (transit as Record<string, any>).cancel_time ??
          (transit as Record<string, any>).cancelTime;
        const destRecv =
          (transit as Record<string, any>).dest_recv_time ??
          (transit as Record<string, any>).destRecvTime;
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
        if ((error as Record<string, any>)?.code === "OSRF_METHOD_NOT_FOUND") {
          logger.info(
            { component: "evergreen.reports", method: "open-ils.circ.overdue_items_by_circ_lib" },
            "Overdue reporting method not available on this Evergreen install"
          );
          return null;
        }
        logger.error({ error: String(error) }, "Error getting overdue count");
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
        )
          .then((rows) => parseInt(rows[0]?.count || "0", 10))
          .catch(() => null),
        // Checkins today - count circulations with checkin_time today for this org
        query<{ count: string }>(
          `SELECT COUNT(*) FROM action.circulation 
           WHERE circ_lib = $1 
           AND checkin_time::date = $2::date`,
          [orgId, today]
        )
          .then((rows) => parseInt(rows[0]?.count || "0", 10))
          .catch(() => null),
        // Fines collected today - sum of payments made today for this org
        query<{ total: string }>(
          `SELECT COALESCE(SUM(amount), 0) as total 
           FROM money.payment 
           WHERE payment_ts::date = $1::date`,
          [today]
        )
          .then((rows) => parseFloat(rows[0]?.total || "0"))
          .catch(() => null),
        // New patrons today - count users created today for this org
        query<{ count: string }>(
          `SELECT COUNT(*) FROM actor.usr 
           WHERE home_ou = $1 
           AND create_date::date = $2::date 
           AND NOT deleted`,
          [orgId, today]
        )
          .then((rows) => parseInt(rows[0]?.count || "0", 10))
          .catch(() => null),
      ]);

      const dashboard = {
        checkouts_today: checkoutsToday,
        checkins_today: checkinsToday,
        active_holds: holdsSummary.total,
        holds_ready: holdsSummary.available,
        holds_pending: holdsSummary.pending,
        holds_in_transit: holdsSummary.in_transit,
        overdue_items: overdueCount,
        fines_collected_today: finesCollectedToday,
        new_patrons_today: newPatronsToday,
      };

      return successResponse({
        // Preferred stable key (contract-tested)
        dashboard,
        // Back-compat key used by older clients
        stats: dashboard,
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
          items.slice(0, 50).map(async (circ) => {
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
            } catch {
              return null;
            }
          })
        );

        return successResponse({
          overdue: overdueDetails.filter(Boolean),
          count: items.length,
        });
      } catch (error) {
        if ((error as Record<string, any>)?.code === "OSRF_METHOD_NOT_FOUND") {
          return successResponse({
            overdue: [],
            count: 0,
            message: "Overdue reporting is not available on this Evergreen install",
          });
        }
        logger.error({ error: String(error) }, "Error fetching overdue items");
        return successResponse({
          overdue: [],
          count: 0,
          message: "Could not retrieve overdue items",
        });
      }
    }

    if (action === "circ_trends") {
      const days = Math.min(parseInt(searchParams.get("days") || "30", 10), 365);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = startDate.toISOString().split("T")[0];

      const [checkoutRows, checkinRows] = await Promise.all([
        query<{ day: string; count: string }>(
          `SELECT xact_start::date AS day, COUNT(*) AS count
           FROM action.circulation
           WHERE circ_lib = $1 AND xact_start::date >= $2::date
           GROUP BY day ORDER BY day`,
          [orgId, startStr]
        ).catch(() => [] as { day: string; count: string }[]),
        query<{ day: string; count: string }>(
          `SELECT checkin_time::date AS day, COUNT(*) AS count
           FROM action.circulation
           WHERE circ_lib = $1 AND checkin_time::date >= $2::date AND checkin_time IS NOT NULL
           GROUP BY day ORDER BY day`,
          [orgId, startStr]
        ).catch(() => [] as { day: string; count: string }[]),
      ]);

      const coMap = new Map(checkoutRows.map((r) => [r.day, parseInt(r.count, 10)]));
      const ciMap = new Map(checkinRows.map((r) => [r.day, parseInt(r.count, 10)]));
      const allDays = new Set([...coMap.keys(), ...ciMap.keys()]);
      const trends = [...allDays].sort().map((day) => ({
        date: day,
        checkouts: coMap.get(day) || 0,
        checkins: ciMap.get(day) || 0,
      }));

      return successResponse({ trends, days, org_id: orgId });
    }

    if (action === "collection_stats") {
      const [statusRows, locationRows] = await Promise.all([
        query<{ status: string; count: string }>(
          `SELECT cs.name AS status, COUNT(*) AS count
           FROM asset.copy ac
           JOIN config.copy_status cs ON cs.id = ac.status
           WHERE ac.circ_lib = $1 AND NOT ac.deleted
           GROUP BY cs.name ORDER BY count DESC`,
          [orgId]
        ).catch(() => [] as { status: string; count: string }[]),
        query<{ location: string; count: string }>(
          `SELECT acl.name AS location, COUNT(*) AS count
           FROM asset.copy ac
           JOIN asset.copy_location acl ON acl.id = ac.location
           WHERE ac.circ_lib = $1 AND NOT ac.deleted
           GROUP BY acl.name ORDER BY count DESC
           LIMIT 15`,
          [orgId]
        ).catch(() => [] as { location: string; count: string }[]),
      ]);

      const byStatus = statusRows.map((r) => ({ name: r.status, value: parseInt(r.count, 10) }));
      const byLocation = locationRows.map((r) => ({
        name: r.location,
        value: parseInt(r.count, 10),
      }));
      const totalItems = byStatus.reduce((sum, r) => sum + r.value, 0);

      return successResponse({ collection: { byStatus, byLocation, totalItems }, org_id: orgId });
    }

    if (action === "patron_demographics") {
      const [profileRows, registrationRows] = await Promise.all([
        query<{ profile: string; count: string }>(
          `SELECT pgt.name AS profile, COUNT(*) AS count
           FROM actor.usr au
           JOIN permission.grp_tree pgt ON pgt.id = au.profile
           WHERE au.home_ou = $1 AND NOT au.deleted AND au.active
           GROUP BY pgt.name ORDER BY count DESC`,
          [orgId]
        ).catch(() => [] as { profile: string; count: string }[]),
        query<{ month: string; count: string }>(
          `SELECT to_char(create_date, 'YYYY-MM') AS month, COUNT(*) AS count
           FROM actor.usr
           WHERE home_ou = $1 AND NOT deleted
           AND create_date >= NOW() - INTERVAL '12 months'
           GROUP BY month ORDER BY month`,
          [orgId]
        ).catch(() => [] as { month: string; count: string }[]),
      ]);

      const byProfile = profileRows.map((r) => ({ name: r.profile, value: parseInt(r.count, 10) }));
      const registrations = registrationRows.map((r) => ({
        month: r.month,
        count: parseInt(r.count, 10),
      }));
      const totalActive = byProfile.reduce((sum, r) => sum + r.value, 0);

      return successResponse({
        patrons: { byProfile, registrations, totalActive },
        org_id: orgId,
      });
    }

    if (action === "top_items") {
      return successResponse({ top_items: [] }, "Top items requires Reporter templates");
    }

    return errorResponse(
      "Invalid action. Use: dashboard, holds, overdue, circ_trends, collection_stats, patron_demographics",
      400
    );
  } catch (error) {
    return serverErrorResponse(error, "Reports GET", req);
  }
}
