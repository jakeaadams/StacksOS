import { NextRequest } from "next/server";
import {

  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";


// ============================================================================
// GET - Fetch admin settings data (org unit settings, circ policies, locations)
// ============================================================================

export async function GET(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // org_settings, circ_policies, copy_locations
    const orgIdParam = searchParams.get("org_id");
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);

    const orgId = orgIdParam
      ? parseInt(orgIdParam, 10)
      : actor?.ws_ou ?? actor?.home_ou ?? 1;

    logger.info({ requestId, route: "api.evergreen.admin-settings", type, orgId }, "Admin settings request");

    switch (type) {
      case "org_settings": {
        // Query actor.org_unit_setting for the org
        const response = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.aous.atomic",
          [
            authtoken,
            { org_unit: orgId },
            { flesh: 1, flesh_fields: { aous: ["name"] }, limit, offset },
          ]
        );

        const settings = (response?.payload?.[0] || []).map((s: any) => {
          const name = s?.name || s?.__p?.[1];
          const value = s?.value || s?.__p?.[2];
          const nameObj = typeof name === "object" ? name : null;
          return {
            id: s?.id || s?.__p?.[0],
            name: nameObj?.name || nameObj?.__p?.[0] || name,
            label: nameObj?.label || nameObj?.__p?.[1] || name,
            description: nameObj?.description || nameObj?.__p?.[2] || "",
            value: typeof value === "string" ? JSON.parse(value) : value,
            orgUnit: s?.org_unit || s?.__p?.[3] || orgId,
            datatype: nameObj?.datatype || nameObj?.__p?.[4] || "string",
          };
        });

        // Also get all available setting types
        const typeResponse = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.coust.atomic",
          [
            authtoken,
            search ? { name: { "~*": search } } : { name: { "!=": null } },
            { limit: 500, order_by: { coust: "name" } },
          ]
        );

        const settingTypes = (typeResponse?.payload?.[0] || []).map((t: any) => ({
          name: t?.name || t?.__p?.[0],
          label: t?.label || t?.__p?.[1] || t?.name || t?.__p?.[0],
          description: t?.description || t?.__p?.[2] || "",
          datatype: t?.datatype || t?.__p?.[4] || "string",
          fmClass: t?.fm_class || t?.__p?.[5],
          update_perm: t?.update_perm || t?.__p?.[6],
        }));

        return successResponse({
          settings,
          settingTypes: settingTypes.filter(
            (t: any) => !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.label?.toLowerCase().includes(search.toLowerCase())
          ),
          orgId,
        });
      }

      case "circ_policies": {
        // Query config.circ_matrix_matchpoint
        const response = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.ccmm.atomic",
          [
            authtoken,
            { id: { "!=": null } },
            {
              flesh: 2,
              flesh_fields: {
                ccmm: ["org_unit", "grp", "copy_circ_lib", "copy_owning_lib", "copy_location", "circulate"],
              },
              limit,
              offset,
              order_by: { ccmm: "id" },
            },
          ]
        );

        const policies = (response?.payload?.[0] || []).map((p: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] || obj?.__p?.[idx];
          };

          return {
            id: extract(p, "id", 0),
            active: extract(p, "active", 1) === "t" || extract(p, "active", 1) === true,
            orgUnit: extract(p, "org_unit", 2),
            orgUnitName: typeof p?.org_unit === "object" ? (p.org_unit?.shortname || p.org_unit?.__p?.[2]) : null,
            grp: extract(p, "grp", 3),
            grpName: typeof p?.grp === "object" ? (p.grp?.name || p.grp?.__p?.[1]) : null,
            circModifier: extract(p, "circ_modifier", 4),
            copyLocation: extract(p, "copy_location", 5),
            copyLocationName: typeof p?.copy_location === "object" ? (p.copy_location?.name || p.copy_location?.__p?.[1]) : null,
            isRenewal: extract(p, "is_renewal", 6),
            refFlag: extract(p, "ref_flag", 7),
            usrAgeUpperBound: extract(p, "usr_age_upper_bound", 8),
            usrAgeLowerBound: extract(p, "usr_age_lower_bound", 9),
            itemAgeRange: extract(p, "item_age", 10),
            circulate: extract(p, "circulate", 11),
            durationRule: extract(p, "duration_rule", 12),
            recurringFineRule: extract(p, "recurring_fine_rule", 13),
            maxFineRule: extract(p, "max_fine_rule", 14),
            hardDueDate: extract(p, "hard_due_date", 15),
            renewalExtends: extract(p, "renewals", 16),
            gracePeriod: extract(p, "grace_period", 17),
          };
        });

        return successResponse({ policies, orgId });
      }

      case "copy_locations": {
        // Query asset.copy_location
        const query: any = search
          ? { name: { "~*": search } }
          : { id: { "!=": null } };

        // Filter by org if specified
        if (orgIdParam) {
          query.owning_lib = orgId;
        }

        const response = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.acpl.atomic",
          [
            authtoken,
            query,
            {
              flesh: 1,
              flesh_fields: { acpl: ["owning_lib"] },
              limit,
              offset,
              order_by: { acpl: "name" },
            },
          ]
        );

        const locations = (response?.payload?.[0] || []).map((loc: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] || obj?.__p?.[idx];
          };

          return {
            id: extract(loc, "id", 0),
            name: extract(loc, "name", 1),
            owningLib: extract(loc, "owning_lib", 2),
            owningLibName: typeof loc?.owning_lib === "object" 
              ? (loc.owning_lib?.shortname || loc.owning_lib?.__p?.[2]) 
              : null,
            holdable: extract(loc, "holdable", 3) === "t" || extract(loc, "holdable", 3) === true,
            holdVerify: extract(loc, "hold_verify", 4) === "t" || extract(loc, "hold_verify", 4) === true,
            opacVisible: extract(loc, "opac_visible", 5) === "t" || extract(loc, "opac_visible", 5) === true,
            circulate: extract(loc, "circulate", 6) === "t" || extract(loc, "circulate", 6) === true,
            label: extract(loc, "label", 7),
            labelPrefix: extract(loc, "label_prefix", 8),
            labelSuffix: extract(loc, "label_suffix", 9),
            checkInAlert: extract(loc, "checkin_alert", 10) === "t" || extract(loc, "checkin_alert", 10) === true,
            deleted: extract(loc, "deleted", 11) === "t" || extract(loc, "deleted", 11) === true,
            url: extract(loc, "url", 12),
          };
        }).filter((l: any) => !l.deleted);

        return successResponse({ locations, orgId });
      }

      default:
        return errorResponse("Invalid type parameter. Use: org_settings, circ_policies, or copy_locations", 400);
    }
  } catch (error) {
    return serverErrorResponse(error, "Admin Settings GET", req);
  }
}

