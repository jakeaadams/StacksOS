import type { AiCompletion, AiConfig } from "../types";
import type { AiProvider, AiJsonRequest } from "./provider";
import { validateProviderJson } from "./provider";

/**
 * xAI Grok provider — OpenAI-compatible Chat Completions API.
 *
 * Env vars:
 *   GROK_API_KEY          — xAI Bearer token
 *   GROK_API_BASE_URL     — defaults to https://api.x.ai/v1
 */

function resolveGrokKey(): string | null {
  const key = process.env.GROK_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function resolveBaseUrl(): string {
  return (process.env.GROK_API_BASE_URL || "https://api.x.ai/v1").replace(/\/+$/, "");
}

async function grokChatCompletion(args: {
  requestId?: string;
  config: AiConfig;
  system: string;
  user: string;
}): Promise<AiCompletion> {
  const key = resolveGrokKey();
  if (!key) {
    throw new Error("Grok is not configured (missing GROK_API_KEY)");
  }

  const model = args.config.model || "grok-4-1-fast-reasoning";
  const url = `${resolveBaseUrl()}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.config.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: args.config.temperature,
        max_tokens: args.config.maxTokens,
        // Ask for JSON; providers may still return non-JSON, so we validate defensively.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
      signal: controller.signal,
    });

    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.error?.message || `Grok HTTP ${res.status}`;
      throw new Error(msg);
    }

    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Grok returned an empty completion");
    }

    return {
      provider: "grok",
      model,
      requestId: json?.id,
      text,
      usage: json?.usage
        ? {
            inputTokens: json.usage.prompt_tokens,
            outputTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
      raw: json,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`AI provider timeout after ${args.config.timeoutMs}ms (grok)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const grokProvider: AiProvider = {
  id: "grok",
  async completeJson<T>(req: AiJsonRequest<T>) {
    const completion = await grokChatCompletion({
      requestId: req.requestId,
      config: req.config,
      system: req.system,
      user: req.user,
    });
    const data = await validateProviderJson(completion, req.schema);
    return { data, completion };
  },
};
