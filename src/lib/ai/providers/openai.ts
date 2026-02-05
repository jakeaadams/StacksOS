import type { AiCompletion, AiConfig } from "../types";
import type { AiProvider, AiJsonRequest } from "./provider";
import { validateProviderJson } from "./provider";

function resolveOpenAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function resolveBaseUrl(): string {
  return (process.env.OPENAI_API_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
}

async function openAiChatCompletion(args: {
  requestId?: string;
  config: AiConfig;
  system: string;
  user: string;
}): Promise<AiCompletion> {
  const key = resolveOpenAiKey();
  if (!key) {
    throw new Error("OpenAI is not configured (missing OPENAI_API_KEY)");
  }

  const model = args.config.model || "gpt-4o-mini";
  const url = `${resolveBaseUrl()}/v1/chat/completions`;

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
      const msg = json?.error?.message || `OpenAI HTTP ${res.status}`;
      throw new Error(msg);
    }

    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("OpenAI returned an empty completion");
    }

    return {
      provider: "openai",
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

export const openAiProvider: AiProvider = {
  id: "openai",
  async completeJson<T>(req: AiJsonRequest<T>) {
    const completion = await openAiChatCompletion({
      requestId: req.requestId,
      config: req.config,
      system: req.system,
      user: req.user,
    });
    const data = await validateProviderJson(completion, req.schema);
    return { data, completion };
  },
};

