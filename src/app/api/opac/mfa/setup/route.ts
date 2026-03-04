import { NextRequest } from "next/server";

import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { generateTotpSecret, generateTotpUri, encryptTotpSecret, isMfaEnabled } from "@/lib/mfa";
import { createMfaMethod } from "@/lib/db/opac-mfa";

/**
 * POST /api/opac/mfa/setup
 *
 * Start MFA enrollment. Returns a TOTP secret and URI for QR code rendering.
 */
export async function POST(req: NextRequest) {
  const { ip, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    endpoint: "mfa-setup",
  });
  if (!rate.allowed) {
    return errorResponse("Too many MFA setup attempts. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    if (!isMfaEnabled()) {
      return errorResponse("MFA is not configured for this library.", 501);
    }

    const { patronId, user } = await requirePatronSession();

    // Generate TOTP secret
    const secret = generateTotpSecret();
    const patronLabel = user?.usrname || user?.first_given_name || `Patron ${patronId}`;
    const uri = generateTotpUri(secret, patronLabel);

    // Store as unverified — will be activated when patron confirms with a valid code
    const encryptedSecret = encryptTotpSecret(secret);
    const methodId = await createMfaMethod({
      patronId,
      type: "totp",
      friendlyName: "Authenticator App",
      secretEncrypted: encryptedSecret,
    });

    await logAuditEvent({
      action: "opac.mfa.setup_started",
      entity: "mfa_method",
      entityId: String(methodId),
      status: "success",
      actor: { id: patronId },
      ip,
      requestId,
    }).catch(() => {});

    return successResponse({
      methodId,
      secret,
      uri,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(error, "POST /api/opac/mfa/setup", req);
  }
}
