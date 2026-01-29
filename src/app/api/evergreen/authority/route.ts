import { NextRequest } from "next/server";
import { successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get("q") || "";

  try {
    if (!query) {
      return errorResponse("Query required", 400);
    }

    const requestId = req.headers.get("x-request-id") || null;
    logger.debug({ requestId, route: "api.evergreen.authority", query }, "Authority search");

    // Authority search is not wired yet for this sandbox.
    // We intentionally return an empty result set (not a 500) until the
    // Evergreen authority workflows are implemented end-to-end in StacksOS.
    return successResponse(
      { count: 0, authorities: [] },
      "Authority search is not configured yet"
    );
  } catch (error) {
    return serverErrorResponse(error, "Authority GET", req);
  }
}
