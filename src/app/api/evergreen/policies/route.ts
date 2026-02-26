import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
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

        const policies = (response?.payload?.[0] || []).map((p: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] ?? obj?.__p?.[idx];
          };

          const extractNested = (obj: any, nameField: string, nameIdx: number) => {
            if (!obj || typeof obj !== "object") return null;
            return obj?.[nameField] ?? obj?.__p?.[nameIdx];
          };

          return {
            id: extract(p, "id", 0),
            active: extract(p, "active", 1) === "t" || extract(p, "active", 1) === true,
            orgUnit:
              typeof p?.org_unit === "object"
                ? extractNested(p.org_unit, "id", 0)
                : extract(p, "org_unit", 2),
            orgUnitName:
              typeof p?.org_unit === "object" ? extractNested(p.org_unit, "shortname", 2) : null,
            grp: typeof p?.grp === "object" ? extractNested(p.grp, "id", 0) : extract(p, "grp", 3),
            grpName: typeof p?.grp === "object" ? extractNested(p.grp, "name", 1) : null,
            circModifier: extract(p, "circ_modifier", 4),
            copyLocation:
              typeof p?.copy_location === "object"
                ? extractNested(p.copy_location, "id", 0)
                : extract(p, "copy_location", 5),
            copyLocationName:
              typeof p?.copy_location === "object"
                ? extractNested(p.copy_location, "name", 1)
                : null,
            isRenewal: extract(p, "is_renewal", 6),
            refFlag: extract(p, "ref_flag", 7),
            usrAgeUpperBound: extract(p, "usr_age_upper_bound", 8),
            usrAgeLowerBound: extract(p, "usr_age_lower_bound", 9),
            itemAge: extract(p, "item_age", 10),
            circulate: extract(p, "circulate", 11) === "t" || extract(p, "circulate", 11) === true,
            durationRule:
              typeof p?.duration_rule === "object"
                ? extractNested(p.duration_rule, "id", 0)
                : extract(p, "duration_rule", 12),
            durationRuleName:
              typeof p?.duration_rule === "object"
                ? extractNested(p.duration_rule, "name", 1)
                : null,
            recurringFineRule:
              typeof p?.recurring_fine_rule === "object"
                ? extractNested(p.recurring_fine_rule, "id", 0)
                : extract(p, "recurring_fine_rule", 13),
            recurringFineRuleName:
              typeof p?.recurring_fine_rule === "object"
                ? extractNested(p.recurring_fine_rule, "name", 1)
                : null,
            maxFineRule:
              typeof p?.max_fine_rule === "object"
                ? extractNested(p.max_fine_rule, "id", 0)
                : extract(p, "max_fine_rule", 14),
            maxFineRuleName:
              typeof p?.max_fine_rule === "object"
                ? extractNested(p.max_fine_rule, "name", 1)
                : null,
            hardDueDate: extract(p, "hard_due_date", 15),
            renewals: extract(p, "renewals", 16),
            gracePeriod: extract(p, "grace_period", 17),
            scriptTest: extract(p, "script_test", 18),
            totalCopyHold: extract(p, "total_copy_hold_ratio", 19),
            availableCopyHold: extract(p, "available_copy_hold_ratio", 20),
            description: extract(p, "description", 21),
          };
        });

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

        const policies = (response?.payload?.[0] || []).map((p: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] ?? obj?.__p?.[idx];
          };

          const extractNested = (obj: any, nameField: string, nameIdx: number) => {
            if (!obj || typeof obj !== "object") return null;
            return obj?.[nameField] ?? obj?.__p?.[nameIdx];
          };

          return {
            id: extract(p, "id", 0),
            active: extract(p, "active", 1) === "t" || extract(p, "active", 1) === true,
            strictOuMatch:
              extract(p, "strict_ou_match", 2) === "t" || extract(p, "strict_ou_match", 2) === true,
            userHomeOu: extract(p, "user_home_ou", 3),
            requestorGrp:
              typeof p?.requestor_grp === "object"
                ? extractNested(p.requestor_grp, "id", 0)
                : extract(p, "requestor_grp", 4),
            requestorGrpName:
              typeof p?.requestor_grp === "object"
                ? extractNested(p.requestor_grp, "name", 1)
                : null,
            usrGrp:
              typeof p?.usr_grp === "object"
                ? extractNested(p.usr_grp, "id", 0)
                : extract(p, "usr_grp", 5),
            usrGrpName: typeof p?.usr_grp === "object" ? extractNested(p.usr_grp, "name", 1) : null,
            pickupOu:
              typeof p?.pickup_ou === "object"
                ? extractNested(p.pickup_ou, "id", 0)
                : extract(p, "pickup_ou", 6),
            pickupOuName:
              typeof p?.pickup_ou === "object" ? extractNested(p.pickup_ou, "shortname", 2) : null,
            requestOu:
              typeof p?.request_ou === "object"
                ? extractNested(p.request_ou, "id", 0)
                : extract(p, "request_ou", 7),
            requestOuName:
              typeof p?.request_ou === "object"
                ? extractNested(p.request_ou, "shortname", 2)
                : null,
            itemOwningOu:
              typeof p?.item_owning_ou === "object"
                ? extractNested(p.item_owning_ou, "id", 0)
                : extract(p, "item_owning_ou", 8),
            itemOwningOuName:
              typeof p?.item_owning_ou === "object"
                ? extractNested(p.item_owning_ou, "shortname", 2)
                : null,
            itemCircOu:
              typeof p?.item_circ_ou === "object"
                ? extractNested(p.item_circ_ou, "id", 0)
                : extract(p, "item_circ_ou", 9),
            itemCircOuName:
              typeof p?.item_circ_ou === "object"
                ? extractNested(p.item_circ_ou, "shortname", 2)
                : null,
            circModifier: extract(p, "circ_modifier", 10),
            marcTypeCode: extract(p, "marc_type", 11),
            marcFormCode: extract(p, "marc_form", 12),
            marcVrFormat: extract(p, "marc_vr_format", 13),
            refFlag: extract(p, "ref_flag", 14),
            itemAge: extract(p, "item_age", 15),
            holdable: extract(p, "holdable", 16) === "t" || extract(p, "holdable", 16) === true,
            distanceIsFromOwning:
              extract(p, "distance_is_from_owning", 17) === "t" ||
              extract(p, "distance_is_from_owning", 17) === true,
            transitRange: extract(p, "transit_range", 18),
            maxHolds: extract(p, "max_holds", 19),
            includeLocallyFrozen:
              extract(p, "include_frozen_holds", 20) === "t" ||
              extract(p, "include_frozen_holds", 20) === true,
            stopBlockedUser:
              extract(p, "stop_blocked_user", 21) === "t" ||
              extract(p, "stop_blocked_user", 21) === true,
            ageProtection: extract(p, "age_hold_protect_rule", 22),
            description: extract(p, "description", 23),
          };
        });

        return successResponse({ policies });
      }

      case "duration_rules": {
        // Query config.rule_circ_duration
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.crcd.atomic", [
          authtoken,
          { id: { "!=": null } },
          { limit: 500, order_by: { crcd: "name" } },
        ]);

        const rules = (response?.payload?.[0] || []).map((r: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] ?? obj?.__p?.[idx];
          };

          return {
            id: extract(r, "id", 0),
            name: extract(r, "name", 1),
            extended: extract(r, "extended", 2),
            normal: extract(r, "normal", 3),
            shrt: extract(r, "shrt", 4),
            maxRenewals: extract(r, "max_renewals", 5),
            maxAutoRenewals: extract(r, "max_auto_renewals", 6),
          };
        });

        return successResponse({ rules });
      }

      case "fine_rules": {
        // Query config.rule_recurring_fine
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.crrf.atomic", [
          authtoken,
          { id: { "!=": null } },
          { limit: 500, order_by: { crrf: "name" } },
        ]);

        const rules = (response?.payload?.[0] || []).map((r: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] ?? obj?.__p?.[idx];
          };

          return {
            id: extract(r, "id", 0),
            name: extract(r, "name", 1),
            high: extract(r, "high", 2),
            normal: extract(r, "normal", 3),
            low: extract(r, "low", 4),
            recurrenceInterval: extract(r, "recurrence_interval", 5),
            gracePeriod: extract(r, "grace_period", 6),
          };
        });

        return successResponse({ rules });
      }

      case "max_fine_rules": {
        // Query config.rule_max_fine
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.crmf.atomic", [
          authtoken,
          { id: { "!=": null } },
          { limit: 500, order_by: { crmf: "name" } },
        ]);

        const rules = (response?.payload?.[0] || []).map((r: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] ?? obj?.__p?.[idx];
          };

          return {
            id: extract(r, "id", 0),
            name: extract(r, "name", 1),
            amount: extract(r, "amount", 2),
            isByPercent:
              extract(r, "is_percent", 3) === "t" || extract(r, "is_percent", 3) === true,
          };
        });

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
    const { action, type, data } = body as Record<string, any>;

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

          const result = response?.payload?.[0] as any as any;

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

          const result = response?.payload?.[0] as any as any;

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

          const result = response?.payload?.[0] as any as any;

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

          const result = response?.payload?.[0] as any as any;

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

          const result = response?.payload?.[0] as any as any;

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

          const result = response?.payload?.[0] as any as any;

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
