import { NextRequest } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  parseJsonBodyWithSchema,
  successResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireSaaSAccess } from "@/lib/saas-rbac";
import { createIncident, listIncidents, resolveIncident } from "@/lib/db/support";
import { logAuditEvent } from "@/lib/audit";

const BodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      message: z.string().min(1).max(1000),
      severity: z.enum(["info", "warning", "error"]).default("info"),
      endsAt: z.string().nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("resolve"),
      id: z.number().int().positive(),
    })
    .strict(),
]);

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);
    const incidents = await listIncidents(50);
    return successResponse({ incidents });
  } catch (error) {
    return serverErrorResponse(error, "Incidents GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "admin-incidents",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requireSaaSAccess({
      target: "platform",
      minRole: "platform_admin",
      evergreenPerms: ["ADMIN_CONFIG"],
      autoBootstrapPlatformOwner: true,
    });
    const body = await parseJsonBodyWithSchema(req, BodySchema);
    if (body instanceof Response) return body;

    if (body.action === "create") {
      const created = await createIncident({
        message: body.message,
        severity: body.severity,
        endsAt: body.endsAt || null,
        createdBy: actor?.id ?? null,
      });
      const id = created?.id ?? null;
      if (!id) return errorResponse("Failed to create incident", 500);

      await logAuditEvent({
        action: "ops.incident.create",
        entity: "incident_banner",
        entityId: id,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { severity: body.severity, endsAt: body.endsAt || null },
      });

      return successResponse({ created: true, id });
    }

    if (body.action === "resolve") {
      await resolveIncident(body.id);
      await logAuditEvent({
        action: "ops.incident.resolve",
        entity: "incident_banner",
        entityId: body.id,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
      });
      return successResponse({ resolved: true, id: body.id });
    }

    return errorResponse("Invalid action", 400);
  } catch (error) {
    return serverErrorResponse(error, "Incidents POST", req);
  }
}
