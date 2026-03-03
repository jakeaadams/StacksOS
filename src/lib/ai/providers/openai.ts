import type { AiCompletion, AiConfig } from "../types";
import type { AiProvider, AiJsonRequest } from "./provider";
import { validateProviderJson } from "./provider";

function resolveOpenAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function resolveBaseUrl(): string {
  // Strip trailing slashes and a trailing /v1 so we don't end up with double /v1/v1
  // when custom base URLs already include the versioned path prefix.
  return (process.env.OPENAI_API_BASE_URL || "https://api.openai.com")
    .replace(/\/+$/, "")
    .replace(/\/v1$/, "");
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

    // Try to parse the response body. If it's not valid JSON (e.g. HTML error
    // page from a proxy), capture the raw text for the error message instead.
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      const rawText = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(`OpenAI HTTP ${res.status}: ${rawText.slice(0, 200)}`);
      }
    }
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
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`AI provider timeout after ${args.config.timeoutMs}ms (openai)`);
    }
    throw error;
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
