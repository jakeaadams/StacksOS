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
import {
  applyTenantProfileDefaults,
  getTenantProfileDefaults,
  TENANT_PROFILE_TYPES,
  type TenantProfileType,
} from "@/lib/tenant/profiles";
import { loadTenantConfigFromDisk, saveTenantConfigToDisk } from "@/lib/tenant/store";

const SwitchSchema = z.object({
  profileType: z.enum(TENANT_PROFILE_TYPES as unknown as [string, ...string[]]),
});

export async function GET() {
  try {
    await requireSaaSAccess({
      target: "platform",
      minRole: "platform_admin",
      evergreenPerms: ["ADMIN_CONFIG"],
      autoBootstrapPlatformOwner: true,
    });

    const config = getTenantConfig();
    const currentProfile = config.profile?.type || "public";
    const defaults = getTenantProfileDefaults(currentProfile as TenantProfileType);

    return successResponse({
      currentProfile,
      primaryColor: config.branding?.primaryColor || defaults.branding?.primaryColor || "#0f766e",
      profiles: TENANT_PROFILE_TYPES.map((type) => {
        const d = getTenantProfileDefaults(type);
        return {
          type,
          description: d.description,
          primaryColor: d.branding?.primaryColor,
        };
      }),
    });
  } catch (error) {
    return serverErrorResponse(error, "Demo Profile GET");
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "demo-profile-switch",
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

    const body = await parseJsonBodyWithSchema(req, SwitchSchema);
    if (body instanceof Response) return body;

    const tenantId = getTenantId();
    const existing = loadTenantConfigFromDisk(tenantId);
    const profileType = body.profileType as TenantProfileType;
    const profileDefaults = getTenantProfileDefaults(profileType);

    const updatedConfig = applyTenantProfileDefaults({
      ...(existing || getTenantConfig()),
      tenantId,
      profile: { type: profileType },
      branding: {
        primaryColor: profileDefaults.branding?.primaryColor,
      },
    });

    saveTenantConfigToDisk(updatedConfig);
    clearTenantConfigCache();

    await logAuditEvent({
      action: "tenant.profile_switch",
      entity: "tenant",
      entityId: tenantId,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        previousProfile: existing?.profile?.type || "public",
        newProfile: profileType,
      },
    });

    return successResponse({
      switched: true,
      profileType,
      primaryColor: profileDefaults.branding?.primaryColor || "#0f766e",
      description: profileDefaults.description,
      featureFlags: profileDefaults.featureFlags,
    });
  } catch (error) {
    return serverErrorResponse(error, "Demo Profile POST", req);
  }
}
