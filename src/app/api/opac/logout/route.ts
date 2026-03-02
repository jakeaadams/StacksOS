import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  serverErrorResponse,
  errorResponse,
  getRequestMeta,
} from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

import { cookies } from "next/headers";
import { z as _z } from "zod";

/**
 * OPAC Patron Logout
 * POST /api/opac/logout
 */
export async function POST(req: NextRequest) {
  const { ip } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
    endpoint: "opac-logout",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (patronToken) {
      // End Evergreen session
      await callOpenSRF("open-ils.auth", "open-ils.auth.session.delete", [patronToken]);
    }

    // Clear cookie
    cookieStore.delete("patron_authtoken");

    return successResponse({ success: true });
  } catch (error) {
    // Still clear cookie even on _error
    const cookieStore = await cookies();
    cookieStore.delete("patron_authtoken");
    return serverErrorResponse(error, "OPAC Logout POST", req);
  }
}
