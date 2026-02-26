import { successResponse, errorResponse } from "@/lib/api";
import { fetchEvergreen } from "@/lib/api/evergreen-fetch";
import { getTenantConfig } from "@/lib/tenant/config";

export async function GET() {
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
      url,
    });
  } catch (error) {
    return errorResponse(String(error), 502, { url });
  }
}
