import { z } from "zod";

const TenantIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Invalid tenantId format");

const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected hex color like #112233");

export const TenantAiConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: z.enum(["openai", "anthropic"]).optional(),
    model: z.string().min(1).optional(),
    maxTokens: z.number().int().min(128).max(8192).default(1024),
    temperature: z.number().min(0).max(2).default(0.2),
    safetyMode: z.enum(["strict", "balanced"]).default("balanced"),
    budgets: z
      .object({
        maxCallsPerHour: z.number().int().min(1).max(100000).default(2000),
        maxUsdPerDay: z.number().min(0).max(10000).default(0),
      })
      .default({ maxCallsPerHour: 2000, maxUsdPerDay: 0 }),
  })
  .strict();

export const TenantSecurityConfigSchema = z
  .object({
    ipAllowlist: z.array(z.string().min(1)).default([]),
    idleTimeoutMinutes: z.number().int().min(1).max(8 * 60).default(30),
    mfa: z
      .object({
        required: z.boolean().default(false),
        issuer: z.string().min(1).default("StacksOS"),
      })
      .default({ required: false, issuer: "StacksOS" }),
  })
  .strict();

export const TenantBrandingSchema = z
  .object({
    primaryColor: HexColorSchema.optional(),
    logoUrl: z.string().url().optional(),
  })
  .strict();

export const TenantConfigSchema = z
  .object({
    tenantId: TenantIdSchema,
    displayName: z.string().min(1),
    region: z.string().min(1).optional(),
    evergreenBaseUrl: z.string().url(),
    branding: TenantBrandingSchema.default({}),
    featureFlags: z.record(z.string(), z.boolean()).default({}),
    security: TenantSecurityConfigSchema.default(() => ({
      ipAllowlist: [],
      idleTimeoutMinutes: 30,
      mfa: { required: false, issuer: "StacksOS" },
    })),
    ai: TenantAiConfigSchema.default(() => ({
      enabled: false,
      maxTokens: 1024,
      temperature: 0.2,
      safetyMode: "balanced" as const,
      budgets: { maxCallsPerHour: 2000, maxUsdPerDay: 0 },
    })),
    integrations: z
      .object({
        emailProvider: z.enum(["smtp", "resend", "sendgrid", "ses", "console"]).optional(),
        smsProvider: z.enum(["webhook", "console"]).optional(),
      })
      .default({}),
  })
  .strict();

export type TenantConfig = z.infer<typeof TenantConfigSchema>;
