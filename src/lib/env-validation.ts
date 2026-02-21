/**
 * Environment Variable Validation
 *
 * Validates required and optional environment variables at startup using Zod.
 * Throws on missing required vars; logs warnings for missing optional vars.
 */

import { z } from "zod";

const envSchema = z.object({
  // Required
  EVERGREEN_BASE_URL: z.string().url("EVERGREEN_BASE_URL must be a valid URL"),
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

  // AI Configuration
  STACKSOS_AI_ENABLED: z.string().optional(),
  STACKSOS_AI_PROVIDER: z.enum(["openai", "anthropic", "moonshot", "mock"]).optional(),

  // Security
  STACKSOS_COOKIE_SECURE: z.string().optional(),
  STACKSOS_RBAC_MODE: z.enum(["strict", "warn", "off"]).optional().default("strict"),
  STACKSOS_CSP_STRICT_SCRIPTS: z.string().optional(),

  // Email
  STACKSOS_EMAIL_PROVIDER: z.string().optional(),

  // Base URL
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),

  // Redis
  STACKSOS_REDIS_URL: z.string().optional(),
});

/**
 * Validate critical environment variables.
 *
 * - Throws for missing / invalid required variables.
 * - Logs warnings for missing optional variables.
 */
export function validateEnv(): z.infer<typeof envSchema> {
  const optionalKeys: string[] = [
    "EVERGREEN_DB_PORT",
    "STACKSOS_BASE_URL",
    "STACKSOS_AI_ENABLED",
    "STACKSOS_AI_PROVIDER",
    "STACKSOS_COOKIE_SECURE",
    "STACKSOS_RBAC_MODE",
    "STACKSOS_CSP_STRICT_SCRIPTS",
    "STACKSOS_EMAIL_PROVIDER",
    "NEXT_PUBLIC_BASE_URL",
    "STACKSOS_REDIS_URL",
  ];

  // Warn about missing optional vars before Zod parse (which would throw for required ones).
  for (const key of optionalKeys) {
    if (!process.env[key]) {
      console.warn(
        `[env-validation] Optional env var ${key} is not set – using default or skipping.`
      );
    }
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const messages = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`
    );
    const errorMsg = [
      "Missing or invalid required environment variables:",
      ...messages,
    ].join("\n");

    console.error(`[env-validation] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  console.log("[env-validation] All required environment variables are present and valid.");
  return result.data;
}
