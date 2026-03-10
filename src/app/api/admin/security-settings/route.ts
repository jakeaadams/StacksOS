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
import { logger } from "@/lib/logger";
import { requireSaaSAccess } from "@/lib/saas-rbac";
import { getMfaIssuer, isMfaConfigured } from "@/lib/mfa";
import { clearTenantConfigCache, getTenantConfig, getTenantId } from "@/lib/tenant/config";
import { applyTenantProfileDefaults } from "@/lib/tenant/profiles";
import { TenantConfigSchema } from "@/lib/tenant/schema";
import { loadTenantConfigFromDisk, saveTenantConfigToDisk } from "@/lib/tenant/store";

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

    const tenant = getTenantConfig();

    return successResponse({
      mfa: {
        secretConfigured: isMfaConfigured(),
        enabled: tenant.security?.mfa?.enabled ?? false,
        required: tenant.security?.mfa?.required ?? false,
        issuer: getMfaIssuer(),
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

    const tenantId = getTenantId();
    const actorId = actorIdFromActor(actor);
    const existing = loadTenantConfigFromDisk(tenantId) || getTenantConfig();
    const currentMfa = existing.security?.mfa || {
      enabled: false,
      required: false,
      issuer: getMfaIssuer(),
    };
    const nextEnabled = body.mfaEnabled ?? currentMfa.enabled;
    const nextRequired = nextEnabled ? (body.mfaRequired ?? currentMfa.required) : false;
    const updated = applyTenantProfileDefaults(
      TenantConfigSchema.parse({
        ...existing,
        security: {
          ...(existing.security || {}),
          mfa: {
            ...currentMfa,
            enabled: nextEnabled,
            required: nextRequired,
          },
        },
      })
    );
    saveTenantConfigToDisk(updated);
    clearTenantConfigCache();

    await logAuditEvent({
      action: "security.settings.update",
      entity: "tenant",
      entityId: tenantId,
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
    }).catch((err) => {
      logger.warn({ error: String(err) }, "Failed to write security settings audit log");
    });

    return successResponse({
      saved: true,
      settings: {
        mfa: {
          secretConfigured: isMfaConfigured(),
          enabled: updated.security.mfa.enabled,
          required: updated.security.mfa.required,
          issuer: updated.security.mfa.issuer,
        },
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/admin/security-settings", req);
  }
}
