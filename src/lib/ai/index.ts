import { z } from "zod";
import { loadAiConfig } from "./config";
import { getProvider } from "./providers";
import { redactObject, redactText } from "./redaction";
import { promptHash } from "./prompts";
import { enforceAiBudgets, recordAiCall } from "./telemetry";

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
  const startedAt = Date.now();
  const { data, completion } = await provider.completeJson({
    requestId: args.requestId,
    config,
    schema: args.schema,
    system: args.system,
    user: args.user,
  });
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
