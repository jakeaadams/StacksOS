import { NextRequest } from "next/server";
import {
  callOpenSRF,
  encodeFieldmapper,
  errorResponse,
  getErrorMessage,
  isOpenSRFEvent,
  parseJsonBodyWithSchema,
  requireAuthToken,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { getActorFromToken } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

type StatKind = "copy" | "patron";

function toNumber(value: any): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function toString(value: any): string {
  if (typeof value === "string") return value;
  return String(value ?? "");
}

function resolveKind(value: any): StatKind | null {
  return value === "copy" || value === "patron" ? value : null;
}

function classIdFor(kind: StatKind): string {
  return kind === "copy" ? "asce" : "actsce";
}

function permFor(kind: StatKind, action: "create" | "update" | "delete"): string {
  if (kind === "copy") {
    if (action === "create") return "CREATE_COPY_STAT_CAT_ENTRY";
    if (action === "update") return "UPDATE_COPY_STAT_CAT_ENTRY";
    return "DELETE_COPY_STAT_CAT_ENTRY";
  }
  if (action === "create") return "CREATE_PATRON_STAT_CAT_ENTRY";
  if (action === "update") return "UPDATE_PATRON_STAT_CAT_ENTRY";
  return "DELETE_PATRON_STAT_CAT_ENTRY";
}

export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const actor = await getActorFromToken(authtoken);
    const orgId = actor?.ws_ou ?? actor?.home_ou ?? null;

    const kind = resolveKind(req.nextUrl.searchParams.get("kind"));
    const statCatId = toNumber(req.nextUrl.searchParams.get("statCatId"));
    if (!kind) return errorResponse("kind is required (copy|patron)", 400);
    if (!statCatId) return errorResponse("statCatId is required", 400);

    const classId = classIdFor(kind);

    const response = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.search.${classId}.atomic`, [
      authtoken,
      { stat_cat: statCatId },
      {
        limit: 5000,
        order_by: { [classId]: "value" },
        flesh: 1,
        flesh_fields: { [classId]: ["owner"], aou: ["shortname", "name"] },
      },
    ]);

    const rows = Array.isArray(response?.payload?.[0]) ? (response.payload[0] as any[]) : [];
    const entries = rows
      .map((row: any) => {
        const ownerObj = row?.owner && typeof row.owner === "object" ? row.owner : null;
        const ownerId = ownerObj ? toNumber(ownerObj.id) : toNumber(row?.owner);
        const id = toNumber(row?.id);
        if (!id) return null;

        return {
          id,
          statCatId: toNumber(row?.stat_cat),
          value: toString(row?.value).trim(),
          ownerId,
          ownerName: ownerObj ? toString(ownerObj.shortname || ownerObj.name || "").trim() : null,
        };
      })
      .filter(Boolean);

    return successResponse({ kind, statCatId, entries, orgId });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/evergreen/stat-categories/entries", req);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          kind: z.enum(["copy", "patron"]),
          statCatId: z.number().int().positive(),
          value: z.string().trim().min(1).max(255),
          ownerId: z.number().int().positive().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body as any;

    const kind = resolveKind(body.kind);
    if (!kind) return errorResponse("Invalid kind", 400);

    const { authtoken, actor, result } = await requirePermissions([permFor(kind, "create")]);
    const ownerId = body.ownerId ?? result.orgId ?? actor?.ws_ou ?? actor?.home_ou;
    if (!ownerId) return errorResponse("ownerId is required", 400);

    const classId = classIdFor(kind);

    const payload: any = encodeFieldmapper(classId, {
      stat_cat: body.statCatId,
      value: body.value,
      owner: ownerId,
      isnew: 1,
      ischanged: 1,
    });

    const createResponse = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.create.${classId}`, [
      authtoken,
      payload,
    ]);
    const resultRow = createResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as any)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to create stat cat entry"), 400, resultRow);
    }

    const id = typeof resultRow === "number" ? resultRow : toNumber((resultRow as any)?.id ?? resultRow);

    return successResponse({ created: true, kind, id });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/evergreen/stat-categories/entries", req);
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
          value: z.string().trim().min(1).max(255).optional(),
          ownerId: z.number().int().positive().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body as any;

    const kind = resolveKind(body.kind);
    if (!kind) return errorResponse("Invalid kind", 400);

    const { authtoken, actor, result } = await requirePermissions([permFor(kind, "update")]);
    const classId = classIdFor(kind);

    const existingResponse = await callOpenSRF(
      "open-ils.pcrud",
      `open-ils.pcrud.retrieve.${classId}`,
      [authtoken, body.id]
    );
    const existing = existingResponse?.payload?.[0];
    if (!existing || isOpenSRFEvent(existing) || (existing as any)?.ilsevent) {
      return errorResponse(getErrorMessage(existing, "Entry not found"), 404, existing);
    }

    const ownerId = body.ownerId ?? result.orgId ?? actor?.ws_ou ?? actor?.home_ou ?? (existing as any)?.owner;
    if (!ownerId) return errorResponse("ownerId is required", 400);

    const updateData: Record<string, any> = { ...(existing as any) };
    updateData.id = body.id;
    updateData.owner = ownerId;
    if (body.value !== undefined) updateData.value = body.value;
    updateData.ischanged = 1;

    const payload: any = encodeFieldmapper(classId, updateData);

    const updateResponse = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.update.${classId}`, [
      authtoken,
      payload,
    ]);
    const resultRow = updateResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as any)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to update entry"), 400, resultRow);
    }

    return successResponse({ updated: true, kind, id: body.id });
  } catch (error) {
    return serverErrorResponse(error, "PUT /api/evergreen/stat-categories/entries", req);
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
    const classId = classIdFor(kind);

    const delResponse = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.delete.${classId}`, [
      authtoken,
      body.id,
    ]);
    const resultRow = delResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as any)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to delete entry"), 400, resultRow);
    }

    return successResponse({ deleted: true, kind, id: body.id });
  } catch (error) {
    return serverErrorResponse(error, "DELETE /api/evergreen/stat-categories/entries", req);
  }
}
