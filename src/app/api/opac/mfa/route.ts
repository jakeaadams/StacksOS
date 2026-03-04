import { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { isMfaEnabled } from "@/lib/mfa";
import { getActiveMfaMethods, revokeMfaMethod } from "@/lib/db/opac-mfa";

/**
 * GET /api/opac/mfa
 *
 * List active MFA methods for the current patron.
 */
export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "mfa-list",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests.", 429);
  }

  try {
    if (!isMfaEnabled()) {
      return successResponse({ methods: [], enabled: false });
    }

    const { patronId } = await requirePatronSession();
    const methods = await getActiveMfaMethods(patronId);

    return successResponse({
      enabled: true,
      methods: methods.map((m) => ({
        id: Number(m.id),
        type: m.type,
        friendlyName: m.friendly_name,
        createdAt: m.created_at,
        lastUsedAt: m.last_used_at,
      })),
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(error, "GET /api/opac/mfa", req);
  }
}

const deleteSchema = z.object({
  methodId: z.number().int().positive(),
});

/**
 * DELETE /api/opac/mfa
 *
 * Revoke an MFA method. Requires the patron to be authenticated.
 */
export async function DELETE(req: NextRequest) {
  const { ip, requestId } = getRequestMeta(req);

  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    endpoint: "mfa-revoke",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests.", 429);
  }

  try {
    if (!isMfaEnabled()) {
      return errorResponse("MFA is not configured.", 501);
    }

    const { patronId } = await requirePatronSession();

    const body = await req.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid request: methodId is required.", 400);
    }

    await revokeMfaMethod(parsed.data.methodId, patronId);

    await logAuditEvent({
      action: "opac.mfa.revoked",
      entity: "mfa_method",
      entityId: String(parsed.data.methodId),
      status: "success",
      actor: { id: patronId },
      ip,
      requestId,
    }).catch(() => {});

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(error, "DELETE /api/opac/mfa", req);
  }
}
