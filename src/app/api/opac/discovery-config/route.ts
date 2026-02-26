import { successResponse, withErrorHandling } from "@/lib/api";
import { getTenantConfig } from "@/lib/tenant/config";

export const GET = withErrorHandling(async () => {
  const tenant = getTenantConfig();
  return successResponse({
    discovery: tenant.discovery,
    tenant: {
      tenantId: tenant.tenantId,
      profile: tenant.profile?.type || "public",
    },
  });
}, "OPAC Discovery Config GET");
