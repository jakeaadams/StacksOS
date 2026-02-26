import { aiConfigSchema, type AiConfig, aiProviderSchema } from "./types";
import { getTenantConfig } from "@/lib/tenant/config";

function envBool(value: string | undefined) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function parseModelList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry || "").trim()).filter((entry) => entry.length > 0);
  }
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function isAiFeatureFlagEnabled(): boolean {
  // Keep AI features behind the existing experimental gate by default.
  return process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL === "1";
}

export function loadAiConfig(): AiConfig {
  let tenantAi: any = null;
  try {
    tenantAi = getTenantConfig().ai || null;
  } catch {
    tenantAi = null;
  }

  const enabled =
    isAiFeatureFlagEnabled() &&
    (Boolean(tenantAi?.enabled) || envBool(process.env.STACKSOS_AI_ENABLED));

  const providerRaw = tenantAi?.provider || process.env.STACKSOS_AI_PROVIDER;
  const provider = providerRaw ? aiProviderSchema.safeParse(String(providerRaw)).data : undefined;
  const tenantFallbackModels = parseModelList(tenantAi?.fallbackModels);
  const envFallbackModels = parseModelList(process.env.STACKSOS_AI_MODEL_FALLBACKS);
  const fallbackModels = tenantFallbackModels.length > 0 ? tenantFallbackModels : envFallbackModels;

  const cfg = {
    enabled,
    provider,
    model: tenantAi?.model || process.env.STACKSOS_AI_MODEL || undefined,
    fallbackModels,
    maxTokens:
      tenantAi?.maxTokens ??
      (process.env.STACKSOS_AI_MAX_TOKENS ? Number(process.env.STACKSOS_AI_MAX_TOKENS) : undefined),
    temperature:
      tenantAi?.temperature ??
      (process.env.STACKSOS_AI_TEMPERATURE
        ? Number(process.env.STACKSOS_AI_TEMPERATURE)
        : undefined),
    safetyMode:
      tenantAi?.safetyMode || (process.env.STACKSOS_AI_SAFETY_MODE as unknown) || undefined,
    timeoutMs: process.env.STACKSOS_AI_TIMEOUT_MS
      ? Number(process.env.STACKSOS_AI_TIMEOUT_MS)
      : undefined,
    budgets: tenantAi?.budgets || undefined,
  };

  return aiConfigSchema.parse(cfg);
}
