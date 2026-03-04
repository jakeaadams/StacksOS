import { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { verifyTotpCode, decryptTotpSecret, generateRecoveryCodes, isMfaEnabled } from "@/lib/mfa";
import {
  getMfaMethodById,
  verifyAndActivateMfa,
  storeRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/db/opac-mfa";

const verifySchema = z.object({
  methodId: z.number().int().positive(),
  code: z.string().length(6),
});

/**
 * POST /api/opac/mfa/verify
 *
 * Confirm MFA enrollment by verifying a TOTP code.
 * On success, activates the method and returns recovery codes.
 */
export async function POST(req: NextRequest) {
  const { ip, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 15 * 60 * 1000,
    endpoint: "mfa-verify",
  });
  if (!rate.allowed) {
    return errorResponse("Too many verification attempts. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    if (!isMfaEnabled()) {
      return errorResponse("MFA is not configured for this library.", 501);
    }

    const { patronId } = await requirePatronSession();

    const body = await req.json();
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid request: method ID and 6-digit code are required.", 400);
    }

    const { methodId, code } = parsed.data;

    // Fetch the unverified method
    const method = await getMfaMethodById(methodId);
    if (!method || Number(method.patron_id) !== patronId) {
      return errorResponse("MFA method not found.", 404);
    }

    if (method.verified) {
      return errorResponse("This MFA method is already verified.", 400);
    }

    if (method.revoked_at) {
      return errorResponse("This MFA method has been revoked.", 400);
    }

    // Decrypt and verify
    const secret = decryptTotpSecret(method.secret_encrypted);
    const isValid = verifyTotpCode(secret, code);

    if (!isValid) {
      return errorResponse("Invalid code. Please check your authenticator app and try again.", 400);
    }

    // Activate the method
    await verifyAndActivateMfa(methodId);

    // Generate recovery codes
    const recoveryCodes = generateRecoveryCodes(8);
    const codeHashes = recoveryCodes.map(hashRecoveryCode);
    await storeRecoveryCodes(methodId, codeHashes);

    await logAuditEvent({
      action: "opac.mfa.enrolled",
      entity: "mfa_method",
      entityId: String(methodId),
      status: "success",
      actor: { id: patronId },
      ip,
      requestId,
    }).catch(() => {});

    return successResponse({
      success: true,
      recoveryCodes,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(error, "POST /api/opac/mfa/verify", req);
  }
}
