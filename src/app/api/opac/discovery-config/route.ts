import { successResponse, withErrorHandling } from "@/lib/api";
import { getTenantConfig } from "@/lib/tenant/config";

export const GET = withErrorHandling(async () => {
  const tenant = getTenantConfig();
  return successResponse({
    discovery: tenant.discovery,
    opac: tenant.opac || {},
    tenant: {
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      profile: tenant.profile?.type || "public",
      branding: tenant.branding || {},
    },
  });
}, "OPAC Discovery Config GET");
