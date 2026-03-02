import { successResponse, errorResponse, requireAuthToken } from "@/lib/api";
import { fetchEvergreen } from "@/lib/api/evergreen-fetch";
import { getTenantConfig } from "@/lib/tenant/config";

export async function GET() {
  // Require staff authentication — this endpoint exposes infrastructure details.
  try {
    await requireAuthToken();
  } catch {
    return errorResponse("Authentication required", 401);
  }

  const evergreenBase = getTenantConfig().evergreenBaseUrl;
  if (!evergreenBase) {
    return errorResponse("Evergreen base URL not configured", 500);
  }

  const url = `${evergreenBase.replace(/\/+$/, "")}/eg2/`;

  try {
    const res = await fetchEvergreen(url, {
      method: "HEAD",
      redirect: "manual",
    });

    return successResponse({
      status: res.status,
      reachable: res.ok || res.status === 301 || res.status === 302,
    });
  } catch {
    return errorResponse("Evergreen unreachable", 502);
  }
}
