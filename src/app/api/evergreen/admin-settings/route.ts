import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
  payloadFirst,
  payloadFirstArray,
  fieldValue,
  fieldBool,
  CCMM_FIELDS,
  AOU_FIELDS,
  PGT_FIELDS,
  ACPL_FIELDS,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { query } from "@/lib/db/evergreen";

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

    const orgId = orgIdParam ? parseInt(orgIdParam, 10) : (actor?.ws_ou ?? actor?.home_ou ?? 1);

    logger.info(
      { requestId, route: "api.evergreen.admin-settings", type, orgId },
      "Admin settings request"
    );

    switch (type) {
      case "org_settings": {
        // Some Evergreen installs do not expose open-ils.pcrud.search.aous.atomic.
        // Use direct SQL for stable cross-version behavior.
        const settingsRows = await query<Record<string, unknown>>(
          `
            select s.id, s.name, s.value, s.org_unit,
                   t.label, t.description, t.datatype
            from actor.org_unit_setting s
            left join config.org_unit_setting_type t on t.name = s.name
            where s.org_unit = $1
            order by s.id desc
            limit $2 offset $3
          `,
          [orgId, limit, offset]
        );

        const settings = settingsRows.map((row: Record<string, unknown>) => {
          const raw = row.value;
          let value: unknown = raw;
          if (typeof raw === "string") {
            try {
              value = JSON.parse(raw);
            } catch {
              value = raw;
            }
          }
          return {
            id: row.id,
            name: row.name,
            label: row.label || row.name,
            description: row.description || "",
            value,
            orgUnit: row.org_unit,
            datatype: row.datatype || "string",
          };
        });

        const like = `%${search}%`;
        const typesRows = await query<Record<string, unknown>>(
          `
            select name, label, description, datatype, fm_class, update_perm
            from config.org_unit_setting_type
            where $1 = '' or name ilike $2 or coalesce(label,'') ilike $2
            order by name
            limit 500
          `,
          [search, like]
        );

        const settingTypes = typesRows.map((t: Record<string, unknown>) => ({
          name: t.name,
          label: t.label || t.name,
          description: t.description || "",
          datatype: t.datatype || "string",
          fmClass: t.fm_class || null,
          update_perm: t.update_perm || null,
        }));

        return successResponse({ settings, settingTypes, orgId });
      }

      case "circ_policies": {
        // Query config.circ_matrix_matchpoint
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.ccmm.atomic", [
          authtoken,
          { id: { "!=": null } },
          {
            flesh: 2,
            flesh_fields: {
              ccmm: [
                "org_unit",
                "grp",
                "copy_circ_lib",
                "copy_owning_lib",
                "copy_location",
                "circulate",
              ],
            },
            limit,
            offset,
            order_by: { ccmm: "id" },
          },
        ]);

        const policies = payloadFirstArray(response).map((p: Record<string, unknown>) => ({
          id: fieldValue(p, "id", CCMM_FIELDS),
          active: fieldBool(p, "active", CCMM_FIELDS) ?? false,
          orgUnit:
            typeof p?.org_unit === "object"
              ? fieldValue(p.org_unit, "id", AOU_FIELDS)
              : fieldValue(p, "org_unit", CCMM_FIELDS),
          orgUnitName:
            typeof p?.org_unit === "object"
              ? fieldValue(p.org_unit, "shortname", AOU_FIELDS)
              : null,
          grp:
            typeof p?.grp === "object"
              ? fieldValue(p.grp, "id", PGT_FIELDS)
              : fieldValue(p, "grp", CCMM_FIELDS),
          grpName: typeof p?.grp === "object" ? fieldValue(p.grp, "name", PGT_FIELDS) : null,
          circModifier: fieldValue(p, "circ_modifier", CCMM_FIELDS),
          copyLocation:
            typeof p?.copy_location === "object"
              ? fieldValue(p.copy_location, "id", ACPL_FIELDS)
              : fieldValue(p, "copy_location", CCMM_FIELDS),
          copyLocationName:
            typeof p?.copy_location === "object"
              ? fieldValue(p.copy_location, "name", ACPL_FIELDS)
              : null,
          isRenewal: fieldValue(p, "is_renewal", CCMM_FIELDS),
          refFlag: fieldValue(p, "ref_flag", CCMM_FIELDS),
          usrAgeUpperBound: fieldValue(p, "usr_age_upper_bound", CCMM_FIELDS),
          usrAgeLowerBound: fieldValue(p, "usr_age_lower_bound", CCMM_FIELDS),
          itemAgeRange: fieldValue(p, "item_age", CCMM_FIELDS),
          circulate: fieldBool(p, "circulate", CCMM_FIELDS) ?? false,
          durationRule: fieldValue(p, "duration_rule", CCMM_FIELDS),
          recurringFineRule: fieldValue(p, "recurring_fine_rule", CCMM_FIELDS),
          maxFineRule: fieldValue(p, "max_fine_rule", CCMM_FIELDS),
          hardDueDate: fieldValue(p, "hard_due_date", CCMM_FIELDS),
          renewalExtends: fieldValue(p, "renewals", CCMM_FIELDS),
          gracePeriod: fieldValue(p, "grace_period", CCMM_FIELDS),
        }));

        return successResponse({ policies, orgId });
      }

      case "copy_locations": {
        // Query asset.copy_location
        const locQuery: Record<string, unknown> = search
          ? { name: { "~*": search } }
          : { id: { "!=": null } };

        // Filter by org if specified
        if (orgIdParam) {
          locQuery.owning_lib = orgId;
        }

        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acpl.atomic", [
          authtoken,
          locQuery,
          {
            flesh: 1,
            flesh_fields: { acpl: ["owning_lib"] },
            limit,
            offset,
            order_by: { acpl: "name" },
          },
        ]);

        const locations = payloadFirstArray(response)
          .map((loc: Record<string, unknown>) => ({
            id: fieldValue(loc, "id", ACPL_FIELDS),
            name: fieldValue(loc, "name", ACPL_FIELDS),
            owningLib:
              typeof loc?.owning_lib === "object"
                ? fieldValue(loc.owning_lib, "id", AOU_FIELDS)
                : fieldValue(loc, "owning_lib", ACPL_FIELDS),
            owningLibName:
              typeof loc?.owning_lib === "object"
                ? fieldValue(loc.owning_lib, "shortname", AOU_FIELDS)
                : null,
            holdable: fieldBool(loc, "holdable", ACPL_FIELDS) ?? false,
            holdVerify: fieldBool(loc, "hold_verify", ACPL_FIELDS) ?? false,
            opacVisible: fieldBool(loc, "opac_visible", ACPL_FIELDS) ?? false,
            circulate: fieldBool(loc, "circulate", ACPL_FIELDS) ?? false,
            label: fieldValue(loc, "name", ACPL_FIELDS),
            labelPrefix: fieldValue(loc, "label_prefix", ACPL_FIELDS),
            labelSuffix: fieldValue(loc, "label_suffix", ACPL_FIELDS),
            checkInAlert: fieldBool(loc, "checkin_alert", ACPL_FIELDS) ?? false,
            deleted: fieldBool(loc, "deleted", ACPL_FIELDS) ?? false,
            url: fieldValue(loc, "url", ACPL_FIELDS),
          }))
          .filter((l) => !l.deleted);

        return successResponse({ locations, orgId });
      }

      default:
        return errorResponse(
          "Invalid type parameter. Use: org_settings, circ_policies, or copy_locations",
          400
        );
    }
  } catch (error: unknown) {
    return serverErrorResponse(error, "Admin Settings GET", req);
  }
}

