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
import { requireSaaSAccess } from "@/lib/saas-rbac";
import {
  getEContentProvider,
  getEContentProviders,
  type EContentConnectionMode,
  type EContentProviderId,
} from "@/lib/econtent-providers";
import { listEcontentConnections, upsertEcontentConnection } from "@/lib/db/econtent-connections";

const postSchema = z
  .object({
    providerId: z.enum(["overdrive", "hoopla", "cloudlibrary", "kanopy"]),
    enabled: z.boolean(),
    mode: z.enum(["linkout", "oauth_passthrough", "api"]).default("linkout"),
    browseUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
    appUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
    credentialRef: z.string().trim().max(200).optional().or(z.literal("")),
    supportsCheckout: z.boolean().optional().default(false),
    supportsHold: z.boolean().optional().default(false),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .strict();

function actorIdFromActor(actor: unknown): number | null {
  if (!actor || typeof actor !== "object") return null;
  const raw = (actor as Record<string, unknown>).id;
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

    const [catalog, connections] = await Promise.all([
      Promise.resolve(getEContentProviders()),
      listEcontentConnections(ctx.tenantId),
    ]);

    return successResponse({
      tenantId: ctx.tenantId,
      catalog,
      connections,
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/admin/econtent-connections", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 40,
    windowMs: 5 * 60 * 1000,
    endpoint: "admin-econtent-connections",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const body = await parseJsonBodyWithSchema(req, postSchema);
    if (body instanceof Response) return body;

    const ctx = await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });

    const provider = getEContentProvider(body.providerId);
    if (!provider) {
      return errorResponse(`Unknown provider: ${body.providerId}`, 400);
    }

    if (!provider.supportedModes.includes(body.mode as EContentConnectionMode)) {
      return errorResponse(
        `Mode ${body.mode} is not supported for ${provider.name}. Supported: ${provider.supportedModes.join(", ")}`,
        400
      );
    }

    const saved = await upsertEcontentConnection({
      tenantId: ctx.tenantId,
      providerId: body.providerId as EContentProviderId,
      enabled: body.enabled,
      mode: body.mode as EContentConnectionMode,
      browseUrl: body.browseUrl || null,
      appUrl: body.appUrl || null,
      credentialRef: body.credentialRef || null,
      supportsCheckout: body.supportsCheckout,
      supportsHold: body.supportsHold,
      notes: body.notes || null,
      updatedBy: actorIdFromActor(ctx.actor),
    });

    await logAuditEvent({
      action: "econtent.connection.upsert",
      entity: "econtent_connection",
      entityId: `${ctx.tenantId}:${saved.providerId}`,
      status: "success",
      actor: ctx.actor as import("@/lib/audit").AuditActor | null,
      ip,
      userAgent,
      requestId,
      details: {
        tenantId: ctx.tenantId,
        providerId: saved.providerId,
        enabled: saved.enabled,
        mode: saved.mode,
      },
    });

    return successResponse({ connection: saved });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/admin/econtent-connections", req);
  }
}
