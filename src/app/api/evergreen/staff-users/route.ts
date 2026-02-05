import { NextRequest } from "next/server";
import { serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { query } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";

const STAFF_GROUP_CACHE_TTL_MS = 5 * 60 * 1000;
let staffGroupCache: { loadedAt: number; ids: number[] } | null = null;

async function getStaffGroupIds(): Promise<number[]> {
  if (staffGroupCache && Date.now() - staffGroupCache.loadedAt < STAFF_GROUP_CACHE_TTL_MS) {
    return staffGroupCache.ids;
  }

  // STAFF_LOGIN is typically assigned to a parent group (e.g. "Staff") and inherited
  // by its descendants ("Circulators", "Catalogers", etc). We must include descendant
  // groups or staff searches will return 0 on real Evergreen installs.
  const rows = await query<{ id: number }>(
    `
      with recursive base as (
        select distinct gpm.grp as id
        from permission.grp_perm_map gpm
        join permission.perm_list pl on pl.id = gpm.perm
        where pl.code = 'STAFF_LOGIN'
      ),
      descendants as (
        select id from base
        union
        select gt.id
        from permission.grp_tree gt
        join descendants d on gt.parent = d.id
      )
      select distinct id
      from descendants
      order by id
    `
  );

  const ids = rows.map((r) => Number(r.id)).filter((v) => Number.isFinite(v));
  staffGroupCache = { loadedAt: Date.now(), ids };
  return ids;
}

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["VIEW_USER"]);

    const searchParams = req.nextUrl.searchParams;
    const qRaw = searchParams.get("q") || "";
    const q = qRaw.trim();

    const includeInactive = searchParams.get("inactive") === "true";
    const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
    const offsetRaw = parseInt(searchParams.get("offset") || "0", 10);

    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const staffGroupIds = await getStaffGroupIds();
    if (staffGroupIds.length === 0) {
      logger.warn({}, "No STAFF_LOGIN permission groups found; staff user search will return empty results");
      return successResponse({ count: 0, users: [], message: "No staff permission groups found" });
    }

    // If q is empty, treat this as a "list staff users" request.
    const like = `%${q}%`;

    const baseWhere = `
      not au.deleted
      and au.profile = any($2::int[])
      and (
        au.usrname ilike $1
        or au.first_given_name ilike $1
        or au.family_name ilike $1
        or concat_ws(' ', au.first_given_name, au.family_name) ilike $1
        or concat_ws(' ', au.family_name, au.first_given_name) ilike $1
        or au.email ilike $1
      )
    `;

    const activeWhere = includeInactive ? "" : "and au.active";

    const rows = await query<{
      id: number;
      username: string;
      first_given_name: string | null;
      family_name: string | null;
      barcode: string | null;
      home_library: string | null;
      profile: string | null;
      active: boolean;
    }>(
      `
        select
          au.id as id,
          au.usrname as username,
          au.first_given_name,
          au.family_name,
          ac.barcode as barcode,
          coalesce(ou.shortname, ou.name) as home_library,
          pgt.name as profile,
          au.active as active
        from actor.usr au
        left join actor.card ac on ac.id = au.card
        left join actor.org_unit ou on ou.id = au.home_ou
        left join permission.grp_tree pgt on pgt.id = au.profile
        where ${baseWhere}
        ${activeWhere}
        order by au.family_name nulls last, au.first_given_name nulls last, au.usrname
        limit $3 offset $4
      `,
      [like, staffGroupIds, limit, offset]
    );

    const users = rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: [r.first_given_name, r.family_name].filter(Boolean).join(" ").trim() || r.username,
      barcode: r.barcode || "",
      homeLibrary: r.home_library || "",
      profile: r.profile || "Staff",
      active: r.active !== false,
    }));

    return successResponse({ count: users.length, users });
  } catch (error) {
    return serverErrorResponse(error, "Staff users GET", req);
  }
}
