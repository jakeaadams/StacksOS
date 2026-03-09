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
import { clearTenantConfigCache, getTenantConfig, getTenantId } from "@/lib/tenant/config";
import { applyTenantProfileDefaults } from "@/lib/tenant/profiles";
import { TenantConfigSchema } from "@/lib/tenant/schema";
import { loadTenantConfigFromDisk, saveTenantConfigToDisk } from "@/lib/tenant/store";

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
      squareLocationId: settings.squareLocationId,
      squareEnvironment: settings.squareEnvironment,
      paypalClientId: settings.paypalClientId,
      paypalEnvironment: settings.paypalEnvironment,
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
    provider: z.enum(["stripe", "square", "paypal", "none"]).optional(),
    currency: z.string().min(3).max(3).optional(),
    minimumAmount: z.number().int().min(0).max(100000).optional(),
    allowPartialPayment: z.boolean().optional(),
    stripe: z
      .object({
        publicKey: z.string().trim().max(256).optional(),
      })
      .optional(),
    square: z
      .object({
        locationId: z.string().trim().max(128).optional(),
        environment: z.enum(["sandbox", "production"]).optional(),
      })
      .optional(),
    paypal: z
      .object({
        clientId: z.string().trim().max(256).optional(),
        environment: z.enum(["sandbox", "live"]).optional(),
      })
      .optional(),
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

    const tenantId = getTenantId();
    const actorId = actorIdFromActor(actor);
    const existing = loadTenantConfigFromDisk(tenantId) || getTenantConfig();
    const existingPayment = existing.payment;
    const updated = applyTenantProfileDefaults(
      TenantConfigSchema.parse({
        ...existing,
        payment: {
          ...existingPayment,
          provider: body.provider ?? existingPayment?.provider,
          currency: body.currency ?? existingPayment?.currency,
          minimumAmount: body.minimumAmount ?? existingPayment?.minimumAmount,
          allowPartialPayment: body.allowPartialPayment ?? existingPayment?.allowPartialPayment,
          customization: {
            ...(existingPayment?.customization || {}),
            ...(body.customization || {}),
          },
          stripe: {
            ...(existingPayment?.stripe || {}),
            ...(body.stripe || {}),
          },
          square: {
            ...(existingPayment?.square || {}),
            ...(body.square || {}),
          },
          paypal: {
            ...(existingPayment?.paypal || {}),
            ...(body.paypal || {}),
          },
        },
        integrations: {
          ...(existing.integrations || {}),
          paymentProvider: body.provider ?? existing.integrations?.paymentProvider,
        },
      })
    );
    saveTenantConfigToDisk(updated);
    clearTenantConfigCache();

    await logAuditEvent({
      action: "payment.settings.update",
      entity: "tenant",
      entityId: tenantId,
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
        hasStripePublicKey: Boolean(body.stripe?.publicKey),
        hasSquareLocationId: Boolean(body.square?.locationId),
        squareEnvironment: body.square?.environment,
        hasPayPalClientId: Boolean(body.paypal?.clientId),
        paypalEnvironment: body.paypal?.environment,
      },
    }).catch(() => {});

    const settings = getPaymentSettings();

    return successResponse({
      saved: true,
      settings: {
        provider: settings.provider,
        publicKey: settings.publicKey,
        currency: settings.currency,
        minimumAmount: settings.minimumAmount,
        allowPartialPayment: settings.allowPartialPayment,
        customization: settings.customization,
        squareLocationId: settings.squareLocationId,
        squareEnvironment: settings.squareEnvironment,
        paypalClientId: settings.paypalClientId,
        paypalEnvironment: settings.paypalEnvironment,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/admin/payment-settings", req);
  }
}
