import { NextRequest } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  countActivePlatformAdmins,
  deactivateSaasRoleBinding,
  getSaasRoleBindingById,
  listSaasRoleBindings,
  SAAS_ROLE_VALUES,
  upsertSaasRoleBinding,
} from "@/lib/db/saas-rbac";
import { requireSaaSAccess } from "@/lib/saas-rbac";

const RoleSchema = z.enum(SAAS_ROLE_VALUES);

const BodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("upsert"),
      actorId: z.number().int().positive().optional(),
      username: z.string().trim().min(1).optional(),
      tenantId: z.string().trim().min(1).optional(),
      role: RoleSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      id: z.number().int().positive(),
    })
    .strict(),
]);

function actorIdFromActor(actor: any): number | null {
  const raw = actor?.id ?? actor?.usr;
  const parsed = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    await requireSaaSAccess({
      target: "platform",
      minRole: "platform_admin",
      evergreenPerms: ["ADMIN_CONFIG"],
      autoBootstrapPlatformOwner: true,
    });

    const [bindings, platformAdminCount] = await Promise.all([
      listSaasRoleBindings(1000),
      countActivePlatformAdmins(),
    ]);

    return successResponse({
      roles: SAAS_ROLE_VALUES,
      bindings,
      platformAdminCount,
    });
  } catch (error) {
    return serverErrorResponse(error, "Admin SaaS Roles GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "admin-saas-roles",
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
    const actorId = actorIdFromActor(actor);

    const body = await parseJsonBodyWithSchema(req, BodySchema);
    if (body instanceof Response) return body;

    if (body.action === "upsert") {
      const binding = await upsertSaasRoleBinding({
        actorId: body.actorId,
        username: body.username,
        tenantId: body.tenantId,
        role: body.role,
        updatedBy: actorId,
      });

      await logAuditEvent({
        action: "saas.role.upsert",
        entity: "saas_role_binding",
        entityId: binding.id,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: {
          actorId: binding.actorId,
          username: binding.username,
          tenantId: binding.tenantId,
          role: binding.role,
        },
      });

      return successResponse({ saved: true, binding });
    }

    const existing = await getSaasRoleBindingById(body.id);
    if (!existing || !existing.active) {
      return errorResponse("SaaS role binding not found", 404);
    }

    if (existing.role === "platform_owner" || existing.role === "platform_admin") {
      const activePlatformAdmins = await countActivePlatformAdmins();
      if (activePlatformAdmins <= 1) {
        return errorResponse("Cannot remove the last active platform admin", 400);
      }
    }

    const removed = await deactivateSaasRoleBinding({ id: body.id, updatedBy: actorId });
    if (!removed) {
      return errorResponse("SaaS role binding not found", 404);
    }

    await logAuditEvent({
      action: "saas.role.delete",
      entity: "saas_role_binding",
      entityId: body.id,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        actorId: existing.actorId,
        username: existing.username,
        tenantId: existing.tenantId,
        role: existing.role,
      },
    });

    return successResponse({ deleted: true, id: body.id });
  } catch (error) {
    return serverErrorResponse(error, "Admin SaaS Roles POST", req);
  }
}
