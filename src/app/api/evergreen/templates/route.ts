import { NextRequest } from "next/server";
import {
  callOpenSRF,
  callPcrud,
  encodeFieldmapper,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { query } from "@/lib/db/evergreen";

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

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "t" || value === 1) return true;
  if (value === false || value === "f" || value === 0) return false;
  return fallback;
}

function normalizeRows(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload) && Array.isArray(payload[0]))
    return payload[0] as Record<string, unknown>[];
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  return [];
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

    const orgId = orgIdParam ? parseInt(orgIdParam, 10) : (actor?.ws_ou ?? actor?.home_ou ?? 1);

    logger.info({ requestId, route: "api.evergreen.templates", type, orgId }, "Templates request");

    if (type === "copy") {
      // Fetch copy templates from asset.copy_template
      const response = await callPcrud("open-ils.pcrud.search.act", [
        authtoken,
        search ? { name: { "~*": search }, owning_lib: { ">=": 1 } } : { owning_lib: { ">=": 1 } },
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
      ]);

      const templatesRows = normalizeRows(response?.payload);
      const templates: CopyTemplate[] = templatesRows.map((t: Record<string, unknown>) => {
        const owningLibObj = t?.owning_lib as Record<string, unknown> | null;
        const statusObj = t?.status as Record<string, unknown> | null;
        const locationObj = t?.location as Record<string, unknown> | null;
        const circModObj = t?.circ_modifier as Record<string, unknown> | null;

        return {
          id: (t?.id as number) ?? 0,
          name: (t?.name as string) ?? "",
          owningLib:
            typeof owningLibObj === "object" && owningLibObj !== null
              ? ((owningLibObj?.id as number) ?? 1)
              : ((t?.owning_lib as number) ?? 1),
          owningLibName:
            typeof owningLibObj === "object" && owningLibObj !== null
              ? ((owningLibObj?.shortname as string) ?? (owningLibObj?.name as string) ?? null)
              : null,
          status:
            typeof statusObj === "object" && statusObj !== null
              ? ((statusObj?.id as number) ?? null)
              : ((t?.status as number) ?? null),
          statusName:
            typeof statusObj === "object" && statusObj !== null
              ? ((statusObj?.name as string) ?? null)
              : null,
          location:
            typeof locationObj === "object" && locationObj !== null
              ? ((locationObj?.id as number) ?? null)
              : ((t?.location as number) ?? null),
          locationName:
            typeof locationObj === "object" && locationObj !== null
              ? ((locationObj?.name as string) ?? null)
              : null,
          circModifier:
            typeof circModObj === "object" && circModObj !== null
              ? ((circModObj?.code as string) ?? null)
              : ((t?.circ_modifier as string) ?? null),
          holdable: toBoolean(t?.holdable, true),
          circulate: toBoolean(t?.circulate, true),
          opacVisible: toBoolean(t?.opac_visible, true),
          ref: toBoolean(t?.ref, false),
          price: (t?.price as number) ?? null,
        };
      });

      // Also fetch lookup data for dropdowns
      const [statusesRes, locationsRes] = await Promise.all([
        callPcrud("open-ils.pcrud.search.ccs", [
          authtoken,
          { id: { ">=": 0 } },
          { order_by: { ccs: "name" } },
        ]),
        callPcrud("open-ils.pcrud.search.acpl", [
          authtoken,
          { deleted: "f" },
          { order_by: { acpl: "name" }, limit: 500 },
        ]),
      ]);

      let circModsRows: Record<string, any>[] = [];
      try {
        const circModsRes = await callPcrud("open-ils.pcrud.search.ccm", [
          authtoken,
          // config.circ_modifier primary key is "code" (not "id").
          { code: { "!=": null } },
          { order_by: { ccm: "code" }, limit: 200 },
        ]);
        circModsRows = normalizeRows(circModsRes?.payload);
      } catch (error: unknown) {
        logger.warn(
          { requestId, error: String(error) },
          "Circ modifiers lookup failed; falling back to SQL"
        );
        try {
          circModsRows = await query<Record<string, unknown>>(
            `
              select code, name, description
              from config.circ_modifier
              order by code
              limit 200
            `
          );
        } catch (inner: unknown) {
          logger.warn({ requestId, error: String(inner) }, "Circ modifiers SQL fallback failed");
          circModsRows = [];
        }
      }

      const statuses = normalizeRows(statusesRes?.payload).map((s: Record<string, unknown>) => ({
        id: (s?.id as number) ?? 0,
        name: (s?.name as string) ?? "",
      }));

      const locations = normalizeRows(locationsRes?.payload).map((l: Record<string, unknown>) => ({
        id: (l?.id as number) ?? 0,
        name: (l?.name as string) ?? "",
        owningLib: (l?.owning_lib as number) ?? 1,
      }));

      const circModifiers = circModsRows.map((c: Record<string, unknown>) => ({
        code: (c?.code as string) ?? "",
        name: (c?.name as string) ?? (c?.code as string) ?? "",
        description: (c?.description as string) ?? "",
      }));

      return successResponse({
        templates,
        statuses,
        locations,
        circModifiers,
        orgId,
      });
    } else if (type === "holdings") {
      // Fetch holdings templates from org unit settings
      const settingsRes = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.org_unit.settings.retrieve",
        [authtoken, orgId, ["ui.staff.catalog.holdings_templates"]]
      );

      const rawTemplates = (settingsRes?.payload?.[0] as Record<string, unknown> | null)?.[
        "ui.staff.catalog.holdings_templates"
      ];
      const parsedTemplates = rawTemplates
        ? typeof rawTemplates === "string"
          ? JSON.parse(rawTemplates)
          : rawTemplates
        : [];

      // Fetch call number classifications
      const classificationsRes = await callOpenSRF(
        "open-ils.pcrud",
        "open-ils.pcrud.search.acnc.atomic",
        [authtoken, { id: { ">=": 1 } }, { order_by: { acnc: "name" } }]
      );

      const classifications = (classificationsRes?.payload?.[0] || []).map(
        (c: Record<string, unknown>) => ({
          id: (c?.id as number) ?? 0,
          name: (c?.name as string) ?? "",
        })
      );

      // Fetch call number prefixes
      const prefixesRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acnp.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        { order_by: { acnp: "label" }, limit: 200 },
      ]);

      const prefixes = (prefixesRes?.payload?.[0] || []).map((p: Record<string, unknown>) => ({
        id: (p?.id as number) ?? 0,
        label: (p?.label as string) ?? "",
        owningLib: (p?.owning_lib as number) ?? 1,
      }));

      // Fetch call number suffixes
      const suffixesRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acns.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        { order_by: { acns: "label" }, limit: 200 },
      ]);

      const suffixes = (suffixesRes?.payload?.[0] || []).map((s: Record<string, unknown>) => ({
        id: (s?.id as number) ?? 0,
        label: (s?.label as string) ?? "",
        owningLib: (s?.owning_lib as number) ?? 1,
      }));

      const templates: HoldingsTemplate[] = Array.isArray(parsedTemplates)
        ? parsedTemplates.map((t, idx) => ({
            id: t?.id ?? idx,
            name: t?.name ?? "",
            owningLib: t?.owningLib ?? orgId,
            owningLibName: t?.owningLibName ?? null,
            callNumberPrefix: t?.callNumberPrefix ?? null,
            callNumberSuffix: t?.callNumberSuffix ?? null,
            classification: t?.classification ?? null,
            classificationName: t?.classificationName ?? null,
          }))
        : [];

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
  } catch (error: unknown) {
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
    const body = (await req.json()) as Record<string, unknown>;
    const { action, type } = body;
    const data = body.data as Record<string, unknown> | undefined;

    if (!action || !type || !data) {
      return errorResponse("Missing required fields: action, type, data", 400);
    }

    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorId =
      typeof actor?.id === "number" ? actor.id : parseInt(String(actor?.id ?? ""), 10);
    if (!Number.isFinite(actorId)) {
      return errorResponse("Unable to resolve staff user id", 500);
    }

    logger.info(
      { requestId, route: "api.evergreen.templates", action, type },
      "Templates mutation"
    );

    if (type === "copy") {
      switch (action) {
        case "create": {
          await requirePermissions(["ADMIN_ASSET_COPY_TEMPLATE"]);
          if (!data.owningLib || !data.name) {
            return errorResponse("owningLib and name are required", 400);
          }

          const payload: unknown = encodeFieldmapper("act", {
            owning_lib: data.owningLib,
            creator: actorId,
            editor: actorId,
            name: data.name,
            circ_lib: data.circLib ?? null,
            status: data.status ?? null,
            location: data.location ?? null,
            circulate: data.circulate === false ? "f" : "t",
            holdable: data.holdable === false ? "f" : "t",
            opac_visible: data.opacVisible === false ? "f" : "t",
            ref: data.ref === true ? "t" : "f",
            circ_modifier: data.circModifier || null,
            price: data.price ?? null,
            loan_duration: data.loanDuration ?? 2,
            fine_level: data.fineLevel ?? 2,
            isnew: 1,
            ischanged: 1,
          });

          const result = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.act", [
            authtoken,
            payload,
          ]);

          const created = result?.payload?.[0] as Record<string, unknown> | null;
          const id =
            typeof created === "number"
              ? created
              : typeof (created as Record<string, unknown>)?.id === "number"
                ? ((created as Record<string, unknown>).id as number)
                : parseInt(String((created as Record<string, unknown>)?.id ?? created ?? ""), 10);
          if (Number.isFinite(id) && id > 0) {
            return successResponse({ id, message: "Template created" });
          }
          return errorResponse("Failed to create template", 500);
        }

        case "update": {
          if (!data.id) {
            return errorResponse("Template ID is required for update", 400);
          }
          await requirePermissions(["ADMIN_ASSET_COPY_TEMPLATE"]);

          // First retrieve the existing template
          const existing = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.act", [
            authtoken,
            data.id,
          ]);

          if (!existing?.payload?.[0]) {
            return errorResponse("Template not found", 404);
          }

          const current = existing.payload[0];
          const updateData: Record<string, unknown> = { ...(current as Record<string, unknown>) };
          updateData.id = data.id;
          if (data.name !== undefined) updateData.name = data.name;
          if (data.owningLib !== undefined) updateData.owning_lib = data.owningLib;
          if (data.circLib !== undefined) updateData.circ_lib = data.circLib;
          if (data.status !== undefined) updateData.status = data.status;
          if (data.location !== undefined) updateData.location = data.location;
          if (data.circulate !== undefined) updateData.circulate = data.circulate ? "t" : "f";
          if (data.holdable !== undefined) updateData.holdable = data.holdable ? "t" : "f";
          if (data.opacVisible !== undefined)
            updateData.opac_visible = data.opacVisible ? "t" : "f";
          if (data.ref !== undefined) updateData.ref = data.ref ? "t" : "f";
          if (data.circModifier !== undefined) updateData.circ_modifier = data.circModifier || null;
          if (data.price !== undefined) updateData.price = data.price;
          if (data.loanDuration !== undefined) updateData.loan_duration = data.loanDuration;
          if (data.fineLevel !== undefined) updateData.fine_level = data.fineLevel;
          updateData.editor = actorId;
          updateData.ischanged = 1;

          const payload: unknown = encodeFieldmapper("act", updateData);

          // Update the template
          const result = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.act", [
            authtoken,
            payload,
          ]);

          if (result?.payload?.[0]) {
            return successResponse({ id: data.id, message: "Template updated" });
          }
          return errorResponse("Failed to update template", 500);
        }

        case "delete": {
          if (!data.id) {
            return errorResponse("Template ID is required for delete", 400);
          }
          await requirePermissions(["ADMIN_ASSET_COPY_TEMPLATE"]);

          const result = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.act", [
            authtoken,
            data.id,
          ]);

          if (result?.payload?.[0]) {
            return successResponse({ message: "Template deleted" });
          }
          return errorResponse("Failed to delete template", 500);
        }

        default:
          return errorResponse("Invalid action. Must be 'create', 'update', or 'delete'.", 400);
      }
    } else if (type === "holdings") {
      // Holdings templates stored in org unit settings as JSON
      const targetOrgId = data.owningLib || data.orgId || 1;

      if (action === "create" || action === "update") {
        const settingsRes = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.org_unit.settings.retrieve",
          [authtoken, targetOrgId, ["ui.staff.catalog.holdings_templates"]]
        );
        const rawTemplates = (settingsRes?.payload?.[0] as Record<string, unknown> | null)?.[
          "ui.staff.catalog.holdings_templates"
        ];
        const templates = rawTemplates
          ? typeof rawTemplates === "string"
            ? JSON.parse(rawTemplates)
            : rawTemplates
          : [];

        if (action === "create") {
          const newId =
            Math.max(0, ...templates.map((t: Record<string, unknown>) => t.id || 0)) + 1;
          templates.push({
            id: newId,
            name: data.name,
            owningLib: targetOrgId,
            callNumberPrefix: data.callNumberPrefix || null,
            callNumberSuffix: data.callNumberSuffix || null,
            classification: data.classification || null,
          });
          await callOpenSRF("open-ils.actor", "open-ils.actor.org_unit.settings.update", [
            authtoken,
            targetOrgId,
            "ui.staff.catalog.holdings_templates",
            JSON.stringify(templates),
          ]);
          return successResponse({ id: newId, message: "Holdings template created" });
        } else {
          const idx = templates.findIndex((t: Record<string, unknown>) => t.id === data.id);
          if (idx === -1) return errorResponse("Template not found", 404);
          templates[idx] = {
            ...templates[idx],
            name: data.name,
            callNumberPrefix: data.callNumberPrefix || null,
            callNumberSuffix: data.callNumberSuffix || null,
            classification: data.classification || null,
          };
          await callOpenSRF("open-ils.actor", "open-ils.actor.org_unit.settings.update", [
            authtoken,
            targetOrgId,
            "ui.staff.catalog.holdings_templates",
            JSON.stringify(templates),
          ]);
          return successResponse({ id: data.id, message: "Holdings template updated" });
        }
      } else if (action === "delete") {
        if (!data.id) return errorResponse("Template ID required", 400);
        const settingsRes = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.org_unit.settings.retrieve",
          [authtoken, targetOrgId, ["ui.staff.catalog.holdings_templates"]]
        );
        const rawTemplates = (settingsRes?.payload?.[0] as Record<string, unknown> | null)?.[
          "ui.staff.catalog.holdings_templates"
        ];
        let templates = rawTemplates
          ? typeof rawTemplates === "string"
            ? JSON.parse(rawTemplates)
            : rawTemplates
          : [];
        templates = templates.filter((t: Record<string, unknown>) => t.id !== data.id);
        await callOpenSRF("open-ils.actor", "open-ils.actor.org_unit.settings.update", [
          authtoken,
          targetOrgId,
          "ui.staff.catalog.holdings_templates",
          JSON.stringify(templates),
        ]);
        return successResponse({ message: "Holdings template deleted" });
      } else {
        return errorResponse("Invalid action", 400);
      }
    } else {
      return errorResponse("Invalid type. Must be 'copy' or 'holdings'.", 400);
    }
  } catch (error: unknown) {
    logger.error({ requestId, error }, "Templates POST failed");
    return serverErrorResponse(error, "Templates POST", req);
  }
}
