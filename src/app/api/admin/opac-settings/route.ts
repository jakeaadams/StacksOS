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
import { clearTenantConfigCache, getTenantConfig, getTenantId } from "@/lib/tenant/config";
import { applyTenantProfileDefaults } from "@/lib/tenant/profiles";
import {
  TenantBrandingSchema,
  TenantConfigSchema,
  TenantOpacConfigSchema,
} from "@/lib/tenant/schema";
import { loadTenantConfigFromDisk, saveTenantConfigToDisk } from "@/lib/tenant/store";

const postSchema = z
  .object({
    opac: TenantOpacConfigSchema,
    branding: TenantBrandingSchema.partial().optional(),
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
    await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });
    const tenant = getTenantConfig();
    return successResponse({
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      profile: tenant.profile?.type || "public",
      branding: tenant.branding || {},
      opac: tenant.opac || {},
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/admin/opac-settings", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "admin-opac-settings",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });
    const body = await parseJsonBodyWithSchema(req, postSchema);
    if (body instanceof Response) return body;

    const tenantId = getTenantId();
    const actorId = actorIdFromActor(actor);
    const existing = loadTenantConfigFromDisk(tenantId) || getTenantConfig();
    const updated = applyTenantProfileDefaults(
      TenantConfigSchema.parse({
        ...existing,
        opac: body.opac,
        branding: {
          ...(existing.branding || {}),
          ...(body.branding || {}),
        },
      })
    );
    saveTenantConfigToDisk(updated);
    clearTenantConfigCache();

    await logAuditEvent({
      action: "opac.settings.update",
      entity: "tenant",
      entityId: tenantId,
      status: "success",
      actor: actor as import("@/lib/audit").AuditActor | null,
      ip,
      userAgent,
      requestId,
      details: {
        tenantId,
        actorId,
      },
    }).catch(() => {});

    return successResponse({
      saved: true,
      tenantId,
      opac: updated.opac,
      branding: updated.branding,
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/admin/opac-settings", req);
  }
}
