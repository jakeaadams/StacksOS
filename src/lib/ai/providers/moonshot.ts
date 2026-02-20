import type { AiCompletion, AiConfig } from "../types";
import type { AiProvider, AiJsonRequest } from "./provider";
import { validateProviderJson } from "./provider";

/**
 * Moonshot AI (Kimi) provider — hosted via NVIDIA NIM (OpenAI-compatible).
 *
 * Env vars:
 *   MOONSHOT_API_KEY          — NVIDIA / Moonshot Bearer token
 *   MOONSHOT_API_BASE_URL     — defaults to https://integrate.api.nvidia.com/v1
 */

function resolveMoonshotKey(): string | null {
  const key = process.env.MOONSHOT_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function resolveBaseUrl(): string {
  return (process.env.MOONSHOT_API_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(
    /\/+$/,
    ""
  );
}

async function moonshotChatCompletion(args: {
  requestId?: string;
  config: AiConfig;
  system: string;
  user: string;
}): Promise<AiCompletion> {
  const key = resolveMoonshotKey();
  if (!key) {
    throw new Error("Moonshot/Kimi is not configured (missing MOONSHOT_API_KEY)");
  }

  const model = args.config.model || "moonshotai/kimi-k2.5";
  const url = `${resolveBaseUrl()}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.config.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: args.config.temperature,
        max_tokens: args.config.maxTokens,
        top_p: 1.0,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
      signal: controller.signal,
    });

    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.error?.message || json?.detail || `Moonshot/NVIDIA HTTP ${res.status}`;
      throw new Error(msg);
    }

    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Moonshot/Kimi returned an empty completion");
    }

    return {
      provider: "moonshot",
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
  } finally {
    clearTimeout(timer);
  }
}

export const moonshotProvider: AiProvider = {
  id: "moonshot",
  async completeJson<T>(req: AiJsonRequest<T>) {
    const completion = await moonshotChatCompletion({
      requestId: req.requestId,
      config: req.config,
      system: req.system,
      user: req.user,
    });
    const data = await validateProviderJson(completion, req.schema);
    return { data, completion };
  },
};
