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
  CHMM_FIELDS,
  CRCD_FIELDS,
  CRRF_FIELDS,
  CRMF_FIELDS,
  PGT_FIELDS,
  AOU_FIELDS,
  ACPL_FIELDS,
} from "@/lib/api";
import { featureFlags } from "@/lib/feature-flags";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";

// ============================================================================
// GET - Fetch circulation and hold policies
// ============================================================================

const policiesPostSchema = z
  .object({
    action: z.string().trim().min(1),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // circ, hold, duration_rules, fine_rules, max_fine_rules
    const limit = parseInt(searchParams.get("limit") || "200", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);

    logger.info({ requestId, route: "api.evergreen.policies", type }, "Policies request");

    switch (type) {
      case "circ": {
        // Query config.circ_matrix_matchpoint
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.ccmm.atomic", [
          authtoken,
          { id: { "!=": null } },
          {
            flesh: 3,
            flesh_fields: {
              ccmm: [
                "org_unit",
                "grp",
                "copy_location",
                "duration_rule",
                "recurring_fine_rule",
                "max_fine_rule",
              ],
              pgt: [],
              aou: [],
              acpl: [],
            },
            limit,
            offset,
            order_by: { ccmm: "id" },
          },
        ]);

        const policies = payloadFirstArray(response).map((p: any) => ({
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
          itemAge: fieldValue(p, "item_age", CCMM_FIELDS),
          circulate: fieldBool(p, "circulate", CCMM_FIELDS) ?? false,
          durationRule:
            typeof p?.duration_rule === "object"
              ? fieldValue(p.duration_rule, "id", CRCD_FIELDS)
              : fieldValue(p, "duration_rule", CCMM_FIELDS),
          durationRuleName:
            typeof p?.duration_rule === "object"
              ? fieldValue(p.duration_rule, "name", CRCD_FIELDS)
              : null,
          recurringFineRule:
            typeof p?.recurring_fine_rule === "object"
              ? fieldValue(p.recurring_fine_rule, "id", CRRF_FIELDS)
              : fieldValue(p, "recurring_fine_rule", CCMM_FIELDS),
          recurringFineRuleName:
            typeof p?.recurring_fine_rule === "object"
              ? fieldValue(p.recurring_fine_rule, "name", CRRF_FIELDS)
              : null,
          maxFineRule:
            typeof p?.max_fine_rule === "object"
              ? fieldValue(p.max_fine_rule, "id", CRMF_FIELDS)
              : fieldValue(p, "max_fine_rule", CCMM_FIELDS),
          maxFineRuleName:
            typeof p?.max_fine_rule === "object"
              ? fieldValue(p.max_fine_rule, "name", CRMF_FIELDS)
              : null,
          hardDueDate: fieldValue(p, "hard_due_date", CCMM_FIELDS),
          renewals: fieldValue(p, "renewals", CCMM_FIELDS),
          gracePeriod: fieldValue(p, "grace_period", CCMM_FIELDS),
          scriptTest: fieldValue(p, "script_test", CCMM_FIELDS),
          totalCopyHold: fieldValue(p, "total_copy_hold_ratio", CCMM_FIELDS),
          availableCopyHold: fieldValue(p, "available_copy_hold_ratio", CCMM_FIELDS),
          description: fieldValue(p, "description", CCMM_FIELDS),
        }));

        return successResponse({ policies });
      }

      case "hold": {
        // Query config.hold_matrix_matchpoint
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.chmm.atomic", [
          authtoken,
          { id: { "!=": null } },
          {
            flesh: 2,
            flesh_fields: {
              chmm: [
                "requestor_grp",
                "usr_grp",
                "pickup_ou",
                "request_ou",
                "item_owning_ou",
                "item_circ_ou",
              ],
            },
            limit,
            offset,
            order_by: { chmm: "id" },
          },
        ]);

        const policies = payloadFirstArray(response).map((p: any) => ({
          id: fieldValue(p, "id", CHMM_FIELDS),
          active: fieldBool(p, "active", CHMM_FIELDS) ?? false,
          strictOuMatch: fieldBool(p, "strict_ou_match", CHMM_FIELDS) ?? false,
          userHomeOu: fieldValue(p, "user_home_ou", CHMM_FIELDS),
          requestorGrp:
            typeof p?.requestor_grp === "object"
              ? fieldValue(p.requestor_grp, "id", PGT_FIELDS)
              : fieldValue(p, "requestor_grp", CHMM_FIELDS),
          requestorGrpName:
            typeof p?.requestor_grp === "object"
              ? fieldValue(p.requestor_grp, "name", PGT_FIELDS)
              : null,
          usrGrp:
            typeof p?.usr_grp === "object"
              ? fieldValue(p.usr_grp, "id", PGT_FIELDS)
              : fieldValue(p, "usr_grp", CHMM_FIELDS),
          usrGrpName:
            typeof p?.usr_grp === "object" ? fieldValue(p.usr_grp, "name", PGT_FIELDS) : null,
          pickupOu:
            typeof p?.pickup_ou === "object"
              ? fieldValue(p.pickup_ou, "id", AOU_FIELDS)
              : fieldValue(p, "pickup_ou", CHMM_FIELDS),
          pickupOuName:
            typeof p?.pickup_ou === "object"
              ? fieldValue(p.pickup_ou, "shortname", AOU_FIELDS)
              : null,
          requestOu:
            typeof p?.request_ou === "object"
              ? fieldValue(p.request_ou, "id", AOU_FIELDS)
              : fieldValue(p, "request_ou", CHMM_FIELDS),
          requestOuName:
            typeof p?.request_ou === "object"
              ? fieldValue(p.request_ou, "shortname", AOU_FIELDS)
              : null,
          itemOwningOu:
            typeof p?.item_owning_ou === "object"
              ? fieldValue(p.item_owning_ou, "id", AOU_FIELDS)
              : fieldValue(p, "item_owning_ou", CHMM_FIELDS),
          itemOwningOuName:
            typeof p?.item_owning_ou === "object"
              ? fieldValue(p.item_owning_ou, "shortname", AOU_FIELDS)
              : null,
          itemCircOu:
            typeof p?.item_circ_ou === "object"
              ? fieldValue(p.item_circ_ou, "id", AOU_FIELDS)
              : fieldValue(p, "item_circ_ou", CHMM_FIELDS),
          itemCircOuName:
            typeof p?.item_circ_ou === "object"
              ? fieldValue(p.item_circ_ou, "shortname", AOU_FIELDS)
              : null,
          circModifier: fieldValue(p, "circ_modifier", CHMM_FIELDS),
          marcTypeCode: fieldValue(p, "marc_type", CHMM_FIELDS),
          marcFormCode: fieldValue(p, "marc_form", CHMM_FIELDS),
          marcVrFormat: fieldValue(p, "marc_vr_format", CHMM_FIELDS),
          refFlag: fieldValue(p, "ref_flag", CHMM_FIELDS),
          itemAge: fieldValue(p, "item_age", CHMM_FIELDS),
          holdable: fieldBool(p, "holdable", CHMM_FIELDS) ?? false,
          distanceIsFromOwning: fieldBool(p, "distance_is_from_owner", CHMM_FIELDS) ?? false,
          transitRange: fieldValue(p, "transit_range", CHMM_FIELDS),
          maxHolds: fieldValue(p, "max_holds", CHMM_FIELDS),
          includeLocallyFrozen: fieldBool(p, "include_frozen_holds", CHMM_FIELDS) ?? false,
          stopBlockedUser: fieldBool(p, "stop_blocked_user", CHMM_FIELDS) ?? false,
          ageProtection: fieldValue(p, "age_hold_protect_rule", CHMM_FIELDS),
          description: fieldValue(p, "description", CHMM_FIELDS),
        }));

        return successResponse({ policies });
      }

      case "duration_rules": {
        // Query config.rule_circ_duration
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.crcd.atomic", [
          authtoken,
          { id: { "!=": null } },
          { limit: 500, order_by: { crcd: "name" } },
        ]);

        const rules = payloadFirstArray(response).map((r: any) => ({
          id: fieldValue(r, "id", CRCD_FIELDS),
          name: fieldValue(r, "name", CRCD_FIELDS),
          extended: fieldValue(r, "extended", CRCD_FIELDS),
          normal: fieldValue(r, "normal", CRCD_FIELDS),
          shrt: fieldValue(r, "shrt", CRCD_FIELDS),
          maxRenewals: fieldValue(r, "max_renewals", CRCD_FIELDS),
          maxAutoRenewals: fieldValue(r, "max_auto_renewals", CRCD_FIELDS),
        }));

        return successResponse({ rules });
      }

      case "fine_rules": {
        // Query config.rule_recurring_fine
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.crrf.atomic", [
          authtoken,
          { id: { "!=": null } },
          { limit: 500, order_by: { crrf: "name" } },
        ]);

        const rules = payloadFirstArray(response).map((r: any) => ({
          id: fieldValue(r, "id", CRRF_FIELDS),
          name: fieldValue(r, "name", CRRF_FIELDS),
          high: fieldValue(r, "high", CRRF_FIELDS),
          normal: fieldValue(r, "normal", CRRF_FIELDS),
          low: fieldValue(r, "low", CRRF_FIELDS),
          recurrenceInterval: fieldValue(r, "recurrence_interval", CRRF_FIELDS),
          gracePeriod: fieldValue(r, "grace_period", CRRF_FIELDS),
        }));

        return successResponse({ rules });
      }

      case "max_fine_rules": {
        // Query config.rule_max_fine
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.crmf.atomic", [
          authtoken,
          { id: { "!=": null } },
          { limit: 500, order_by: { crmf: "name" } },
        ]);

        const rules = payloadFirstArray(response).map((r: any) => ({
          id: fieldValue(r, "id", CRMF_FIELDS),
          name: fieldValue(r, "name", CRMF_FIELDS),
          amount: fieldValue(r, "amount", CRMF_FIELDS),
          isByPercent: fieldBool(r, "is_percent", CRMF_FIELDS) ?? false,
        }));

        return successResponse({ rules });
      }

      default:
        return errorResponse(
          "Invalid type parameter. Use: circ, hold, duration_rules, fine_rules, or max_fine_rules",
          400
        );
    }
  } catch (error: any) {
    return serverErrorResponse(error, "Policies GET", req);
  }
}

