import { NextRequest } from "next/server";
import {
  callOpenSRF,
  encodeFieldmapper,
  errorResponse,
  fmBoolean,
  getErrorMessage,
  isOpenSRFEvent,
  parseJsonBodyWithSchema,
  requireAuthToken,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { getActorFromToken } from "@/lib/audit";
import { getEvergreenPool } from "@/lib/db/evergreen";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

type StatKind = "copy" | "patron";

function boolToEg(value: any): "t" | "f" {
  return value === true || value === "t" || value === 1 ? "t" : "f";
}

function toNumber(value: any): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function toString(value: any): string {
  if (typeof value === "string") return value;
  return String(value ?? "");
}

function toBool(value: any): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function normalizePermPayload(payload: any, perms: string[]): Record<string, boolean> | null {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    if (payload.length === perms.length) {
      const map: Record<string, boolean> = {};
      perms.forEach((perm, idx) => {
        map[perm] = Boolean(payload[idx]);
      });
      return map;
    }

    if (payload.length > 0 && typeof payload[0] === "object") {
      const map: Record<string, boolean> = {};
      payload.forEach((entry: any) => {
        const key = entry.perm || entry.code || entry.name;
        if (key) map[key] = Boolean(entry.value ?? entry.allowed ?? entry.granted ?? entry.result);
      });
      if (Object.keys(map).length > 0) return map;
    }
  }

  if (typeof payload === "object") {
    const map: Record<string, boolean> = {};
    for (const perm of perms) {
      if (perm in payload) {
        map[perm] = Boolean(payload[perm]);
      }
    }
    if (Object.keys(map).length > 0) return map;
  }

  return null;
}

async function checkPerms(
  authtoken: string,
  perms: string[],
  orgId?: number | null
): Promise<Record<string, boolean> | null> {
  const attempts: any[][] = [];
  attempts.push([authtoken, perms]);
  if (orgId) {
    attempts.push([authtoken, orgId, perms]);
    attempts.push([authtoken, perms, orgId]);
  }

  for (const params of attempts) {
    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.has_work_perm_at.batch",
      params
    );
    const payload = response?.payload?.[0];
    if (isOpenSRFEvent(payload)) {
      continue;
    }
    const map = normalizePermPayload(payload, perms);
    if (map) return map;
  }

  return null;
}

function resolveKind(value: any): StatKind | null {
  return value === "copy" || value === "patron" ? value : null;
}

function permFor(kind: StatKind, action: "create" | "update" | "delete"): string {
  if (kind === "copy") {
    if (action === "create") return "CREATE_COPY_STAT_CAT";
    if (action === "update") return "UPDATE_COPY_STAT_CAT";
    return "DELETE_COPY_STAT_CAT";
  }
  if (action === "create") return "CREATE_PATRON_STAT_CAT";
  if (action === "update") return "UPDATE_PATRON_STAT_CAT";
  return "DELETE_PATRON_STAT_CAT";
}

