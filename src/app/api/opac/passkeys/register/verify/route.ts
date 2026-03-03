import { NextRequest } from "next/server";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { errorResponse, getRequestMeta, parseJsonBodyWithSchema, successResponse } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { consumePasskeyChallenge, savePatronPasskey } from "@/lib/db/opac-passkeys";
import { isPasskeyFeatureEnabled } from "@/lib/passkeys";
import { logAuditEvent } from "@/lib/audit";

const verifySchema = z.object({
  challenge: z.string().min(1),
  response: z.unknown(),
  friendlyName: z.string().trim().max(80).optional(),
});

function toRegistrationResponseJSON(value: unknown): RegistrationResponseJSON | null {
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
  return raw as unknown as RegistrationResponseJSON;
}

export async function POST(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 15 * 60 * 1000,
    endpoint: "opac-passkey-register-verify",
  });
  if (!rate.allowed) {
    return errorResponse("Too many attempts. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  if (!isPasskeyFeatureEnabled()) {
    return errorResponse("Passkeys are not enabled for this library", 503);
  }

  try {
    const { patronId } = await requirePatronSession();
    const parsed = await parseJsonBodyWithSchema(req, verifySchema);
    if (parsed instanceof Response) return parsed;

    const response = toRegistrationResponseJSON(parsed.response);
    if (!response) {
      return errorResponse("Invalid passkey registration response", 400);
    }

    const challenge = await consumePasskeyChallenge({
      challenge: parsed.challenge,
      purpose: "registration",
    });
    if (!challenge) {
      return errorResponse("Passkey registration challenge expired. Please try again.", 400);
    }
    if (challenge.patronId !== patronId) {
      return errorResponse("Passkey registration challenge did not match this account", 403);
    }
    if (!challenge.authIdentifier || !challenge.pinDigestEncrypted) {
      return errorResponse("Passkey registration challenge is incomplete. Please retry.", 400);
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return errorResponse("Passkey registration could not be verified", 400);
    }

    const credential = verification.registrationInfo.credential;
    const saved = await savePatronPasskey({
      patronId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: Number(credential.counter) || 0,
      transports: Array.isArray(credential.transports)
        ? credential.transports.map((entry) => String(entry))
        : [],
      deviceType: verification.registrationInfo.credentialDeviceType || null,
      backedUp: Boolean(verification.registrationInfo.credentialBackedUp),
      friendlyName: parsed.friendlyName,
      authIdentifier: challenge.authIdentifier,
      pinDigestEncrypted: challenge.pinDigestEncrypted,
    });

    await logAuditEvent({
      action: "opac.passkey.register",
      entity: "passkey",
      entityId: saved.id,
      status: "success",
      actor: { id: patronId },
      ip,
      details: { patronId, credentialId: saved.credentialId, friendlyName: saved.friendlyName },
    }).catch(() => {});

    return successResponse({
      success: true,
      passkey: {
        id: saved.id,
        credentialId: saved.credentialId,
        friendlyName: saved.friendlyName,
        deviceType: saved.deviceType,
        backedUp: saved.backedUp,
        createdAt: saved.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Not authenticated", 401);
    }
    return errorResponse("Unable to verify passkey registration", 500);
  }
}
