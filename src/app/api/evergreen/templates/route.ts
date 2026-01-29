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
// Interfaces
// ============================================================================

interface CopyTemplate {
  id: number;
  name: string;
  owningLib: number;
  owningLibName: string | null;
  status: number | null;
  statusName: string | null;
  location: number | null;
  locationName: string | null;
  circModifier: string | null;
  holdable: boolean;
  circulate: boolean;
  opacVisible: boolean;
  ref: boolean;
  price: number | null;
}

interface HoldingsTemplate {
  id: number;
  name: string;
  owningLib: number;
  owningLibName: string | null;
  callNumberPrefix: string | null;
  callNumberSuffix: string | null;
  classification: number | null;
  classificationName: string | null;
}

// ============================================================================
// GET - Fetch templates (copy or holdings)
// ============================================================================

export async function GET(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // copy or holdings
    const orgIdParam = searchParams.get("org_id");
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);

    const orgId = orgIdParam
      ? parseInt(orgIdParam, 10)
      : actor?.ws_ou ?? actor?.home_ou ?? 1;

    logger.info({ requestId, route: "api.evergreen.templates", type, orgId }, "Templates request");

    if (type === "copy") {
      // Fetch copy templates from asset.copy_template
      const response = await callOpenSRF(
        "open-ils.pcrud",
        "open-ils.pcrud.search.act.atomic",
        [
          authtoken,
          search
            ? { name: { "~*": search }, owning_lib: { ">=" : 1 } }
            : { owning_lib: { ">=" : 1 } },
          {
            flesh: 2,
            flesh_fields: {
              act: ["owning_lib", "status", "location", "circ_modifier"],
              aou: ["shortname"],
              ccs: ["name"],
              acpl: ["name"],
            },
            limit,
            offset,
            order_by: { act: "name" },
          },
        ]
      );

      const templates: CopyTemplate[] = (response?.payload?.[0] || []).map((t: Record<string, unknown>) => {
        const owningLibObj = t?.owning_lib as Record<string, unknown> | null;
        const statusObj = t?.status as Record<string, unknown> | null;
        const locationObj = t?.location as Record<string, unknown> | null;
        const circModObj = t?.circ_modifier as Record<string, unknown> | null;
        
        return {
          id: t?.id as number ?? 0,
          name: t?.name as string ?? "",
          owningLib: typeof owningLibObj === "object" && owningLibObj !== null 
            ? (owningLibObj?.id as number ?? 1) 
            : (t?.owning_lib as number ?? 1),
          owningLibName: typeof owningLibObj === "object" && owningLibObj !== null 
            ? (owningLibObj?.shortname as string ?? owningLibObj?.name as string ?? null) 
            : null,
          status: typeof statusObj === "object" && statusObj !== null 
            ? (statusObj?.id as number ?? null) 
            : (t?.status as number ?? null),
          statusName: typeof statusObj === "object" && statusObj !== null 
            ? (statusObj?.name as string ?? null) 
            : null,
          location: typeof locationObj === "object" && locationObj !== null 
            ? (locationObj?.id as number ?? null) 
            : (t?.location as number ?? null),
          locationName: typeof locationObj === "object" && locationObj !== null 
            ? (locationObj?.name as string ?? null) 
            : null,
          circModifier: typeof circModObj === "object" && circModObj !== null 
            ? (circModObj?.code as string ?? null) 
            : (t?.circ_modifier as string ?? null),
          holdable: t?.holdable as boolean ?? true,
          circulate: t?.circulate as boolean ?? true,
          opacVisible: t?.opac_visible as boolean ?? true,
          ref: t?.ref as boolean ?? false,
          price: t?.price as number ?? null,
        };
      });

      // Also fetch lookup data for dropdowns
      const [statusesRes, locationsRes, circModsRes] = await Promise.all([
        callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.ccs.atomic", [
          authtoken,
          { id: { ">=" : 0 } },
          { order_by: { ccs: "name" } },
        ]),
        callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acpl.atomic", [
          authtoken,
          { deleted: "f" },
          { order_by: { acpl: "name" }, limit: 500 },
        ]),
        callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.ccm.atomic", [
          authtoken,
          { id: { "!=": null } },
          { order_by: { ccm: "code" }, limit: 200 },
        ]),
      ]);

      const statuses = (statusesRes?.payload?.[0] || []).map((s: Record<string, unknown>) => ({
        id: s?.id as number ?? 0,
        name: s?.name as string ?? "",
      }));

      const locations = (locationsRes?.payload?.[0] || []).map((l: Record<string, unknown>) => ({
        id: l?.id as number ?? 0,
        name: l?.name as string ?? "",
        owningLib: l?.owning_lib as number ?? 1,
      }));

      const circModifiers = (circModsRes?.payload?.[0] || []).map((c: Record<string, unknown>) => ({
        code: c?.code as string ?? "",
        name: c?.name as string ?? c?.code as string ?? "",
        description: c?.description as string ?? "",
      }));

      return successResponse({
        templates,
        statuses,
        locations,
        circModifiers,
        orgId,
      });
    } else if (type === "holdings") {
      // Holdings templates - using a custom table or org unit settings
      // For now, we'll use a simplified approach storing in org settings
      // In a real implementation, this would query a holdings template table
      
      // Fetch call number classifications
      const classificationsRes = await callOpenSRF(
        "open-ils.pcrud",
        "open-ils.pcrud.search.acnc.atomic",
        [
          authtoken,
          { id: { ">=" : 1 } },
          { order_by: { acnc: "name" } },
        ]
      );

      const classifications = (classificationsRes?.payload?.[0] || []).map((c: Record<string, unknown>) => ({
        id: c?.id as number ?? 0,
        name: c?.name as string ?? "",
      }));

      // Fetch call number prefixes
      const prefixesRes = await callOpenSRF(
        "open-ils.pcrud",
        "open-ils.pcrud.search.acnp.atomic",
        [
          authtoken,
          { id: { ">=" : 1 } },
          { order_by: { acnp: "label" }, limit: 200 },
        ]
      );

      const prefixes = (prefixesRes?.payload?.[0] || []).map((p: Record<string, unknown>) => ({
        id: p?.id as number ?? 0,
        label: p?.label as string ?? "",
        owningLib: p?.owning_lib as number ?? 1,
      }));

      // Fetch call number suffixes  
      const suffixesRes = await callOpenSRF(
        "open-ils.pcrud",
        "open-ils.pcrud.search.acns.atomic",
        [
          authtoken,
          { id: { ">=" : 1 } },
          { order_by: { acns: "label" }, limit: 200 },
        ]
      );

      const suffixes = (suffixesRes?.payload?.[0] || []).map((s: Record<string, unknown>) => ({
        id: s?.id as number ?? 0,
        label: s?.label as string ?? "",
        owningLib: s?.owning_lib as number ?? 1,
      }));

      // Holdings templates would be stored in a custom table
      // For now, return empty array - would need backend table setup
      const templates: HoldingsTemplate[] = [];

      return successResponse({
        templates,
        classifications,
        prefixes,
        suffixes,
        orgId,
      });
    } else {
      return errorResponse("Invalid type parameter. Must be 'copy' or 'holdings'.", 400);
    }
  } catch (error) {
    logger.error({ requestId, error }, "Templates GET failed");
    return serverErrorResponse(error, "Templates GET", req);
  }
}

