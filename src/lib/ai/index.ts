import { z } from "zod";
import { loadAiConfig } from "./config";
import { getProvider } from "./providers";
import { redactObject, redactText } from "./redaction";
import { promptHash } from "./prompts";
import { enforceAiBudgets, recordAiCall } from "./telemetry";
import type { AiCompletion, AiConfig } from "./types";
import { logger } from "@/lib/logger";

export const policyExplainResponseSchema = z.object({
  explanation: z.string().min(1),
  nextSteps: z.array(z.string().min(1)).min(1),
  suggestedNote: z.string().min(1).optional(),
  requiresConfirmation: z.boolean().default(true),
});

export type PolicyExplainResponse = z.infer<typeof policyExplainResponseSchema>;

export const catalogingSuggestResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(["subject", "summary", "series"]),
      confidence: z.number().min(0).max(1),
      message: z.string().min(1),
      suggestedValue: z.string().min(1),
      provenance: z.array(z.string().min(1)).optional(),
    })
  ),
});

export type CatalogingSuggestResponse = z.infer<typeof catalogingSuggestResponseSchema>;

type RetryProfile = {
  maxAttempts: number;
  baseDelayMs: number;
  retryTimeoutMs: number;
};

const MOONSHOT_PRIMARY_MODEL = "moonshotai/kimi-k2.5";
const MOONSHOT_FALLBACK_MODEL = "moonshotai/kimi-k2-instruct";

