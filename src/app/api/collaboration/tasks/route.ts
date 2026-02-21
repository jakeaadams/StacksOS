import { NextRequest } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { createRecordTask, listRecordTasks, updateRecordTask } from "@/lib/db/collaboration";

const recordTypeSchema = z.enum(["bib", "patron"]);

const createSchema = z.object({
  recordType: recordTypeSchema,
  recordId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(5000).optional(),
  assignedTo: z.number().int().positive().optional(),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(["open", "done", "canceled"]).optional(),
  assignedTo: z.number().int().positive().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);
    const recordType = recordTypeSchema.safeParse(
      req.nextUrl.searchParams.get("recordType") || ""
    ).data;
    const recordIdRaw = req.nextUrl.searchParams.get("recordId") || "";
    const recordId = /^\d+$/.test(recordIdRaw) ? parseInt(recordIdRaw, 10) : 0;
    if (!recordType || recordId <= 0) {
      return errorResponse("recordType and recordId are required", 400);
    }

    const tasks = await listRecordTasks({ recordType, recordId });
    return successResponse({ tasks });
  } catch (error) {
    return serverErrorResponse(error, "Collaboration tasks GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  try {
    const parsed = await parseJsonBodyWithSchema(req, createSchema);
    if (parsed instanceof Response) return parsed;

    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const task = await createRecordTask({
      recordType: parsed.recordType,
      recordId: parsed.recordId,
      title: parsed.title,
      body: parsed.body || null,
      assignedTo: parsed.assignedTo || null,
      createdBy: actor?.id || null,
    });

    await logAuditEvent({
      action: "collaboration.task.create",
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        taskId: task.id,
        recordType: task.recordType,
        recordId: task.recordId,
        assignedTo: task.assignedTo || null,
      },
    });

    return successResponse({ task });
  } catch (error) {
    return serverErrorResponse(error, "Collaboration tasks POST", req);
  }
}

export async function PATCH(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  try {
    const parsed = await parseJsonBodyWithSchema(req, updateSchema);
    if (parsed instanceof Response) return parsed;

    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const task = await updateRecordTask({
      id: parsed.id,
      title: parsed.title,
      body: parsed.body,
      status: parsed.status,
      assignedTo: parsed.assignedTo,
      updatedBy: actor?.id || null,
    });
    if (!task) return errorResponse("Task not found", 404);

    await logAuditEvent({
      action: "collaboration.task.update",
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        taskId: task.id,
        recordType: task.recordType,
        recordId: task.recordId,
        status: task.status,
      },
    });

    return successResponse({ task });
  } catch (error) {
    return serverErrorResponse(error, "Collaboration tasks PATCH", req);
  }
}
