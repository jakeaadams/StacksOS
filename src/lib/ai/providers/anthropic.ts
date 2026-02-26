import type { AiCompletion, AiConfig } from "../types";
import type { AiProvider, AiJsonRequest } from "./provider";
import { validateProviderJson } from "./provider";

function resolveAnthropicKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function resolveBaseUrl(): string {
  return (process.env.ANTHROPIC_API_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
}

async function anthropicMessages(args: {
  config: AiConfig;
  system: string;
  user: string;
}): Promise<AiCompletion> {
  const key = resolveAnthropicKey();
  if (!key) {
    throw new Error("Anthropic is not configured (missing ANTHROPIC_API_KEY)");
  }

  const model = args.config.model || "claude-sonnet-4-6";
  const url = `${resolveBaseUrl()}/v1/messages`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.config.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: args.config.maxTokens,
        temperature: args.config.temperature,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
      signal: controller.signal,
    });

    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.error?.message || `Anthropic HTTP ${res.status}`;
      throw new Error(msg);
    }

    const text = Array.isArray(json?.content)
      ? json.content.map((c: any) => c?.text || "").join("")
      : "";
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Anthropic returned an empty completion");
    }

    return {
      provider: "anthropic",
      model,
      requestId: json?.id,
      text,
      usage: json?.usage
        ? {
            inputTokens: json.usage.input_tokens,
            outputTokens: json.usage.output_tokens,
            totalTokens: json.usage.input_tokens + json.usage.output_tokens,
          }
        : undefined,
      raw: json,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`AI provider timeout after ${args.config.timeoutMs}ms (anthropic)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const anthropicProvider: AiProvider = {
  id: "anthropic",
  async completeJson<T>(req: AiJsonRequest<T>) {
    const completion = await anthropicMessages({
      config: req.config,
      system: req.system,
      user: req.user,
    });
    const data = await validateProviderJson(completion, req.schema);
    return { data, completion };
  },
};
