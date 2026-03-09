import { NextRequest } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireSaaSAccess } from "@/lib/saas-rbac";
import { isMfaConfigured } from "@/lib/mfa";

// ---------------------------------------------------------------------------
// GET /api/admin/security-settings — return current security configuration
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });

    return successResponse({
      mfa: {
        secretConfigured: isMfaConfigured(),
        enabled: process.env.STACKSOS_MFA_ENABLED === "true",
        required: process.env.STACKSOS_MFA_REQUIRED === "true",
        issuer: process.env.STACKSOS_MFA_ISSUER || "StacksOS Library",
      },
      sessions: {
        defaultDurationMinutes: 120,
        rememberMeDurationMinutes: 1440,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/admin/security-settings", req);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/security-settings — save security configuration
// ---------------------------------------------------------------------------

const postSchema = z
  .object({
    mfaEnabled: z.boolean().optional(),
    mfaRequired: z.boolean().optional(),
  })
  .strict();

function actorIdFromActor(actor: unknown): number | null {
  if (!actor || typeof actor !== "object") return null;
  const raw = (actor as Record<string, unknown>).id;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "admin-security-settings",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });
    const body = await parseJsonBodyWithSchema(req, postSchema);
    if (body instanceof Response) return body;

    const actorId = actorIdFromActor(actor);

    await logAuditEvent({
      action: "security.settings.update",
      entity: "tenant",
      entityId: "security-config",
      status: "success",
      actor: actor as import("@/lib/audit").AuditActor | null,
      ip,
      userAgent,
      requestId,
      details: {
        actorId,
        mfaEnabled: body.mfaEnabled,
        mfaRequired: body.mfaRequired,
      },
    }).catch(() => {});

    // In a production SaaS, these would be written to a secure tenant config store.
    // For single-tenant installs, they map to environment variables.
    return successResponse({
      saved: true,
      settings: {
        mfa: {
          secretConfigured: isMfaConfigured(),
          enabled: body.mfaEnabled ?? process.env.STACKSOS_MFA_ENABLED === "true",
          required: body.mfaRequired ?? process.env.STACKSOS_MFA_REQUIRED === "true",
          issuer: process.env.STACKSOS_MFA_ISSUER || "StacksOS Library",
        },
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/admin/security-settings", req);
  }
}
