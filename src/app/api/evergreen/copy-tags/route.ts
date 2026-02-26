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
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

function boolToEg(value: unknown): "t" | "f" {
  return value === true || value === "t" || value === 1 ? "t" : "f";
}

function toNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function toString(value: unknown): string {
  if (typeof value === "string") return value;
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
      (payload as Record<string, any>[]).forEach((entry) => {
        const key = String(entry.perm || entry.code || entry.name);
        if (key)
          map[key as string] = Boolean(
            entry.value ?? entry.allowed ?? entry.granted ?? entry.result
          );
      });
      if (Object.keys(map).length > 0) return map;
    }
  }

  if (typeof payload === "object") {
    const map: Record<string, boolean> = {};
    for (const perm of perms) {
      if (perm in (payload as Record<string, any>)) {
        map[perm] = Boolean((payload as Record<string, any>)[perm]);
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

export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const actor = await getActorFromToken(authtoken);
    const orgId = actor?.ws_ou ?? actor?.home_ou ?? null;

    const perms = ["ADMIN_COPY_TAG"];
    const permMap = await checkPerms(authtoken, perms, orgId);

    const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acpt.atomic", [
      authtoken,
      { id: { ">=": 1 } },
      {
        limit: 1000,
        order_by: { acpt: "label" },
        flesh: 2,
        flesh_fields: {
          acpt: ["tag_type", "owner"],
          cctt: ["label"],
          aou: ["shortname", "name"],
        },
      },
    ]);

    const rows = Array.isArray(response?.payload?.[0])
      ? (response?.payload?.[0] as Record<string, any>[])
      : [];
    const tags = rows
      .map((row) => {
        const tagTypeObj =
          row?.tag_type && typeof row.tag_type === "object"
            ? (row.tag_type as Record<string, any>)
            : null;
        const ownerObj =
          row?.owner && typeof row.owner === "object" ? (row.owner as Record<string, any>) : null;

        const tagTypeCode = tagTypeObj
          ? toString(tagTypeObj.code).trim()
          : toString(row?.tag_type).trim();
        const tagTypeLabel = tagTypeObj
          ? toString(tagTypeObj.label || tagTypeObj.code || "").trim()
          : null;

        const ownerId = ownerObj ? toNumber(ownerObj.id) : toNumber(row?.owner);

        return {
          id: toNumber(row?.id),
          tagType: tagTypeCode,
          tagTypeLabel,
          label: toString(row?.label).trim(),
          value: toString(row?.value).trim(),
          staffNote: toString(row?.staff_note || "").trim() || null,
          pub: fmBoolean(row, "pub") ?? false,
          ownerId,
          ownerName: ownerObj ? toString(ownerObj.shortname || ownerObj.name || "").trim() : null,
          url: toString(row?.url || "").trim() || null,
        };
      })
      .filter(
        (t: { id: number | null; label: string }) =>
          typeof t.id === "number" && t.id > 0 && t.label.length > 0
      );

    return successResponse({
      tags,
      permissions: permMap || {},
      orgId,
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/evergreen/copy-tags", req);
  }
}

export async function POST(req: Request) {
  try {
    const { authtoken, actor, result } = await requirePermissions(["ADMIN_COPY_TAG"]);
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          tagType: z.string().trim().min(1).max(64),
          label: z.string().trim().min(1).max(255),
          value: z.string().trim().min(1).max(255),
          staffNote: z.string().trim().max(1000).optional(),
          pub: z.boolean().optional(),
          ownerId: z.number().int().positive().optional(),
          url: z.string().trim().max(1024).optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const ownerId = body.ownerId ?? result.orgId ?? actor?.ws_ou ?? actor?.home_ou;
    if (!ownerId) return errorResponse("ownerId is required", 400);

    const payload = encodeFieldmapper("acpt", {
      tag_type: body.tagType,
      label: body.label,
      value: body.value,
      staff_note: body.staffNote ?? null,
      pub: boolToEg(body.pub ?? false),
      owner: ownerId,
      url: body.url ?? null,
      isnew: 1,
      ischanged: 1,
    });

    const createResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.acpt", [
      authtoken,
      payload,
    ]);

    const resultRow = createResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as Record<string, any>)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to create tag"), 400, resultRow);
    }

    const id =
      typeof resultRow === "number"
        ? resultRow
        : toNumber((resultRow as Record<string, any>)?.id ?? resultRow);

    return successResponse({ created: true, id });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/evergreen/copy-tags", req);
  }
}

export async function PUT(req: Request) {
  try {
    const { authtoken, actor, result } = await requirePermissions(["ADMIN_COPY_TAG"]);
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          id: z.number().int().positive(),
          tagType: z.string().trim().min(1).max(64).optional(),
          label: z.string().trim().min(1).max(255).optional(),
          value: z.string().trim().min(1).max(255).optional(),
          staffNote: z.string().trim().max(1000).optional(),
          pub: z.boolean().optional(),
          ownerId: z.number().int().positive().optional(),
          url: z.string().trim().max(1024).optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const id = body.id;

    const existingResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.acpt", [
      authtoken,
      id,
    ]);
    const existing = existingResponse?.payload?.[0];
    if (!existing || isOpenSRFEvent(existing) || (existing as Record<string, any>)?.ilsevent) {
      return errorResponse(getErrorMessage(existing, "Tag not found"), 404, existing);
    }

    const ownerId =
      body.ownerId ??
      result.orgId ??
      actor?.ws_ou ??
      actor?.home_ou ??
      (existing as Record<string, any>)?.owner;
    if (!ownerId) return errorResponse("ownerId is required", 400);

    const updateData: Record<string, any> = { ...(existing as Record<string, any>) };
    updateData.id = id;
    if (body.tagType !== undefined) updateData.tag_type = body.tagType;
    if (body.label !== undefined) updateData.label = body.label;
    if (body.value !== undefined) updateData.value = body.value;
    if (body.staffNote !== undefined) updateData.staff_note = body.staffNote || null;
    if (body.pub !== undefined) updateData.pub = boolToEg(body.pub);
    updateData.owner = ownerId;
    if (body.url !== undefined) updateData.url = body.url || null;
    updateData.ischanged = 1;

    const payload = encodeFieldmapper("acpt", updateData);

    const updateResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.acpt", [
      authtoken,
      payload,
    ]);
    const resultRow = updateResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as Record<string, any>)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to update tag"), 400, resultRow);
    }

    return successResponse({ updated: true, id });
  } catch (error) {
    return serverErrorResponse(error, "PUT /api/evergreen/copy-tags", req);
  }
}

export async function DELETE(req: Request) {
  try {
    const { authtoken } = await requirePermissions(["ADMIN_COPY_TAG"]);
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          id: z.number().int().positive(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const id = body.id;

    const delResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.acpt", [
      authtoken,
      id,
    ]);
    const resultRow = delResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as Record<string, any>)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to delete tag"), 400, resultRow);
    }

    return successResponse({ deleted: true, id });
  } catch (error) {
    return serverErrorResponse(error, "DELETE /api/evergreen/copy-tags", req);
  }
}
