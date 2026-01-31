import {
  callOpenSRF,
  encodeFieldmapper,
  errorResponse,
  fmBoolean,
  getErrorMessage,
  getCopyStatuses,
  isOpenSRFEvent,
  parseJsonBody,
  requireAuthToken,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { getActorFromToken } from "@/lib/audit";

function toNumber(value: any): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toString(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof (value as any).name === "string") return (value as any).name;
    if (typeof (value as any).label === "string") return (value as any).label;
  }
  return String(value ?? "");
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

async function checkPerms(authtoken: string, perms: string[], orgId?: number): Promise<Record<string, boolean> | null> {
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

function throwPermissionDenied(message: string, missing: string[] = []): never {
  const err: any = new Error(message);
  err.name = "PermissionError";
  err.missing = missing;
  throw err;
}

async function requireStrictPermissions(required: string[]) {
  const authtoken = await requireAuthToken();
  const actor = await getActorFromToken(authtoken);
  const orgId = actor?.ws_ou ?? actor?.home_ou;

  const map = await checkPerms(authtoken, required, orgId);
  if (!map) {
    throwPermissionDenied("Permission check failed");
  }
  const missing = required.filter((p) => !map[p]);
  if (missing.length > 0) {
    throwPermissionDenied("Permission denied", missing);
  }

  return { authtoken, actor, orgId };
}

function boolToEg(value: any): "t" | "f" {
  return value === true || value === "t" || value === 1 ? "t" : "f";
}

export async function GET() {
  try {
    const authtoken = await requireAuthToken();
    const actor = await getActorFromToken(authtoken);
    const orgId = actor?.ws_ou ?? actor?.home_ou;

    const permList = ["CREATE_COPY_STATUS", "UPDATE_COPY_STATUS", "DELETE_COPY_STATUS"];
    const permMap = await checkPerms(authtoken, permList, orgId);

    const raw = await getCopyStatuses();
    const rows = Array.isArray(raw) ? raw : [];

    const statuses = rows
      .map((s: any) => ({
        id: toNumber(s?.id),
        name: toString(s?.name ?? s?.label),
        holdable: fmBoolean(s, "holdable"),
        opacVisible: fmBoolean(s, "opac_visible"),
        copyActive: fmBoolean(s, "copy_active"),
        isAvailable: fmBoolean(s, "is_available"),
        restrictCopyDelete: fmBoolean(s, "restrict_copy_delete"),
        hopelessProne: fmBoolean(s, "hopeless_prone"),
      }))
      .filter((s: any) => s.id > 0 && s.name.trim().length > 0)
      .sort((a: any, b: any) => a.id - b.id);

    return successResponse({
      statuses,
      permissions: permMap || {},
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/evergreen/copy-statuses");
  }
}

export async function POST(req: Request) {
  try {
    const { authtoken, actor, orgId } = await requireStrictPermissions(["CREATE_COPY_STATUS"]);
    const body = await parseJsonBody<Record<string, any>>(req);
    if (body instanceof Response) return body;

    const name = String(body.name || "").trim();
    if (!name) {
      return errorResponse("name is required", 400);
    }

    const payload: any = encodeFieldmapper("ccs", {
      name,
      holdable: boolToEg(body.holdable ?? true),
      opac_visible: boolToEg(body.opacVisible ?? body.opac_visible ?? true),
      copy_active: boolToEg(body.copyActive ?? body.copy_active ?? true),
      is_available: boolToEg(body.isAvailable ?? body.is_available ?? false),
      restrict_copy_delete: boolToEg(body.restrictCopyDelete ?? body.restrict_copy_delete ?? false),
      hopeless_prone: boolToEg(body.hopelessProne ?? body.hopeless_prone ?? false),
    });
    payload._isnew = true;
    payload._ischanged = true;

    const createResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.ccs", [
      authtoken,
      payload,
    ]);

    const result = createResponse?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || (result as any)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to create copy status"), 400, result);
    }

    return successResponse({
      created: true,
      id: typeof result === "number" ? result : toNumber((result as any)?.id ?? result),
      orgId,
      actorId: (actor as any)?.id,
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/evergreen/copy-statuses", req);
  }
}

export async function PUT(req: Request) {
  try {
    const { authtoken } = await requireStrictPermissions(["UPDATE_COPY_STATUS"]);
    const body = await parseJsonBody<Record<string, any>>(req);
    if (body instanceof Response) return body;

    const id = parseInt(String(body.id ?? ""), 10);
    if (!Number.isFinite(id)) {
      return errorResponse("id is required", 400);
    }

    const force = body.force === true;
    if (id < 100 && !force) {
      return errorResponse("Refusing to edit a core status without force=true", 400, { id });
    }

    const existingResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.ccs", [authtoken, id]);
    const existing = existingResponse?.payload?.[0];
    if (!existing || (existing as any)?.ilsevent) {
      return errorResponse("Status not found", 404);
    }

    const nameRaw = body.name !== undefined ? String(body.name).trim() : undefined;
    if (nameRaw !== undefined && !nameRaw) {
      return errorResponse("name cannot be empty", 400);
    }

    const updateData: Record<string, any> = { ...(existing as any) };
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

    const payload: any = encodeFieldmapper("ccs", updateData);
    payload._isnew = false;
    payload._ischanged = true;

    const updateResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.ccs", [
      authtoken,
      payload,
    ]);

    const result = updateResponse?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || (result as any)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to update copy status"), 400, result);
    }

    return successResponse({ updated: true, id });
  } catch (error) {
    return serverErrorResponse(error, "PUT /api/evergreen/copy-statuses", req);
  }
}

export async function DELETE(req: Request) {
  try {
    const { authtoken } = await requireStrictPermissions(["DELETE_COPY_STATUS"]);
    const body = await parseJsonBody<Record<string, any>>(req);
    if (body instanceof Response) return body;

    const id = parseInt(String(body.id ?? ""), 10);
    if (!Number.isFinite(id)) {
      return errorResponse("id is required", 400);
    }

    const force = body.force === true;
    if (id < 100 && !force) {
      return errorResponse("Refusing to delete a core status without force=true", 400, { id });
    }

    const delResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.ccs", [authtoken, id]);
    const result = delResponse?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || (result as any)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to delete copy status"), 400, result);
    }

    return successResponse({ deleted: true, id });
  } catch (error) {
    return serverErrorResponse(error, "DELETE /api/evergreen/copy-statuses", req);
  }
}
