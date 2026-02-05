import { NextRequest } from "next/server";
import { successResponse, serverErrorResponse } from "@/lib/api";
import { getTenantConfig } from "@/lib/tenant/config";
import { getActiveIncident } from "@/lib/db/support";

export async function GET(req: NextRequest) {
  try {
    const tenant = getTenantConfig();
    const evergreenBase = tenant.evergreenBaseUrl;

    let evergreenOk = false;
    let evergreenStatus: number | null = null;
    try {
      const res = await fetch(`${evergreenBase.replace(/\/+$/, "")}/eg2/`, { method: "HEAD", redirect: "manual" });
      evergreenStatus = res.status;
      evergreenOk = res.ok || res.status === 301 || res.status === 302;
    } catch {
      evergreenOk = false;
      evergreenStatus = null;
    }

    const incident = await getActiveIncident();

    return successResponse({
      tenant: { tenantId: tenant.tenantId, displayName: tenant.displayName, region: tenant.region || null },
      evergreen: { ok: evergreenOk, status: evergreenStatus },
      incident: incident || null,
    });
  } catch (error) {
    return serverErrorResponse(error, "Status GET", req);
  }
}
