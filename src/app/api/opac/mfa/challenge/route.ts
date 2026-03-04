import { NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";

import {
  errorResponse,
  getRequestMeta,
  serverErrorResponse,
  successResponse,
  callOpenSRF,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { checkRateLimit, recordSuccess } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { isCookieSecure } from "@/lib/csrf";
import { verifyTotpCode, decryptTotpSecret, isMfaEnabled } from "@/lib/mfa";
import {
  getActiveMfaMethods,
  updateMfaLastUsed,
  hashRecoveryCode,
  consumeRecoveryCode,
} from "@/lib/db/opac-mfa";

const challengeSchema = z.object({
  code: z.string().min(1).max(20),
  patronToken: z.string().min(1), // Encrypted temp token from login
  rememberMe: z.boolean().optional(),
});

/**
 * POST /api/opac/mfa/challenge
 *
 * Verifies a TOTP code or recovery code during the MFA login step.
 * On success, sets the auth cookie (completing login).
 */
export async function POST(req: NextRequest) {
  const { ip, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    endpoint: "mfa-challenge",
  });
  if (!rate.allowed) {
    return errorResponse("Too many attempts. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    if (!isMfaEnabled()) {
      return errorResponse("MFA is not configured.", 501);
    }

    const body = await req.json();
    const parsed = challengeSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Code and patron token are required.", 400);
    }

    const { code, patronToken, rememberMe } = parsed.data;

    // The patronToken IS the Evergreen authtoken, held temporarily by the client.
    // Verify it's still valid by retrieving the session.
    const sessionResponse = await callOpenSRF("open-ils.auth", "open-ils.auth.session.retrieve", [
      patronToken,
    ]);
    const user = sessionResponse?.payload?.[0];
    if (!user || user.ilsevent) {
      return errorResponse("Session expired. Please log in again.", 401);
    }

    const patronId = Number(user.id);
    const methods = await getActiveMfaMethods(patronId);
    if (methods.length === 0) {
      return errorResponse("No MFA methods configured.", 400);
    }

    // Check if it's a TOTP code (6 digits) or recovery code
    const isRecoveryCode = code.includes("-") || code.length > 6;

    if (isRecoveryCode) {
      // Try recovery code against all active methods
      const codeHash = hashRecoveryCode(code);
      let consumed = false;
      let usedMethodId = 0;

      for (const method of methods) {
        const result = await consumeRecoveryCode(Number(method.id), codeHash);
        if (result) {
          consumed = true;
          usedMethodId = Number(method.id);
          break;
        }
      }

      if (!consumed) {
        logger.warn({ patronId, ip }, "MFA challenge: invalid recovery code");
        return errorResponse("Invalid recovery code.", 401);
      }

      await updateMfaLastUsed(usedMethodId);

      await logAuditEvent({
        action: "opac.mfa.recovery_code_used",
        entity: "mfa_method",
        entityId: String(usedMethodId),
        status: "success",
        actor: { id: patronId },
        ip,
        requestId,
      }).catch(() => {});
    } else {
      // Verify TOTP code
      let verified = false;
      let verifiedMethodId = 0;

      for (const method of methods) {
        if (method.type !== "totp") continue;
        const secret = decryptTotpSecret(method.secret_encrypted);
        if (verifyTotpCode(secret, code)) {
          verified = true;
          verifiedMethodId = Number(method.id);
          break;
        }
      }

      if (!verified) {
        logger.warn({ patronId, ip }, "MFA challenge: invalid TOTP code");
        return errorResponse("Invalid code. Please try again.", 401);
      }

      await updateMfaLastUsed(verifiedMethodId);
    }

    // MFA passed — set the auth cookie
    const cookieStore = await cookies();
    const cookieSecure = isCookieSecure(req);

    cookieStore.set("patron_authtoken", patronToken, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: rememberMe ? 60 * 60 * 24 : 60 * 60 * 2,
    });

    await recordSuccess(ip || "unknown", "mfa-challenge");

    logger.info({ patronId }, "MFA challenge passed, login complete");

    return successResponse({
      success: true,
      usedRecoveryCode: isRecoveryCode,
      patron: {
        id: user.id,
        firstName: user.first_given_name,
        lastName: user.family_name,
        email: user.email,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/opac/mfa/challenge", req);
  }
}
