/**
 * Environment Variable Validation
 *
 * Validates required and optional environment variables at startup using Zod.
 * Throws on missing required vars; logs warnings for missing optional vars.
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { getTenantId } from "@/lib/tenant/config";
import { loadTenantConfigFromDisk } from "@/lib/tenant/store";

function envEnabled(value: string | undefined): boolean {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const envSchema = z.object({
  // Core Evergreen connection (base URL may come from tenant file)
  EVERGREEN_BASE_URL: z.string().url("EVERGREEN_BASE_URL must be a valid URL").optional(),
  EVERGREEN_DB_HOST: z.string().min(1, "EVERGREEN_DB_HOST is required"),
  EVERGREEN_DB_USER: z.string().min(1, "EVERGREEN_DB_USER is required"),
  EVERGREEN_DB_PASSWORD: z.string().min(1, "EVERGREEN_DB_PASSWORD is required"),

  // Optional
  EVERGREEN_DB_PORT: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return 5432;
      const parsed = parseInt(val, 10);
      return Number.isFinite(parsed) ? parsed : 5432;
    }),
  STACKSOS_BASE_URL: z.string().url().optional(),
  STACKSOS_SYNC_PATRON_PHOTO_TO_EVERGREEN: z.string().optional(),

  // AI configuration
  STACKSOS_AI_ENABLED: z.string().optional(),
  STACKSOS_AI_PROVIDER: z.enum(["openai", "anthropic", "moonshot", "mock"]).optional(),
  STACKSOS_AI_MODEL_FALLBACKS: z.string().optional(),
  STACKSOS_AI_RETRY_ATTEMPTS: z.string().optional(),
  STACKSOS_AI_RETRY_BACKOFF_MS: z.string().optional(),
  STACKSOS_AI_RETRY_TIMEOUT_MS: z.string().optional(),
  STACKSOS_AI_COPILOT_TIMEOUT_MS: z.string().optional(),
  STACKSOS_AI_COPILOT_RETRY_ATTEMPTS: z.string().optional(),
  STACKSOS_AI_COPILOT_RETRY_TIMEOUT_MS: z.string().optional(),
  STACKSOS_AI_FALLBACK_MODEL_ATTEMPTS: z.string().optional(),

  // Security
  STACKSOS_COOKIE_SECURE: z.string().optional(),
  STACKSOS_RBAC_MODE: z.enum(["strict", "warn", "off"]).optional().default("strict"),
  STACKSOS_SAAS_PLATFORM_ADMINS: z.string().optional(),
  STACKSOS_CSP_STRICT_SCRIPTS: z.string().optional(),

  // Email
  STACKSOS_EMAIL_PROVIDER: z.string().optional(),

  // Base URL
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),

  // Redis
  STACKSOS_REDIS_URL: z.string().optional(),

  // Tenant / profile
  STACKSOS_TENANT_ID: z.string().optional(),
  STACKSOS_TENANT_DISPLAY_NAME: z.string().optional(),
  STACKSOS_TENANT_PROFILE: z.enum(["public", "school", "church", "academic", "custom"]).optional(),
  NEXT_PUBLIC_STACKSOS_TENANT_PROFILE: z
    .enum(["public", "school", "church", "academic", "custom"])
    .optional(),
  STACKSOS_DISCOVERY_SCOPE: z.enum(["local", "system", "consortium"]).optional(),
  STACKSOS_DISCOVERY_COPY_DEPTH: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return undefined;
      const parsed = parseInt(val, 10);
      if (!Number.isFinite(parsed)) return undefined;
      return Math.max(0, Math.min(99, parsed));
    }),
  STACKSOS_DISCOVERY_ALLOW_SCOPE_OVERRIDE: z.string().optional(),

  // Sandbox-only behavior flags
  STACKSOS_ALLOW_DEMO_DATA: z.string().optional(),
  STACKSOS_ALLOW_MOCK_EVENTS: z.string().optional(),
});

/**
 * Validate critical environment variables.
 *
 * - Throws for missing / invalid required variables.
 * - Logs warnings for missing optional variables.
 */