// ============================================================================
// POST - Create or update admin settings
// ============================================================================

export async function POST(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const body = await req.json();
    const { action, type, data, orgId: bodyOrgId } = body;

    // Require admin permissions for modifications
    const { authtoken, actor } = await requirePermissions(["ADMIN_ORG_UNIT_SETTING_TYPE"]);

    const orgId = bodyOrgId ?? actor?.ws_ou ?? actor?.home_ou ?? 1;

    logger.info({ requestId, route: "api.evergreen.admin-settings", action, type }, "Admin settings update");

    switch (type) {
      case "org_setting": {
        if (!data?.name) {
          return errorResponse("Setting name is required", 400);
        }

        // Use the actor method to update org unit settings
        const value = data.value !== undefined ? JSON.stringify(data.value) : null;

        const response = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.org_unit.settings.update",
          [authtoken, orgId, { [data.name]: value }]
        );

        const result = response?.payload?.[0];

        if (result?.ilsevent && result.ilsevent !== 0) {
          return errorResponse(result.textcode || "Failed to update setting", 400, result);
        }

        return successResponse({
          updated: true,
          name: data.name,
          value: data.value,
          orgId,
        });
      }

      case "copy_location": {
        if (action === "create") {
          if (!data?.name) {
            return errorResponse("Location name is required", 400);
          }

          const newLocation = {
            __c: "acpl",
            __p: [
              null, // id - will be assigned
              data.name,
              data.owningLib || orgId,
              data.holdable !== false ? "t" : "f",
              data.holdVerify === true ? "t" : "f",
              data.opacVisible !== false ? "t" : "f",
              data.circulate !== false ? "t" : "f",
              data.label || null,
              data.labelPrefix || null,
              data.labelSuffix || null,
              data.checkInAlert === true ? "t" : "f",
              "f", // deleted
              data.url || null,
            ],
          };

          const response = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.create.acpl",
            [authtoken, newLocation]
          );

          const result = response?.payload?.[0];

          if (result?.ilsevent && result.ilsevent !== 0) {
            return errorResponse(result.textcode || "Failed to create location", 400, result);
          }

          return successResponse({
            created: true,
            id: result?.id || result?.__p?.[0],
            name: data.name,
          });
        }

        if (action === "update") {
          if (!data?.id) {
            return errorResponse("Location ID is required", 400);
          }

          // Fetch existing location first
          const fetchResponse = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.retrieve.acpl",
            [authtoken, data.id]
          );

          const existing = fetchResponse?.payload?.[0];
          if (!existing) {
            return errorResponse("Location not found", 404);
          }

          // Update the fields
          const updatePayload = {
            __c: "acpl",
            __p: [
              data.id,
              data.name ?? existing?.name ?? existing?.__p?.[1],
              data.owningLib ?? existing?.owning_lib ?? existing?.__p?.[2],
              data.holdable !== undefined ? (data.holdable ? "t" : "f") : (existing?.holdable ?? existing?.__p?.[3]),
              data.holdVerify !== undefined ? (data.holdVerify ? "t" : "f") : (existing?.hold_verify ?? existing?.__p?.[4]),
              data.opacVisible !== undefined ? (data.opacVisible ? "t" : "f") : (existing?.opac_visible ?? existing?.__p?.[5]),
              data.circulate !== undefined ? (data.circulate ? "t" : "f") : (existing?.circulate ?? existing?.__p?.[6]),
              data.label ?? existing?.label ?? existing?.__p?.[7],
              data.labelPrefix ?? existing?.label_prefix ?? existing?.__p?.[8],
              data.labelSuffix ?? existing?.label_suffix ?? existing?.__p?.[9],
              data.checkInAlert !== undefined ? (data.checkInAlert ? "t" : "f") : (existing?.checkin_alert ?? existing?.__p?.[10]),
              existing?.deleted ?? existing?.__p?.[11] ?? "f",
              data.url ?? existing?.url ?? existing?.__p?.[12],
            ],
          };

          const response = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.update.acpl",
            [authtoken, updatePayload]
          );

          const result = response?.payload?.[0];

          if (result?.ilsevent && result.ilsevent !== 0) {
            return errorResponse(result.textcode || "Failed to update location", 400, result);
          }

          return successResponse({
            updated: true,
            id: data.id,
          });
        }

        if (action === "delete") {
          if (!data?.id) {
            return errorResponse("Location ID is required", 400);
          }

          // Soft delete by setting deleted flag
          const fetchResponse = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.retrieve.acpl",
            [authtoken, data.id]
          );

          const existing = fetchResponse?.payload?.[0];
          if (!existing) {
            return errorResponse("Location not found", 404);
          }

          const deletePayload = {
            __c: "acpl",
            __p: [
              data.id,
              existing?.name ?? existing?.__p?.[1],
              existing?.owning_lib ?? existing?.__p?.[2],
              existing?.holdable ?? existing?.__p?.[3],
              existing?.hold_verify ?? existing?.__p?.[4],
              existing?.opac_visible ?? existing?.__p?.[5],
              existing?.circulate ?? existing?.__p?.[6],
              existing?.label ?? existing?.__p?.[7],
              existing?.label_prefix ?? existing?.__p?.[8],
              existing?.label_suffix ?? existing?.__p?.[9],
              existing?.checkin_alert ?? existing?.__p?.[10],
              "t", // deleted = true
              existing?.url ?? existing?.__p?.[12],
            ],
          };

          const response = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.update.acpl",
            [authtoken, deletePayload]
          );

          const result = response?.payload?.[0];

          if (result?.ilsevent && result.ilsevent !== 0) {
            return errorResponse(result.textcode || "Failed to delete location", 400, result);
          }

          return successResponse({
            deleted: true,
            id: data.id,
          });
        }

        return errorResponse("Invalid action for copy_location", 400);
      }

      default:
        return errorResponse("Invalid type. Use: org_setting or copy_location", 400);
    }
  } catch (error) {
    return serverErrorResponse(error, "Admin Settings POST", req);
  }
}
