import { NextRequest } from "next/server";
import { successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import { callOpenSRF, requireAuthToken } from "@/lib/api/client";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get("q") || "";
  const axis = searchParams.get("axis") || ""; // author, subject, title, etc.

  try {
    if (\!query) {
      return errorResponse("Query required", 400);
    }

    const authtoken = await requireAuthToken();
    const requestId = req.headers.get("x-request-id") || null;
    
    logger.debug({ requestId, route: "api.evergreen.authority", query, axis }, "Authority search");

    // Use open-ils.search for authority browse
    // The browse method returns authority headings matching the search term
    const response = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.authority.simple_heading.browse",
      [
        authtoken,
        query,
        axis || null, // authority type filter (author, subject, title, etc.)
        10, // limit results
        0,  // offset
      ]
    );

    const authorities = response?.payload || [];
    
    // Transform results to a consistent format
    const results = authorities.map((auth: any, index: number) => {
      // Handle both simple string results and complex objects
      if (typeof auth === "string") {
        return {
          id: index,
          heading: auth,
          type: axis || "unknown",
        };
      }
      
      return {
        id: auth?.id || index,
        heading: auth?.heading || auth?.main_heading || auth?.value || String(auth),
        type: auth?.type || axis || "unknown",
        see_also: auth?.see_also || [],
        see_from: auth?.see_from || [],
      };
    });

    return successResponse({
      count: results.length,
      authorities: results,
      query,
      axis: axis || null,
    });

  } catch (error) {
    return serverErrorResponse(error, "Authority GET", req);
  }
}
