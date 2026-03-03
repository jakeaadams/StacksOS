import { NextRequest } from "next/server";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { checkRateLimit, recordSuccess } from "@/lib/rate-limit";
import { errorResponse, getRequestMeta, parseJsonBodyWithSchema, successResponse } from "@/lib/api";
import {
  consumePasskeyChallenge,
  getPasskeyByCredentialId,
  updatePasskeyCounter,
} from "@/lib/db/opac-passkeys";
import { decryptPasskeyPinDigest } from "@/lib/passkey-secret";
import { authenticateOpacWithPinDigest, isPasskeyFeatureEnabled } from "@/lib/passkeys";
import { isCookieSecure } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit";

const verifySchema = z.object({
  challenge: z.string().min(1),
  response: z.unknown(),
  rememberMe: z.boolean().optional(),
});

function toAuthenticationResponseJSON(value: unknown): AuthenticationResponseJSON | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.rawId !== "string" ||
    !raw.response ||
    typeof raw.response !== "object" ||
    !raw.clientExtensionResults ||
    typeof raw.clientExtensionResults !== "object" ||
    typeof raw.type !== "string"
  ) {
    return null;
  }
  return raw as unknown as AuthenticationResponseJSON;
}

export async function POST(req: NextRequest) {
  const { ip, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 15 * 60 * 1000,
    endpoint: "patron-auth-passkey",
  });
  if (!rate.allowed) {
    const waitMinutes = Math.ceil(rate.resetIn / 60000);
    return errorResponse(
      `Too many login attempts. Please try again in ${waitMinutes} minute(s).`,
      429,
      {
        retryAfter: Math.ceil(rate.resetIn / 1000),
        limit: rate.limit,
        resetTime: new Date(rate.resetTime).toISOString(),
      }
    );
  }

  if (!isPasskeyFeatureEnabled()) {
    return errorResponse("Passkeys are not enabled for this library", 503);
  }

  const parsed = await parseJsonBodyWithSchema(req, verifySchema);
  if (parsed instanceof Response) return parsed;

  const response = toAuthenticationResponseJSON(parsed.response);
  if (!response) {
    return errorResponse("Invalid passkey authentication response", 400);
  }

  const challenge = await consumePasskeyChallenge({
    challenge: parsed.challenge,
    purpose: "authentication",
  });
  if (!challenge) {
    return errorResponse("Passkey sign-in challenge expired. Please try again.", 400);
  }

  const passkey = await getPasskeyByCredentialId(response.id);
  if (!passkey) {
    return errorResponse("Passkey not recognized", 401);
  }

  if (challenge.authIdentifier && passkey.authIdentifier !== challenge.authIdentifier) {
    return errorResponse("Passkey did not match the requested library card", 403);
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.origin,
    expectedRPID: challenge.rpId,
    requireUserVerification: true,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64url"),
      counter: passkey.counter,
    },
  });

  if (!verification.verified || !verification.authenticationInfo) {
    return errorResponse("Passkey verification failed", 401);
  }

  await updatePasskeyCounter({
    id: passkey.id,
    counter: Number(verification.authenticationInfo.newCounter) || passkey.counter,
  });

  let pinDigest = "";
  try {
    pinDigest = decryptPasskeyPinDigest(passkey.pinDigestEncrypted);
  } catch {
    return errorResponse(
      "Passkey data is invalid. Sign in with PIN and re-enroll this passkey.",
      401,
      {
        code: "stale_passkey_pin",
      }
    );
  }

  const authResult = await authenticateOpacWithPinDigest(passkey.authIdentifier, pinDigest);
  if (!authResult) {
    return errorResponse(
      "Passkey sign-in needs refresh. Sign in with PIN and re-enroll this passkey.",
      401,
      {
        code: "pin_changed",
      }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set("patron_authtoken", authResult.authtoken, {
    httpOnly: true,
    secure: isCookieSecure(req),
    sameSite: "lax",
    path: "/",
    maxAge: parsed.rememberMe ? 60 * 60 * 24 : 60 * 60 * 2,
  });

  await recordSuccess(ip || "unknown", "patron-auth-passkey");
  await logAuditEvent({
    action: "opac.passkey.login",
    entity: "patron_session",
    entityId: authResult.patron.id,
    status: "success",
    actor: { id: authResult.patron.id },
    ip,
    requestId,
    details: {
      patronId: authResult.patron.id,
      passkeyId: passkey.id,
      rememberMe: Boolean(parsed.rememberMe),
    },
  }).catch(() => {});

  return successResponse({
    success: true,
    patron: authResult.patron,
  });
}
