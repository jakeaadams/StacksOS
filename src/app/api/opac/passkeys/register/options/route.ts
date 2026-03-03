import { NextRequest } from "next/server";
import { z } from "zod";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import {
  callOpenSRF,
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  successResponse,
} from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { createPasskeyChallenge, listPatronPasskeys } from "@/lib/db/opac-passkeys";
import { encryptPasskeyPinDigest } from "@/lib/passkey-secret";
import {
  getPasskeyRpConfig,
  isPasskeyFeatureEnabled,
  normalizeAuthIdentifier,
  validatePatronPin,
} from "@/lib/passkeys";
import { passwordDigest } from "@/lib/password";

const requestSchema = z.object({
  currentPin: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 12,
    windowMs: 15 * 60 * 1000,
    endpoint: "opac-passkey-register-options",
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
    const { patronToken, patronId, user } = await requirePatronSession();
    const parsed = await parseJsonBodyWithSchema(req, requestSchema);
    if (parsed instanceof Response) return parsed;

    const patronResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.fleshed.retrieve",
      [patronToken, patronId, ["card"]]
    );
    const patron = patronResponse?.payload?.[0];
    const authIdentifier = normalizeAuthIdentifier(
      String(patron?.card?.barcode || user?.barcode || user?.usrname || "")
    );

    if (!authIdentifier) {
      return errorResponse("Unable to resolve patron barcode for passkey registration", 400);
    }

    const pinValid = await validatePatronPin(authIdentifier, parsed.currentPin);
    if (!pinValid) {
      return errorResponse("Current PIN is incorrect", 401);
    }

    const { rpID, rpName, origin } = getPasskeyRpConfig(req);
    const existing = await listPatronPasskeys(patronId);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: authIdentifier,
      userDisplayName:
        `${String(user?.first_given_name || "").trim()} ${String(user?.family_name || "").trim()}`.trim() ||
        authIdentifier,
      userID: new TextEncoder().encode(String(patronId)),
      timeout: 60_000,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      excludeCredentials: existing.map((row) => ({
        id: row.credentialId,
      })),
    });

    await createPasskeyChallenge({
      purpose: "registration",
      challenge: options.challenge,
      patronId,
      rpId: rpID,
      origin,
      authIdentifier,
      pinDigestEncrypted: encryptPasskeyPinDigest(passwordDigest(parsed.currentPin)),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    return successResponse({ options });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Not authenticated", 401);
    }
    return errorResponse("Unable to prepare passkey registration", 500);
  }
}