export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const actor = await getActorFromToken(authtoken);
    const orgId = actor?.ws_ou ?? actor?.home_ou ?? null;

    const permList = [
      "CREATE_COPY_STAT_CAT",
      "UPDATE_COPY_STAT_CAT",
      "DELETE_COPY_STAT_CAT",
      "CREATE_COPY_STAT_CAT_ENTRY",
      "UPDATE_COPY_STAT_CAT_ENTRY",
      "DELETE_COPY_STAT_CAT_ENTRY",
      "CREATE_PATRON_STAT_CAT",
      "UPDATE_PATRON_STAT_CAT",
      "DELETE_PATRON_STAT_CAT",
      "CREATE_PATRON_STAT_CAT_ENTRY",
      "UPDATE_PATRON_STAT_CAT_ENTRY",
      "DELETE_PATRON_STAT_CAT_ENTRY",
    ];
    const permMap = await checkPerms(authtoken, permList, orgId);

    const pool = getEvergreenPool();

    const sqlCopyCategories = async () => {
      const result = await pool.query(
        `
          select
            c.id,
            c.name,
            c.owner,
            c.opac_visible,
            c.required,
            c.checkout_archive,
            ou.shortname as owner_shortname,
            ou.name as owner_name,
            coalesce(e.entry_count, 0)::int as entry_count
          from asset.stat_cat c
          left join actor.org_unit ou on ou.id = c.owner
          left join (
            select stat_cat, count(*) as entry_count
            from asset.stat_cat_entry
            group by stat_cat
          ) e on e.stat_cat = c.id
          where c.id >= 1
          order by c.name
        `
      );

      return result.rows.map((row) => ({
        id: Number(row.id) || 0,
        name: toString(row.name).trim(),
        ownerId: row.owner ? Number(row.owner) : null,
        ownerName: toString(row.owner_shortname || row.owner_name || "").trim() || null,
        opacVisible: toBool(row.opac_visible),
        required: toBool(row.required),
        checkoutArchive: toBool(row.checkout_archive),
        entryCount: Number(row.entry_count) || 0,
      }));
    };

    const sqlPatronCategories = async () => {
      const result = await pool.query(
        `
          select
            c.id,
            c.name,
            c.owner,
            c.opac_visible,
            c.required,
            c.checkout_archive,
            c.allow_freetext,
            c.usr_summary,
            ou.shortname as owner_shortname,
            ou.name as owner_name,
            coalesce(e.entry_count, 0)::int as entry_count
          from actor.stat_cat c
          left join actor.org_unit ou on ou.id = c.owner
          left join (
            select stat_cat, count(*) as entry_count
            from actor.stat_cat_entry
            group by stat_cat
          ) e on e.stat_cat = c.id
          where c.id >= 1
          order by c.name
        `
      );

      return result.rows.map((row) => ({
        id: Number(row.id) || 0,
        name: toString(row.name).trim(),
        ownerId: row.owner ? Number(row.owner) : null,
        ownerName: toString(row.owner_shortname || row.owner_name || "").trim() || null,
        opacVisible: toBool(row.opac_visible),
        required: toBool(row.required),
        checkoutArchive: toBool(row.checkout_archive),
        allowFreetext: toBool(row.allow_freetext),
        usrSummary: toBool(row.usr_summary),
        entryCount: Number(row.entry_count) || 0,
      }));
    };

    // Prefer direct SQL to avoid high-latency or brittle flesh queries over OpenSRF.
    let copyCategories: any[] = [];
    try {
      copyCategories = await sqlCopyCategories();
    } catch {
      const copyCatsRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.asc.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        { limit: 1000 },
      ]);
      const copyEntriesRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.asce.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        { limit: 5000 },
      ]);

      const copyEntries = Array.isArray(copyEntriesRes?.payload?.[0]) ? (copyEntriesRes.payload[0] as any[]) : [];
      const copyEntryCounts = new Map<number, number>();
      for (const e of copyEntries) {
        const statCatId = toNumber(e?.stat_cat);
        if (!statCatId) continue;
        copyEntryCounts.set(statCatId, (copyEntryCounts.get(statCatId) || 0) + 1);
      }

      const copyCatsRaw = Array.isArray(copyCatsRes?.payload?.[0]) ? (copyCatsRes.payload[0] as any[]) : [];
      copyCategories = copyCatsRaw
        .map((row: any) => {
          const id = toNumber(row?.id);
          if (id === null) return null;
          return {
            id,
            name: toString(row?.name).trim(),
            ownerId: toNumber(row?.owner),
            ownerName: null,
            opacVisible: fmBoolean(row, "opac_visible") ?? false,
            required: fmBoolean(row, "required") ?? false,
            checkoutArchive: fmBoolean(row, "checkout_archive") ?? false,
            entryCount: copyEntryCounts.get(id) || 0,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
    }

    let patronCategories: any[] = [];
    try {
      patronCategories = await sqlPatronCategories();
    } catch {
      const patronCatsRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.actsc.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        { limit: 1000 },
      ]);
      const patronEntriesRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.actsce.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        { limit: 5000 },
      ]);

      const patronEntries = Array.isArray(patronEntriesRes?.payload?.[0])
        ? (patronEntriesRes.payload[0] as any[])
        : [];

      const patronEntryCounts = new Map<number, number>();
      for (const e of patronEntries) {
        const statCatId = toNumber(e?.stat_cat);
        if (!statCatId) continue;
        patronEntryCounts.set(statCatId, (patronEntryCounts.get(statCatId) || 0) + 1);
      }

      const patronCatsRaw = Array.isArray(patronCatsRes?.payload?.[0]) ? (patronCatsRes.payload[0] as any[]) : [];
      patronCategories = patronCatsRaw
        .map((row: any) => {
          const id = toNumber(row?.id);
          if (id === null) return null;
          return {
            id,
            name: toString(row?.name).trim(),
            ownerId: toNumber(row?.owner),
            ownerName: null,
            opacVisible: fmBoolean(row, "opac_visible") ?? false,
            required: fmBoolean(row, "required") ?? false,
            checkoutArchive: fmBoolean(row, "checkout_archive") ?? false,
            allowFreetext: fmBoolean(row, "allow_freetext") ?? false,
            usrSummary: fmBoolean(row, "usr_summary") ?? false,
            entryCount: patronEntryCounts.get(id) || 0,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
    }

    return successResponse({
      copyCategories,
      patronCategories,
      permissions: permMap || {},
      orgId,
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/evergreen/stat-categories", req);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          kind: z.enum(["copy", "patron"]),
          name: z.string().trim().min(1).max(255),
          ownerId: z.number().int().positive().optional(),
          opacVisible: z.boolean().optional(),
          required: z.boolean().optional(),
          checkoutArchive: z.boolean().optional(),
          allowFreetext: z.boolean().optional(),
          usrSummary: z.boolean().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body as any;

    const kind = resolveKind(body.kind);
    if (!kind) return errorResponse("Invalid kind", 400);

    const { authtoken, actor, result } = await requirePermissions([permFor(kind, "create")]);
    const ownerId = body.ownerId ?? result.orgId ?? actor?.ws_ou ?? actor?.home_ou;
    if (!ownerId) return errorResponse("ownerId is required", 400);

    const classId = kind === "copy" ? "asc" : "actsc";

    const payload: any = encodeFieldmapper(classId, {
      name: body.name,
      owner: ownerId,
      opac_visible: boolToEg(body.opacVisible ?? false),
      required: boolToEg(body.required ?? false),
      checkout_archive: boolToEg(body.checkoutArchive ?? false),
      ...(kind === "patron"
        ? {
            allow_freetext: boolToEg(body.allowFreetext ?? false),
            usr_summary: boolToEg(body.usrSummary ?? false),
          }
        : {}),
      isnew: 1,
      ischanged: 1,
    });

    const createResponse = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.create.${classId}`, [
      authtoken,
      payload,
    ]);
    const resultRow = createResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as any)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to create stat category"), 400, resultRow);
    }

    const id = typeof resultRow === "number" ? resultRow : toNumber((resultRow as any)?.id ?? resultRow);

    return successResponse({ created: true, kind, id });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/evergreen/stat-categories", req);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          kind: z.enum(["copy", "patron"]),
          id: z.number().int().positive(),
          name: z.string().trim().min(1).max(255).optional(),
          ownerId: z.number().int().positive().optional(),
          opacVisible: z.boolean().optional(),
          required: z.boolean().optional(),
          checkoutArchive: z.boolean().optional(),
          allowFreetext: z.boolean().optional(),
          usrSummary: z.boolean().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body as any;

    const kind = resolveKind(body.kind);
    if (!kind) return errorResponse("Invalid kind", 400);

    const { authtoken, actor, result } = await requirePermissions([permFor(kind, "update")]);
    const classId = kind === "copy" ? "asc" : "actsc";

    const existingResponse = await callOpenSRF(
      "open-ils.pcrud",
      `open-ils.pcrud.retrieve.${classId}`,
      [authtoken, body.id]
    );
    const existing = existingResponse?.payload?.[0];
    if (!existing || isOpenSRFEvent(existing) || (existing as any)?.ilsevent) {
      return errorResponse(getErrorMessage(existing, "Stat category not found"), 404, existing);
    }

    const ownerId = body.ownerId ?? result.orgId ?? actor?.ws_ou ?? actor?.home_ou ?? (existing as any)?.owner;
    if (!ownerId) return errorResponse("ownerId is required", 400);

    const updateData: Record<string, any> = { ...(existing as any) };
    updateData.id = body.id;
    updateData.owner = ownerId;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.opacVisible !== undefined) updateData.opac_visible = boolToEg(body.opacVisible);
    if (body.required !== undefined) updateData.required = boolToEg(body.required);
    if (body.checkoutArchive !== undefined) updateData.checkout_archive = boolToEg(body.checkoutArchive);
    if (kind === "patron") {
      if (body.allowFreetext !== undefined) updateData.allow_freetext = boolToEg(body.allowFreetext);
      if (body.usrSummary !== undefined) updateData.usr_summary = boolToEg(body.usrSummary);
    }

    updateData.ischanged = 1;
    const payload: any = encodeFieldmapper(classId, updateData);

    const updateResponse = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.update.${classId}`, [
      authtoken,
      payload,
    ]);
    const resultRow = updateResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as any)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to update stat category"), 400, resultRow);
    }

    return successResponse({ updated: true, kind, id: body.id });
  } catch (error) {
    return serverErrorResponse(error, "PUT /api/evergreen/stat-categories", req);
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          kind: z.enum(["copy", "patron"]),
          id: z.number().int().positive(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body as any;

    const kind = resolveKind(body.kind);
    if (!kind) return errorResponse("Invalid kind", 400);

    const { authtoken } = await requirePermissions([permFor(kind, "delete")]);
    const classId = kind === "copy" ? "asc" : "actsc";

    const delResponse = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.delete.${classId}`, [
      authtoken,
      body.id,
    ]);
    const resultRow = delResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as any)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to delete stat category"), 400, resultRow);
    }

    return successResponse({ deleted: true, kind, id: body.id });
  } catch (error) {
    return serverErrorResponse(error, "DELETE /api/evergreen/stat-categories", req);
  }
}