// ============================================================================
// POST - Create, Update, or Delete template
// ============================================================================

export async function POST(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const body = await req.json();
    const { action, type, data } = body;

    if (!action || !type || !data) {
      return errorResponse("Missing required fields: action, type, data", 400);
    }

    const { authtoken } = await requirePermissions(["UPDATE_COPY"]);

    logger.info({ requestId, route: "api.evergreen.templates", action, type }, "Templates mutation");

    if (type === "copy") {
      switch (action) {
        case "create": {
          const result = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.create.act",
            [
              authtoken,
              {
                __c: "act",
                __p: [
                  null, // id (auto-generated)
                  data.name,
                  data.owningLib,
                  data.circulate ?? true,
                  data.holdable ?? true,
                  data.opacVisible ?? true,
                  data.ref ?? false,
                  data.circModifier || null,
                  data.status || null,
                  data.location || null,
                  data.price || null,
                ],
              },
            ]
          );

          if (result?.payload?.[0]) {
            return successResponse({ id: result.payload[0], message: "Template created" });
          }
          return errorResponse("Failed to create template", 500);
        }

        case "update": {
          if (!data.id) {
            return errorResponse("Template ID is required for update", 400);
          }

          // First retrieve the existing template
          const existing = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.retrieve.act",
            [authtoken, data.id]
          );

          if (!existing?.payload?.[0]) {
            return errorResponse("Template not found", 404);
          }

          // Update the template
          const result = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.update.act",
            [
              authtoken,
              {
                __c: "act",
                __p: [
                  data.id,
                  data.name,
                  data.owningLib,
                  data.circulate ?? true,
                  data.holdable ?? true,
                  data.opacVisible ?? true,
                  data.ref ?? false,
                  data.circModifier || null,
                  data.status || null,
                  data.location || null,
                  data.price || null,
                ],
                _isnew: false,
                _ischanged: true,
              },
            ]
          );

          if (result?.payload?.[0]) {
            return successResponse({ id: data.id, message: "Template updated" });
          }
          return errorResponse("Failed to update template", 500);
        }

        case "delete": {
          if (!data.id) {
            return errorResponse("Template ID is required for delete", 400);
          }

          const result = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.delete.act",
            [authtoken, data.id]
          );

          if (result?.payload?.[0]) {
            return successResponse({ message: "Template deleted" });
          }
          return errorResponse("Failed to delete template", 500);
        }

        default:
          return errorResponse("Invalid action. Must be 'create', 'update', or 'delete'.", 400);
      }
    } else if (type === "holdings") {
      // Holdings templates would require a custom backend table
      // For now, return a placeholder response
      return errorResponse("Holdings templates not yet implemented in backend", 501);
    } else {
      return errorResponse("Invalid type. Must be 'copy' or 'holdings'.", 400);
    }
  } catch (error) {
    logger.error({ requestId, error }, "Templates POST failed");
    return serverErrorResponse(error, "Templates POST", req);
  }
}