// ============================================================================
// POST - Create or update policies
// ============================================================================

export async function POST(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    if (!featureFlags.policyEditors) {
      return errorResponse("Policy editors are disabled", 403);
    }

    const body = policiesPostSchema.parse(await req.json());
    const { action } = body;
    const { type, data } = body as Record<string, any>;

    // Require admin permissions for modifications
    const { authtoken, actor } = await requirePermissions(["ADMIN_CIRC_MATRIX_MATCHPOINT"]);

    logger.info({ requestId, route: "api.evergreen.policies", action, type }, "Policies update");

    const requestMeta = getRequestMeta(req);
    const auditBase = {
      actor,
      orgId: actor?.ws_ou ?? actor?.home_ou,
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
      requestId: requestMeta.requestId,
    };

    const audit = async (event: {
      action: string;
      entity: string;
      entityId?: string | number;
      status: "success" | "failure";
      details?: Record<string, any>;
      error?: string | null;
    }) => {
      try {
        await logAuditEvent({
          ...auditBase,
          ...event,
        });
      } catch {
        // Audit must never break the request path.
      }
    };

    const toTriBool = (value: unknown): "t" | "f" | null => {
      if (value === null || value === undefined) return null;
      if (value === "t" || value === true) return "t";
      if (value === "f" || value === false) return "f";
      return null;
    };

    switch (type) {
      case "circ": {
        if (action === "create") {
          if (!data?.orgUnit) {
            return errorResponse("Organization unit is required", 400);
          }

          const newPolicy = {
            __c: "ccmm",
            __p: [
              null, // id
              data.active !== false ? "t" : "f",
              data.orgUnit,
              data.grp || null,
              data.circModifier || null,
              data.copyLocation || null,
              toTriBool(data.isRenewal),
              toTriBool(data.refFlag),
              data.usrAgeUpperBound || null,
              data.usrAgeLowerBound || null,
              data.itemAge || null,
              data.circulate !== false ? "t" : "f",
              data.durationRule || null,
              data.recurringFineRule || null,
              data.maxFineRule || null,
              data.hardDueDate || null,
              data.renewals || null,
              data.gracePeriod || null,
              data.scriptTest || null,
              data.totalCopyHold || null,
              data.availableCopyHold || null,
              data.description || null,
            ],
          };

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.ccmm", [
            authtoken,
            newPolicy,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "policy.circ.create",
              entity: "ccmm",
              status: "failure",
              details: { type, action, data: { ...data, orgUnit: data?.orgUnit } },
              error: result.textcode || "Failed to create policy",
            });
            return errorResponse(result.textcode || "Failed to create policy", 400, result);
          }

          const createdId = result?.id ?? result?.__p?.[0];
          await audit({
            action: "policy.circ.create",
            entity: "ccmm",
            entityId: createdId,
            status: "success",
            details: { type, action, id: createdId },
          });

          return successResponse({
            created: true,
            id: createdId,
          });
        }

        if (action === "update") {
          if (!data?.id) {
            return errorResponse("Policy ID is required", 400);
          }

          // Fetch existing policy first
          const fetchResponse = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.retrieve.ccmm",
            [authtoken, data.id]
          );

          const existing = fetchResponse?.payload?.[0] as any;
          if (!existing) {
            return errorResponse("Policy not found", 404);
          }

          const getValue = (newVal: unknown, existingField: string, idx: number) => {
            if (newVal !== undefined) return newVal;
            return existing?.[existingField] ?? existing?.__p?.[idx];
          };

          const getBoolValue = (newVal: unknown, existingField: string, idx: number) => {
            if (newVal !== undefined) return newVal ? "t" : "f";
            const existingVal = existing?.[existingField] ?? existing?.__p?.[idx];
            if (existingVal === null || existingVal === undefined) return null;
            return existingVal === "t" || existingVal === true ? "t" : "f";
          };

          const getTriBoolValue = (newVal: unknown, existingField: string, idx: number) => {
            if (newVal === null) return null;
            if (newVal !== undefined) return newVal ? "t" : "f";
            const existingVal = existing?.[existingField] ?? existing?.__p?.[idx];
            if (existingVal === null || existingVal === undefined) return null;
            return existingVal === "t" || existingVal === true ? "t" : "f";
          };

          const updatePayload = {
            __c: "ccmm",
            __p: [
              data.id,
              getBoolValue(data.active, "active", 1),
              getValue(data.orgUnit, "org_unit", 2),
              getValue(data.grp, "grp", 3),
              getValue(data.circModifier, "circ_modifier", 4),
              getValue(data.copyLocation, "copy_location", 5),
              getTriBoolValue(data.isRenewal, "is_renewal", 6),
              getTriBoolValue(data.refFlag, "ref_flag", 7),
              getValue(data.usrAgeUpperBound, "usr_age_upper_bound", 8),
              getValue(data.usrAgeLowerBound, "usr_age_lower_bound", 9),
              getValue(data.itemAge, "item_age", 10),
              getBoolValue(data.circulate, "circulate", 11),
              getValue(data.durationRule, "duration_rule", 12),
              getValue(data.recurringFineRule, "recurring_fine_rule", 13),
              getValue(data.maxFineRule, "max_fine_rule", 14),
              getValue(data.hardDueDate, "hard_due_date", 15),
              getValue(data.renewals, "renewals", 16),
              getValue(data.gracePeriod, "grace_period", 17),
              getValue(data.scriptTest, "script_test", 18),
              getValue(data.totalCopyHold, "total_copy_hold_ratio", 19),
              getValue(data.availableCopyHold, "available_copy_hold_ratio", 20),
              getValue(data.description, "description", 21),
            ],
          };

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.ccmm", [
            authtoken,
            updatePayload,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "policy.circ.update",
              entity: "ccmm",
              entityId: data.id,
              status: "failure",
              details: { type, action, id: data.id, data },
              error: result.textcode || "Failed to update policy",
            });
            return errorResponse(result.textcode || "Failed to update policy", 400, result);
          }

          await audit({
            action: "policy.circ.update",
            entity: "ccmm",
            entityId: data.id,
            status: "success",
            details: { type, action, id: data.id },
          });

          return successResponse({
            updated: true,
            id: data.id,
          });
        }

        if (action === "delete") {
          if (!data?.id) {
            return errorResponse("Policy ID is required", 400);
          }

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.ccmm", [
            authtoken,
            data.id,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "policy.circ.delete",
              entity: "ccmm",
              entityId: data.id,
              status: "failure",
              details: { type, action, id: data.id },
              error: result.textcode || "Failed to delete policy",
            });
            return errorResponse(result.textcode || "Failed to delete policy", 400, result);
          }

          await audit({
            action: "policy.circ.delete",
            entity: "ccmm",
            entityId: data.id,
            status: "success",
            details: { type, action, id: data.id },
          });

          return successResponse({
            deleted: true,
            id: data.id,
          });
        }

        return errorResponse("Invalid action for circ type", 400);
      }

      case "hold": {
        if (action === "create") {
          const newPolicy = {
            __c: "chmm",
            __p: [
              null, // id
              data.active !== false ? "t" : "f",
              data.strictOuMatch ? "t" : "f",
              data.userHomeOu || null,
              data.requestorGrp || null,
              data.usrGrp || null,
              data.pickupOu || null,
              data.requestOu || null,
              data.itemOwningOu || null,
              data.itemCircOu || null,
              data.circModifier || null,
              data.marcTypeCode || null,
              data.marcFormCode || null,
              data.marcVrFormat || null,
              toTriBool(data.refFlag),
              data.itemAge || null,
              data.holdable !== false ? "t" : "f",
              data.distanceIsFromOwning ? "t" : "f",
              data.transitRange || null,
              data.maxHolds || null,
              data.includeLocallyFrozen ? "t" : "f",
              data.stopBlockedUser ? "t" : "f",
              data.ageProtection || null,
              data.description || null,
            ],
          };

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.chmm", [
            authtoken,
            newPolicy,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "policy.hold.create",
              entity: "chmm",
              status: "failure",
              details: { type, action, data },
              error: result.textcode || "Failed to create hold policy",
            });
            return errorResponse(result.textcode || "Failed to create hold policy", 400, result);
          }

          const createdId = result?.id ?? result?.__p?.[0];
          await audit({
            action: "policy.hold.create",
            entity: "chmm",
            entityId: createdId,
            status: "success",
            details: { type, action, id: createdId },
          });

          return successResponse({
            created: true,
            id: createdId,
          });
        }

        if (action === "update") {
          if (!data?.id) {
            return errorResponse("Policy ID is required", 400);
          }

          // Fetch existing policy first
          const fetchResponse = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.retrieve.chmm",
            [authtoken, data.id]
          );

          const existing = fetchResponse?.payload?.[0] as any;
          if (!existing) {
            return errorResponse("Policy not found", 404);
          }

          const getValue = (newVal: unknown, existingField: string, idx: number) => {
            if (newVal !== undefined) return newVal;
            return existing?.[existingField] ?? existing?.__p?.[idx];
          };

          const getBoolValue = (newVal: unknown, existingField: string, idx: number) => {
            if (newVal !== undefined) return newVal ? "t" : "f";
            const existingVal = existing?.[existingField] ?? existing?.__p?.[idx];
            if (existingVal === null || existingVal === undefined) return null;
            return existingVal === "t" || existingVal === true ? "t" : "f";
          };

          const getTriBoolValue = (newVal: unknown, existingField: string, idx: number) => {
            if (newVal === null) return null;
            if (newVal !== undefined) return newVal ? "t" : "f";
            const existingVal = existing?.[existingField] ?? existing?.__p?.[idx];
            if (existingVal === null || existingVal === undefined) return null;
            return existingVal === "t" || existingVal === true ? "t" : "f";
          };

          const updatePayload = {
            __c: "chmm",
            __p: [
              data.id,
              getBoolValue(data.active, "active", 1),
              getBoolValue(data.strictOuMatch, "strict_ou_match", 2),
              getValue(data.userHomeOu, "user_home_ou", 3),
              getValue(data.requestorGrp, "requestor_grp", 4),
              getValue(data.usrGrp, "usr_grp", 5),
              getValue(data.pickupOu, "pickup_ou", 6),
              getValue(data.requestOu, "request_ou", 7),
              getValue(data.itemOwningOu, "item_owning_ou", 8),
              getValue(data.itemCircOu, "item_circ_ou", 9),
              getValue(data.circModifier, "circ_modifier", 10),
              getValue(data.marcTypeCode, "marc_type", 11),
              getValue(data.marcFormCode, "marc_form", 12),
              getValue(data.marcVrFormat, "marc_vr_format", 13),
              getTriBoolValue(data.refFlag, "ref_flag", 14),
              getValue(data.itemAge, "item_age", 15),
              getBoolValue(data.holdable, "holdable", 16),
              getBoolValue(data.distanceIsFromOwning, "distance_is_from_owning", 17),
              getValue(data.transitRange, "transit_range", 18),
              getValue(data.maxHolds, "max_holds", 19),
              getBoolValue(data.includeLocallyFrozen, "include_frozen_holds", 20),
              getBoolValue(data.stopBlockedUser, "stop_blocked_user", 21),
              getValue(data.ageProtection, "age_hold_protect_rule", 22),
              getValue(data.description, "description", 23),
            ],
          };

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.chmm", [
            authtoken,
            updatePayload,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "policy.hold.update",
              entity: "chmm",
              entityId: data.id,
              status: "failure",
              details: { type, action, id: data.id, data },
              error: result.textcode || "Failed to update hold policy",
            });
            return errorResponse(result.textcode || "Failed to update hold policy", 400, result);
          }

          await audit({
            action: "policy.hold.update",
            entity: "chmm",
            entityId: data.id,
            status: "success",
            details: { type, action, id: data.id },
          });

          return successResponse({
            updated: true,
            id: data.id,
          });
        }

        if (action === "delete") {
          if (!data?.id) {
            return errorResponse("Policy ID is required", 400);
          }

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.chmm", [
            authtoken,
            data.id,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "policy.hold.delete",
              entity: "chmm",
              entityId: data.id,
              status: "failure",
              details: { type, action, id: data.id },
              error: result.textcode || "Failed to delete hold policy",
            });
            return errorResponse(result.textcode || "Failed to delete hold policy", 400, result);
          }

          await audit({
            action: "policy.hold.delete",
            entity: "chmm",
            entityId: data.id,
            status: "success",
            details: { type, action, id: data.id },
          });

          return successResponse({
            deleted: true,
            id: data.id,
          });
        }

        return errorResponse("Invalid action for hold type", 400);
      }

      default:
        return errorResponse("Invalid type. Use: circ or hold", 400);
    }
  } catch (error: any) {
    return serverErrorResponse(error, "Policies POST", req);
  }
}
