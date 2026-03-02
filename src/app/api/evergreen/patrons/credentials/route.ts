import { NextRequest } from "next/server";
import { consumeCredential } from "@/lib/credential-store";
import { errorResponse, successResponse, serverErrorResponse, getRequestMeta } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

/**
 * POST /api/evergreen/patrons/credentials
 *
 * One-time retrieval of a generated patron password.
 * The client sends { token } and receives { password } exactly once.
 * Subsequent calls with the same token return 404.
 */
const credentialsPostSchema = z.object({
  token: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  try {
    // Only staff with CREATE_USER (who just created the patron) should call this
    await requirePermissions(["CREATE_USER"]);

    const { ip } = getRequestMeta(req);
    const rlResult = await checkRateLimit(ip || "unknown", {
      maxAttempts: 10,
      windowMs: 5 * 60 * 1000,
      endpoint: "eg-patron-credentials",
    });
    if (!rlResult.allowed)
      return errorResponse("Too many requests. Please try again later.", 429, {
        retryAfter: Math.ceil(rlResult.resetIn / 1000),
      });

    const body = credentialsPostSchema.parse(await req.json());
    const token = body.token;

    if (!token || typeof token !== "string") {
      return errorResponse("Missing or invalid credential token", 400);
    }

    const password = consumeCredential(token);

    if (!password) {
      return errorResponse("Credential token not found or already consumed", 404);
    }

    return successResponse({ password });
  } catch (error) {
    return serverErrorResponse(error, "Credentials POST", req);
  }
}
