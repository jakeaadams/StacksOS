import { z } from "zod";

export const aiProviderSchema = z.enum(["openai", "anthropic", "moonshot", "mock"]);
export type AiProviderId = z.infer<typeof aiProviderSchema>;

export const aiSafetyModeSchema = z.enum(["strict", "balanced", "off"]);
export type AiSafetyMode = z.infer<typeof aiSafetyModeSchema>;

export const aiConfigSchema = z.object({
  enabled: z.boolean(),
  provider: aiProviderSchema.optional(),
  model: z.string().trim().min(1).optional(),
  maxTokens: z.number().int().min(1).max(8192).default(800),
  temperature: z.number().min(0).max(2).default(0.2),
  safetyMode: aiSafetyModeSchema.default("strict"),
  timeoutMs: z.number().int().min(1000).max(60000).default(10000),
  budgets: z
    .object({
      maxCallsPerHour: z.number().int().min(1).max(100000).default(2000),
      maxUsdPerDay: z.number().min(0).max(10000).default(0),
    })
    .default({ maxCallsPerHour: 2000, maxUsdPerDay: 0 }),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AiCompletion = {
  text: string;
  usage?: AiUsage;
  model?: string;
  provider: AiProviderId;
  requestId?: string;
  raw?: unknown;
};
