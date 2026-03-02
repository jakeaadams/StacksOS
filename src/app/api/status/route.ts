import { successResponse, withErrorHandling, requireAuthToken } from "@/lib/api";
import { getTenantConfig } from "@/lib/tenant/config";
import { getActiveIncident } from "@/lib/db/support";

export const GET = withErrorHandling(async (_req: Request) => {
  // Require staff authentication — this endpoint exposes tenant/infrastructure details.
  await requireAuthToken();

  const tenant = getTenantConfig();
  const evergreenBase = tenant.evergreenBaseUrl;

  let evergreenOk = false;
  let evergreenStatus: number | null = null;
  try {
    const res = await fetch(`${evergreenBase.replace(/\/+$/, "")}/eg2/`, {
      method: "HEAD",
      redirect: "manual",
    });
    evergreenStatus = res.status;
    evergreenOk = res.ok || res.status === 301 || res.status === 302;
  } catch {
    evergreenOk = false;
    evergreenStatus = null;
  }

  const incident = await getActiveIncident();

  return successResponse({
    tenant: {
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      region: tenant.region || null,
      profile: tenant.profile?.type || "public",
    },
    evergreen: { ok: evergreenOk, status: evergreenStatus },
    incident: incident || null,
  });
}, "Status GET");
