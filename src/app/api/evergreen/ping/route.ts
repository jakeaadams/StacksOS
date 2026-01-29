import { successResponse, errorResponse } from "@/lib/api";

const EVERGREEN_BASE = process.env.EVERGREEN_BASE_URL;

export async function GET() {
  if (!EVERGREEN_BASE) {
    return errorResponse("EVERGREEN_BASE_URL not set", 500);
  }

  try {
    const res = await fetch(`${EVERGREEN_BASE}/eg2/`, {
      method: "HEAD",
      redirect: "manual",
    });
    return successResponse({
      status: res.status,
      url: `${EVERGREEN_BASE}/eg2/`,
    });
  } catch (error) {
    return errorResponse(String(error), 502, { url: `${EVERGREEN_BASE}/eg2/` });
  }
}
