import {
  callOpenSRF,
  encodeFieldmapper,
  errorResponse,
  fmBoolean,
  fmNumber,
  fmString,
  getErrorMessage,
  getCopyStatuses,
  isOpenSRFEvent,
  parseJsonBodyWithSchema,
  requireAuthToken,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { getActorFromToken } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

function toNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.name === "string") return v.name;
    if (typeof v.label === "string") return v.label;
  }
  return String(value ?? "");
}

function normalizePermPayload(payload: unknown, perms: string[]): Record<string, boolean> | null {
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
      (payload as Record<string, unknown>[]).forEach((entry) => {
        const key = String(entry.perm || entry.code || entry.name);
        if (key) map[key as string] = Boolean(entry.value ?? entry.allowed ?? entry.granted ?? entry.result);
      });
      if (Object.keys(map).length > 0) return map;
    }
  }

  if (typeof payload === "object") {
    const map: Record<string, boolean> = {};
    for (const perm of perms) {
      if (perm in (payload as Record<string, unknown>)) {
        map[perm] = Boolean((payload as Record<string, unknown>)[perm]);
      }
    }
    if (Object.keys(map).length > 0) return map;
  }

  return null;
}

async function checkPerms(authtoken: string, perms: string[], orgId?: number): Promise<Record<string, boolean> | null> {
  const attempts: unknown[][] = [];
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

function boolToEg(value: unknown): "t" | "f" {
  return value === true || value === "t" || value === 1 ? "t" : "f";
}

export async function GET(req: Request) {
  try {
    const authtoken = await requireAuthToken();
    const actor = await getActorFromToken(authtoken);
    const orgId = actor?.ws_ou ?? actor?.home_ou;

    const permList = ["CREATE_COPY_STATUS", "UPDATE_COPY_STATUS", "DELETE_COPY_STATUS"];
    const permMap = await checkPerms(authtoken, permList, orgId);

    const raw = await getCopyStatuses();
    const rows = Array.isArray(raw) ? raw : [];

    const statuses = rows
      .map((s) => ({
        // Evergreen returns fieldmapper objects for ccs with values in __p.
        // Index order for ccs (config.copy_status):
        // [holdable, id, name, opac_visible, copy_active, restrict_copy_delete, is_available, hopeless_prone]
        id: fmNumber(s, "id", 1) ?? toNumber(s?.id ?? s?.[1]),
        name: fmString(s, "name", 2) ?? fmString(s, "label", 2) ?? toString(s?.name ?? s?.label ?? s?.[2]),
        holdable: fmBoolean(s, "holdable", 0) ?? fmBoolean(s, "holdable") ?? false,
        opacVisible: fmBoolean(s, "opac_visible", 3) ?? fmBoolean(s, "opac_visible") ?? false,
        copyActive: fmBoolean(s, "copy_active", 4) ?? fmBoolean(s, "copy_active") ?? false,
        restrictCopyDelete: fmBoolean(s, "restrict_copy_delete", 5) ?? fmBoolean(s, "restrict_copy_delete") ?? false,
        isAvailable: fmBoolean(s, "is_available", 6) ?? fmBoolean(s, "is_available") ?? false,
        hopelessProne: fmBoolean(s, "hopeless_prone", 7) ?? fmBoolean(s, "hopeless_prone") ?? false,
      }))
      // Include core status id=0 ("Available").
      .filter((s: { id: number; name: string }) => Number.isFinite(s.id) && s.id >= 0 && s.name.trim().length > 0)
      .sort((a: { id: number }, b: { id: number }) => a.id - b.id);

    return successResponse({
      statuses,
      permissions: permMap || {},
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/evergreen/copy-statuses", req);
  }
}

export async function POST(req: Request) {
  try {
    const { authtoken, actor, result: permResult } = await requirePermissions(["CREATE_COPY_STATUS"]);
    const orgId = permResult.orgId;
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          name: z.string().trim().min(1),
          holdable: z.boolean().optional(),
          opacVisible: z.boolean().optional(),
          opac_visible: z.boolean().optional(),
          copyActive: z.boolean().optional(),
          copy_active: z.boolean().optional(),
          isAvailable: z.boolean().optional(),
          is_available: z.boolean().optional(),
          restrictCopyDelete: z.boolean().optional(),
          restrict_copy_delete: z.boolean().optional(),
          hopelessProne: z.boolean().optional(),
          hopeless_prone: z.boolean().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const name = body.name;

    const payload = encodeFieldmapper("ccs", {
      name,
      holdable: boolToEg(body.holdable ?? true),
      opac_visible: boolToEg(body.opacVisible ?? body.opac_visible ?? true),
      copy_active: boolToEg(body.copyActive ?? body.copy_active ?? true),
      is_available: boolToEg(body.isAvailable ?? body.is_available ?? false),
      restrict_copy_delete: boolToEg(body.restrictCopyDelete ?? body.restrict_copy_delete ?? false),
      hopeless_prone: boolToEg(body.hopelessProne ?? body.hopeless_prone ?? false),
    });
    (payload as Record<string, unknown>)._isnew = true;
    (payload as Record<string, unknown>)._ischanged = true;

    const createResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.ccs", [
      authtoken,
      payload,
    ]);

    const result = createResponse?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || (result as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to create copy status"), 400, result);
    }

    return successResponse({
      created: true,
      id: typeof result === "number" ? result : toNumber((result as Record<string, unknown>)?.id ?? result),
      orgId,
      actorId: (actor as Record<string, unknown>)?.id,
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/evergreen/copy-statuses", req);
  }
}

export async function PUT(req: Request) {
  try {
    const { authtoken } = await requirePermissions(["UPDATE_COPY_STATUS"]);
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          id: z.number().int().positive(),
          force: z.boolean().optional(),
          name: z.string().trim().optional(),
          holdable: z.boolean().optional(),
          opacVisible: z.boolean().optional(),
          opac_visible: z.boolean().optional(),
          copyActive: z.boolean().optional(),
          copy_active: z.boolean().optional(),
          isAvailable: z.boolean().optional(),
          is_available: z.boolean().optional(),
          restrictCopyDelete: z.boolean().optional(),
          restrict_copy_delete: z.boolean().optional(),
          hopelessProne: z.boolean().optional(),
          hopeless_prone: z.boolean().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const id = body.id;

    const force = body.force === true;
    if (id < 100 && !force) {
      return errorResponse("Refusing to edit a core status without force=true", 400, { id });
    }

    const existingResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.ccs", [authtoken, id]);
    const existing = existingResponse?.payload?.[0];
    if (!existing || (existing as Record<string, unknown>)?.ilsevent) {
      return errorResponse("Status not found", 404);
    }
    const nameRaw = body.name !== undefined ? String(body.name).trim() : undefined;
    if (nameRaw !== undefined && !nameRaw) {
      return errorResponse("name cannot be empty", 400);
    }

    const updateData: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
    updateData.id = id;
    if (nameRaw !== undefined) updateData.name = nameRaw;

    if (body.holdable !== undefined) updateData.holdable = boolToEg(body.holdable);
    if (body.opacVisible !== undefined || body.opac_visible !== undefined) {
      updateData.opac_visible = boolToEg(body.opacVisible ?? body.opac_visible);
    }
    if (body.copyActive !== undefined || body.copy_active !== undefined) {
      updateData.copy_active = boolToEg(body.copyActive ?? body.copy_active);
    }
    if (body.isAvailable !== undefined || body.is_available !== undefined) {
      updateData.is_available = boolToEg(body.isAvailable ?? body.is_available);
    }
    if (body.restrictCopyDelete !== undefined || body.restrict_copy_delete !== undefined) {
      updateData.restrict_copy_delete = boolToEg(body.restrictCopyDelete ?? body.restrict_copy_delete);
    }
    if (body.hopelessProne !== undefined || body.hopeless_prone !== undefined) {
      updateData.hopeless_prone = boolToEg(body.hopelessProne ?? body.hopeless_prone);
    }

    const payload = encodeFieldmapper("ccs", updateData);
    (payload as Record<string, unknown>)._isnew = false;
    (payload as Record<string, unknown>)._ischanged = true;

    const updateResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.ccs", [
      authtoken,
      payload,
    ]);

    const result = updateResponse?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || (result as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to update copy status"), 400, result);
    }

    return successResponse({ updated: true, id });
  } catch (error) {
    return serverErrorResponse(error, "PUT /api/evergreen/copy-statuses", req);
  }
}

export async function DELETE(req: Request) {
  try {
    const { authtoken } = await requirePermissions(["DELETE_COPY_STATUS"]);
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          id: z.number().int().positive(),
          force: z.boolean().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const id = body.id;

    const force = body.force === true;
    if (id < 100 && !force) {
      return errorResponse("Refusing to delete a core status without force=true", 400, { id });
    }

    const delResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.ccs", [authtoken, id]);
    const result = delResponse?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || (result as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to delete copy status"), 400, result);
    }

    return successResponse({ deleted: true, id });
  } catch (error) {
    return serverErrorResponse(error, "DELETE /api/evergreen/copy-statuses", req);
  }
}
