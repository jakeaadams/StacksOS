import { NextRequest } from "next/server";
import { callOpenSRF, successResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { z as _z } from "zod";

/**
 * GET /api/evergreen/copy-locations
 * Returns asset.copy_location rows for policy editors and staff tooling.
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "1000", 10), 5000);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);

    const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acpl.atomic", [
      authtoken,
      { id: { "!=": null } },
      {
        limit,
        offset,
        order_by: { acpl: "name" },
        flesh: 1,
        flesh_fields: { acpl: ["owning_lib"] },
      },
    ]);

    const extract = (
      obj: Record<string, unknown> | null | undefined,
      field: string,
      idx: number
    ) => {
      if (!obj) return null;
      return obj?.[field] ?? (obj?.__p as unknown[] | undefined)?.[idx];
    };

    const extractNested = (obj: unknown, field: string, idx: number) => {
      if (!obj || typeof obj !== "object") return null;
      const rec = obj as Record<string, unknown>;
      return rec?.[field] ?? (rec?.__p as unknown[] | undefined)?.[idx];
    };

    const locations = (response?.payload?.[0] || []).map((loc: any) => {
      const owningLibObj = loc?.owning_lib;
      return {
        id: extract(loc, "id", 0),
        name: extract(loc, "name", 1),
        owningLib:
          typeof owningLibObj === "object"
            ? extractNested(owningLibObj, "id", 0)
            : extract(loc, "owning_lib", 2),
        owningLibShortname:
          typeof owningLibObj === "object" ? extractNested(owningLibObj, "shortname", 2) : null,
        owningLibName:
          typeof owningLibObj === "object" ? extractNested(owningLibObj, "name", 1) : null,
        opacVisible:
          extract(loc, "opac_visible", 3) === "t" || extract(loc, "opac_visible", 3) === true,
      };
    });

    return successResponse({ locations, pagination: { limit, offset, count: locations.length } });
  } catch (error: unknown) {
    return serverErrorResponse(error, "CopyLocations GET", req);
  }
}
