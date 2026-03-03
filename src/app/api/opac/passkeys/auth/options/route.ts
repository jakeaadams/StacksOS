import { NextRequest } from "next/server";
import { z } from "zod";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { errorResponse, getRequestMeta, parseJsonBodyWithSchema, successResponse } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { createPasskeyChallenge, listActivePasskeysByAuthIdentifier } from "@/lib/db/opac-passkeys";
import {
  getPasskeyRpConfig,
  isPasskeyFeatureEnabled,
  normalizeAuthIdentifier,
} from "@/lib/passkeys";

const optionsSchema = z.object({
  barcode: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 15 * 60 * 1000,
    endpoint: "opac-passkey-auth-options",
  });
  if (!rate.allowed) {
    return errorResponse("Too many attempts. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  if (!isPasskeyFeatureEnabled()) {
    return errorResponse("Passkeys are not enabled for this library", 503);
  }

  const parsed = await parseJsonBodyWithSchema(req, optionsSchema);
  if (parsed instanceof Response) return parsed;

  const authIdentifier = normalizeAuthIdentifier(parsed.barcode);
  if (!authIdentifier) {
    return errorResponse("Library card number is required", 400);
  }

  const passkeys = await listActivePasskeysByAuthIdentifier(authIdentifier);
  if (passkeys.length === 0) {
    return errorResponse("No passkeys are enrolled for this library card", 404);
  }

  const { rpID, origin } = getPasskeyRpConfig(req);
  const options = await generateAuthenticationOptions({
    rpID,
    timeout: 60_000,
    userVerification: "preferred",
    allowCredentials: passkeys.map((row) => ({
      id: row.credentialId,
    })),
  });

  await createPasskeyChallenge({
    purpose: "authentication",
    challenge: options.challenge,
    patronId: passkeys[0]?.patronId,
    rpId: rpID,
    origin,
    authIdentifier,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  return successResponse({ options });
}
