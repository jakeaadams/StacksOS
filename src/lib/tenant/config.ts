import fs from "node:fs";
import path from "node:path";
import { TenantConfigSchema, type TenantConfig } from "@/lib/tenant/schema";
import { logger } from "@/lib/logger";

let cached: TenantConfig | null = null;

function resolveTenantId(): string {
  const raw = process.env.STACKSOS_TENANT_ID;
  return raw && raw.trim() ? raw.trim() : "default";
}

function resolveTenantConfigPath(tenantId: string): string {
  const repoRoot = process.cwd();
  return path.join(repoRoot, "tenants", `${tenantId}.json`);
}

function buildEnvTenantFallback(tenantId: string): TenantConfig {
  const evergreenBaseUrl = process.env.EVERGREEN_BASE_URL || "http://127.0.0.1";
  return TenantConfigSchema.parse({
    tenantId,
    displayName: process.env.STACKSOS_TENANT_DISPLAY_NAME || "StacksOS Tenant",
    region: process.env.STACKSOS_TENANT_REGION || undefined,
    evergreenBaseUrl,
    branding: {
      primaryColor: process.env.STACKSOS_BRANDING_PRIMARY_COLOR || undefined,
      logoUrl: process.env.STACKSOS_BRANDING_LOGO_URL || undefined,
    },
    security: {
      ipAllowlist: (process.env.STACKSOS_IP_ALLOWLIST || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      idleTimeoutMinutes: Number.isFinite(Number(process.env.STACKSOS_IDLE_TIMEOUT_MINUTES))
        ? Number(process.env.STACKSOS_IDLE_TIMEOUT_MINUTES)
        : undefined,
      mfa: {
        required: process.env.STACKSOS_MFA_REQUIRED === "true",
        issuer: process.env.STACKSOS_MFA_ISSUER || undefined,
      },
    },
    ai: {
      enabled: process.env.STACKSOS_AI_ENABLED === "1",
      provider: (process.env.STACKSOS_AI_PROVIDER as unknown) || undefined,
      model: process.env.STACKSOS_AI_MODEL || undefined,
      maxTokens: Number.isFinite(Number(process.env.STACKSOS_AI_MAX_TOKENS))
        ? Number(process.env.STACKSOS_AI_MAX_TOKENS)
        : undefined,
      temperature: Number.isFinite(Number(process.env.STACKSOS_AI_TEMPERATURE))
        ? Number(process.env.STACKSOS_AI_TEMPERATURE)
        : undefined,
      safetyMode: (process.env.STACKSOS_AI_SAFETY_MODE as unknown) || undefined,
      budgets: {
        maxCallsPerHour: Number.isFinite(Number(process.env.STACKSOS_AI_BUDGET_CALLS_PER_HOUR))
          ? Number(process.env.STACKSOS_AI_BUDGET_CALLS_PER_HOUR)
          : undefined,
        maxUsdPerDay: Number.isFinite(Number(process.env.STACKSOS_AI_BUDGET_USD_PER_DAY))
          ? Number(process.env.STACKSOS_AI_BUDGET_USD_PER_DAY)
          : undefined,
      },
    },
    integrations: {
      emailProvider: (process.env.STACKSOS_EMAIL_PROVIDER as unknown) || undefined,
      smsProvider: (process.env.STACKSOS_SMS_PROVIDER as unknown) || undefined,
    },
  });
}

export function getTenantConfig(): TenantConfig {
  if (cached) return cached;

  const tenantId = resolveTenantId();
  const p = resolveTenantConfigPath(tenantId);
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const json = JSON.parse(raw);
      cached = TenantConfigSchema.parse(json);
      return cached;
    }
  } catch (error) {
    logger.error({ tenantId, err: String(error) }, "Failed to load tenant config from disk");
  }

  cached = buildEnvTenantFallback(tenantId);
  return cached;
}

