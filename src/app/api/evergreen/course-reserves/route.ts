import { NextRequest } from "next/server";
import {
  callOpenSRF,
  fmBoolean,
  parseJsonBodyWithSchema,
  requireAuthToken,
  serverErrorResponse,
  successResponse,
  errorResponse,
  encodeFieldmapper,
  getErrorMessage,
  isOpenSRFEvent,
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
      (payload as Record<string, unknown>[]).forEach((entry: Record<string, unknown>) => {
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

    const perms = ["MANAGE_RESERVES"];
    const permMap = await checkPerms(authtoken, perms, orgId);

    const [coursesRes, termsRes, materialsRes] = await Promise.all([
      callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acmc.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        {
          limit: 2000,
          order_by: { acmc: "name" },
          flesh: 1,
          flesh_fields: { acmc: ["owning_lib"], aou: ["shortname", "name"] },
        },
      ]),
      callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acmt.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        {
          limit: 2000,
          order_by: { acmt: "name" },
          flesh: 1,
          flesh_fields: { acmt: ["owning_lib"], aou: ["shortname", "name"] },
        },
      ]),
      callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acmcm.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        { limit: 5000 },
      ]),
    ]);

    const materialsRows = Array.isArray(materialsRes?.payload?.[0]) ? (materialsRes.payload[0] as Record<string, unknown>[]) : [];
    const materialsCount = new Map<number, number>();
    for (const m of materialsRows) {
      const courseId = toNumber(m?.course);
      if (!courseId) continue;
      materialsCount.set(courseId, (materialsCount.get(courseId) || 0) + 1);
    }

    const coursesRaw = Array.isArray(coursesRes?.payload?.[0]) ? (coursesRes.payload[0] as Record<string, unknown>[]) : [];
    const termsRaw = Array.isArray(termsRes?.payload?.[0]) ? (termsRes.payload[0] as Record<string, unknown>[]) : [];

    const courses = coursesRaw
      .map((row: Record<string, unknown>) => {
        const owningObj = row?.owning_lib && typeof row.owning_lib === "object" ? (row.owning_lib as Record<string, unknown>) : null;
        const owningLibId = owningObj ? toNumber(owningObj.id) : toNumber(row?.owning_lib);
        const id = toNumber(row?.id);
        if (!id) return null;
        return {
          id,
          name: toString(row?.name).trim(),
          courseNumber: toString(row?.course_number).trim(),
          sectionNumber: toString(row?.section_number || "").trim() || null,
          owningLibId,
          owningLibName: owningObj ? toString(owningObj.shortname || owningObj.name || "").trim() : null,
          isArchived: fmBoolean(row, "is_archived") ?? false,
          materialsCount: materialsCount.get(id) || 0,
        };
      })
      .filter(Boolean);

    const terms = termsRaw
      .map((row: Record<string, unknown>) => {
        const owningObj = row?.owning_lib && typeof row.owning_lib === "object" ? (row.owning_lib as Record<string, unknown>) : null;
        const owningLibId = owningObj ? toNumber(owningObj.id) : toNumber(row?.owning_lib);
        const id = toNumber(row?.id);
        if (!id) return null;
        return {
          id,
          name: toString(row?.name).trim(),
          owningLibId,
          owningLibName: owningObj ? toString(owningObj.shortname || owningObj.name || "").trim() : null,
          startDate: toString(row?.start_date || "").trim() || null,
          endDate: toString(row?.end_date || "").trim() || null,
        };
      })
      .filter(Boolean);

    return successResponse({
      courses,
      terms,
      permissions: permMap || {},
      orgId,
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/evergreen/course-reserves", req);
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          entity: z.enum(["course", "term"]),
          name: z.string().trim().min(1).max(255),
          owningLibId: z.number().int().positive(),
          courseNumber: z.string().trim().max(64).optional(),
          sectionNumber: z.string().trim().max(64).optional(),
          startDate: z.string().trim().max(64).optional(),
          endDate: z.string().trim().max(64).optional(),
          isArchived: z.boolean().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const { authtoken } = await requirePermissions(["MANAGE_RESERVES"]);

    const classId = body.entity === "course" ? "acmc" : "acmt";
    const payloadData: Record<string, any> =
      body.entity === "course"
        ? {
            name: body.name,
            course_number: body.courseNumber || "",
            section_number: body.sectionNumber || null,
            owning_lib: body.owningLibId,
            is_archived: body.isArchived === true ? "t" : "f",
          }
        : {
            name: body.name,
            owning_lib: body.owningLibId,
            start_date: body.startDate || null,
            end_date: body.endDate || null,
          };

    const payload = encodeFieldmapper(classId, { ...payloadData, isnew: 1, ischanged: 1 });

    const createResponse = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.create.${classId}`, [
      authtoken,
      payload,
    ]);
    const resultRow = createResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to create record"), 400, resultRow);
    }

    const id = typeof resultRow === "number" ? resultRow : toNumber((resultRow as Record<string, unknown>)?.id ?? resultRow);

    return successResponse({ created: true, entity: body.entity, id });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/evergreen/course-reserves", req);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          entity: z.enum(["course", "term"]),
          id: z.number().int().positive(),
          name: z.string().trim().min(1).max(255).optional(),
          owningLibId: z.number().int().positive().optional(),
          courseNumber: z.string().trim().max(64).optional(),
          sectionNumber: z.string().trim().max(64).optional(),
          startDate: z.string().trim().max(64).optional(),
          endDate: z.string().trim().max(64).optional(),
          isArchived: z.boolean().optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const { authtoken } = await requirePermissions(["MANAGE_RESERVES"]);
    const classId = body.entity === "course" ? "acmc" : "acmt";

    const existingResponse = await callOpenSRF(
      "open-ils.pcrud",
      `open-ils.pcrud.retrieve.${classId}`,
      [authtoken, body.id]
    );
    const existing = existingResponse?.payload?.[0];
    if (!existing || isOpenSRFEvent(existing) || (existing as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(existing, "Record not found"), 404, existing);
    }

    const updateData: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
    updateData.id = body.id;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.owningLibId !== undefined) updateData.owning_lib = body.owningLibId;

    if (body.entity === "course") {
      if (body.courseNumber !== undefined) updateData.course_number = body.courseNumber;
      if (body.sectionNumber !== undefined) updateData.section_number = body.sectionNumber || null;
      if (body.isArchived !== undefined) updateData.is_archived = body.isArchived ? "t" : "f";
    } else {
      if (body.startDate !== undefined) updateData.start_date = body.startDate || null;
      if (body.endDate !== undefined) updateData.end_date = body.endDate || null;
    }

    updateData.ischanged = 1;
    const payload = encodeFieldmapper(classId, updateData);

    const updateResponse = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.update.${classId}`, [
      authtoken,
      payload,
    ]);
    const resultRow = updateResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to update record"), 400, resultRow);
    }

    return successResponse({ updated: true, entity: body.entity, id: body.id });
  } catch (error) {
    return serverErrorResponse(error, "PUT /api/evergreen/course-reserves", req);
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          entity: z.enum(["course", "term"]),
          id: z.number().int().positive(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;

    const { authtoken } = await requirePermissions(["MANAGE_RESERVES"]);
    const classId = body.entity === "course" ? "acmc" : "acmt";

    const delResponse = await callOpenSRF("open-ils.pcrud", `open-ils.pcrud.delete.${classId}`, [
      authtoken,
      body.id,
    ]);
    const resultRow = delResponse?.payload?.[0];
    if (!resultRow || isOpenSRFEvent(resultRow) || (resultRow as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(resultRow, "Failed to delete record"), 400, resultRow);
    }

    return successResponse({ deleted: true, entity: body.entity, id: body.id });
  } catch (error) {
    return serverErrorResponse(error, "DELETE /api/evergreen/course-reserves", req);
  }
}
