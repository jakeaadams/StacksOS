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
import { requireSaaSAccess } from "@/lib/saas-rbac";
import {
  DEVELOPER_EVENT_TYPES,
  createWebhookSubscription,
  deleteWebhookSubscription,
  listWebhookDeliveries,
  listWebhookSubscriptions,
  triggerWebhookTest,
  updateWebhookSubscription,
} from "@/lib/developer/webhooks";

const eventValueSchema = z.union([
  z.literal("*"),
  z.enum(DEVELOPER_EVENT_TYPES as unknown as [string, ...string[]]),
]);

const createSchema = z
  .object({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(128),
    endpointUrl: z.string().trim().min(1).max(2000),
    events: z.array(eventValueSchema).min(1).max(40),
    active: z.boolean().optional(),
    secret: z.string().trim().max(256).optional(),
  })
  .passthrough();

const testSchema = z
  .object({
    action: z.literal("test"),
    id: z.number().int().positive(),
  })
  .passthrough();

const postSchema = z.discriminatedUnion("action", [createSchema, testSchema]);

const updateSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(128).optional(),
    endpointUrl: z.string().trim().min(1).max(2000).optional(),
    events: z.array(eventValueSchema).min(1).max(40).optional(),
    active: z.boolean().optional(),
    secret: z.string().trim().max(256).optional(),
  })
  .passthrough();

const deleteSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .passthrough();

function actorIdFromContextActor(actor: unknown): number | null {
  if (!actor || typeof actor !== "object") return null;
  const raw = (actor as Record<string, any>).id;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });
    const [subscriptions, deliveries] = await Promise.all([
      listWebhookSubscriptions(ctx.tenantId),
      listWebhookDeliveries({ tenantId: ctx.tenantId, limit: 50 }),
    ]);

    return successResponse({
      tenantId: ctx.tenantId,
      eventsCatalog: [...DEVELOPER_EVENT_TYPES],
      subscriptions,
      deliveries,
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/admin/developer/webhooks", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const body = await parseJsonBodyWithSchema(req, postSchema);
    if (body instanceof Response) return body;

    const ctx = await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });
    const actorId = actorIdFromContextActor(ctx.actor);

    if (body.action === "create") {
      const created = await createWebhookSubscription({
        tenantId: ctx.tenantId,
        name: body.name,
        endpointUrl: body.endpointUrl,
        events: body.events,
        active: body.active,
        secret: body.secret,
        actorId,
      });

      await logAuditEvent({
        action: "webhook.create",
        entity: "webhook_subscription",
        entityId: created.id,
        status: "success",
        actor: ctx.actor as import("@/lib/audit").AuditActor | null,
        ip,
        userAgent,
        requestId,
        details: { webhookId: created.id, name: body.name },
      });

      return successResponse({ subscription: created });
    }

    if (body.action === "test") {
      const result = await triggerWebhookTest({
        tenantId: ctx.tenantId,
        webhookId: body.id,
        actorId,
      });
      return successResponse({ test: result });
    }

    return errorResponse("Unsupported action", 400);
  } catch (error) {
    return serverErrorResponse(error, "POST /api/admin/developer/webhooks", req);
  }
}

export async function PUT(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const body = await parseJsonBodyWithSchema(req, updateSchema);
    if (body instanceof Response) return body;

    const ctx = await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });
    const actorId = actorIdFromContextActor(ctx.actor);

    const updated = await updateWebhookSubscription({
      id: body.id,
      tenantId: ctx.tenantId,
      name: body.name,
      endpointUrl: body.endpointUrl,
      events: body.events,
      active: body.active,
      secret: body.secret,
      actorId,
    });
    if (!updated) return errorResponse("Webhook subscription not found", 404);

    await logAuditEvent({
      action: "webhook.update",
      entity: "webhook_subscription",
      entityId: body.id,
      status: "success",
      actor: ctx.actor as import("@/lib/audit").AuditActor | null,
      ip,
      userAgent,
      requestId,
      details: { webhookId: body.id },
    });

    return successResponse({ subscription: updated });
  } catch (error) {
    return serverErrorResponse(error, "PUT /api/admin/developer/webhooks", req);
  }
}

export async function DELETE(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const body = await parseJsonBodyWithSchema(req, deleteSchema);
    if (body instanceof Response) return body;

    const ctx = await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });

    const deleted = await deleteWebhookSubscription({ id: body.id, tenantId: ctx.tenantId });
    if (!deleted) return errorResponse("Webhook subscription not found", 404);

    await logAuditEvent({
      action: "webhook.delete",
      entity: "webhook_subscription",
      entityId: body.id,
      status: "success",
      actor: ctx.actor as import("@/lib/audit").AuditActor | null,
      ip,
      userAgent,
      requestId,
      details: { webhookId: body.id },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return serverErrorResponse(error, "DELETE /api/admin/developer/webhooks", req);
  }
}
