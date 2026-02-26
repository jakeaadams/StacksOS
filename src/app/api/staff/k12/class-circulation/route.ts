import { NextRequest } from "next/server";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit";
import {
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createK12Checkout,
  createK12Class,
  createK12Student,
  getK12ClassById,
  listK12ActiveCheckouts,
  listK12Classes,
  listK12Students,
  logK12Summary,
  returnAllActiveK12CheckoutsForClass,
  returnK12CheckoutsByIds,
} from "@/lib/db/k12-class-circulation";
import { publishDeveloperEvent } from "@/lib/developer/webhooks";

const createClassSchema = z
  .object({
    action: z.literal("createClass"),
    name: z.string().trim().min(1).max(120),
    teacherName: z.string().trim().min(1).max(120),
    gradeLevel: z.string().trim().max(40).optional(),
    homeOu: z.number().int().positive().optional(),
  })
  .passthrough();

const createStudentSchema = z
  .object({
    action: z.literal("createStudent"),
    classId: z.number().int().positive(),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    studentIdentifier: z.string().trim().max(80).optional(),
  })
  .passthrough();

const checkoutSchema = z
  .object({
    action: z.literal("checkout"),
    classId: z.number().int().positive(),
    studentId: z.number().int().positive().optional(),
    copyBarcode: z.string().trim().min(1).max(80),
    title: z.string().trim().max(400).optional(),
    dueTs: z.string().trim().max(64).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .passthrough();

const returnByIdsSchema = z
  .object({
    action: z.literal("returnByIds"),
    checkoutIds: z.array(z.number().int().positive()).min(1).max(300),
  })
  .passthrough();

const returnAllForClassSchema = z
  .object({
    action: z.literal("returnAllForClass"),
    classId: z.number().int().positive(),
  })
  .passthrough();

const actionSchema = z.discriminatedUnion("action", [
  createClassSchema,
  createStudentSchema,
  checkoutSchema,
  returnByIdsSchema,
  returnAllForClassSchema,
]);

function actorIdFromRecord(actor: Record<string, any> | null): number | null {
  if (!actor) return null;
  const raw = actor.id;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function orgIdFromActor(actor: Record<string, any> | null): number {
  if (!actor) return 1;
  const ws = Number.parseInt(String(actor.ws_ou ?? ""), 10);
  if (Number.isFinite(ws) && ws > 0) return ws;
  const home = Number.parseInt(String(actor.home_ou ?? ""), 10);
  if (Number.isFinite(home) && home > 0) return home;
  return 1;
}

function parseOptionalPositiveInt(input: string | null): number | null {
  if (!input) return null;
  const value = Number.parseInt(input, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 60,
    windowMs: 5 * 60 * 1000,
    endpoint: "k12-class-circulation-get",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorRecord = actor && typeof actor === "object" ? (actor as Record<string, any>) : null;
    const actorOrgId = orgIdFromActor(actorRecord);

    const { searchParams } = new URL(req.url);
    const requestedOrgId = parseOptionalPositiveInt(searchParams.get("orgId"));
    const requestedClassId = parseOptionalPositiveInt(searchParams.get("classId"));
    const orgId = requestedOrgId || actorOrgId;

    const classes = await listK12Classes(orgId);
    const selectedClassId = requestedClassId || classes[0]?.id || null;

    // IDOR check: if a specific classId was requested, verify it belongs to the actor's org
    if (requestedClassId) {
      const classInfo = await getK12ClassById(requestedClassId);
      if (!classInfo) {
        return errorResponse("Class not found", 404);
      }
      const actorWsOu = Number.parseInt(String(actorRecord?.ws_ou ?? ""), 10);
      if (Number.isFinite(actorWsOu) && classInfo.homeOu !== actorWsOu) {
        return errorResponse("Forbidden: class does not belong to your organization", 403);
      }
    }

    let students = [] as Awaited<ReturnType<typeof listK12Students>>;
    let activeCheckouts = [] as Awaited<ReturnType<typeof listK12ActiveCheckouts>>;
    if (selectedClassId) {
      [students, activeCheckouts] = await Promise.all([
        listK12Students(selectedClassId),
        listK12ActiveCheckouts(selectedClassId),
      ]);
    }

    await logK12Summary(orgId);

    return successResponse({
      orgId,
      classes,
      selectedClassId,
      students,
      activeCheckouts,
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/k12/class-circulation", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "k12-class-circulation-post",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const body = await parseJsonBodyWithSchema(req, actionSchema);
    if (body instanceof Response) return body;

    const { actor } = await requirePermissions(["CIRC_CHECKOUT"]);
    const actorRecord = actor && typeof actor === "object" ? (actor as Record<string, any>) : null;
    const actorId = actorIdFromRecord(actorRecord);
    const actorOrgId = orgIdFromActor(actorRecord);

    if (body.action === "createClass") {
      const created = await createK12Class({
        name: body.name,
        teacherName: body.teacherName,
        gradeLevel: body.gradeLevel || null,
        homeOu: body.homeOu || actorOrgId,
        actorId,
      });

      await logAuditEvent({
        action: "k12.class.create",
        entity: "k12_class",
        entityId: created.id,
        status: "success",
        actor,
        orgId: created.homeOu,
        ip,
        userAgent,
        requestId,
        details: { className: created.name, teacherName: created.teacherName },
      });

      return successResponse({ createdClass: created });
    }

    if (body.action === "createStudent") {
      // IDOR check
      const classInfo = await getK12ClassById(body.classId);
      if (!classInfo) {
        return errorResponse("Class not found", 404);
      }
      const actorWsOu = Number.parseInt(String(actorRecord?.ws_ou ?? ""), 10);
      if (Number.isFinite(actorWsOu) && classInfo.homeOu !== actorWsOu) {
        return errorResponse("Forbidden: class does not belong to your organization", 403);
      }

      const created = await createK12Student({
        classId: body.classId,
        firstName: body.firstName,
        lastName: body.lastName,
        studentIdentifier: body.studentIdentifier || null,
        actorId,
      });

      await logAuditEvent({
        action: "k12.student.create",
        entity: "k12_student",
        entityId: created.id,
        status: "success",
        actor,
        orgId: actorOrgId,
        ip,
        userAgent,
        requestId,
        details: { classId: created.classId },
      });

      return successResponse({ createdStudent: created });
    }

    if (body.action === "checkout") {
      // IDOR check
      const classInfo = await getK12ClassById(body.classId);
      if (!classInfo) {
        return errorResponse("Class not found", 404);
      }
      const actorWsOu = Number.parseInt(String(actorRecord?.ws_ou ?? ""), 10);
      if (Number.isFinite(actorWsOu) && classInfo.homeOu !== actorWsOu) {
        return errorResponse("Forbidden: class does not belong to your organization", 403);
      }

      const checkout = await createK12Checkout({
        classId: body.classId,
        studentId: body.studentId || null,
        copyBarcode: body.copyBarcode,
        title: body.title || null,
        dueTs: body.dueTs || null,
        notes: body.notes || null,
        actorId,
      });
      await publishDeveloperEvent({
        tenantId: process.env.STACKSOS_TENANT_ID || "default",
        eventType: "k12.checkout.created",
        actorId,
        requestId,
        payload: {
          classId: body.classId,
          className: classInfo?.name || null,
          checkoutId: checkout.id,
          copyBarcode: checkout.copyBarcode,
          copyId: checkout.copyId,
          title: checkout.title,
          studentId: checkout.studentId,
        },
      });

      await logAuditEvent({
        action: "k12.checkout.create",
        entity: "k12_checkout",
        entityId: checkout.id,
        status: "success",
        actor,
        orgId: classInfo?.homeOu || actorOrgId,
        ip,
        userAgent,
        requestId,
        details: { classId: body.classId, copyBarcode: checkout.copyBarcode },
      });

      return successResponse({ checkout });
    }

    if (body.action === "returnByIds") {
      const returned = await returnK12CheckoutsByIds(body.checkoutIds);
      await publishDeveloperEvent({
        tenantId: process.env.STACKSOS_TENANT_ID || "default",
        eventType: "k12.return.processed",
        actorId,
        requestId,
        payload: {
          checkoutIds: body.checkoutIds,
          returnedCount: returned,
        },
      });

      await logAuditEvent({
        action: "k12.return.by_ids",
        entity: "k12_checkout",
        entityId: body.checkoutIds[0] ?? 0,
        status: "success",
        actor: actorRecord as import("@/lib/audit").AuditActor | null,
        ip,
        userAgent,
        requestId,
        details: { checkoutIds: body.checkoutIds, returnedCount: returned },
      });

      return successResponse({ returnedCount: returned });
    }

    if (body.action === "returnAllForClass") {
      // IDOR check
      const classInfo = await getK12ClassById(body.classId);
      if (!classInfo) {
        return errorResponse("Class not found", 404);
      }
      const actorWsOu = Number.parseInt(String(actorRecord?.ws_ou ?? ""), 10);
      if (Number.isFinite(actorWsOu) && classInfo.homeOu !== actorWsOu) {
        return errorResponse("Forbidden: class does not belong to your organization", 403);
      }

      const returned = await returnAllActiveK12CheckoutsForClass(body.classId);
      await publishDeveloperEvent({
        tenantId: process.env.STACKSOS_TENANT_ID || "default",
        eventType: "k12.return.processed",
        actorId,
        requestId,
        payload: {
          classId: body.classId,
          className: classInfo.name,
          returnedCount: returned,
        },
      });

      await logAuditEvent({
        action: "k12.return.all_for_class",
        entity: "k12_class",
        entityId: body.classId,
        status: "success",
        actor: actorRecord as import("@/lib/audit").AuditActor | null,
        ip,
        userAgent,
        requestId,
        details: { classId: body.classId, className: classInfo.name, returnedCount: returned },
      });

      return successResponse({ returnedCount: returned });
    }

    return errorResponse("Unsupported action", 400);
  } catch (error) {
    return serverErrorResponse(error, "POST /api/staff/k12/class-circulation", req);
  }
}