function isCopilotCallType(callType: string): boolean {
  return (
    callType === "ops_playbooks" ||
    callType === "staff_copilot" ||
    callType === "holds_copilot" ||
    callType === "patron_copilot" ||
    callType === "acquisitions_copilot"
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

function isTransientAiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("aborted") ||
    normalized.includes("fetch failed") ||
    normalized.includes("econnreset") ||
    normalized.includes("socket hang up") ||
    normalized.includes("network") ||
    normalized.includes("rate limit") ||
    normalized.includes("http 429") ||
    normalized.includes("http 500") ||
    normalized.includes("http 502") ||
    normalized.includes("http 503") ||
    normalized.includes("http 504")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTimeoutMs(callType: string, baseTimeoutMs: number): number {
  if (!isCopilotCallType(callType)) return baseTimeoutMs;
  return parseBoundedInt(process.env.STACKSOS_AI_COPILOT_TIMEOUT_MS, baseTimeoutMs, 1000, 60000);
}

function resolveRetryProfile(callType: string, timeoutMs: number): RetryProfile {
  const copilotLike = isCopilotCallType(callType);
  const maxAttempts = parseBoundedInt(
    copilotLike
      ? process.env.STACKSOS_AI_COPILOT_RETRY_ATTEMPTS || process.env.STACKSOS_AI_RETRY_ATTEMPTS
      : process.env.STACKSOS_AI_RETRY_ATTEMPTS,
    copilotLike ? 3 : 2,
    1,
    6
  );
  const baseDelayMs = parseBoundedInt(
    process.env.STACKSOS_AI_RETRY_BACKOFF_MS,
    copilotLike ? 500 : 400,
    100,
    5000
  );
  const overrideRetryTimeout = parseBoundedInt(
    copilotLike
      ? process.env.STACKSOS_AI_COPILOT_RETRY_TIMEOUT_MS || process.env.STACKSOS_AI_RETRY_TIMEOUT_MS
      : process.env.STACKSOS_AI_RETRY_TIMEOUT_MS,
    0,
    0,
    60000
  );
  if (overrideRetryTimeout > 0) {
    return {
      maxAttempts,
      baseDelayMs,
      retryTimeoutMs: overrideRetryTimeout,
    };
  }

  const retryTimeoutMs = copilotLike
    ? clamp(Math.round(timeoutMs * 2.35), 14000, 55000)
    : clamp(Math.round(timeoutMs * 1.5), 8000, 20000);

  return { maxAttempts, baseDelayMs, retryTimeoutMs };
}

function resolveFallbackModelAttempts(): number {
  return parseBoundedInt(process.env.STACKSOS_AI_FALLBACK_MODEL_ATTEMPTS, 1, 1, 2);
}

function normalizeModelName(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const normalized = model.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveModelPlan(config: AiConfig): Array<string | undefined> {
  const plan: Array<string | undefined> = [];
  const primaryModel =
    normalizeModelName(config.model) ||
    (config.provider === "moonshot" ? MOONSHOT_PRIMARY_MODEL : undefined);
  plan.push(primaryModel);

  for (const model of config.fallbackModels || []) {
    plan.push(normalizeModelName(model));
  }

  const primaryLower = (primaryModel || "").toLowerCase();
  if (config.provider === "moonshot" && primaryLower.includes(MOONSHOT_PRIMARY_MODEL)) {
    plan.push(MOONSHOT_FALLBACK_MODEL);
  }

  const seen = new Set<string>();
  const deduped: Array<string | undefined> = [];
  for (const model of plan) {
    const key = model || "__provider_default__";
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(model);
  }
  return deduped.length > 0 ? deduped : [undefined];
}

export async function generateAiJson<T>(args: {
  requestId?: string;
  system: string;
  user: string;
  schema: z.ZodSchema<T>;
  callType?: string;
  actorId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  promptTemplateId?: string | null;
  promptVersion?: number | null;
}) {
  const config = loadAiConfig();
  if (!config.enabled) {
    throw new Error("AI is disabled for this tenant");
  }
  if (!config.provider) {
    throw new Error("AI is misconfigured (missing provider)");
  }

  await enforceAiBudgets({ config, callType: args.callType || "unknown" });

  const provider = getProvider(config.provider);
  const callType = args.callType || "unknown";
  const timeoutMs = resolveTimeoutMs(callType, config.timeoutMs);
  const retryProfile = resolveRetryProfile(callType, timeoutMs);
  const fallbackModelAttempts = resolveFallbackModelAttempts();
  const modelPlan = resolveModelPlan(config);
  const startedAt = Date.now();
  let lastError: unknown = null;
  let attempts = 0;
  let data: T | null = null;
  let completion: AiCompletion | null = null;

  modelLoop: for (let modelIndex = 0; modelIndex < modelPlan.length; modelIndex += 1) {
    const model = modelPlan[modelIndex];
    const attemptsForModel = modelIndex === 0 ? retryProfile.maxAttempts : fallbackModelAttempts;

    for (let modelAttempt = 1; modelAttempt <= attemptsForModel; modelAttempt += 1) {
      attempts += 1;
      const attemptTimeoutMs = modelAttempt === 1 ? timeoutMs : retryProfile.retryTimeoutMs;

      try {
        const out = await provider.completeJson({
          requestId: args.requestId,
          config: {
            ...config,
            model,
            timeoutMs: attemptTimeoutMs,
          },
          schema: args.schema,
          system: args.system,
          user: args.user,
        });
        data = out.data;
        completion = out.completion;

        if (modelIndex > 0) {
          logger.warn(
            {
              component: "ai-runtime",
              requestId: args.requestId,
              callType,
              provider: completion.provider,
              model: completion.model || model || config.model || null,
              attempts,
              modelIndex,
            },
            "AI request succeeded on fallback model"
          );
        } else if (modelAttempt > 1) {
          logger.warn(
            {
              component: "ai-runtime",
              requestId: args.requestId,
              callType,
              provider: completion.provider,
              model: completion.model || model || config.model || null,
              attempts,
            },
            "AI request succeeded after retry"
          );
        }

        break modelLoop;
      } catch (error) {
        lastError = error;
        const transient = isTransientAiError(error);
        if (!transient) {
          throw error;
        }

        const hasRetryForModel = modelAttempt < attemptsForModel;
        if (hasRetryForModel) {
          const delayMs = clamp(
            Math.round(
              retryProfile.baseDelayMs * Math.pow(1.8, modelAttempt - 1) + Math.random() * 125
            ),
            100,
            8000
          );
          logger.warn(
            {
              component: "ai-runtime",
              requestId: args.requestId,
              callType,
              provider: config.provider,
              model: model || config.model || null,
              attempt: modelAttempt,
              nextDelayMs: delayMs,
              reason: error instanceof Error ? error.message : String(error),
            },
            "AI transient failure; retrying request"
          );
          await sleep(delayMs);
          continue;
        }

        const hasModelFallback = modelIndex < modelPlan.length - 1;
        if (hasModelFallback) {
          logger.warn(
            {
              component: "ai-runtime",
              requestId: args.requestId,
              callType,
              provider: config.provider,
              model: model || config.model || null,
              nextModel: modelPlan[modelIndex + 1] || null,
              reason: error instanceof Error ? error.message : String(error),
            },
            "AI transient failure; switching to fallback model"
          );
          break;
        }

        throw error;
      }
    }
  }

  if (!completion || data === null) {
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError || "AI request failed"));
  }

  const latencyMs = Date.now() - startedAt;

  // Best-effort telemetry (does not block request on failure).
  try {
    const meta = promptMetadata(args.system, args.user);
    await recordAiCall({
      callType: args.callType || "unknown",
      requestId: args.requestId,
      actorId: args.actorId || null,
      promptHash: meta.promptHash,
      promptTemplateId: args.promptTemplateId || null,
      promptVersion: args.promptVersion || null,
      completion,
      latencyMs,
      ip: args.ip || null,
      userAgent: args.userAgent || null,
    });
  } catch {
    // ignore
  }

  return { data, completion, config };
}

export function redactAiInput<T>(value: T): T {
  return redactObject(value);
}

export function safeUserText(value: string): string {
  return redactText(value).slice(0, 12000);
}

export function promptMetadata(system: string, user: string) {
  const systemHash = promptHash(system);
  const userHash = promptHash(user);
  return { systemHash, userHash, promptHash: promptHash(`${systemHash}:${userHash}`) };
}
