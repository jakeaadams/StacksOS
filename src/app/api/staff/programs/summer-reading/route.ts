import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { publishDeveloperEvent } from "@/lib/developer/webhooks";
import {
  createSummerReadingProgram,
  deleteSummerReadingProgram,
  listSummerReadingPrograms,
  updateSummerReadingProgram,
} from "@/lib/db/summer-reading";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z
  .object({
    action: z.literal("create"),
    programName: z.string().trim().min(1, "Program name is required").max(500),
    startDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    endDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    goalType: z.enum(["books", "pages", "minutes"]).default("books"),
    goalValue: z.number().int().positive().default(10),
    badgeEnabled: z.boolean().default(false),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

const updateSchema = z.object({
  action: z.literal("update"),
  id: z.number().int().positive(),
  programName: z.string().trim().min(1).max(500).optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  goalType: z.enum(["books", "pages", "minutes"]).optional(),
  goalValue: z.number().int().positive().optional(),
  badgeEnabled: z.boolean().optional(),
  active: z.boolean().optional(),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  id: z.number().int().positive(),
});

const postBodySchema = z.discriminatedUnion("action", [createSchema, updateSchema, deleteSchema]);

export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 60,
    windowMs: 5 * 60 * 1000,
    endpoint: "summer-reading-get",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorRecord = actor && typeof actor === "object" ? (actor as Record<string, any>) : null;
    const orgUnit = Number.parseInt(String(actorRecord?.ws_ou ?? "1"), 10);

    const programs = await listSummerReadingPrograms(orgUnit);
    return successResponse({ programs });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/programs/summer-reading", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "summer-reading-post",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorRecord = actor && typeof actor === "object" ? (actor as Record<string, any>) : null;
    const orgUnit = Number.parseInt(String(actorRecord?.ws_ou ?? "1"), 10);
    const actorId =
      actorRecord && typeof actorRecord.id === "number" ? Math.trunc(actorRecord.id) : null;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid request body", 400, { issues: parsed.error.issues });
    }

    const data = parsed.data;

    if (data.action === "create") {
      const program = await createSummerReadingProgram({
        orgUnit,
        programName: data.programName,
        startDate: data.startDate,
        endDate: data.endDate,
        goalType: data.goalType,
        goalValue: data.goalValue,
        badgeEnabled: data.badgeEnabled,
      });

      await logAuditEvent({
        action: "summer_reading.program.created",
        entity: "summer_reading_program",
        entityId: program.id,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: {
          programName: data.programName,
          startDate: data.startDate,
          endDate: data.endDate,
          goalType: data.goalType,
        },
      });

      await publishDeveloperEvent({
        tenantId: process.env.STACKSOS_TENANT_ID || "default",
        eventType: "summer_reading.program.created",
        actorId,
        requestId,
        payload: { programId: program.id, programName: data.programName },
      });

      return successResponse({ program });
    }

    if (data.action === "update") {
      const program = await updateSummerReadingProgram(data.id, {
        programName: data.programName,
        startDate: data.startDate,
        endDate: data.endDate,
        goalType: data.goalType,
        goalValue: data.goalValue,
        badgeEnabled: data.badgeEnabled,
        active: data.active,
      });

      if (!program) return errorResponse("Program not found", 404);

      await logAuditEvent({
        action: "summer_reading.program.updated",
        entity: "summer_reading_program",
        entityId: data.id,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { id: data.id },
      });

      return successResponse({ program });
    }

    if (data.action === "delete") {
      const deleted = await deleteSummerReadingProgram(data.id);
      if (!deleted) return errorResponse("Program not found", 404);

      await logAuditEvent({
        action: "summer_reading.program.deleted",
        entity: "summer_reading_program",
        entityId: data.id,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
      });

      return successResponse({ deleted: true });
    }

    return errorResponse("Unknown action", 400);
  } catch (error) {
    return serverErrorResponse(error, "POST /api/staff/programs/summer-reading", req);
  }
}