export function validateEnv(): z.infer<typeof envSchema> {
  const optionalKeys: string[] = [
    "EVERGREEN_BASE_URL",
    "EVERGREEN_DB_PORT",
    "STACKSOS_BASE_URL",
    "STACKSOS_SYNC_PATRON_PHOTO_TO_EVERGREEN",
    "STACKSOS_AI_ENABLED",
    "STACKSOS_AI_PROVIDER",
    "STACKSOS_AI_MODEL_FALLBACKS",
    "STACKSOS_AI_RETRY_ATTEMPTS",
    "STACKSOS_AI_RETRY_BACKOFF_MS",
    "STACKSOS_AI_RETRY_TIMEOUT_MS",
    "STACKSOS_AI_COPILOT_TIMEOUT_MS",
    "STACKSOS_AI_COPILOT_RETRY_ATTEMPTS",
    "STACKSOS_AI_COPILOT_RETRY_TIMEOUT_MS",
    "STACKSOS_AI_FALLBACK_MODEL_ATTEMPTS",
    "STACKSOS_COOKIE_SECURE",
    "STACKSOS_RBAC_MODE",
    "STACKSOS_SAAS_PLATFORM_ADMINS",
    "STACKSOS_CSP_STRICT_SCRIPTS",
    "STACKSOS_EMAIL_PROVIDER",
    "NEXT_PUBLIC_BASE_URL",
    "STACKSOS_REDIS_URL",
    "STACKSOS_TENANT_ID",
    "STACKSOS_TENANT_DISPLAY_NAME",
    "STACKSOS_TENANT_PROFILE",
    "NEXT_PUBLIC_STACKSOS_TENANT_PROFILE",
    "STACKSOS_DISCOVERY_SCOPE",
    "STACKSOS_DISCOVERY_COPY_DEPTH",
    "STACKSOS_DISCOVERY_ALLOW_SCOPE_OVERRIDE",
    "STACKSOS_ALLOW_DEMO_DATA",
    "STACKSOS_ALLOW_MOCK_EVENTS",
  ];

  // Warn about missing optional vars before Zod parse (which would throw for required ones).
  for (const key of optionalKeys) {
    if (!process.env[key]) {
      logger.warn(
        { component: "env-validation", envKey: key },
        `[env-validation] Optional env var ${key} is not set; using default or skipping.`
      );
    }
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const messages = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`
    );
    const errorMsg = ["Missing or invalid required environment variables:", ...messages].join("\n");

    logger.error(
      { component: "env-validation", error: errorMsg },
      "[env-validation] validation failed"
    );
    throw new Error(errorMsg);
  }

  if (process.env.NODE_ENV === "production") {
    if (result.data.STACKSOS_AI_PROVIDER === "mock") {
      const errorMsg = "STACKSOS_AI_PROVIDER=mock is not allowed in production.";
      logger.error(
        { component: "env-validation", envKey: "STACKSOS_AI_PROVIDER" },
        `[env-validation] ${errorMsg}`
      );
      throw new Error(errorMsg);
    }

    if (
      envEnabled(result.data.STACKSOS_ALLOW_DEMO_DATA) ||
      envEnabled(result.data.STACKSOS_ALLOW_MOCK_EVENTS)
    ) {
      logger.warn(
        {
          component: "env-validation",
          envKey: "STACKSOS_ALLOW_DEMO_DATA/STACKSOS_ALLOW_MOCK_EVENTS",
        },
        "[env-validation] Demo/mock env flags are ignored in production runtime."
      );
    }
  }

  const tenantId = getTenantId();
  const tenantFromDisk = loadTenantConfigFromDisk(tenantId);
  if (!result.data.EVERGREEN_BASE_URL && !tenantFromDisk) {
    const errorMsg = `Evergreen base URL is not configured. Set EVERGREEN_BASE_URL or create tenants/${tenantId}.json with evergreenBaseUrl.`;
    logger.error(
      { component: "env-validation", tenantId },
      "[env-validation] missing Evergreen base URL"
    );
    throw new Error(errorMsg);
  }

  logger.info(
    { component: "env-validation" },
    "[env-validation] All required environment variables are present and valid."
  );
  return result.data;
}
