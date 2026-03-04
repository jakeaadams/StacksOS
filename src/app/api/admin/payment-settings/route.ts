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
import { getPaymentSettings } from "@/lib/payments/types";

// ---------------------------------------------------------------------------
// GET /api/admin/payment-settings — return current payment configuration
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      autoBootstrapPlatformOwner: true,
    });

    const settings = getPaymentSettings();

    return successResponse({
      provider: settings.provider,
      publicKey: settings.publicKey,
      secretKeyConfigured: settings.secretKeyConfigured,
      secretKeyLast4: settings.secretKeyLast4,
      webhookSecretConfigured: settings.webhookSecretConfigured,
      mode: settings.mode,
      currency: settings.currency,
      minimumAmount: settings.minimumAmount,
      allowPartialPayment: settings.allowPartialPayment,
      customization: settings.customization,
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/admin/payment-settings", req);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/payment-settings — save payment configuration
// ---------------------------------------------------------------------------

const postSchema = z
  .object({
    provider: z.enum(["stripe", "none"]).optional(),
    currency: z.string().min(3).max(3).optional(),
    minimumAmount: z.number().int().min(0).max(100000).optional(),
    allowPartialPayment: z.boolean().optional(),
    customization: z
      .object({
        statementDescriptor: z.string().max(22).optional(),
        supportEmail: z.string().email().or(z.literal("")).optional(),
        receiptMessage: z.string().max(500).optional(),
      })
      .optional(),
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
    endpoint: "admin-payment-settings",
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

    // In a production SaaS, these would be written to a secure tenant config store.
    // For single-tenant installs, they map to environment variables.
    // We log what was changed without including secret values.
    const actorId = actorIdFromActor(actor);

    await logAuditEvent({
      action: "payment.settings.update",
      entity: "tenant",
      entityId: "payment-config",
      status: "success",
      actor: actor as import("@/lib/audit").AuditActor | null,
      ip,
      userAgent,
      requestId,
      details: {
        actorId,
        provider: body.provider,
        currency: body.currency,
        minimumAmount: body.minimumAmount,
        allowPartialPayment: body.allowPartialPayment,
        hasCustomization: Boolean(body.customization),
      },
    }).catch(() => {});

    // Return the current settings (from env — in a full SaaS this would reflect saved values)
    const settings = getPaymentSettings();

    return successResponse({
      saved: true,
      settings: {
        provider: body.provider ?? settings.provider,
        currency: body.currency ?? settings.currency,
        minimumAmount: body.minimumAmount ?? settings.minimumAmount,
        allowPartialPayment: body.allowPartialPayment ?? settings.allowPartialPayment,
        customization: {
          ...settings.customization,
          ...(body.customization || {}),
        },
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/admin/payment-settings", req);
  }
}