// ============================================================================
// POST - Create or update admin settings
// ============================================================================

export async function POST(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { action, type, orgId: bodyOrgId } = body;
    const data = body.data as Record<string, unknown> | undefined;

    // Require admin permissions for modifications
    const { authtoken, actor } = await requirePermissions(["ADMIN_ORG_UNIT_SETTING_TYPE"]);

    const orgId = (bodyOrgId as number | undefined) ?? actor?.ws_ou ?? actor?.home_ou ?? 1;

    logger.info(
      { requestId, route: "api.evergreen.admin-settings", action, type },
      "Admin settings update"
    );

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
          [authtoken, orgId, { [String(data.name)]: value }]
        );

        const result = payloadFirst(response);

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

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.acpl", [
            authtoken,
            newLocation,
          ]);

          const result = payloadFirst(response);

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

          const existing = payloadFirst(fetchResponse);
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
              data.holdable !== undefined
                ? data.holdable
                  ? "t"
                  : "f"
                : (existing?.holdable ?? existing?.__p?.[3]),
              data.holdVerify !== undefined
                ? data.holdVerify
                  ? "t"
                  : "f"
                : (existing?.hold_verify ?? existing?.__p?.[4]),
              data.opacVisible !== undefined
                ? data.opacVisible
                  ? "t"
                  : "f"
                : (existing?.opac_visible ?? existing?.__p?.[5]),
              data.circulate !== undefined
                ? data.circulate
                  ? "t"
                  : "f"
                : (existing?.circulate ?? existing?.__p?.[6]),
              data.label ?? existing?.label ?? existing?.__p?.[7],
              data.labelPrefix ?? existing?.label_prefix ?? existing?.__p?.[8],
              data.labelSuffix ?? existing?.label_suffix ?? existing?.__p?.[9],
              data.checkInAlert !== undefined
                ? data.checkInAlert
                  ? "t"
                  : "f"
                : (existing?.checkin_alert ?? existing?.__p?.[10]),
              existing?.deleted ?? existing?.__p?.[11] ?? "f",
              data.url ?? existing?.url ?? existing?.__p?.[12],
            ],
          };

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.acpl", [
            authtoken,
            updatePayload,
          ]);

          const result = payloadFirst(response);

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

          const existing = payloadFirst(fetchResponse);
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

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.acpl", [
            authtoken,
            deletePayload,
          ]);

          const result = payloadFirst(response);

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
  } catch (error: unknown) {
    return serverErrorResponse(error, "Admin Settings POST", req);
  }
}
