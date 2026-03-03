import { TenantConfigSchema, type TenantConfig } from "@/lib/tenant/schema";
import { logger } from "@/lib/logger";
import { applyTenantProfileDefaults } from "@/lib/tenant/profiles";
import { loadTenantConfigFromDisk } from "@/lib/tenant/store";

let cached: TenantConfig | null = null;
let cachedTenantId: string | null = null;

function parseCsvList(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function getTenantId(): string {
  const raw = process.env.STACKSOS_TENANT_ID;
  return raw && raw.trim() ? raw.trim() : "default";
}

function buildEnvTenantFallback(tenantId: string): TenantConfig {
  const evergreenBaseUrl = process.env.EVERGREEN_BASE_URL || "http://127.0.0.1";
  const profileTypeRaw = String(process.env.STACKSOS_TENANT_PROFILE || "public")
    .trim()
    .toLowerCase();
  const profileType = ["public", "school", "church", "academic", "custom"].includes(profileTypeRaw)
    ? profileTypeRaw
    : "public";

  const discoveryScopeRaw = String(process.env.STACKSOS_DISCOVERY_SCOPE || "")
    .trim()
    .toLowerCase();
  const discoveryScope: "local" | "system" | "consortium" | undefined =
    discoveryScopeRaw === "local" ||
    discoveryScopeRaw === "system" ||
    discoveryScopeRaw === "consortium"
      ? discoveryScopeRaw
      : undefined;
  const discoveryDepthRaw = Number.parseInt(
    String(process.env.STACKSOS_DISCOVERY_COPY_DEPTH || ""),
    10
  );
  const discoveryDepth = Number.isFinite(discoveryDepthRaw)
    ? Math.min(99, Math.max(0, discoveryDepthRaw))
    : undefined;
  const allowPatronScopeOverrideRaw = String(
    process.env.STACKSOS_DISCOVERY_ALLOW_SCOPE_OVERRIDE || ""
  )
    .trim()
    .toLowerCase();
  const allowPatronScopeOverride =
    allowPatronScopeOverrideRaw === "1" ||
    allowPatronScopeOverrideRaw === "true" ||
    allowPatronScopeOverrideRaw === "yes"
      ? true
      : allowPatronScopeOverrideRaw === "0" ||
          allowPatronScopeOverrideRaw === "false" ||
          allowPatronScopeOverrideRaw === "no"
        ? false
        : undefined;
  const opacStyleRaw = String(process.env.STACKSOS_OPAC_STYLE_VARIANT || "")
    .trim()
    .toLowerCase();
  const opacStyleVariant: "classic" | "vibrant" | "clean" | undefined =
    opacStyleRaw === "classic" || opacStyleRaw === "vibrant" || opacStyleRaw === "clean"
      ? opacStyleRaw
      : undefined;

  return TenantConfigSchema.parse({
    tenantId,
    displayName: process.env.STACKSOS_TENANT_DISPLAY_NAME || "StacksOS Tenant",
    profile: {
      type: profileType,
      notes: process.env.STACKSOS_TENANT_PROFILE_NOTES || undefined,
    },
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
      provider:
        process.env.STACKSOS_AI_PROVIDER &&
        ["openai", "anthropic", "grok", "moonshot"].includes(process.env.STACKSOS_AI_PROVIDER)
          ? (process.env.STACKSOS_AI_PROVIDER as "openai" | "anthropic" | "grok" | "moonshot")
          : undefined,
      model: process.env.STACKSOS_AI_MODEL || undefined,
      fallbackModels: parseCsvList(process.env.STACKSOS_AI_MODEL_FALLBACKS),
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
    discovery: {
      defaultSearchScope: discoveryScope,
      defaultCopyDepth: discoveryDepth,
      allowPatronScopeOverride,
    },
    opac: {
      heroTitle: process.env.STACKSOS_OPAC_HERO_TITLE || undefined,
      heroSubtitle: process.env.STACKSOS_OPAC_HERO_SUBTITLE || undefined,
      searchPlaceholder: process.env.STACKSOS_OPAC_SEARCH_PLACEHOLDER || undefined,
      styleVariant: opacStyleVariant,
    },
    integrations: {
      emailProvider: (process.env.STACKSOS_EMAIL_PROVIDER as unknown) || undefined,
      smsProvider: (process.env.STACKSOS_SMS_PROVIDER as unknown) || undefined,
    },
  });
}

export function clearTenantConfigCache(): void {
  cached = null;
  cachedTenantId = null;
}

export function getTenantConfig(): TenantConfig {
  const tenantId = getTenantId();
  if (cached && cachedTenantId === tenantId) return cached;

  try {
    const fromDisk = loadTenantConfigFromDisk(tenantId);
    if (fromDisk) {
      cached = applyTenantProfileDefaults(fromDisk);
      cachedTenantId = tenantId;
      return cached;
    }
  } catch (error) {
    logger.error({ tenantId, err: String(error) }, "Failed to load tenant config from disk");
  }

  cached = applyTenantProfileDefaults(buildEnvTenantFallback(tenantId));
  cachedTenantId = tenantId;
  return cached;
}
