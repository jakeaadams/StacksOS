import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, parseJsonBodyWithSchema, successResponse } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { isPasskeyFeatureEnabled } from "@/lib/passkeys";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { listPatronPasskeys, revokePatronPasskey } from "@/lib/db/opac-passkeys";
import { logAuditEvent } from "@/lib/audit";

const revokeSchema = z.object({
  passkeyId: z.number().int().positive(),
});

export async function GET(_req: NextRequest) {
  if (!isPasskeyFeatureEnabled()) {
    return successResponse({ enabled: false, passkeys: [] as Array<unknown> });
  }

  try {
    const { patronId } = await requirePatronSession();
    const passkeys = await listPatronPasskeys(patronId);
    return successResponse({ enabled: true, passkeys });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Not authenticated", 401);
    }
    return errorResponse("Unable to fetch passkeys", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 15 * 60 * 1000,
    endpoint: "opac-passkey-revoke",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  if (!isPasskeyFeatureEnabled()) {
    return errorResponse("Passkeys are not enabled for this library", 503);
  }

  try {
    const { patronId } = await requirePatronSession();
    const parsed = await parseJsonBodyWithSchema(req, revokeSchema);
    if (parsed instanceof Response) return parsed;

    const revoked = await revokePatronPasskey({ passkeyId: parsed.passkeyId, patronId });
    if (!revoked) {
      return errorResponse("Passkey not found", 404);
    }

    await logAuditEvent({
      action: "opac.passkey.revoke",
      entity: "passkey",
      entityId: parsed.passkeyId,
      status: "success",
      actor: { id: patronId },
      ip,
      details: { patronId },
    }).catch(() => {});

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Not authenticated", 401);
    }
    return errorResponse("Unable to revoke passkey", 500);
  }
}
