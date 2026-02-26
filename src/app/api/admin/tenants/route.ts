import { NextRequest } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { fetchEvergreen } from "@/lib/api/evergreen-fetch";
import { logAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireSaaSAccess } from "@/lib/saas-rbac";
import { clearTenantConfigCache, getTenantConfig, getTenantId } from "@/lib/tenant/config";
import {
  applyTenantProfileDefaults,
  getTenantProfileCatalog,
  TENANT_PROFILE_TYPES,
} from "@/lib/tenant/profiles";
import { TenantConfigSchema } from "@/lib/tenant/schema";
import {
  deleteTenantConfigFromDisk,
  listTenantConfigsFromDisk,
  loadTenantConfigFromDisk,
  saveTenantConfigToDisk,
} from "@/lib/tenant/store";

const TenantIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Invalid tenant id");

const BodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("upsert"),
      tenant: TenantConfigSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      tenantId: TenantIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("validate"),
      tenantId: TenantIdSchema.optional(),
      evergreenBaseUrl: z.string().url().optional(),
    })
    .strict(),
]);

async function probeEvergreenBaseUrl(evergreenBaseUrl: string) {
  const base = evergreenBaseUrl.replace(/\/+$/, "");
  const probes = [
    { key: "eg2", url: `${base}/eg2/`, method: "HEAD" as const },
    { key: "osrfGateway", url: `${base}/osrf-gateway-v1`, method: "HEAD" as const },
  ];

  const out: Record<string, { ok: boolean; status: number | null; error?: string; url: string }> =
    {};

  for (const probe of probes) {
    try {
      const res = await fetchEvergreen(probe.url, {
        method: probe.method,
        redirect: "manual",
        cache: "no-store",
      });
      const status = res.status;
      const ok = status >= 200 && status < 500;
      out[probe.key] = { ok, status, url: probe.url };
    } catch (error) {
      out[probe.key] = {
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : String(error),
        url: probe.url,
      };
    }
  }

  const ok = Object.values(out).every((p) => p.ok);
  return { ok, probes: out };
}

export async function GET(req: NextRequest) {
  try {
    await requireSaaSAccess({
      target: "platform",
      minRole: "platform_admin",
      evergreenPerms: ["ADMIN_CONFIG"],
      autoBootstrapPlatformOwner: true,
    });

    const requestedTenantId = req.nextUrl.searchParams.get("tenant_id");
    const activeTenantId = getTenantId();

    if (requestedTenantId) {
      const tenantId = TenantIdSchema.parse(requestedTenantId);
      const tenant = loadTenantConfigFromDisk(tenantId);
      if (!tenant) {
        return errorResponse(`Tenant config not found: ${tenantId}`, 404);
      }
      return successResponse({
        tenant: applyTenantProfileDefaults(tenant),
        activeTenantId,
        profileCatalog: getTenantProfileCatalog(),
      });
    }

    const tenants = listTenantConfigsFromDisk();
    return successResponse({
      activeTenantId,
      activeTenant: getTenantConfig(),
      profiles: TENANT_PROFILE_TYPES,
      profileCatalog: getTenantProfileCatalog(),
      tenants,
      count: tenants.length,
    });
  } catch (error) {
    return serverErrorResponse(error, "Admin Tenants GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
    endpoint: "admin-tenants",
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

    if (body.action === "upsert") {
      const tenant = applyTenantProfileDefaults(body.tenant);
      const outPath = saveTenantConfigToDisk(tenant);

      if (tenant.tenantId === getTenantId()) {
        clearTenantConfigCache();
      }

      await logAuditEvent({
        action: "tenant.upsert",
        entity: "tenant",
        entityId: tenant.tenantId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: {
          displayName: tenant.displayName,
          profile: tenant.profile?.type || "public",
          evergreenBaseUrl: tenant.evergreenBaseUrl,
          outPath,
        },
      });

      return successResponse({
        saved: true,
        tenant,
        outPath,
        requiresRestart: tenant.tenantId === getTenantId(),
        message:
          tenant.tenantId === getTenantId()
            ? "Tenant updated. Restart StacksOS to apply tenant changes to all routes."
            : "Tenant config saved.",
      });
    }

    if (body.action === "delete") {
      const activeTenantId = getTenantId();
      if (body.tenantId === activeTenantId) {
        return errorResponse("Cannot delete currently active tenant", 400);
      }

      const deleted = deleteTenantConfigFromDisk(body.tenantId);
      if (!deleted) {
        return errorResponse(`Tenant config not found: ${body.tenantId}`, 404);
      }

      await logAuditEvent({
        action: "tenant.delete",
        entity: "tenant",
        entityId: body.tenantId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
      });

      return successResponse({ deleted: true, tenantId: body.tenantId });
    }

    const targetTenant = body.tenantId ? loadTenantConfigFromDisk(body.tenantId) : null;
    const evergreenBaseUrl =
      body.evergreenBaseUrl || targetTenant?.evergreenBaseUrl || getTenantConfig().evergreenBaseUrl;
    const probe = await probeEvergreenBaseUrl(evergreenBaseUrl);

    return successResponse({
      validated: true,
      tenantId: targetTenant?.tenantId || body.tenantId || getTenantId(),
      evergreenBaseUrl,
      connectivity: probe,
    });
  } catch (error) {
    return serverErrorResponse(error, "Admin Tenants POST", req);
  }
}
