import { NextRequest } from "next/server";
import {
  callOpenSRF,
  encodeFieldmapper,
  errorResponse,
  getErrorMessage,
  isOpenSRFEvent,
  parseJsonBodyWithSchema,
  payloadFirst,
  requireAuthToken,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { getActorFromToken } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

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
      payload.forEach((entry: Record<string, unknown>) => {
        const key = String(entry.perm || entry.code || entry.name || "");
        if (key) map[key] = Boolean(entry.value ?? entry.allowed ?? entry.granted ?? entry.result);
      });
      if (Object.keys(map).length > 0) return map;
    }
  }

  if (typeof payload === "object") {
    const map: Record<string, boolean> = {};
    for (const perm of perms) {
      if (perm in payload) {
        map[perm] = Boolean((payload as Record<string, unknown>)[perm]);
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
    const payload = payloadFirst(response);
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

    const perms = ["ADMIN_COPY_TAG_TYPES"];
    const permMap = await checkPerms(authtoken, perms, orgId);

    const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.cctt.atomic", [
      authtoken,
      { code: { "!=": null } },
      {
        limit: 1000,
        order_by: { cctt: "label" },
        flesh: 1,
        flesh_fields: {
          cctt: ["owner"],
          aou: ["shortname", "name"],
        },
      },
    ]);

    const rows = Array.isArray(response?.payload?.[0])
      ? (response?.payload?.[0] as Record<string, unknown>[])
      : [];
    const tagTypes = rows
      .map((row: Record<string, unknown>) => {
        const ownerRaw =
          row?.owner && typeof row.owner === "object"
            ? (row.owner as Record<string, unknown>)
            : null;
        const ownerId = ownerRaw ? toNumber(ownerRaw.id) : toNumber(row?.owner);

        return {
          code: toString(row?.code).trim(),
          label: toString(row?.label).trim(),
          ownerId,
          ownerName: ownerRaw ? toString(ownerRaw.shortname || ownerRaw.name || "").trim() : null,
        };
      })
      .filter((t) => t.code.length > 0 && t.label.length > 0);

    return successResponse({
      tagTypes,
      permissions: permMap || {},
      orgId,
    });
  } catch (error: unknown) {
    return serverErrorResponse(error, "GET /api/evergreen/copy-tags/types", req);
  }
}

export async function POST(req: Request) {
  try {
    const { authtoken, actor, result } = await requirePermissions(["ADMIN_COPY_TAG_TYPES"]);
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          code: z.string().trim().min(1).max(64),
          label: z.string().trim().min(1).max(255),
          ownerId: z.number().int().positive().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const ownerId = body.ownerId ?? result.orgId ?? actor?.ws_ou ?? actor?.home_ou;
    if (!ownerId) return errorResponse("ownerId is required", 400);

    const payload: unknown = encodeFieldmapper("cctt", {
      code: body.code,
      label: body.label,
      owner: ownerId,
      isnew: 1,
      ischanged: 1,
    });

    const createResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.cctt", [
      authtoken,
      payload,
    ]);

    const resultRow = payloadFirst(createResponse);
    if (
      !resultRow ||
      isOpenSRFEvent(resultRow) ||
      (resultRow as Record<string, unknown>)?.ilsevent
    ) {
      return errorResponse(getErrorMessage(resultRow, "Failed to create tag type"), 400, resultRow);
    }

    return successResponse({ created: true, code: body.code });
  } catch (error: unknown) {
    return serverErrorResponse(error, "POST /api/evergreen/copy-tags/types", req);
  }
}

export async function PUT(req: Request) {
  try {
    const { authtoken, actor, result } = await requirePermissions(["ADMIN_COPY_TAG_TYPES"]);
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          code: z.string().trim().min(1).max(64),
          label: z.string().trim().min(1).max(255).optional(),
          ownerId: z.number().int().positive().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const code = body.code;

    const existingResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.cctt", [
      authtoken,
      code,
    ]);
    const existing = payloadFirst(existingResponse);
    if (!existing || isOpenSRFEvent(existing) || (existing as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(existing, "Tag type not found"), 404, existing);
    }

    const ownerId =
      body.ownerId ??
      result.orgId ??
      actor?.ws_ou ??
      actor?.home_ou ??
      (existing as Record<string, unknown>)?.owner;
    if (!ownerId) return errorResponse("ownerId is required", 400);

    const updateData: Record<string, any> = { ...(existing as Record<string, unknown>) };
    updateData.code = code;
    if (body.label !== undefined) updateData.label = body.label;
    updateData.owner = ownerId;
    updateData.ischanged = 1;

    const payload: unknown = encodeFieldmapper("cctt", updateData);

    const updateResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.cctt", [
      authtoken,
      payload,
    ]);
    const resultRow = payloadFirst(updateResponse);
    if (
      !resultRow ||
      isOpenSRFEvent(resultRow) ||
      (resultRow as Record<string, unknown>)?.ilsevent
    ) {
      return errorResponse(getErrorMessage(resultRow, "Failed to update tag type"), 400, resultRow);
    }

    return successResponse({ updated: true, code });
  } catch (error: unknown) {
    return serverErrorResponse(error, "PUT /api/evergreen/copy-tags/types", req);
  }
}

export async function DELETE(req: Request) {
  try {
    const { authtoken } = await requirePermissions(["ADMIN_COPY_TAG_TYPES"]);
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          code: z.string().trim().min(1).max(64),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const delResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.cctt", [
      authtoken,
      body.code,
    ]);
    const resultRow = payloadFirst(delResponse);
    if (
      !resultRow ||
      isOpenSRFEvent(resultRow) ||
      (resultRow as Record<string, unknown>)?.ilsevent
    ) {
      return errorResponse(getErrorMessage(resultRow, "Failed to delete tag type"), 400, resultRow);
    }

    return successResponse({ deleted: true, code: body.code });
  } catch (error: unknown) {
    return serverErrorResponse(error, "DELETE /api/evergreen/copy-tags/types", req);
  }
}
